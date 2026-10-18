import { setup, TestCtx, WHO } from '../helpers';
import { ApiCardsService } from '../../src/admin/api-cards.service';
import { SHARE_PLATFORM_HISTORY, ShareBuilder } from '../../src/admin/share-builder';
import { PROXY_USER_MISSES_MAX } from '../../src/domain/api-cards';

const R = '/api/projects/RISE';

/** Audit de sécurité du 18/10/2026, lot 3 : contournements d'autorité. */
describe('Audit 18/10/2026 — contournements d’autorité', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('documents Restreints : ni liens ni métadonnées pour qui ne les voit pas ; confidentialité réservée au PMO et à l’auteur', async () => {
    const doc = await t.db.document.create({ data: { id: 'doc-audit-r', projectId: 'RISE', n: 'Note restreinte', type: 'Note', dateIso: '2026-09-20', v: '1.0', conf: 'RESTRICTED', src: 'UPLOADED', ext: 'SUCCEEDED', mime: 'application/pdf', uploadedById: 'u1' } as any });
    const resp = await t.as(WHO.respC5);
    await resp.patch(`${R}/documents/${doc.id}`, { conf: 'INTERNAL' }).expect(404);
    await resp.put(`${R}/documents/${doc.id}/links`, { links: [{ entityType: 'PROJECT', entityId: 'RISE' }] }).expect(404);
    expect((await t.db.document.findUniqueOrThrow({ where: { id: doc.id } })).conf).toBe('RESTRICTED');
    // Document Interne : le Responsable change le titre, pas la confidentialité.
    await t.db.document.update({ where: { id: doc.id }, data: { conf: 'INTERNAL' } });
    await resp.patch(`${R}/documents/${doc.id}`, { conf: 'RESTRICTED' }).expect(403);
    await resp.patch(`${R}/documents/${doc.id}`, { n: 'Note renommée' }).expect(200);
    await (await t.as(WHO.pmo)).patch(`${R}/documents/${doc.id}`, { conf: 'RESTRICTED' }).expect(200);
  });

  it('clients : le Cockpit ne voit que le client du projet et ne crée ni ne supprime de client', async () => {
    const pmo = await t.as(WHO.pmo);
    const own = (await t.db.project.findUniqueOrThrow({ where: { id: 'RISE' } })).clientId;
    await t.db.client.create({ data: { id: 'c-audit-autre', code: 'AUDIT-AUTRE', name: 'Client d’un autre projet' } });
    const list = (await pmo.get(`${R}/clients`).expect(200)).body;
    expect((list.items ?? list).map((c: any) => c.id)).toEqual([own]);
    await pmo.get(`${R}/clients/c-audit-autre`).expect(404);
    await pmo.patch(`${R}/clients/c-audit-autre`, { name: 'Renommé' }).expect(404);
    expect((await pmo.post(`${R}/clients`, { code: 'NOUVEAU', name: 'Nouveau client' }).expect(403)).body.message).toContain('Console');
    await pmo.del(`${R}/clients/c-audit-autre`).expect(403);
    expect(await t.db.client.count({ where: { id: 'c-audit-autre' } })).toBe(1);
    // Usages du client : les autres projets ne sont pas révélés.
    const usages = (await pmo.get(`${R}/clients/${own}/usages`).expect(200)).body;
    for (const u of usages.items ?? usages) if (u.entityType === 'PROJECT') expect(u.id).toBe('RISE');
  });

  it('décisions : un Responsable ne remplace pas une décision d’un autre chantier', async () => {
    const c5 = await t.db.workstream.findFirstOrThrow({ where: { projectId: 'RISE', code: 'C5' } });
    const other = await t.db.decision.findFirstOrThrow({ where: { projectId: 'RISE', status: 'ARBITRATED', wsId: { not: c5.id, notIn: [] } } });
    expect(other.wsId).toBeTruthy();
    const resp = await t.as(WHO.respC5);
    const r = await resp.post(`${R}/decisions`, { p: 3, wsId: c5.id, bodyId: other.bodyId, t: 'Revenir sur ' + other.code, status: 'ARBITRATED', decL: 'Nouveau choix', ddIso: '2026-09-26', supersedes: other.id });
    expect([403, 404]).toContain(r.status);
    expect((await t.db.decision.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('ARBITRATED');
    // Le même envoi sans remplacement est accepté : le refus vient bien de la décision remplacée.
    await resp.post(`${R}/decisions`, { p: 3, wsId: c5.id, bodyId: other.bodyId, t: 'Décision de C5', status: 'ARBITRATED', decL: 'Nouveau choix', ddIso: '2026-09-26' }).expect(201);
  });

  it('paquet Partager Cockpit : comptes sans lien, empreintes, droits d’administration et journaux de la plateforme retirés', async () => {
    const b = new ShareBuilder() as any;
    const sent: string[] = [];
    b.pg = async () => undefined;
    b.sql = async (_db: string, s: string) => { sent.push(s); };
    await b.copyDatabase({ id: 'audit', data: 'current', projects: ['RISE'], keys: [], smtp: false, files: false, authorAccountId: 'u1' }, 'bin', 'temp_audit');
    const all = sent.join('\n');
    expect(all).toContain('UPDATE "Account" SET "passwordHash" = NULL');
    expect(all).toContain('DELETE FROM "AdminGrant";');
    expect(all).toMatch(/DELETE FROM "Account" a WHERE NOT EXISTS \(SELECT 1 FROM "AccountProject"/);
    for (const table of SHARE_PLATFORM_HISTORY) expect(all).toContain(`DELETE FROM ${table};`);
    expect(all).toContain('DELETE FROM "AuditEntry" WHERE "projectId" IS NULL;');
    // Le nettoyage des orphelins passe après le retrait des comptes.
    expect(sent.at(-1)).toContain('pg_constraint');
  });

  it('proxy des widgets : carte POST refusée, appels limités par compte, association par un administrateur seulement', async () => {
    const svc = t.app.get(ApiCardsService);
    svc.resolveOffline = true;
    svc.lookupImpl = async () => ['93.184.216.34'];
    let calls = 0;
    svc.fetchImpl = (async () => { calls++; return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }); }) as typeof fetch;
    const admin = await t.as(WHO.admin);
    const card = (await admin.post('/api/admin/api-cards', { name: 'Audit proxy', category: 'Météo', endpoint: 'https://api.exemple.fr/meteo' }).expect(201)).body;
    const post = (await admin.post('/api/admin/api-cards', { name: 'Audit POST', category: 'Autre', endpoint: 'https://api.exemple.fr/decide', method: 'POST', body: '{"q":"x"}' }).expect(201)).body;
    await admin.post(`/api/admin/api-cards/${card.id}/test`).expect(200);
    const lec = await t.as(WHO.lecteurC3);
    await lec.get(`/api/widgets/proxy/${post.id}?n=1`).expect(404);

    // Un utilisateur : PROXY_USER_MISSES_MAX appels sortants, puis réserve (même requête) ou 429 (requête nouvelle).
    await lec.get(`/api/widgets/proxy/${card.id}?n=0`).set('X-RISE-Widget', 'meteo').expect(200);
    for (let i = 1; i < PROXY_USER_MISSES_MAX; i++) await lec.get(`/api/widgets/proxy/${card.id}?n=${i}`).expect(200);
    const before = calls;
    expect((await lec.get(`/api/widgets/proxy/${card.id}?n=nouveau`).expect(429)).body.code).toBe('RATE_LIMITED');
    expect(calls).toBe(before);
    // Les autres comptes ne sont pas touchés.
    await (await t.as(WHO.pmo)).get(`/api/widgets/proxy/${card.id}?n=pmo`).expect(200);
    expect((await t.db.apiCard.findUniqueOrThrow({ where: { id: card.id } })).widgets).not.toContain('meteo');
    await admin.get(`/api/widgets/proxy/${card.id}?n=admin`).set('X-RISE-Widget', 'meteo').expect(200);
    expect((await t.db.apiCard.findUniqueOrThrow({ where: { id: card.id } })).widgets).toContain('meteo');
  });
});
