import { PrismaClient } from '@prisma/client';
import { DICTIONNAIRE } from '../../src/domain/jev-dictionnaire';

/**
 * Charge le dictionnaire des données du Jev de la Console (`src/domain/jev-dictionnaire.ts`) dans
 * `dictionnaire_tables` et `dictionnaire_colonnes` : remplace tout le contenu (idempotent).
 * Appelé par l'amorçage ; seul : `npm run dictionnaire:charger`.
 */
export async function seedDictionnaire(db: PrismaClient, by = 'Chargement initial'): Promise<number> {
  await db.$transaction(async (tx) => {
    await tx.dictionnaireColonne.deleteMany();
    await tx.dictionnaireTable.deleteMany();
    for (const [i, t] of DICTIONNAIRE.entries()) {
      await tx.dictionnaireTable.create({
        data: {
          nom: t.nom, description: t.description, relations: t.relations.join('\n'), usages: t.usages.join('\n'), regles: t.regles.join('\n'),
          position: i, modifiePar: by,
          colonnes: { create: t.colonnes.map((c, j) => ({ nom: c.nom, type: c.type, signification: c.signification, exemplesUnites: c.exemples ?? null, position: j })) },
        },
      });
    }
  });
  return DICTIONNAIRE.length;
}

if (require.main === module) {
  const db = new PrismaClient();
  seedDictionnaire(db)
    .then((n) => console.log(`Dictionnaire chargé : ${n} fiches`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
