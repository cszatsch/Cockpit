import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { TodayService } from '../core/today.service';
import { ApiCardsService } from './api-cards.service';
import { buildRouterRequest, JEV_ROUTER_CARD, parseRouterResponse, RouteDecision, RouterApp, RouterPromptVersion, RouterResponseError, RouterTurn, ROUTER_PROMPT_VERSION } from '../domain/jev-router';

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

  async classify(question: string, ctx: { history?: RouterTurn[]; page?: string | null; accountId?: string | null; conversationId?: string | null; version?: RouterPromptVersion; source?: 'LIVE' | 'EVAL'; record?: boolean; app?: RouterApp } = {}): Promise<RoutedQuestion> {
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
        const body = JSON.stringify(buildRouterRequest(question, { model, history: ctx.history, page: ctx.page, version, app: ctx.app }));
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
          latencyMs: out.latencyMs, status: out.status, error: out.error, promptVersion: ctx.app === 'cockpit' ? 'cockpit-v1' : version, model, source: ctx.source ?? 'LIVE',
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
