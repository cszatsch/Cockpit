import {
  catchUpDeadline,
  occurrencesUntil,
  nextSendAt,
  parisDay,
  scheduleKey,
  atOf,
  isSendTime,
  profileScope,
  removedVariablesIn,
  sendSlot,
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
  prompt: 'Rédige une alerte sur le projet {projet}.',
  subject: 'Jalon en retard · {projet}',
  body: 'Un jalon de {projet} est en retard. {reponse_llm}',
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
      prompt: 'Rédige une alerte sur le projet {projet}.',
      subject: 'Jalon en retard · {projet}',
      body: 'Un jalon de {projet} est en retard. {reponse_llm}',
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
      row({ frequency: 'DAILY', hour: '07:30' }),
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

  it('lit et écrit le calendrier (champ at) avec des valeurs par défaut : 07:00, lundi', () => {
    expect(atOf({ frequency: 'WEEKLY', day: 'mardi', hour: '08:30' })).toBe('mardi 08:30');
    expect(atOf({ frequency: 'DAILY', day: null, hour: '18:00' })).toBe('18:00');
    expect(atOf({ frequency: 'DAILY', day: null, hour: null })).toBe('07:00');
    expect(atOf({ frequency: 'WEEKLY', day: null, hour: null })).toBe('lundi 07:00');
    expect(parseAt('week', '')).toEqual({ day: 'lundi', hour: '07:00', everyDays: null });
    expect(parseAt('week', 'Vendredi 17h30')).toEqual({ day: 'vendredi', hour: '17:30', everyDays: null });
    expect(parseAt('day', '')).toEqual({ day: null, hour: '07:00', everyDays: null });
    expect(parseAt('imm', 'lundi 08:00')).toEqual({ day: null, hour: null, everyDays: null });
  });

  it('heures par pas de 30 minutes ; créneau d’un instant ; variables retirées', () => {
    expect(['07:00', '07:30', '23:30'].map(isSendTime)).toEqual([true, true, true]);
    expect(['07:15', '24:00', '', null].map(isSendTime)).toEqual([false, false, false, false]);
    expect(['07:00', '07:29', '07:30', '07:59'].map(sendSlot)).toEqual(['07:00', '07:00', '07:30', '07:30']);
    expect(removedVariablesIn('{jalon} · {projet} · {seuil}')).toEqual(['{jalon}', '{seuil}']);
    expect(removedVariablesIn('{projet} · {date} · {reponse_llm}')).toEqual([]);
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
    expect(h).toEqual({ id: 'd1', rid: 'n1', w: 'il y a 3 j', c: 'E-mail', d: '4 destinataires', ok: false, at: '2026-09-26T10:00:00.000Z', error: 'boom', mode: null, planned: null, note: '' });
    expect(toUiHistory({ ...h, ruleId: 'n1', at: now, channel: 'APP', recipientsCount: 1, status: 'OK' }, now)).toMatchObject({ c: 'Application', d: '1 destinataire', ok: true });
    // Envoi planifié rattrapé : heure prévue et heure réelle (heure de Paris).
    expect(toUiHistory({ ...h, ruleId: 'n1', at: new Date('2026-09-30T08:12:00Z'), channel: 'APP', recipientsCount: 3, status: 'OK', mode: 'CATCH_UP', scheduledAt: new Date('2026-09-29T07:00:00Z') }, now).note).toBe('Rattrapé · prévu mar. 29/09 09:00, envoyé mer. 30/09 10:12');
  });
});

describe('Notifications : périmètre d’un texte par profil (point 7)', () => {
  it('PMO et administrateur : tout le projet ; Responsable : chantiers communs ; Lecteur : chantiers lisibles par tous', () => {
    expect(profileScope('pmo', [])).toBe('*');
    expect(profileScope('admin', [undefined])).toBe('*');
    expect(profileScope('resp', [{ responsable: ['C1', 'C2'], lecteur: [] }, { responsable: ['C2', 'C3'], lecteur: ['C1'] }])).toEqual(['C2']);
    expect(profileScope('resp', [{ responsable: ['C1'], lecteur: [] }, { responsable: ['C5'], lecteur: [] }])).toEqual([]);
    expect(profileScope('lec', [{ responsable: [], lecteur: ['C3', 'C4'] }, { responsable: ['C4'], lecteur: ['C8'] }])).toEqual(['C4']);
    expect(profileScope('resp', [])).toEqual([]);
  });
});

