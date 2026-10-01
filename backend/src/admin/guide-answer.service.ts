import { span } from '../core/trace';
import { Injectable } from '@nestjs/common';
import { AiFunctionId, LlmService } from '../core/llm.service';
import { GUIDE_APP_LABELS, GuideApp } from '../domain/guide';
import { guideAnswerRules, guideExtractsBlock, guideSources } from '../domain/jev-rag';
import { GuideSearchService } from './guide-search.service';

export interface GuideAnswer {
  /** ANSWERED : réponse tirée du guide ; NO_GUIDE : aucun guide publié (ou pas encore indexé) ; NO_EXTRACT : rien de pertinent. */
  status: 'ANSWERED' | 'NO_GUIDE' | 'NO_EXTRACT' | 'UNAVAILABLE';
  reply: string;
  /** « Guide · section · p. N ». */
  sources: string[];
  modelId: string | null;
  fallbackUsed: boolean;
  /** UNAVAILABLE : motif (temps de traitement : prompt non servi). */
  error?: string;
}

/** Messages sans appel au modèle (règle : sans guide publié, Jev ne répond pas aux questions sur l'application). */
export const guideMissingReply = (app: GuideApp) => `Le guide utilisateur ${GUIDE_APP_LABELS[app].of} n’est pas encore publié : je ne peux pas encore répondre aux questions sur son utilisation.`;
export const guideUnavailableReply = (app: GuideApp) => `La recherche dans le guide utilisateur ${GUIDE_APP_LABELS[app].of} est momentanément indisponible. Réessayez dans un instant.`;
export const guideNoExtractReply = (app: GuideApp) => `Je n’ai pas trouvé cette information dans le guide utilisateur ${GUIDE_APP_LABELS[app].of}. Reformulez la question, ou posez-la sur les données du projet.`;

/**
 * Réponse à une question d'usage à partir du guide d'UNE application (Jev du Cockpit, décision du 30/09/2026) : recherche
 * dans ce seul guide avec ses réglages, puis rédaction par la fonction Synthèse à partir des extraits retenus (partie
 * stable : prompt de Jev et règles ; partie variable : extraits). Jamais d'appel au modèle sans extrait.
 */
@Injectable()
export class GuideAnswerService {
  constructor(
    private readonly search: GuideSearchService,
    private readonly llm: LlmService,
  ) {}

  /**
   * `functionId` : modèle de rédaction (Cockpit : Guidage, brief du 01/10/2026 ; par défaut Synthèse) ; `context` :
   * contexte de la demande (écran, date), placé avant les extraits dans la partie variable du prompt.
   */
  async answer(app: GuideApp, question: string, opts: { system: string; projectId?: string | null; functionId?: AiFunctionId; context?: string | null }): Promise<GuideAnswer> {
    const s = await span('réglages de la recherche (base)', () => this.search.settings(app));
    let found;
    try {
      found = await span('recherche dans le guide', async (d) => { const f = await this.search.search(app, question, s); Object.assign(d, { extraits_retenus: f.extracts.length, vide: f.empty }); return f; });
    } catch (e) {
      console.warn(`[jev] recherche dans le guide ${GUIDE_APP_LABELS[app].of} indisponible : ${e instanceof Error ? e.message : e}`);
      return { status: 'UNAVAILABLE', reply: guideUnavailableReply(app), sources: [], modelId: null, fallbackUsed: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (found.empty === 'GUIDE_NON_INDEXE') return { status: 'NO_GUIDE', reply: guideMissingReply(app), sources: [], modelId: null, fallbackUsed: false };
    if (found.empty || !found.extracts.length) return { status: 'NO_EXTRACT', reply: guideNoExtractReply(app), sources: [], modelId: null, fallbackUsed: false };
    const r = await this.llm.complete({
      functionId: opts.functionId ?? 'doc_syn', source: 'JEV', cache: true, timeoutMs: s.llmTimeoutMs, projectId: opts.projectId ?? null,
      system: `${opts.system}\n\n${guideAnswerRules(app)}`, systemTail: [opts.context, guideExtractsBlock(found.extracts)].filter(Boolean).join('\n\n'), prompt: question,
    });
    return { status: 'ANSWERED', reply: r.text, sources: guideSources(found.extracts), modelId: r.modelId, fallbackUsed: r.fallbackUsed };
  }
}
