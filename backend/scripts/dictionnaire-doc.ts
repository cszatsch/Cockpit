import { writeFileSync } from 'fs';
import { join } from 'path';
import { DICTIONNAIRE, JEV_SCHEMA } from '../src/domain/jev-dictionnaire';

/**
 * Version lisible du dictionnaire des données du Jev de la Console, pour relecture :
 * `docs/specs/JEV CONSOLE - dictionnaire des donnees.md`. Usage : `npm run dictionnaire:doc`.
 */
const cell = (s: string) => s.replace(/\|/g, '\|').replace(/\n/g, ' ');
const out: string[] = [
  '# Jev de la Console — dictionnaire des données',
  '',
  `> Généré depuis \`backend/src/domain/jev-dictionnaire.ts\` (\`npm run dictionnaire:doc\`) : ne pas modifier à la main.`,
  `> ${DICTIONNAIRE.length} vues en lecture seule du schéma \`${JEV_SCHEMA}\`, chargées dans \`dictionnaire_tables\` et \`dictionnaire_colonnes\`.`,
  '> Heures en heure de Paris. Aucun secret (empreintes de mot de passe, sessions, clés API chiffrées, chemins de stockage).',
  '',
  '## Sommaire',
  '',
  ...DICTIONNAIRE.map((f) => `- [\`${JEV_SCHEMA}.${f.nom}\`](#${f.nom.replace(/_/g, '_')}) — ${f.colonnes.length} colonnes`),
  '',
];
for (const f of DICTIONNAIRE) {
  out.push(`## ${f.nom}`, '', f.description, '', '| Colonne | Type | Signification | Exemples, unités |', '|---|---|---|---|');
  for (const c of f.colonnes) out.push(`| \`${c.nom}\` | ${c.type} | ${cell(c.signification)} | ${cell(c.exemples ?? '')} |`);
  out.push('');
  if (f.relations.length) out.push('**Relations**', '', ...f.relations.map((r) => `- ${r}`), '');
  if (f.usages.length) out.push('**Usages**', '', ...f.usages.map((r) => `- ${r}`), '');
  if (f.regles.length) out.push('**Règles et précautions**', '', ...f.regles.map((r) => `- ${r}`), '');
}
writeFileSync(join(__dirname, '../../docs/specs/JEV CONSOLE - dictionnaire des donnees.md'), out.join('\n'));
console.log('Écrit : docs/specs/JEV CONSOLE - dictionnaire des donnees.md');
