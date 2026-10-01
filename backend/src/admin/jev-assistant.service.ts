import { span, traced, traceMeta } from '../core/trace';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JevPromptService } from '../core/jev-prompt.service';
import { LlmService } from '../core/llm.service';
import { PrismaService } from '../core/prisma.service';
import { TodayService } from '../core/today.service';
import { requestContext } from '../domain/jev-sql';
import { CONSOLE_PAGE_TITLES } from '../domain/jev-prompt';
import { RouteType } from '../domain/jev-router';
import { ClarifyReason, cleanReformulation, clarifyPrompt, CLARIFY_RULES, GUIDE_ANSWER_RULES, guideExtractsBlock, guideSources, pagesOf, RagSettings, REFORMULATE_SYSTEM } from '../domain/jev-rag';
import { GuideSearchService } from './guide-search.service';
import { JevMemory, JevMemoryService } from './jev-memory.service';
import { JevRouterService } from './jev-router.service';
import { JevSqlService } from './jev-sql.service';

export interface JevReply {
  reply: string;
  sources: string[];
  ai: { functionId: string; modelId: string; fallbackUsed: boolean } | null;
  conversationId: string;
  route: RouteType;
  /** DONNEES, GUIDE (recherche dans le guide), CLARIFICATION, COMPLET (repli si la classification a échoué). */
  treatment: string;
  unavailable?: string;
}

interface Outcome {
  reply: string;
  sources: string[];
  ai: JevReply['ai'];
  treatment: string;
  reason?: ClarifyReason | null;
  reformulated?: string | null;
  log?: Partial<{ extracts: unknown; reranker: string | null; rerankFallback: string | null; model: string | null; sql: string | null; timings: Record<string, number | undefined> }>;
}

/**
 * Réponse de Jev dans la Console (décision du 30/09/2026) : aiguillage puis traitement.
 * 1. DONNÉES : traitement existant (requête SQL sur les vues de la Console, `JevSqlService`), inchangé.
 * 2. USAGE : question de suite reformulée (autonome), recherche dans le guide (`GuideSearchService`), rédaction par le
 *    modèle de la fonction Synthèse à partir des seuls extraits (partie stable en cache, extraits et question ensuite),
 *    sources (section, page). Aucun extrait pertinent, guide non indexé ou recherche indisponible → clarification.
 * 3. AMBIGU, HORS_SUJET : clarification (fonction Guidage console), historique compris.
 * Classification impossible (API de JEV en erreur) : traitement complet (le modèle explique ou lit les données).
 * Mémoire commune : chaque question et sa réponse (type, sources, reformulation) sont gardées, quel que soit le cas.
 * Journal technique : type, traitement, extraits et scores, reclassement ou repli, modèle, temps, erreur.
 */
