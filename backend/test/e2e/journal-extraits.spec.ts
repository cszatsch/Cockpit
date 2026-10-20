import { setup, TestCtx, Client, WHO } from '../helpers';
import { LlmService } from '../../src/core/llm.service';
import { UsageService } from '../../src/admin/usage.service';
import { withCallQuestion } from '../../src/core/call-question';
import { CALL_CONTENT_RETENTION_DAYS } from '../../src/domain/call-content';

const A = '/api/admin';

/** Journal des appels : question saisie et début de la réponse (50 caractères), décision du 20/10/2026. */
describe('Console — Journal des appels, extraits', () => {
  let t: TestCtx;
  let admin: Client;
  const llm = () => t.app.get(LlmService);
  const rec = (modelId: string, functionId = 'insights') => t.db.usageRecord.findFirstOrThrow({ where: { functionId, modelId }, orderBy: { at: 'desc' } });
  const canSee = (on: boolean) => t.db.adminGrant.update({ where: { accountId: 'u1' }, data: { seeIndividual: on } });

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
  });
  afterAll(() => t.close());

  it('enregistre la question saisie et le début de la réponse, jamais le prompt envoyé', async () => {
    const question = 'Quels sont les risques majeurs du chantier Finance ? Écrire à paul.durand@exemple.fr';
    const r = await withCallQuestion(() => llm().complete({ functionId: 'insights', system: 'Vous êtes Jev, prompt système secret', prompt: `Contexte assemblé : ${question}`, source: 'JEV' }), question);
    const row = await rec(r.modelId);
    expect(row.contentState).toBe('KEPT');
    expect(row.promptExcerpt).toBe('Quels sont les risques majeurs du chantier Finance…');
    expect(row.responseExcerpt).toBe(r.text.slice(0, 50).trimEnd() + '…');
    expect(JSON.stringify(row)).not.toContain('prompt système secret');
    expect(JSON.stringify(row)).not.toContain('paul.durand');
    // Jamais dans la page du journal ni dans l'export.
    const page = (await admin.get(`${A}/usage/calls?from=2026-09-01&to=${new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}&limit=100`).expect(200)).body;
    expect(JSON.stringify(page)).not.toContain('risques majeurs');
  });

  it('détail : masqué sans le droit « voir le détail individuel », montré et tracé avec', async () => {
    const r = await withCallQuestion(() => llm().complete({ functionId: 'insights', prompt: 'p', source: 'JEV' }), 'Où en est le jalon Go-Live ?');
    const { id } = await rec(r.modelId);
    await canSee(false);
    expect((await admin.get(`${A}/usage/calls/${id}/content`).expect(200)).body).toEqual({ state: 'hidden', question: null, response: null, context: null });
    expect(await t.db.auditEntry.count({ where: { entityId: id } })).toBe(0);
    await canSee(true);
    const v = (await admin.get(`${A}/usage/calls/${id}/content`).expect(200)).body;
    expect(v).toMatchObject({ state: 'kept', question: 'Où en est le jalon Go-Live ?', context: null });
    expect(v.response).toBeTruthy();
    expect(await t.db.auditEntry.count({ where: { entityId: id, action: 'Consultation du contenu d’un appel IA' } })).toBe(1);
    await admin.get(`${A}/usage/calls/req_inconnu/content`).expect(404);
  });

  it('sans question saisie : origine de l’appel ; vectorisation : rien', async () => {
    await canSee(true);
    const r = await llm().complete({ functionId: 'insights', prompt: 'Message d’accueil', source: 'COCKPIT' });
    const v = (await admin.get(`${A}/usage/calls/${(await rec(r.modelId)).id}/content`).expect(200)).body;
    expect(v).toMatchObject({ state: 'kept', question: null, context: 'tâche de fond · Insights' });
    const e = await llm().embedTexts(['texte à vectoriser'], 'GUIDE');
    const vec = await rec(e.modelId, 'doc_vec');
    expect(vec.promptExcerpt).toBeNull();
    expect((await admin.get(`${A}/usage/calls/${vec.id}/content`).expect(200)).body.state).toBe('none');
  });

  it('question posée à Jev du Cockpit : portée jusqu’aux appels faits pour y répondre', async () => {
    const pmo = await t.as(WHO.pmo);
    const since = new Date();
    await pmo.post('/api/projects/RISE/assistant/messages', { context: { space: 'pilotage', tab: 'risques' }, text: 'Quels risques sont critiques ?' }).expect(200);
    const rows = await t.db.usageRecord.findMany({ where: { at: { gte: since }, contentState: 'KEPT', promptExcerpt: { not: null } } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.promptExcerpt === 'Quels risques sont critiques ?')).toBe(true);
  });

  it(`efface les extraits au bout de ${CALL_CONTENT_RETENTION_DAYS} jours en gardant la ligne de coût ; appel antérieur : non enregistré`, async () => {
    await canSee(true);
    const r = await withCallQuestion(() => llm().complete({ functionId: 'insights', prompt: 'p', source: 'JEV' }), 'Question ancienne');
    const { id, costEur } = await rec(r.modelId);
    await t.db.usageRecord.update({ where: { id }, data: { at: new Date(Date.now() - (CALL_CONTENT_RETENTION_DAYS + 1) * 86_400_000) } });
    expect(await t.app.get(UsageService).purgeContent()).toBeGreaterThanOrEqual(1);
    const after = await t.db.usageRecord.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({ contentState: 'PURGED', promptExcerpt: null, responseExcerpt: null, costEur });
    expect((await admin.get(`${A}/usage/calls/${id}/content`).expect(200)).body.state).toBe('purged');
    const old = await t.db.usageRecord.findFirstOrThrow({ where: { contentState: null, functionId: 'insights' } });
    expect((await admin.get(`${A}/usage/calls/${old.id}/content`).expect(200)).body.state).toBe('not_recorded');
  });
});
