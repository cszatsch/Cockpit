import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from './prisma.service';
import { EventBus } from './events';
import { ApiError } from './errors';
import { decryptSecret } from './crypto';
import { KeyTestResult, ProviderKeyTester } from './provider-key-tester';
import { costOf, ModelCategory } from '../domain/ai-pricing';

export type AiFunctionId = 'insights' | 'crud' | 'rapports' | 'doc_vec' | 'doc_rrk' | 'doc_syn';
export type UsageSourceCode = 'COCKPIT' | 'JEV' | 'NOTIFICATION' | 'IMPORT';

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
}

/** Longueur du plus long rapport attendu (tokens), hypothèse de la spécification IA § 7 avant toute mesure. */
export const REPORTS_NEED_OUT_DEFAULT = 38_000;

/**
 * Fonctions IA du Cockpit (spécification IA § 2, 28/09/2026) : l'ancienne « Analyse de documents »
 * devient une chaîne de trois étapes (Vectorisation → Reclassement → Synthèse), chacune avec sa catégorie.
 */
export const AI_FUNCTIONS: AiFunctionDef[] = [
  { id: 'insights', name: 'Analyse des données et insights', short: 'Insights', description: 'Lit les données du projet et produit les signaux, écarts et recommandations.', category: 'LLM', budgetLine: 'insights' },
  { id: 'crud', name: 'Création, modification et suppression des données', short: 'Gestion des données', description: 'Prépare les modifications demandées à Jev, l’assistant du Cockpit ; l’utilisateur les valide avant enregistrement.', category: 'LLM', budgetLine: 'crud' },
  { id: 'rapports', name: 'Génération de rapports', short: 'Rapports', description: 'Rédige les rapports de comité, hebdomadaires et de phase.', category: 'LLM', budgetLine: 'rapports', isNew: true, needOut: REPORTS_NEED_OUT_DEFAULT },
  { id: 'doc_vec', name: 'Vectorisation', short: 'Vectorisation', description: 'Découpe le texte extrait en passages et les transforme en vecteurs pour la recherche sémantique.', category: 'EMBEDDING', group: 'documents', step: 1, budgetLine: 'docs' },
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
 * Passerelle LLM (brief Cockpit § 7.14, Console § 7.2-7.4 et § 10.2).
 * Le moteur réel est hors périmètre : cette implémentation est un **bouchon déterministe**
 * (texte construit à partir du prompt, jetons estimés à ~4 caractères par jeton) qui respecte
 * les règles de la plateforme : modèle principal, bascule sur le secours si le fournisseur du principal
 * n'est pas OK, refus si aucun n'est disponible, et une ligne `UsageRecord` par appel au tarif du moment.
 * Pour brancher de vrais fournisseurs, remplacer `generate()`. Le test des clés (`ping()`) est réel.
 */
@Injectable()
export class LlmService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventBus, private readonly keys: ProviderKeyTester) {}

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

  /** Appel via l'affectation d'une fonction (principal, sinon secours). */
  async complete(input: { functionId: AiFunctionId; prompt: string; projectId?: string | null; source: UsageSourceCode; maxWords?: number }): Promise<LlmResult> {
    const route = await this.route(input.functionId);
    return this.run(route.modelId, input, route.fallback);
  }

  /** Modèle qui répond pour une fonction : principal utilisable, sinon secours ; sinon 503 explicite. */
  async route(functionId: AiFunctionId): Promise<{ modelId: string; fallback: boolean }> {
    const fn = aiFunction(functionId);
    const category = fn?.category ?? 'LLM';
    const label = fn?.group ? `Étape ${fn.step} · ${fn.name}` : `Fonction ${fn?.short ?? functionId}`;
    const asg = await this.prisma.modelAssignment.findUnique({ where: { functionId } });
    if (!asg) throw new ApiError(503, 'AI_UNAVAILABLE', `${label} indisponible : aucun modèle affecté`);
    if (await this.modelAvailable(asg.primaryModelId, category)) return { modelId: asg.primaryModelId, fallback: false };
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

  /** Une ligne de consommation au tarif en vigueur au moment de l'appel (Console § 6.3). */
  private async record(model: Parameters<typeof costOf>[0] & { id: string; providerId: string }, functionId: AiFunctionId, v: { tokensIn: number; tokensOut: number; requests: number }, fallbackUsed: boolean, input: { projectId?: string | null; source: UsageSourceCode }) {
    const costEur = costOf(model, v);
    const at = new Date();
    await this.prisma.usageRecord.create({
      data: { at, projectId: input.projectId ?? null, functionId, modelId: model.id, providerId: model.providerId, tokensIn: v.tokensIn, tokensOut: v.tokensOut, requests: v.requests, costEur, fallbackUsed, source: input.source },
    });
    await this.events.emit({ type: 'usage.recorded', costEur, functionId, at });
    return costEur;
  }

  /** Appel direct d'un modèle (règles de notification : modèle propre à la règle). */
  async completeWithModel(modelId: string, input: { functionId: AiFunctionId; prompt: string; projectId?: string | null; source: UsageSourceCode }): Promise<LlmResult> {
    if (!(await this.modelAvailable(modelId))) throw new ApiError(503, 'AI_UNAVAILABLE', `Modèle ${modelId} inconnu, inactif, non LLM ou fournisseur en erreur`);
    return this.run(modelId, input, false);
  }

  private async run(modelId: string, input: { functionId: AiFunctionId; prompt: string; projectId?: string | null; source: UsageSourceCode; maxWords?: number }, fallbackUsed: boolean): Promise<LlmResult> {
    const model = await this.prisma.aiModel.findUniqueOrThrow({ where: { id: modelId } });
    const t0 = Date.now();
    const text = this.generate(input.prompt, input.maxWords ?? 60);
    const tokensIn = Math.max(1, Math.ceil(input.prompt.length / 4));
    const tokensOut = Math.max(1, Math.ceil(text.length / 4));
    const costEur = await this.record(model, input.functionId, { tokensIn, tokensOut, requests: 0 }, fallbackUsed, input);
    return { text, modelId: model.id, providerId: model.providerId, tokensIn, tokensOut, costEur, fallbackUsed, ms: Date.now() - t0 };
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