@Injectable()
export class JevAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly jevPrompt: JevPromptService,
    private readonly jevSql: JevSqlService,
    private readonly memory: JevMemoryService,
    private readonly router: JevRouterService,
    private readonly search: GuideSearchService,
    private readonly today: TodayService,
  ) {}

  async answer(accountId: string, text: string, section: string, conversationId?: string | null): Promise<JevReply> {
    return traced('Jev Console', () => this.answerTraced(accountId, text, section, conversationId), { page: section, question: text.slice(0, 120) });
  }

  private async answerTraced(accountId: string, text: string, section: string, conversationId?: string | null): Promise<JevReply> {
    const t0 = Date.now();
    const conv = conversationId ? await this.memory.own(accountId, conversationId) : await this.memory.start(accountId);
    const mem = await this.memory.memory(conv);
    const previous = mem.history.filter((h) => h.role === 'user').map((h) => ({ question: h.content }));
    const route = await span('aiguillage (API JEV)', async (d) => { const r = await this.router.classify(text, { history: previous, page: CONSOLE_PAGE_TITLES[section] ?? section, accountId, conversationId: conv.id }); Object.assign(d, { type: r.type, confiance: r.confiance, statut: r.status }); return r; });
    traceMeta('type', route.type);
    const classificationId = (await this.prisma.jevClassification.findFirst({ where: { conversationId: conv.id }, orderBy: { at: 'desc' }, select: { id: true } }))?.id ?? null;
    // Guide et réglages de la Console seulement (questions posées depuis la Console).
    const s = await this.search.settings('console');
    let out: Outcome;
    try {
      if (route.status !== 'OK') {
        const r = await this.jevSql.ask(text, section, mem, 'AMBIGU');
        out = { reply: r.reply, sources: r.sources, ai: r.ai, treatment: 'COMPLET', log: { model: r.ai?.modelId ?? null, sql: r.sql } };
      } else if (route.type === 'DONNEES') {
        const r = await this.jevSql.ask(text, section, mem, 'DONNEES');
        out = { reply: r.reply, sources: r.sources, ai: r.ai, treatment: 'DONNEES', log: { model: r.ai?.modelId ?? null, sql: r.sql } };
      } else if (route.type === 'USAGE') {
        out = await this.fromGuide(text, section, mem, s);
      } else {
        out = await this.clarify(text, section, mem, route.type === 'HORS_SUJET' ? 'HORS_SUJET' : 'AMBIGU', s);
      }
    } catch (e: any) {
      const why = String(e?.response?.message ?? e?.message ?? 'modèles indisponibles');
      await this.writeLog({ accountId, conversationId: conv.id, classificationId, question: text, route: route.type, treatment: 'ERREUR', totalMs: Date.now() - t0, error: why.slice(0, 1000) });
      // Sans réponse, l'échange n'est pas gardé en mémoire : il ne pèserait pas sur la suite.
      return { reply: `Je ne peux pas répondre pour l’instant : ${why}`, sources: [], ai: null, unavailable: why, conversationId: conv.id, route: route.type, treatment: 'ERREUR' };
    }
    await this.memory.record(conv, text, out.reply, out.sources, { route: route.type, reformulated: out.reformulated ?? null });
    await this.writeLog({
      accountId, conversationId: conv.id, classificationId, question: text, reformulated: out.reformulated ?? null, route: route.type, treatment: out.treatment, reason: out.reason ?? null,
      extracts: out.log?.extracts ?? null, reranker: out.log?.reranker ?? null, rerankFallback: out.log?.rerankFallback ?? null, model: out.log?.model ?? out.ai?.modelId ?? null, sql: out.log?.sql ?? null,
      timings: { classifyMs: route.latencyMs ?? undefined, ...(out.log?.timings ?? {}) }, totalMs: Date.now() - t0,
    });
    return { reply: out.reply, sources: out.sources, ai: out.ai, conversationId: conv.id, route: route.type, treatment: out.treatment };
  }

  /** USAGE : recherche dans le guide et rédaction à partir des extraits ; sinon clarification. */
  private async fromGuide(text: string, section: string, mem: JevMemory, s: RagSettings): Promise<Outcome> {
    const timings: Record<string, number | undefined> = {};
    let reformulated: string | null = null;
    if (mem.history.some((h) => h.role === 'user')) {
      const t0 = Date.now();
      const r = await this.llm.complete({ functionId: 'guidage', source: 'JEV', system: REFORMULATE_SYSTEM, prompt: `Dernière question : ${text}`, history: mem.history, timeoutMs: s.llmTimeoutMs, maxWords: 60 });
      reformulated = cleanReformulation(r.text, text);
      timings.reformulateMs = Date.now() - t0;
      if (reformulated === text) reformulated = null;
    }
    const q = reformulated ?? text;
    let found;
    try {
      found = await this.search.search('console', q, s);
    } catch (e: any) {
      const c = await this.clarify(text, section, mem, e?.reason ?? 'INDISPONIBLE', s);
      return { ...c, reformulated, log: { ...c.log, rerankFallback: null, timings: { ...timings, ...c.log?.timings } } };
    }
    Object.assign(timings, found.timings);
    const extractsLog = { embedModel: found.embedModel, candidates: found.candidates, kept: found.extracts.map((x) => ({ id: x.id, heading: x.heading, pages: pagesOf(x), similarity: x.similarity, rerankScore: x.rerankScore ?? null })) };
    if (found.empty) {
      const c = await this.clarify(text, section, mem, found.empty, s);
      return { ...c, reformulated, log: { ...c.log, extracts: extractsLog, timings: { ...timings, ...c.log?.timings } } };
    }
    const parts = await this.jevPrompt.consolePromptParts(section);
    const tail = `${requestContext(parts.page, this.today.today(), nowParis(this.today.now()), mem.summary)}\n\n${guideExtractsBlock(found.extracts)}`;
    const t1 = Date.now();
    const r = await this.llm.complete({
      functionId: 'doc_syn', source: 'JEV', cache: true, timeoutMs: s.llmTimeoutMs, history: mem.history,
      system: `${parts.stable}\n\n${GUIDE_ANSWER_RULES}`, systemTail: tail,
      prompt: reformulated ? `${text}\n\n(Question comprise comme : ${reformulated})` : text,
    });
    timings.answerMs = Date.now() - t1;
    return {
      reply: r.text, sources: guideSources(found.extracts), ai: { functionId: 'doc_syn', modelId: r.modelId, fallbackUsed: r.fallbackUsed }, treatment: 'GUIDE', reformulated,
      log: { extracts: extractsLog, reranker: found.reranker, rerankFallback: found.rerankFallback, model: r.modelId, timings },
    };
  }

  /** Clarification : ce qui manque, puis 2 ou 3 reformulations ou options ; historique compris. */
  private async clarify(text: string, section: string, mem: JevMemory, reason: ClarifyReason, s: RagSettings): Promise<Outcome> {
    const parts = await this.jevPrompt.consolePromptParts(section);
    const t0 = Date.now();
    const r = await this.llm.complete({
      functionId: 'guidage', source: 'JEV', cache: true, timeoutMs: s.llmTimeoutMs, history: mem.history,
      system: `${parts.stable}\n\n${CLARIFY_RULES}`, systemTail: requestContext(parts.page, this.today.today(), nowParis(this.today.now()), mem.summary),
      prompt: clarifyPrompt(text, reason),
    });
    return { reply: r.text, sources: [], ai: { functionId: 'guidage', modelId: r.modelId, fallbackUsed: r.fallbackUsed }, treatment: 'CLARIFICATION', reason, log: { model: r.modelId, timings: { answerMs: Date.now() - t0 } } };
  }

  private async writeLog(d: { accountId: string; conversationId: string; classificationId: string | null; question: string; reformulated?: string | null; route: string; treatment: string; reason?: string | null; extracts?: unknown; reranker?: string | null; rerankFallback?: string | null; model?: string | null; sql?: string | null; timings?: Record<string, number | undefined>; totalMs: number; error?: string | null }) {
    await this.prisma.jevAnswerLog.create({
      data: {
        at: this.today.now(), accountId: d.accountId, conversationId: d.conversationId, classificationId: d.classificationId, question: d.question.slice(0, 2000), reformulated: d.reformulated ?? null,
        route: d.route, treatment: d.treatment, reason: d.reason ?? null, extracts: (d.extracts ?? Prisma.DbNull) as Prisma.InputJsonValue, reranker: d.reranker ?? null, rerankFallback: d.rerankFallback ?? null,
        model: d.model ?? null, sql: d.sql?.slice(0, 20000) ?? null, timings: (d.timings ?? Prisma.DbNull) as Prisma.InputJsonValue, totalMs: d.totalMs, error: d.error ?? null,
      },
    }).catch((e) => console.warn('[jev] journal non enregistré :', e instanceof Error ? e.message : e));
  }
}

function nowParis(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' }).format(d);
}
