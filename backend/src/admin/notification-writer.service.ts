import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { LlmResult, LlmService } from '../core/llm.service';
import { TodayService } from '../core/today.service';
import { extractSql, formatRows, JEV_SQL_MAX_ROWS, JEV_SQL_RETRIES, looksLikeSql, renderDictionary, SQL_CUT_REASON, sqlCut, sqlError, sqlInstructions, viewsUsed } from '../domain/jev-sql';
import { JEV_COCKPIT_SCHEMA } from '../domain/jev-dictionnaire-cockpit';
import { AudienceProfile, ChantierScope } from '../domain/notification-rules';
import { dbMessage, JevSqlService } from './jev-sql.service';

/** Destinataires d'un texte : un profil et les chantiers lisibles par tous ses membres. */
export interface Audience {
  profile: AudienceProfile;
  chantiers: ChantierScope;
}

export interface WrittenText {
  text: string;
  tokens: number;
  costEur: number;
  /** Vues consultées (journal) ; requête exécutée. */
  sources: string[];
  sql: string | null;
}

const PROFILE_NAME: Record<AudienceProfile, string> = { admin: 'Administrateur', pmo: 'PMO', resp: 'Responsable', lec: 'Lecteur' };

/**
 * Consignes de la rédaction d'une notification à partir des résultats (texte inséré dans le message à la place de
 * {reponse_llm}). Mise en forme (30/09/2026) : Markdown léger que le tiroir du Cockpit met en page (rubriques, chiffres
 * clés, étapes) et que l'e-mail reçoit en texte propre (`mailText`).
 */
export const NOTIFICATION_ANSWER_INSTRUCTIONS = [
  '## Rédaction à partir des données',
  'La consigne a été traduite en requête SQL, exécutée sur les données du projet que les destinataires ont le droit de lire. Rédige le contenu à partir des résultats, et d’eux seuls :',
  '- N’invente aucune valeur. Si les résultats sont vides, dis simplement qu’aucune donnée ne correspond. S’ils sont tronqués, dis-le.',
  '- Traduis les codes d’après le dictionnaire (DONE = terminé…) ; ne montre pas la requête SQL.',
  '- Respecte la longueur et le ton demandés par la consigne ; sois bref et précis, chaque phrase apporte une information.',
  '- Mise en forme : commence par une phrase qui donne l’essentiel. Puis, si utile, 2 ou 3 rubriques introduites par « ## » suivi d’un titre court. Dans une liste de constats, fais commencer chaque puce « - » par le chiffre clé (ex. « - 3 risques critiques (criticité ≥ 20) »). Pour des actions, liste numérotée « 1. ». **Gras** pour un ou deux éléments décisifs au plus.',
  '- Pas de titre « # » (le message a déjà un objet), pas de tableau, pas de formule de politesse.',
].join('\n');

/** Consigne jointe à l'envoi précédent (mémoire de la rédaction). */
/** Texte envoyé si le modèle ne produit qu'une requête au lieu d'un contenu rédigé (jamais de SQL dans une notification). */
export const NO_DATA_TEXT = 'Les données du projet n’ont pas pu être analysées pour cet envoi : consultez le détail dans le Cockpit.';
export const PREVIOUS_SEND_INSTRUCTIONS = 'Compare avec les données actuelles : dis d’abord ce qui a changé depuis cet envoi (écarts, nouveautés, points réglés, avec la date de l’envoi précédent), sans répéter à l’identique ce qui n’a pas changé. N’annonce aucune évolution que les données ne montrent pas ; si rien n’a changé, dis-le en une phrase.';

/**
 * Rédaction du contenu d'une alerte ou d'une notification par le modèle de la règle (évolution du 29/09/2026),
 * selon les étapes du guide console : 1. le modèle analyse la consigne ; 2. il repère dans le dictionnaire des données
 * du Cockpit les vues et colonnes utiles ; 3. il écrit la requête SQL ; 4. le serveur l'exécute, en lecture seule, sur
 * le périmètre des destinataires (un texte par profil) ; 5. le modèle rédige le contenu à partir des résultats.
 * Sans projet (règle de plateforme), le modèle rédige sans lire de données.
 */
