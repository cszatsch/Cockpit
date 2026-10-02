import { note, span } from './trace';
import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from './prisma.service';
import { ApiError } from './errors';
import { decryptSecret } from './crypto';
import { techErrors } from './tech-errors';
import { currentLatencyKind, timedStep } from './latency';
import { KeyTestResult, ProviderKeyTester } from './provider-key-tester';
import { CACHE_READ_FACTOR, CACHE_WRITE_FACTOR, ChatTurn, LlmCallError, LlmClient } from './llm-client';

/** Caractères envoyés au modèle (prompt système, partie variable, historique, question) : estimation des jetons (~4 caractères). */
const inputChars = (i: { prompt: string; system?: string; systemTail?: string; history?: ChatTurn[] }) =>
  (i.system ? i.system.length + 2 : 0) + (i.systemTail ? i.systemTail.length + 2 : 0) + (i.history ?? []).reduce((n, h) => n + h.content.length + 2, 0) + i.prompt.length;
import { costOf, ModelCategory, priceOf } from '../domain/ai-pricing';
import { hashEmbedding, normalize } from '../domain/guide-index';

export type AiFunctionId = 'insights' | 'crud' | 'rapports' | 'guidage' | 'doc_vec' | 'doc_rrk' | 'doc_syn';
export type UsageSourceCode = 'COCKPIT' | 'JEV' | 'NOTIFICATION' | 'IMPORT' | 'GUIDE';

export interface LlmResult {
  text: string;
  modelId: string;
  providerId: string;
  tokensIn: number;
  tokensOut: number;
  costEur: number;
  fallbackUsed: boolean;
  ms: number;
}

export type { KeyTestResult } from './provider-key-tester';

export interface AiFunctionDef {
  id: AiFunctionId;
  name: string;
  short: string;
  description: string;
  /** Seule catégorie de modèle acceptée par la fonction. */
  category: ModelCategory;
  /** Chaîne de traitement (ex. Documents) et rang de l'étape dans la chaîne. */
  group?: string;
  step?: number;
  /** Ligne de consommation et de plafond budgétaire (les étapes d'une chaîne partagent la même). */
  budgetLine: string;
  /** Badge « Nouveau » dans les écrans IA (à retirer après la mise en service). */
  isNew?: boolean;
  /** Sortie requise (tokens) tant qu'aucun appel n'a été mesuré : un LLM la couvre si son max output tokens l'atteint. */
  needOut?: number;
  /** Surface servie (spécification IA § 8) : le Cockpit (défaut) ou la Console d'administration. Informatif. */
  scope?: 'cockpit' | 'console';
  /** Estimation mensuelle (M tokens en entrée et en sortie, questions par mois) utilisée tant que la fonction n'a pas de volume sur 30 jours. */
  est?: { in: number; out: number; req: number };
  /** Pas de modèle de secours (Vectorisation, décision du 30/09/2026) : un autre modèle imposerait de revectoriser. */
  noFallback?: boolean;
}

/** Longueur du plus long rapport attendu (tokens), hypothèse de la spécification IA § 7 avant toute mesure. */
export const REPORTS_NEED_OUT_DEFAULT = 38_000;
/** Estimation mensuelle du guidage console (spécification IA § 8) : 0,9 M tokens en entrée, 0,25 M en sortie, 800 questions. */
export const GUIDAGE_ESTIMATE = { in: 0.9, out: 0.25, req: 800 };

/**
 * Fonctions IA du Cockpit (spécification IA § 2, 28/09/2026) : l'ancienne « Analyse de documents »
 * devient une chaîne de trois étapes (Vectorisation → Reclassement → Synthèse), chacune avec sa catégorie.
 */
