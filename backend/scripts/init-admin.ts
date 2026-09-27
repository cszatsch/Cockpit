/**
 * Création du compte initial (Cédric Schmitz, administrateur et PMO).
 *
 *   RISE_INITIAL_ADMIN_PASSWORD='…' npm run init:admin
 *
 * Le mot de passe provisoire est lu dans la variable d'environnement, haché aussitôt (Argon2id) et
 * jamais affiché ; il devra être changé à la première connexion. Le script refuse de s'exécuter si
 * la variable est absente ou si le compte existe déjà.
 *
 *   npm run init:admin -- --etat    code de sortie 0 si le compte existe, 2 sinon (script de démarrage)
 */
import { PrismaClient } from '@prisma/client';
import { createInitialAdmin, INITIAL_ADMIN, INITIAL_PASSWORD_ENV } from '../src/core/auth/initial-admin';
import { PASSWORD_MIN_LENGTH } from '../src/core/auth/policy';

async function main(): Promise<number> {
  const db = new PrismaClient();
  try {
    if (process.argv.includes('--etat')) {
      return (await db.account.findUnique({ where: { email: INITIAL_ADMIN.email } })) ? 0 : 2;
    }
    const result = await createInitialAdmin(db);
    switch (result) {
      case 'created':
        console.log(`Compte initial créé : ${INITIAL_ADMIN.email} (administrateur, PMO). Changement du mot de passe exigé à la première connexion.`);
        return 0;
      case 'exists':
        console.error(`Refusé : le compte ${INITIAL_ADMIN.email} existe déjà.`);
        return 1;
      case 'missing-password':
        console.error(`Refusé : la variable d'environnement ${INITIAL_PASSWORD_ENV} est absente.`);
        return 1;
      case 'weak-password':
        console.error(`Refusé : le mot de passe provisoire doit compter ${PASSWORD_MIN_LENGTH} caractères minimum, avec majuscule, minuscule, chiffre et caractère spécial.`);
        return 1;
    }
  } finally {
    await db.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
