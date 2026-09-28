import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { renderPdf } from '../../src/core/pdf';

const R = '/api/projects/RISE';

describe('Étape 10 — documents, commentaires, historique, Jev, services externes', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('dépôt d’un document : formats acceptés, extraction asynchrone, téléchargement', async () => {
    const token = await t.token(WHO.pmo);
    const http = () => request(t.app.getHttpServer());
    await http().post(`${R}/documents`).set('Authorization', `Bearer ${token}`).attach('file', Buffer.from('x'), 'virus.exe').expect(400);
    const pdf = renderPdf('CR du COPIL', ['ligne 1', 'ligne 2']);
    const up = await http().post(`${R}/documents`).set('Authorization', `Bearer ${token}`).field('type', 'Compte rendu').attach('file', pdf, 'CR COPIL 20.pdf').expect(201);
    expect(up.body).toMatchObject({ n: 'CR COPIL 20', type: 'Compte rendu', src: 'UPLOADED', ext: 'PENDING', conf: 'INTERNAL' });
    // Tâches exécutées immédiatement en test : l'extraction est terminée.
    const doc = await t.db.document.findUnique({ where: { id: up.body.id } });
    expect(doc).toMatchObject({ ext: 'SUCCEEDED', pages: 1 });
    const dl = await http().get(`${R}/documents/${up.body.id}/file`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(dl.body.slice(0, 5).toString()).toBe('%PDF-');
    // Chaîne Documents : une ligne de consommation par étape (vectorisation, reclassement à la requête, synthèse).
    const recent = { at: { gte: new Date(Date.now() - 60_000) } };
    const steps = await t.db.usageRecord.findMany({ where: { ...recent, functionId: { in: ['doc_vec', 'doc_rrk', 'doc_syn'] } } });
    expect(steps.map((u) => u.functionId).sort()).toEqual(['doc_rrk', 'doc_syn', 'doc_vec']);
    expect(steps.find((u) => u.functionId === 'doc_rrk')).toMatchObject({ requests: 1, tokensIn: 0, costEur: 1.85 / 1000 });
    expect(steps.find((u) => u.functionId === 'doc_vec')!.tokensOut).toBe(0);
    const links = await (await t.as(WHO.pmo)).put(`${R}/documents/${up.body.id}/links`, { links: [{ entityType: 'RISK', entityId: 'R01' }] }).expect(200);
    expect(links.body.links).toEqual([{ entityType: 'RISK', entityId: 'R01' }]);
    // Un Lecteur consulte mais ne dépose pas.
    const lec = await t.token(WHO.lecteurC3);
    await http().post(`${R}/documents`).set('Authorization', `Bearer ${lec}`).attach('file', pdf, 'x.pdf').expect(403);
  });

  it('documents restreints : réservés aux profils globaux', async () => {
    const pmo = await (await t.as(WHO.pmo)).get(`${R}/documents`).expect(200);
    const lec = await (await t.as(WHO.lecteurC3)).get(`${R}/documents`).expect(200);
    expect(pmo.body.some((d: any) => d.conf === 'RESTRICTED')).toBe(true);
    expect(lec.body.some((d: any) => d.conf === 'RESTRICTED')).toBe(false);
  });

  it('commentaires : sur un objet lisible uniquement ; résolution', async () => {
    const lec = await t.as(WHO.lecteurC3);
    await lec.post(`${R}/comments`, { entityType: 'RISK', entityId: 'R01', field: 'plan', text: 'x' }).expect(404);
    const c = await lec.post(`${R}/comments`, { entityType: 'RISK', entityId: 'R03', field: 'plan', text: 'Plan attendu au COPIL' }).expect(201);
    expect(c.body).toMatchObject({ authorId: 'p04', authorName: 'Philippe Aubert', resolved: false });
    const r = await lec.patch(`${R}/comments/${c.body.id}`, { resolved: true }).expect(200);
    expect(r.body.resolved).toBe(true);
    const list = await (await t.as(WHO.pmo)).get(`${R}/comments?entityType=RISK&entityId=R03`).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('commentaires : clé de cellule du Cockpit (onglet|libellé|colonne) jusqu’à 200 caractères', async () => {
    const pmo = await t.as(WHO.pmo);
    const key = 'risques|' + 'R03 · '.padEnd(70, 'x') + '|2';
    const c = await pmo.post(`${R}/comments`, { entityType: 'RISK', entityId: 'R03', field: key, text: 'Clé longue' }).expect(201);
    expect(c.body.field).toBe(key);
    await pmo.post(`${R}/comments`, { entityType: 'RISK', entityId: 'R03', field: 'x'.repeat(201), text: 'Trop long' }).expect(400);
  });

  it('historique d’un objet (§ 9.9)', async () => {
    const c = await t.as(WHO.pmo);
    await c.patch(`${R}/risks/R05`, { p: 3 }).expect(200);
    const h = await c.get(`${R}/audit?entityType=RISK&entityId=R05&field=p`).expect(200);
    expect(h.body[0]).toMatchObject({ field: 'p', oldValue: 4, newValue: 3, authorId: 'p01', origin: 'MANUAL', profileUsed: 'PMO' });
    await c.get(`${R}/audit`).expect(400);
  });

  it('Jev propose, l’utilisateur valide ; origine JEV ; jamais sur le Référentiel', async () => {
    const c = await t.as(WHO.respC5);
    const m = await c.post(`${R}/assistant/messages`, { context: { space: 'pilotage', tab: 'actions' }, text: 'Passe A-41 en terminée' }).expect(200);
    expect(m.body.proposedChanges).toHaveLength(1);
    expect(m.body.proposedChanges[0]).toMatchObject({ entityType: 'ACTION', entityId: 'A-41', patch: { status: 'DONE' } });
    // Rien n'est enregistré avant validation.
    expect((await t.db.action.findUnique({ where: { id: 'A-41' } }))!.status).toBe('IN_PROGRESS');
    const ok = await c.post(`${R}/assistant/changes/${m.body.proposedChanges[0].id}/confirm`).expect(200);
    expect(ok.body.result.status).toBe('DONE');
    const a = await t.db.auditEntry.findFirst({ where: { entityType: 'ACTION', entityId: 'A-41', field: 'status' } });
    expect(a!.origin).toBe('JEV');
    await c.post(`${R}/assistant/changes/${m.body.proposedChanges[0].id}/reject`).expect(409);
    // Mêmes droits qu'une saisie manuelle : A-42 (C1) hors de ses chantiers.
    const m2 = await c.post(`${R}/assistant/messages`, { context: { space: 'pilotage', tab: 'actions' }, text: 'Passe A-42 en terminée' }).expect(200);
    expect(m2.body.proposedChanges).toHaveLength(0);
    const ref = await (await t.as(WHO.pmo)).post(`${R}/assistant/messages`, { context: { space: 'projet', tab: 'referentiel' }, text: 'Passe A-47 en terminée' }).expect(200);
    expect(ref.body.proposedChanges).toHaveLength(0);
    expect(ref.body.reply).toMatch(/ne modifie ni le Référentiel/);
  });

  it('demande d’activation de module (Cockpit) et demande d’invitation (Q8 bis)', async () => {
    const c = await t.as(WHO.pmo);
    const r = await c.post(`${R}/module-requests`, { moduleId: 'bud' }).expect(201);
    expect(r.body.status).toBe('PENDING');
    const mods = await c.get(`${R}/modules`).expect(200);
    expect(mods.body.find((m: any) => m.id === 'bud')).toMatchObject({ active: false, pendingRequest: true });
    const inv = await c.post(`${R}/invitation-requests`, { personId: 'p12' }).expect(201);
    expect(inv.body).toMatchObject({ status: 'ALREADY_HAS_ACCOUNT' });
    const p = await c.post(`${R}/persons`, { firstName: 'Nora', lastName: 'Blanc', email: 'nora.blanc@example.com', teamId: 't10' }).expect(201);
    const inv2 = await c.post(`${R}/invitation-requests`, { personId: p.body.id }).expect(201);
    expect(inv2.body.status).toBe('PENDING');
  });

  it('proxy météo / actualités : 503 hors ligne', async () => {
    const c = await t.as(WHO.pmo);
    const r = await c.get(`${R}/external/weather?city=Grigny`).expect(503);
    expect(r.body.code).toBe('EXTERNAL_UNAVAILABLE');
  });
});