describe('Planification : prochain envoi (heure de Paris)', () => {
  const r = (frequency: string, hour: string | null, day: string | null = null, enabled = true, trigger = 'SCHEDULE') => ({ enabled, trigger, frequency, hour, day });
  // 26/09/2026 à 10 h 24 à Paris (UTC+2) : un samedi.
  const now = new Date('2026-09-26T08:24:00Z');
  it('quotidienne : aujourd’hui si l’heure n’est pas passée, sinon demain', () => {
    expect(nextSendAt(r('DAILY', '18:00'), now)!.toISOString()).toBe('2026-09-26T16:00:00.000Z');
    expect(nextSendAt(r('DAILY', '07:00'), now)!.toISOString()).toBe('2026-09-27T05:00:00.000Z');
    // Strictement après : à 7 h 00 pile, l'envoi suivant est le lendemain.
    expect(nextSendAt(r('DAILY', '07:00'), new Date('2026-09-27T05:00:00Z'))!.toISOString()).toBe('2026-09-28T05:00:00.000Z');
  });
  it('hebdomadaire : le prochain jour indiqué ; « personnalisée » comme quotidienne', () => {
    expect(nextSendAt(r('WEEKLY', '07:00', 'lundi'), now)!.toISOString()).toBe('2026-09-28T05:00:00.000Z');
    expect(nextSendAt(r('WEEKLY', '12:30', 'samedi'), now)!.toISOString()).toBe('2026-09-26T10:30:00.000Z');
    expect(nextSendAt(r('WEEKLY', '09:00', 'samedi'), now)!.toISOString()).toBe('2026-10-03T07:00:00.000Z');
    expect(nextSendAt(r('CUSTOM', '18:00'), now)!.toISOString()).toBe('2026-09-26T16:00:00.000Z');
  });
  it('changement d’heure : 7 h 00 à Paris le 25/10/2026 (heure d’hiver) = 6 h 00 UTC', () => {
    expect(nextSendAt(r('DAILY', '07:00'), new Date('2026-10-24T12:00:00Z'))!.toISOString()).toBe('2026-10-25T06:00:00.000Z');
    expect(parisDay(new Date('2026-10-24T22:30:00Z'))).toBe('2026-10-25');
  });
  it('règle inactive, immédiate ou d’événement : pas d’envoi planifié', () => {
    expect(nextSendAt(r('DAILY', '07:00', null, false), now)).toBeNull();
    expect(nextSendAt(r('IMMEDIATE', null), now)).toBeNull();
    expect(nextSendAt(r('DAILY', '18:00', null, true, 'DOCUMENT_ANALYZED'), now)).toBeNull();
    expect(scheduleKey(r('DAILY', '07:00', null, false))).toBe('off');
    expect(scheduleKey(r('WEEKLY', '07:00', 'Lundi'))).toBe('WEEKLY|lundi|07:00');
  });
});

describe('Rattrapage : limite et occurrences manquées', () => {
  it('limite : lendemain du jour prévu, 23:59:59, dans le fuseau du projet', () => {
    // Mardi 29/09, 9 h 00 à Paris → mercredi 30/09 23:59:59 à Paris.
    expect(catchUpDeadline(new Date('2026-09-29T07:00:00Z'), 'Europe/Paris').toISOString()).toBe('2026-09-30T21:59:59.999Z');
    // Même instant, projet à New York (3 h 00 le 29/09 là-bas) → 30/09 23:59:59 à New York.
    expect(catchUpDeadline(new Date('2026-09-29T07:00:00Z'), 'America/New_York').toISOString()).toBe('2026-10-01T03:59:59.999Z');
  });
  it('occurrences manquées d’une règle quotidienne, de la première échéance jusqu’à maintenant', () => {
    const r = { enabled: true, trigger: 'SCHEDULE', frequency: 'DAILY', day: null, hour: '09:00' };
    const occ = occurrencesUntil(r, new Date('2026-09-29T07:00:00Z'), new Date('2026-10-01T08:00:00Z'));
    expect(occ.map((d) => d.toISOString())).toEqual(['2026-09-29T07:00:00.000Z', '2026-09-30T07:00:00.000Z', '2026-10-01T07:00:00.000Z']);
  });
});
