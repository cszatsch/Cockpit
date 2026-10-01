import { setup, TestCtx, Client, WHO } from '../helpers';
import { JEV_SYSTEM_PROMPT } from '../../src/domain/jev-prompt';
import { JevPromptService } from '../../src/core/jev-prompt.service';

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

  it('créer, enregistrer, activer, supprimer : chaque action est tracée (qui, skill, avant, après)', async () => {
    const c = await admin.post(SK, { n: 'Nouvelle skill', t: '', on: false }).expect(201);
    expect(c.body).toMatchObject({ n: 'Nouvelle skill', t: '', on: false, position: 6, updated_by: expect.any(String) });
    const id = c.body.id;
    // L'écran crée toujours « Nouvelle skill » : le nom suivant reçoit un numéro (unicité sans tenir compte des majuscules).
    const c2 = await admin.post(SK, { n: 'nouvelle SKILL', t: '', on: false }).expect(201);
    expect(c2.body.n).toBe('nouvelle SKILL 2');
    await admin.del(`${SK}/${c2.body.id}`).expect(204);
    expect((await admin.put(`${SK}/${id}`, { n: ' Relance ', t: '## Titre\n- puce' }).expect(200)).body).toMatchObject({ n: 'Relance', t: '## Titre\n- puce', on: false });
    expect((await admin.patch(`${SK}/${id}/active`, { on: true }).expect(200)).body.on).toBe(true);
    expect((await admin.patch(`${SK}/${id}/active`, { on: false }).expect(200)).body.on).toBe(false);
    await admin.del(`${SK}/${id}`).expect(204);
    await admin.del(`${SK}/${id}`).expect(404);
    await admin.patch(`${SK}/${id}`, { on: true }).expect(404); // ancienne route retirée
    const acts = await t.db.auditEntry.findMany({ where: { entityType: 'Skill', entityId: id }, orderBy: { at: 'asc' } });
    expect(acts.map((a) => a.action)).toEqual(['Skill créée', 'Skill modifiée', 'Skill activée', 'Skill désactivée', 'Skill supprimée']);
    expect(acts.every((a) => a.accountId === 'u1' && a.profileUsed === 'ADMIN')).toBe(true);
    expect(acts.map((a) => a.newValue)).toEqual([
      { skill: 'Nouvelle skill', avant: null, apres: { n: 'Nouvelle skill', t: '', on: false } },
      { skill: 'Relance', avant: { n: 'Nouvelle skill', t: '' }, apres: { n: 'Relance', t: '## Titre\n- puce' } },
      { skill: 'Relance', avant: { on: false }, apres: { on: true } },
      { skill: 'Relance', avant: { on: true }, apres: { on: false } },
      { skill: 'Relance', avant: { n: 'Relance', t: '## Titre\n- puce', on: false }, apres: null },
    ]);
  });

  it('validations : nom obligatoire, 60 caractères, unique sans tenir compte des majuscules ; texte 20 000 caractères', async () => {
    expect((await admin.post(SK, { n: 'x'.repeat(61), t: '' }).expect(422)).body.fields.n).toBeTruthy();
    expect((await admin.post(SK, { n: '   ', t: '' }).expect(422)).body.fields.n).toBe('obligatoire');
    const [s, other] = (await admin.get(SK).expect(200)).body;
    expect((await admin.put(`${SK}/${s.id}`, { n: s.n, t: 'y'.repeat(20_001) }).expect(422)).body.fields.t).toBeTruthy();
    expect((await admin.put(`${SK}/${s.id}`, { n: '', t: s.t }).expect(422)).body.fields.n).toBe('obligatoire');
    const dup = await admin.put(`${SK}/${s.id}`, { n: other.n.toUpperCase(), t: s.t }).expect(409);
    expect(dup.body).toMatchObject({ code: 'SKILL_NOM_PRIS', message: `Une skill s’appelle déjà « ${other.n} »` });
    await admin.put(`${SK}/${s.id}`, { n: s.n.toUpperCase(), t: s.t }).expect(200); // sa propre casse : permis
    await admin.put(`${SK}/${s.id}`, { n: 'x'.repeat(60), t: 'y'.repeat(20_000) }).expect(200);
    await admin.put(`${SK}/${s.id}`, { n: s.n, t: s.t }).expect(200);
  });

  it('au-delà de 200 skills : recherche (sans accents), filtre et pagination par le serveur, avec les totaux', async () => {
    const created: string[] = [];
    for (let i = 0; i < 12; i++) created.push((await admin.post(SK, { n: `Évaluer le périmètre ${i}`, t: '', on: i % 3 === 0 }).expect(201)).body.id);
    const all = (await admin.get(SK).expect(200)).body;
    const act = all.filter((s: any) => s.on).length;
    const p1 = (await admin.get(`${SK}?q=evaluer%20le%20PERIMETRE&filtre=toutes&page=1&par_page=9`).expect(200)).body;
    expect(p1).toMatchObject({ total: 12, toutes: all.length, actives: act, page: 1, par_page: 9 });
    expect(p1.items).toHaveLength(9);
    expect(p1.items[0]).toMatchObject({ n: 'Évaluer le périmètre 0' });
    const p2 = (await admin.get(`${SK}?q=evaluer&page=2&par_page=9`).expect(200)).body;
    expect(p2.items.map((s: any) => s.n)).toEqual(['Évaluer le périmètre 9', 'Évaluer le périmètre 10', 'Évaluer le périmètre 11']);
    expect((await admin.get(`${SK}?q=evaluer&filtre=actives`).expect(200)).body.total).toBe(4);
    expect((await admin.get(`${SK}?q=evaluer&filtre=desactivees`).expect(200)).body.total).toBe(8);
    expect((await admin.get(`${SK}?q=evaluer&page=99`).expect(200)).body.page).toBe(2); // borné à la dernière page
    await admin.get(`${SK}?filtre=autre`).expect(400);
    for (const id of created) await admin.del(`${SK}/${id}`).expect(204);
  });

  it('prompt de Jev : skills actives après le prompt de base, dans l’ordre ; une skill désactivée disparaît dès la réponse suivante', async () => {
    // Prompt complet de Jev (toutes les skills actives). Le Jev du Cockpit n'envoie que la skill du cas d'usage
    // (jev-cockpit-guide.spec.ts), celui de la Console que la skill de guidage (guidage.spec.ts).
    const ask = () => t.app.get(JevPromptService).systemPrompt();
    let sys = await ask();
    expect(sys.startsWith(JEV_SYSTEM_PROMPT)).toBe(true);
    expect(sys).toContain('## Skill : Analyser le projet\n## Objectif\n');
    expect(sys.indexOf('## Skill : Analyser le projet')).toBeLessThan(sys.indexOf('## Skill : Guider l’utilisateur'));
    expect(sys).not.toContain('Assister l’administration');

    const guide = (await admin.get(SK).expect(200)).body.find((s: any) => s.n === 'Guider l’utilisateur');
    await admin.patch(`${SK}/${guide.id}/active`, { on: false }).expect(200);
    sys = await ask();
    expect(sys).not.toContain('Guider l’utilisateur');

  });
});
