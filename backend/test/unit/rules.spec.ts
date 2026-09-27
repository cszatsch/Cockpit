import {
  actionLate,
  confirmedDays,
  countdown,
  deliverableAutoRisk,
  deliverableStatus,
  freshness,
  groupByMonth,
  milestoneGap,
  milestoneStates,
  outsidePeriod,
  progressSignal,
  riskCriticality,
  sessionToConfirm,
  sessionTransitionError,
  to100,
} from '../../src/domain/rules';
import { formatRefDate, frShort, parseFrLabel, parseRefDate } from '../../src/domain/dates';
import { buildAccess, canEditPlanning, canWriteReferential, canWriteSessions, canWriteTools, canWriteWs, profileUsedFor, visibleWorkstreams } from '../../src/domain/rights';

const T = '2026-09-26';

describe('domaine — règles § 7', () => {
  it('fraîcheur : 7 j vigilance, 14 j alerte', () => {
    expect(freshness(7)).toBe('OK');
    expect(freshness(8)).toBe('WATCH');
    expect(freshness(15)).toBe('ALERT');
  });

  it('jalons : écart, confirmation, états, groupement', () => {
    expect(milestoneGap('2027-04-01', '2026-11-01')).toBe(151);
    expect(milestoneGap('2027-04-01', '2027-04-01')).toBe(0);
    expect(confirmedDays('2026-09-07', T)).toBe(19);
    const list = [
      { code: 'J02', iso: '2026-10-30' },
      { code: 'J01', iso: '2026-09-19' },
      { code: 'J05', iso: '2026-10-30' },
    ];
    const st = milestoneStates(list, T);
    expect(st.get(list[1])).toBe('past');
    expect(st.get(list[0])).toBe('next');
    expect(st.get(list[2])).toBe('upcoming');
    expect(groupByMonth(list).map((g) => g.month)).toEqual(['2026-09', '2026-10']);
    expect(outsidePeriod('2026-09-19', '2025-09-01', '2026-02-28')).toBe(true);
  });

  it('criticité des risques', () => {
    expect(riskCriticality(5, 4)).toBe('CRITICAL');
    expect(riskCriticality(4, 3)).toBe('HIGH');
    expect(riskCriticality(2, 3)).toBe('MODERATE');
    expect(riskCriticality(1, 5)).toBe('LOW');
  });

  it('actions en retard', () => {
    expect(actionLate('OPEN', '2026-09-20', T)).toBe(true);
    expect(actionLate('DONE', '2026-09-20', T)).toBe(false);
    expect(actionLate('OPEN', '2026-09-26', T)).toBe(false);
    expect(actionLate('OPEN', null, T)).toBe(false);
  });

  it('livrables : statut et risque automatique', () => {
    expect(deliverableStatus(100, '2026-01-01', '2026-02-01', T)).toBe('DONE');
    expect(deliverableStatus(50, '2026-01-01', '2026-02-01', T)).toBe('LATE');
    expect(deliverableStatus(0, '2026-09-01', '2026-12-01', T)).toBe('ACTIVE');
    expect(deliverableStatus(0, '2026-10-01', '2026-12-01', T)).toBe('FUTURE');
    expect(deliverableAutoRisk(50, '2026-01-01', '2026-02-01', T)).toBe('CRITICAL');
    // 50 % du temps écoulé, 20 % d'avancement : écart 30 > 18
    expect(deliverableAutoRisk(20, '2026-09-16', '2026-10-06', T)).toBe('CRITICAL');
    expect(deliverableAutoRisk(40, '2026-09-16', '2026-10-06', T)).toBe('TENSION');
    expect(deliverableAutoRisk(50, '2026-09-16', '2026-10-06', T)).toBe('OK');
  });

  it('signal d\'avancement (Q9)', () => {
    expect(progressSignal(100, 100)).toBe('OK');
    expect(progressSignal(91, 100)).toBe('WATCH');
    expect(progressSignal(44, 90)).toBe('RISK');
  });

  it('séances : à confirmer et transitions (Q7)', () => {
    expect(sessionToConfirm('PLANNED', T, T)).toBe(true);
    expect(sessionToConfirm('PLANNED', '2026-09-30', T)).toBe(false);
    expect(sessionTransitionError('HELD', 'PLANNED', '2026-09-20', T)).toBeTruthy();
    expect(sessionTransitionError('PLANNED', 'HELD', '2026-10-26', T)).toBeTruthy();
    expect(sessionTransitionError('PLANNED', 'HELD', '2026-09-20', T)).toBeNull();
    expect(sessionTransitionError('CANCELLED', 'PLANNED', '2026-09-20', T)).toBeNull();
  });

  it('compte à rebours et normalisation à 100', () => {
    expect(countdown('2027-04-01', T)).toBe('J-187');
    expect(countdown('2026-09-20', T)).toBe('J+6');
    expect(to100([40, 20, 34]).reduce((a, b) => a + b)).toBe(100);
  });
});

