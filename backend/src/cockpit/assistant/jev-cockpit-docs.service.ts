import { latencyKind } from '../../core/latency';
import { span } from '../../core/trace';
import { Injectable } from '@nestjs/common';
import { Actor } from '../../core/auth/auth';
import { ProjectScope } from '../../core/access.service';
import { LlmResult, LlmService } from '../../core/llm.service';
import { JevPromptService } from '../../core/jev-prompt.service';
import { PrismaService } from '../../core/prisma.service';
import { TodayService } from '../../core/today.service';
import { ChatTurn } from '../../core/llm-client';
import { requestContext } from '../../domain/jev-sql';
import { COCKPIT_CASE_ROUTE } from '../../domain/jev-router-cockpit';
import {
  DOC_ANSWER_RULES, DOC_DATA_ANSWER_HINT, DOC_DATA_ANSWER_RULES, DOC_DATA_QUERY_HINT, docSessionsBlock, DOC_EMPTY_REPLY, DOC_IDENTIFY_SYSTEM, DOC_KEEP, DOC_MIN_SIMILARITY, DOC_NOT_FOUND_REPLY, DOC_OUTLINE_MAX, DOC_SEARCH_K,
  DOC_SESSIONS_MAX, DocExtract, docCatalogText, docExtractsBlock, docOverviewBlock, docSourceLabel, nowParisLabel, parseDocIdentification,
} from '../../domain/jev-cockpit-answers';
import { KbService } from '../documents/kb.service';
import { InsightAnswer, JevCockpitInsightService } from '../../admin/jev-cockpit-insight.service';

export interface DocsAnswer {
  /** ANSWERED ; EMPTY : aucun document consultable ; NOT_FOUND : aucun extrait pertinent. */
  status: 'ANSWERED' | 'EMPTY' | 'NOT_FOUND';
  reply: string;
  /** Sources : documents et repères (« Nom · diapositive 4 »), puis vues consultées pour 4b. */
  sources: Array<{ entityType: 'DOCUMENT' | 'DATA'; id: string; label: string }>;
  /** Documents identifiés (journal, tests). */
  documents: string[];
  modelId: string | null;
  fallbackUsed: boolean;
  insight?: InsightAnswer['status'];
}

/**
 * Cas 4 du Jev du Cockpit — documents de la Base de connaissance (brief du 01/10/2026) :
 * 1. identification du ou des documents visés : le modèle Documents / Synthèse reçoit le catalogue des documents
 *    indexés que l'utilisateur peut voir et les séances de comité tenues (« le dernier COPIL » → sa date → son support) ;
 * 2. recherche des extraits proches de la question (vectorisation), limitée aux documents identifiés s'il y en a,
 *    sinon dans toute la base avec un seuil ; reclassement (fonction Reclassement), les meilleurs gardés ;
 * 3. réponse par le modèle Documents / Synthèse avec la skill « Analyser un document », à partir des seuls extraits,
 *    du résumé et du plan des documents visés ; sources : document et repère.
 * 4b : la partie « données » vient du cas 1 (requête filtrée par les droits), puis les documents ; la réponse sépare
 * clairement ce qui vient des données et ce qui vient des documents.
 */
