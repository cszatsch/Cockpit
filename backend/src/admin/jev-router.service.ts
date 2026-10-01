import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { TodayService } from '../core/today.service';
import { ApiCardsService } from './api-cards.service';
import { buildRouterRequest, JEV_ROUTER_CARD, parseRouterResponse, RouteDecision, RouterPromptVersion, RouterResponseError, RouterTurn, ROUTER_PROMPT_VERSION } from '../domain/jev-router';
import { buildCockpitRouterRequest, CockpitRouteDecision, CockpitRouterResponseError, CockpitRouterTurn, CockpitRouterVersion, COCKPIT_ROUTER_VERSION, parseCockpitRouterResponse } from '../domain/jev-router-cockpit';

export interface CockpitRoutedQuestion extends CockpitRouteDecision {
  status: RoutedQuestion['status'];
  latencyMs: number | null;
  error: string | null;
  /** Identifiant de la trace (`jev_classifications`), pour y noter ensuite le modèle de la réponse. */
  traceId: string | null;
}

export interface RoutedQuestion extends RouteDecision {
  /** OK, ou motif du repli : NOT_CONFIGURED, TIMEOUT, ERROR, INVALID. */
  status: 'OK' | 'NOT_CONFIGURED' | 'TIMEOUT' | 'ERROR' | 'INVALID';
  latencyMs: number | null;
  error: string | null;
}

/**
 * Aiguillage des questions de Jev (décision du 30/09/2026) : classe chaque question (USAGE, DONNEES, AMBIGU,
 * HORS_SUJET) par l'API TypeSafe de la carte « JEV » du Registre des cartes API. Endpoint, clé, mode d'envoi de la
 * clé, délai et modèle (champ `model` du corps de la carte) sont lus dans le Registre : rien n'est écrit dans le code.
 * L'appel passe par `ApiCardsService.call` (clé déchiffrée au dernier moment, contrôle anti-SSRF, trace de l'appel).
 * Repli : carte absente, désactivée ou sans clé, délai dépassé, erreur ou réponse illisible → AMBIGU (les deux
 * traitements), motif tracé. Chaque classification est enregistrée (`jev_classifications`).
 */
