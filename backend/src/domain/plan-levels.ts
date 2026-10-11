/**
 * Lignes du composant Planning d'un rapport selon le niveau choisi (11/10/2026) : mêmes règles que l'écran Planning du
 * Cockpit (`RISE Cockpit.dc.html`, `segOf` / `segsOf`).
 *
 * - « Phases » : une ligne par phase ;
 * - « Phase > Sous-phase » : chaque phase, puis ses sous-phases datées ;
 * - « Phase > Chantier > Sous-phase » : chaque phase, ses chantiers (segment du chantier dans la phase : de sa première à sa
 *   dernière sous-phase de la phase, sinon chantier ∩ phase ; avancement moyen de ces sous-phases pondéré par leur durée,
 *   sinon celui de la phase), puis les sous-phases du chantier dans la phase ;
 * - « Tous les chantiers » : une ligne par chantier, dans l'ordre des codes ;
 * - « Un chantier » : le chantier, puis ses sous-phases (sinon celles de ses phases qui chevauchent ses dates).
 */
import type { PlanLevel } from './report-components';

export type PlanStatus = 'DONE' | 'IN_PROGRESS' | 'PLANNED';
export interface PlanPhase { id: string; code: string; name: string; start: string; end: string; status: PlanStatus; progress: number; critical: boolean }
export interface PlanSub { id: string; phaseId: string; code: string; name: string; start: string | null; end: string | null; status: PlanStatus; progress: number; critical: boolean }
export interface PlanWs { id: string; code: string; name: string; start: string | null; end: string | null; progress: number; critical: boolean; phaseIds: string[]; subIds: string[] }
export interface PlanRow {
  level: 0 | 1 | 2; kind: 'ph' | 'ch' | 'sp';
  /** Phase, sous-phase ou chantier d'origine (jalons). */ ref: string;
  code: string; name: string; start: string; end: string; status: PlanStatus; progress: number; current: boolean; critical: boolean;
}

const MS = 86400000;
const span = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS) + 1;
/** Ordre croissant des codes (C1, C2…, 1.1, 1.2…), comme l'écran Planning. */
export const byCode = (a: { code: string }, b: { code: string }) => String(a.code).localeCompare(String(b.code), 'fr', { numeric: true });
/** État d'un chantier ou d'un segment : terminé à 100 %, à venir avant son début, sinon en cours. */
export const segStatus = (start: string, progress: number, today: string): PlanStatus => (progress >= 100 ? 'DONE' : start > today ? 'PLANNED' : 'IN_PROGRESS');

const dated = (s: PlanSub): s is PlanSub & { start: string; end: string } => !!s.start && !!s.end;
const subRow = (s: PlanSub & { start: string; end: string }, level: 1 | 2): PlanRow => ({ level, kind: 'sp', ref: s.id, code: s.code, name: s.name, start: s.start, end: s.end, status: s.status, progress: s.progress, current: false, critical: s.critical });

/** Segment d'un chantier dans une phase, et ses sous-phases de la phase. */
export function segmentOf(w: PlanWs, p: PlanPhase, subs: PlanSub[], today: string) {
  const own = subs.filter((s) => s.phaseId === p.id && w.subIds.includes(s.id)).filter(dated).sort(byCode);
  let a = own.length ? own.reduce((m, x) => (x.start < m ? x.start : m), own[0].start) : w.start && w.start > p.start ? w.start : p.start;
  let b = own.length ? own.reduce((m, x) => (x.end > m ? x.end : m), own[0].end) : w.end && w.end < p.end ? w.end : p.end;
  if (!a || !b || b < a) { a = p.start; b = p.end; }
  const wt = (x: { start: string; end: string }) => (x.end >= x.start ? span(x.start, x.end) : 1);
  const progress = own.length ? Math.round(own.reduce((t, x) => t + (x.progress || 0) * wt(x), 0) / own.reduce((t, x) => t + wt(x), 0)) : p.progress || 0;
  const row: PlanRow = { level: 1, kind: 'ch', ref: w.id, code: w.code, name: w.name, start: a, end: b, status: segStatus(a, progress, today), progress, current: false, critical: w.critical };
  return { row, own };
}

/** Dates d'un chantier : les siennes, sinon celles de ses sous-phases, sinon de ses phases. */
function wsDates(w: PlanWs, phases: PlanPhase[], subs: PlanSub[]): { start: string; end: string } | null {
  if (w.start && w.end && w.end >= w.start) return { start: w.start, end: w.end };
  const xs = [...subs.filter((s) => w.subIds.includes(s.id)).filter(dated), ...phases.filter((p) => w.phaseIds.includes(p.id))];
  if (!xs.length) return null;
  return { start: xs.reduce((m, x) => (x.start! < m ? x.start! : m), xs[0].start!), end: xs.reduce((m, x) => (x.end! > m ? x.end! : m), xs[0].end!) };
}

/** Lignes du planning pour un niveau ; `wsId` : chantier du niveau « Un chantier » ; `currentPhaseId` : phase en cours. */
export function planRows(level: PlanLevel, input: { phases: PlanPhase[]; subs: PlanSub[]; wss: PlanWs[]; today: string; currentPhaseId?: string | null; wsId?: string | null }): PlanRow[] {
  const { phases, subs, wss, today } = input;
  const phRow = (p: PlanPhase): PlanRow => ({ level: 0, kind: 'ph', ref: p.id, code: p.code, name: p.name, start: p.start, end: p.end, status: p.status, progress: p.progress, current: p.id === input.currentPhaseId, critical: p.critical });
  const wsRow = (w: PlanWs, level: 0 | 1): PlanRow | null => {
    const d = wsDates(w, phases, subs);
    return d ? { level, kind: 'ch', ref: w.id, code: w.code, name: w.name, start: d.start, end: d.end, status: segStatus(d.start, w.progress, today), progress: w.progress, current: false, critical: w.critical } : null;
  };
  switch (level) {
    case 'phsp':
      return phases.flatMap((p) => [phRow(p), ...subs.filter((s) => s.phaseId === p.id).filter(dated).map((s) => subRow(s, 1))]);
    case 'phchsp':
      return phases.flatMap((p) => [phRow(p), ...wss.filter((w) => w.phaseIds.includes(p.id)).sort(byCode).flatMap((w) => { const g = segmentOf(w, p, subs, today); return [g.row, ...g.own.map((s) => subRow(s, 2))]; })]);
    case 'ch':
      return wss.slice().sort(byCode).map((w) => wsRow(w, 0)).filter((r): r is PlanRow => !!r);
    case 'one': {
      const w = wss.find((x) => x.id === input.wsId);
      if (!w) return [];
      const head = wsRow(w, 0);
      if (!head) return [];
      const own = w.subIds.length ? subs.filter((s) => w.subIds.includes(s.id)) : subs.filter((s) => w.phaseIds.includes(s.phaseId) && !!s.start && !!s.end && s.end >= head.start && s.start! <= head.end);
      return [head, ...own.filter(dated).sort((a, b) => a.start.localeCompare(b.start) || byCode(a, b)).map((s) => subRow(s, 1))];
    }
    default:
      return phases.map(phRow);
  }
}
