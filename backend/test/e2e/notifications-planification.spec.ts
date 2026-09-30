import { setup, TestCtx, Client, WHO } from '../helpers';
import { NotificationsService } from '../../src/admin/notifications.service';
import { LlmService } from '../../src/core/llm.service';

const A = '/api/admin';

/**
 * Planification des notifications (décision du 30/09/2026) : prochain envoi stocké sur chaque règle, vérifié chaque
 * minute ; rattrapage le jour même d'un envoi manqué ; jalons en retard vérifiés chaque jour.
 * Horloge figée : samedi 26/09/2026, 10 h 24 à Paris.
 */
describe('Notifications — planification', () => {
  let t: TestCtx;
  let admin: Client;
  let svc: NotificationsService;
  let RISE: string;
  const rule = () => t.db.notificationRule.findUniqueOrThrow({ where: { id: 'n4' } });
  const sent = (eventKey: string) => t.db.delivery.findMany({ where: { ruleId: 'n4', eventKey } });

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    svc = t.app.get(NotificationsService);
    RISE = (await t.db.project.findFirstOrThrow({ where: { code: 'RISE' } })).id;
    jest.spyOn(t.app.get(LlmService), 'completeWithModelLive').mockImplementation(async (modelId) => ({ text: 'Synthèse de la semaine.', modelId, providerId: 'anthropic', tokensIn: 10, tokensOut: 5, costEur: 0, fallbackUsed: false, ms: 1 }));
  });
  afterAll(() => t.close());

  it('prochain envoi calculé et stocké : « Synthèse hebdomadaire » (lundi 7 h 00) → lundi 28/09 7 h 00 ; recalculé à la désactivation et à la réactivation', async () => {
    await svc.syncSchedules();
    expect((await rule()).nextRunAt?.toISOString()).toBe('2026-09-28T05:00:00.000Z');
    await admin.patch(`${A}/notifications/rules/n4`, { on: false }).expect(200);
    expect((await rule()).nextRunAt).toBeNull();
    await admin.patch(`${A}/notifications/rules/n4`, { on: true }).expect(200);
    expect((await rule()).nextRunAt?.toISOString()).toBe('2026-09-28T05:00:00.000Z');
  });

  it('pas encore l’heure : rien ne part', async () => {
    const before = await t.db.delivery.count({ where: { ruleId: 'n4' } }); // historique de démonstration
    await svc.runDue();
    expect(await t.db.delivery.count({ where: { ruleId: 'n4' } })).toBe(before);
  });

  it('rattrapage le jour même : prévue à 9 h 24, plateforme redémarrée à 10 h 24 → envoyée, une seule fois ; prochain envoi lundi', async () => {
    await t.db.notificationRule.update({ where: { id: 'n4' }, data: { nextRunAt: new Date('2026-09-26T07:24:00Z') } });
    await svc.runDue();
    const first = await sent(`n4|${RISE}|2026-09-26`);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((d) => d.status === 'OK')).toBe(true);
    expect((await rule()).nextRunAt?.toISOString()).toBe('2026-09-28T05:00:00.000Z');
    // Même échéance repassée (plateforme relancée) : pas de second envoi.
    await t.db.notificationRule.update({ where: { id: 'n4' }, data: { nextRunAt: new Date('2026-09-26T07:24:00Z') } });
    await svc.runDue();
    expect((await sent(`n4|${RISE}|2026-09-26`)).length).toBe(first.length);
  });

  it('envoi manqué un autre jour (plateforme arrêtée jusqu’au lendemain) : abandonné, tracé en échec dans « À traiter »', async () => {
    await t.db.notificationRule.update({ where: { id: 'n4' }, data: { nextRunAt: new Date('2026-09-25T05:00:00Z') } });
    await svc.runDue();
    expect(await sent(`n4|${RISE}|2026-09-25`)).toHaveLength(0);
    const missed = await sent('n4|manque|2026-09-25');
    expect(missed).toHaveLength(1);
    expect(missed[0]).toMatchObject({ status: 'ERROR', recipientsCount: 0 });
    expect(missed[0].error).toMatch(/^Non envoyé : la plateforme était arrêtée/);
    const ov = (await admin.get(`${A}/overview`).expect(200)).body.attention;
    expect(ov.some((a: any) => a.kind === 'DELIVERY_FAILED' && /plateforme était arrêtée/.test(a.detail))).toBe(true);
    expect((await rule()).nextRunAt?.toISOString()).toBe('2026-09-28T05:00:00.000Z');
  });

  it('jalon en retard : signalé par la vérification quotidienne, une seule fois ; modifier sa date vaut confirmation (jamais en retard)', async () => {
    const lateRule = await t.db.notificationRule.findFirstOrThrow({ where: { trigger: 'MILESTONE_LATE' } });
    const m = await t.db.milestone.findFirstOrThrow({ where: { projectId: RISE, iso: { lt: '2026-09-26' } }, orderBy: { iso: 'asc' } });
    const key = `${lateRule.id}|${RISE}|${m.id}`;
    // Jalon passé et jamais confirmé : en retard.
    await t.db.milestone.update({ where: { id: m.id }, data: { confirmedAt: null } });
    await t.db.delivery.deleteMany({ where: { eventKey: key } });
    await svc.dailyCheck();
    const n = await t.db.delivery.count({ where: { eventKey: key } });
    expect(n).toBeGreaterThan(0);
    await svc.dailyCheck();
    expect(await t.db.delivery.count({ where: { eventKey: key } })).toBe(n);
    // Déplacer la date dans le passé vaut confirmation (§ 7.2) : le jalon n'est pas en retard.
    const f = await t.db.milestone.findFirstOrThrow({ where: { projectId: RISE, iso: { gt: '2026-09-26' } }, orderBy: { iso: 'asc' } });
    await (await t.as(WHO.pmo)).patch(`/api/projects/RISE/milestones/${f.id}`, { iso: '2026-09-21' }).expect(200);
    await svc.dailyCheck();
    expect(await t.db.delivery.count({ where: { eventKey: `${lateRule.id}|${RISE}|${f.id}` } })).toBe(0);
  });
});
