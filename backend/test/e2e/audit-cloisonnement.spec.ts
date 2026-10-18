import { setup, TestCtx, WHO } from '../helpers';
import { canReadLinks, riskLinks, buildAccess } from '../../src/domain/rights';

const R = '/api/projects/RISE';
/** Corps binaire (PDF) lu tel quel. */
const binary = (res: any, cb: (e: Error | null, b: Buffer) => void) => { const d: Buffer[] = []; res.on('data', (c: Buffer) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); };

/** Audit de sécurité du 18/10/2026, lot 2 : cloisonnement par chantier (RG8) sur des routes secondaires. */
describe('Audit 18/10/2026 — cloisonnement par chantier', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  it('commentaires : `entityId` sans `entityType` ne contourne plus le contrôle de lecture', async () => {
    const pmo = await t.as(WHO.pmo);
    await pmo.post(`${R}/comments`, { entityType: 'RISK', entityId: 'R01', field: 'plan', text: 'Commentaire réservé à C1' }).expect(201);
    const lec = await t.as(WHO.lecteurC3);
    await lec.get(`${R}/comments?entityType=RISK&entityId=R01`).expect(404);
    expect((await lec.get(`${R}/comments?entityId=R01`).expect(200)).body).toEqual([]);
    expect((await pmo.get(`${R}/comments?entityId=R01`).expect(200)).body.some((c: any) => c.text === 'Commentaire réservé à C1')).toBe(true);
  });

  it('rapport de séance : PDF filtré par chantier, cache réservé aux profils qui voient tout', async () => {
    const r = await t.db.reportInstance.findFirst({ where: { projectId: 'RISE' } });
    expect(r).toBeTruthy();
    const risks = await t.db.risk.findMany({ where: { projectId: 'RISE', status: { not: 'CLOSED' } } });
    const lecAccess = buildAccess('RISE', 'p04', false, [{ profile: 'LECTEUR', wsId: 'C3' } as any], null);
    const hidden = risks.filter((x) => !canReadLinks(lecAccess, riskLinks(x))).map((x) => x.code);
    expect(hidden.length).toBeGreaterThan(0);
    // Le PMO d'abord : son PDF complet est mis en cache…
    const all = (await (await t.as(WHO.pmo)).get(`${R}/reports/${r!.id}/file`).buffer(true).parse(binary).expect(200)).body as Buffer;
    expect(hidden.some((code) => all.toString('latin1').includes(`(${code} criticité`))).toBe(true);
    // … mais n'est pas resservi au Lecteur de C3, qui reçoit un PDF sans les risques des autres chantiers.
    const own = (await (await t.as(WHO.lecteurC3)).get(`${R}/reports/${r!.id}/file`).buffer(true).parse(binary).expect(200)).body as Buffer;
    for (const code of hidden) expect(own.toString('latin1')).not.toContain(`(${code} criticité`);
  });

  it('génération de rapport : refusée au Lecteur, et au Responsable d’un chantier pour un rapport de tout le projet', async () => {
    const tpl = await t.db.reportTemplate.findFirst({ where: { projectId: 'RISE', active: true } });
    expect(tpl).toBeTruthy();
    const lec = await t.as(WHO.lecteurC3);
    await lec.get(`${R}/report-templates/${tpl!.id}/pptx`).expect(403);
    await lec.post(`${R}/report-templates/${tpl!.id}/generations`, {}).expect(403);
    await lec.get(`${R}/report-templates/${tpl!.id}/check`).expect(403);
    const resp = await t.as(WHO.respC5);
    if ((tpl!.components as any[]).some((c) => c.scope !== 'WORKSTREAM')) await resp.get(`${R}/report-templates/${tpl!.id}/pptx`).expect(403);
    // Aperçu : composant « projet » refusé au Responsable, composant de son propre chantier accepté.
    await resp.post(`${R}/report-templates/preview`, { name: 'Essai', components: [{ id: 'jalons', scope: 'PROJECT' }] }).expect(403);
    const c5 = await t.db.workstream.findFirst({ where: { projectId: 'RISE', code: 'C5' } });
    const own = await resp.post(`${R}/report-templates/preview`, { name: 'Essai', components: [{ id: 'jalons', scope: 'WORKSTREAM', targetId: c5!.id }] });
    expect(own.status).not.toBe(403);
  });
});
