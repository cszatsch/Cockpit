import { setup, TestCtx, WHO } from '../helpers';

const R = '/api/projects/RISE';
const A = '/api/admin';

/** Audit de sécurité du 18/10/2026, lot 6 : les droits d'une personne du référentiel ne suivent plus son e-mail. */
describe('Audit 18/10/2026 — habilitations et e-mail des personnes', () => {
  let t: TestCtx;
  const U = 'acc-audit-cible';
  beforeAll(async () => {
    t = await setup();
    await t.db.account.create({ data: { id: U, email: 'cible.audit@example.com', fullName: 'Compte cible', status: 'ACTIVE' } });
  });
  afterAll(() => t.close());

  it('un PMO qui change l’e-mail d’une personne habilitée ne donne aucun droit au compte de la nouvelle adresse', async () => {
    const pmo = await t.as(WHO.pmo);
    const target = await t.as({ accountId: U });
    await target.get(`${R}/bootstrap`).expect(404);
    // Personne rattachée à un compte (Responsable de C5) : l'adresse change, le rattachement et les droits restent.
    const p06 = await t.db.person.findUniqueOrThrow({ where: { id: 'p06' } });
    expect(p06.accountId).toBeTruthy();
    await pmo.patch(`${R}/persons/p06`, { email: 'cible.audit@example.com' }).expect(200);
    await target.get(`${R}/bootstrap`).expect(404);
    await (await t.as(WHO.respC5)).get(`${R}/bootstrap`).expect(200);
    // Écart signalé à l'Administrateur (« À traiter »), qui ne peut pas l'appliquer : l'adresse est celle d'un autre compte.
    const admin = await t.as(WHO.admin);
    const alert = (await admin.get(`${A}/overview`).expect(200)).body.attention.find((x: any) => x.kind === 'EMAIL_MISMATCH');
    expect(alert.ids).toContain(p06.accountId);
    await admin.post(`${A}/accounts/${p06.accountId}/referential-email`).expect(409);
    await pmo.patch(`${R}/persons/p06`, { email: p06.email }).expect(200);

    // Personne habilitée sans compte : son adresse mise sur celle d'un compte existant ne lui ouvre rien non plus.
    await t.db.person.create({ data: { id: 'p-audit-pmo', projectId: 'RISE', firstName: 'Pia', lastName: 'Sanscompte', email: 'pia.sanscompte@example.com' } });
    await t.db.habilitation.create({ data: { id: 'hab-audit-pmo', projectId: 'RISE', personId: 'p-audit-pmo', profile: 'PMO' } });
    await pmo.patch(`${R}/persons/p-audit-pmo`, { email: 'cible.audit@example.com' }).expect(200);
    await target.get(`${R}/bootstrap`).expect(404);
    expect((await t.db.person.findUniqueOrThrow({ where: { id: 'p-audit-pmo' } })).accountId).toBeNull();
  });

  it('le rattachement n’est posé que par l’Administrateur (habilitations de la Console)', async () => {
    const admin = await t.as(WHO.admin);
    const ws = await t.db.workstream.findFirstOrThrow({ where: { projectId: 'RISE', code: 'C3' } });
    await admin.put(`${A}/accounts/${U}/habilitations`, { admin: false, projects: [{ code: 'RISE', pmo: false, responsable: [], lecteur: [ws.id] }] }).expect(200);
    expect((await t.db.person.findUniqueOrThrow({ where: { id: 'p-audit-pmo' } })).accountId).toBe(U);
    const b = (await (await t.as({ accountId: U })).get(`${R}/bootstrap`).expect(200)).body;
    expect(b).toBeTruthy();
  });
});