describe('domaine — dates', () => {
  it('dates du Référentiel et libellés', () => {
    expect(parseRefDate('06/2023', 'start')).toEqual({ iso: '2023-06-01', prec: 'M' });
    expect(parseRefDate('02/2026', 'end')).toEqual({ iso: '2026-02-28', prec: 'M' });
    expect(parseRefDate('30/06/2027', 'end')).toEqual({ iso: '2027-06-30', prec: 'D' });
    expect(parseRefDate('2029', 'end')).toEqual({ iso: '2029-12-31', prec: 'Y' });
    expect(formatRefDate('2023-06-01', 'M')).toBe('06/2023');
    expect(parseFrLabel('27 août')).toBe('2026-08-27');
    expect(parseFrLabel('1er avr. 2027')).toBe('2027-04-01');
    expect(parseFrLabel('COPIL 26 sept.')).toBe('2026-09-26');
    expect(parseFrLabel('fin sept.')).toBeNull();
    expect(frShort('2027-04-01')).toBe('1er avr. 2027');
    expect(frShort('2026-09-19')).toBe('19 sept.');
  });
});

describe('domaine — droits (§ 8.4 exemples RG5)', () => {
  const acc = (rows: any[], admin = false, person = 'px', director: string | null = null) => buildAccess('RISE', person, admin, rows, director);

  it('PMO + Responsable A = PMO partout', () => {
    const a = acc([{ profile: 'PMO', wsId: null }, { profile: 'RESPONSABLE', wsId: 'C1' }]);
    expect(canWriteWs(a, 'C3')).toBe(true);
    expect(canWriteReferential(a)).toBe(true);
    expect(visibleWorkstreams(a)).toBeNull();
  });

  it('Admin + Responsable A : écrit sur A, lit le reste, pas le Référentiel', () => {
    const a = acc([{ profile: 'RESPONSABLE', wsId: 'C1' }], true);
    expect(canWriteWs(a, 'C1')).toBe(true);
    expect(canWriteWs(a, 'C3')).toBe(false);
    expect(visibleWorkstreams(a)).toBeNull();
    expect(canWriteReferential(a)).toBe(false);
    expect(profileUsedFor(a, 'C1')).toBe('RESPONSABLE');
  });

  it('Responsable A + Lecteur B', () => {
    const a = acc([{ profile: 'RESPONSABLE', wsId: 'C5' }, { profile: 'LECTEUR', wsId: 'C3' }]);
    expect(canWriteWs(a, 'C5')).toBe(true);
    expect(canWriteWs(a, 'C3')).toBe(false);
    expect(visibleWorkstreams(a)!.sort()).toEqual(['C3', 'C5']);
    expect(canEditPlanning(a, 'workstream', 'C5')).toBe(true);
    expect(canEditPlanning(a, 'milestone', 'J04')).toBe(false);
  });

  it('Admin seul : lecture seule', () => {
    const a = acc([], true);
    expect(canWriteWs(a, 'C1')).toBe(false);
    expect(canWriteTools(a)).toBe(false);
    expect(canWriteSessions(a)).toBe(false);
  });

  it('Directeur de programme : séances', () => {
    const a = acc([{ profile: 'LECTEUR', wsId: 'C8' }], false, 'p03', 'p03');
    expect(canWriteSessions(a)).toBe(true);
  });
});
