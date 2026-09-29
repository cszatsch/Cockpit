import { PrismaClient } from '@prisma/client';
import { DICTIONNAIRE, DictTable } from '../../src/domain/jev-dictionnaire';
import { DICTIONNAIRE_COCKPIT } from '../../src/domain/jev-dictionnaire-cockpit';

/** Espaces du dictionnaire : Console (vues `jev`) et Cockpit (vues `jev_cockpit`). */
export const ESPACES: Array<{ espace: 'console' | 'cockpit'; fiches: DictTable[] }> = [
  { espace: 'console', fiches: DICTIONNAIRE },
  { espace: 'cockpit', fiches: DICTIONNAIRE_COCKPIT },
];

/**
 * Charge le dictionnaire des données (`src/domain/jev-dictionnaire*.ts`) dans `dictionnaire_tables` et
 * `dictionnaire_colonnes`, pour la Console et le Cockpit : remplace tout le contenu (idempotent).
 * Appelé par l'amorçage ; seul : `npm run dictionnaire:charger`.
 */
export async function seedDictionnaire(db: PrismaClient, by = 'Chargement initial'): Promise<Record<string, number>> {
  await db.$transaction(async (tx) => {
    await tx.dictionnaireColonne.deleteMany();
    await tx.dictionnaireTable.deleteMany();
    for (const { espace, fiches } of ESPACES) {
      for (const [i, t] of fiches.entries()) {
        await tx.dictionnaireTable.create({
          data: {
            espace, nom: t.nom, description: t.description, relations: t.relations.join('\n'), usages: t.usages.join('\n'), regles: t.regles.join('\n'),
            position: i, modifiePar: by,
            colonnes: { create: t.colonnes.map((c, j) => ({ nom: c.nom, type: c.type, signification: c.signification, exemplesUnites: c.exemples ?? null, position: j })) },
          },
        });
      }
    }
  }, { timeout: 60_000 });
  return Object.fromEntries(ESPACES.map((e) => [e.espace, e.fiches.length]));
}

if (require.main === module) {
  const db = new PrismaClient();
  seedDictionnaire(db)
    .then((n) => console.log(`Dictionnaire chargé : ${Object.entries(n).map(([k, v]) => `${v} fiches ${k}`).join(', ')}`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
