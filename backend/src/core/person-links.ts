import { Tx } from './prisma.service';

/**
 * Rattachement des personnes du référentiel aux comptes (audit de sécurité du 18/10/2026) : les habilitations d'une
 * personne ne valent que pour le compte qui lui est rattaché (`Person.accountId`, ou `Account.personId`), jamais pour un
 * compte trouvé par l'e-mail, que le PMO peut modifier. Ce rattachement par e-mail n'est fait que lors d'une action de
 * l'Administrateur (import d'un projet par la Console, restauration, amorçage) : il fige le lien.
 */
export async function linkPersonsByEmail(db: Tx, projectId: string): Promise<number> {
  const persons = await db.person.findMany({ where: { projectId, accountId: null }, select: { id: true, email: true } });
  if (!persons.length) return 0;
  const accounts = await db.account.findMany({ where: { email: { in: persons.map((p) => p.email.trim().toLowerCase()), mode: 'insensitive' } }, select: { id: true, email: true } });
  const taken = new Set((await db.person.findMany({ where: { projectId, accountId: { not: null } }, select: { accountId: true } })).map((p) => p.accountId));
  let n = 0;
  for (const p of persons) {
    const a = accounts.find((x) => x.email.toLowerCase() === p.email.trim().toLowerCase());
    if (!a || taken.has(a.id)) continue;
    await db.person.update({ where: { id: p.id }, data: { accountId: a.id } });
    taken.add(a.id);
    n++;
  }
  return n;
}

/** Rattache une personne à un compte (décision de l'Administrateur), si elle n'est pas déjà rattachée à un autre compte. */
export async function linkPerson(db: Tx, personId: string, accountId: string): Promise<boolean> {
  const p = await db.person.findUnique({ where: { id: personId }, select: { projectId: true, accountId: true } });
  if (!p || (p.accountId && p.accountId !== accountId)) return false;
  if (p.accountId === accountId) return true;
  if (await db.person.findFirst({ where: { projectId: p.projectId, accountId }, select: { id: true } })) return false;
  await db.person.update({ where: { id: personId }, data: { accountId } });
  return true;
}