export const AI_FUNCTIONS: AiFunctionDef[] = [
  { id: 'insights', name: 'Analyse des données et insights', short: 'Insights', description: 'Lit les données du projet et produit les signaux, écarts et recommandations.', category: 'LLM', budgetLine: 'insights' },
  { id: 'crud', name: 'Création, modification et suppression des données', short: 'Gestion des données', description: 'Prépare les modifications demandées à Jev, l’assistant du Cockpit ; l’utilisateur les valide avant enregistrement.', category: 'LLM', budgetLine: 'crud' },
  { id: 'rapports', name: 'Génération de rapports', short: 'Rapports', description: 'Rédige les rapports de comité, hebdomadaires et de phase.', category: 'LLM', budgetLine: 'rapports', isNew: true, needOut: REPORTS_NEED_OUT_DEFAULT },
  { id: 'guidage', name: 'Guider l’utilisateur sur la console', short: 'Guidage console', description: 'Répond aux administrateurs : où se trouve un réglage, comment le configurer, quoi corriger.', category: 'LLM', budgetLine: 'guidage', isNew: true, scope: 'console', est: GUIDAGE_ESTIMATE },
  { id: 'doc_vec', name: 'Vectorisation', short: 'Vectorisation', description: 'Découpe le texte extrait en passages et les transforme en vecteurs pour la recherche sémantique.', category: 'EMBEDDING', group: 'documents', step: 1, budgetLine: 'docs', noFallback: true },
  { id: 'doc_rrk', name: 'Reclassement', short: 'Reclassement', description: 'Réordonne les passages trouvés selon leur pertinence réelle par rapport à la question posée.', category: 'RERANKING', group: 'documents', step: 2, budgetLine: 'docs' },
  { id: 'doc_syn', name: 'Synthèse', short: 'Synthèse', description: 'Rédige une réponse claire à partir des passages retenus : décisions, actions, risques.', category: 'LLM', group: 'documents', step: 3, budgetLine: 'docs' },
];

/** Chaînes de traitement (groupes de fonctions exécutées en série). */
export const AI_GROUPS: Record<string, { name: string; description: string }> = {
  documents: { name: 'Documents', description: 'Le texte extrait suit la ligne de gauche à droite. Une étape à l’arrêt suspend la suite.' },
};

/** Lignes de consommation et de plafond budgétaire (identifiants des `BudgetThreshold`, hors « all »). */
export const AI_BUDGET_LINES: Array<{ id: string; name: string }> = [
  { id: 'insights', name: 'Analyse des données et insights' },
  { id: 'crud', name: 'Création, modification et suppression des données' },
  { id: 'rapports', name: 'Génération de rapports' },
  { id: 'guidage', name: 'Guider l’utilisateur sur la console' },
  { id: 'docs', name: 'Documents (vectorisation, reclassement, synthèse)' },
];

export const aiFunction = (id: string) => AI_FUNCTIONS.find((f) => f.id === id);
/** Libellé court d'une fonction, précédé de sa chaîne pour une étape (« Documents · Synthèse »). */
export const aiFunctionLabel = (id: string) => {
  const f = aiFunction(id);
  if (!f) return id;
  return f.group ? `${AI_GROUPS[f.group].name} · ${f.short}` : f.short;
};
/** Ligne budgétaire d'une fonction (un identifiant inconnu est sa propre ligne). */
export const budgetLineOf = (functionId: string) => aiFunction(functionId)?.budgetLine ?? functionId;

/**
 * Fonctions dont la génération est réelle (décision du 28/09/2026) : le Jev de la Console (`guidage`).
 * Les autres fonctions gardent le bouchon ; hors ligne (tests), toutes le gardent.
 */
// Insights en génération réelle depuis le 01/10/2026 (Jev du Cockpit, cas 1 ; arbitrage du commanditaire).
export const LIVE_FUNCTIONS: readonly AiFunctionId[] = ['guidage', 'doc_syn', 'insights', 'crud'];

/**
 * Incident « IA » remonté aux notifications de la Console (01/10/2026) : un par fonction, ouvert dès que le modèle
 * principal échoue (secours utilisé ou fonction indisponible), fermé à la réussite suivante du modèle principal.
 * Les erreurs métier (`ApiError`) ne passent pas par le filtre des erreurs techniques : sans cela, aucune trace à la Console.
 */
export const aiIncidentKey = (functionId: string) => `IA · fonction ${aiFunction(functionId)?.short ?? functionId}`;
function aiIncident(functionId: string, message: string) {
  const key = aiIncidentKey(functionId);
  techErrors.open.add(key);
  techErrors.onError?.(key, message);
}
function aiRecovered(functionId: string) {
  const key = aiIncidentKey(functionId);
  if (techErrors.open.delete(key)) techErrors.onRecovered?.(key);
}
/** Vectorisation : textes par appel, reprises sur erreur passagère et attentes entre reprises. */
export const EMBED_BATCH_SIZE = 32;
export const EMBED_RETRIES = 2;
export const EMBED_RETRY_DELAYS_MS = [1000, 3000];

/** Longueur maximale d'une réponse générée en direct (jetons), bornée par celle du modèle. */
export const LIVE_MAX_OUTPUT_TOKENS = 1024;

