import { PrismaClient } from '@prisma/client';
import { hashPassword } from './password';
import { passwordRules } from './policy';

/** Compte initial (spécification AUTH) : administrateur de la plateforme et PMO de l'application. */
export const INITIAL_ADMIN = {
  id: 'u-initial',
  email: 'c.schmitz@groupeonepoint.com',
  fullName: 'Cédric Schmitz',
} as const;

/** Variable d'environnement qui porte le mot de passe provisoire (jamais écrit dans le code ni les journaux). */
export const INITIAL_PASSWORD_ENV = 'RISE_INITIAL_ADMIN_PASSWORD';

export type InitialAdminResult = 'created' | 'exists' | 'missing-password' | 'weak-password';

/**
 * Crée le compte initial : mot de passe provisoire haché (Argon2id) avec changement obligatoire à la
 * première connexion, droit d'administration de la plateforme, profil PMO sur chaque projet existant.
 * Ne fait rien si la variable est absente, si le mot de passe ne respecte pas les règles ou si le compte existe.
 */
export async function createInitialAdmin(db: PrismaClient, password = process.env[INITIAL_PASSWORD_ENV]): Promise<InitialAdminResult> {
  if (!password) return 'missing-password';
  if (await db.account.findFirst({ where: { OR: [{ id: INITIAL_ADMIN.id }, { email: INITIAL_ADMIN.email }] } })) return 'exists';
  if (!passwordRules(password).every((r) => r.ok)) return 'weak-password';
  const passwordHash = await hashPassword(password);
  const projects = await db.project.findMany({ select: { id: true } });
  await db.$transaction(async (tx) => {
    await tx.account.create({
      data: {
        id: INITIAL_ADMIN.id,
        email: INITIAL_ADMIN.email,
        fullName: INITIAL_ADMIN.fullName,
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: true,
        projects: { create: projects.map((p) => ({ projectId: p.id })) },
      },
    });
    await tx.adminGrant.create({ data: { accountId: INITIAL_ADMIN.id } });
    for (const p of projects) {
      await tx.habilitation.create({ data: { id: `hab-${INITIAL_ADMIN.id}-${p.id}`, projectId: p.id, accountId: INITIAL_ADMIN.id, profile: 'PMO' } });
    }
    await tx.auditEntry.create({
      data: {
        accountId: null,
        actorName: 'Système',
        origin: 'SYSTEM',
        action: 'Création du compte initial',
        target: `${INITIAL_ADMIN.fullName} · Administrateur · PMO`,
        severity: 'SENSITIVE',
        entityType: 'Account',
        entityId: INITIAL_ADMIN.id,
      },
    });
  });
  return 'created';
}
