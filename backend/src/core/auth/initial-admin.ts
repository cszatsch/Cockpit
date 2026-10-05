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
export async function createInitialAdmin(
  db: PrismaClient,
  password = process.env[INITIAL_PASSWORD_ENV],
  /** Identité du compte (paquet d'installation, 04/10/2026 : celle saisie à l'installation). */
  who: { id: string; email: string; fullName: string } = INITIAL_ADMIN,
  /** Changement du mot de passe exigé à la première connexion (non quand la personne vient de le choisir). */
  /**
   * Changement du mot de passe exigé à la première connexion (non quand la personne vient de le choisir) ; profils
   * accordés (Partager Cockpit, 05/10/2026 : préremplissage du compte) — par défaut Administrateur et PMO.
   */
  opts: { mustChangePassword?: boolean; profiles?: string[] } = {},
): Promise<InitialAdminResult> {
  const INITIAL_ADMIN = who;
  if (!password) return 'missing-password';
  if (await db.account.findFirst({ where: { OR: [{ id: INITIAL_ADMIN.id }, { email: INITIAL_ADMIN.email }] } })) return 'exists';
  if (!passwordRules(password).every((r) => r.ok)) return 'weak-password';
  const passwordHash = await hashPassword(password);
  const profiles = opts.profiles ?? ['Administrateur', 'PMO'];
  const projects = await db.project.findMany({ select: { id: true, workstreams: { select: { id: true } } } });
  await db.$transaction(async (tx) => {
    await tx.account.create({
      data: {
        id: INITIAL_ADMIN.id,
        email: INITIAL_ADMIN.email,
        fullName: INITIAL_ADMIN.fullName,
        status: 'ACTIVE',
        passwordHash,
        mustChangePassword: opts.mustChangePassword ?? true,
        projects: { create: projects.map((p) => ({ projectId: p.id })) },
      },
    });
    if (profiles.includes('Administrateur')) await tx.adminGrant.create({ data: { accountId: INITIAL_ADMIN.id } });
    for (const p of projects) {
      if (profiles.includes('PMO')) await tx.habilitation.create({ data: { id: `hab-${INITIAL_ADMIN.id}-${p.id}`, projectId: p.id, accountId: INITIAL_ADMIN.id, profile: 'PMO' } });
      // Responsable ou Lecteur : sur chaque chantier du projet (le profil le plus fort l'emporte).
      const ws = profiles.includes('Responsable') ? 'RESPONSABLE' : profiles.includes('Lecteur') ? 'LECTEUR' : null;
      if (ws) for (const w of p.workstreams) await tx.habilitation.create({ data: { id: `hab-${INITIAL_ADMIN.id}-${p.id}-${w.id}`, projectId: p.id, accountId: INITIAL_ADMIN.id, profile: ws, wsId: w.id } });
    }
    await tx.auditEntry.create({
      data: {
        accountId: null,
        actorName: 'Système',
        origin: 'SYSTEM',
        action: 'Création du compte initial',
        target: `${INITIAL_ADMIN.fullName} · ${profiles.join(' · ')}`,
        severity: 'SENSITIVE',
        entityType: 'Account',
        entityId: INITIAL_ADMIN.id,
      },
    });
  });
  return 'created';
}