@Injectable()
export class NotificationWriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly jevSql: JevSqlService,
    private readonly today: TodayService,
  ) {}

  base(audience: Audience, projectCode: string | null): string {
    return [
      `Tu rédiges le contenu d’une notification de la plateforme RISE (pilotage de projets de transformation), envoyée aux utilisateurs de profil ${PROFILE_NAME[audience.profile]}${projectCode ? ` du projet ${projectCode}` : ''}.`,
      'Méthode : 1. analyse la consigne ; 2. repère dans le dictionnaire des données les vues et colonnes utiles ; 3. écris la requête SQL ; le serveur l’exécute et te renvoie les résultats ; 4. rédige le contenu à partir des résultats.',
      'Le contenu est inséré tel quel dans le message envoyé : texte brut, en français, sans titre ni Markdown ni formule de politesse.',
    ].join('\n');
  }

  scopeLine(a: Audience): string {
    if (a.chantiers === '*') return 'Périmètre des destinataires : tout le projet (toutes les vues, tous les chantiers).';
    if (!a.chantiers.length) return 'Périmètre des destinataires : aucun chantier commun ; seules les données du projet non rattachées à un chantier sont lisibles (les lignes des chantiers sont absentes des vues).';
    return `Périmètre des destinataires : les chantiers ${a.chantiers.join(', ')} (chantier_id) ; les lignes des autres chantiers sont absentes des vues.`;
  }

  /**
   * `previous` : dernier envoi de la règle au même profil (mémoire, décision du 30/09/2026) ; le modèle dit ce qui a
   * changé depuis au lieu de répéter le même texte. Il part, avec la date et l'heure, dans la partie variable du prompt ;
   * la partie stable est marquée pour le cache.
   */
  async write(rule: { modelId: string }, prompt: string, project: { id: string; code: string } | null, audience: Audience, previous?: { at: Date; text: string } | null): Promise<WrittenText> {
    const calls: LlmResult[] = [];
    const tail = [
      `## Contexte de l’envoi\nDate du jour de la plateforme : ${this.today.today()}. Maintenant (heure de Paris) : ${this.nowParis()}.`,
      ...(previous ? [`## Envoi précédent de cette notification (${new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long' }).format(previous.at)})\n${previous.text}\n\n${PREVIOUS_SEND_INSTRUCTIONS}`] : []),
    ].join('\n\n');
    const call = async (p: string, system: string, extra = '') => {
      const r = await this.llm.completeWithModelLive(rule.modelId, { functionId: 'insights', prompt: p, system, systemTail: extra ? `${tail}\n\n${extra}` : tail, cache: true, projectId: project?.id ?? null, source: 'NOTIFICATION', maxWords: 150 });
      calls.push(r);
      return r;
    };
    const out = (text: string, sources: string[] = [], sql: string | null = null): WrittenText => ({
      text: text.trim(),
      tokens: calls.reduce((n, c) => n + c.tokensIn + c.tokensOut, 0),
      costEur: calls.reduce((n, c) => n + c.costEur, 0),
      sources,
      sql,
    });
    const base = this.base(audience, project?.code ?? null);
    if (!project) return out((await call(prompt, `${base}\nAucune donnée de projet n’est lisible pour cette règle de plateforme : rédige à partir de la consigne seule.`)).text);

    // 1-3. Analyse, dictionnaire, requête (ou réponse directe si la consigne ne demande pas de données).
    const tables = await this.prisma.dictionnaireTable.findMany({ where: { espace: 'cockpit', actif: true }, include: { colonnes: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } });
    const system = `${base}\n\n${sqlInstructions(renderDictionary(tables, JEV_COCKPIT_SCHEMA), null, null, {
      title: 'Données du Cockpit',
      schema: JEV_COCKPIT_SCHEMA,
      topics: 'planning, chantiers, jalons, livrables, risques, actions, décisions, comités, équipes…',
      direct: 'Si la consigne ne demande aucune donnée, rédige directement le contenu, sans SQL.',
      scope: `Les vues ne contiennent que le projet ${project.code}. ${this.scopeLine(audience)}`,
    })}`;
    const first = await call(prompt, system);
    let sql = extractSql(first.text);
    // Requête coupée ou mal balisée (correction du 30/09/2026) : jamais envoyée telle quelle, elle est réécrite.
    let cut = sqlCut(first.text);
    if (sql === null && !looksLikeSql(first.text)) return out(first.text);

    // 4. Exécution sur le périmètre des destinataires, une correction au plus.
    let rows: Array<Record<string, unknown>> | null = null;
    let why = '';
    for (let attempt = 0; ; attempt++) {
      why = cut ? SQL_CUT_REASON : sql ? sqlError(sql) ?? '' : 'aucune requête dans la réponse';
      if (!why) {
        try {
          rows = await this.jevSql.executeCockpit(sql!, project.id, audience.chantiers);
          break;
        } catch (e) {
          why = dbMessage(e);
        }
      }
      if (attempt >= JEV_SQL_RETRIES) break;
      const fix = await call(`${prompt}\n\n## Requête à corriger\n\`\`\`sql\n${sql ?? ''}\n\`\`\`\nMotif du refus ou de l’échec : ${why}\nRéponds uniquement par la requête corrigée, dans un bloc \`\`\`sql\`\`\`.`, system);
      sql = extractSql(fix.text);
      cut = sqlCut(fix.text);
    }
    if (!rows) {
      const plain = await call(prompt, `${base}\nLes données du projet n’ont pas pu être lues (${why}) : rédige sans aucun chiffre ni fait précis, et signale que le détail est à consulter dans le Cockpit.`);
      return out(looksLikeSql(plain.text) ? NO_DATA_TEXT : plain.text, [], sql);
    }

    // 5. Rédaction à partir des résultats.
    const sources = viewsUsed(sql!.replace(new RegExp(`${JEV_COCKPIT_SCHEMA}\\s*\\.`, 'gi'), ''), tables.map((t) => t.nom));
    const used = tables.filter((t) => sources.includes(t.nom));
    const res = formatRows(rows);
    const head = `## Résultats de la requête (${res.count} ligne(s)${res.truncated ? `, tronqués aux ${JEV_SQL_MAX_ROWS} premières` : ''})`;
    const answer = await call(`${prompt}\n\n${head}\n${res.text}`, `${base}\n\n${NOTIFICATION_ANSWER_INSTRUCTIONS}`, `## Dictionnaire des vues consultées\n${renderDictionary(used, JEV_COCKPIT_SCHEMA)}`);
    return out(looksLikeSql(answer.text) ? NO_DATA_TEXT : answer.text, sources, sql);
  }

  private nowParis(): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' }).format(this.today.now());
  }
}
