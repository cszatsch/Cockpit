import { PrismaClient } from '@prisma/client';
import { ESPACES, seedDictionnaire } from '../../src/core/dictionary-sync';

/**
 * Charge le dictionnaire des données dans `dictionnaire_tables` et `dictionnaire_colonnes` (le chargeur est dans
 * `src/core/dictionary-sync.ts` : l'API le rejoue elle-même au démarrage dès que la base diffère du code).
 * Appelé par l'amorçage ; seul : `npm run dictionnaire:charger`.
 */
export { ESPACES, seedDictionnaire };

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