/**
 * Passerelle LLM (brief Cockpit § 7.14, Console § 7.2-7.4 et § 10.2).
 * Le moteur réel est hors périmètre : cette implémentation est un **bouchon déterministe**
 * (texte construit à partir du prompt, jetons estimés à ~4 caractères par jeton) qui respecte
 * les règles de la plateforme : modèle principal, bascule sur le secours si le fournisseur du principal
 * n'est pas OK, refus si aucun n'est disponible, et une ligne `UsageRecord` par appel au tarif du moment.
 * Les fonctions de `LIVE_FUNCTIONS` génèrent réellement chez le fournisseur (`LlmClient`). Le test des clés (`ping()`) est réel.
 */
@Injectable()
export class LlmService {
  constructor(private readonly prisma: PrismaService, private readonly keys: ProviderKeyTester, private readonly client: LlmClient) {}

  /**
   * Modèle disponible : actif, de la catégorie attendue (LLM par défaut : Embedding et Reranking ne génèrent
   * pas de texte) et fournisseur au statut OK (UNTESTED = indisponible, Q10).
   */
  async modelAvailable(modelId: string | null | undefined, category: ModelCategory = 'LLM'): Promise<boolean> {
    if (!modelId) return false;
    const m = await this.prisma.aiModel.findUnique({ where: { id: modelId } });
    if (!m || !m.active || m.category !== category) return false;
    const p = await this.prisma.provider.findUnique({ where: { id: m.providerId } });
    return p?.status === 'OK';
  }

  /**
   * Appel via l'affectation d'une fonction (principal, sinon secours).
   * Fonction en direct (`LIVE_FUNCTIONS`) : vraie génération chez le fournisseur ; si le principal échoue
   * à l'appel (délai, erreur du fournisseur), le secours prend la demande ; si les deux échouent, 503.
   */
  async complete(input: { functionId: AiFunctionId; prompt: string; system?: string; systemTail?: string; history?: ChatTurn[]; cache?: boolean; projectId?: string | null; source: UsageSourceCode; maxWords?: number; timeoutMs?: number; maxTokens?: number }): Promise<LlmResult> {
    return span(`génération · fonction ${input.functionId}`, async (d) => {
      d.caracteres_prompt = (input.system?.length ?? 0) + (input.systemTail?.length ?? 0) + input.prompt.length + (input.history ?? []).reduce((n, h) => n + h.content.length, 0);
      const r = await this.completeUntraced(input);
      Object.assign(d, { modele: r.modelId, secours: r.fallbackUsed, jetons_entree: r.tokensIn, jetons_sortie: r.tokensOut });
      return r;
    });
  }

  private async completeUntraced(input: { functionId: AiFunctionId; prompt: string; system?: string; systemTail?: string; history?: ChatTurn[]; cache?: boolean; projectId?: string | null; source: UsageSourceCode; maxWords?: number; timeoutMs?: number; maxTokens?: number }): Promise<LlmResult> {
    const route = await span('choix du modèle (affectation, base)', () => this.route(input.functionId));
    // Temps de traitement (TEMPS § 3) : une ligne par appel, principal ou secours, à l'étape fixée par l'appelant.
    const kind = currentLatencyKind();
    const timed = <T>(modelId: string, fallback: boolean, fn: () => Promise<T>) => timedStep(kind, modelId, fallback ? 'fallback' : 'primary', fn);
    if (!(LIVE_FUNCTIONS.includes(input.functionId) && this.client.live)) return timed(route.modelId, route.fallback, () => this.run(route.modelId, input, route.fallback));
    const fn = aiFunction(input.functionId);
    const label = `Fonction ${fn?.short ?? input.functionId}`;
    try {
      const r = await timed(route.modelId, route.fallback, () => this.runLive(route.modelId, input, route.fallback));
      if (!route.fallback) aiRecovered(input.functionId);
      return r;
    } catch (e) {
      if (!(e instanceof LlmCallError)) throw e;
      const asg = await this.prisma.modelAssignment.findUnique({ where: { functionId: input.functionId } });
      if (route.fallback || !(await this.modelAvailable(asg?.fallbackModelId, fn?.category ?? 'LLM'))) {
        aiIncident(input.functionId, `${label} indisponible : ${e.message}`);
        throw new ApiError(503, 'AI_UNAVAILABLE', `${label} indisponible : ${e.message}`);
      }
      try {
        const r = await timed(asg!.fallbackModelId!, true, () => this.runLive(asg!.fallbackModelId!, input, true));
        aiIncident(input.functionId, `modèle principal en échec (${e.message}) ; réponse fournie par le modèle de secours`);
        return r;
      } catch (e2) {
        if (!(e2 instanceof LlmCallError)) throw e2;
        aiIncident(input.functionId, `${label} indisponible : ${e.message} ; secours : ${e2.message}`);
        throw new ApiError(503, 'AI_UNAVAILABLE', `${label} indisponible : ${e.message} ; secours : ${e2.message}`);
      }
    }
  }

