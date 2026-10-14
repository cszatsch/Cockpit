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
  DOC_ANSWER_RULES, DOC_AUTO_ANSWER_RULES, DOC_DATA_ANSWER_HINT, DOC_DATA_ANSWER_RULES, DOC_DATA_QUERY_HINT, docSessionsBlock, DOC_EMPTY_REPLY, DOC_IDENTIFY_SYSTEM, DOC_KEEP, DOC_MIN_SIMILARITY, DOC_NOT_FOUND_REPLY, DOC_OUTLINE_MAX, DOC_SEARCH_K,
  DOC_SESSIONS_MAX, DocExtract, DOCS_MODULE_ID, docCatalogText, docExtractsBlock, docOverviewBlock, docSourceLabel, nowParisLabel, parseDocIdentification, usesDocsPart,
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
  /** Double recherche : la réponse contient une partie tirée des documents. */
  docsUsed?: boolean;
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

  async answer(scope: ProjectScope, actor: Actor, question: string, opts: { page: string; withData: boolean; auto?: boolean; history?: ChatTurn[] }): Promise<DocsAnswer> {
    const { functionId, skill } = COCKPIT_CASE_ROUTE[opts.withData ? '4b' : '4a'];
    const calls: LlmResult[] = [];
    const done = (status: DocsAnswer['status'], reply: string, sources: DocsAnswer['sources'] = [], documents: string[] = [], insight?: InsightAnswer, docsUsed?: boolean): DocsAnswer => ({
      status, reply, sources, documents, modelId: calls.length ? calls[calls.length - 1].modelId : insight?.modelId ?? null, fallbackUsed: calls.some((c) => c.fallbackUsed) || !!insight?.fallbackUsed, insight: insight?.status,
      ...(docsUsed === undefined ? {} : { docsUsed }),
    });
    const dataSourcesOf = (d: InsightAnswer | null) => (d?.sources ?? []).map((label) => ({ entityType: 'DATA' as const, id: label, label }));

    // 4b et double recherche : la partie « données » (cas 1, droits de l'utilisateur) part en même temps que la
    // recherche dans les documents (13/10/2026) ; elle ne sert qu'à la rédaction finale.
    const dataP: Promise<InsightAnswer | null> = opts.withData ? this.insight.ask(question, { project: scope.project, access: scope.access, page: opts.page, queryHint: DOC_DATA_QUERY_HINT, extraRules: DOC_DATA_ANSWER_HINT, history: opts.history }) : Promise.resolve(null);
    dataP.catch(() => undefined); // rejet traité à l'attente ; jamais de rejet non suivi pendant la recherche
    // Double recherche (cas 1, module actif) : sans document utile, ou si la chaîne Documents échoue, réponse des données seule.
    const dataOnly = async (): Promise<DocsAnswer> => { const d = (await dataP)!; return done('NOT_FOUND', d.reply, dataSourcesOf(d), [], d, false); };

    try {
      // 1. Identification des documents visés.
      const docs = await this.kb.visibleIndexed(scope, actor);
      if (!docs.length) {
        if (opts.auto) return await dataOnly();
        const data = await dataP;
        return data ? done('EMPTY', `${data.reply}\n\n${DOC_EMPTY_REPLY}`, dataSourcesOf(data), [], data) : done('EMPTY', DOC_EMPTY_REPLY);
      }
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
      const data = await dataP;
      if (!candidates.length) {
        if (opts.auto) return await dataOnly();
        return data ? done('NOT_FOUND', `${data.reply}\n\n${DOC_NOT_FOUND_REPLY}`, dataSourcesOf(data), ident.ids, data) : done('NOT_FOUND', DOC_NOT_FOUND_REPLY, [], ident.ids);
      }
      // Données illisibles : jamais une réponse tirée des seuls documents à la place (double recherche).
      if (opts.auto && data?.status === 'FAILED') return await dataOnly();

      // 3. Réponse à partir des documents (et des données pour 4b et la double recherche).
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
      const rules = opts.auto ? DOC_AUTO_ANSWER_RULES : data ? DOC_DATA_ANSWER_RULES : DOC_ANSWER_RULES;
      const r = await this.llm.complete({
        functionId, source: 'JEV', cache: true, projectId: scope.project.id,
        system: `${parts.stable}\n\n${rules}`, systemTail: tail, prompt: question, history: opts.history,
      });
      calls.push(r);
      const seen = new Set<string>();
      const docSources = extracts.map((x) => docSourceLabel(x)).filter((l) => (seen.has(l) ? false : (seen.add(l), true))).map((label) => ({ entityType: 'DOCUMENT' as const, id: label, label }));
      if (!opts.auto) return done('ANSWERED', r.text, [...dataSourcesOf(data), ...docSources], ident.ids, data ?? undefined);
      // Double recherche : sources « document » seulement si la réponse contient la partie documents.
      const docsUsed = usesDocsPart(r.text);
      return done('ANSWERED', r.text, [...dataSourcesOf(data), ...(docsUsed ? docSources : [])], ident.ids, data ?? undefined, docsUsed);
    } catch (e) {
      if (!opts.auto) throw e;
      // Chaîne Documents indisponible (vectorisation, modèle…) : la réponse des données, sans message d'erreur.
      console.warn(`[jev] double recherche : documents indisponibles, réponse des données seule (${e instanceof Error ? e.message : e})`);
      return dataOnly();
    }
  }

  /** Module « Recherche documentaire systématique » actif sur ce projet ? (absent : inactif) */
  async autoEnabled(projectId: string): Promise<boolean> {
    const m = await this.prisma.module.findUnique({ where: { id: DOCS_MODULE_ID }, include: { projects: true } });
    return !!m && (m.scope === 'ALL' || (m.scope === 'PROJECTS' && m.projects.some((x) => x.projectId === projectId)));
  }

  /** Au moins un document indexé consultable par l'utilisateur (suggestion « Chercher dans les documents »). */
  async hasDocuments(scope: ProjectScope, actor: Actor): Promise<boolean> {
    return (await this.kb.visibleIndexed(scope, actor)).length > 0;
  }

  /** Séances tenues du projet, de la plus récente à la plus ancienne (pour situer « le dernier COPIL »). */
  private async heldSessions(projectId: string) {
    const rows = await this.prisma.session.findMany({ where: { projectId, status: 'HELD' }, orderBy: { dateIso: 'desc' }, take: DOC_SESSIONS_MAX });
    const bodies = await this.prisma.governanceBody.findMany({ where: { projectId } });
    const by = new Map(bodies.map((b) => [b.id, b]));
    return rows.map((s) => ({ instance: by.get(s.bodyId)?.name ?? s.bodyId, short: by.get(s.bodyId)?.shortName ?? '', number: s.number, dateIso: s.dateIso }));
  }
}
