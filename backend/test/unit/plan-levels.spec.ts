import { filterPlan, planRows, planStatusOf, PlanPhase, PlanSub, PlanWs, segmentOf } from '../../src/domain/plan-levels';
import { planLevelOf } from '../../src/domain/report-components';
import { arbitrationSummary } from '../../src/domain/arbitration';

/** Composant Planning des rapports : niveaux de l'écran Planning (11/10/2026). */
describe('Planning des rapports : niveaux de détail', () => {
  const today = '2026-09-26';
  const phases: PlanPhase[] = [
    { id: 'P1', code: '1', name: 'Cadrage', start: '2026-01-01', end: '2026-06-30', status: 'DONE', progress: 100, critical: false },
    { id: 'P2', code: '2', name: 'Réalisation', start: '2026-07-01', end: '2026-12-31', status: 'IN_PROGRESS', progress: 30, critical: true },
  ];
  const subs: PlanSub[] = [
    { id: 'S1', phaseId: 'P2', code: '2.1', name: 'Lot 1', start: '2026-07-01', end: '2026-08-31', status: 'DONE', progress: 100, critical: false },
    { id: 'S2', phaseId: 'P2', code: '2.2', name: 'Lot 2', start: '2026-09-01', end: '2026-12-31', status: 'IN_PROGRESS', progress: 20, critical: false },
    { id: 'S3', phaseId: 'P2', code: '2.3', name: 'Sans dates', start: null, end: null, status: 'PLANNED', progress: 0, critical: false },
  ];
  const wss: PlanWs[] = [
    { id: 'W2', code: 'C2', name: 'Finance', start: null, end: null, progress: 40, critical: false, phaseIds: ['P2'], subIds: ['S1', 'S2'] },
    { id: 'W1', code: 'C1', name: 'Achats', start: '2026-02-01', end: '2026-11-30', progress: 50, critical: false, phaseIds: ['P1', 'P2'], subIds: [] },
  ];
  const input = { phases, subs, wss, today, currentPhaseId: 'P2' };

  it('Phases ; Phase > Sous-phase (sous-phases datées seulement)', () => {
    expect(planRows('ph', input).map((r) => r.code)).toEqual(['1', '2']);
    expect(planRows('ph', input)[1]).toMatchObject({ current: true, critical: true });
    expect(planRows('phsp', input).map((r) => `${r.level}:${r.code}`)).toEqual(['0:1', '0:2', '1:2.1', '1:2.2']);
  });

  it('Phase > Chantier > Sous-phase : segment du chantier dans la phase, chantiers dans l’ordre des codes', () => {
    const rows = planRows('phchsp', input);
    expect(rows.map((r) => `${r.level}:${r.kind}:${r.code}`)).toEqual(['0:ph:1', '1:ch:C1', '0:ph:2', '1:ch:C1', '1:ch:C2', '2:sp:2.1', '2:sp:2.2']);
    // C1 dans la phase 1 : chantier ∩ phase ; avancement de la phase (pas de sous-phase).
    expect(rows[1]).toMatchObject({ start: '2026-02-01', end: '2026-06-30', progress: 100, status: 'DONE' });
    // C2 dans la phase 2 : de sa première à sa dernière sous-phase ; avancement pondéré par la durée (62 j à 100 %, 122 j à 20 %).
    const seg = segmentOf(wss[0], phases[1], subs, today).row;
    expect(seg).toMatchObject({ start: '2026-07-01', end: '2026-12-31', progress: 47, status: 'IN_PROGRESS' });
  });

  it('Tous les chantiers ; Un chantier (le chantier puis ses sous-phases)', () => {
    expect(planRows('ch', input).map((r) => `${r.code}:${r.start}:${r.end}`)).toEqual(['C1:2026-02-01:2026-11-30', 'C2:2026-07-01:2026-12-31']);
    expect(planRows('one', { ...input, wsId: 'W2' }).map((r) => `${r.level}:${r.code}`)).toEqual(['0:C2', '1:2.1', '1:2.2']);
    // Chantier sans sous-phase propre : sous-phases de ses phases qui chevauchent ses dates.
    expect(planRows('one', { ...input, wsId: 'W1' }).map((r) => r.code)).toEqual(['C1', '2.1', '2.2']);
    expect(planRows('one', { ...input, wsId: 'inconnu' })).toEqual([]);
  });

  it('filtre par période et statut : parentes gardées pour le contexte (11/10/2026)', () => {
    const rows = planRows('phsp', input);
    expect(rows.map((r) => planStatusOf(r, today))).toEqual(['DONE', 'ACTIVE', 'DONE', 'ACTIVE']);
    expect(filterPlan(rows, (r) => planStatusOf(r, today) === 'ACTIVE').map((r) => r.code)).toEqual(['2', '2.2']);
    expect(filterPlan(rows, (r) => r.code === '2.1').map((r) => r.code)).toEqual(['2', '2.1']);
    expect(planStatusOf({ status: 'IN_PROGRESS', end: '2026-09-01' }, today)).toBe('LATE');
  });

  it('templates antérieurs : niveau déduit (chantier → un chantier ; « Sous-phases » → phase > sous-phase)', () => {
    expect(planLevelOf({ id: 'planning', scope: 'WORKSTREAM', targetId: 'W1' })).toBe('one');
    expect(planLevelOf({ id: 'planning', scope: 'PROJECT', indicators: ['milestones', 'subphases'] })).toBe('phsp');
    expect(planLevelOf({ id: 'planning', scope: 'PROJECT' })).toBe('ph');
    expect(planLevelOf({ id: 'planning', scope: 'PROJECT', level: 'ch' })).toBe('ch');
  });
});

describe('Fiche d’arbitrage dans un rapport : notes et recommandation', () => {
  it('note pondérée sur le barème commun ; recommandée = la mieux notée ; égalité sans recommandation', () => {
    const s = arbitrationSummary({ question: 'Q ?', options: [{ code: 'A', label: 'Interne' }, { code: 'B', label: 'Externe' }], criteria: [{ name: 'Coût', weightPct: 60, scoreA: 4, commentA: '', scoreB: 2, commentB: '' }, { name: 'Délai', weightPct: 40, scoreA: 2, commentA: '', scoreB: 3, commentB: '' }] })!;
    expect(s.options.map((o) => o.score)).toEqual([3.2, 2.4]);
    expect(s).toMatchObject({ reco: 'A', tie: false, question: 'Q ?' });
    expect(s.criteria.map((c) => c.name)).toEqual(['Coût', 'Délai']);
    const tie = arbitrationSummary({ options: [{ code: 'A', label: 'X' }, { code: 'B', label: 'Y' }], criteria: [{ name: 'C', weightPct: 100, scoreA: 3, commentA: '', scoreB: 3, commentB: '' }] })!;
    expect(tie).toMatchObject({ reco: null, tie: true });
    expect(arbitrationSummary(null)).toBeNull();
    expect(arbitrationSummary({})).toBeNull();
    // Ancien format (critères par option) : barème commun déduit.
    const old = arbitrationSummary({ options: [{ code: 'A', label: 'X', criteria: [{ name: 'Coût', weightPct: 100, score: 1, comment: '' }] }, { code: 'B', label: 'Y', criteria: [{ name: 'coût', weightPct: 100, score: 4, comment: '' }] }] })!;
    expect(old).toMatchObject({ reco: 'B' });
  });
});