  /** Vraie génération : clé du fournisseur déchiffrée le temps de l'appel, jetons comptés par le fournisseur. */
  private async runLive(modelId: string, input: { functionId: AiFunctionId; prompt: string; system?: string; systemTail?: string; history?: ChatTurn[]; cache?: boolean; projectId?: string | null; source: UsageSourceCode; timeoutMs?: number; maxTokens?: number }, fallbackUsed: boolean): Promise<LlmResult> {
    const model = await this.prisma.aiModel.findUniqueOrThrow({ where: { id: modelId } });
    const provider = await this.prisma.provider.findUniqueOrThrow({ where: { id: model.providerId } });
    if (!provider.keyCipher) throw new LlmCallError(`${provider.name} : aucune clé enregistrée`);
    let key: string;
    try {
      key = decryptSecret(provider.keyCipher);
    } catch {
      throw new LlmCallError(`${provider.name} : clé illisible`);
    }
    const t0 = Date.now();
    const out = await this.client.generate({
      providerId: provider.id, providerName: provider.name, model: model.providerModelId || model.id, key,
      system: input.system ?? '', systemTail: input.systemTail, history: input.history, cache: input.cache, prompt: input.prompt, maxTokens: Math.min(input.maxTokens ?? LIVE_MAX_OUTPUT_TOKENS, model.maxOutputTokens ?? Number.MAX_SAFE_INTEGER), timeoutMs: input.timeoutMs,
    });
    const tokensIn = out.tokensIn ?? Math.max(1, Math.ceil(inputChars(input) / 4));
    const tokensOut = out.tokensOut ?? Math.max(1, Math.ceil(out.text.length / 4));
    const ms = Date.now() - t0;
    // Jetons lus ou écrits dans le cache : comptés en entrée, facturés au tarif du cache.
    const read = out.cacheRead ?? 0, write = out.cacheWrite ?? 0;
    const billedIn = Math.max(0, tokensIn - read - write) + read * CACHE_READ_FACTOR + write * CACHE_WRITE_FACTOR;
    const costEur = await this.record(model, input.functionId, { tokensIn, tokensOut, requests: 0 }, fallbackUsed, input, ms, billedIn, { read, write });
    return { text: out.text, modelId: model.id, providerId: model.providerId, tokensIn, tokensOut, costEur, fallbackUsed, ms };
  }

  /** Modèle qui répond pour une fonction : principal utilisable, sinon secours ; sinon 503 explicite. */
  async route(functionId: AiFunctionId): Promise<{ modelId: string; fallback: boolean }> {
    const fn = aiFunction(functionId);
    const category = fn?.category ?? 'LLM';
    const label = fn?.group ? `Étape ${fn.step} · ${fn.name}` : `Fonction ${fn?.short ?? functionId}`;
    const asg = await this.prisma.modelAssignment.findUnique({ where: { functionId } });
    if (!asg) throw new ApiError(503, 'AI_UNAVAILABLE', `${label} indisponible : aucun modèle affecté`);
    if (await this.modelAvailable(asg.primaryModelId, category)) return { modelId: asg.primaryModelId, fallback: false };
    if (fn?.noFallback) throw new ApiError(503, 'AI_UNAVAILABLE', `${label} indisponible : le modèle affecté est inactif ou la clé de son fournisseur est refusée`);
    if (await this.modelAvailable(asg.fallbackModelId, category)) return { modelId: asg.fallbackModelId!, fallback: true };
    throw new ApiError(503, 'AI_UNAVAILABLE', `${label} indisponible : ni le modèle principal ni le secours ne répondent`);
  }