@Injectable()
export class JevCockpitDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kb: KbService,
    private readonly llm: LlmService,
    private readonly jevPrompt: JevPromptService,
    private readonly today: TodayService,
    private readonly insight: JevCockpitInsightService,
  ) {}

  async answer(scope: ProjectScope, actor: Actor, question: string, opts: { page: string; withData: boolean; history?: ChatTurn[] }): Promise<DocsAnswer> {
    const { functionId, skill } = COCKPIT_CASE_ROUTE[opts.withData ? '4b' : '4a'];
    const calls: LlmResult[] = [];
    const done = (status: DocsAnswer['status'], reply: string, sources: DocsAnswer['sources'] = [], documents: string[] = [], insight?: InsightAnswer): DocsAnswer => ({
      status, reply, sources, documents, modelId: calls.length ? calls[calls.length - 1].modelId : insight?.modelId ?? null, fallbackUsed: calls.some((c) => c.fallbackUsed) || !!insight?.fallbackUsed, insight: insight?.status,
    });

    // 4b : la partie « données » d'abord (cas 1, droits de l'utilisateur).
    const data = opts.withData ? await this.insight.ask(question, { project: scope.project, access: scope.access, page: opts.page, queryHint: DOC_DATA_QUERY_HINT, extraRules: DOC_DATA_ANSWER_HINT, history: opts.history }) : null;
    const dataSources = (data?.sources ?? []).map((label) => ({ entityType: 'DATA' as const, id: label, label }));

    // 1. Identification des documents visés.
    const docs = await this.kb.visibleIndexed(scope, actor);
    if (!docs.length) return data ? done('EMPTY', `${data.reply}\n\n${DOC_EMPTY_REPLY}`, dataSources, [], data) : done('EMPTY', DOC_EMPTY_REPLY);
    const sessions = await this.heldSessions(scope.project.id);
    const idCall = await latencyKind('qry', () => this.llm.complete({
      functionId, source: 'JEV', cache: true, projectId: scope.project.id, maxTokens: 300, history: opts.history,
      system: DOC_IDENTIFY_SYSTEM, systemTail: docCatalogText(docs, sessions, this.today.today()), prompt: question,
    }));
    calls.push(idCall);
    const ident = parseDocIdentification(idCall.text, docs.map((d) => d.id), question);

    // 2. Recherche et reclassement.
    const found = await span('recherche dans la Base de connaissance', async (d) => { const f = await this.kb.searchChunks(scope, actor, ident.query, { k: DOC_SEARCH_K, documentIds: ident.ids }); Object.assign(d, { documents_vises: ident.ids.length, extraits: f.results.length }); return f; });
    let candidates = found.results.filter((r) => ident.ids.length || r.similarity >= DOC_MIN_SIMILARITY);
    if (candidates.length > DOC_KEEP) {
      try {
        const rr = await this.llm.rerankTexts(ident.query, candidates.map((c) => `${c.document} · ${c.location}\n${c.content}`), DOC_KEEP, 'COCKPIT');
        candidates = rr.results.map((x) => candidates[x.index]).filter(Boolean);
      } catch (e) {
        // Reclassement indisponible : les premiers résultats de la recherche (brief, cas 2, appliqué ici).
        console.warn(`[jev] reclassement indisponible (documents) : ${e instanceof Error ? e.message : e}`);
        candidates = candidates.slice(0, DOC_KEEP);
      }
    }
    if (!candidates.length) {
      return data ? done('NOT_FOUND', `${data.reply}\n\n${DOC_NOT_FOUND_REPLY}`, dataSources, ident.ids, data) : done('NOT_FOUND', DOC_NOT_FOUND_REPLY, [], ident.ids);
    }

    // 3. Réponse à partir des documents (et des données pour 4b).
    const visees = await Promise.all(docs.filter((d) => ident.ids.includes(d.id)).map(async (d) => ({ n: d.n, dateIso: d.dateIso, type: d.type, description: d.description, outline: await this.kb.outline(d.id, DOC_OUTLINE_MAX) })));
    const extracts: DocExtract[] = candidates.map((c) => ({ document: c.document, dateIso: c.dateIso, location: c.location, content: c.content, similarity: c.similarity }));
    const parts = await this.jevPrompt.cockpitParts(skill, opts.page);
    const context = requestContext(parts.page, this.today.today(), nowParisLabel(this.today.now()));
    const tail = [
      context,
      ...(data ? [`## Réponse tirée des données du projet (tables du Cockpit, périmètre de l’utilisateur)\n${data.reply}`] : []),
      ...(sessions.length ? [docSessionsBlock(sessions)] : []),
      ...(visees.length ? [docOverviewBlock(visees)] : []),
      docExtractsBlock(extracts),
    ].join('\n\n');
    const r = await this.llm.complete({
      functionId, source: 'JEV', cache: true, projectId: scope.project.id,
      system: `${parts.stable}\n\n${data ? DOC_DATA_ANSWER_RULES : DOC_ANSWER_RULES}`, systemTail: tail, prompt: question, history: opts.history,
    });
    calls.push(r);
    const seen = new Set<string>();
    const docSources = extracts.map((x) => docSourceLabel(x)).filter((l) => (seen.has(l) ? false : (seen.add(l), true))).map((label) => ({ entityType: 'DOCUMENT' as const, id: label, label }));
    return done('ANSWERED', r.text, [...dataSources, ...docSources], ident.ids, data ?? undefined);
  }

  /** Séances tenues du projet, de la plus récente à la plus ancienne (pour situer « le dernier COPIL »). */
  private async heldSessions(projectId: string) {
    const rows = await this.prisma.session.findMany({ where: { projectId, status: 'HELD' }, orderBy: { dateIso: 'desc' }, take: DOC_SESSIONS_MAX });
    const bodies = await this.prisma.governanceBody.findMany({ where: { projectId } });
    const by = new Map(bodies.map((b) => [b.id, b]));
    return rows.map((s) => ({ instance: by.get(s.bodyId)?.name ?? s.bodyId, short: by.get(s.bodyId)?.shortName ?? '', number: s.number, dateIso: s.dateIso }));
  }
}
