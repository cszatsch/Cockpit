import { setup, TestCtx, WHO } from '../helpers';
import { encryptSecret } from '../../src/core/crypto';
import { ApiCardsService } from '../../src/admin/api-cards.service';
import { LlmService } from '../../src/core/llm.service';
import { COCKPIT_Q_CASE, COCKPIT_Q_WRITE } from '../../src/domain/jev-router-cockpit';
import { WRITE_CANCELLED_REPLY, WRITE_CANCEL_LABEL } from '../../src/domain/jev-cockpit-write';

const R = '/api/projects/RISE';
const C = `${R}/assistant/messages`;

/**
 * Jev du Cockpit — cas 3, modification des données (brief du 01/10/2026) : extraction par le modèle Gestion des
 * données, résolution par le serveur (personnes, chantiers, échelles, dates), questions à choix une à une dans la
 * conversation (mémoire), droits, récapitulatif sans écriture, confirmation (renforcée pour une suppression), écriture
 * par le service métier (origine JEV), lien vers l'enregistrement ; actions de mitigation proposées comme actions liées.
 */
describe('Jev du Cockpit — cas 3 : modification des données', () => {
  let t: TestCtx;

  beforeAll(async () => {
    t = await setup();
    await t.db.apiCard.create({ data: { id: 'jev', name: 'JEV', category: 'Stratégie', endpoint: 'https://api.typesafe.test/v1/systemone', keyEncrypted: encryptSecret('cle-de-test'), keyLast4: 'test', authMode: 'BEARER', method: 'POST', body: JSON.stringify({ model: 'jev-latest' }) } });
    // Aiguillage simulé : modification, écriture confirmée.
    t.app.get(ApiCardsService).fetchImpl = (async () => new Response(JSON.stringify({ answers: { [COCKPIT_Q_CASE]: { type: 'choice', choice: 'modification', confidence: 0.95, probabilities: { modification: 0.95 } }, [COCKPIT_Q_WRITE]: { type: 'noul', noul: 0.95 } } }), { status: 200, headers: { 'content-type': 'application/json' } })) as any;
    await t.db.skill.create({ data: { n: 'Gestion des données', t: '## Objectif\nPréparer les modifications.', on: true, position: 90, updatedBy: 'Test' } });
  });
  afterAll(() => t.close());

  /** Extraction simulée du modèle (les autres appels gardent le bouchon). */
  const extraction = (ops: unknown[]) => {
    const llm = t.app.get(LlmService);
    const real = llm.complete.bind(llm);
    return jest.spyOn(llm, 'complete').mockImplementation(async (input: any) => ({ ...(await real(input)), text: JSON.stringify({ operations: ops }) }));
  };
  const ask = (c: any, text: string, conversationId?: string) => c.post(C, { context: { space: 'pilotage', tab: 'risques' }, text, ...(conversationId ? { conversationId } : {}) }).expect(200);
  const pick = (c: any, conversationId: string, value: unknown) => c.post(C, { context: { space: 'pilotage', tab: 'risques' }, text: String(value), conversationId, answer: { value } }).expect(200);

  it('risque sur plusieurs chantiers, ou transverse : choix multiple (pastilles à cocher), « Tous les chantiers » réservé au PMO', async () => {
    const pmo = await t.as(WHO.pmo);
    const base = { objet: 'RISK', operation: 'CREATE', code: null, actions_liees: [] };
    // Plusieurs chantiers cités : résolus d'un coup.
    let spy = extraction([{ ...base, champs: { n: 'Arbitrages trop lents', p: 4, i: 5, wsIds: 'Finance, Interfaces', owner: 'Sophie Marchand' } }]);
    let r = await ask(pmo, 'Ajoute ce risque sur Finance et Interfaces');
    spy.mockRestore();
    expect(r.body.write).toBe('RECAP');
    expect(r.body.proposedChanges[0].patch).toMatchObject({ wsIds: ['C1', 'C4'], allWs: false });
    // Transverse : « tous les chantiers ».
    spy = extraction([{ ...base, champs: { n: 'Arbitrages mensuels incompatibles', p: 4, i: 5, wsIds: 'tous les chantiers', owner: 'Sophie Marchand' } }]);
    r = await ask(pmo, 'Ajoute ce risque transverse');
    spy.mockRestore();
    expect(r.body.proposedChanges[0]).toMatchObject({ patch: { allWs: true, wsIds: [] } });
    expect(r.body.proposedChanges[0].rows).toEqual(expect.arrayContaining([{ t: 'Chantiers', b: 'Tous les chantiers' }]));
    const ok = await pmo.post(`${R}/assistant/changes/${r.body.proposedChanges[0].id}/confirm`).expect(200);
    expect(await t.db.risk.findFirst({ where: { code: ok.body.result.code } })).toMatchObject({ allWs: true, wsId: null });
    // Chantier non précisé : question à choix multiple, puis validation de la sélection.
    spy = extraction([{ ...base, champs: { n: 'Disponibilité des experts', p: 3, i: 3, owner: 'Sophie Marchand' } }]);
    const q = await ask(pmo, 'Ajoute ce risque');
    spy.mockRestore();
    expect(q.body.write).toBe('ASK');
    expect(q.body.choices.filter((c: any) => c.answer.toggle).length).toBeGreaterThan(1);
    expect(q.body.choices.map((c: any) => c.label)).toEqual(expect.arrayContaining(['Tous les chantiers (transverse)', 'Valider la sélection']));
    const v = await pick(pmo, q.body.conversationId, ['C2', 'C3']);
    expect(v.body.proposedChanges[0].patch).toMatchObject({ wsIds: ['C2', 'C3'] });
    // Un Responsable (C5) ne crée pas de risque transverse, ni sur un chantier qui n'est pas le sien.
    const resp = await t.as(WHO.respC5);
    spy = extraction([{ ...base, champs: { n: 'Risque transverse', p: 3, i: 3, wsIds: 'tous', owner: 'moi' } }]);
    const rq = await ask(resp, 'Ajoute ce risque à tous les chantiers');
    spy.mockRestore();
    expect(rq.body).toMatchObject({ write: 'ASK' });
    expect(rq.body.reply).toMatch(/réservé au PMO/);
  });

  it('exemple du brief : impact « moyen à élevé » → question à choix ; récapitulatif ; risque puis actions liées ; lien', async () => {
    const pmo = await t.as(WHO.pmo);
    const spy = extraction([{
      objet: 'RISK', operation: 'CREATE', code: null,
      champs: { n: 'Moindre disponibilité de l’équipe Finance pendant la clôture annuelle', p: 'Élevée', i: 'Moyen à élevé', wsId: 'Finance', owner: 'Sophie Marchand', plan: 'Description : … Impacts : … Mitigation : repérer les sujets, nommer un référent, revoir le planning.' },
      actions_liees: [{ n: 'Repérer les sujets qui exigent la Finance' }, { n: 'Nommer un référent Finance disponible' }],
    }]);
    const before = await t.db.risk.count();
    const q = await ask(pmo, 'Ajoute le risque suivant dans le chantier Finance : …');
    expect(q.body).toMatchObject({ route: '3', write: 'ASK', proposedChanges: [] });
    expect(q.body.reply).toMatch(/Impact « Moyen à élevé » : 3 \(Moyen\) ou 4 \(Élevé\)/);
    expect(q.body.choices).toEqual([{ label: '3 · Moyen', answer: { value: 3 } }, { label: '4 · Élevé', answer: { value: 4 } }, { label: WRITE_CANCEL_LABEL, answer: { cancel: true } }]);
    const call = spy.mock.calls[0][0] as any;
    expect(call.functionId).toBe('crud');
    expect(call.system).toContain('## Skill : Gestion des données');
    expect(call.system).toContain('## Extraire une demande de modification');
    expect(call.systemTail).toMatch(/Chantiers où l’utilisateur peut écrire : C1 · Finance/);
    spy.mockRestore();

    // Réponse au choix : sans modèle ; tout est complet → récapitulatif, rien d'écrit.
    const llm = jest.spyOn(t.app.get(LlmService), 'complete');
    const r = await pick(pmo, q.body.conversationId, 4);
    expect(llm).not.toHaveBeenCalled();
    llm.mockRestore();
    expect(r.body).toMatchObject({ write: 'RECAP', conversationId: q.body.conversationId });
    expect(await t.db.risk.count()).toBe(before);
    const [risk, a1, a2] = r.body.proposedChanges;
    expect(risk).toMatchObject({ entityType: 'RISK', op: 'CREATE', group: 'main', patch: { p: 4, i: 4, wsIds: ['C1'], allWs: false, owner: 'p07' } });
    expect(risk.rows).toEqual(expect.arrayContaining([{ t: 'Probabilité', b: '4 (Élevé)' }, { t: 'Impact', b: '4 (Élevé)' }, { t: 'Chantiers', b: 'C1 · Finance' }, { t: 'Porteur', b: 'Sophie Marchand' }]));
    expect([a1.group, a2.group]).toEqual(['linked', 'linked']);
    expect(a1.patch).toMatchObject({ n: 'Repérer les sujets qui exigent la Finance', wsId: 'C1', owner: 'p07', sourceType: 'RISK', sourceRef: risk.id });

    // Action liée avant le risque : refusée ; risque validé, puis action liée à ce risque.
    await pmo.post(`${R}/assistant/changes/${a1.id}/confirm`).expect(422);
    const ok = await pmo.post(`${R}/assistant/changes/${risk.id}/confirm`).expect(200);
    expect(ok.body.link).toMatchObject({ space: 'pilotage', tab: 'risques', code: ok.body.result.code });
    const act = await pmo.post(`${R}/assistant/changes/${a1.id}/confirm`).expect(200);
    expect(act.body.result).toMatchObject({ sourceType: 'RISK' });
    expect((await t.db.action.findFirst({ where: { code: act.body.result.code } }))!.sourceId).toBe(ok.body.result.id);
    const audit = await t.db.auditEntry.findFirst({ where: { entityType: 'RISK', entityId: ok.body.result.id } });
    expect(audit!.origin).toBe('JEV');
    // La conversation garde les échanges (mémoire).
    expect(await t.db.jevMessage.count({ where: { conversationId: q.body.conversationId } })).toBe(4);
  });

  it('référence avec le préfixe du projet (« RISE-R01 », 09/10/2026) : ramenée au code R01', async () => {
    const pmo = await t.as(WHO.pmo);
    const spy = extraction([{ objet: 'RISK', operation: 'UPDATE', code: 'RISE-R01', champs: { dueIso: '31/10' } }]);
    const r = await ask(pmo, 'Ajoute au risque "RISE-R01" une date d’échéance au 31/10');
    spy.mockRestore();
    expect(r.body).toMatchObject({ write: 'RECAP' });
    expect(r.body.proposedChanges[0]).toMatchObject({ entityType: 'RISK', op: 'UPDATE', patch: { dueIso: '2026-10-31' } });
  });

  it('échéance d’une action liée (09/10/2026) : reprise du risque à sa création, une seule fois ; puis indépendante', async () => {
    const pmo = await t.as(WHO.pmo);
    const spy = extraction([{
      objet: 'RISK', operation: 'CREATE', code: null,
      champs: { n: 'Risque daté', p: 3, i: 3, wsIds: 'C1', owner: 'Sophie Marchand', plan: 'Plan', dueIso: '31/10' },
      actions_liees: [{ n: 'Action sans échéance' }, { n: 'Action datée', dueIso: '15/11' }],
    }]);
    const r = await ask(pmo, 'Ajoute ce risque avec deux actions');
    spy.mockRestore();
    expect(r.body).toMatchObject({ write: 'RECAP' });
    const [risk, a1, a2] = r.body.proposedChanges;
    expect(risk.patch).toMatchObject({ dueIso: '2026-10-31' });
    expect(a1.patch).toMatchObject({ dueIso: '2026-10-31' });
    expect(a1.rows).toEqual(expect.arrayContaining([{ t: 'Échéance', b: '31/10/2026 (reprise du risque)' }]));
    expect(a2.patch).toMatchObject({ dueIso: '2026-11-15' });
    const rk = (await pmo.post(`${R}/assistant/changes/${risk.id}/confirm`).expect(200)).body.result;
    const act = (await pmo.post(`${R}/assistant/changes/${a1.id}/confirm`).expect(200)).body.result;
    expect(act.dueIso).toBe('2026-10-31');
    // Ensuite, les deux dates sont indépendantes.
    await pmo.patch(`${R}/risks/${rk.code}`, { dueIso: '2026-12-15' }).expect(200);
    expect((await t.db.action.findFirst({ where: { id: act.id } }))!.dueIso).toBe('2026-10-31');
    await pmo.patch(`${R}/actions/${act.code}`, { dueIso: '2026-11-30' }).expect(200);
    expect((await t.db.risk.findFirst({ where: { id: rk.id } }))!.dueIso).toBe('2026-12-15');
  });

  it('Référentiel (09/10/2026) : supprimer une phase désignée par son nom ; refus si elle est utilisée ; PMO seulement', async () => {
    const pmo = await t.as(WHO.pmo);
    const ph = (await pmo.post(`${R}/phases`, { seq: 99, name: 'Ancrer le changement', startDate: '2028-01-09', endDate: '2028-11-09', ownerId: 'p01' }).expect(201)).body;
    let spy = extraction([{ objet: 'PHASE', operation: 'DELETE', code: `${ph.code}. Ancrer le changement`, champs: {} }]);
    const r = await ask(pmo, `Supprimer la phase "${ph.code}. Ancrer le changement"`);
    spy.mockRestore();
    expect(r.body).toMatchObject({ write: 'RECAP' });
    const d = r.body.proposedChanges[0];
    expect(d).toMatchObject({ entityType: 'PHASE', op: 'DELETE', confirmCode: ph.code, rows: [{ t: `${ph.code} · Ancrer le changement`, b: 'supprimé définitivement' }] });
    await pmo.post(`${R}/assistant/changes/${d.id}/confirm`).send({ confirmCode: 'x' }).expect(422);
    const ok = await pmo.post(`${R}/assistant/changes/${d.id}/confirm`).send({ confirmCode: ph.code }).expect(200);
    expect(ok.body.result).toMatchObject({ deleted: true });
    await pmo.get(`${R}/phases/${ph.id}`).expect(404);
    expect((await t.db.auditEntry.findMany({ where: { entityType: 'PHASE', entityId: ph.id } })).map((x) => x.origin)).toEqual(expect.arrayContaining(['MANUAL', 'JEV']));
    // Phase utilisée (sous-phases, jalons…) : refus immédiat, éléments cités.
    spy = extraction([{ objet: 'PHASE', operation: 'DELETE', code: 'Realize', champs: {} }]);
    const used = await ask(pmo, 'Supprime la phase Realize');
    spy.mockRestore();
    expect(used.body.reply).toMatch(/est utilisée par \d+ éléments? .*Rien n’a été enregistré/);
    // Responsable de chantier : Référentiel réservé au PMO.
    spy = extraction([{ objet: 'PHASE', operation: 'DELETE', code: 'Realize', champs: {} }]);
    const resp = await ask(await t.as(WHO.respC5), 'Supprime la phase Realize');
    spy.mockRestore();
    expect(resp.body.reply).toMatch(/modifiable par le PMO uniquement/);
  });

  it('Référentiel : créer un jalon transverse (phase déduite de sa date) ; objet non pris en charge → message qui oriente', async () => {
    const pmo = await t.as(WHO.pmo);
    let spy = extraction([{ objet: 'MILESTONE', operation: 'CREATE', code: null, champs: { n: 'Comité de validation V1', iso: '2026-11-12', wsId: 'transverse', owner: 'Karim' } }]);
    const r = await ask(pmo, 'Crée le jalon Comité de validation V1 le 12/11, transverse, porté par Karim');
    spy.mockRestore();
    expect(r.body).toMatchObject({ write: 'RECAP' });
    const j = r.body.proposedChanges[0];
    expect(j.patch).toMatchObject({ n: 'Comité de validation V1', iso: '2026-11-12', wsId: null, owner: 'p06' });
    expect(j.patch.phaseId).toBeTruthy();
    const ok = await pmo.post(`${R}/assistant/changes/${j.id}/confirm`).expect(200);
    expect(ok.body.link).toMatchObject({ space: 'projet', tab: 'referentiel' });
    spy = extraction([{ objet: 'SESSION', operation: 'DELETE', code: 'COPIL 21', champs: {} }]);
    const un = await ask(pmo, 'Supprime la séance du COPIL 21');
    spy.mockRestore();
    expect(un.body.reply).toMatch(/^Je ne sais pas encore supprimer les séances\./);
    await pmo.del(`${R}/milestones/${ok.body.result.id}`).expect(204);
  });

  it('Référentiel, livrable (09/10/2026) : désigné par son nom, nom à retaper pour supprimer ; création avec lien vers Pilotage › Livrables', async () => {
    const pmo = await t.as(WHO.pmo);
    const lv = (await pmo.post(`${R}/deliverables`, { name: 'Note de cadrage', subphaseId: 'SP5.2', ownerId: 'p06', due: '2026-11-20' }).expect(201)).body;
    let spy = extraction([{ objet: 'DELIVERABLE', operation: 'DELETE', code: 'Note de cadrage', champs: {} }]);
    const r = await ask(pmo, 'supprime le livrable "Note de cadrage"');
    spy.mockRestore();
    expect(r.body).toMatchObject({ write: 'RECAP' });
    const d = r.body.proposedChanges[0];
    expect(d).toMatchObject({ entityType: 'DELIVERABLE', op: 'DELETE', confirmCode: 'Note de cadrage', rows: [{ t: 'Note de cadrage', b: 'supprimé définitivement' }] });
    const bad = await pmo.post(`${R}/assistant/changes/${d.id}/confirm`).send({ confirmCode: 'x' }).expect(422);
    expect(bad.body.message).toBe('Pour supprimer, retapez le nom Note de cadrage');
    await pmo.post(`${R}/assistant/changes/${d.id}/confirm`).send({ confirmCode: 'note de cadrage' }).expect(200);
    expect(await t.db.deliverable.findFirst({ where: { id: lv.id } })).toBeNull();
    spy = extraction([{ objet: 'DELIVERABLE', operation: 'CREATE', code: null, champs: { name: 'Plan de recette', subphaseId: '5.2', workstreamId: 'aucun', ownerId: 'Karim', due: '20/11' } }]);
    const c = await ask(pmo, 'Crée le livrable Plan de recette dans la sous-phase 5.2, porté par Karim, pour le 20/11');
    spy.mockRestore();
    expect(c.body).toMatchObject({ write: 'RECAP' });
    expect(c.body.proposedChanges[0].patch).toMatchObject({ name: 'Plan de recette', subphaseId: 'SP5.2', workstreamId: null, ownerId: 'p06', due: '2026-11-20' });
    const ok = await pmo.post(`${R}/assistant/changes/${c.body.proposedChanges[0].id}/confirm`).expect(200);
    expect(ok.body.link).toMatchObject({ space: 'pilotage', tab: 'livrables', code: 'Plan de recette' });
    await pmo.del(`${R}/deliverables/${ok.body.result.id}`).expect(204);
  });

  it('Responsable : chantier hors de son périmètre → choix parmi ses chantiers ; porteur ambigu → choix', async () => {
    const resp = await t.as(WHO.respC5);
    const spy = extraction([{ objet: 'ACTION', operation: 'CREATE', code: null, champs: { n: 'Relancer l’éditeur', wsId: 'Finance', owner: 'Marc', dueIso: '15/11' } }]);
    const q = await ask(resp, 'Crée une action sur Finance pour Marc');
    spy.mockRestore();
    expect(q.body.reply).toMatch(/Vous ne pouvez écrire que sur vos chantiers : C1 · Finance n’en fait pas partie/);
    expect(q.body.choices.map((c: any) => c.answer.value)).toEqual(['C5', 'C6', undefined]);
    const r = await pick(resp, q.body.conversationId, 'C5');
    expect(r.body).toMatchObject({ write: 'RECAP' });
    expect(r.body.proposedChanges[0].patch).toMatchObject({ wsId: 'C5', owner: 'p11', dueIso: '2026-11-15' });
  });

  it('suppression : confirmation renforcée (code à retaper) ; objet d’un autre chantier refusé', async () => {
    const pmo = await t.as(WHO.pmo);
    let spy = extraction([{ objet: 'ISSUE', operation: 'DELETE', code: 'P03', champs: {} }]);
    const r = await ask(pmo, 'Supprime le problème P03');
    spy.mockRestore();
    expect(r.body).toMatchObject({ write: 'RECAP' });
    expect(r.body.reply).toMatch(/retapez le code/);
    const d = r.body.proposedChanges[0];
    expect(d).toMatchObject({ op: 'DELETE', confirmCode: 'P03', rows: [{ b: 'supprimé définitivement' }] });
    await pmo.post(`${R}/assistant/changes/${d.id}/confirm`).send({ confirmCode: 'P02' }).expect(422);
    expect(await t.db.issue.count({ where: { code: 'P03' } })).toBe(1);
    await pmo.post(`${R}/assistant/changes/${d.id}/confirm`).send({ confirmCode: 'p03' }).expect(200);
    expect(await t.db.issue.count({ where: { code: 'P03' } })).toBe(0);

    const resp = await t.as(WHO.respC5);
    spy = extraction([{ objet: 'RISK', operation: 'DELETE', code: 'R03', champs: {} }]);
    const no = await ask(resp, 'Supprime R03');
    spy.mockRestore();
    expect(no.body).toMatchObject({ write: 'REFUSED', proposedChanges: [] });
  });

  it('décision arbitrée : lecture seule ; annulation d’une demande en cours', async () => {
    const pmo = await t.as(WHO.pmo);
    let spy = extraction([{ objet: 'DECISION', operation: 'UPDATE', code: 'D-003', champs: { p: 'critique' } }]);
    const r = await ask(pmo, 'Passe D-003 en priorité critique');
    spy.mockRestore();
    expect(r.body).toMatchObject({ write: 'REFUSED' });
    expect(r.body.reply).toMatch(/arbitrée/);

    spy = extraction([{ objet: 'RISK', operation: 'CREATE', code: null, champs: { n: 'Départ du key user Ventes', wsId: 'C3' } }]);
    const q = await ask(pmo, 'Crée un risque : départ du key user Ventes');
    spy.mockRestore();
    expect(q.body).toMatchObject({ write: 'ASK' });
    const conv = await t.db.jevConversation.findUnique({ where: { id: q.body.conversationId } });
    expect(conv!.draft).not.toBeNull();
    const x = await t.as(WHO.pmo).then((c) => c.post(C, { context: { space: 'pilotage' }, text: WRITE_CANCEL_LABEL, conversationId: q.body.conversationId, answer: { cancel: true } }).expect(200));
    expect(x.body).toMatchObject({ write: 'CANCELLED', reply: WRITE_CANCELLED_REPLY });
    expect((await t.db.jevConversation.findUnique({ where: { id: q.body.conversationId } }))!.draft).toBeNull();
  });

  it('nouvelle conversation : plus de mémoire ; conversation d’un autre compte refusée', async () => {
    const pmo = await t.as(WHO.pmo);
    const n = await pmo.post(`${R}/assistant/conversations`).expect(201);
    expect(n.body.id).toMatch(/^jc-/);
    await (await t.as(WHO.respC5)).post(C, { context: { space: 'pilotage' }, text: 'x', conversationId: n.body.id }).expect(404);
  });
});
