import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from './prisma.service';
import { EventBus } from './events';
import { ApiError } from './errors';
import { decryptSecret } from './crypto';

export type AiFunctionId = 'insights' | 'crud' | 'docs';
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

export interface KeyTestResult {
  status: 'OK' | 'ERROR';
  latencyMs: number | null;
  error: string | null;
}

/** Fonctions IA (Console `FNS`). */
export const AI_FUNCTIONS: Array<{ id: AiFunctionId; name: string; short: string; description: string }> = [
  { id: 'insights', name: 'Analyse des données et insights', short: 'Insights', description: 'Lit les données du projet et produit les signaux, écarts et recommandations.' },
  { id: 'crud', name: 'Création, modification et suppression des données', short: 'Gestion des données', description: 'Prépare les modifications demandées à Jev, l’assistant du Cockpit ; l’utilisateur les valide avant enregistrement.' },
  { id: 'docs', name: 'Analyse de documents', short: 'Documents', description: 'Extrait décisions, actions et risques des comptes rendus et livrables.' },
];

/**
 * Passerelle LLM (brief Cockpit § 7.14, Console § 7.2-7.4 et § 10.2).
 * Le moteur réel est hors périmètre : cette implémentation est un **bouchon déterministe**
 * (texte construit à partir du prompt, jetons estimés à ~4 caractères par jeton) qui respecte
 * les règles de la plateforme : modèle principal, bascule sur le secours si le fournisseur du principal
 * n'est pas OK, refus si aucun n'est disponible, et une ligne `UsageRecord` par appel au tarif du moment.
 * Pour brancher de vrais fournisseurs, remplacer `generate()` et `ping()`.
 */
@Injectable()
export class LlmService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventBus) {}

  /** Modèle disponible : LLM actif et fournisseur au statut OK (UNTESTED = indisponible, Q10). Embedding et Reranking ne génèrent pas de texte. */
  async modelAvailable(modelId: string | null | undefined): Promise<boolean> {
    if (!modelId) return false;
    const m = await this.prisma.aiModel.findUnique({ where: { id: modelId } });
    if (!m || !m.active || m.category !== 'LLM') return false;
    const p = await this.prisma.provider.findUnique({ where: { id: m.providerId } });
    return p?.status === 'OK';
  }

  /** Appel via l'affectation d'une fonction (principal, sinon secours). */
  async complete(input: { functionId: AiFunctionId; prompt: string; projectId?: string | null; source: UsageSourceCode; maxWords?: number }): Promise<LlmResult> {
    const asg = await this.prisma.modelAssignment.findUnique({ where: { functionId: input.functionId } });
    if (!asg) throw new ApiError(503, 'AI_UNAVAILABLE', `Aucun modèle affecté à la fonction ${input.functionId}`);
    if (await this.modelAvailable(asg.primaryModelId)) return this.run(asg.primaryModelId, input, false);
    if (await this.modelAvailable(asg.fallbackModelId)) return this.run(asg.fallbackModelId!, input, true);
    throw new ApiError(503, 'AI_UNAVAILABLE', `Fonction ${input.functionId} indisponible : ni le modèle principal ni le secours ne répondent`);
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
    // Coût au tarif en vigueur au moment de l'appel (Console § 6.3).
    const costEur = (tokensIn * model.priceInPerMTok + tokensOut * model.priceOutPerMTok) / 1e6;
    const at = new Date();
    await this.prisma.usageRecord.create({
      data: { at, projectId: input.projectId ?? null, functionId: input.functionId, modelId: model.id, providerId: model.providerId, tokensIn, tokensOut, costEur, fallbackUsed, source: input.source },
    });
    await this.events.emit({ type: 'usage.recorded', costEur, functionId: input.functionId, at });
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
   * Test d'une clé (Console § 7.2) : appel minimal au fournisseur. Bouchon : une clé contenant « revoked »
   * ou trop courte est refusée (401), sinon la latence est simulée de façon stable.
   */
  async ping(providerId: string, keyCipher: string | null): Promise<KeyTestResult> {
    if (!keyCipher) return { status: 'ERROR', latencyMs: null, error: '401 · API key missing' };
    let key: string;
    try {
      key = decryptSecret(keyCipher);
    } catch {
      return { status: 'ERROR', latencyMs: null, error: '500 · Clé illisible (chiffrement)' };
    }
    if (/revoked/i.test(key) || key.length < 20) return { status: 'ERROR', latencyMs: null, error: '401 · API key revoked. La clé a été révoquée côté fournisseur.' };
    const latency = 250 + (parseInt(createHash('md5').update(providerId + key).digest('hex').slice(0, 4), 16) % 300);
    return { status: 'OK', latencyMs: latency, error: null };
  }
}