  /**
   * Analyse d'un document par la chaîne Documents : Vectorisation (Embedding) → Reclassement (Reranking)
   * → Synthèse (LLM). Les modèles de toutes les étapes sont résolus d'abord : si une étape n'a aucun modèle
   * utilisable, la requête s'arrête à cette étape (503) sans appeler les étapes suivantes.
   * Bouchon déterministe : chaque étape trace sa consommation au tarif du moment.
   */
  async analyzeDocument(input: { prompt: string; text: string; projectId?: string | null; source: UsageSourceCode }): Promise<LlmResult> {
    const steps = AI_FUNCTIONS.filter((f) => f.group === 'documents').sort((a, b) => a.step! - b.step!);
    const routes: Array<{ fn: AiFunctionDef; modelId: string; fallback: boolean }> = [];
    for (const fn of steps) routes.push({ fn, ...(await this.route(fn.id)) });
    const tokens = Math.max(1, Math.ceil((input.text || input.prompt).length / 4));
    for (const r of routes.filter((x) => x.fn.id !== 'doc_syn')) {
      const model = await this.prisma.aiModel.findUniqueOrThrow({ where: { id: r.modelId } });
      const volume = r.fn.category === 'RERANKING' ? { tokensIn: model.priceUnit === 'REQUESTS' ? 0 : tokens, tokensOut: 0, requests: 1 } : { tokensIn: tokens, tokensOut: 0, requests: 0 };
      await this.record(model, r.fn.id, volume, r.fallback, input);
    }
    const syn = routes.find((x) => x.fn.id === 'doc_syn')!;
    return this.run(syn.modelId, { ...input, functionId: 'doc_syn' }, syn.fallback);
  }

  /**
   * Une ligne de consommation au tarif en vigueur au moment de l'appel (Console § 6.3). Journal des appels (§ 3) :
   * identifiant de requête `req_…`, tarifs du modèle figés sur la ligne (un changement de tarif au catalogue ne
   * modifie pas les appels passés), latence. Le contenu des prompts et des réponses n'est jamais enregistré.
   */
  private async record(model: Parameters<typeof costOf>[0] & { id: string; providerId: string }, functionId: AiFunctionId, v: { tokensIn: number; tokensOut: number; requests: number }, fallbackUsed: boolean, input: { projectId?: string | null; source: UsageSourceCode }, durationMs?: number, billedIn?: number, cache?: { read: number; write: number }) {
    // Jetons d'entrée facturés : moins que les jetons envoyés quand une partie est lue dans le cache.
    const costEur = costOf(model, billedIn === undefined ? v : { ...v, tokensIn: billedIn });
    const price = priceOf(model);
    const at = new Date();
    await this.prisma.usageRecord.create({
      data: {
        id: `req_${randomBytes(6).toString('hex')}`, at, projectId: input.projectId ?? null, functionId, modelId: model.id, providerId: model.providerId,
        tokensIn: v.tokensIn, tokensOut: v.tokensOut, requests: v.requests, costEur, fallbackUsed, source: input.source,
        priceIn: price.in ?? null, priceOut: price.out ?? null, pricePer1k: price.per1k ?? null, durationMs: durationMs ?? null,
        cacheReadTokens: cache?.read ?? 0, cacheWriteTokens: cache?.write ?? 0,
      },
    });
    return costEur;
  }

  /**
   * Vectorisation de textes par le modèle de la fonction Vectorisation (guide utilisateur, décision du 30/09/2026) :
   * modèle principal seulement (pas de secours), dimension de l'affectation, lots de `EMBED_BATCH_SIZE` textes, reprise
   * sur erreur passagère (429, 5xx, délai). Réelle en ligne, vecteurs de démonstration déterministes hors ligne.
   * Une ligne de consommation par lot (fonction Documents · Vectorisation).
   */
  async embedTexts(texts: string[], source: UsageSourceCode, onBatch?: (done: number, total: number) => Promise<void> | void, projectId?: string | null): Promise<{ modelId: string; modelName: string; dims: number; vectors: number[][] }> {
    const { modelId } = await this.route('doc_vec');
    const asg = await this.prisma.modelAssignment.findUnique({ where: { functionId: 'doc_vec' } });
    const model = await this.prisma.aiModel.findUniqueOrThrow({ where: { id: modelId } });
    const wanted = asg?.primaryDimension ?? model.defaultDimension ?? (model.dimensions.length === 1 ? model.dimensions[0] : null);
    return this.embedWithModel(model.id, wanted, texts, source, { onBatch, projectId });
  }

