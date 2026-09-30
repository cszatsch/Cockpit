import { setup, TestCtx, Client, WHO } from '../helpers';
import { NotificationsService } from '../../src/admin/notifications.service';
import { NotificationWriterService } from '../../src/admin/notification-writer.service';
import { LlmService } from '../../src/core/llm.service';
import { CATCH_UP_PER_MINUTE } from '../../src/domain/notification-rules';

const A = '/api/admin';

/**
 * Planification des notifications (décisions du 30/09/2026) : prochain envoi stocké sur chaque règle, vérifié chaque
 * minute ; file des envois (une occurrence unique par règle, projet et heure prévue) ; rattrapage jusqu'au lendemain
 * 23:59 (fuseau du projet), la plus récente seulement, les autres « remplacées » ; au-delà « abandonné » ; rattrapages
 * limités par minute ; mémoire de la rédaction (envoi précédent) ; jalons en retard vérifiés chaque jour.
 * Horloge figée : samedi 26/09/2026, 10 h 24 à Paris.
 */
describe('Notifications — planification, rattrapage et mémoire', () => {
  let t: TestCtx;
  let admin: Client;
  let svc: NotificationsService;
  let RISE: string;
  let n = 0;
  let previous: Array<{ at: Date; text: string } | null | undefined>;
  const rule = (id = 'n4') => t.db.notificationRule.findUniqueOrThrow({ where: { id } });
  const at = (iso: string) => new Date(iso);
  const deliveries = (ruleId: string, extra: object = {}) => t.db.delivery.findMany({ where: { ruleId, ...extra }, orderBy: { at: 'asc' } });
  /** Règle quotidienne de test (copie de la synthèse), prochain envoi forcé. */
  const daily = async (id: string, hour: string, nextRunAt: Date) => {
    const base = await rule('n4');
    const { createdAt, updatedAt, version, ...r } = base as any;
    await t.db.notificationRule.create({ data: { ...r, id, name: `Quotidienne ${id}`, frequency: 'DAILY', day: null, hour, channels: ['APP'], nextRunAt, scheduleKey: `DAILY||${hour}` } });
  };

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    svc = t.app.get(NotificationsService);
    RISE = (await t.db.project.findFirstOrThrow({ where: { code: 'RISE' } })).id;
    jest.spyOn(t.app.get(LlmService), 'completeWithModelLive').mockImplementation(async (modelId) => ({ text: `Texte rédigé n°${++n}.`, modelId, providerId: 'anthropic', tokensIn: 10, tokensOut: 5, costEur: 0, fallbackUsed: false, ms: 1 }));
    const w = t.app.get(NotificationWriterService);
    const write = w.write.bind(w);
    previous = [];
    jest.spyOn(w, 'write').mockImplementation(async (...args: any[]) => {
      previous.push(args[4]);
      return (write as any)(...args);
    });
  });
  afterAll(() => t.close());

  it('prochain envoi stocké : « Synthèse hebdomadaire » (lundi 7 h 00) → lundi 28/09 ; recalculé à la désactivation et à la réactivation', async () => {
    await svc.syncSchedules();
    expect((await rule()).nextRunAt?.toISOString()).toBe('2026-09-28T05:00:00.000Z');
    await admin.patch(`${A}/notifications/rules/n4`, { on: false }).expect(200);
    expect((await rule()).nextRunAt).toBeNull();
    await admin.patch(`${A}/notifications/rules/n4`, { on: true }).expect(200);
    expect((await rule()).nextRunAt?.toISOString()).toBe('2026-09-28T05:00:00.000Z');
    const before = (await deliveries('n4')).length; // historique de démonstration
    await svc.runDue();
    expect((await deliveries('n4')).length).toBe(before);
  });

  it('à l’heure : parti dans les 5 minutes ; jamais renvoyé, même si la plateforme repasse sur la même échéance', async () => {
    await daily('d1', '10:00', at('2026-09-26T08:22:00Z'));
    await svc.runDue();
    const sent = await deliveries('d1');
    expect(sent.length).toBeGreaterThan(0);
    expect(sent[0]).toMatchObject({ status: 'OK', mode: 'ON_TIME', scheduledAt: at('2026-09-26T08:22:00Z') });
    expect((await rule('d1')).nextRunAt?.toISOString()).toBe('2026-09-27T08:00:00.000Z');
    // Redémarrage : la même échéance revient, l'occurrence existe déjà → rien de plus.
    await t.db.notificationRule.update({ where: { id: 'd1' }, data: { nextRunAt: at('2026-09-26T08:22:00Z') } });
    await svc.runDue();
    expect((await deliveries('d1')).length).toBe(sent.length);
    expect(await t.db.notificationOccurrence.count({ where: { ruleId: 'd1' } })).toBe(1);
  });

  it('rattrapage le lendemain : prévu vendredi 7 h 00, plateforme redémarrée samedi 10 h 24 → envoyé, marqué « rattrapé », heures prévue et réelle', async () => {
    await t.db.notificationRule.update({ where: { id: 'n4' }, data: { nextRunAt: at('2026-09-25T05:00:00Z') } });
    await svc.runDue();
    const d = await deliveries('n4', { mode: 'CATCH_UP' });
    expect(d.length).toBeGreaterThan(0);
    expect(d[0]).toMatchObject({ status: 'OK', scheduledAt: at('2026-09-25T05:00:00Z') });
    const h = (await admin.get(`${A}/notifications/history?limit=200`).expect(200)).body.find((x: any) => x.id === d[0].id);
    expect(h).toMatchObject({ mode: 'CATCH_UP', note: 'Rattrapé · prévu ven. 25/09 07:00, envoyé sam. 26/09 10:24' });
  });

  it('plusieurs occurrences manquées (quotidienne : mercredi à samedi) : seule la plus récente part, les autres « remplacées », hors « À traiter »', async () => {
    await daily('d2', '07:00', at('2026-09-23T05:00:00Z'));
    await svc.runDue();
    const occ = await t.db.notificationOccurrence.findMany({ where: { ruleId: 'd2' }, orderBy: { scheduledAt: 'asc' } });
    expect(occ.map((o) => [o.scheduledAt.toISOString().slice(0, 10), o.status])).toEqual([['2026-09-23', 'REPLACED'], ['2026-09-24', 'REPLACED'], ['2026-09-25', 'REPLACED'], ['2026-09-26', 'SENT']]);
    const replaced = await deliveries('d2', { mode: 'REPLACED' });
    expect(replaced).toHaveLength(3);
    expect(replaced.every((x) => x.status === 'SKIPPED' && x.recipientsCount === 0)).toBe(true);
    expect((await deliveries('d2', { status: 'OK' }))[0].mode).toBe('CATCH_UP');
    const ov = (await admin.get(`${A}/overview`).expect(200)).body.attention;
    expect(ov.some((a: any) => a.kind === 'DELIVERY_FAILED' && /Remplacé/.test(a.detail))).toBe(false);
  });

  it('au-delà de la limite (lundi 21 : limite mardi 22, 23:59) : « abandonné », en échec dans « À traiter »', async () => {
    await t.db.notificationRule.update({ where: { id: 'n4' }, data: { nextRunAt: at('2026-09-21T05:00:00Z') } });
    await svc.runDue();
    const missed = await deliveries('n4', { mode: 'MISSED' });
    expect(missed).toHaveLength(1);
    expect(missed[0]).toMatchObject({ status: 'ERROR', recipientsCount: 0, scheduledAt: at('2026-09-21T05:00:00Z') });
    expect(missed[0].error).toMatch(/après la limite de rattrapage \(mar\. 22\/09 23:59\)/);
    const ov = (await admin.get(`${A}/overview`).expect(200)).body.attention;
    expect(ov.some((a: any) => a.kind === 'DELIVERY_FAILED' && /limite de rattrapage/.test(a.detail))).toBe(true);
  });

  it(`débit : ${CATCH_UP_PER_MINUTE} rattrapages par minute au plus, du plus ancien au plus récent`, async () => {
    const ids = Array.from({ length: CATCH_UP_PER_MINUTE + 2 }, (_, i) => `r${String(i).padStart(2, '0')}`);
    // Prévus vendredi, de 06:00 à 06:11 (heure de Paris), créés dans le désordre.
    for (const [i, id] of [...ids].entries()) if (i % 2) await daily(id, `06:${String(i).padStart(2, '0')}`, at(`2026-09-25T04:${String(i).padStart(2, '0')}:00Z`));
    for (const [i, id] of [...ids].entries()) if (!(i % 2)) await daily(id, `06:${String(i).padStart(2, '0')}`, at(`2026-09-25T04:${String(i).padStart(2, '0')}:00Z`));
    await svc.runDue();
    const sent = async () => (await t.db.notificationOccurrence.findMany({ where: { ruleId: { in: ids }, status: 'SENT' } })).map((o) => o.ruleId).sort();
    expect(await sent()).toEqual(ids.slice(0, CATCH_UP_PER_MINUTE));
    await svc.runDue(); // minute suivante
    expect(await sent()).toEqual(ids);
  });

  it('mémoire : l’envoi suivant de la règle reçoit le texte du précédent (même projet, même profil) ; sans envoi de moins de 35 jours, rien', async () => {
    const first = (await deliveries('d1', { status: 'OK' })).find((d) => d.llmResponse)!;
    previous.length = 0;
    await t.db.notificationRule.update({ where: { id: 'd1' }, data: { nextRunAt: at('2026-09-26T08:21:00Z') } });
    await svc.runDue();
    const mem = previous.find((p) => p && p.text === first.llmResponse);
    expect(mem).toBeTruthy();
    expect(mem!.at.toISOString()).toBe(first.at.toISOString());
    // Le texte précédent part au modèle dans la partie variable du prompt, avec la consigne de dire ce qui a changé.
    const inputs = (t.app.get(LlmService).completeWithModelLive as jest.Mock).mock.calls.map((c) => c[1]);
    expect(inputs.some((i: any) => i.systemTail?.includes('## Envoi précédent de cette notification') && i.systemTail.includes(first.llmResponse!) && i.cache === true)).toBe(true);
    await t.db.delivery.updateMany({ where: { ruleId: 'd1' }, data: { at: at('2026-08-01T08:00:00Z') } });
    expect(await svc.previousSend('d1', RISE, first.profile!)).toBeNull();
  });

  it('jalon en retard : signalé par la vérification quotidienne, une seule fois ; modifier sa date vaut confirmation (jamais en retard)', async () => {
    const lateRule = await t.db.notificationRule.findFirstOrThrow({ where: { trigger: 'MILESTONE_LATE' } });
    const m = await t.db.milestone.findFirstOrThrow({ where: { projectId: RISE, iso: { lt: '2026-09-26' } }, orderBy: { iso: 'asc' } });
    const key = `${lateRule.id}|${RISE}|${m.id}`;
    await t.db.milestone.update({ where: { id: m.id }, data: { confirmedAt: null } });
    await t.db.delivery.deleteMany({ where: { eventKey: key } });
    await svc.dailyCheck();
    const count = await t.db.delivery.count({ where: { eventKey: key } });
    expect(count).toBeGreaterThan(0);
    await svc.dailyCheck();
    expect(await t.db.delivery.count({ where: { eventKey: key } })).toBe(count);
    const f = await t.db.milestone.findFirstOrThrow({ where: { projectId: RISE, iso: { gt: '2026-09-26' } }, orderBy: { iso: 'asc' } });
    await (await t.as(WHO.pmo)).patch(`/api/projects/RISE/milestones/${f.id}`, { iso: '2026-09-21' }).expect(200);
    await svc.dailyCheck();
    expect(await t.db.delivery.count({ where: { eventKey: `${lateRule.id}|${RISE}|${f.id}` } })).toBe(0);
  });
});
