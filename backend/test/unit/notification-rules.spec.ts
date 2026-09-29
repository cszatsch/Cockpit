import {
  atOf,
  blockingErrors,
  ERR_NO_MODEL,
  ERR_NO_RECIPIENT,
  fromUiRule,
  parseAt,
  relativeFr,
  RuleRow,
  toUiHistory,
  toUiRule,
} from '../../src/domain/notification-rules';

const row = (o: Partial<RuleRow> = {}): RuleRow => ({
  id: 'n1',
  kind: 'ALERT',
  name: 'Jalon en retard',
  targetProfiles: ['resp', 'pmo'],
  projectIds: ['RISE', 'ATLAS'],
  platform: false,
  modelId: 'haiku',
  prompt: 'Rédige une alerte sur {jalon}.',
  subject: 'Jalon en retard · {jalon}',
  body: 'Le jalon {jalon} est en retard. {reponse_llm}',
  frequency: 'IMMEDIATE',
  day: null,
  hour: null,
  everyDays: null,
  channels: ['EMAIL', 'APP'],
  trigger: 'MILESTONE_LATE',
  enabled: true,
  ...o,
});

describe('Notifications et alertes : adaptateur table ↔ vue (spécification § 2)', () => {
  const llm = new Set(['haiku']);

  it('convertit une règle de la table vers le modèle Rule de la vue', () => {
    expect(toUiRule(row(), llm)).toEqual({
      id: 'n1',
      type: 'alerte',
      title: 'Jalon en retard',
      evt: 'un jalon est en retard',
      profils: ['PMO', 'Responsable'],
      projets: ['RISE', 'ATLAS'],
      canaux: ['app', 'mail'],
      freq: 'imm',
      at: '',
      on: true,
      model: 'haiku',
      prompt: 'Rédige une alerte sur {jalon}.',
      subject: 'Jalon en retard · {jalon}',
      body: 'Le jalon {jalon} est en retard. {reponse_llm}',
    });
  });

  it('présente un modèle inactif ou supprimé comme « aucun modèle », une règle de plateforme comme « Tous »', () => {
    const u = toUiRule(row({ modelId: 'supprime', platform: true, projectIds: [] }), llm);
    expect(u.model).toBeNull();
    expect(u.projets).toEqual(['*']);
    expect(toUiRule(row({ modelId: '' }), llm).model).toBeNull();
  });

  it('fait l’aller-retour vue → table → vue sans perte', () => {
    for (const r of [
      row(),
      row({ kind: 'NOTIFICATION', frequency: 'WEEKLY', day: 'mardi', hour: '07:30', platform: true, projectIds: [], trigger: 'SCHEDULE', channels: ['APP'] }),
      row({ frequency: 'DAILY', hour: '18:00', targetProfiles: [] }),
      row({ frequency: 'CUSTOM', everyDays: 5, hour: '10:00' }),
    ]) {
      const u = toUiRule(r, llm);
      const back = fromUiRule(u);
      expect(toUiRule({ ...back, id: r.id, trigger: r.trigger }, llm)).toEqual(u);
    }
  });

  it('« Tous » devient une règle de plateforme sans projet individuel', () => {
    const d = fromUiRule({ ...toUiRule(row(), llm), projets: ['*', 'RISE'] });
    expect(d.platform).toBe(true);
    expect(d.projectIds).toEqual([]);
    const p = fromUiRule({ ...toUiRule(row(), llm), projets: ['rise'], model: null, profils: ['Admin', 'Lecteur'] });
    expect(p).toMatchObject({ platform: false, projectIds: ['RISE'], modelId: '', targetProfiles: ['admin', 'lec'] });
  });

  it('lit et écrit le calendrier (champ at) avec des valeurs par défaut', () => {
    expect(atOf({ frequency: 'WEEKLY', day: 'lundi', hour: '08:00', everyDays: null })).toBe('lundi 08:00');
    expect(atOf({ frequency: 'DAILY', day: null, hour: '18:00', everyDays: null })).toBe('18:00');
    expect(atOf({ frequency: 'CUSTOM', day: null, hour: null, everyDays: null })).toBe('tous les 3 jours à 09:00');
    expect(parseAt('week', '')).toEqual({ day: 'lundi', hour: '08:00', everyDays: null });
    expect(parseAt('week', 'Vendredi 17h30')).toEqual({ day: 'vendredi', hour: '17:30', everyDays: null });
    expect(parseAt('day', '')).toEqual({ day: null, hour: '09:00', everyDays: null });
    expect(parseAt('custom', 'tous les 10 jours à 06:15')).toEqual({ day: null, hour: '06:15', everyDays: 10 });
    expect(parseAt('imm', 'lundi 08:00')).toEqual({ day: null, hour: null, everyDays: null });
  });
});

describe('Notifications et alertes : cas bloquants (§ 3) et historique', () => {
  it('bloque l’envoi sans modèle ou sans destinataire', () => {
    expect(blockingErrors(row())).toEqual([]);
    expect(blockingErrors(row({ modelId: '' }))).toEqual([ERR_NO_MODEL]);
    expect(blockingErrors(row({ targetProfiles: [] }))).toEqual([ERR_NO_RECIPIENT]);
    expect(blockingErrors(row({ modelId: 'inactif', targetProfiles: [] }), new Set(['haiku']))).toEqual([ERR_NO_MODEL, ERR_NO_RECIPIENT]);
  });

  it('formate une ligne d’historique', () => {
    const now = new Date('2026-09-29T10:00:00Z');
    expect(relativeFr(new Date('2026-09-29T09:59:40Z'), now)).toBe('à l’instant');
    expect(relativeFr(new Date('2026-09-29T09:48:00Z'), now)).toBe('il y a 12 min');
    expect(relativeFr(new Date('2026-09-29T07:00:00Z'), now)).toBe('il y a 3 h');
    expect(relativeFr(new Date('2026-09-28T08:00:00Z'), now)).toBe('hier');
    expect(relativeFr(new Date('2026-09-26T10:00:00Z'), now)).toBe('il y a 3 j');
    const h = toUiHistory({ id: 'd1', ruleId: 'n1', at: new Date('2026-09-26T10:00:00Z'), channel: 'EMAIL', recipientsCount: 4, status: 'ERROR', error: 'boom' }, now);
    expect(h).toEqual({ id: 'd1', rid: 'n1', w: 'il y a 3 j', c: 'E-mail', d: '4 destinataires', ok: false, at: '2026-09-26T10:00:00.000Z', error: 'boom' });
    expect(toUiHistory({ ...h, ruleId: 'n1', at: now, channel: 'APP', recipientsCount: 1, status: 'OK' }, now)).toMatchObject({ c: 'Application', d: '1 destinataire', ok: true });
  });
});