  /**
   * Vectorisation par un modèle désigné et une dimension (recherche dans le guide : le modèle et la dimension de
   * l'index, jamais un autre). Le modèle doit être disponible (actif, fournisseur au statut OK).
   */
  async embedWithModel(modelId: string, wanted: number | null, texts: string[], source: UsageSourceCode, opts: { onBatch?: (done: number, total: number) => Promise<void> | void; timeoutMs?: number; projectId?: string | null } = {}): Promise<{ modelId: string; modelName: string; dims: number; vectors: number[][] }> {
    // Temps de traitement : une ligne « vec » par vectorisation (reprises comprises), dans un prompt mesuré seulement.
    return timedStep('vec', modelId, 'primary', () => span(`vectorisation (${texts.length} texte${texts.length > 1 ? 's' : ''})`, (d) => this.embedTimed(modelId, wanted, texts, source, opts, d), { modele: modelId, delai_max_ms: opts.timeoutMs ?? null }));
  }

  private async embedTimed(modelId: string, wanted: number | null, texts: string[], source: UsageSourceCode, opts: { onBatch?: (done: number, total: number) => Promise<void> | void; timeoutMs?: number; projectId?: string | null }, d: Record<string, unknown>): Promise<{ modelId: string; modelName: string; dims: number; vectors: number[][] }> {
    const onBatch = opts.onBatch;
    const { model, provider } = await span('lecture du modèle et du fournisseur (base)', async () => {
      if (!(await this.modelAvailable(modelId, 'EMBEDDING'))) throw new ApiError(503, 'AI_UNAVAILABLE', `Modèle de vectorisation ${modelId} inactif, supprimé ou clé de son fournisseur refusée`);
      const model = await this.prisma.aiModel.findUniqueOrThrow({ where: { id: modelId } });
      const provider = await this.prisma.provider.findUniqueOrThrow({ where: { id: model.providerId } });
      return { model, provider };
    });
    d.modele = model.name;
    d.fournisseur = provider.name;
    d.caracteres = texts.reduce((n, t) => n + t.length, 0);
    let key = '';
    if (this.client.live) {
      if (!provider.keyCipher) throw new ApiError(503, 'AI_UNAVAILABLE', `${provider.name} : aucune clé enregistrée`);
      try {
        const t = performance.now();
        key = decryptSecret(provider.keyCipher);
        note('déchiffrement de la clé', undefined, Math.round(performance.now() - t));
      } catch {
        throw new ApiError(503, 'AI_UNAVAILABLE', `${provider.name} : clé illisible`);
      }
    }
    const vectors: number[][] = [];
    let dims = wanted ?? 0;
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const t0 = Date.now();
      let out: { vectors: number[][]; tokens: number | null };
      if (this.client.live) {
        out = await this.withRetry(() => this.client.embed({ providerId: provider.id, providerName: provider.name, model: model.providerModelId || model.id, key, inputs: batch, dimensions: model.dimensions.length > 1 ? wanted : null, timeoutMs: opts.timeoutMs }));
      } else {
        out = { vectors: batch.map((t) => hashEmbedding(t, wanted ?? 256)), tokens: null };
      }
      // Dimension attendue : un modèle « Matryoshka » peut renvoyer plus long ; la troncature est alors renormalisée.
      for (const v of out.vectors) {
        let x = v;
        if (!dims) dims = v.length;
        if (x.length > dims && model.dimensions.length > 1) x = normalize(x.slice(0, dims));
        if (x.length !== dims) throw new ApiError(502, 'AI_BAD_RESPONSE', `${model.name} a renvoyé des vecteurs de ${x.length} dimensions au lieu de ${dims}`);
        vectors.push(x);
      }
      const tokens = out.tokens ?? batch.reduce((n, t) => n + Math.max(1, Math.ceil(t.length / 4)), 0);
      d.jetons = tokens;
      await span('enregistrement de la consommation (base)', () => this.record(model, 'doc_vec', { tokensIn: tokens, tokensOut: 0, requests: 0 }, false, { source, projectId: opts.projectId ?? null }, Date.now() - t0));
      await onBatch?.(Math.min(i + batch.length, texts.length), texts.length);
    }
    return { modelId: model.id, modelName: model.name, dims, vectors };
  }

  /**
   * Reclassement par le modèle de la fonction Reclassement (principal, sinon secours si le principal échoue à l'appel).
   * Réel en ligne ; hors ligne, score déterministe (mots communs). Une ligne de consommation par appel (1 requête).
   */
  async rerankTexts(query: string, documents: string[], topN: number, source: UsageSourceCode, timeoutMs?: number): Promise<{ modelId: string; modelName: string; fallbackUsed: boolean; results: Array<{ index: number; score: number }> }> {
    return span(`reclassement (${documents.length} extraits → ${topN})`, async (d) => {
      const r = await this.rerankUntraced(query, documents, topN, source, timeoutMs);
      Object.assign(d, { modele: r.modelName, secours: r.fallbackUsed });
      return r;
    });
  }

  private async rerankUntraced(query: string, documents: string[], topN: number, source: UsageSourceCode, timeoutMs?: number): Promise<{ modelId: string; modelName: string; fallbackUsed: boolean; results: Array<{ index: number; score: number }> }> {
    const route = await this.route('doc_rrk');
    const asg = await this.prisma.modelAssignment.findUnique({ where: { functionId: 'doc_rrk' } });
    const attempt = (modelId: string, fallbackUsed: boolean) => timedStep('rrk', modelId, fallbackUsed ? 'fallback' : 'primary', () => attemptUntimed(modelId, fallbackUsed));
    const attemptUntimed = async (modelId: string, fallbackUsed: boolean) => {
      const model = await this.prisma.aiModel.findUniqueOrThrow({ where: { id: modelId } });
      const provider = await this.prisma.provider.findUniqueOrThrow({ where: { id: model.providerId } });
      const t0 = Date.now();
      let out: { results: Array<{ index: number; score: number }>; tokens: number | null };
      if (this.client.live) {
        if (!provider.keyCipher) throw new LlmCallError(`${provider.name} : aucune clé enregistrée`);
        let key: string;
        try {
          key = decryptSecret(provider.keyCipher);
        } catch {
          throw new LlmCallError(`${provider.name} : clé illisible`);
        }
        out = await this.client.rerank({ providerId: provider.id, providerName: provider.name, model: model.providerModelId || model.id, key, query, documents, topN, timeoutMs });
      } else {
        out = { results: overlapRank(query, documents).slice(0, topN), tokens: null };
      }
      const tokens = out.tokens ?? Math.max(1, Math.ceil((query.length + documents.join(' ').length) / 4));
      await this.record(model, 'doc_rrk', { tokensIn: model.priceUnit === 'REQUESTS' ? 0 : tokens, tokensOut: 0, requests: 1 }, fallbackUsed, { source }, Date.now() - t0);
      return { modelId: model.id, modelName: model.name, fallbackUsed, results: out.results.slice(0, topN) };
    };
    try {
      const r = await attempt(route.modelId, route.fallback);
      if (!route.fallback) aiRecovered('doc_rrk');
      return r;
    } catch (e) {
      if (!(e instanceof LlmCallError)) throw e;
      if (route.fallback || !(await this.modelAvailable(asg?.fallbackModelId, 'RERANKING'))) {
        aiIncident('doc_rrk', `Reclassement indisponible : ${e.message}`);
        throw new ApiError(503, 'AI_UNAVAILABLE', `Reclassement indisponible : ${e.message}`);
      }
      try {
        const r = await attempt(asg!.fallbackModelId!, true);
        aiIncident('doc_rrk', `modèle principal en échec (${e.message}) ; reclassement fourni par le modèle de secours`);
        return r;
      } catch (e2) {
        aiIncident('doc_rrk', `Reclassement indisponible : ${e.message} ; secours : ${e2 instanceof Error ? e2.message : e2}`);
        throw new ApiError(503, 'AI_UNAVAILABLE', `Reclassement indisponible : ${e.message} ; secours : ${e2 instanceof Error ? e2.message : e2}`);
      }
    }
  }

  /** Reprise d'un appel sur erreur passagère (429, 5xx, délai, réseau) : `EMBED_RETRIES` fois, attente croissante. */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await span(`tentative ${attempt + 1} / ${EMBED_RETRIES + 1}`, () => fn());
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        const transient = e instanceof LlmCallError && /· (408|409|425|429|5\d\d)|délai|injoignable/.test(msg);
        if (!transient || attempt >= EMBED_RETRIES) throw e instanceof LlmCallError ? new ApiError(503, 'AI_UNAVAILABLE', `Vectorisation impossible : ${msg}`) : e;
        const wait = EMBED_RETRY_DELAYS_MS[attempt] ?? 3000;
        await span('attente avant nouvelle tentative', () => new Promise((r) => setTimeout(r, wait)), { attente_ms: wait, motif: msg.slice(0, 160) });
      }
    }
  }

  /** Appel direct d'un modèle (règles de notification : modèle propre à la règle). */
  async completeWithModel(modelId: string, input: { functionId: AiFunctionId; prompt: string; projectId?: string | null; source: UsageSourceCode }): Promise<LlmResult> {
    if (!(await this.modelAvailable(modelId))) throw new ApiError(503, 'AI_UNAVAILABLE', `Modèle ${modelId} inconnu, inactif, non LLM ou fournisseur en erreur`);
    return this.run(modelId, input, false);
  }

  /**
   * Génération avec un modèle désigné et un prompt système (rédaction des notifications) : réelle quand le service
   * est en ligne, bouchon hors ligne ; la consommation est tracée comme pour les autres appels.
   */
  async completeWithModelLive(modelId: string, input: { functionId: AiFunctionId; prompt: string; system?: string; systemTail?: string; cache?: boolean; projectId?: string | null; source: UsageSourceCode; maxWords?: number }): Promise<LlmResult> {
    if (!(await this.modelAvailable(modelId))) throw new ApiError(503, 'AI_UNAVAILABLE', `Modèle ${modelId} inconnu, inactif, non LLM ou fournisseur en erreur`);
    if (!this.client.live) return this.run(modelId, input, false);
    try {
      return await this.runLive(modelId, input, false);
    } catch (e) {
      if (e instanceof LlmCallError) throw new ApiError(503, 'AI_UNAVAILABLE', e.message);
      throw e;
    }
  }

  private async run(modelId: string, input: { functionId: AiFunctionId; prompt: string; system?: string; systemTail?: string; history?: ChatTurn[]; projectId?: string | null; source: UsageSourceCode; maxWords?: number }, fallbackUsed: boolean): Promise<LlmResult> {
    const model = await this.prisma.aiModel.findUniqueOrThrow({ where: { id: modelId } });
    const t0 = Date.now();
    const text = this.generate(input.prompt, input.maxWords ?? 60);
    // Le prompt système (Jev : base, Persona, skills actives) et l'historique sont envoyés avec la demande : ils comptent en entrée.
    const tokensIn = Math.max(1, Math.ceil(inputChars(input) / 4));
    const tokensOut = Math.max(1, Math.ceil(text.length / 4));
    const ms = Date.now() - t0;
    const costEur = await this.record(model, input.functionId, { tokensIn, tokensOut, requests: 0 }, fallbackUsed, input, ms);
    return { text, modelId: model.id, providerId: model.providerId, tokensIn, tokensOut, costEur, fallbackUsed, ms };
  }

  /** Bouchon : réponse factuelle courte, dérivée du prompt (déterministe). */
  protected generate(prompt: string, maxWords: number): string {
    const clean = prompt.replace(/\s+/g, ' ').trim();
    const h = createHash('sha1').update(clean).digest('hex').slice(0, 6);
    const words = clean.split(' ').slice(0, maxWords).join(' ');
    return `Synthèse (réf. ${h}) : ${words}${clean.split(' ').length > maxWords ? '…' : ''}`;
  }

  /**
   * Test d'une clé (Console § 7.2) : appel réel et authentifié à l'API du fournisseur
   * (`ProviderKeyTester`, liste des modèles, sans coût). Une clé illisible ou absente est refusée sans appel.
   */
  async ping(provider: { id: string; name: string; keyCipher: string | null }): Promise<KeyTestResult> {
    if (!provider.keyCipher) return { status: 'ERROR', latencyMs: null, error: 'Aucune clé enregistrée' };
    let key: string;
    try {
      key = decryptSecret(provider.keyCipher);
    } catch {
      return { status: 'ERROR', latencyMs: null, error: 'Clé illisible (chiffrement : SECRETS_KEY a-t-elle changé ?)' };
    }
    return this.keys.test(provider.id, provider.name, key);
  }
}

/** Reclassement de démonstration (hors ligne, tests) : part des mots de la question présents dans chaque document. */
function overlapRank(query: string, documents: string[]): Array<{ index: number; score: number }> {
  const words = (t: string) => new Set(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{3,}/g) ?? []);
  const q = words(query);
  return documents.map((d, index) => { const w = words(d); let n = 0; for (const x of q) if (w.has(x)) n++; return { index, score: q.size ? n / q.size : 0 }; }).sort((a, b) => b.score - a.score || a.index - b.index);
}
