import request from 'supertest';
import { setup, TestCtx, Client, WHO } from '../helpers';
import { LlmService } from '../../src/core/llm.service';

const PS = '/api/assistant/persona';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

/** Persona de Jev (spécification PERSONA § 5 et § 6). */
describe('Console — Persona de Jev', () => {
  let t: TestCtx;
  let admin: Client;
  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
  });
  afterAll(() => t.close());

  it('valeur initiale : Jev, Copilote de projet, 🧭, avatar nuit, Soul de démonstration', async () => {
    const r = await admin.get(PS).expect(200);
    expect(r.body).toMatchObject({ identity: { name: 'Jev', creature: 'Copilote de projet', style: 'Direct, chaleureux, précis', emoji: '🧭', avatar: 'nuit', photo: null }, version: 1 });
    expect(r.body.soul).toMatch(/^## Qui je suis\n/);
    await (await t.as(WHO.pmo)).get(PS).expect(403);
  });

  it('enregistrer Identity et Soul en une fois : contrôles (422), audit, version précédente conservée', async () => {
    const cur = (await admin.get(PS).expect(200)).body;
    const bad = await admin.put(PS, { identity: { ...cur.identity, name: '  ', avatar: 'rose' }, soul: cur.soul }).expect(422);
    expect(Object.keys(bad.body.fields).sort()).toEqual(['identity.avatar', 'identity.name']);
    await admin.put(PS, { identity: { ...cur.identity, style: 's'.repeat(61) }, soul: cur.soul }).expect(422);
    await admin.put(PS, { identity: { ...cur.identity }, soul: 'x'.repeat(20_001) }).expect(422);
    await admin.put(PS, { identity: { ...cur.identity, photo: 'https://ailleurs.example/p.png' }, soul: cur.soul }).expect(422);

    const ok = await admin.put(PS, { identity: { ...cur.identity, name: ' Nova ', emoji: '🦉' }, soul: '## Qui je suis\nUne autre âme.' }).expect(200);
    expect(ok.body).toMatchObject({ identity: { name: 'Nova', emoji: '🦉' }, soul: '## Qui je suis\nUne autre âme.', version: 2 });
    const v = (await admin.get(`${PS}/versions`).expect(200)).body;
    expect(v[0]).toMatchObject({ version: 1, identity: { name: 'Jev', emoji: '🧭' } });
    const a = await t.db.auditEntry.findFirst({ where: { action: 'Persona modifié' }, orderBy: { at: 'desc' } });
    expect(a?.target).toContain('Nova · nom, emoji, soul');
    expect(a).toMatchObject({ profileUsed: 'ADMIN', accountId: 'u1', newValue: { partie: 'Identity et Soul', avant: { identity: { name: 'Jev', emoji: '🧭' } }, apres: { identity: { name: 'Nova', emoji: '🦉' }, soul: '## Qui je suis\nUne autre âme.' } } });
  });

  it('écran en tuiles : chaque tuile s’enregistre seule, l’audit trace la partie modifiée (avant, après) ; limites', async () => {
    const cur = (await admin.get(PS).expect(200)).body;
    await admin.put(PS, { identity: { ...cur.identity, name: 'n'.repeat(31) }, soul: cur.soul }).expect(422);
    await admin.put(PS, { identity: { ...cur.identity, creature: 'c'.repeat(41) }, soul: cur.soul }).expect(422);
    await admin.put(PS, { identity: { ...cur.identity, name: 'n'.repeat(30), creature: 'c'.repeat(40), style: 's'.repeat(60) }, soul: cur.soul }).expect(200);
    const idOnly = await t.db.auditEntry.findFirst({ where: { action: 'Persona modifié' }, orderBy: { at: 'desc' } });
    expect(idOnly!.newValue).toEqual({ partie: 'Identity', avant: { identity: cur.identity }, apres: { identity: { ...cur.identity, name: 'n'.repeat(30), creature: 'c'.repeat(40), style: 's'.repeat(60) } }, version: cur.version + 1 });
    await admin.put(PS, { identity: { ...cur.identity, name: 'n'.repeat(30), creature: 'c'.repeat(40), style: 's'.repeat(60) }, soul: 'y'.repeat(20_000) }).expect(200);
    const soulOnly = await t.db.auditEntry.findFirst({ where: { action: 'Persona modifié' }, orderBy: { at: 'desc' } });
    expect(soulOnly!.newValue).toMatchObject({ partie: 'Soul', avant: { soul: cur.soul }, apres: { soul: 'y'.repeat(20_000) } });
    expect(soulOnly!.newValue).not.toHaveProperty('avant.identity');
    await admin.put(PS, { identity: cur.identity, soul: cur.soul }).expect(200);
  });

  it('avatar importé : PNG, JPEG ou WebP, 1 Mo au plus ; URL lisible et enregistrable', async () => {
    const tok = (await request(t.app.getHttpServer()).post('/api/auth/dev-login').send(WHO.admin)).body.token;
    const up = (buf: Buffer, name: string) => request(t.app.getHttpServer()).post(`${PS}/avatar`).set('Authorization', `Bearer ${tok}`).attach('file', buf, name);
    const r = await up(PNG, 'a.png').expect(201);
    expect(r.body.url).toMatch(/^\/api\/assistant\/persona\/avatar\/[0-9-]+\/[a-f0-9]+\.png$/);
    const img = await request(t.app.getHttpServer()).get(r.body.url).expect(200);
    expect(img.headers['content-type']).toContain('image/png');
    await up(Buffer.from('pas une image'), 'x.png').expect(422);
    await up(Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]), 'lourde.png').expect(422);
    const cur = (await admin.get(PS).expect(200)).body;
    expect((await admin.put(PS, { identity: { ...cur.identity, photo: r.body.url }, soul: cur.soul }).expect(200)).body.identity.photo).toBe(r.body.url);
    // Choisir un avatar prédéfini retire la photo.
    expect((await admin.put(PS, { identity: { ...cur.identity, avatar: 'lagon', photo: null }, soul: cur.soul }).expect(200)).body.identity).toMatchObject({ avatar: 'lagon', photo: null });
  });

  it('prompt de Jev : Identité puis Personnalité avant les skills ; la réponse suivante tient compte du nouveau Persona', async () => {
    const spy = jest.spyOn(t.app.get(LlmService), 'complete');
    const ask = async () => {
      spy.mockClear();
      await admin.post('/api/admin/assistant/messages', { context: { section: 'persona' }, text: 'Bonjour' }).expect(200);
      return spy.mock.calls[0][0].system!;
    };
    const cur = (await admin.get(PS).expect(200)).body;
    await admin.put(PS, { identity: { ...cur.identity, name: 'Atlas', creature: 'Copilote', style: 'Sobre', emoji: '🌱' }, soul: 'Âme de test' }).expect(200);
    const sys = await ask();
    expect(sys).toContain('## Identité\nTu t’appelles Atlas. Tu es Copilote. Ton style : Sobre. Ton emoji : 🌱.\n\n## Personnalité\nÂme de test\n\n## Skill : ');
    expect(sys.indexOf('## Identité')).toBeLessThan(sys.indexOf('## Skill : '));
    expect(sys).not.toContain('lagon');
    spy.mockRestore();
  });
});
