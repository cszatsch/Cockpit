import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { CODE_PATTERN } from '../../src/domain/share';
import { encryptSecret } from '../../src/core/crypto';

const S = '/api/admin/share';

/** Lit le flux SSE jusqu'à sa fermeture (événement final). */
async function events(t: TestCtx, id: string): Promise<any[]> {
  const tok = await t.token(WHO.admin);
  const r = await request(t.app.getHttpServer())
    .get(`${S}/packages/${id}/events`)
    .set('Authorization', `Bearer ${tok}`)
    .buffer(true)
    .parse((res, cb) => { let s = ''; res.setEncoding('utf8'); res.on('data', (c: string) => (s += c)); res.on('end', () => cb(null, s)); })
    .expect(200);
  expect(r.headers['content-type']).toMatch(/text\/event-stream/);
  return String(r.body).split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
}

const body = (o: Record<string, unknown> = {}) => ({
  data: 'demo', projects: [], keys: ['anthropic', 'openai'], smtp: true, files: true, code: true,
  recipient: { name: 'Antoine Mercier', email: 'antoine.mercier@onepoint.fr' }, prefill: { enabled: true, profiles: ['PMO'] }, update: 'keep', ...o,
});

describe('Partager Cockpit (spécification PARTAGE, 05/10/2026)', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
    await t.db.provider.update({ where: { id: 'anthropic' }, data: { monthlyCapEur: 100 } });
    await t.db.provider.update({ where: { id: 'openai' }, data: { monthlyCapEur: 50 } });
    await t.db.smtpSettings.create({ data: { host: 'smtp.exemple.fr', port: 587, enc: 'starttls', user: 'cockpit', passwordEncrypted: encryptSecret('mot-de-passe-smtp'), fromAddress: 'cockpit@exemple.fr' } });
  });
  afterAll(() => t.close());

  it('8. un utilisateur non administrateur reçoit 403 sur toutes les routes', async () => {
    const c = await t.as(WHO.pmo);
    await c.get(`${S}/context`).expect(403);
    await c.post(`${S}/packages`, body()).expect(403);
    await c.get(`${S}/packages`).expect(403);
    await c.get(`${S}/packages/x/events`).expect(403);
    await c.get(`${S}/packages/x/download`).expect(403);
    await c.del(`${S}/packages/x/file`).expect(403);
  });

  it('contexte : version, projets, clés masquées avec plafond, SMTP, fichiers, profils — aucun secret', async () => {
    const r = (await (await t.as(WHO.admin)).get(`${S}/context`).expect(200)).body;
    expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(r.projects.map((p: any) => p.id)).toContain('RISE');
    expect(r.projects[0].meta).toMatch(/chantier/);
    const a = r.keys.find((k: any) => k.id === 'anthropic');
    expect(a).toMatchObject({ name: expect.any(String), cap: 100 });
    expect(a.mask).toContain('…');
    expect(JSON.stringify(r)).not.toMatch(/keyCipher|demo-0000/);
    expect(r.files.map((f: any) => f.label)).toEqual(['Base de connaissance', 'Guide utilisateur', 'Formats de rapport']);
    expect(r.smtp).toEqual({ host: 'smtp.exemple.fr', from: 'cockpit@exemple.fr' });
    expect(r.profiles).toEqual(['Administrateur', 'PMO', 'Responsable', 'Lecteur']);
    expect(r.sizes.app).toBeGreaterThan(0);
  });

  it('4-5. demande invalide : destinataire ou projet manquant → 400 par champ', async () => {
    const c = await t.as(WHO.admin);
    const r = await c.post(`${S}/packages`, body({ data: 'current', projects: [], recipient: { name: 'A', email: 'pas-une-adresse' } })).expect(400);
    expect(r.body.fields).toMatchObject({ projects: expect.any(String), 'recipient.email': 'Adresse e-mail invalide.' });
  });

  let first = '';
  it('1. génération en 4 étapes diffusée, code remis une seule fois, audit sensible', async () => {
    const c = await t.as(WHO.admin);
    const { jobId } = (await c.post(`${S}/packages`, body()).expect(201)).body;
    first = jobId;
    const ev = await events(t, jobId);
    const steps = ev.filter((e) => e.step).map((e) => `${e.step}:${e.status}`);
    expect(steps).toEqual(expect.arrayContaining(['compile:done', 'copy_db:done', 'encrypt:done', 'archive:done']));
    const fin = ev[ev.length - 1];
    expect(fin).toMatchObject({ done: true, fileName: 'cockpit-' + (await c.get(`${S}/context`)).body.version + '-amercier.zip' });
    expect(fin.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fin.code).toMatch(CODE_PATTERN);
    // Deuxième lecture : plus de code.
    const again = await events(t, jobId);
    expect(again[again.length - 1].done).toBe(true);
    expect(again[again.length - 1].code).toBeUndefined();
    // Jamais stocké.
    const row = await t.db.sharePackage.findUniqueOrThrow({ where: { id: jobId } });
    expect(JSON.stringify(row, (_k, v) => (typeof v === 'bigint' ? Number(v) : v))).not.toContain(fin.code);
    const audit = await t.db.auditEntry.findFirstOrThrow({ where: { entityType: 'SharePackage', entityId: jobId } });
    expect(audit).toMatchObject({ severity: 'SENSITIVE', action: 'Génération d’un paquet Cockpit' });
    expect(JSON.stringify(audit.newValue)).toContain(fin.sha256);
    expect(JSON.stringify(audit.newValue)).not.toContain(fin.code);
  });

  it('historique : contenu, clés à révoquer (masques), dépense possible = somme des plafonds', async () => {
    const h = (await (await t.as(WHO.admin)).get(`${S}/packages`).expect(200)).body;
    const r = h.find((x: any) => x.id === first);
    expect(r).toMatchObject({ to: 'Antoine Mercier', data: 'Démonstration · fichiers', smtp: true, code: true, kept: true, spend: 150 });
    expect(r.keys).toHaveLength(2);
    expect(r.keys[0].mask).toContain('…');
  });

  it('2-3. clé sans plafond et code désactivé : dépense illimitée, paquet « sans code », pas de code', async () => {
    const c = await t.as(WHO.admin);
    const { jobId } = (await c.post(`${S}/packages`, body({ keys: ['anthropic', 'mistral'], code: false })).expect(201)).body;
    const ev = await events(t, jobId);
    expect(ev[ev.length - 1].code).toBeUndefined();
    const r = (await c.get(`${S}/packages`)).body.find((x: any) => x.id === jobId);
    expect(r).toMatchObject({ code: false, spend: null });
  });

  it('Base actuelle : un seul projet retenu, libellé « Base actuelle · … »', async () => {
    const c = await t.as(WHO.admin);
    const { jobId } = (await c.post(`${S}/packages`, body({ data: 'current', projects: ['RISE'], keys: [], smtp: false, files: false })).expect(201)).body;
    const ev = await events(t, jobId);
    expect(ev.find((e) => e.step === 'encrypt')?.status).toBe('skipped');
    // Aucun secret : pas de code, même demandé.
    expect(ev[ev.length - 1].code).toBeUndefined();
    const r = (await c.get(`${S}/packages`)).body.find((x: any) => x.id === jobId);
    expect(r.data).toMatch(/^Base actuelle · /);
    expect(r.projects).toEqual(['RISE']);
  });

  it('téléchargement : URL signée 15 min, fichier servi ; lien altéré refusé', async () => {
    const c = await t.as(WHO.admin);
    const d = (await c.get(`${S}/packages/${first}/download`).expect(200)).body;
    expect(d.url).toMatch(/^\/api\/admin\/share\/files\//);
    expect(new Date(d.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
    const f = await request(t.app.getHttpServer()).get(d.url).expect(200);
    expect(f.headers['content-disposition']).toContain('amercier.zip');
    await request(t.app.getHttpServer()).get(d.url.replace(/sig=[^&]+/, 'sig=AAAA')).expect(403);
  });

  it('7. suppression du fichier : ligne conservée, téléchargement 410, audit sensible', async () => {
    const c = await t.as(WHO.admin);
    const d = (await c.get(`${S}/packages/${first}/download`).expect(200)).body;
    await c.del(`${S}/packages/${first}/file`).expect(200);
    const r = (await c.get(`${S}/packages`)).body.find((x: any) => x.id === first);
    expect(r).toMatchObject({ kept: false, fileDeletedAt: expect.any(String) });
    await c.get(`${S}/packages/${first}/download`).expect(410);
    await request(t.app.getHttpServer()).get(d.url).expect(410);
    const a = await t.db.auditEntry.findFirstOrThrow({ where: { entityType: 'SharePackage', entityId: first, action: 'Suppression du fichier d’un paquet Cockpit' } });
    expect(a.severity).toBe('SENSITIVE');
  });

  it('6. reprise : le flux rejoue les étapes passées puis l’étape en cours', async () => {
    process.env.SHARE_FAKE_DELAY_MS = '400';
    try {
      const c = await t.as(WHO.admin);
      const { jobId } = (await c.post(`${S}/packages`, body({ code: false })).expect(201)).body;
      await new Promise((r) => setTimeout(r, 600));
      const row = await t.db.sharePackage.findUniqueOrThrow({ where: { id: jobId } });
      expect(row.status).toBe('RUNNING');
      expect(row.step).toBeGreaterThanOrEqual(1);
      const ev = await events(t, jobId);
      expect(ev[0]).toEqual({ step: 'compile', status: 'done' });
      expect(ev[ev.length - 1].done).toBe(true);
    } finally {
      delete process.env.SHARE_FAKE_DELAY_MS;
    }
  });
});
