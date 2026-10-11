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

// ───────────── Décisions : flux de décision (refonte du 11/10/2026) ─────────────

export interface DecisionRow { code: string; title: string; status: string; created: string; decided: string | null; body: string; bodyShort: string; decision: string | null; impact: string | null; expected: string | null }
export interface DecisionsData { today: string; pending: DecisionRow[]; taken: DecisionRow[]; last: DecisionRow[]; period: string | null; show: Record<string, boolean> }
/** Décisions déjà prises rappelées quand aucune ne l'a été sur la période. */
export const DECISIONS_RECALL = 3;
/** Étapes d'une décision avant arbitrage, dans l'ordre (libellés du Cockpit ; « Brouillon » pour les décisions antérieures au 11/10/2026). */
export const DECISION_STAGES = [{ id: 'DRAFT', label: 'Brouillon' }, { id: 'IN_REVIEW', label: 'En instruction' }, { id: 'TO_ARBITRATE', label: 'À arbitrer' }];
/** Attente « longue » (rouge) : 30 jours et plus depuis la création. */
export const DECISION_STALE_DAYS = 30;
/** Couloir des décisions prises : un peu plus large (il porte le texte de la décision). */
export const DECISION_DONE_LANE = 1.35;
/** Largeur utile estimée pour couper les textes des couloirs (la police réelle est plus étroite que l'estimation prudente de `wrapText`). */
export const DECISION_WRAP = 1.15;

/** Ordre des décisions en attente : les plus avancées (à arbitrer) d'abord, puis les plus anciennes. */
export function sortPending(rows: DecisionRow[]): DecisionRow[] {
  const s = (r: DecisionRow) => DECISION_STAGES.findIndex((x) => x.id === r.status);
  return [...rows].sort((a, b) => s(b) - s(a) || a.created.localeCompare(b.created) || a.code.localeCompare(b.code));
}

/**
 * Flux de décision : un couloir par étape, lu de gauche à droite — en instruction › à arbitrer › décidées (brouillons
 * en tête s'il en reste). Chaque couloir : libellé, nombre, précision (la plus ancienne attente ; la période), filet de
 * sa couleur ; les filets et les chevrons dessinent le parcours. Décisions en attente : code, attente (rouge à partir de
 * 30 jours), intitulé, instance et séance attendue, les plus anciennes en tête. Décisions prises sur la période : date,
 * instance, code, ce qui a été décidé, intitulé, impact en option ; sans décision prise, les dernières sont rappelées.
 */