@Injectable()
export class JevRouterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiCards: ApiCardsService,
    private readonly today: TodayService,
  ) {}

  private cardId() {
    return process.env.JEV_ROUTER_CARD || JEV_ROUTER_CARD;
  }

  /** Carte JEV du Registre et modèle (champ `model` du corps), ou motif de non-configuration. */
  private async card(): Promise<{ card: any; model: string } | { error: string }> {
    const card = await this.prisma.apiCard.findUnique({ where: { id: this.cardId() } });
    if (!card) return { error: `Carte « ${this.cardId()} » absente du Registre des cartes API` };
    if (!card.enabled) return { error: 'Carte JEV désactivée' };
    if (!card.keyEncrypted) return { error: 'Carte JEV sans clé' };
    if (card.method !== 'POST') return { error: 'La carte JEV doit appeler l’API en POST' };
    let model: string | null = null;
    try {
      model = JSON.parse(card.body || '{}')?.model ?? null;
    } catch {
      model = null;
    }
    return model ? { card, model } : { error: 'Le corps de la carte JEV doit indiquer le modèle (« model »)' };
  }

  /**
   * Aiguillage du Cockpit en 5 cas d'usage (brief du 01/10/2026). Repli (carte absente, délai, erreur, réponse
   * illisible) : cas 5, clarification, motif tracé. Chaque décision est journalisée (question, cas, confiance,
   * probabilités, questions oui / non, modèle, durée) ; le modèle de la réponse est ajouté ensuite (`noteAnswerModel`).
   */
  async classifyCockpit(question: string, ctx: { history?: CockpitRouterTurn[]; page?: string | null; accountId?: string | null; conversationId?: string | null; version?: CockpitRouterVersion; source?: 'LIVE' | 'EVAL'; record?: boolean } = {}): Promise<CockpitRoutedQuestion> {
    const version = ctx.version ?? COCKPIT_ROUTER_VERSION;
    const c = await this.card();
    let out: Omit<CockpitRoutedQuestion, 'traceId'>;
    const fail = (status: RoutedQuestion['status'], error: string, latencyMs: number | null): Omit<CockpitRoutedQuestion, 'traceId'> => ({
      cas: '5', confiance: 0, choice: null, probabilities: {}, ecriture: null, multi: false, multiScore: null, downgrade: null,
      justification: `Classification indisponible (${error}) : clarification`, status, latencyMs, error,
    });
    if ('error' in c) out = fail('NOT_CONFIGURED', c.error, null);
    else {
      const body = JSON.stringify(buildCockpitRouterRequest(question, { model: c.model, history: ctx.history, page: ctx.page, version }));
      const r = await this.apiCards.call({ ...c.card, body }, {}, 'JEV');
      if (r.code === 0) out = fail(r.failure === 'timeout' ? 'TIMEOUT' : 'ERROR', r.failure === 'timeout' ? 'Délai dépassé' : `Service injoignable : ${r.body.slice(0, 200)}`, r.ms);
      else if (r.code < 200 || r.code >= 300) out = fail('ERROR', `HTTP ${r.code} : ${r.body.slice(0, 200)}`, r.ms);
      else {
        try {
          out = { ...parseCockpitRouterResponse(JSON.parse(r.body)), status: 'OK', latencyMs: r.ms, error: null };
        } catch (e) {
          out = fail('INVALID', e instanceof CockpitRouterResponseError ? e.message : 'Réponse JSON illisible', r.ms);
        }
      }
    }
    let traceId: string | null = null;
    if (ctx.record !== false) {
      const row = await this.prisma.jevClassification.create({
        data: {
          at: this.today.now(), accountId: ctx.accountId ?? null, conversationId: ctx.conversationId ?? null, question: question.slice(0, 2000), app: 'cockpit',
          type: out.cas, choice: out.choice, confidence: out.status === 'OK' ? out.confiance : null, probabilities: out.status === 'OK' ? (out.probabilities as Prisma.InputJsonValue) : Prisma.DbNull,
          writeScore: out.ecriture, multiScore: out.multiScore, multi: out.status === 'OK' ? out.multi : null,
          latencyMs: out.latencyMs, status: out.status, error: out.error, promptVersion: version, model: 'model' in c ? c.model : null, source: ctx.source ?? 'LIVE',
        },
      }).catch((e) => { console.warn('[jev-router] trace non enregistrée :', e instanceof Error ? e.message : e); return null; });
      traceId = row?.id ?? null;
    }
    if (out.status !== 'OK') console.warn(`[jev-router] repli Cockpit (${out.status}) : ${out.error}`);
    return { ...out, traceId };
  }

  /** Modèle qui a rédigé la réponse, ajouté à la trace de l'aiguillage. */
  async noteAnswerModel(traceId: string | null, modelId: string | null) {
    if (!traceId || !modelId) return;
    await this.prisma.jevClassification.update({ where: { id: traceId }, data: { answerModel: modelId } }).catch(() => undefined);
  }

  async classify(question: string, ctx: { history?: RouterTurn[]; page?: string | null; accountId?: string | null; conversationId?: string | null; version?: RouterPromptVersion; source?: 'LIVE' | 'EVAL'; record?: boolean } = {}): Promise<RoutedQuestion> {
    const version = ctx.version ?? ROUTER_PROMPT_VERSION;
    const card = await this.prisma.apiCard.findUnique({ where: { id: this.cardId() } });
    let model: string | null = null;
    let out: RoutedQuestion;
    if (!card || !card.enabled || !card.keyEncrypted || card.method !== 'POST') {
      out = fallback('NOT_CONFIGURED', !card ? `Carte « ${this.cardId()} » absente du Registre des cartes API` : !card.enabled ? 'Carte JEV désactivée' : !card.keyEncrypted ? 'Carte JEV sans clé' : 'La carte JEV doit appeler l’API en POST', null);
    } else {
      try {
        model = JSON.parse(card.body || '{}')?.model ?? null;
      } catch {
        model = null;
      }
      if (!model) out = fallback('NOT_CONFIGURED', 'Le corps de la carte JEV doit indiquer le modèle (« model »)', null);
      else {
        const body = JSON.stringify(buildRouterRequest(question, { model, history: ctx.history, page: ctx.page, version }));
        const r = await this.apiCards.call({ ...card, body }, {}, 'JEV');
        if (r.code === 0) out = fallback(r.failure === 'timeout' ? 'TIMEOUT' : 'ERROR', r.failure === 'timeout' ? 'Délai dépassé' : `Service injoignable : ${r.body.slice(0, 200)}`, r.ms);
        else if (r.code < 200 || r.code >= 300) out = fallback('ERROR', `HTTP ${r.code} : ${r.body.slice(0, 200)}`, r.ms);
        else {
          try {
            out = { ...parseRouterResponse(JSON.parse(r.body)), status: 'OK', latencyMs: r.ms, error: null };
          } catch (e) {
            out = fallback('INVALID', e instanceof RouterResponseError ? e.message : 'Réponse JSON illisible', r.ms);
          }
        }
      }
    }
    if (ctx.record !== false) {
      await this.prisma.jevClassification.create({
        data: {
          at: this.today.now(), accountId: ctx.accountId ?? null, conversationId: ctx.conversationId ?? null, question: question.slice(0, 2000),
          type: out.type, choice: out.choice, confidence: out.status === 'OK' ? out.confiance : null, probabilities: out.status === 'OK' ? (out.probabilities as Prisma.InputJsonValue) : Prisma.DbNull,
          latencyMs: out.latencyMs, status: out.status, error: out.error, promptVersion: version, model, source: ctx.source ?? 'LIVE',
        },
      }).catch((e) => console.warn('[jev-router] trace non enregistrée :', e instanceof Error ? e.message : e));
    }
    if (out.status !== 'OK') console.warn(`[jev-router] repli (${out.status}) : ${out.error}`);
    return out;
  }
}

/** Repli : les deux traitements (AMBIGU), motif conservé. */
function fallback(status: RoutedQuestion['status'], error: string, latencyMs: number | null): RoutedQuestion {
  return { type: 'AMBIGU', confiance: 0, justification: `Classification indisponible (${error}) : traitement complet`, choice: null, probabilities: {}, status, latencyMs, error };
}
