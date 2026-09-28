import { setup, TestCtx, Client, WHO } from '../helpers';
import { LlmService } from '../../src/core/llm.service';
import { JEV_SYSTEM_PROMPT } from '../../src/domain/jev-prompt';

const SK = '/api/assistant/skills';

/** Skills de Jev (spécification SKILLS § 5 et § 6). */
describe('Console — skills de Jev', () => {
  let t: TestCtx;
  let admin: Client;
  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
  });
  afterAll(() => t.close());

  it('données initiales : les cinq skills de démonstration, dans l’ordre, la 4e désactivée', async () => {
    const r = await admin.get(SK).expect(200);
    expect(r.body.map((s: any) => [s.n, s.on, s.position])).toEqual([
      ['Analyser le projet', true, 1], ['Rédiger un livrable', true, 2], ['Mettre à jour les données', true, 3], ['Assister l’administration', false, 4], ['Guider l’utilisateur', true, 5],
    ]);
    // Réservé à l'administrateur.
    await (await t.as(WHO.pmo)).get(SK).expect(403);
  });

  it('créer, enregistrer, activer, supprimer : chaque action est tracée', async () => {
    const c = await admin.post(SK, { n: 'Nouvelle skill', t: '', on: false }).expect(201);
    expect(c.body).toMatchObject({ n: 'Nouvelle skill', t: '', on: false, position: 6, updated_by: expect.any(String) });
    const id = c.body.id;
    expect((await admin.patch(`${SK}/${id}`, { n: '  ', t: '## Titre\n- puce' }).expect(200)).body).toMatchObject({ n: 'Sans nom', t: '## Titre\n- puce', on: false });
    expect((await admin.patch(`${SK}/${id}`, { on: true }).expect(200)).body.on).toBe(true);
    await admin.del(`${SK}/${id}`).expect(204);
    await admin.del(`${SK}/${id}`).expect(404);
    const acts = (await t.db.auditEntry.findMany({ where: { entityType: 'Skill', entityId: id }, orderBy: { at: 'asc' } })).map((a) => a.action);
    expect(acts).toEqual(['Skill créée', 'Skill modifiée', 'Skill activée', 'Skill supprimée']);
  });

  it('limites : 60 caractères pour le nom, 20 000 pour le texte (422)', async () => {
    const r = await admin.post(SK, { n: 'x'.repeat(61), t: '' }).expect(422);
    expect(r.body.fields.n).toBeTruthy();
    const s = (await admin.get(SK).expect(200)).body[0];
    expect((await admin.patch(`${SK}/${s.id}`, { t: 'y'.repeat(20_001) }).expect(422)).body.fields.t).toBeTruthy();
    await admin.patch(`${SK}/${s.id}`, { n: 'x'.repeat(60) }).expect(200);
    await admin.patch(`${SK}/${s.id}`, { n: s.n }).expect(200);
  });

  it('prompt de Jev : skills actives après le prompt de base, dans l’ordre ; une skill désactivée disparaît dès la réponse suivante', async () => {
    const llm = t.app.get(LlmService);
    const spy = jest.spyOn(llm, 'complete');
    // Jev du Cockpit : toutes les skills actives (le Jev de la Console n'envoie que la skill de guidage, voir guidage.spec.ts).
    const pmo = await t.as(WHO.pmo);
    const ask = async () => {
      spy.mockClear();
      await pmo.post('/api/projects/RISE/assistant/messages', { context: { space: 'pilotage', tab: 'actions' }, text: 'Bonjour Jev' }).expect(200);
      return spy.mock.calls[0][0].system!;
    };
    let sys = await ask();
    expect(sys.startsWith(JEV_SYSTEM_PROMPT)).toBe(true);
    expect(sys).toContain('## Skill : Analyser le projet\n## Objectif\n');
    expect(sys.indexOf('## Skill : Analyser le projet')).toBeLessThan(sys.indexOf('## Skill : Guider l’utilisateur'));
    expect(sys).not.toContain('Assister l’administration');

    const guide = (await admin.get(SK).expect(200)).body.find((s: any) => s.n === 'Guider l’utilisateur');
    await admin.patch(`${SK}/${guide.id}`, { on: false }).expect(200);
    sys = await ask();
    expect(sys).not.toContain('Guider l’utilisateur');

    spy.mockRestore();
  });
});
