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

/**
 * Lignes équilibrées : même nombre de lignes que `wrapText`, mais à la largeur la plus étroite qui le garde — pas de mot
 * isolé en dernière ligne (« … sur une capacité de / 40 »). Texte tronqué : coupe d'origine.
 */
export function balanced(text: string, width: number, size: number, max: number): string[] {
  const base = wrapText(text, width, size, max), cut = (l: string[]) => (l[l.length - 1] ?? '').endsWith('…');
  if (base.length < 2 || cut(base)) return base;
  let best = base;
  for (let w = width * 0.96; w > width * 0.5; w *= 0.96) {
    const l = wrapText(text, w, size, max);
    if (l.length !== base.length || cut(l)) break;
    best = l;
  }
  return best;
}

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

// ───────────── Décisions : registre des décisions, comme Pilotage › Décisions (11/10/2026) ─────────────

export interface DecisionRow {
  code: string; title: string; status: string; created: string; decided: string | null; body: string; bodyShort: string; decision: string | null; impact: string | null; expected: string | null;
  /** Registre (11/10/2026) : priorité 1 à 4, numéro du chantier (couleur de sa pastille), fréquence de l'instance, fiche rédigée, option choisie, date de la séance attendue. */
  prio?: number; wsSeq?: number | null; freq?: string | null; fiche?: boolean; opt?: string | null; session?: string | null;
}
export interface DecisionsData { today: string; pending: DecisionRow[]; taken: DecisionRow[]; last: DecisionRow[]; period: string | null; show: Record<string, boolean> }
/** Décisions déjà prises rappelées quand aucune ne l'a été sur la période. */
export const DECISIONS_RECALL = 3;
/** Étapes d'une décision avant arbitrage, dans l'ordre (libellés du Cockpit). */
export const DECISION_STAGES = [{ id: 'DRAFT', label: 'Brouillon' }, { id: 'IN_REVIEW', label: 'En instruction' }, { id: 'TO_ARBITRATE', label: 'À arbitrer' }];
/** Attente « longue » (rouge) : 30 jours et plus depuis la création. */
export const DECISION_STALE_DAYS = 30;
/** Largeur utile estimée pour couper les textes du registre (police réelle plus étroite que l'estimation de `wrapText`). */
export const DECISION_WRAP = 1.2;
/**
 * Registre des décisions du Cockpit (Pilotage › Décisions, `RISE Cockpit.dc.html`) repris tel quel : priorités (`PRL` /
 * `PRC`), étapes du statut (`IDX`, 4 points), couleurs des pastilles de chantier (`DHUES`), palette de l'écran.
 */
export const REGISTER = {
  prio: { 4: ['Critique', 'C2413B'], 3: ['Haute', 'C06F1F'], 2: ['Moyenne', '1D8F86'], 1: ['Basse', '8A9AA6'] } as Record<number, [string, string]>,
  steps: ['DRAFT', 'IN_REVIEW', 'TO_ARBITRATE', 'ARBITRATED'],
  stage: { DRAFT: 'Brouillon', IN_REVIEW: 'En instruction', TO_ARBITRATE: 'À arbitrer', ARBITRATED: 'Arbitrée' } as Record<string, string>,
  hues: ['2A7F8E', '6F58C9', 'C0673C', '3F6FD1', 'B2457F', '4F8A3A', 'B98516', '55677D'],
  ink: '10233A', teal: '1D8F86', amber: 'C06F1F', label: '5C7280', text: '43586A', grey: '8A9AA6', rule: 'EEF3F2', ring: 'CFD8D6', off: 'E3EAE8', band: '10233A', bandLabel: '9FDCD4', soft: 'F3F7FA',
};

/** Ordre des décisions en attente : les plus avancées (à arbitrer) d'abord, puis les plus anciennes. */
export function sortPending(rows: DecisionRow[]): DecisionRow[] {
  const s = (r: DecisionRow) => DECISION_STAGES.findIndex((x) => x.id === r.status);
  return [...rows].sort((a, b) => s(b) - s(a) || a.created.localeCompare(b.created) || a.code.localeCompare(b.code));
}

/**
 * Registre des décisions, comme Pilotage › Décisions : un bandeau sombre (« Registre des décisions », nombre en attente,
 * dont à arbitrer, prises sur la période), puis le tableau du Cockpit — ID, point de décision, priorité, fiche
 * d'arbitrage, statut en quatre étapes, option choisie, date de décision, chantier, instance de décision et sa
 * fréquence, date de création. Décisions en attente d'abord (à arbitrer en tête, liseré ambre), avec leur attente
 * (rouge à partir de 30 jours) et leur séance attendue ; puis les décisions prises sur la période (sinon les dernières,
 * rappelées en grisé). Ce qui ne tient pas est compté en pied.
 */
