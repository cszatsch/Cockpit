import { setup, TestCtx, Client } from '../helpers';
import { resetAiModels } from '../../src/admin/ai-reset';
import { LlmService } from '../../src/core/llm.service';

/** Modèles d'IA : catégorie, fiche enrichie, chaîne Documents, suppression et réinitialisation (28/09/2026). */
describe('Console — modèles d’IA', () => {
  let t: TestCtx;
  let admin: Client;
  beforeAll(async () => {
    t = await setup();
    admin = await t.as({ accountId: 'u1' });
  });
  afterAll(() => t.close());

  it('fiche d’un modèle : catégorie, date de sortie, max output tokens, tarif selon l’unité', async () => {
    const r = await admin.get('/api/admin/models').expect(200);
    expect(r.body.find((m: any) => m.id === 'sonnet')).toMatchObject({ category: 'LLM', releaseDate: '2025-09-29', maxOutputTokens: 64000, price: { unit: 'TOKENS', in: 3, out: 15, per1k: null } });
    expect(r.body.find((m: any) => m.id === 'te3large')).toMatchObject({ category: 'EMBEDDING', maxOutputTokens: null, price: { unit: 'TOKENS', in: 0.12, out: null } });
    expect(r.body.find((m: any) => m.id === 'rerank35')).toMatchObject({ category: 'RERANKING', price: { unit: 'REQUESTS', per1k: 1.85, in: null } });
  });

  it('ajoute un modèle : les champs obligatoires dépendent de la catégorie', async () => {
    const llm = { providerId: 'openai', name: 'GPT-5 nano', category: 'LLM', releaseDate: '2025-08-07', maxOutputTokens: 128000, price: { unit: 'TOKENS', in: 0.05, out: 0.4 } };
    const created = await admin.post('/api/admin/models', llm).expect(201);
    expect(created.body).toMatchObject({ id: 'gpt-5-nano', releaseDate: '2025-08-07', maxOutputTokens: 128000, price: { unit: 'TOKENS', in: 0.05, out: 0.4 }, active: true });
    expect((await t.db.auditEntry.findFirst({ where: { action: 'Ajout d’un modèle', entityId: 'gpt-5-nano' } }))?.target).toContain('0.05/0.4 €/MTok');

    const miss = await admin.post('/api/admin/models', { providerId: 'openai', name: 'X1', category: 'LLM', price: { unit: 'TOKENS', in: 1 } }).expect(400);
    expect(miss.body.fields).toMatchObject({ releaseDate: 'obligatoire', maxOutputTokens: 'obligatoire pour un LLM', 'price.out': expect.any(String) });
    const future = await admin.post('/api/admin/models', { ...llm, name: 'X2', releaseDate: '2999-01-01' }).expect(400);
    expect(future.body.fields.releaseDate).toMatch(/futur/);
    await admin.post('/api/admin/models', { ...llm, name: 'X3', maxOutputTokens: 12.5 }).expect(400);

    // Embedding : entrée seule, pas de max output tokens (ignoré).
    const emb = await admin.post('/api/admin/models', { providerId: 'mistral', name: 'Mistral Embed', category: 'embedding', releaseDate: '2023-12-11', maxOutputTokens: 999, price: { unit: 'TOKENS', in: 0.09, out: 5 } }).expect(201);
    expect(emb.body).toMatchObject({ category: 'EMBEDDING', maxOutputTokens: null, price: { unit: 'TOKENS', in: 0.09, out: null } });
    const embReq = await admin.post('/api/admin/models', { providerId: 'mistral', name: 'X4', category: 'EMBEDDING', releaseDate: '2024-01-01', price: { unit: 'REQUESTS', per1k: 1 } }).expect(400);
    expect(embReq.body.fields['price.unit']).toMatch(/Reranking/);

    // Reranking : à la requête ou au token.
    const rrk = await admin.post('/api/admin/models', { providerId: 'cohere', name: 'Rerank 3.5 lite', category: 'RERANKING', releaseDate: '2025-01-15', price: { unit: 'REQUESTS', per1k: 0.9 } }).expect(201);
    expect(rrk.body.price).toEqual({ unit: 'REQUESTS', in: null, out: null, per1k: 0.9 });
    await admin.post('/api/admin/models', { providerId: 'cohere', name: 'X5', category: 'RERANKING', releaseDate: '2025-01-15', price: { unit: 'REQUESTS' } }).expect(400);

    await admin.post('/api/admin/models', { ...llm, providerId: 'inconnu', name: 'X6' }).expect(400);
    await admin.post('/api/admin/models', { ...llm, name: 'gpt-5 NANO' }).expect(409);
  });

  it('modifier : date, max output tokens et tarif contrôlés sur l’état final', async () => {
    const r = await admin.patch('/api/admin/models/haiku', { maxOutputTokens: 32000, releaseDate: '2025-10-01' }).expect(200);
    expect(r.body).toMatchObject({ maxOutputTokens: 32000, releaseDate: '2025-10-01', price: { in: 1, out: 5 } });
    // Compatibilité : tarifs à plat.
    expect((await admin.patch('/api/admin/models/haiku', { priceIn: 0.8 }).expect(200)).body.price).toMatchObject({ unit: 'TOKENS', in: 0.8, out: 5 });
    await admin.patch('/api/admin/models/haiku', { releaseDate: '2999-01-01' }).expect(400);
    await admin.patch('/api/admin/models/rerank35', { price: { unit: 'TOKENS' } }).expect(400);
    expect((await admin.patch('/api/admin/models/rerank35', { price: { unit: 'TOKENS', in: 0.5 } }).expect(200)).body.price).toEqual({ unit: 'TOKENS', in: 0.5, out: null, per1k: null });
    await admin.patch('/api/admin/models/rerank35', { price: { unit: 'REQUESTS', per1k: 1.85 } }).expect(200);
  });

  it('chaque fonction n’accepte que sa catégorie ; la chaîne Documents a trois étapes', async () => {
    const f = (await admin.get('/api/admin/functions').expect(200)).body;
    expect(f.functions.map((x: any) => [x.id, x.category, x.group, x.step])).toEqual([
      ['insights', 'LLM', null, null], ['crud', 'LLM', null, null],
      ['doc_vec', 'EMBEDDING', 'documents', 1], ['doc_rrk', 'RERANKING', 'documents', 2], ['doc_syn', 'LLM', 'documents', 3],
    ]);
    expect(f.groups).toEqual([{ id: 'documents', name: 'Documents', description: expect.any(String) }]);
    const put = await admin.put('/api/admin/assignments', { doc_vec: { primary: 'sonnet', fallback: null } }).expect(422);
    expect(put.body.fields['doc_vec.primary']).toContain('LLM');
    const fb = await admin.put('/api/admin/assignments', { insights: { primary: 'sonnet', fallback: 'te3large' } }).expect(422);
    expect(fb.body.fields['insights.fallback']).toContain('Embedding');
    const ok = await admin.put('/api/admin/assignments', { doc_vec: { primary: 'mistral-embed', fallback: 'te3large' } }).expect(200);
    expect(ok.body.find((a: any) => a.functionId === 'doc_vec')).toMatchObject({ primary: 'mistral-embed', fallback: 'te3large', state: 'NOMINAL', category: 'EMBEDDING', step: 1 });
    expect(await t.db.auditEntry.findFirst({ where: { action: 'Changement de modèle principal', target: 'Documents · étape 1 · Vectorisation → Mistral Embed' } })).toBeTruthy();
    // Un modèle affecté ne peut pas changer de catégorie ; un modèle libre le peut (tracé).
    expect((await admin.patch('/api/admin/models/sonnet', { category: 'RERANKING' }).expect(409)).body.code).toBe('MODEL_IN_USE');
    const moved = await admin.patch('/api/admin/models/msmall', { category: 'RERANKING' }).expect(200);
    expect(moved.body).toMatchObject({ category: 'RERANKING', maxOutputTokens: null, price: { unit: 'TOKENS', in: 0.1, out: null } });
    expect(await t.app.get(LlmService).modelAvailable('msmall')).toBe(false);
    expect(await t.app.get(LlmService).modelAvailable('msmall', 'RERANKING')).toBe(true);
    const rule = await admin.post('/api/admin/notification-rules', { name: 'Essai', targetProfiles: ['pmo'], projectIds: ['RISE'], modelId: 'msmall', prompt: 'Résume', channels: ['APP'] }).expect(400);
    expect(rule.body.fields.modelId).toMatch(/LLM/);
  });

  it('coût estimé : tokens pour les LLM et l’Embedding, requêtes pour le Reranking', async () => {
    const asg = (await admin.get('/api/admin/assignments').expect(200)).body;
    const rrk = asg.find((a: any) => a.functionId === 'doc_rrk');
    expect(rrk.volume30d).toEqual({ tokensIn: expect.any(Number), tokensOut: 0, requests: expect.any(Number) });
    expect(rrk.estimatedMonthlyCost.primary).toBeCloseTo((rrk.volume30d.requests / 1000) * 1.85, 2);
    const syn = asg.find((a: any) => a.functionId === 'doc_syn');
    expect(syn.estimatedMonthlyCost.fallback).toBeCloseTo((syn.volume30d.tokensIn * 3 + syn.volume30d.tokensOut * 15) / 1e6, 2);
  });

  it('chaîne Documents : une étape indisponible suspend les suivantes et arrête l’analyse', async () => {
    await t.db.provider.update({ where: { id: 'cohere' }, data: { status: 'ERROR' } });
    const asg = (await admin.get('/api/admin/assignments').expect(200)).body;
    expect(asg.filter((a: any) => a.group === 'documents').map((a: any) => a.state)).toEqual(['NOMINAL', 'UNAVAILABLE', 'BLOCKED']);
    const llm = t.app.get(LlmService);
    const before = await t.db.usageRecord.count();
    await expect(llm.analyzeDocument({ prompt: 'x', text: 'texte', source: 'COCKPIT' })).rejects.toMatchObject({ response: { code: 'AI_UNAVAILABLE', message: expect.stringContaining('Étape 2 · Reclassement') } });
    expect(await t.db.usageRecord.count()).toBe(before); // aucune étape appelée
    await t.db.provider.update({ where: { id: 'cohere' }, data: { status: 'OK' } });
  });

  it('supprime un modèle inutilisé ; refuse (409 IN_USE) un modèle affecté ou qui a servi', async () => {
    await admin.del('/api/admin/models/rerank-3-5-lite').expect(204);
    const used = await admin.del('/api/admin/models/sonnet').expect(409);
    expect(used.body.usages.map((u: any) => u.entityType)).toEqual(expect.arrayContaining(['MODEL_ASSIGNMENT', 'USAGE_RECORD']));
    await admin.del('/api/admin/models/inconnu').expect(404);
  });

  it('réinitialisation : modèles, affectation et consommation supprimés, fournisseurs gardés', async () => {
    const providers = await t.db.provider.count();
    const r = await resetAiModels(t.db);
    expect(r).toMatchObject({ assignments: 5, providersKept: providers });
    expect(await t.db.aiModel.count()).toBe(0);
    expect(await t.db.usageRecord.count()).toBe(0);
    const asg = (await admin.get('/api/admin/assignments').expect(200)).body;
    expect(asg.map((a: any) => a.state)).toEqual(['UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', 'BLOCKED', 'BLOCKED']);
    await expect(t.app.get(LlmService).complete({ functionId: 'insights', prompt: 'x', source: 'COCKPIT' })).rejects.toMatchObject({ response: { code: 'AI_UNAVAILABLE' } });
  });
});
