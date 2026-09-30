import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { LlmResult, LlmService } from '../core/llm.service';
import { JevPromptService } from '../core/jev-prompt.service';
import { TodayService } from '../core/today.service';
import type { JevMemory } from './jev-memory.service';
import {
  ANSWER_INSTRUCTIONS, extractSql, formatRows, JEV_SQL_MAX_ROWS, JEV_SQL_RETRIES, JEV_SQL_ROLE, JEV_SQL_TIMEOUT_MS,
  renderDictionary, requestContext, sqlError, sqlInstructions, viewsUsed,
} from '../domain/jev-sql';
import { JEV_COCKPIT_ROLE, JEV_COCKPIT_SCHEMA, SCOPE_CHANTIERS, SCOPE_PROJET } from '../domain/jev-dictionnaire-cockpit';
import { ChantierScope } from '../domain/notification-rules';

export interface JevAnswer {
  reply: string;
  /** Vues consultées (affichées sous la réponse). */
  sources: string[];
  ai: { functionId: 'guidage'; modelId: string; fallbackUsed: boolean } | null;
  /** Requête exécutée (journal technique ; non affichée). */
  sql: string | null;
}

/**
 * Jev de la Console, interrogation des données en langage naturel (Text-to-SQL, brief du commanditaire) :
 * 1. le modèle de la fonction `guidage` reçoit le prompt de la Console (Identité, Soul, skill « Guidage console »,
 *    page) et le dictionnaire des données (lu en base) ; il répond directement, ou écrit une requête SQL ;
 * 2. la requête est contrôlée puis exécutée sous le rôle `jev_lecteur`, en lecture seule, bornée en durée et en
 *    lignes ; en cas de refus ou d'échec, le modèle la corrige une fois ;
 * 3. le modèle rédige la réponse à partir des résultats ; les vues consultées sont renvoyées comme sources.
 */