export function drawDecisions(d: Draw, a: Box, x: DecisionsData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [], show = x.show;
  const oldest = (rs: DecisionRow[]) => [...rs].sort((u, v) => u.created.localeCompare(v.created) || u.code.localeCompare(v.code));
  const pending = sortPending(x.pending), quiet = mixHex(t.ink, 'FFFFFF', 0.62);
  type Lane = { id: string; label: string; rows: DecisionRow[]; color: string; f: number };
  const lanes: Lane[] = show.status !== false
    ? DECISION_STAGES.map((s) => ({ id: s.id, label: s.label, rows: oldest(pending.filter((r) => r.status === s.id)), color: s.id === 'TO_ARBITRATE' ? t.watch : quiet, f: 1 })).filter((l) => l.id !== 'DRAFT' || l.rows.length)
    : [{ id: 'WAIT', label: 'En attente', rows: oldest(pending), color: quiet, f: 1 }];
  const taken = [...x.taken].sort((u, v) => (v.decided ?? '').localeCompare(u.decided ?? '')), recall = !taken.length;
  const doneRows = taken.length ? taken : x.last.slice(0, DECISIONS_RECALL);
  lanes.push({ id: 'DONE', label: 'Décidées', rows: doneRows, color: t.accent, f: DECISION_DONE_LANE });
  const G = 0.42 * IN, F = lanes.reduce((s, l) => s + l.f, 0), unit = (a.w - G * (lanes.length - 1)) / F;
  const headH = 0.8 * IN, ruleY = a.y + headH, limit = a.y + a.h - 0.24 * IN, nameSize = ty.small + 0.5;
  let lx = a.x;
  lanes.forEach((L, li) => {
    const lw = L.f * unit, done = L.id === 'DONE';
    const n = done ? taken.length : L.rows.length, hot = L.id === 'TO_ARBITRATE' && n > 0;
    // En-tête : libellé, nombre, précision ; filet de la couleur du couloir.
    out.push(d.label({ x: lx, y: a.y, w: lw, h: 0.2 * IN }, L.label, hot ? t.watch : done ? t.accent : t.muted));
    const maxAge = L.rows.length ? Math.max(...L.rows.map((r) => days(r.created, x.today))) : 0;
    const sub = done ? (x.period ? 'prises sur la période' : 'prises · toutes dates') : n && show.date !== false ? `la plus ancienne : ${maxAge} j` : '';
    out.push(d.text({ x: lx, y: a.y + 0.2 * IN, w: lw, h: headH - 0.3 * IN }, [{ runs: [{ t: String(n), size: ty.stat * 0.82, color: !n ? t.subtle : hot ? t.watch : done ? t.accent : t.ink, bold: true, font: t.head }, ...(sub ? [{ t: `   ${sub}`, size: ty.small, color: !done && maxAge >= DECISION_STALE_DAYS ? t.risk : t.muted, bold: !done && maxAge >= DECISION_STALE_DAYS }] : [])] }], 'b'));
    out.push(d.sp({ box: { x: lx, y: ruleY - 0.012 * IN, w: lw, h: 0.024 * IN }, fill: !n && !done ? t.hairline : L.color }));
    if (li < lanes.length - 1) out.push(d.sp({ box: { x: lx + lw + G / 2 - 0.035 * IN, y: ruleY - 0.055 * IN, w: 0.07 * IN, h: 0.11 * IN }, geom: 'chevron', adj: 60000, fill: t.subtle }));
    let y = ruleY + 0.16 * IN, shown = 0;
    const note = (txt: string) => { out.push(d.text({ x: lx, y, w: lw, h: 0.26 * IN }, [{ runs: [{ t: txt, size: ty.small, color: t.subtle, italic: true }] }], 't')); y += 0.3 * IN; };
    if (!done) {
      if (!L.rows.length) note(L.id === 'TO_ARBITRATE' ? 'rien à arbitrer' : L.id === 'WAIT' ? 'aucune décision en attente' : 'aucune décision');
      for (const r of L.rows) {
        const tl = balanced(r.title, lw * DECISION_WRAP, nameSize, 3);
        // Instance, puis séance attendue : chacune sur sa ligne.
        const cl = [show.body !== false ? r.body : null, r.expected ? `attendue ${r.expected}` : null].filter((v): v is string => !!v).map((v) => wrapText(v, lw * DECISION_WRAP, ty.label, 1)[0]);
        const top = show.code !== false || show.date !== false;
        const h = (top ? ty.label * 1.7 : 0) * PT + tl.length * nameSize * 1.24 * PT + (cl.length ? cl.length * ty.label * 1.38 * PT + 3 * PT : 0) + 0.18 * IN;
        if (y + h > limit && shown > 0) break;
        const age = days(r.created, x.today), stale = age >= DECISION_STALE_DAYS;
        const paras: Para[] = [];
        if (top) {
          if (show.date !== false) out.push(d.text({ x: lx, y: y + 0.06 * IN, w: lw, h: ty.label * 1.7 * PT }, [{ align: 'r', runs: [{ t: 'attente  ', size: ty.label, color: t.subtle }, { t: `${age} j`, size: ty.small, color: stale ? t.risk : t.ink, bold: true }] }], 'ctr'));
          paras.push({ runs: [{ t: show.code !== false ? r.code : ' ', size: ty.label, color: t.subtle, bold: true, spc: 0.4 }] });
        }
        tl.forEach((l, j) => paras.push({ spcBef: j || !top ? 0 : 2, line: 100, runs: [{ t: l, size: nameSize, color: t.ink, bold: true }] }));
        cl.forEach((l, j) => paras.push({ spcBef: j ? 0 : 3, runs: [{ t: l, size: ty.label, color: t.muted }] }));
        out.push(d.text({ x: lx, y: y + 0.08 * IN, w: lw, h: h - 0.12 * IN }, paras, 't'));
        y += h;
        shown++;
        if (shown < L.rows.length) out.push(d.line(lx, y, lx + lw, y, mixHex(t.hairline, 'FFFFFF', 0.3), 0.5));
      }
      if (shown < L.rows.length) out.push(d.text({ x: lx, y: y + 0.02 * IN, w: lw, h: 0.22 * IN }, [{ runs: [{ t: `… et ${plural(L.rows.length - shown, 'autre décision', 'autres décisions')}`, size: ty.label, color: t.subtle, italic: true }] }], 't'));
    } else {
      if (!L.rows.length) note('Aucune décision prise à ce jour.');
      else if (recall) {
        note('Aucune décision prise sur la période.');
        out.push(d.label({ x: lx, y: y - 0.04 * IN, w: lw, h: 0.2 * IN }, L.rows.length > 1 ? 'Dernières décisions prises' : 'Dernière décision prise', t.subtle));
        y += 0.24 * IN;
      }
      for (const r of L.rows) {
        const decided = r.decided ?? r.created, hasDec = show.decision !== false && !!r.decision?.trim();
        const wl = balanced(hasDec ? r.decision! : r.title, lw * DECISION_WRAP, nameSize, 3);
        const sub = hasDec ? wrapText(r.title, lw * DECISION_WRAP, ty.label, 2) : [];
        const imp = show.impact && r.impact?.trim() ? wrapText(`Impact : ${r.impact}`, lw * DECISION_WRAP, ty.label, 2) : [];
        const h = ty.label * 1.7 * PT + wl.length * nameSize * 1.24 * PT + (sub.length ? sub.length * ty.label * 1.38 * PT + 2 * PT : 0) + imp.length * ty.label * 1.38 * PT + (imp.length ? 3 * PT : 0) + 0.18 * IN;
        if (y + h > limit && shown > 0) break;
        const head: Run[] = [{ t: decided.slice(0, 4) === x.today.slice(0, 4) ? frShortDate(decided) : longDate(decided), size: ty.label, color: recall ? t.muted : t.accent, bold: true, caps: true, spc: 0.8 }];
        if (show.body !== false) head.push({ t: `  ·  ${r.bodyShort}`, size: ty.label, color: t.muted, bold: true, caps: true, spc: 0.8 });
        if (show.code !== false) head.push({ t: `  ·  ${r.code}`, size: ty.label, color: t.subtle, bold: true });
        const paras: Para[] = [{ runs: head }, ...wl.map((l, j) => ({ spcBef: j ? 0 : 2, line: 100, runs: [{ t: l, size: nameSize, color: recall ? t.muted : t.ink, bold: true }] }))];
        sub.forEach((l, j) => paras.push({ spcBef: j ? 0 : 2, runs: [{ t: l, size: ty.label, color: t.muted }] }));
        imp.forEach((l, j) => paras.push({ spcBef: j ? 0 : 3, runs: [{ t: l, size: ty.label, color: t.subtle, italic: true }] }));
        out.push(d.text({ x: lx, y: y + 0.08 * IN, w: lw, h: h - 0.12 * IN }, paras, 't'));
        y += h;
        shown++;
        if (shown < L.rows.length) out.push(d.line(lx, y, lx + lw, y, mixHex(t.hairline, 'FFFFFF', 0.3), 0.5));
      }
      if (shown < L.rows.length) out.push(d.text({ x: lx, y: y + 0.02 * IN, w: lw, h: 0.22 * IN }, [{ runs: [{ t: `… et ${plural(L.rows.length - shown, 'autre décision', 'autres décisions')} prise${L.rows.length - shown > 1 ? 's' : ''}`, size: ty.label, color: t.subtle, italic: true }] }], 't'));
    }
    lx += lw + G;
  });
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

// ───────────── Fiches d'arbitrage : duel (refonte du 11/10/2026) ─────────────

export interface ArbitrationCard {
  code: string; title: string; status: string; body: string | null; question: string | null;
  options: Array<{ code: 'A' | 'B'; label: string; score: number | null }>; reco: 'A' | 'B' | null; tie: boolean;
  criteria: Array<{ name: string; weight: number; a: number; b: number }>;
  /** Date d'arbitrage (fiche arbitrée). */ decided?: string | null;
}
export interface ArbitrationsData { today: string; cards: ArbitrationCard[]; more: string[]; show: Record<string, boolean>; period: string | null }
const ARB_STAGE: Record<string, string> = { DRAFT: 'Brouillon', IN_REVIEW: 'En instruction', TO_ARBITRATE: 'À arbitrer', ARBITRATED: 'Arbitrée' };
/** Critères montrés par fiche (les plus pondérés), dans la hauteur disponible. */
export const ARB_CRITERIA_MAX = 6;
/** Note maximale d'un critère : échelle fixe des barres (honnêteté du graphique). */
export const ARB_SCALE = 4;
/** Fiche seule sur la page plus large que ce seuil (pouces) : en deux colonnes (énoncé à gauche, duel à droite). */
export const ARB_SPLIT_IN = 8;

/** Largeur utile estimée pour couper les textes des fiches (police réelle plus étroite que l'estimation de `wrapText`). */
const WRAP_ARB = 1.12;
const score2 = (v: number | null) => (v === null ? '—' : v.toFixed(2).replace('.', ','));

/**
 * Fiches d'arbitrage en duel : l'option A à gauche, l'option B à droite, toujours. En tête, la décision (code, instance,
 * étape) et la question ; puis les deux notes face à face (sur 4, la recommandée en accent) et, dessous, les critères
 * en papillon autour de leur intitulé et de leur poids : la barre de A part vers la gauche, celle de B vers la droite,
 * sur une échelle fixe de 0 à 4 ; la meilleure note du critère en accent. Une fiche seule occupe deux colonnes.
 */
export function drawArbitrations(d: Draw, a: Box, x: ArbitrationsData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [], show = x.show;
  if (!x.cards.length) return emptyState(d, a, 'Aucune fiche d’arbitrage', x.period ? `Ni en attente, ni arbitrée sur la période (${x.period}).` : 'Aucune décision n’a de fiche d’arbitrage.');
  const moreH = x.more.length ? 0.3 * IN : 0, gap = 0.5 * IN, n = x.cards.length;
  const cw = (a.w - gap * (n - 1)) / n, bottom = a.y + a.h - moreH, lh = (s: number) => s * 1.3 * PT;
  const soft = mixHex(t.ink, 'FFFFFF', 0.72), track = mixHex(t.hairline, 'FFFFFF', 0.45);
  x.cards.forEach((c, i) => {
    const bx = a.x + i * (cw + gap);
    if (i) out.push(d.line(bx - gap / 2, a.y + 0.06 * IN, bx - gap / 2, bottom - 0.06 * IN, t.hairline, 0.75));
    const split = cw > ARB_SPLIT_IN * IN && (show.options !== false || show.reco !== false || show.criteria !== false);
    const L: Box = split ? { x: bx, y: a.y, w: cw * 0.4, h: bottom - a.y } : { x: bx, y: a.y, w: cw, h: bottom - a.y };
    const Rx = split ? bx + cw * 0.4 + 0.6 * IN : bx, Rw = split ? cw * 0.6 - 0.6 * IN : cw;
    const toArb = c.status === 'TO_ARBITRATE', done = c.status === 'ARBITRATED';
    // Fiches côte à côte (hauteur comptée) : intitulé, question et notes plus compacts, critères sur une ligne.
    const compact = !split, W = WRAP_ARB;
    // 1. La décision : trait court (ambre si à arbitrer), code et instance, étape ; intitulé ; question.
    let y = a.y;
    out.push(d.sp({ box: { x: L.x, y, w: 0.3 * IN, h: 0.028 * IN }, fill: toArb ? t.watch : t.accent }));
    y += 0.1 * IN;
    const stage = `${ARB_STAGE[c.status] ?? c.status}${done && c.decided ? ` · ${dayOf(c.decided, x.today)}` : ''}`;
    out.push(d.text({ x: L.x, y, w: L.w, h: 0.22 * IN }, [{ runs: [{ t: c.code, size: ty.label, color: t.subtle, bold: true, spc: 0.4 }, ...(c.body ? [{ t: `   ${c.body}`, size: ty.label, color: t.subtle }] : [])] }], 'ctr'));
    if (show.status !== false) out.push(d.text({ x: L.x, y, w: L.w, h: 0.22 * IN }, [{ align: 'r', runs: [{ t: '●  ', size: ty.label - 1, color: toArb ? t.watch : done ? t.ok : t.subtle }, { t: stage, size: ty.small, color: toArb ? t.watch : t.muted, bold: toArb }] }], 'ctr'));
    y += 0.28 * IN;
    const titleSize = compact ? ty.lead + 0.5 : ty.lead + 2, tl = balanced(c.title, L.w * W, titleSize, split ? 3 : 2);
    out.push(d.text({ x: L.x, y, w: L.w, h: tl.length * lh(titleSize) + 0.06 * IN }, tl.map((l) => ({ line: 100, runs: [{ t: l, size: titleSize, color: t.ink, bold: true, font: t.head }] })), 't'));
    y += tl.length * lh(titleSize) + (compact ? 0.1 : 0.16) * IN;
    if (show.question !== false && c.question) {
      const qs = split ? ty.body : ty.small, ql = balanced(c.question, (L.w - 0.16 * IN) * W, qs, split ? 6 : 3), qh = ql.length * lh(qs) + 0.02 * IN;
      out.push(d.sp({ box: { x: L.x, y: y + 0.03 * IN, w: 0.022 * IN, h: qh - 0.04 * IN }, fill: toArb ? t.watch : t.accent }));
      out.push(d.text({ x: L.x + 0.16 * IN, y, w: L.w - 0.16 * IN, h: qh }, ql.map((l) => ({ line: 100, runs: [{ t: l, size: qs, color: t.ink, italic: true }] })), 't'));
      y += qh + (compact ? 0.16 : 0.22) * IN;
    }
    if (split) y = a.y + 0.1 * IN;
    // 2. Duel : les deux notes face à face autour de l'axe ; la recommandée en accent.
    const cx = Rx + Rw / 2, half = Rw / 2 - 0.26 * IN;
    if (show.options !== false || show.reco !== false) {
      const scoreSize = compact ? ty.stat * 0.62 : ty.stat * 0.8, labL = compact ? 2 : 3;
      const labs = c.options.map((o) => balanced(o.label, half * W, ty.small, labL)), labH = Math.max(...labs.map((l) => l.length)) * lh(ty.small);
      const top = y, duelH = 0.22 * IN + (show.options !== false ? lh(scoreSize) : 0) + labH + 0.04 * IN;
      c.options.forEach((o, oi) => {
        const left = o.code === 'A', best = show.reco !== false && c.reco === o.code, al = left ? 'r' : 'l';
        const ox = left ? cx - 0.26 * IN - half : cx + 0.26 * IN;
        const col = best ? t.accent : c.reco && show.reco !== false ? t.muted : t.ink;
        out.push(d.text({ x: ox, y: top, w: half, h: 0.2 * IN }, [{ align: al, runs: [{ t: `Option ${o.code}`, size: ty.label, color: best ? t.accent : t.subtle, bold: true, caps: true, spc: 0.8 }, ...(best ? [{ t: '  ·  Recommandée', size: ty.label, color: t.accent, bold: true, caps: true, spc: 0.8 }] : [])] }], 'b'));
        let oy = top + 0.22 * IN;
        if (show.options !== false) {
          out.push(d.text({ x: ox, y: oy, w: half, h: lh(scoreSize) }, [{ align: al, runs: [{ t: score2(o.score), size: scoreSize, color: col, bold: best, font: t.head }, { t: ' / 4', size: ty.label, color: t.subtle }] }], 'ctr'));
          oy += lh(scoreSize);
        }
        out.push(d.text({ x: ox, y: oy, w: half, h: labH + 0.04 * IN }, labs[oi].map((l) => ({ align: al, line: 100, runs: [{ t: l, size: ty.small, color: best ? t.ink : t.muted, bold: best }] })), 't'));
      });
      // Axe du duel ; égalité au milieu, sous l'axe.
      out.push(d.line(cx, top + 0.04 * IN, cx, top + duelH - 0.04 * IN, t.hairline, 0.75));
      if (show.reco !== false && c.tie) out.push(d.text({ x: cx - 0.6 * IN, y: top + duelH, w: 1.2 * IN, h: 0.18 * IN }, [{ align: 'ctr', runs: [{ t: 'Égalité', size: ty.label, color: t.watch, bold: true, caps: true, spc: 0.8 }] }], 'ctr'));
      y = top + duelH + (c.tie ? 0.3 : 0.08) * IN;
    }
    // 3. Critères en papillon : intitulé et poids au centre, A vers la gauche, B vers la droite (0 à 4).
    if (show.criteria !== false && c.criteria.length) {
      out.push(d.line(Rx, y, Rx + Rw, y, t.hairline, 0.5));
      y += 0.08 * IN;
      out.push(d.text({ x: Rx, y, w: Rw, h: 0.2 * IN }, [{ align: 'ctr', runs: [{ t: 'Critères · poids', size: ty.label, color: t.muted, bold: true, caps: true, spc: 1 }] }], 'ctr'));
      y += 0.22 * IN;
      // Colonne des intitulés à la mesure du plus long (barres au plus près), barres de 0 à 4 de part et d'autre.
      const nameL = compact ? 1 : 2, numW = 0.22 * IN, bh = (compact ? 0.075 : 0.09) * IN, pad = (compact ? 0.11 : 0.16) * IN;
      const need = Math.max(...c.criteria.map((k) => (k.name.length + 7) * ty.small * 0.5 * PT));
      const nameW = Math.max(1.4 * IN, Math.min(need, 2.6 * IN, Rw * 0.42)), barMax = Math.min((Rw - nameW) / 2 - numW - 0.14 * IN, (compact ? 1.6 : 1.9) * IN);
      const end = bottom - 0.22 * IN, list: typeof c.criteria = [];
      for (const k of c.criteria.slice(0, ARB_CRITERIA_MAX)) {
        const nl = balanced(k.name, nameW * W, ty.small, nameL), rowH = nl.length * lh(ty.small) + pad;
        if (y + rowH > end) break;
        list.push(k);
        out.push(d.text({ x: cx - nameW / 2, y, w: nameW, h: rowH }, nl.map((l, j) => ({ align: 'ctr', line: 100, runs: [{ t: l, size: ty.small, color: t.ink }, ...(j === nl.length - 1 ? [{ t: `   ${k.weight} %`, size: ty.label, color: t.subtle, bold: true }] : [])] })), 'ctr'));
        const by = y + (rowH - bh) / 2;
        for (const side of ['A', 'B'] as const) {
          const v = side === 'A' ? k.a : k.b, o = side === 'A' ? k.b : k.a, win = v > o, eq = v === o;
          const fill = win ? t.accent : eq ? mixHex(t.ink, 'FFFFFF', 0.5) : soft, len = (barMax * Math.max(0, Math.min(ARB_SCALE, v))) / ARB_SCALE;
          const tx0 = side === 'A' ? cx - nameW / 2 - 0.12 * IN - barMax : cx + nameW / 2 + 0.12 * IN;
          out.push(d.pill({ x: tx0, y: by, w: barMax, h: bh }, track));
          if (len > 0) out.push(d.pill({ x: side === 'A' ? tx0 + barMax - Math.max(bh, len) : tx0, y: by, w: Math.max(bh, len), h: bh }, fill));
          out.push(d.text({ x: side === 'A' ? tx0 - numW - 0.04 * IN : tx0 + barMax + 0.04 * IN, y, w: numW, h: rowH }, [{ align: side === 'A' ? 'r' : 'l', runs: [{ t: String(v), size: ty.small, color: win ? t.accent : t.muted, bold: win }] }], 'ctr'));
        }
        y += rowH;
      }
      if (c.criteria.length > list.length) out.push(d.text({ x: Rx, y, w: Rw, h: 0.2 * IN }, [{ align: 'ctr', runs: [{ t: `… et ${plural(c.criteria.length - list.length, 'autre critère', 'autres critères')}`, size: ty.label, color: t.subtle, italic: true }] }], 'ctr'));
    }
  });
  if (x.more.length) out.push(d.text({ x: a.x, y: a.y + a.h - moreH, w: a.w, h: moreH }, [{ runs: [{ t: `… et ${plural(x.more.length, 'autre fiche', 'autres fiches')} : ${x.more.slice(0, 8).join(', ')}${x.more.length > 8 ? '…' : ''}`, size: ty.label, color: t.subtle, italic: true }] }], 'ctr'));
  return out.join('');
}
