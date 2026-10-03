import { Box } from '../domain/report-format';
import { frShortDate, mixHex, typeScale } from '../domain/report-design';
import { Draw, Para, Run, inTime, longDate, wrapText } from './report-draw';

/**
 * Planches de pilotage des rapports (04/10/2026) : échéancier des actions, arbitrages (décisions en attente et prises),
 * tableau de bord (phase en cours, santé du projet). Même système de design que les autres planches
 * (`report-draw.ts`) : libellés en petites capitales, valeurs dans la police des titres, couleur = sens
 * (rouge : en retard ; ambre : imminent ou à arbitrer ; accent : ce qui compte maintenant ; gris : le passé).
 */

const PT = 12700;
const IN = 914400;
const R = Math.round;
const days = (from: string, to: string) => R((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
/** Date courte, avec l'année seulement si elle diffère de celle du jour. */
const dayOf = (iso: string, today: string) => (iso.slice(0, 4) === today.slice(0, 4) ? frShortDate(iso) : longDate(iso));

/** État vide : trait d'accent court, message principal, précision ; centré dans la zone. */
function emptyState(d: Draw, a: Box, title: string, sub: string): string {
  const t = d.t, ty = typeScale(t), h = 0.9 * IN, y = a.y + (a.h - h) / 2;
  return d.sp({ box: { x: a.x + a.w / 2 - 0.15 * IN, y, w: 0.3 * IN, h: 0.028 * IN }, fill: t.accent })
    + d.text({ x: a.x, y: y + 0.18 * IN, w: a.w, h: h - 0.18 * IN }, [{ align: 'ctr', runs: [{ t: title, size: ty.lead + 2, color: t.ink, bold: true, font: t.head }] }, { align: 'ctr', spcBef: 4, runs: [{ t: sub, size: ty.small, color: t.muted }] }], 't');
}

// ───────────── Actions : échéancier ─────────────

export interface ActionRow { code: string; name: string; owner: string; ws: string | null; due: string | null; status: 'OPEN' | 'IN_PROGRESS' | 'BLOCKED'; prio: 'HIGH' | 'MEDIUM' | 'LOW'; source: string | null }
export interface ActionsData { today: string; rows: ActionRow[]; show: Record<string, boolean> }
/** Échéance « imminente » (ambre) : dans les 14 prochains jours. */
export const ACTION_SOON_DAYS = 14;
const ACTION_STATUS: Record<ActionRow['status'], string> = { OPEN: 'Ouverte', IN_PROGRESS: 'En cours', BLOCKED: 'Bloquée' };
const PRIO_LABEL: Record<ActionRow['prio'], string> = { HIGH: 'Haute', MEDIUM: 'Moyenne', LOW: 'Basse' };

/** Ordre de lecture : les plus en retard d'abord, puis les échéances les plus proches, enfin les actions sans échéance. */
export function sortActions(rows: ActionRow[], today: string): ActionRow[] {
  const k = (r: ActionRow) => (r.due ? days(today, r.due) : Number.POSITIVE_INFINITY);
  return [...rows].sort((a, b) => k(a) - k(b) || a.code.localeCompare(b.code));
}
/** Répartition des actions ouvertes : en retard, imminentes, plus tard, sans échéance. */
export function actionBuckets(rows: ActionRow[], today: string) {
  const ds = rows.map((r) => (r.due ? days(today, r.due) : null));
  return { late: ds.filter((v) => v !== null && v < 0).length, soon: ds.filter((v) => v !== null && v >= 0 && v <= ACTION_SOON_DAYS).length, later: ds.filter((v) => v !== null && v > ACTION_SOON_DAYS).length, none: ds.filter((v) => v === null).length };
}

/**
 * Échéancier des actions ouvertes : liste triée par urgence (code et priorité ; action en gras et, dessous, responsable,
 * chantier et origine ; frise centrée sur « aujourd'hui » — retard en rouge à gauche, délai à droite, ambre sous 14 jours ;
 * échéance ; statut), et panneau sombre à droite (actions en retard sur les ouvertes, répartition par échéance).
 */
export function drawActions(d: Draw, a: Box, x: ActionsData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [], show = x.show;
  const rows = sortActions(x.rows, x.today);
  if (!rows.length) return emptyState(d, a, 'Aucune action ouverte', 'sur le périmètre et la période du rapport');
  const withPanel = show.kpis !== false;
  const pw = withPanel ? Math.min(a.w * 0.22, 2.6 * IN) : 0, gap = withPanel ? 0.42 * IN : 0;
  if (withPanel) out.push(actionsPanel(d, { x: a.x + a.w - pw, y: a.y, w: pw, h: a.h }, x.rows, x.today, show));
  const T: Box = { x: a.x, y: a.y, w: a.w - pw - gap, h: a.h };
  type Col = { id: string; label: string; w: number; align?: 'l' | 'r' };
  const cols: Col[] = [];
  if (show.code !== false || show.prio) cols.push({ id: 'code', label: '#', w: (show.prio ? 0.86 : 0.62) * IN });
  cols.push({ id: 'name', label: 'Action', w: 0 });
  if (show.due !== false) cols.push({ id: 'runway', label: '', w: Math.min(2.4 * IN, T.w * 0.25) }, { id: 'due', label: 'Échéance', w: 1.02 * IN, align: 'r' });
  if (show.status !== false) cols.push({ id: 'status', label: 'Statut', w: 1.02 * IN });
  cols.find((c) => c.id === 'name')!.w = Math.max(1.8 * IN, T.w - cols.reduce((s, c) => s + c.w, 0));
  const xs: number[] = []; cols.reduce((p, c) => (xs.push(p), p + c.w), T.x);
  const col = (id: string) => { const k = cols.findIndex((c) => c.id === id); return k < 0 ? null : { x: xs[k], w: cols[k].w }; };
  const headH = 0.34 * IN, footH = 0.3 * IN;
  // Frise : axe « aujourd'hui », même échelle (jours) des deux côtés ; place réservée aux étiquettes en bout de barre.
  const rw = col('runway');
  const ds = rows.map((r) => (r.due ? days(x.today, r.due) : null));
  const late = Math.max(0, ...ds.map((v) => (v !== null && v < 0 ? -v : 0))), ahead = Math.max(0, ...ds.map((v) => (v !== null && v > 0 ? v : 0)));
  let cx = 0, k = 0;
  if (rw) {
    const lab = 0.44 * IN, W = rw.w - 2 * lab, minSide = 0.6 * IN;
    const L = Math.min(W - minSide, Math.max(minSide, late + ahead > 0 ? (W * late) / (late + ahead) : W / 2));
    cx = rw.x + lab + L;
    k = Math.min(late ? L / late : Number.POSITIVE_INFINITY, ahead ? (W - L) / ahead : Number.POSITIVE_INFINITY);
    if (!Number.isFinite(k)) k = 0;
  }
  // En-tête.
  const head = (box: Box, s: string, align: 'l' | 'r' = 'l', color = t.muted) => d.text(box, [{ align, runs: [{ t: s, size: ty.label, color, bold: true, caps: true, spc: 0.8 }] }], 'b');
  cols.forEach((c, i) => { if (c.label) out.push(head({ x: xs[i] + 0.06 * IN, y: T.y, w: c.w - 0.12 * IN, h: headH - 0.08 * IN }, c.label, c.align)); });
  if (rw) {
    out.push(head({ x: rw.x, y: T.y, w: cx - rw.x - 0.08 * IN, h: headH - 0.08 * IN }, 'Retard', 'r', late ? t.risk : t.subtle));
    out.push(head({ x: cx + 0.08 * IN, y: T.y, w: rw.x + rw.w - cx - 0.08 * IN, h: headH - 0.08 * IN }, 'À venir'));
  }
  out.push(d.line(T.x, T.y + headH, T.x + T.w, T.y + headH, t.ink, 1));
  // Lignes.
  const nc = col('name')!, nameW = nc.w - 0.24 * IN, nameSize = ty.small + 0.5;
  const limit = T.y + T.h - footH;
  let y = T.y + headH, shown = 0;
  const ctxOf = (r: ActionRow) => [show.owner !== false ? r.owner : null, r.ws, r.source ? `issue de ${r.source}` : null].filter(Boolean).join('  ·  ');
  for (const [i, r] of rows.entries()) {
    const nl = wrapText(r.name, nameW, nameSize, 2), ctx = ctxOf(r);
    const h = Math.max(0.5 * IN, (nl.length * nameSize * 1.25 + (ctx ? ty.label * 1.55 : 0)) * PT + 0.22 * IN);
    if (y + h > limit && shown > 0) break;
    const v = r.due ? days(x.today, r.due) : null, overdue = v !== null && v < 0, soon = v !== null && v >= 0 && v <= ACTION_SOON_DAYS;
    const c1 = col('code');
    if (c1) out.push(d.text({ x: c1.x + 0.06 * IN, y, w: c1.w - 0.1 * IN, h }, [...(show.code !== false ? [{ runs: [{ t: r.code, size: ty.small, color: t.muted, bold: true }] }] : []), ...(show.prio ? [{ spcBef: show.code !== false ? 2 : 0, runs: [{ t: PRIO_LABEL[r.prio], size: ty.label - 0.5, color: r.prio === 'HIGH' ? t.ink : t.subtle, bold: r.prio === 'HIGH', caps: true, spc: 0.6 }] }] : [])], 'ctr'));
    const paras: Para[] = nl.map((l) => ({ line: 100, runs: [{ t: l, size: nameSize, color: t.ink, bold: true }] }));
    if (ctx) paras.push({ spcBef: 3, runs: [{ t: wrapText(ctx, nameW, ty.label, 1)[0], size: ty.label, color: t.muted }] });
    out.push(d.text({ x: nc.x + 0.06 * IN, y, w: nameW, h }, paras, 'ctr'));
    if (rw) {
      const by = y + h / 2, bh = 0.085 * IN;
      if (v === null) out.push(d.text({ x: cx + 0.1 * IN, y: by - 0.1 * IN, w: rw.x + rw.w - cx - 0.1 * IN, h: 0.2 * IN }, [{ runs: [{ t: 'sans échéance', size: ty.label, color: t.subtle, italic: true }] }], 'ctr'));
      else if (v === 0) {
        out.push(d.sp({ box: { x: cx - 0.055 * IN, y: by - 0.055 * IN, w: 0.11 * IN, h: 0.11 * IN }, geom: 'ellipse', fill: t.watch }));
        out.push(d.text({ x: cx + 0.12 * IN, y: by - 0.1 * IN, w: 1 * IN, h: 0.2 * IN }, [{ runs: [{ t: 'aujourd’hui', size: ty.label, color: t.watch, bold: true }] }], 'ctr'));
      } else {
        const len = Math.max(0.05 * IN, Math.abs(v) * k), color = overdue ? t.risk : soon ? t.watch : t.accent;
        const bx = overdue ? cx - len : cx;
        out.push(d.pill({ x: bx, y: by - bh / 2, w: len, h: bh }, color));
        const lw = 0.42 * IN, txt = `${Math.abs(v)} j`;
        out.push(d.text({ x: overdue ? bx - lw - 0.04 * IN : bx + len + 0.05 * IN, y: by - 0.1 * IN, w: lw, h: 0.2 * IN }, [{ align: overdue ? 'r' : 'l', runs: [{ t: txt, size: ty.small, color: overdue ? t.risk : soon ? t.ink : t.muted, bold: overdue || soon }] }], 'ctr'));
      }
    }
    const dc = col('due');
    if (dc) out.push(d.text({ x: dc.x + 0.06 * IN, y, w: dc.w - 0.12 * IN, h }, [{ align: 'r', runs: [{ t: r.due ? dayOf(r.due, x.today) : '—', size: ty.small, color: overdue ? t.risk : r.due ? t.ink : t.subtle, bold: !!r.due }] }], 'ctr'));
    const sc = col('status');
    if (sc) {
      const dot = r.status === 'BLOCKED' ? t.risk : r.status === 'IN_PROGRESS' ? t.accent : t.subtle;
      out.push(d.text({ x: sc.x + 0.16 * IN, y, w: sc.w - 0.18 * IN, h }, [{ runs: [{ t: '●  ', size: ty.label, color: dot }, { t: ACTION_STATUS[r.status], size: ty.small, color: r.status === 'BLOCKED' ? t.risk : t.ink, bold: r.status === 'BLOCKED' }] }], 'ctr'));
    }
    y += h;
    shown++;
    if (i < rows.length - 1) out.push(d.line(T.x, y, T.x + T.w, y, t.hairline, 0.5));
  }
  // Axe « aujourd'hui » par-dessus les lignes, repère daté dessous.
  if (rw) {
    out.push(d.line(cx, T.y + headH + 0.06 * IN, cx, y, t.accent2, 1));
    out.push(d.text({ x: cx - 0.8 * IN, y: y + 0.04 * IN, w: 1.6 * IN, h: 0.2 * IN }, [{ align: 'ctr', runs: [{ t: `Aujourd’hui · ${frShortDate(x.today)}`, size: ty.label, color: t.accent2, bold: true }] }], 't'));
  }
  if (shown < rows.length) {
    const n = rows.length - shown;
    out.push(d.text({ x: T.x, y: y + 0.04 * IN, w: rw ? Math.max(0.5 * IN, cx - 0.9 * IN - T.x) : T.w, h: 0.22 * IN }, [{ runs: [{ t: `… et ${plural(n, 'autre action', 'autres actions')} ouverte${n > 1 ? 's' : ''}${withPanel ? ' (comptées à droite)' : ''}`, size: ty.label, color: t.subtle, italic: true }] }], 't'));
  }
  return out.join('');
}

/** Panneau sombre : actions en retard sur les ouvertes, retard le plus ancien, répartition par échéance. */
function actionsPanel(d: Draw, p: Box, rows: ActionRow[], today: string, show: Record<string, boolean>): string {
  const t = d.t, ty = typeScale(t), out: string[] = [];
  const pad = 0.3 * IN, iw = p.w - 2 * pad, b = actionBuckets(rows, today), n = rows.length;
  const lite = (c: string, k = 0.22) => mixHex(c, 'FFFFFF', k), dim = mixHex(t.ink, 'FFFFFF', 0.58), rule = mixHex(t.ink, 'FFFFFF', 0.18);
  out.push(d.sp({ box: p, fill: t.ink }));
  let y = p.y + 0.26 * IN;
  out.push(d.text({ x: p.x + pad, y, w: iw, h: 0.2 * IN }, [{ runs: [{ t: 'En retard', size: ty.label, color: mixHex(t.accent, 'FFFFFF', 0.3), bold: true, caps: true, spc: 1.2 }] }]));
  y += 0.24 * IN;
  const heroH = ty.hero * 1.12 * PT;
  out.push(d.text({ x: p.x + pad, y, w: iw, h: heroH }, [{ runs: [{ t: String(b.late), size: ty.hero, color: b.late ? lite(t.risk) : 'FFFFFF', bold: true, font: t.head }, { t: `  / ${n}`, size: ty.lead + 2, color: dim, bold: true, font: t.head }] }], 'b'));
  y += heroH + 0.04 * IN;
  const oldest = rows.filter((r) => r.due && r.due < today).sort((u, v) => u.due!.localeCompare(v.due!))[0];
  out.push(d.text({ x: p.x + pad, y, w: iw, h: 0.42 * IN }, [
    { runs: [{ t: n ? (b.late ? `action${b.late > 1 ? 's' : ''} en retard` : 'aucune action en retard') : 'aucune action ouverte', size: ty.small, color: 'FFFFFF' }] },
    ...(n ? [{ spcBef: 1, runs: [{ t: `sur ${plural(n, 'action ouverte', 'actions ouvertes')}`, size: ty.label, color: dim }] }] : []),
    ...(oldest ? [{ spcBef: 2, runs: [{ t: `la plus ancienne : ${oldest.code}, ${days(oldest.due!, today)} j`, size: ty.label, color: dim }] }] : []),
  ]));
  // Répartition par échéance, calée en bas du panneau (priorité haute en dernier, si demandée).
  const lh = 0.27 * IN, prioH = show.prio ? 0.62 * IN : 0;
  y = Math.max(y + 0.62 * IN, p.y + p.h - 0.26 * IN - prioH - 4 * lh - 0.2 * IN - 0.12 * IN - 0.32 * IN - 0.22 * IN);
  out.push(d.line(p.x + pad, y, p.x + p.w - pad, y, rule, 0.75));
  y += 0.22 * IN;
  out.push(d.text({ x: p.x + pad, y, w: iw, h: 0.2 * IN }, [{ runs: [{ t: 'Échéances', size: ty.label, color: mixHex(t.accent, 'FFFFFF', 0.3), bold: true, caps: true, spc: 1.2 }] }]));
  y += 0.32 * IN;
  // Barre de répartition (segments jointifs, fins séparateurs).
  const segs = [
    { n: b.late, color: lite(t.risk), label: 'En retard' },
    { n: b.soon, color: lite(t.watch, 0.1), label: `Sous ${ACTION_SOON_DAYS} jours` },
    { n: b.later, color: lite(t.accent, 0.25), label: 'Plus tard' },
    { n: b.none, color: mixHex(t.ink, 'FFFFFF', 0.4), label: 'Sans échéance' },
  ];
  const bh = 0.12 * IN;
  if (n) {
    let bx = p.x + pad;
    const live = segs.filter((s) => s.n);
    live.forEach((s, i) => { const w = (iw - (live.length - 1) * 0.03 * IN) * (s.n / n); out.push(d.sp({ box: { x: bx, y, w, h: bh }, fill: s.color })); bx += w + (i < live.length - 1 ? 0.03 * IN : 0); });
  } else out.push(d.sp({ box: { x: p.x + pad, y, w: iw, h: bh }, fill: rule }));
  y += bh + 0.2 * IN;
  for (const s of segs) {
    if (y + lh > p.y + p.h - 0.2 * IN) break;
    out.push(d.sp({ box: { x: p.x + pad, y: y + 0.075 * IN, w: 0.11 * IN, h: 0.11 * IN }, geom: 'roundRect', adj: 20000, fill: s.color }));
    out.push(d.text({ x: p.x + pad + 0.22 * IN, y, w: iw - 0.7 * IN, h: lh }, [{ runs: [{ t: s.label, size: ty.small, color: s.n ? 'FFFFFF' : dim }] }], 'ctr'));
    out.push(d.text({ x: p.x + p.w - pad - 0.5 * IN, y, w: 0.5 * IN, h: lh }, [{ align: 'r', runs: [{ t: String(s.n), size: ty.small, color: s.n ? 'FFFFFF' : dim, bold: s.n > 0 }] }], 'ctr'));
    y += lh;
  }
  if (show.prio) {
    const high = rows.filter((r) => r.prio === 'HIGH'), highLate = high.filter((r) => r.due && r.due < today).length;
    const by = y + 0.1 * IN;
    if (by + 0.4 * IN < p.y + p.h) {
      out.push(d.line(p.x + pad, by, p.x + p.w - pad, by, rule, 0.75));
      out.push(d.text({ x: p.x + pad, y: by + 0.12 * IN, w: iw - 0.5 * IN, h: 0.3 * IN }, [{ runs: [{ t: 'Priorité haute', size: ty.small, color: 'FFFFFF' }] }, ...(high.length ? [{ runs: [{ t: highLate ? `dont ${highLate} en retard` : 'aucune en retard', size: ty.label, color: highLate ? lite(t.risk) : dim, bold: highLate > 0 }] }] : [])], 't'));
      out.push(d.text({ x: p.x + p.w - pad - 0.5 * IN, y: by + 0.12 * IN, w: 0.5 * IN, h: 0.22 * IN }, [{ align: 'r', runs: [{ t: String(high.length), size: ty.small, color: 'FFFFFF', bold: true }] }], 't'));
    }
  }
  return out.join('');
}

// ───────────── Décisions : arbitrages ─────────────

export interface DecisionRow { code: string; title: string; status: string; created: string; decided: string | null; body: string; bodyShort: string; decision: string | null; impact: string | null; expected: string | null }
export interface DecisionsData { today: string; pending: DecisionRow[]; taken: DecisionRow[]; last: DecisionRow[]; period: string | null; show: Record<string, boolean> }
/** Décisions déjà prises rappelées quand aucune ne l'a été sur la période. */
export const DECISIONS_RECALL = 3;
/** Étapes d'une décision avant arbitrage, dans l'ordre. */
export const DECISION_STAGES = [{ id: 'DRAFT', label: 'Brouillon' }, { id: 'IN_REVIEW', label: 'En revue' }, { id: 'TO_ARBITRATE', label: 'À arbitrer' }];
/** Attente « longue » (rouge) : 30 jours et plus depuis la création. */
export const DECISION_STALE_DAYS = 30;

/** Ordre des décisions en attente : les plus avancées (à arbitrer) d'abord, puis les plus anciennes. */
export function sortPending(rows: DecisionRow[]): DecisionRow[] {
  const s = (r: DecisionRow) => DECISION_STAGES.findIndex((x) => x.id === r.status);
  return [...rows].sort((a, b) => s(b) - s(a) || a.created.localeCompare(b.created) || a.code.localeCompare(b.code));
}

/**
 * Arbitrages : à gauche, les décisions en attente (nombre, dont à arbitrer ; pour chacune, code, intitulé, instance et
 * séance attendue, étape sur trois segments, durée d'attente) ; à droite, les décisions prises sur la période, en fil
 * chronologique (date, instance, ce qui a été décidé, impact en option) ; sans décision prise, la dernière est rappelée.
 */
export function drawDecisions(d: Draw, a: Box, x: DecisionsData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [], show = x.show;
  const lw = R(a.w * 0.575), gap = 0.5 * IN;
  const Lb: Box = { x: a.x, y: a.y, w: lw, h: a.h }, Rb: Box = { x: a.x + lw + gap, y: a.y, w: a.w - lw - gap, h: a.h };
  out.push(d.line(a.x + lw + gap / 2, a.y + 0.06 * IN, a.x + lw + gap / 2, a.y + a.h - 0.06 * IN, t.hairline, 0.75));
  // Bloc d'en-tête : grand nombre, libellé, précision.
  const headBlock = (b: Box, n: number, label: string, sub: Run[], color: string) => {
    const nw = Math.max(0.55, String(n).length * 0.44) * IN;
    out.push(d.text({ x: b.x, y: b.y, w: nw, h: 0.62 * IN }, [{ runs: [{ t: String(n), size: ty.stat, color, bold: true, font: t.head }] }], 'ctr'));
    out.push(d.text({ x: b.x + nw + 0.1 * IN, y: b.y, w: b.w - nw - 0.1 * IN, h: 0.62 * IN }, [{ runs: [{ t: label, size: ty.body, color: t.ink, bold: true }] }, { spcBef: 1, runs: sub }], 'ctr'));
  };
  const pending = sortPending(x.pending), toArb = pending.filter((p) => p.status === 'TO_ARBITRATE').length;
  headBlock(Lb, pending.length, pending.length > 1 ? 'décisions en attente' : pending.length ? 'décision en attente' : 'aucune décision en attente',
    pending.length ? [{ t: toArb ? `dont ${toArb} à arbitrer` : 'aucune à arbitrer', size: ty.small, color: toArb ? t.watch : t.muted, bold: toArb > 0 }] : [{ t: 'rien à arbitrer', size: ty.small, color: t.muted }], pending.length ? t.ink : t.subtle);
  // Liste des décisions en attente.
  const top = Lb.y + 0.84 * IN, headH = 0.3 * IN;
  type Col = { id: string; label: string; w: number; align?: 'l' | 'r' };
  const cols: Col[] = [];
  if (show.code !== false) cols.push({ id: 'code', label: '#', w: 0.6 * IN });
  cols.push({ id: 'name', label: 'Décision', w: 0 });
  if (show.status !== false) cols.push({ id: 'stage', label: 'Étape', w: 1.12 * IN });
  if (show.date !== false) cols.push({ id: 'age', label: 'Attente', w: 0.98 * IN, align: 'r' });
  cols.find((c) => c.id === 'name')!.w = Math.max(1.6 * IN, Lb.w - cols.reduce((s, c) => s + c.w, 0));
  const xs: number[] = []; cols.reduce((p, c) => (xs.push(p), p + c.w), Lb.x);
  if (pending.length) {
    cols.forEach((c, i) => out.push(d.text({ x: xs[i] + (c.id === 'code' ? 0 : 0.06 * IN), y: top, w: c.w - 0.12 * IN, h: headH - 0.07 * IN }, [{ align: c.align ?? 'l', runs: [{ t: c.label, size: ty.label, color: t.muted, bold: true, caps: true, spc: 0.8 }] }], 'b')));
    out.push(d.line(Lb.x, top + headH, Lb.x + Lb.w, top + headH, t.ink, 1));
    const nk = cols.findIndex((c) => c.id === 'name'), nameW = cols[nk].w - 0.24 * IN, nameSize = ty.small + 0.5;
    let y = top + headH, shown = 0;
    const limit = Lb.y + Lb.h - 0.26 * IN;
    for (const [i, r] of pending.entries()) {
      const nl = wrapText(r.title, nameW, nameSize, 2);
      const ctx = [show.body !== false ? r.body : null, r.expected ? `attendue ${r.expected}` : null].filter(Boolean).join('  ·  ');
      const h = Math.max(0.5 * IN, (nl.length * nameSize * 1.25 + (ctx ? ty.label * 1.55 : 0)) * PT + 0.22 * IN);
      if (y + h > limit && shown > 0) break;
      const age = days(r.created, x.today), stage = DECISION_STAGES.findIndex((s) => s.id === r.status);
      cols.forEach((c, k) => {
        const cx = xs[k] + (c.id === 'code' ? 0 : 0.06 * IN), cw = c.w - 0.12 * IN;
        if (c.id === 'code') out.push(d.text({ x: cx, y, w: cw, h }, [{ runs: [{ t: r.code, size: ty.small, color: t.muted, bold: true }] }], 'ctr'));
        if (c.id === 'name') {
          const paras: Para[] = nl.map((l) => ({ line: 100, runs: [{ t: l, size: nameSize, color: t.ink, bold: true }] }));
          if (ctx) paras.push({ spcBef: 3, runs: [{ t: wrapText(ctx, nameW, ty.label, 1)[0], size: ty.label, color: t.muted }] });
          out.push(d.text({ x: cx, y, w: nameW, h }, paras, 'ctr'));
        }
        if (c.id === 'stage') {
          // Trois segments : étapes franchies en encre adoucie, étape courante en couleur (ambre si à arbitrer).
          const sw = 0.26 * IN, sg = 0.045 * IN, sh = 0.07 * IN, sy = y + h / 2 - 0.13 * IN;
          const cur = stage === 2 ? t.watch : t.accent;
          DECISION_STAGES.forEach((s, j) => out.push(d.pill({ x: cx + j * (sw + sg), y: sy, w: sw, h: sh }, j < stage ? mixHex(t.ink, 'FFFFFF', 0.55) : j === stage ? cur : t.hairline)));
          out.push(d.text({ x: cx, y: sy + sh + 0.04 * IN, w: cw + 0.1 * IN, h: 0.2 * IN }, [{ runs: [{ t: DECISION_STAGES[Math.max(0, stage)].label, size: ty.label, color: stage === 2 ? t.watch : t.ink, bold: true }] }], 't'));
        }
        if (c.id === 'age') {
          const stale = age >= DECISION_STALE_DAYS;
          out.push(d.text({ x: cx, y, w: cw, h }, [{ align: 'r', runs: [{ t: `${age} j`, size: ty.body, color: stale ? t.risk : t.ink, bold: true }] }], 'ctr'));
        }
      });
      y += h;
      shown++;
      if (i < pending.length - 1) out.push(d.line(Lb.x, y, Lb.x + Lb.w, y, t.hairline, 0.5));
    }
    if (shown < pending.length) out.push(d.text({ x: Lb.x, y: y + 0.04 * IN, w: Lb.w, h: 0.22 * IN }, [{ runs: [{ t: `… et ${plural(pending.length - shown, 'autre décision', 'autres décisions')} en attente`, size: ty.label, color: t.subtle, italic: true }] }], 't'));
  }
  // Décisions prises : fil chronologique.
  const taken = [...x.taken].sort((u, v) => (v.decided ?? '').localeCompare(u.decided ?? ''));
  headBlock(Rb, taken.length, taken.length > 1 ? 'décisions prises' : taken.length ? 'décision prise' : 'décision prise',
    [{ t: x.period ? `sur la période · ${x.period}` : 'toutes dates', size: ty.small, color: t.muted }], taken.length ? t.accent : t.subtle);
  const items = taken.length ? taken : x.last.slice(0, DECISIONS_RECALL);
  const faded = !taken.length;
  let y = Rb.y + 0.84 * IN;
  if (faded && items.length) {
    out.push(d.text({ x: Rb.x, y, w: Rb.w, h: 0.3 * IN }, [{ runs: [{ t: 'Aucune décision prise sur la période.', size: ty.small, color: t.muted, italic: true }] }], 't'));
    y += 0.5 * IN;
    { out.push(d.label({ x: Rb.x, y, w: Rb.w, h: 0.2 * IN }, items.length > 1 ? 'Dernières décisions prises' : 'Dernière décision prise', t.subtle)); y += 0.36 * IN; }
  }
  const gx = Rb.x + 0.07 * IN, tx = Rb.x + 0.34 * IN, tw = Rb.w - 0.34 * IN, limit = Rb.y + Rb.h - 0.26 * IN;
  let shown = 0, firstY = 0, lastY = 0;
  const thread = out.length;
  out.push('');
  for (const r of items) {
    const decided = r.decided ?? r.created;
    const what = show.decision !== false && r.decision?.trim() ? r.decision : r.title;
    const wl = wrapText(what, tw, ty.small + 0.5, 3);
    const sub = show.decision !== false && r.decision?.trim() ? wrapText(r.title, tw, ty.label, 1)[0] : null;
    const imp = show.impact && r.impact?.trim() ? wrapText(r.impact, tw, ty.label, 2) : [];
    const h = (ty.label * 1.6 + wl.length * (ty.small + 0.5) * 1.28 + (sub ? ty.label * 1.5 : 0) + imp.length * ty.label * 1.35) * PT + 0.26 * IN;
    if (y + h > limit && shown > 0) break;
    if (!shown) firstY = y;
    lastY = y;
    const head: Run[] = [{ t: decided.slice(0, 4) === x.today.slice(0, 4) ? frShortDate(decided) : longDate(decided), size: ty.label, color: faded ? t.muted : t.accent, bold: true, caps: true, spc: 0.8 }];
    if (show.body !== false) head.push({ t: `  ·  ${r.bodyShort}`, size: ty.label, color: t.muted, bold: true, caps: true, spc: 0.8 });
    if (show.code !== false) head.push({ t: `  ·  ${r.code}`, size: ty.label, color: t.subtle, bold: true });
    const paras: Para[] = [{ runs: head }, ...wl.map((l, j) => ({ spcBef: j ? 0 : 3, line: 100, runs: [{ t: l, size: ty.small + 0.5, color: faded ? t.muted : t.ink, bold: true }] }))];
    if (sub) paras.push({ spcBef: 2, runs: [{ t: sub, size: ty.label, color: t.muted }] });
    imp.forEach((l, j) => paras.push({ spcBef: j ? 0 : 2, runs: [{ t: l, size: ty.label, color: t.subtle, italic: true }] }));
    out.push(d.text({ x: tx, y, w: tw, h }, paras, 't'));
    out.push(d.sp({ box: { x: gx - 0.055 * IN, y: y + 0.035 * IN, w: 0.11 * IN, h: 0.11 * IN }, geom: 'ellipse', fill: faded ? 'FFFFFF' : t.accent, line: faded ? { color: t.subtle, w: 1 } : null }));
    y += h;
    shown++;
  }
  if (shown > 1) out[thread] = d.line(gx, firstY + 0.1 * IN, gx, lastY + 0.1 * IN, t.hairline, 0.75);
  if (!items.length) out.push(d.text({ x: Rb.x, y, w: Rb.w, h: 0.3 * IN }, [{ runs: [{ t: 'Aucune décision prise à ce jour.', size: ty.small, color: t.subtle }] }], 't'));
  if (shown < items.length) out.push(d.text({ x: tx, y: y - 0.04 * IN, w: tw, h: 0.22 * IN }, [{ runs: [{ t: `… et ${plural(items.length - shown, 'autre décision', 'autres décisions')} prise${items.length - shown > 1 ? 's' : ''}`, size: ty.label, color: t.subtle, italic: true }] }], 't'));
  return out.join('');
}

// ───────────── Tableau de bord ─────────────

export interface DashPhase { code: string; name: string; start: string; end: string; status: 'DONE' | 'IN_PROGRESS' | 'PLANNED'; progress: number; planned: number }
export interface DashTile { id: string; label: string; value: string; note: string; tone: 'risk' | 'watch' | 'ok' | 'muted' }
export interface DashboardData { today: string; phases: DashPhase[]; tiles: DashTile[]; golive: string | null; next: { code: string; name: string; iso: string } | null; show: Record<string, boolean> }
/** Écart réel / prévu (points) : à partir de -5, retard marqué (rouge) ; entre -5 et 0, à surveiller (ambre). */
export const DASH_GAP_WATCH = -5;

/** Phase mise en avant : la phase en cours, sinon la première non terminée, sinon la dernière. */
export const focusPhase = (ph: DashPhase[]) => ph.find((p) => p.status === 'IN_PROGRESS') ?? ph.find((p) => p.status !== 'DONE') ?? ph[ph.length - 1] ?? null;
export const gapTone = (g: number): 'ok' | 'watch' | 'risk' => (g >= 0 ? 'ok' : g > DASH_GAP_WATCH ? 'watch' : 'risk');
const gapText = (g: number) => (g === 0 ? '= dans les temps' : `${g > 0 ? '▲ +' : '▼ −'}${Math.abs(g)} pt${Math.abs(g) > 1 ? 's' : ''}`);

/**
 * Tableau de bord : à gauche, la phase en cours (avancement réel en grand, prévu à date et écart en points, fin
 * prévue ; barre réel / repère prévu ; chemin des phases, les terminées en gris) ; à droite, la santé du projet en
 * quatre tuiles (valeur et précision qualifiée : dont critiques, dont en retard, à arbitrer, prochain jalon).
 */
export function drawDashboard(d: Draw, a: Box, x: DashboardData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [], show = x.show;
  const withProgress = show.progress !== false || show.planned !== false;
  const tiles = x.tiles;
  const lw = withProgress ? (tiles.length ? R(a.w * 0.54) : a.w) : 0, gap = withProgress && tiles.length ? 0.55 * IN : 0;
  if (withProgress) {
    const L: Box = { x: a.x, y: a.y, w: lw, h: a.h };
    const cur = focusPhase(x.phases);
    if (!cur) out.push(d.text({ ...L, h: 0.4 * IN }, [{ runs: [{ t: 'Aucune phase sur le périmètre.', size: ty.body, color: t.muted }] }]));
    else {
      const idx = x.phases.indexOf(cur), real = R(cur.progress), plan = R(cur.planned), g = real - plan;
      out.push(d.label({ x: L.x, y: L.y, w: L.w, h: 0.22 * IN }, cur.status === 'IN_PROGRESS' ? `Phase en cours · ${idx + 1} / ${x.phases.length}` : cur.status === 'DONE' ? 'Toutes les phases sont terminées' : `Prochaine phase · ${idx + 1} / ${x.phases.length}`));
      // Grand pourcentage réel, puis nom de la phase, prévu à date et écart, fin prévue.
      const heroSize = ty.hero * 1.05, heroH = heroSize * 1.1 * PT, hy = L.y + 0.3 * IN;
      const pctW = (String(real).length * 0.62 + 0.75) * heroSize * PT;
      if (show.progress !== false) out.push(d.text({ x: L.x, y: hy, w: pctW, h: heroH }, [{ runs: [{ t: String(real), size: heroSize, color: t.accent, bold: true, font: t.head }, { t: ' %', size: heroSize * 0.45, color: t.accent, bold: true, font: t.head }] }], 'b'));
      const ix = L.x + (show.progress !== false ? pctW + 0.2 * IN : 0), iw = L.x + L.w - ix;
      const info: Para[] = [{ runs: [{ t: cur.name, size: ty.lead + 3, color: t.ink, bold: true, font: t.head }] }];
      if (show.planned !== false) info.push({ spcBef: 4, runs: [{ t: `prévu à date ${plan} %`, size: ty.small, color: t.muted }, ...(show.progress !== false ? [{ t: `   ${gapText(g)}`, size: ty.small, color: t[gapTone(g)], bold: true }] : [])] });
      info.push({ spcBef: 3, runs: [{ t: cur.status === 'PLANNED' ? `début ${longDate(cur.start)} · ${inTime(x.today, cur.start)}` : `fin prévue ${longDate(cur.end)}${cur.end >= x.today ? ` · ${inTime(x.today, cur.end)}` : ''}`, size: ty.small, color: t.muted }] });
      out.push(d.text({ x: ix, y: hy, w: iw, h: heroH }, info, 'b'));
      // Barre réel / repère prévu.
      const sy = L.y + L.h - 0.6 * IN, by = hy + heroH + 0.5 * IN, bh = 0.15 * IN, bw = L.w;
      out.push(d.pill({ x: L.x, y: by, w: bw, h: bh }, t.surface));
      if (show.progress !== false && real > 0) out.push(d.pill({ x: L.x, y: by, w: Math.max(bh, (bw * Math.min(100, real)) / 100), h: bh }, t.accent));
      if (show.planned !== false) {
        const px = L.x + (bw * Math.min(100, Math.max(0, plan))) / 100;
        out.push(d.sp({ box: { x: px - 0.011 * IN, y: by - 0.07 * IN, w: 0.022 * IN, h: bh + 0.14 * IN }, fill: t.ink }));
        out.push(d.text({ x: Math.min(L.x + L.w - 1.2 * IN, Math.max(L.x, px - 0.6 * IN)), y: by - 0.3 * IN, w: 1.2 * IN, h: 0.2 * IN }, [{ align: px - 0.6 * IN < L.x ? 'l' : px + 0.6 * IN > L.x + L.w ? 'r' : 'ctr', runs: [{ t: 'prévu', size: ty.label, color: t.ink, bold: true, caps: true, spc: 0.8 }] }], 'b'));
      }
      out.push(d.text({ x: L.x, y: by + bh + 0.05 * IN, w: 0.6 * IN, h: 0.18 * IN }, [{ runs: [{ t: '0 %', size: ty.label - 0.5, color: t.subtle }] }], 't'));
      // Repères : go-live prévu et prochain jalon, à mi-chemin entre la barre et le chemin des phases.
      const marks = [x.golive ? { label: 'Go-live prévu', value: longDate(x.golive), sub: x.golive >= x.today ? inTime(x.today, x.golive) : 'date dépassée' } : null, x.next ? { label: `Prochain jalon · ${x.next.code}`, value: longDate(x.next.iso), sub: inTime(x.today, x.next.iso), name: x.next.name } : null].filter((m): m is { label: string; value: string; sub: string; name?: string } => !!m);
      if (marks.length) {
        const mh = 1.0 * IN, my = (by + bh + 0.3 * IN + sy - 0.34 * IN) / 2 - mh / 2, mw = L.w / 2;
        marks.forEach((m, j) => {
          const mx = L.x + j * mw + (j ? 0.3 * IN : 0), w = mw - (j ? 0.3 * IN : 0) - 0.1 * IN;
          if (j) out.push(d.line(L.x + mw, my + 0.04 * IN, L.x + mw, my + mh - 0.04 * IN, t.hairline, 0.75));
          out.push(d.text({ x: mx, y: my, w, h: mh }, [
            { runs: [{ t: m.label, size: ty.label, color: t.muted, bold: true, caps: true, spc: 0.8 }] },
            { spcBef: 4, runs: [{ t: m.value, size: ty.lead + 3, color: t.ink, bold: true, font: t.head }] },
            { spcBef: 2, runs: [{ t: m.sub, size: ty.small, color: t.muted }] },
            ...(m.name ? [{ spcBef: 1, runs: [{ t: wrapText(m.name, w, ty.label, 1)[0], size: ty.label, color: t.subtle }] }] : []),
          ], 't'));
        });
      }
      out.push(d.text({ x: L.x + L.w - 0.6 * IN, y: by + bh + 0.05 * IN, w: 0.6 * IN, h: 0.18 * IN }, [{ align: 'r', runs: [{ t: '100 %', size: ty.label - 0.5, color: t.subtle }] }], 't'));
      // Chemin des phases : une case par phase ; terminées en gris, en cours en accent (avancement), à venir en filet.
      const n = x.phases.length, sg = 0.08 * IN, sw = (L.w - (n - 1) * sg) / n;
      out.push(d.label({ x: L.x, y: sy - 0.3 * IN, w: L.w, h: 0.2 * IN }, 'Chemin des phases'));
      x.phases.forEach((p, i) => {
        const px = L.x + i * (sw + sg), isCur = p === cur && p.status !== 'DONE', sh = 0.06 * IN;
        out.push(d.pill({ x: px, y: sy, w: sw, h: sh }, p.status === 'DONE' ? mixHex(t.ink, 'FFFFFF', 0.62) : t.hairline));
        if (isCur && p.progress > 0) out.push(d.pill({ x: px, y: sy, w: Math.max(sh, (sw * Math.min(100, p.progress)) / 100), h: sh }, t.accent));
        const nm = wrapText(p.name, sw - 0.04 * IN, ty.small, 1)[0];
        const sub = p.status === 'DONE' ? 'terminée' : isCur ? `${R(p.progress)} %` : `dès ${frShortDate(p.start)}${p.start.slice(0, 4) !== x.today.slice(0, 4) ? ` ${p.start.slice(2, 4)}` : ''}`;
        out.push(d.text({ x: px, y: sy + sh + 0.08 * IN, w: sw, h: 0.44 * IN }, [{ runs: [{ t: nm, size: ty.small, color: isCur ? t.ink : t.muted, bold: isCur }] }, { spcBef: 1, runs: [{ t: sub, size: ty.label, color: isCur ? t.accent : t.subtle, bold: isCur }] }], 't'));
      });
    }
  }
  // Santé du projet : tuiles (deux colonnes sur deux lignes à côté de l'avancement, une ligne seules).
  if (tiles.length) {
    const T: Box = { x: a.x + lw + gap, y: a.y, w: a.w - lw - gap, h: a.h };
    if (withProgress) out.push(d.line(T.x - gap / 2, T.y + 0.06 * IN, T.x - gap / 2, T.y + T.h - 0.06 * IN, t.hairline, 0.75));
    const perRow = withProgress ? Math.min(2, tiles.length) : tiles.length, rowsN = Math.ceil(tiles.length / perRow);
    const top = T.y + (withProgress ? 0.34 * IN : 0);
    if (withProgress) out.push(d.label({ x: T.x, y: T.y, w: T.w, h: 0.22 * IN }, 'Santé du projet'));
    const cw = T.w / perRow, ch = (T.y + T.h - top) / rowsN, vs = withProgress ? ty.stat : ty.hero;
    tiles.forEach((it, i) => {
      const cx = T.x + (i % perRow) * cw, cy = top + Math.floor(i / perRow) * ch, pad = i % perRow ? 0.28 * IN : 0, w = cw - pad - 0.12 * IN;
      // Contenu centré verticalement dans sa case ; filets à la hauteur du contenu.
      const block = 0.34 * IN + vs * 1.15 * PT + 0.5 * IN, y0 = cy + Math.max(i >= perRow ? 0.22 * IN : 0.06 * IN, (ch - block) / 2);
      if (i % perRow) out.push(d.line(cx, y0 - 0.04 * IN, cx, y0 + block, t.hairline, 0.75));
      if (i >= perRow) out.push(d.line(cx + (i % perRow ? 0.16 * IN : 0), cy, cx + cw - (i % perRow ? 0 : 0.16 * IN), cy, t.hairline, 0.75));
      out.push(d.sp({ box: { x: cx + pad, y: y0, w: 0.3 * IN, h: 0.028 * IN }, fill: i === 0 ? t.accent : t.ink }));
      out.push(d.text({ x: cx + pad, y: y0 + 0.1 * IN, w, h: 0.22 * IN }, [{ runs: [{ t: it.label, size: ty.label, color: t.muted, bold: true, caps: true, spc: 0.8 }] }], 't'));
      out.push(d.text({ x: cx + pad, y: y0 + 0.34 * IN, w, h: vs * 1.15 * PT }, [{ runs: [{ t: it.value, size: vs, color: t.ink, bold: true, font: t.head }] }], 't'));
      const dot = it.tone === 'muted' ? t.subtle : t[it.tone];
      const nl = wrapText(it.note, w - 0.22 * IN, ty.small, 2);
      out.push(d.text({ x: cx + pad, y: y0 + 0.36 * IN + vs * 1.15 * PT, w, h: 0.5 * IN }, nl.map((l, j) => ({ line: 100, runs: [{ t: j ? '     ' : '●  ', size: ty.label, color: dot }, { t: l, size: ty.small, color: it.tone === 'risk' ? t.risk : t.ink, bold: it.tone === 'risk' }] })), 't'));
    });
  }
  return out.join('');
}