@Injectable()
export class JevSqlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly jevPrompt: JevPromptService,
    private readonly today: TodayService,
  ) {}

  /**
   * `memory` : derniers échanges et résumé de la conversation (mémoire de Jev, décision du 30/09/2026), envoyés avec
   * chaque appel. Prompt système en deux parties : stable (Identité, Soul, skill, mise en forme, dictionnaire), mise en
   * cache ; variable (page ouverte, date et heure, résumé), envoyée après.
   */
  async ask(text: string, section: string, memory?: JevMemory): Promise<JevAnswer> {
    const parts = await this.jevPrompt.consolePromptParts(section);
    const tables = await this.prisma.dictionnaireTable.findMany({ where: { espace: 'console', actif: true }, include: { colonnes: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } });
    const system = `${parts.stable}\n\n${sqlInstructions(renderDictionary(tables), null, null)}`;
    const context = requestContext(parts.page, this.today.today(), this.nowParis(), memory?.summary);
    const calls: LlmResult[] = [];
    const call = async (prompt: string, sys: string, tail = context) => {
      const r = await this.llm.complete({ functionId: 'guidage', prompt, system: sys, systemTail: tail, history: memory?.history, cache: true, source: 'COCKPIT' });
      calls.push(r);
      return r;
    };
    const ai = () => ({ functionId: 'guidage' as const, modelId: calls[calls.length - 1].modelId, fallbackUsed: calls.some((c) => c.fallbackUsed) });

    // 1. Réponse directe, ou requête.
    const first = await call(text, system);
    let sql = extractSql(first.text);
    if (sql === null) return { reply: first.text, sources: [], ai: ai(), sql: null };

    // 2. Contrôle et exécution, une correction au plus.
    let rows: Array<Record<string, unknown>> | null = null;
    let why = '';
    for (let attempt = 0; ; attempt++) {
      why = sql ? sqlError(sql) ?? '' : 'aucune requête dans la réponse';
      if (!why) {
        try {
          rows = await this.executeReadOnly(sql!);
          break;
        } catch (e) {
          why = dbMessage(e);
        }
      }
      if (attempt >= JEV_SQL_RETRIES) break;
      const fix = await call(`${text}\n\n## Requête à corriger\n\`\`\`sql\n${sql ?? ''}\n\`\`\`\nMotif du refus ou de l’échec : ${why}\nRéponds uniquement par la requête corrigée, dans un bloc \`\`\`sql\`\`\`.`, system);
      sql = extractSql(fix.text);
    }
    if (!rows) {
      return { reply: `Je n’ai pas pu lire les données de la plateforme pour répondre (${why}). Reformulez la question, ou consultez directement l’écran concerné de la Console.`, sources: [], ai: ai(), sql };
    }

    // 3. Réponse à partir des résultats.
    const sources = viewsUsed(sql!, tables.map((t) => t.nom));
    const used = tables.filter((t) => sources.includes(t.nom));
    const res = formatRows(rows);
    const answerSystem = `${parts.stable}\n\n${ANSWER_INSTRUCTIONS}`;
    const head = `## Résultats de la requête (${res.count} ligne(s)${res.truncated ? `, tronqués aux ${JEV_SQL_MAX_ROWS} premières` : ''})`;
    const answer = await call(`${text}\n\n${head}\n${res.text}`, answerSystem, `${context}\n\n## Dictionnaire des vues consultées\n${renderDictionary(used)}`);
    return { reply: answer.text, sources, ai: ai(), sql };
  }

  /**
   * Exécution d'une requête sous le rôle `jev_lecteur` : transaction en lecture seule, schéma `jev` seul,
   * durée et nombre de lignes bornés. Garantie indépendante du contrôle de `sqlError()`.
   */
  async executeReadOnly(sql: string): Promise<Array<Record<string, unknown>>> {
    const body = sql.trim().replace(/;\s*$/, '');
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${JEV_SQL_ROLE}`);
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${JEV_SQL_TIMEOUT_MS}`);
        await tx.$executeRawUnsafe('SET LOCAL search_path = jev');
        return tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM (\n${body}\n) AS jev_requete LIMIT ${JEV_SQL_MAX_ROWS + 1}`);
      },
      { timeout: JEV_SQL_TIMEOUT_MS + 5000 },
    );
  }

  /**
   * Exécution d'une requête sur les vues du Cockpit (rédaction des notifications) : même bornage que la Console,
   * rôle `jev_lecteur_cockpit`, et périmètre posé par le serveur avant de changer de rôle — projet, chantiers
   * lisibles (« * » : tous). Les vues filtrent sur ces paramètres ; la requête ne peut pas les modifier.
   */
  async executeCockpit(sql: string, projectId: string, chantiers: ChantierScope): Promise<Array<Record<string, unknown>>> {
    const body = sql.trim().replace(/;\s*$/, '');
    const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$executeRawUnsafe(`SET LOCAL ${SCOPE_PROJET} = ${lit(projectId)}`);
        await tx.$executeRawUnsafe(`SET LOCAL ${SCOPE_CHANTIERS} = ${lit(chantiers === '*' ? '*' : chantiers.join(','))}`);
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${JEV_COCKPIT_ROLE}`);
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${JEV_SQL_TIMEOUT_MS}`);
        await tx.$executeRawUnsafe(`SET LOCAL search_path = ${JEV_COCKPIT_SCHEMA}`);
        return tx.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM (\n${body}\n) AS jev_requete LIMIT ${JEV_SQL_MAX_ROWS + 1}`);
      },
      { timeout: JEV_SQL_TIMEOUT_MS + 5000 },
    );
  }

  private nowParis(): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' }).format(this.today.now());
  }
}

/** Message de PostgreSQL sans l'enveloppe de Prisma (renvoyé au modèle pour correction). */
export function dbMessage(e: unknown): string {
  const any = e as { meta?: { message?: string }; message?: string };
  const raw = any?.meta?.message ?? any?.message ?? 'erreur inconnue';
  const m = raw.match(/Message: `([\s\S]*?)`/);
  return (m ? m[1] : raw).replace(/\s+/g, ' ').trim().slice(0, 300);
}
