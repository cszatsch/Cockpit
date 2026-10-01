import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { AiFunctionId, LlmResult, LlmService } from '../core/llm.service';
import { JevPromptService } from '../core/jev-prompt.service';
import { TodayService } from '../core/today.service';
import { ChatTurn } from '../core/llm-client';
import { extractSql, formatRows, JEV_SQL_MAX_ROWS, JEV_SQL_RETRIES, looksLikeSql, renderDictionary, requestContext, SQL_CUT_REASON, sqlCut, sqlError, sqlInstructions, viewsUsed } from '../domain/jev-sql';
import { JEV_COCKPIT_SCHEMA } from '../domain/jev-dictionnaire-cockpit';
import { ProjectAccess, visibleWorkstreams } from '../domain/rights';
import { COCKPIT_INSIGHT_ANSWER_RULES, COCKPIT_INSIGHT_DATA_HINT, cockpitScopeLine, insightSourceLabel, insightUnavailableReply, nowParisLabel } from '../domain/jev-cockpit-answers';
import { dbMessage, JevSqlService } from './jev-sql.service';

export interface InsightAnswer {
  /** ANSWERED : réponse tirée des résultats ; DIRECT : le modèle a répondu sans requête ; FAILED : lecture impossible. */
  status: 'ANSWERED' | 'DIRECT' | 'FAILED';
  reply: string;
  /** Vues consultées, en clair (« Données · risques »). */
  sources: string[];
  /** Requête exécutée (journal technique ; jamais affichée). */
  sql: string | null;
  rows: number | null;
  modelId: string | null;
  fallbackUsed: boolean;
}

/**
 * Cas 1 du Jev du Cockpit — Insight sur les données du projet (brief du 01/10/2026), sur le modèle du Jev de la Console :
 * 1. le modèle de la fonction Insights reçoit le prompt de Jev (skill « Insights » seule), le dictionnaire des vues
 *    `jev_cockpit` et le périmètre de l'utilisateur ; il écrit une requête SQL (ou répond directement) ;
 * 2. la requête est contrôlée puis exécutée en lecture seule sous le rôle `jev_lecteur_cockpit`, le projet et les
 *    chantiers lisibles par l'utilisateur étant posés par le serveur (les vues filtrent : il ne voit que ses chantiers) ;
 *    une correction au plus en cas de refus ou d'échec ;
 * 3. le modèle rédige la réponse à partir des résultats et d'eux seuls ; les vues consultées sont les sources.
 */
@Injectable()
export class JevCockpitInsightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly jevPrompt: JevPromptService,
    private readonly jevSql: JevSqlService,
    private readonly today: TodayService,
  ) {}

  /** `queryHint` / `extraRules` : consignes ajoutées aux étapes « requête » et « réponse » (4b : état actuel seulement). */
  async ask(text: string, opts: { project: { id: string; code: string }; access: ProjectAccess; page: string; functionId?: AiFunctionId; skill?: string | null; queryHint?: string; extraRules?: string; history?: ChatTurn[] }): Promise<InsightAnswer> {
    const functionId = opts.functionId ?? 'insights';
    const parts = await this.jevPrompt.cockpitParts(opts.skill === undefined ? 'Insights' : opts.skill, opts.page);
    const tables = await this.prisma.dictionnaireTable.findMany({ where: { espace: 'cockpit', actif: true }, include: { colonnes: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } });
    const ws = visibleWorkstreams(opts.access);
    const chantiers = ws === null ? '*' : ws;
    const system = `${parts.stable}\n\n${sqlInstructions(renderDictionary(tables, JEV_COCKPIT_SCHEMA), null, null, {
      title: 'Données du projet',
      schema: JEV_COCKPIT_SCHEMA,
      topics: 'planning, chantiers, jalons, livrables, risques, problèmes, actions, décisions, comités, équipes, baromètre…',
      direct: 'Si la question ne demande aucune donnée du projet, réponds directement, sans SQL.',
      scope: `Les vues ne contiennent que le projet ${opts.project.code}. ${cockpitScopeLine(chantiers)}`,
    })}\n\n${COCKPIT_INSIGHT_DATA_HINT}${opts.queryHint ? `\n${opts.queryHint}` : ''}`;
    const context = requestContext(parts.page, this.today.today(), nowParisLabel(this.today.now()));
    const calls: LlmResult[] = [];
    const call = async (prompt: string, sys: string, tail = context) => {
      const r = await this.llm.complete({ functionId, prompt, system: sys, systemTail: tail, cache: true, projectId: opts.project.id, source: 'JEV', history: opts.history });
      calls.push(r);
      return r;
    };
    const done = (status: InsightAnswer['status'], reply: string, sources: string[] = [], sql: string | null = null, rows: number | null = null): InsightAnswer => ({
      status, reply, sources, sql, rows, modelId: calls.length ? calls[calls.length - 1].modelId : null, fallbackUsed: calls.some((c) => c.fallbackUsed),
    });

    // 1. Requête, ou réponse directe.
    const first = await call(text, system);
    let sql = extractSql(first.text);
    let cut = sqlCut(first.text);
    if (sql === null && !looksLikeSql(first.text)) return done('DIRECT', first.text);

    // 2. Contrôle et exécution sur le périmètre de l'utilisateur, une correction au plus.
    let rows: Array<Record<string, unknown>> | null = null;
    let why = '';
    for (let attempt = 0; ; attempt++) {
      why = cut ? SQL_CUT_REASON : sql ? sqlError(sql) ?? '' : 'aucune requête dans la réponse';
      if (!why) {
        try {
          rows = await this.jevSql.executeCockpit(sql!, opts.project.id, chantiers);
          break;
        } catch (e) {
          why = dbMessage(e);
        }
      }
      if (attempt >= JEV_SQL_RETRIES) break;
      const fix = await call(`${text}\n\n## Requête à corriger\n\`\`\`sql\n${sql ?? ''}\n\`\`\`\nMotif du refus ou de l’échec : ${why}\nRéponds uniquement par la requête corrigée, dans un bloc \`\`\`sql\`\`\`.`, system);
      sql = extractSql(fix.text);
      cut = sqlCut(fix.text);
    }
    if (!rows) return done('FAILED', insightUnavailableReply(why), [], sql);

    // 3. Réponse à partir des résultats, et d'eux seuls.
    const views = viewsUsed(sql!.replace(new RegExp(`${JEV_COCKPIT_SCHEMA}\\s*\\.`, 'gi'), ''), tables.map((t) => t.nom));
    const used = tables.filter((t) => views.includes(t.nom));
    const res = formatRows(rows);
    const head = `## Résultats de la requête (${res.count} ligne(s)${res.truncated ? `, tronqués aux ${JEV_SQL_MAX_ROWS} premières` : ''})`;
    const answer = await call(
      `${text}\n\n${head}\n${res.text}`,
      `${parts.stable}\n\n${COCKPIT_INSIGHT_ANSWER_RULES}${opts.extraRules ? `\n\n${opts.extraRules}` : ''}`,
      `${context}\n\n## Périmètre de l’utilisateur\n${cockpitScopeLine(chantiers)}\n\n## Dictionnaire des vues consultées\n${renderDictionary(used, JEV_COCKPIT_SCHEMA)}`,
    );
    return done('ANSWERED', answer.text, views.map(insightSourceLabel), sql, res.count);
  }
}
