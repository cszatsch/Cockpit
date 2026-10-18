import http from 'http';
import { AddressInfo } from 'net';
import { setup, TestCtx, WHO } from '../helpers';
import { ChangeEvent, ChangesService } from '../../src/core/changes';
import { KB_DUPLICATE_HIDDEN } from '../../src/domain/kb-documents';
import { renderPdf } from '../../src/core/pdf';

const R = '/api/projects/RISE';

/** Audit de sécurité du 18/10/2026, lot 5 : cloisonnement par chantier (RG8) et par projet (RG16), suite. */
describe('Audit 18/10/2026 — cloisonnement, suite', () => {
  let t: TestCtx;
  let c3: string; // chantier du Lecteur C3
  let other: string; // un autre chantier, caché au Lecteur C3
  beforeAll(async () => {
    t = await setup();
    c3 = (await t.db.workstream.findFirstOrThrow({ where: { projectId: 'RISE', code: 'C3' } })).id;
    other = (await t.db.decision.findFirstOrThrow({ where: { projectId: 'RISE', wsId: { not: c3 } } })).wsId;
  });
  afterAll(() => t.close());

  it('Référentiel : jalon d’un chantier caché ni listé ni lu ; usages limités aux objets lisibles', async () => {
    const [hidden, open] = await t.db.milestone.findMany({ where: { projectId: 'RISE' }, take: 2, orderBy: { code: 'asc' } });
    await t.db.milestone.update({ where: { id: hidden.id }, data: { wsId: other } });
    await t.db.milestone.update({ where: { id: open.id }, data: { wsId: null } });
    const lec = await t.as(WHO.lecteurC3);
    const ids = (b: any) => (b.items ?? b).map((m: any) => m.id);
    expect(ids((await lec.get(`${R}/milestones`).expect(200)).body)).not.toContain(hidden.id);
    expect(ids((await lec.get(`${R}/milestones`).expect(200)).body)).toContain(open.id);
    await lec.get(`${R}/milestones/${hidden.id}`).expect(404);
    await lec.get(`${R}/milestones/${hidden.id}/usages`).expect(404);
    const pmo = await t.as(WHO.pmo);
    expect(ids((await pmo.get(`${R}/milestones`).expect(200)).body)).toContain(hidden.id);
    // Usages d'un chantier caché : ses décisions et habilitations ne sont pas citées au Lecteur.
    const all = (await pmo.get(`${R}/workstreams/${other}/usages`).expect(200)).body as any[];
    expect(all.some((u) => u.entityType === 'DECISION')).toBe(true);
    const mine = (await lec.get(`${R}/workstreams/${other}/usages`).expect(200)).body as any[];
    expect(mine.filter((u) => ['DECISION', 'ISSUE', 'HABILITATION', 'WORKSTREAM_PROGRESS'].includes(u.entityType))).toEqual([]);
  });

  it('usages d’un jalon : nom d’un document Restreint masqué à qui ne le voit pas', async () => {
    const m = await t.db.milestone.findFirstOrThrow({ where: { projectId: 'RISE', wsId: null } });
    await t.db.document.create({ data: { id: 'doc-audit-jalon', projectId: 'RISE', n: 'Note restreinte du jalon', type: 'Note', dateIso: '2026-09-20', v: '1.0', conf: 'RESTRICTED', src: 'UPLOADED', ext: 'SUCCEEDED', mime: 'application/pdf', uploadedById: 'u1', links: { create: [{ entityType: 'MILESTONE', entityId: m.id }] } } as any });
    const names = async (who: any) => ((await (await t.as(who)).get(`${R}/milestones/${m.id}/usages`).expect(200)).body as any[]).map((u) => u.label);
    expect(await names(WHO.pmo)).toContain('Note restreinte du jalon');
    expect(await names(WHO.lecteurC3)).not.toContain('Note restreinte du jalon');
    expect(await names(WHO.respC5)).not.toContain('Note restreinte du jalon');
  });

  it('avancement des chantiers et porteurs sans affectation : objets des chantiers visibles seulement', async () => {
    const lec = await t.as(WHO.lecteurC3);
    const rows = (await lec.get(`${R}/workstream-progress`).expect(200)).body as any[];
    expect(rows.every((r) => r.wsId === c3)).toBe(true);
    expect(((await (await t.as(WHO.pmo)).get(`${R}/workstream-progress`).expect(200)).body as any[]).some((r) => r.wsId !== c3)).toBe(true);
    // Porteur sans affectation d'une décision d'un autre chantier : cité au PMO, pas au Lecteur C3.
    await t.db.person.create({ data: { id: 'p-audit-sans-aff', projectId: 'RISE', firstName: 'Paul', lastName: 'Sansaffectation', email: 'paul.sans@example.com' } });
    const d = await t.db.decision.findFirstOrThrow({ where: { projectId: 'RISE', wsId: other } });
    await t.db.decision.update({ where: { id: d.id }, data: { makerId: 'p-audit-sans-aff', status: 'IN_REVIEW' } });
    const objs = async (who: any) => ((await (await t.as(who)).get(`${R}/signals/owners-without-assignment`).expect(200)).body as any[]).flatMap((p) => p.objects.map((o: any) => o.id));
    expect(await objs(WHO.pmo)).toContain(d.id);
    expect(await objs(WHO.lecteurC3)).not.toContain(d.id);
  });

  it('dépôt d’un doublon d’un document Restreint : message sans nom ni date', async () => {
    const pdf = renderPdf('Plan secret', ['Contenu réservé', 'audit du 18/10/2026']);
    const up = (tok: string) => t.http().post(`${R}/documents`).set('Authorization', `Bearer ${tok}`).field('conf', 'RESTRICTED').attach('file', pdf, 'Plan secret.pdf');
    const first = await up(await t.token(WHO.pmo));
    expect([201, 202]).toContain(first.status);
    await t.db.document.update({ where: { id: first.body.id }, data: { conf: 'RESTRICTED', ext: 'SUCCEEDED' } });
    const r = await up(await t.token(WHO.respC5)).expect(409);
    expect(r.body.message).toBe(KB_DUPLICATE_HIDDEN);
    const again = await up(await t.token(WHO.pmo)).expect(409);
    expect(again.body.message).toContain('Plan secret');
  });

  it('aperçus et templates de rapport : identifiants d’un autre projet refusés', async () => {
    const pmo = await t.as(WHO.pmo);
    const ws = await t.db.workstream.findFirstOrThrow({ where: { projectId: 'RISE' } });
    await t.db.project.create({ data: { id: 'AUTRE', code: 'AUTRE', name: 'Projet autre', startDate: '2026-01-01', targetEndDate: '2027-01-01', clientId: (await t.db.project.findUniqueOrThrow({ where: { id: 'RISE' } })).clientId } as any });
    await t.db.workstream.create({ data: { ...ws, id: 'AUTRE-C-1', projectId: 'AUTRE', code: 'C1', name: 'Chantier secret', createdAt: undefined, updatedAt: undefined } as any });
    const body = (o: Record<string, unknown>) => ({ name: 'Essai', components: [{ id: 'jalons', scope: 'WORKSTREAM', targetId: 'AUTRE-C-1' }], ...o });
    await pmo.post(`${R}/report-templates/preview`, body({})).expect(400);
    await pmo.post(`${R}/report-templates/preview-jobs`, body({})).expect(400);
    const g = await t.db.governanceBody.findFirstOrThrow({ where: { projectId: 'RISE' } });
    await t.db.governanceBody.create({ data: { ...g, id: 'AUTRE-g-1', projectId: 'AUTRE', name: 'Comité secret', createdAt: undefined, updatedAt: undefined } as any });
    await pmo.post(`${R}/report-templates/preview`, { name: 'Essai', bodyId: 'AUTRE-g-1', components: [{ id: 'jalons', scope: 'PROJECT' }] }).expect(400);
    const tpl = await t.db.reportTemplate.findFirstOrThrow({ where: { projectId: 'RISE' } });
    await pmo.patch(`${R}/report-templates/${tpl.id}`, { bodyId: 'AUTRE-g-1' }).expect(400);
    expect((await t.db.reportTemplate.findUniqueOrThrow({ where: { id: tpl.id } })).bodyId).toBe(tpl.bodyId);
  });

  it('flux /api/changes : un compte ne reçoit que les annonces de ses projets (et de la plateforme)', async () => {
    const server = t.app.getHttpServer();
    if (!server.listening) await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as AddressInfo).port;
    const listen = (token: string) => new Promise<{ events: ChangeEvent[]; stop: () => void }>((resolve, reject) => {
      const events: ChangeEvent[] = [];
      const req = http.get({ host: '127.0.0.1', port, path: '/api/changes', headers: { Authorization: `Bearer ${token}` } }, (res) => {
        res.setEncoding('utf8');
        let buf = '';
        res.on('data', (c: string) => {
          buf += c;
          for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
            const line = buf.slice(0, i); buf = buf.slice(i + 2);
            if (!line.startsWith('data: ')) continue;
            const e = JSON.parse(line.slice(6));
            if (e.hello) resolve({ events, stop: () => req.destroy() }); else events.push(e);
          }
        });
      });
      req.on('error', (e: any) => { if (e.code !== 'ECONNRESET') reject(e); });
    });
    const lec = await listen(await t.token(WHO.lecteurC3));
    const adm = await listen(await t.token(WHO.admin));
    const hub = t.app.get(ChangesService);
    hub.publish('SECRET-PRJ', null);
    hub.publish('RISE', null);
    hub.publish('rise', null);
    hub.publish(null, null);
    await new Promise((r) => setTimeout(r, 300));
    lec.stop(); adm.stop();
    expect(lec.events.map((e) => e.project)).toEqual(['RISE', 'rise', null]);
    expect(adm.events.map((e) => e.project)).toEqual(['SECRET-PRJ', 'RISE', 'rise', null]);
  });
});
