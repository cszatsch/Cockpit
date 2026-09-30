import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { GUIDE_PDF_ONLY, nextGuideVersion } from '../../src/domain/guide';

const G = '/api/admin/guide';
const pdf = (n: number) => Buffer.from(`%PDF-1.4\n% Guide utilisateur ${n}\n%%EOF\n`);

/**
 * Guide utilisateur de la Console (décision du 30/09/2026) : dépôt d'un PDF (remplacement, incrément mineur), seule
 * la dernière version servie, chaque téléchargement tracé par le serveur avant l'envoi, journal en ajout seul.
 */
describe('Console — guide utilisateur', () => {
  let t: TestCtx;
  let token: string;
  const http = () => request(t.app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  /** Téléchargement lu en binaire (le PDF comparé octet par octet). */
  const getFile = () => auth(http().get(`${G}/file`)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); });

  beforeAll(async () => {
    t = await setup();
    token = await t.token(WHO.admin);
  });
  afterAll(() => t.close());

  it('règle de version : incrément mineur (3.2 → 3.3, 3.9 → 3.10), 1.0 pour le premier guide', () => {
    expect(nextGuideVersion(null)).toBe('1.0');
    expect(nextGuideVersion('3.2')).toBe('3.3');
    expect(nextGuideVersion('3.9')).toBe('3.10');
  });

  it('aucun guide publié : listes vides (jamais de données de démonstration) ; téléchargement impossible, aucune trace', async () => {
    expect((await auth(http().get(`${G}/versions`)).expect(200)).body).toEqual([]);
    expect((await auth(http().get(`${G}/downloads`)).expect(200)).body).toEqual([]);
    await auth(http().get(`${G}/file`)).expect(404);
    expect(await t.db.guideDownload.count()).toBe(0);
  });

  it('fichier refusé côté serveur : type réel contrôlé (un texte nommé .pdf est refusé) ; réservé aux administrateurs', async () => {
    const r = await auth(http().post(G)).attach('file', Buffer.from('pas un pdf'), { filename: 'guide.pdf', contentType: 'application/pdf' }).expect(422);
    expect(r.body.message).toBe(GUIDE_PDF_ONLY);
    await auth(http().post(G)).expect(400);
    const pmo = await t.token(WHO.pmo);
    await http().post(G).set('Authorization', `Bearer ${pmo}`).attach('file', pdf(0), 'guide.pdf').expect(403);
    await http().get(`${G}/file`).set('Authorization', `Bearer ${pmo}`).expect(403);
    expect(await t.db.guideVersion.count()).toBe(0);
  });

  it('dépôts successifs : 1.0 puis 1.1 ; la plus récente est en vigueur ; publication tracée dans le journal d’audit', async () => {
    const a = (await auth(http().post(G)).attach('file', pdf(1), 'Guide v1.pdf').expect(201)).body;
    expect(a).toMatchObject({ v: '1.0', size: pdf(1).length, fileName: 'Guide v1.pdf', by: expect.any(String) });
    const b = (await auth(http().post(G)).attach('file', pdf(2), 'Guide v2.pdf').expect(201)).body;
    expect(b.v).toBe('1.1');
    expect((await auth(http().get(`${G}/versions`)).expect(200)).body.map((x: any) => x.v)).toEqual(['1.1', '1.0']);
    expect(await t.db.auditEntry.count({ where: { action: 'Publication du guide utilisateur' } })).toBe(2);
  });

  it('téléchargement : seule la dernière version est servie ; la trace (qui, quand selon le serveur, quelle version) est enregistrée', async () => {
    const r = await getFile().expect(200);
    expect(r.headers['content-type']).toMatch(/^application\/pdf/);
    expect(r.headers['content-disposition']).toBe('attachment; filename="Guide utilisateur Console v1.1.pdf"');
    expect((r.body as Buffer).equals(pdf(2))).toBe(true);
    const d = (await auth(http().get(`${G}/downloads`)).expect(200)).body;
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ role: 'Administrateur', version: '1.1', at: new Date(process.env.DEMO_NOW!).toISOString() });
    expect(d[0].user.length).toBeGreaterThan(1);
  });

  it('trace avant l’envoi : si le fichier est introuvable, rien n’est envoyé et rien n’est tracé ; sinon la trace existe dès la réponse', async () => {
    const cur = await t.db.guideVersion.findFirstOrThrow({ where: { v: '1.1' } });
    const before = await t.db.guideDownload.count();
    await t.db.guideVersion.update({ where: { id: cur.id }, data: { storageKey: 'guide/absent.pdf' } });
    await auth(http().get(`${G}/file`)).expect(404);
    expect(await t.db.guideDownload.count()).toBe(before);
    await t.db.guideVersion.update({ where: { id: cur.id }, data: { storageKey: cur.storageKey } });
  });

  it('30 téléchargements, 3 versions : journal complet ; version 3.2 importée → dépôt suivant 3.3', async () => {
    for (let i = 0; i < 29; i++) await getFile().expect(200);
    expect((await auth(http().get(`${G}/downloads`)).expect(200)).body).toHaveLength(30);
    await t.db.guideVersion.create({ data: { v: '3.2', at: new Date(Date.parse(process.env.DEMO_NOW!) + 60_000), by: 'Élodie Martin', size: 10, fileName: 'x.pdf', storageKey: 'guide/x.pdf' } });
    expect((await auth(http().post(G)).attach('file', pdf(3), 'Guide.pdf').expect(201)).body.v).toBe('3.3');
  });

  it('journal des téléchargements en ajout seul : une trace ne se modifie ni ne se supprime', async () => {
    const one = await t.db.guideDownload.findFirstOrThrow();
    await expect(t.db.guideDownload.update({ where: { id: one.id }, data: { version: '9.9' } })).rejects.toThrow(/append-only/);
    await expect(t.db.guideDownload.delete({ where: { id: one.id } })).rejects.toThrow(/append-only/);
  });
});
