import { writeFileSync } from 'fs';
import { join } from 'path';
import { DICTIONNAIRE, DictTable, JEV_SCHEMA } from '../src/domain/jev-dictionnaire';
import { DICTIONNAIRE_COCKPIT, JEV_COCKPIT_SCHEMA } from '../src/domain/jev-dictionnaire-cockpit';

/**
 * Versions lisibles des dictionnaires des données (Console et Cockpit), pour relecture :
 * `docs/specs/JEV CONSOLE - dictionnaire des donnees.md` et `docs/specs/JEV COCKPIT - dictionnaire des donnees.md`.
 * Usage : `npm run dictionnaire:doc`.
 */
const cell = (s: string) => s.replace(/\|/g, '\|').replace(/\n/g, ' ');

function render(titre: string, source: string, schema: string, fiches: DictTable[], note: string): string {
  const out: string[] = [
    `# ${titre} — dictionnaire des données`,
    '',
    `> Généré depuis \`backend/src/domain/${source}\` (\`npm run dictionnaire:doc\`) : ne pas modifier à la main.`,
    `> ${fiches.length} vues en lecture seule du schéma \`${schema}\`, chargées dans \`dictionnaire_tables\` et \`dictionnaire_colonnes\`.`,
    `> ${note}`,
    '',
    '## Sommaire',
    '',
    ...fiches.map((f) => `- [\`${schema}.${f.nom}\`](#${f.nom}) — ${f.colonnes.length} colonnes`),
    '',
  ];
  for (const f of fiches) {
    out.push(`## ${f.nom}`, '', f.description, '', '| Colonne | Type | Signification | Exemples, unités |', '|---|---|---|---|');
    for (const c of f.colonnes) out.push(`| \`${c.nom}\` | ${c.type} | ${cell(c.signification)} | ${cell(c.exemples ?? '')} |`);
    out.push('');
    if (f.relations.length) out.push('**Relations**', '', ...f.relations.map((r) => `- ${r}`), '');
    if (f.usages.length) out.push('**Usages**', '', ...f.usages.map((r) => `- ${r}`), '');
    if (f.regles.length) out.push('**Règles et précautions**', '', ...f.regles.map((r) => `- ${r}`), '');
  }
  return out.join('\n');
}

const docs = join(__dirname, '../../docs/specs');
writeFileSync(join(docs, 'JEV CONSOLE - dictionnaire des donnees.md'), render('Jev de la Console', 'jev-dictionnaire.ts', JEV_SCHEMA, DICTIONNAIRE, 'Heures en heure de Paris. Aucun secret (empreintes de mot de passe, sessions, clés API chiffrées, chemins de stockage).'));
writeFileSync(join(docs, 'JEV COCKPIT - dictionnaire des donnees.md'), render('Cockpit', 'jev-dictionnaire-cockpit.ts', JEV_COCKPIT_SCHEMA, DICTIONNAIRE_COCKPIT, 'Dates métier en texte AAAA-MM-JJ, horodatages en heure de Paris. Chaque vue porte projet_id (et chantier_id) pour le filtrage par droits ; aucun rôle de lecture n’y a accès tant que ce filtrage n’est pas en place.'));
console.log('Écrit : docs/specs/JEV CONSOLE - dictionnaire des donnees.md, docs/specs/JEV COCKPIT - dictionnaire des donnees.md');
