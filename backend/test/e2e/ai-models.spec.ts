import { setup, TestCtx, Client } from '../helpers';
import { resetAiModels } from '../../src/admin/ai-reset';
import { LlmService } from '../../src/core/llm.service';

/** Modèles d'IA : catégorie, création, suppression et réinitialisation (décisions du 28/09/2026). */
describe('Console — modèles d’IA', () => {
  let t: TestCtx;
  let admin: Client;
  beforeAll(async () => {
    t = await setup();
    admin = await t.as({ accountId: 'u1' });
  });
  afterAll(() => t.close());

  it('chaque modèle a une catégorie ; les modèles existants sont des LLM', async () => {
    const r = await admin.get('/api/admin/models').expect(200);
    expect(r.body.length).toBeGreaterThan(0);
    expect(r.body.every((m: any) => m.category === 'LLM')).toBe(true);
  });

  it('ajoute un modèle Embedding (tracé) et contrôle le formulaire', async () => {
    const r = await admin.post('/api/admin/models', { providerId: 'openai', name: 'Text Embedding 3 Large', description: 'Vectorisation', category: 'embedding', priceIn: 0.12, priceOut: 0 }).expect(201);
    expect(r.body).toMatchObject({ id: 'text-embedding-3-large', providerId: 'openai', category: 'EMBEDDING', priceIn: 0.12, priceOut: 0, active: true });
    const audit = await t.db.auditEntry.findFirst({ where: { action: 'Ajout d’un modèle', entityId: 'text-embedding-3-large' } });
    expect(audit?.target).toContain('Embedding');
    const bad = await admin.post('/api/admin/models', { providerId: 'openai', name: 'X', category: 'VISION', priceIn: 1, priceOut: 1 }).expect(400);
    expect(bad.body.fields.category).toBe('LLM, Embedding ou Reranking');
    const noProv = await admin.post('/api/admin/models', { providerId: 'inconnu', name: 'X', category: 'LLM', priceIn: 1, priceOut: 1 }).expect(400);
    expect(noProv.body.fields.providerId).toBe('introuvable');
    await admin.post('/api/admin/models', { providerId: 'openai', name: 'text embedding 3 large', category: 'EMBEDDING', priceIn: 1, priceOut: 0 }).expect(409);
    // Même nom chez un autre fournisseur : identifiant suffixé.
    const other = await admin.post('/api/admin/models', { providerId: 'mistral', name: 'Text Embedding 3 Large', category: 'EMBEDDING', priceIn: 1, priceOut: 0 }).expect(201);
    expect(other.body.id).toBe('text-embedding-3-large-2');
  });

  it('seuls les LLM servent les fonctions du Cockpit et les notifications', async () => {
    const put = await admin.put('/api/admin/assignments', { insights: { primary: 'text-embedding-3-large', fallback: null } }).expect(422);
    expect(put.body.fields['insights.primary']).toContain('Embedding');
    const fb = await admin.put('/api/admin/assignments', { insights: { primary: 'sonnet', fallback: 'text-embedding-3-large' } }).expect(422);
    expect(fb.body.fields['insights.fallback']).toBeTruthy();
    // Un modèle affecté ne peut pas quitter la catégorie LLM.
    const cat = await admin.patch('/api/admin/models/sonnet', { category: 'RERANKING' }).expect(409);
    expect(cat.body.code).toBe('MODEL_IN_USE');
    // Un modèle libre peut changer de catégorie (tracé).
    const ok = await admin.patch('/api/admin/models/msmall', { category: 'RERANKING' }).expect(200);
    expect(ok.body.category).toBe('RERANKING');
    expect(await t.db.auditEntry.findFirst({ where: { action: 'Changement de catégorie d’un modèle', entityId: 'msmall' } })).toBeTruthy();
    expect(await t.app.get(LlmService).modelAvailable('msmall')).toBe(false);
    const rule = await admin.post('/api/admin/notification-rules', { name: 'Essai', targetProfiles: ['pmo'], projectIds: ['RISE'], modelId: 'msmall', prompt: 'Résume', channels: ['APP'] }).expect(400);
    expect(rule.body.fields.modelId).toMatch(/LLM/);
    const none = await admin.post('/api/admin/notification-rules', { name: 'Essai', targetProfiles: ['pmo'], projectIds: ['RISE'], prompt: 'Résume', channels: ['APP'] }).expect(400);
    expect(none.body.fields.modelId).toBe('obligatoire');
  });

  it('supprime un modèle inutilisé ; refuse (409 IN_USE) un modèle affecté ou qui a servi', async () => {
    await admin.del('/api/admin/models/text-embedding-3-large-2').expect(204);
    expect(await t.db.aiModel.findUnique({ where: { id: 'text-embedding-3-large-2' } })).toBeNull();
    const used = await admin.del('/api/admin/models/sonnet').expect(409);
    expect(used.body.code).toBe('IN_USE');
    expect(used.body.usages.map((u: any) => u.entityType)).toEqual(expect.arrayContaining(['MODEL_ASSIGNMENT', 'USAGE_RECORD']));
    await admin.del('/api/admin/models/inconnu').expect(404);
  });

  it('réinitialisation : modèles, affectation et consommation supprimés, fournisseurs gardés', async () => {
    const providers = await t.db.provider.count();
    const r = await resetAiModels(t.db);
    expect(r.models).toBeGreaterThan(0);
    expect(r.assignments).toBe(3);
    expect(r.usageRecords).toBeGreaterThan(0);
    expect(r.providersKept).toBe(providers);
    expect(await t.db.aiModel.count()).toBe(0);
    expect(await t.db.usageRecord.count()).toBe(0);
    expect(await t.db.budgetThreshold.count()).toBeGreaterThan(0);
    const audit = await t.db.auditEntry.findFirst({ where: { action: 'Réinitialisation des modèles IA' } });
    expect(audit?.severity).toBe('CRITICAL');

    expect((await admin.get('/api/admin/models').expect(200)).body).toEqual([]);
    expect((await admin.get('/api/admin/providers').expect(200)).body).toHaveLength(providers);
    const asg = (await admin.get('/api/admin/assignments').expect(200)).body;
    expect(asg.map((a: any) => [a.primary, a.state])).toEqual([[null, 'UNAVAILABLE'], [null, 'UNAVAILABLE'], [null, 'UNAVAILABLE']]);
    const month = (await admin.get('/api/admin/usage/month').expect(200)).body;
    expect(JSON.stringify(month)).not.toMatch(/"costEur":[1-9]/);
    await expect(t.app.get(LlmService).complete({ functionId: 'insights', prompt: 'x', source: 'COCKPIT' })).rejects.toMatchObject({ response: { code: 'AI_UNAVAILABLE' } });

    // Après la réinitialisation : un LLM ajouté puis affecté remet la fonction en service.
    await admin.post('/api/admin/models', { providerId: 'anthropic', name: 'Claude Sonnet 4.5', category: 'LLM', priceIn: 3, priceOut: 15 }).expect(201);
    const put = await admin.put('/api/admin/assignments', { insights: { primary: 'claude-sonnet-4-5', fallback: null } }).expect(200);
    expect(put.body.find((a: any) => a.functionId === 'insights')).toMatchObject({ primary: 'claude-sonnet-4-5', state: 'NOMINAL' });
  });
});
