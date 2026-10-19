/**
 * Notifications : requête sans résultat et explication inventée (incident du 19/10/2026, `docs/DECISIONS.md`).
 *
 * Cas réel : consigne « les risques en cours et les décisions à prendre pour les couvrir » ; le modèle a écrit une
 * requête qui exigeait une décision en cours pour chaque risque. Sans décision en cours sur le projet, elle n'a rendu
 * aucune ligne, et le modèle a rédigé « vérifiez votre habilitation PMO » alors que les droits étaient corrects.
 */

/** Requête sans aucune ligne : une seule nouvelle requête, plus large, est demandée au modèle. */
export const EMPTY_RESULT_RETRIES = 1;

/** Consigne de la nouvelle requête, quand la première n'a rendu aucune ligne. */
export function emptyRetryPrompt(prompt: string, sql: string): string {
  return [
    prompt,
    '',
    '## Requête sans résultat',
    '```sql',
    sql,
    '```',
    'Cette requête n’a renvoyé aucune ligne. Elle est sans doute trop restrictive. Écris une requête plus large :',
    '- pars de l’objet principal de la consigne (par exemple les risques) et rattache les données associées (décisions, actions, jalons…) par LEFT JOIN, jamais par une jointure qui exige qu’elles existent ;',
    '- ne garde que les filtres que la consigne demande explicitement ;',
    '- ne filtre ni sur le projet ni sur les droits : les vues ne contiennent déjà que ce que les destinataires peuvent lire.',
    'Réponds uniquement par la requête, dans un bloc ```sql```.',
  ].join('\n');
}

/**
 * Consigne de rédaction quand les résultats sont vides ou que les données n'ont pas pu être lues : les droits des
 * destinataires sont appliqués par le serveur avant la requête ; un résultat vide ne dit rien d'eux.
 */
export const NO_ACCESS_SPECULATION = 'N’avance aucune cause à l’absence de données : jamais de droits, d’habilitation, d’accès, de restriction, de filtre, de paramètre ou d’identifiant à vérifier. Les droits des destinataires sont déjà appliqués par le serveur.';

/** Texte de repli quand le modèle invoque malgré tout les droits sur un résultat vide. */
export const NO_MATCH_TEXT = 'Aucune donnée du projet ne correspond à cette demande aujourd’hui.\n\n## À faire\n1. Consulter le détail dans le Cockpit.';

/** Le texte attribue l'absence de données aux droits ou à la configuration (formulations constatées et voisines). */
const ACCESS_BLAME = [
  /habilitations?/i,
  /droits? d['’]acc[eè]s/i,
  /(restriction|restreint|contr[oô]le|probl[eè]me|d[ée]faut|absence) d['’]acc[eè]s/i,
  /acc[eè]s (restreint|refus[ée]|limit[ée]|insuffisant)/i,
  /(v[ée]rifie[rz]?|contr[oô]le[rz]?) (vos |votre |les |le |la )?(droits?|acc[eè]s|habilitation|profil|projet_id|identifiant)/i,
  /projet_id/i,
  /filtre (applicatif|de s[ée]curit[ée])/i,
  /aucune donn[ée]e accessible/i,
];

export function blamesAccess(text: string): boolean {
  return ACCESS_BLAME.some((r) => r.test(text));
}