export function drawDecisions(d: Draw, a: Box, x: DecisionsData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [], show = x.show, C = REGISTER, W = DECISION_WRAP;
  // Corps bornés : le registre reste lisible quelle que soit la taille de texte du format (pas de débordement).
  const fs = Math.min(ty.small, 10), fl = Math.min(ty.label, 8), fh = Math.min(ty.lead + 2, 15), lh = (s: number) => s * 1.25 * PT;
  const pending = sortPending(x.pending), toArb = pending.filter((r) => r.status === 'TO_ARBITRATE').length;
  const taken = [...x.taken].sort((u, v) => (v.decided ?? '').localeCompare(u.decided ?? '')), recall = !taken.length && x.last.length > 0;
  const done = taken.length ? taken : x.last.slice(0, DECISIONS_RECALL);

  // 1. Bandeau : le registre en une phrase.
  const bandH = 0.66 * IN;
  out.push(d.sp({ box: { x: a.x, y: a.y, w: a.w, h: bandH }, geom: 'roundRect', adj: 9000, fill: C.band }));
  const head: Run[] = [{ t: String(pending.length), size: fh + 6, color: 'FFFFFF', bold: true, font: t.head }, { t: pending.length > 1 ? '  décisions en attente' : pending.length ? '  décision en attente' : '  aucune décision en attente', size: fh, color: 'FFFFFF', bold: true, font: t.head }];
  const sub: Run[] = [{ t: toArb ? `dont ${toArb} à arbitrer` : 'aucune à arbitrer', size: fs, color: toArb ? 'F2B66B' : C.bandLabel, bold: toArb > 0 }, { t: `   ·   ${taken.length ? `${taken.length} prise${taken.length > 1 ? 's' : ''}` : 'aucune prise'} ${x.period ? 'sur la période' : 'à ce jour'}`, size: fs, color: mixHex(C.band, 'FFFFFF', 0.72) }];
  out.push(d.text({ x: a.x + 0.24 * IN, y: a.y + 0.06 * IN, w: a.w * 0.62, h: bandH - 0.12 * IN }, [{ runs: [{ t: 'Registre des décisions', size: fl, color: C.bandLabel, bold: true, caps: true, spc: 1.6 }] }, { spcBef: 1, runs: head }], 'ctr'));
  out.push(d.text({ x: a.x + a.w * 0.55, y: a.y + 0.06 * IN, w: a.w * 0.45 - 0.24 * IN, h: bandH - 0.12 * IN }, [{ align: 'r', runs: sub }], 'ctr'));

  // 2. Colonnes du registre (largeurs fixes pour les repères, souples pour les textes).
  type Col = { id: string; label: string; w: number; f?: number };
  const cols: Col[] = [
    ...(show.code !== false ? [{ id: 'id', label: 'ID', w: 0.62 * IN }] : []),
    { id: 'name', label: 'Point de décision', w: 0, f: 2.3 },
    { id: 'prio', label: 'Priorité', w: 0.86 * IN },
    ...(show.decision !== false ? [{ id: 'fiche', label: 'Fiche d’arbitrage', w: 0, f: 1.45 }] : []),
    ...(show.status !== false ? [{ id: 'status', label: 'Statut', w: 1.12 * IN }] : []),
    { id: 'opt', label: 'Option choisie', w: 0.66 * IN },
    { id: 'dd', label: 'Date de décision', w: 0.98 * IN },
    { id: 'ws', label: 'Chantier', w: 0.66 * IN },
    ...(show.body !== false ? [{ id: 'body', label: 'Instance de décision', w: 0, f: 1.45 }] : []),
    { id: 'cr', label: 'Date de création', w: 0.98 * IN },
  ];
  const gap = 0.12 * IN, pad = 0.16 * IN, inner = a.w - 2 * pad - gap * (cols.length - 1);
  const flex = inner - cols.reduce((s, c) => s + c.w, 0), F = cols.reduce((s, c) => s + (c.f ?? 0), 0);
  cols.forEach((c) => { if (c.f) c.w = (flex * c.f) / F; });
  const xs: number[] = []; cols.reduce((p, c) => (xs.push(p), p + c.w + gap), a.x + pad);
  let y = a.y + bandH + 0.06 * IN;
  const thH = 0.4 * IN;
  cols.forEach((c, i) => out.push(d.text({ x: xs[i], y, w: c.w + gap * 0.6, h: thH }, wrapText(c.label, (c.w + gap * 0.6) * 1.15, fl, 2).map((l) => ({ line: 95, runs: [{ t: l, size: fl, color: C.label, bold: true, caps: true, spc: 0.8 }] })), 'b')));
  y += thH + 0.06 * IN;

  // 3. Lignes : en attente, puis prises (ou rappel des dernières).
  const rows: Array<{ r: DecisionRow; faded: boolean }> = [...pending.map((r) => ({ r, faded: false })), ...done.map((r) => ({ r, faded: recall }))];
  const avail = a.y + a.h - y - 0.24 * IN;
  const nameW = cols.find((c) => c.id === 'name')!.w, bodyW = cols.find((c) => c.id === 'body')?.w ?? 0, ficheW = cols.find((c) => c.id === 'fiche')?.w ?? 0, impOn = !!show.impact;
  // Hauteur d'une ligne : la plus haute de ses cellules (intitulé et impact, instance et fréquence).
  const hOf = (r: DecisionRow) => {
    const nh = balanced(r.title, nameW * W, fs + 0.5, 3).length * lh(fs + 0.5) + (impOn && r.impact?.trim() ? lh(fl) : 0);
    const bh = bodyW ? balanced(r.body, bodyW * W, fs, 2).length * lh(fs) + (r.freq ? lh(fl) : 0) : 0;
    const dh = ficheW && r.decision?.trim() ? balanced(r.decision, (ficheW - (r.fiche ? 0.55 * IN : 0)) * W, fs, 3).length * lh(fs) : 0;
    return Math.max(0.46 * IN, Math.max(nh, bh, dh) + 0.16 * IN);
  };
  // Place réservée aux deux premières décisions prises (et à leur séparateur) : les deux groupes restent visibles.
  const keepDone = done.slice(0, 2), reserve = keepDone.length ? keepDone.reduce((s2, r) => s2 + hOf(r), 0.2 * IN) : 0;
  let used = 0, nOpen = 0, nDone = 0;
  for (const r of pending) { const h = hOf(r); if (used + h > avail - reserve && nOpen) break; used += h; nOpen++; }
  for (const [k, r] of done.entries()) { const h = hOf(r) + (k ? 0 : 0.2 * IN); if (used + h > avail && (nOpen || nDone)) break; used += h; nDone++; }
  const list = [...rows.slice(0, nOpen), ...rows.slice(pending.length, pending.length + nDone)], shown = nOpen + nDone;
  let sep = -1;
  list.forEach(({ r, faded }, k) => {
    const h = hOf(r), open = DECISION_STAGES.some((s) => s.id === r.status), hot = r.status === 'TO_ARBITRATE';
    // Passage des décisions en attente aux décisions prises : filet et libellé discret.
    if (!open && sep < 0) {
      sep = k;
      out.push(d.text({ x: a.x + pad, y: y + 0.02 * IN, w: a.w * 0.5, h: 0.16 * IN }, [{ runs: [{ t: recall ? (done.length > 1 ? 'Dernières décisions prises' : 'Dernière décision prise') : x.period ? 'Prises sur la période' : 'Décisions prises', size: fl - 0.5, color: C.grey, bold: true, caps: true, spc: 1 }] }], 'ctr'));
      y += 0.2 * IN;
    }
    if (hot) out.push(d.sp({ box: { x: a.x, y: y + 0.04 * IN, w: 0.03 * IN, h: h - 0.08 * IN }, fill: C.amber }));
    const ink = faded ? C.grey : C.ink;
    cols.forEach((c, i) => {
      const bx = xs[i], w = c.w, box = { x: bx, y, w: w + 0.02 * IN, h };
      if (c.id === 'id') out.push(d.text(box, [{ runs: [{ t: r.code, size: fl + 0.5, color: ink, bold: true, font: 'Consolas' }] }], 'ctr'));
      else if (c.id === 'name') {
        const tl = balanced(r.title, w * W, fs + 0.5, 3), imp = impOn && r.impact?.trim() ? wrapText(`Impact : ${r.impact}`, w * W, fl, 1)[0] : null;
        out.push(d.text(box, [...tl.map((l) => ({ line: 100, runs: [{ t: l, size: fs + 0.5, color: ink, bold: true }] })), ...(imp ? [{ spcBef: 1, runs: [{ t: imp, size: fl, color: C.grey, italic: true }] }] : [])], 'ctr'));
      } else if (c.id === 'prio') {
        const [pl, pc] = C.prio[r.prio ?? 2] ?? C.prio[2];
        out.push(d.text(box, [{ runs: [{ t: '●  ', size: fl - 1, color: faded ? C.ring : pc }, { t: pl, size: fs, color: faded ? C.grey : pc, bold: true }] }], 'ctr'));
      } else if (c.id === 'fiche') {
        const dec = r.decision?.trim();
        // « Rédigée » (fiche complète), puis la décision prise (trois lignes au plus) ou « Fiche complète ».
        const dl = balanced(dec || 'Fiche complète', (w - (r.fiche ? 0.55 * IN : 0)) * W, fs, 3);
        out.push(d.text(box, dec || r.fiche ? dl.map((l, j) => ({ line: 100, runs: [...(r.fiche && !j ? [{ t: 'Rédigée  ', size: fl - 0.5, color: ink, bold: true, font: 'Consolas' }] : []), { t: l, size: fs, color: faded ? C.grey : C.text }] }))
          : [{ runs: [{ t: 'Non rédigée', size: fs, color: C.grey, italic: true }] }], 'ctr'));
      } else if (c.id === 'status') {
        // Quatre étapes reliées : franchies pleines, étape courante cerclée, à venir creuses (couleur de l'étape).
        const ix = C.steps.indexOf(r.status), col = faded ? C.grey : r.status === 'TO_ARBITRATE' ? C.amber : r.status === 'ARBITRATED' ? C.ink : C.teal;
        const dot = 0.075 * IN, seg = 0.15 * IN, cy = y + h / 2 - 0.08 * IN;
        C.steps.forEach((_, j) => {
          const dx = bx + j * (dot + seg);
          if (j < 3) out.push(d.line(dx + dot, cy + dot / 2, dx + dot + seg, cy + dot / 2, ix >= 0 && j < ix ? col : C.off, 1.25));
          if (j === ix) out.push(d.sp({ box: { x: dx - 0.025 * IN, y: cy - 0.025 * IN, w: dot + 0.05 * IN, h: dot + 0.05 * IN }, geom: 'ellipse', fill: mixHex(col, 'FFFFFF', 0.8) }));
          out.push(d.sp({ box: { x: dx, y: cy, w: dot, h: dot }, geom: 'ellipse', fill: ix < 0 ? C.off : j <= ix ? col : 'FFFFFF', line: j > ix && ix >= 0 ? { color: C.ring, w: 0.9 } : null }));
        });
        out.push(d.text({ x: bx, y: cy + dot + 0.04 * IN, w: w + gap, h: lh(fs) + 0.02 * IN }, [{ runs: [{ t: C.stage[r.status] ?? r.status, size: fs - 0.5, color: col, bold: true }] }], 't'));
      } else if (c.id === 'opt') {
        const has = !!r.opt?.trim(), bw = Math.min(w, 0.5 * IN), bh = 0.28 * IN;
        out.push(d.sp({ box: { x: bx, y: y + (h - bh) / 2, w: bw, h: bh }, geom: 'roundRect', adj: 22000, fill: has ? mixHex(C.teal, 'FFFFFF', 0.9) : null, line: has ? null : { color: C.off, w: 0.75, dash: true }, anchor: 'ctr', paras: [{ align: 'ctr', runs: [{ t: has ? r.opt!.trim() : '–', size: has ? fs : fs - 1, color: has ? C.ink : C.ring, bold: has }] }] }));
      } else if (c.id === 'dd') {
        const p: Para[] = r.decided && !open ? [{ runs: [{ t: dayOf(r.decided, x.today), size: fs, color: ink }] }] : [{ runs: [{ t: 'En attente', size: fs, color: C.grey, italic: true }] }];
        if (open && r.session) p.push({ spcBef: 1, runs: [{ t: `séance du ${r.session}`, size: fl, color: hot ? C.amber : C.teal, bold: true }] });
        out.push(d.text(box, p, 'ctr'));
      } else if (c.id === 'ws') {
        if (r.wsSeq) {
          const hue = C.hues[(r.wsSeq - 1) % C.hues.length], cw = (String(r.wsSeq).length * 0.075 + 0.24) * IN, ch = 0.22 * IN;
          out.push(d.sp({ box: { x: bx, y: y + (h - ch) / 2, w: cw, h: ch }, geom: 'roundRect', adj: 24000, fill: mixHex(hue, 'FFFFFF', faded ? 0.95 : 0.91), line: { color: mixHex(hue, 'FFFFFF', 0.78), w: 0.75 }, anchor: 'ctr', paras: [{ align: 'ctr', runs: [{ t: `C${r.wsSeq}`, size: fl, color: faded ? C.grey : hue, bold: true }] }] }));
        } else out.push(d.text(box, [{ runs: [{ t: '—', size: fs, color: C.ring }] }], 'ctr'));
      } else if (c.id === 'body') {
        const bl = balanced(r.body, w * W, fs, 2);
        out.push(d.text(box, [...bl.map((l) => ({ line: 100, runs: [{ t: l, size: fs, color: faded ? C.grey : C.ink }] })), ...(r.freq ? [{ spcBef: 1, runs: [{ t: r.freq, size: fl, color: C.grey }] }] : [])], 'ctr'));
      } else if (c.id === 'cr') {
        const age = days(r.created, x.today), stale = open && age >= DECISION_STALE_DAYS;
        out.push(d.text(box, [{ runs: [{ t: dayOf(r.created, x.today), size: fs, color: C.grey }] }, ...(open && show.date !== false ? [{ spcBef: 1, runs: [{ t: 'attente ', size: fl, color: C.grey }, { t: `${age} j`, size: fl + 0.5, color: stale ? 'C2413B' : C.ink, bold: true }] }] : [])], 'ctr'));
      }
    });
    y += h;
    out.push(d.line(a.x + pad, y, a.x + a.w - pad, y, C.rule, 0.75));
  });
  if (!rows.length) out.push(d.text({ x: a.x, y: y + 0.1 * IN, w: a.w, h: 0.4 * IN }, [{ align: 'ctr', runs: [{ t: 'Aucune décision en attente ni prise à ce jour.', size: fs + 1, color: C.grey, italic: true }] }], 't'));
  if (shown < rows.length) {
    const restOpen = pending.length - nOpen, restDone = done.length - nDone;
    const parts = [restOpen ? plural(restOpen, 'autre décision en attente', 'autres décisions en attente') : '', restDone ? plural(restDone, recall ? 'autre décision rappelée' : 'autre décision prise', recall ? 'autres décisions rappelées' : 'autres décisions prises') : ''].filter(Boolean);
    out.push(d.text({ x: a.x + pad, y: y + 0.03 * IN, w: a.w - 2 * pad, h: 0.2 * IN }, [{ runs: [{ t: `… et ${parts.join(' · ')}`, size: fl, color: C.grey, italic: true }] }], 'ctr'));
  }
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

// ───────────── Livrables (11/10/2026) ─────────────

export interface DeliverableRow { name: string; phase: string | null; ws: string | null; owner: string; due: string; progress: number; status: 'DONE' | 'LATE' | 'ACTIVE' | 'FUTURE'; risk: 'OK' | 'TENSION' | 'CRITICAL' }
export interface DeliverablesData { today: string; rows: DeliverableRow[]; show: Record<string, boolean>; period: string | null }
const DLV_STATUS: Record<DeliverableRow['status'], string> = { DONE: 'Livré', LATE: 'En retard', ACTIVE: 'En cours', FUTURE: 'À venir' };
const DLV_RISK: Record<DeliverableRow['risk'], string> = { OK: 'Maîtrisé', TENSION: 'Tension', CRITICAL: 'Critique' };
/** Hauteur minimale d'une ligne du tableau des livrables (pouces) ; au-delà, « … et N autres livrables ». */
export const DELIVERABLE_ROW_MIN_IN = 0.3;
/** Ordre de lecture : en retard d'abord, puis par échéance, les livrés en dernier. */
export function sortDeliverables(rows: DeliverableRow[]): DeliverableRow[] {
  const rank = { LATE: 0, ACTIVE: 1, FUTURE: 1, DONE: 2 } as const;
  return [...rows].sort((a, b) => rank[a.status] - rank[b.status] || a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
}

/**
 * Livrables (refonte du 11/10/2026) : trois repères chiffrés et leur répartition en une barre fine ; puis les livrables
 * regroupés par urgence — en retard, à livrer, livrés —, l'échéance en tête de ligne (date et compte à rebours), le nom
 * avec sa phase · sous-phase dessous, chantier, responsable, avancement en barre fine, statut et risque en point de
 * couleur. Un trait rouge en marge signale chaque retard. Aucun cadre, filets fins.
 */
export function drawDeliverables(d: Draw, a: Box, x: DeliverablesData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [], show = x.show;
  if (!x.rows.length) return emptyState(d, a, 'Aucun livrable sur la période', x.period ? `Échéances : ${x.period}.` : 'Aucun livrable sur le périmètre.');
  const rows = sortDeliverables(x.rows);
  const late = rows.filter((r) => r.status === 'LATE'), todo = rows.filter((r) => r.status === 'ACTIVE' || r.status === 'FUTURE'), done = rows.filter((r) => r.status === 'DONE');

  // 1. Repères chiffrés et répartition.
  const kpiH = 0.62 * IN, cw = Math.min(2.1 * IN, a.w / 4);
  const marks: Array<[number, string, string]> = [[late.length + todo.length, late.length + todo.length > 1 ? 'à livrer' : 'à livrer', t.ink], [late.length, 'en retard', late.length ? t.risk : t.subtle], [done.length, done.length > 1 ? 'livrés' : 'livré', done.length ? t.ok : t.subtle]];
  marks.forEach(([n, l, c], i) => {
    const bx = a.x + i * cw;
    out.push(d.text({ x: bx, y: a.y, w: cw - 0.1 * IN, h: kpiH * 0.7 }, [{ runs: [{ t: String(n), size: ty.stat * 0.9, color: c, bold: true, font: t.head }, { t: `  ${l}`, size: ty.small, color: t.muted }] }], 'b'));
  });
  // Barre de répartition : en retard, à livrer, livrés (proportions exactes), sur toute la largeur.
  const barY = a.y + kpiH * 0.84, barH = 0.035 * IN, total = rows.length;
  let bx = a.x;
  for (const [n, c] of [[late.length, t.risk], [todo.length, mixHex(t.accent, 'FFFFFF', 0.45)], [done.length, mixHex(t.ok, 'FFFFFF', 0.45)]] as Array<[number, string]>) {
    if (!n) continue;
    const w = (a.w * n) / total;
    out.push(d.sp({ box: { x: bx, y: barY, w: Math.max(0.02 * IN, w - 0.03 * IN), h: barH }, fill: c }));
    bx += w;
  }

  // 2. Colonnes retenues.
  type Col = { id: string; label: string; f: number; align?: 'r' };
  const twoLines = show.phase !== false;
  const all: Col[] = [{ id: 'due', label: 'Échéance', f: 1.25 }, { id: 'name', label: twoLines ? 'Livrable · phase · sous-phase' : 'Livrable', f: 3.6 }, { id: 'ws', label: 'Chantier', f: 1.8 }, { id: 'owner', label: 'Responsable', f: 1.55 }, { id: 'progress', label: 'Avancement', f: 1.45 }, { id: 'status', label: 'Statut', f: 1.05 }, { id: 'risk', label: 'Risque', f: 1.05 }];
  const cols = all.filter((c) => show[c.id] !== false || (c.id === 'name' && show.phase !== false));
  const F = cols.reduce((s, c) => s + c.f, 0), W = (i: number) => (cols[i].f / F) * a.w;
  const xs: number[] = [];
  let cx = a.x;
  for (const c of cols) { xs.push(cx); cx += (c.f / F) * a.w; }
  const top = a.y + kpiH + 0.16 * IN, thH = 0.26 * IN;
  cols.forEach((c, i) => out.push(d.text({ x: xs[i] + 0.08 * IN, y: top, w: W(i) - 0.12 * IN, h: thH - 0.05 * IN }, [{ runs: [{ t: c.label, size: ty.label, color: t.muted, bold: true, caps: true, spc: 0.8 }] }], 'b')));
  out.push(d.line(a.x, top + thH, a.x + a.w, top + thH, t.ink, 1));

  // 3. Lignes par groupe, dans la hauteur disponible.
  const groups = ([['En retard', late, t.risk], ['À livrer', todo, t.ink], ['Livrés', done, t.ok]] as Array<[string, DeliverableRow[], string]>).filter((gq) => gq[1].length);
  const ghH = 0.27 * IN, moreH = 0.24 * IN, avail = a.y + a.h - (top + thH) - 0.04 * IN;
  let rowH = Math.min(twoLines ? 0.46 * IN : 0.36 * IN, (avail - groups.length * ghH) / rows.length);
  const minH = (twoLines ? DELIVERABLE_ROW_MIN_IN + 0.04 : DELIVERABLE_ROW_MIN_IN) * IN;
  // Place insuffisante : les lignes vont d'abord aux plus urgentes ; seules les têtes des groupes atteints comptent.
  let budget = rows.length;
  if (rowH < minH) {
    rowH = minH;
    let room = avail - moreH;
    budget = 0;
    for (const [, list] of groups) { if (room < ghH + rowH) break; room -= ghH; const n = Math.min(list.length, Math.floor(room / rowH)); budget += n; room -= n * rowH; if (n < list.length) break; }
    budget = Math.max(1, budget);
  }
  let y = top + thH, shown = 0;
  const left = new Map<string, number>(groups.map((gq) => [gq[0], gq[1].length]));
  for (const [label, list, color] of groups) {
    if (shown >= budget) break;
    // Tête de groupe : libellé en petites capitales de la couleur du groupe, nombre, filet.
    out.push(d.text({ x: a.x + 0.08 * IN, y, w: a.w * 0.5, h: ghH }, [{ runs: [{ t: label, size: ty.label, color, bold: true, caps: true, spc: 1 }, { t: `   ${list.length}`, size: ty.label, color: t.subtle, bold: true }] }], 'ctr'));
    y += ghH;
    for (const r of list) {
      if (shown >= budget) break;
      const isLate = r.status === 'LATE', isDone = r.status === 'DONE';
      if (isLate) out.push(d.sp({ box: { x: a.x, y: y + 0.05 * IN, w: 0.03 * IN, h: rowH - 0.1 * IN }, fill: t.risk }));
      cols.forEach((c, i) => {
        const x0 = xs[i] + 0.08 * IN, w = W(i) - 0.14 * IN, box = { x: x0, y, w, h: rowH };
        const one = (txt: string, o: { color?: string; bold?: boolean; size?: number } = {}) => out.push(d.text(box, [{ runs: [{ t: wrapText(txt, w * 1.1, o.size ?? ty.small, 1)[0], size: o.size ?? ty.small, color: o.color ?? t.ink, bold: o.bold }] }], 'ctr'));
        if (c.id === 'due') {
          const n = Math.round((Date.parse(`${r.due}T00:00:00Z`) - Date.parse(`${x.today}T00:00:00Z`)) / 86400000);
          const sub = isDone ? null : isLate ? `retard ${Math.abs(n)} j` : n === 0 ? "aujourd'hui" : n <= 60 ? `dans ${n} j` : inTime(x.today, r.due);
          out.push(d.text(box, [{ runs: [{ t: dayOf(r.due, x.today), size: ty.small, color: isLate ? t.risk : isDone ? t.subtle : t.ink, bold: !isDone }] }, ...(sub && rowH >= 0.32 * IN ? [{ runs: [{ t: sub, size: ty.label, color: isLate ? t.risk : n <= 14 ? t.watch : t.subtle, bold: isLate || n <= 14 }] }] : [])], 'ctr'));
        } else if (c.id === 'name') {
          const nm: Para = { runs: [{ t: wrapText(r.name, w * 1.08, ty.small, 1)[0], size: ty.small, color: isDone ? t.muted : t.ink, bold: true }] };
          out.push(d.text(box, show.name === false ? [{ runs: [{ t: wrapText(r.phase ?? '—', w * 1.12, ty.label, 1)[0], size: ty.label, color: t.muted }] }] : twoLines && r.phase ? [nm, { runs: [{ t: wrapText(r.phase, w * 1.14, ty.label, 1)[0], size: ty.label, color: t.subtle }] }] : [nm], 'ctr'));
        } else if (c.id === 'ws') one(r.ws ?? '—', { color: r.ws ? t.muted : t.subtle });
        else if (c.id === 'owner') one(r.owner, { color: t.muted });
        else if (c.id === 'progress') {
          const pw = Math.min(w * 0.56, 0.8 * IN), ph = 0.055 * IN, py = y + (rowH - ph) / 2;
          out.push(d.pill({ x: x0, y: py, w: pw, h: ph }, mixHex(t.hairline, 'FFFFFF', 0.25)));
          if (r.progress > 0) out.push(d.pill({ x: x0, y: py, w: Math.max(ph, pw * Math.min(1, r.progress / 100)), h: ph }, isLate ? t.risk : isDone ? mixHex(t.ok, 'FFFFFF', 0.35) : t.accent));
          out.push(d.text({ x: x0 + pw + 0.05 * IN, y, w: w - pw - 0.05 * IN, h: rowH }, [{ align: 'r', runs: [{ t: `${R(r.progress)} %`, size: ty.small, color: isLate ? t.risk : isDone ? t.subtle : t.ink, bold: isLate }] }], 'ctr'));
        } else if (c.id === 'status') {
          const col = isLate ? t.risk : isDone ? t.ok : r.status === 'ACTIVE' ? t.accent : mixHex(t.ink, 'FFFFFF', 0.72);
          out.push(d.text(box, [{ runs: [{ t: '●  ', size: ty.label - 1, color: col }, { t: DLV_STATUS[r.status], size: ty.small, color: isLate ? t.risk : r.status === 'ACTIVE' ? t.ink : t.subtle, bold: isLate }] }], 'ctr'));
        } else if (c.id === 'risk') {
          const col = r.risk === 'CRITICAL' ? t.risk : r.risk === 'TENSION' ? t.watch : mixHex(t.ok, 'FFFFFF', 0.2);
          out.push(d.text(box, [{ runs: [{ t: '●  ', size: ty.label - 1, color: col }, { t: DLV_RISK[r.risk], size: ty.small, color: r.risk === 'OK' ? t.subtle : col, bold: r.risk !== 'OK' }] }], 'ctr'));
        }
      });
      y += rowH;
      shown++;
      left.set(label, (left.get(label) ?? 1) - 1);
      out.push(d.line(a.x, y, a.x + a.w, y, mixHex(t.hairline, 'FFFFFF', 0.35), 0.5));
    }
  }
  // Reste, groupe par groupe : « … et 22 autres à livrer · 79 livrés ».
  const rest = groups.map(([label]) => [label, left.get(label) ?? 0] as const).filter(([, n]) => n > 0).map(([label, n]) => (label === 'Livrés' ? `${n} livré${n > 1 ? 's' : ''}` : label === 'En retard' ? `${n} autre${n > 1 ? 's' : ''} en retard` : `${n} autre${n > 1 ? 's' : ''} à livrer`));
  if (rest.length) out.push(d.text({ x: a.x, y: y + 0.03 * IN, w: a.w, h: moreH - 0.03 * IN }, [{ runs: [{ t: `… et ${rest.join(' · ')}`, size: ty.label, color: t.subtle, italic: true }] }], 'ctr'));
  return out.join('');
}

// ───────────── Fiches d'arbitrage : la fiche de Pilotage › Décisions (11/10/2026) ─────────────

export interface ArbitrationCard {
  code: string; title: string; status: string; body: string | null; question: string | null;
  options: Array<{ code: 'A' | 'B'; label: string; score: number | null }>; reco: 'A' | 'B' | null; tie: boolean;
  /** Critères dans l'ordre de la fiche ; `at` / `bt` : justification des notes de A et B. */
  criteria: Array<{ name: string; weight: number; a: number; b: number; at?: string; bt?: string }>;
  /** Date d'arbitrage (fiche arbitrée). */ decided?: string | null;
  /** Chantier, contexte, recommandation et décision attendue (textes de la fiche). */ ws?: string | null; context?: string | null; recBody?: string | null; expectedText?: string | null;
  /** Séance où la décision est attendue (sinon la prochaine de l'instance). */ session?: { iso: string; label: string } | null;
}
export interface ArbitrationsData { today: string; cards: ArbitrationCard[]; more: string[]; show: Record<string, boolean>; period: string | null }
const ARB_STAGE: Record<string, string> = { DRAFT: 'Brouillon', IN_REVIEW: 'En instruction', TO_ARBITRATE: 'À arbitrer', ARBITRATED: 'Arbitrée' };
/** Note maximale d'un critère : échelle des scores pondérés. */
export const ARB_SCALE = 4;
/**
 * Palette de la fiche, reprise de Pilotage › Décisions (`HTc` de `RISE Cockpit.dc.html`) : par note de 0 à 4, fond de la
 * cellule, texte de la justification, chiffre de la note. Le rapport reproduit la fiche du Cockpit à l'identique.
 */
export const ARB_HEAT: Record<number, [string, string, string]> = { 0: ['F6F8F7', '8A9AA6', 'A3B0B9'], 1: ['F1F4F3', '43586A', '8A9AA6'], 2: ['DCEFEB', '1F4B47', '3D7F78'], 3: ['A9D7D0', '0E3B37', '0E3B37'], 4: ['15756E', 'FFFFFF', 'FFFFFF'] };
/** Couleurs de la fiche du Cockpit : encre, vert d'eau (option B, recommandation), libellés, filets, bandeau. */
export const ARB_COLORS = { ink: '10233A', teal: '15756E', tealText: '1D8F86', recLabel: '146B64', label: '5C7280', text: '43586A', grey: '8A9AA6', rule: 'DFE7E5', ruleSoft: 'EEF3F2', band: '10233A', bandLabel: '9FDCD4', amber: 'C06F1F' };

/** Largeur utile estimée pour couper les textes de la fiche (police réelle plus étroite que l'estimation de `wrapText`). */
const WRAP_ARB = 1.12;
const score1 = (v: number | null) => (v === null ? '—' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));

/**
 * Fiche d'arbitrage, telle que Pilotage › Décisions la présente : « Fiche d'arbitrage · code · étape », chantier et
 * instance, question en titre, contexte ; grille critère, poids, option A, option B — chaque note dans une cellule
 * teintée selon sa valeur (1 à 4) avec sa justification, « Recommandation PMO » sur l'option retenue ; score pondéré
 * sur 4 avec sa barre (A en encre, B en vert d'eau) et la légende des notes ; recommandation du PMO ; bandeau
 * « Décision attendue » avec le compte à rebours jusqu'à la séance. Une fiche par page, les autres citées en tête.
 */
export function drawArbitrations(d: Draw, a: Box, x: ArbitrationsData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [], show = x.show, C = ARB_COLORS;
  if (!x.cards.length) return emptyState(d, a, 'Aucune fiche d’arbitrage', x.period ? `Ni en attente, ni arbitrée sur la période (${x.period}).` : 'Aucune décision n’a de fiche d’arbitrage.');
  const c = x.cards[0], lh = (s: number) => s * 1.28 * PT, W = WRAP_ARB;
  const toArb = c.status === 'TO_ARBITRATE', done = c.status === 'ARBITRATED';
  // Colonnes : critère, poids, option A, option B (proportions de la fiche du Cockpit).
  const gap = 0.07 * IN, wW = 0.62 * IN, rest = a.w - wW - 3 * gap, crW = (rest * 1.1) / 4.1, opW = (rest * 1.5) / 4.1;
  const cX = a.x, wX = cX + crW + gap, aX = wX + wW + gap, bX = aX + opW + gap;
  const titleSize = ty.lead + 3, title = c.question || c.title, tl = balanced(title, a.w * 0.8 * W, titleSize, 2);
  const ctx = c.context ? wrapText(c.context, (a.w - 0.9 * IN) * W, ty.small + 0.5, 2) : [];
  const recL = show.reco !== false && c.recBody ? wrapText(c.recBody, (a.w - crW - wW - 2 * gap - 0.2 * IN) * W, ty.small + 0.5, 2) : [];
  const expL = c.expectedText ? wrapText(c.expectedText, (a.w - 2.6 * IN) * W, ty.small + 0.5, 2) : [];
  const expNone = !expL.length;
  const headH = 0.25 * IN, metaH = 0, titleH = tl.length * lh(titleSize) + 0.06 * IN, ctxH = ctx.length ? ctx.length * lh(ty.small + 0.5) + 0.1 * IN : 0.04 * IN;
  const thH = 0.32 * IN, scoreH = 0.5 * IN, recH = show.reco !== false ? Math.max(0.44 * IN, recL.length * lh(ty.small + 0.5) + 0.18 * IN) : 0, bandH = Math.max(0.54 * IN, expL.length * lh(ty.small + 0.5) + 0.28 * IN);
  const fixed = headH + metaH + titleH + ctxH + thH + scoreH + recH + bandH + 0.06 * IN;
  // Lignes de la grille : justification sur deux lignes, sinon une ; au-delà de la page, « … et N autres critères ».
  const crits = show.criteria !== false ? c.criteria : [];
  const cellW = opW - 0.62 * IN, cl = (s: number) => s * 1.18 * PT, rowsH = (n: number, z: number) => crits.map((k) => Math.max(0.34 * IN, Math.max(1, ...[k.at, k.bt].map((s) => (s ? wrapText(s, cellW * W, z, n).length : 1))) * cl(z) + 0.1 * IN));
  const RG = 0.045 * IN;
  // Justifications : deux lignes, puis deux lignes en corps réduit, sinon une ligne.
  const room = a.h - fixed, fits = (h: number[]) => h.reduce((s, v) => s + v + RG, 0) <= room;
  let lines = 2, js = ty.small, hs = rowsH(2, js);
  if (!fits(hs)) { js = ty.small - 1; hs = rowsH(2, js); }
  if (!fits(hs)) { lines = 1; js = ty.small; hs = rowsH(1, js); }
  let shown = 0, used = 0;
  for (const h of hs) { if (used + h + RG > room - (shown < hs.length - 1 ? 0.22 * IN : 0) && shown) break; used += h + RG; shown++; }

  let y = a.y;
  // 1. En-tête : « Fiche d'arbitrage », code, étape ; autres fiches citées à droite.
  const dot = toArb ? C.amber : done ? t.ok : C.tealText;
  // Chantier et instance en vert d'eau, sur la même ligne.
  const meta = [c.ws, c.body].filter(Boolean).join(' · ');
  out.push(d.text({ x: a.x, y, w: a.w * 0.8, h: headH }, [{ runs: [{ t: 'Fiche d’arbitrage', size: ty.label, color: C.label, bold: true, caps: true, spc: 2 }, { t: `     ${c.code}`, size: ty.small, color: C.ink, bold: true }, ...(show.status !== false ? [{ t: '     ●  ', size: ty.label, color: dot }, { t: `${ARB_STAGE[c.status] ?? c.status}${done && c.decided ? ` · ${dayOf(c.decided, x.today)}` : ''}`, size: ty.small, color: C.ink }] : []), ...(meta ? [{ t: `     ${wrapText(meta, a.w * 0.4 * W, ty.small, 1)[0]}`, size: ty.small, color: C.tealText, bold: true }] : [])] }], 'ctr'));
  if (x.more.length) out.push(d.text({ x: a.x + a.w * 0.6, y, w: a.w * 0.4, h: headH }, [{ align: 'r', runs: [{ t: x.more.length > 1 ? 'Autres fiches  ' : 'Autre fiche  ', size: ty.label, color: C.grey }, { t: `${x.more.slice(0, 6).join(' · ')}${x.more.length > 6 ? ' …' : ''}`, size: ty.label, color: C.label, bold: true }] }], 'ctr'));
  y += headH;
  // 2. Question en titre ; contexte.
  out.push(d.text({ x: a.x, y, w: a.w * 0.85, h: titleH }, tl.map((l) => ({ line: 100, runs: [{ t: l, size: titleSize, color: C.ink, bold: true, font: t.head }] })), 't'));
  y += titleH;
  if (ctx.length) {
    out.push(d.text({ x: a.x, y, w: a.w, h: ctxH }, ctx.map((l, j) => ({ line: 100, runs: [...(j ? [] : [{ t: 'Contexte ·  ', size: ty.small + 0.5, color: C.ink, bold: true }]), { t: l, size: ty.small + 0.5, color: C.text }] })), 't'));
  }
  y += ctxH;
  // 3. Grille : en-têtes, puis une ligne par critère.
  const head = (bx: number, w: number, txt: string) => out.push(d.text({ x: bx + 0.06 * IN, y, w: w - 0.06 * IN, h: thH }, [{ runs: [{ t: txt, size: ty.label, color: C.label, bold: true, caps: true, spc: 1 }] }], 'ctr'));
  head(cX, crW, 'Critère'); head(wX, wW, 'Poids');
  for (const o of c.options) {
    const bx = o.code === 'A' ? aX : bX, rec = show.reco !== false && c.reco === o.code;
    const lbl = wrapText(`Option ${o.code} · ${o.label}`, (opW - (rec ? 1.55 * IN : 0.2 * IN)) * W, ty.small + 0.5, 1)[0];
    out.push(d.text({ x: bx + 0.14 * IN, y, w: opW - 0.14 * IN, h: thH }, [{ runs: [{ t: lbl, size: ty.small + 0.5, color: C.ink, bold: true }] }], 'ctr'));
    if (rec) {
      const pw = 1.32 * IN, ph = 0.22 * IN, est = Math.min(opW - pw - 0.3 * IN, (lbl.length * (ty.small + 0.5) * 0.47 * PT));
      out.push(d.sp({ box: { x: bx + 0.14 * IN + est + 0.12 * IN, y: y + (thH - ph) / 2, w: pw, h: ph }, geom: 'roundRect', adj: 50000, fill: C.teal, anchor: 'ctr', paras: [{ align: 'ctr', runs: [{ t: 'Recommandation PMO', size: ty.label, color: 'FFFFFF', bold: true }] }] }));
    }
  }
  y += thH;
  crits.slice(0, shown).forEach((k, i) => {
    const h = hs[i];
    out.push(d.line(cX, y, cX + crW, y, C.ruleSoft, 0.75));
    out.push(d.line(wX, y, wX + wW, y, C.ruleSoft, 0.75));
    out.push(d.text({ x: cX + 0.06 * IN, y: y + 0.03 * IN, w: crW - 0.12 * IN, h: h - 0.06 * IN }, balanced(k.name, (crW - 0.12 * IN) * W, ty.small + 0.5, 2).map((l) => ({ line: 100, runs: [{ t: l, size: ty.small + 0.5, color: C.ink, bold: true }] })), 'ctr'));
    out.push(d.text({ x: wX + 0.06 * IN, y: y + 0.03 * IN, w: wW - 0.06 * IN, h: h - 0.06 * IN }, [{ runs: [{ t: `${k.weight} %`, size: ty.small + 0.5, color: C.text }] }], 'ctr'));
    for (const side of ['A', 'B'] as const) {
      const v = Math.max(0, Math.min(4, Math.round(side === 'A' ? k.a : k.b))), txt = (side === 'A' ? k.at : k.bt) || '', H = ARB_HEAT[v] ?? ARB_HEAT[0], bx = side === 'A' ? aX : bX;
      out.push(d.sp({ box: { x: bx, y: y + 0.03 * IN, w: opW, h: h - 0.06 * IN }, geom: 'roundRect', adj: Math.min(50000, (0.1 * IN * 100000) / (h - 0.06 * IN)), fill: H[0] }));
      out.push(d.text({ x: bx + 0.14 * IN, y: y + 0.03 * IN, w: 0.32 * IN, h: h - 0.06 * IN }, [{ runs: [{ t: v ? String(v) : '–', size: ty.lead + 2, color: H[2], bold: true, font: t.head }] }], 'ctr'));
      if (txt) out.push(d.text({ x: bx + 0.5 * IN, y: y + 0.03 * IN, w: cellW, h: h - 0.06 * IN }, wrapText(txt, cellW * W, js, lines).map((l) => ({ line: 92, runs: [{ t: l, size: js, color: H[1] }] })), 'ctr'));
    }
    y += h + RG;
  });
  if (shown < crits.length) {
    out.push(d.text({ x: cX + 0.06 * IN, y: y - 0.02 * IN, w: a.w - 0.06 * IN, h: 0.2 * IN }, [{ runs: [{ t: `… et ${plural(crits.length - shown, 'autre critère', 'autres critères')}`, size: ty.label, color: C.grey, italic: true }] }], 'ctr'));
    y += 0.2 * IN;
  }
  // 4. Score pondéré sur 4 : légende des notes, scores et barres (A en encre, B en vert d'eau).
  out.push(d.line(a.x, y, a.x + a.w, y, C.rule, 0.75));
  out.push(d.text({ x: cX + 0.06 * IN, y: y + 0.06 * IN, w: crW + wW, h: 0.22 * IN }, [{ runs: [{ t: 'Score pondéré', size: ty.small + 0.5, color: C.ink, bold: true }, { t: ' · sur 4', size: ty.small, color: C.grey }] }], 'ctr'));
  const tw = 0.17 * IN, th = 0.15 * IN, ly = y + 0.31 * IN;
  [1, 2, 3, 4].forEach((n, j) => {
    const H = ARB_HEAT[n];
    out.push(d.sp({ box: { x: cX + 0.06 * IN + j * (tw + 0.025 * IN), y: ly, w: tw, h: th }, geom: 'roundRect', adj: 25000, fill: H[0], line: n === 1 ? { color: 'E3EAE8', w: 0.5 } : null, anchor: 'ctr', paras: [{ align: 'ctr', runs: [{ t: String(n), size: ty.label - 1.5, color: n === 4 ? 'FFFFFF' : H[2], bold: true }] }] }));
  });
  out.push(d.text({ x: cX + 0.06 * IN + 4 * (tw + 0.025 * IN) + 0.06 * IN, y: ly - 0.02 * IN, w: 1.4 * IN, h: th + 0.04 * IN }, [{ runs: [{ t: 'notes par critère', size: ty.label, color: C.grey }] }], 'ctr'));
  for (const o of c.options) {
    const bx = o.code === 'A' ? aX : bX, col = o.code === 'A' ? C.ink : C.teal, sw = 0.72 * IN, barX = bx + 0.14 * IN + sw + 0.1 * IN, barW = opW - (barX - bx) - 0.14 * IN, bh = 0.055 * IN, cy = y + scoreH / 2;
    out.push(d.text({ x: bx + 0.14 * IN, y: y + 0.04 * IN, w: sw, h: scoreH - 0.08 * IN }, [{ runs: [{ t: show.options !== false ? score1(o.score) : '—', size: ty.stat * 0.8, color: col, bold: true, font: t.head }] }], 'ctr'));
    out.push(d.pill({ x: barX, y: cy - bh / 2, w: barW, h: bh }, C.ruleSoft));
    if (show.options !== false && o.score) out.push(d.pill({ x: barX, y: cy - bh / 2, w: Math.max(bh, (barW * Math.min(ARB_SCALE, o.score)) / ARB_SCALE), h: bh }, col));
  }
  y += scoreH;
  // 5. Recommandation du PMO.
  if (recH) {
    out.push(d.line(a.x, y, a.x + a.w, y, 'E6EEEC', 0.75));
    const opt = c.reco ? `Option ${c.reco}` : c.tie ? 'Égalité entre A et B' : '—';
    out.push(d.text({ x: cX + 0.06 * IN, y: y + 0.1 * IN, w: crW + wW, h: recH - 0.14 * IN }, [{ runs: [{ t: 'Recommandation PMO', size: ty.label, color: C.recLabel, bold: true, caps: true, spc: 1.4 }] }, { spcBef: 3, runs: [{ t: opt, size: ty.small + 0.5, color: c.tie && !c.reco ? C.amber : C.ink, bold: true }] }], 't'));
    if (recL.length) out.push(d.text({ x: aX + 0.14 * IN, y: y + 0.12 * IN, w: a.x + a.w - aX - 0.2 * IN, h: recH - 0.14 * IN }, recL.map((l) => ({ line: 110, runs: [{ t: l, size: ty.small + 0.5, color: C.ink }] })), 't'));
    y += recH;
  }
  // 6. Bandeau « Décision attendue » : texte de la fiche, compte à rebours jusqu'à la séance.
  const by = a.y + a.h - bandH;
  out.push(d.sp({ box: { x: a.x, y: by, w: a.w, h: bandH }, fill: C.band }));
  const jx = done ? 'Arbitrée' : c.session ? (() => { const n = days(x.today, c.session.iso); return n > 0 ? `J-${n}` : n === 0 ? 'Aujourd’hui' : 'Échue'; })() : '';
  const jxSub = done ? (c.decided ? dayOf(c.decided, x.today) : '') : c.session ? c.session.label : 'Aucune séance planifiée';
  const rw = 2.1 * IN, rx = a.x + a.w - rw;
  out.push(d.text({ x: a.x + 0.24 * IN, y: by + 0.12 * IN, w: rx - a.x - 0.5 * IN, h: bandH - 0.2 * IN }, [{ runs: [{ t: done ? 'Décision' : 'Décision attendue', size: ty.label, color: C.bandLabel, bold: true, caps: true, spc: 1.8 }] }, ...expL.map((l, j) => ({ spcBef: j ? 0 : 3, line: 100, runs: [{ t: l, size: ty.small + 0.5, color: 'FFFFFF' }] })), ...(expNone ? [{ spcBef: 3, runs: [{ t: 'Non renseignée dans la fiche', size: ty.small, color: mixHex(C.band, 'FFFFFF', 0.55), italic: true }] }] : [])], 't'));
  out.push(d.line(rx, by + 0.14 * IN, rx, by + bandH - 0.14 * IN, mixHex(C.band, 'FFFFFF', 0.16), 0.75));
  out.push(d.text({ x: rx + 0.2 * IN, y: by + 0.06 * IN, w: rw - 0.44 * IN, h: bandH - 0.12 * IN }, [...(jx ? [{ align: 'r' as const, line: 100, runs: [{ t: jx, size: ty.stat * 0.78, color: 'FFFFFF', bold: true, font: t.head }] }] : []), { align: 'r', runs: [{ t: jxSub, size: ty.small, color: mixHex(C.band, 'FFFFFF', 0.72) }] }], 'ctr'));
  return out.join('');
}
