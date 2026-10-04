import { Box } from '../domain/report-format';
import { DesignTokens, frNum, luminance, frShortDate, mixHex, scoreTone, statusTone, timeRatio, timeScale, toneColor, typeScale } from '../domain/report-design';

/**
 * Dessin des éléments du rapport en formes PowerPoint natives (03/10/2026), selon le système de design
 * (`domain/report-design.ts`) : Gantt du planning, planning en tableau, tableau de bord du baromètre, lignes de tableau,
 * cartes d'indicateurs, synthèse. Chaque « planche » est un groupe nommé (`rise:cNN.board`) redessiné à chaque
 * publication dans le même cadre : la page garde sa structure, seules les données changent.
 */

const PT = 12700;
const IN = 914400;
/** Texte lisible sur un fond : blanc sur fond sombre, encre sur fond clair. */
const contrastText = (bg: string) => (luminance(bg) > 0.6 ? '1E2124' : 'FFFFFF');
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const R = Math.round;

export interface Run { t: string; size: number; color: string; bold?: boolean; italic?: boolean; caps?: boolean; spc?: number; font?: string }
export interface Para { runs: Run[]; align?: 'l' | 'ctr' | 'r'; spcBef?: number; spcAft?: number; line?: number; bullet?: { char: string; color: string; size?: number } }

export class Draw {
  n: number;
  constructor(readonly t: DesignTokens, start = 5000) { this.n = start; }
  id() { return this.n++; }

  rPr(r: Run) {
    const f = esc(r.font ?? this.t.font);
    return `<a:rPr lang="fr-FR" sz="${R(r.size * 100)}" b="${r.bold ? 1 : 0}"${r.italic ? ' i="1"' : ''}${r.caps ? ' cap="all"' : ''}${r.spc ? ` spc="${R(r.spc * 100)}"` : ''} dirty="0"><a:solidFill><a:srgbClr val="${r.color}"/></a:solidFill><a:latin typeface="${f}"/><a:cs typeface="${f}"/></a:rPr>`;
  }
  para(p: Para) {
    const ppr = `<a:pPr algn="${p.align ?? 'l'}"${p.bullet ? ` marL="${R((p.bullet.size ?? 10) * PT * 1.3)}" indent="-${R((p.bullet.size ?? 10) * PT * 1.3)}"` : ' marL="0" indent="0"'}>${p.line ? `<a:lnSpc><a:spcPct val="${R(p.line * 1000)}"/></a:lnSpc>` : ''}${p.spcBef ? `<a:spcBef><a:spcPts val="${R(p.spcBef * 100)}"/></a:spcBef>` : ''}${p.spcAft ? `<a:spcAft><a:spcPts val="${R(p.spcAft * 100)}"/></a:spcAft>` : ''}${p.bullet ? `<a:buClr><a:srgbClr val="${p.bullet.color}"/></a:buClr><a:buSzPct val="80000"/><a:buFont typeface="Arial"/><a:buChar char="${esc(p.bullet.char)}"/>` : '<a:buNone/>'}</a:pPr>`;
    const last = p.runs[p.runs.length - 1] ?? { t: '', size: this.t.base, color: this.t.ink };
    return `<a:p>${ppr}${p.runs.map((r) => `<a:r>${this.rPr(r)}<a:t>${esc(r.t)}</a:t></a:r>`).join('')}<a:endParaRPr lang="fr-FR" sz="${R(last.size * 100)}" dirty="0"/></a:p>`;
  }
  /** Forme : géométrie, remplissage, contour, texte typographié (marges nulles, sans ajustement automatique). */
  sp(o: { name?: string; box: Box; geom?: string; adj?: number; fill?: string | null; alpha?: number; line?: { color: string; w: number; dash?: boolean } | null; paras?: Para[]; anchor?: 't' | 'ctr' | 'b'; inset?: number; wrap?: boolean }) {
    const b = o.box, id = this.id();
    const fill = o.fill ? `<a:solidFill><a:srgbClr val="${o.fill}">${o.alpha !== undefined ? `<a:alpha val="${R(o.alpha * 100000)}"/>` : ''}</a:srgbClr></a:solidFill>` : '<a:noFill/>';
    const ln = o.line ? `<a:ln w="${R(o.line.w * PT)}"><a:solidFill><a:srgbClr val="${o.line.color}"/></a:solidFill>${o.line.dash ? '<a:prstDash val="dash"/>' : ''}</a:ln>` : '<a:ln><a:noFill/></a:ln>';
    const ins = o.inset ?? 0;
    const tx = o.paras ? `<p:txBody><a:bodyPr wrap="${o.wrap === false ? 'none' : 'square'}" lIns="${ins}" tIns="${ins}" rIns="${ins}" bIns="${ins}" anchor="${o.anchor ?? 't'}" rtlCol="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${o.paras.map((p) => this.para(p)).join('')}</p:txBody>` : '';
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(o.name ?? `Forme ${id}`)}"/><p:cNvSpPr${o.paras ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${R(b.x)}" y="${R(b.y)}"/><a:ext cx="${Math.max(1, R(b.w))}" cy="${Math.max(1, R(b.h))}"/></a:xfrm><a:prstGeom prst="${o.geom ?? 'rect'}"><a:avLst>${o.adj !== undefined ? `<a:gd name="adj" fmla="val ${R(o.adj)}"/>` : ''}</a:avLst></a:prstGeom>${fill}${ln}</p:spPr>${tx}</p:sp>`;
  }
  text(box: Box, paras: Para[], anchor: 't' | 'ctr' | 'b' = 't', name?: string) { return this.sp({ box, paras, anchor, name }); }
  /** Filet horizontal ou vertical. */
  line(x1: number, y1: number, x2: number, y2: number, color: string, w = 0.75, dash = false) {
    const id = this.id();
    return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Filet ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="${R(Math.min(x1, x2))}" y="${R(Math.min(y1, y2))}"/><a:ext cx="${Math.max(0, R(Math.abs(x2 - x1)))}" cy="${Math.max(0, R(Math.abs(y2 - y1)))}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${R(w * PT)}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${dash ? '<a:prstDash val="sysDash"/>' : ''}</a:ln></p:spPr></p:cxnSp>`;
  }
  /** Pilule (barre aux extrémités arrondies). */
  pill(box: Box, fill: string | null, line?: { color: string; w: number } | null) { return this.sp({ box, geom: 'roundRect', adj: 50000, fill, line: line ?? null }); }
  /** Groupe nommé dont le cadre est celui de la zone (coordonnées enfants = coordonnées de la page). */
  group(name: string, box: Box, children: string, id = this.id()) {
    const b = `<a:off x="${R(box.x)}" y="${R(box.y)}"/><a:ext cx="${R(box.w)}" cy="${R(box.h)}"/>`;
    return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm>${b}<a:chOff x="${R(box.x)}" y="${R(box.y)}"/><a:chExt cx="${R(box.w)}" cy="${R(box.h)}"/></a:xfrm></p:grpSpPr>${children}</p:grpSp>`;
  }
  /** Libellé de rubrique : petites capitales espacées. */
  label(box: Box, t: string, color = this.t.muted) { return this.text(box, [{ runs: [{ t, size: typeScale(this.t).label, color, bold: true, caps: true, spc: 1 }] }], 'b'); }
}

// ───────────── Gantt et planning en tableau ─────────────

export interface GanttRow { level: 0 | 1; code: string; name: string; start: string; end: string; status: 'DONE' | 'IN_PROGRESS' | 'PLANNED'; progress: number; current: boolean; /** Sous-phases terminées regroupées sous la phase (planning en tableau). */ folded?: number;
  /** Sur le chemin critique (référentiel). */ critical?: boolean; /** Atterrissage au rythme actuel / au rythme prévu (`planLandings`). */ lc?: string | null; lp?: string | null }
export interface GanttData { today: string; rows: GanttRow[]; milestones: Array<{ code: string; label: string; iso: string; row: number }>; hidden?: number;
  /** Indicateurs du composant : chemin critique, atterrissage au rythme actuel, au rythme prévu. */ show?: { critical?: boolean; landCurrent?: boolean; landPlanned?: boolean } }

/**
 * Atterrissages d'une phase (même calcul que l'écran Planning du Cockpit, `plItems`) : au rythme actuel, aujourd'hui +
 * jours écoulés × reste à faire / réalisé (phase commencée, 0 < réalisé < 100) ; au rythme prévu, aujourd'hui + reste à
 * faire × durée prévue (phase commencée, non terminée).
 */
export function planLandings(start: string, end: string, progress: number, today: string): { lc: string | null; lp: string | null } {
  const dur = Math.max(1, days(start, end)), el = days(start, today), reel = Math.max(0, Math.min(100, progress || 0));
  const add = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * MS_DAY).toISOString().slice(0, 10);
  return {
    lc: reel > 0 && reel < 100 && el > 0 ? add(R((el * (100 - reel)) / reel)) : null,
    lp: reel < 100 && start <= today ? add(R(((100 - reel) / 100) * dur)) : null,
  };
}
/** Au-delà, le planning passe en tableau (exigence du commanditaire). */
export const GANTT_MAX_ROWS = 25;
/** Hauteur minimale d'une ligne du planning en tableau (pouces) : en dessous, la lecture n'est plus immédiate. */
export const PLAN_TABLE_MIN_ROW_IN = 0.21;
export const PLAN_TABLE_HEAD_IN = 0.34;

const pctTxt = (v: number) => `${R(v)} %`;
const MS_DAY = 86400000;
const days = (from: string, to: string) => R((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_DAY);
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « févr. 26 » */
export const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
/** « 14 oct. 2026 » */
export const longDate = (iso: string) => `${frShortDate(iso)} ${iso.slice(0, 4)}`;
/** « dans 11 jours », « dans 4 mois », « il y a 3 jours ». */
export function inTime(today: string, iso: string): string {
  const n = days(today, iso), a = Math.abs(n);
  const v = a < 60 ? `${a} jour${a > 1 ? 's' : ''}` : `${R(a / 30.4)} mois`;
  return n === 0 ? "aujourd'hui" : n > 0 ? `dans ${v}` : `il y a ${v}`;
}
/** Une ligne est en retard : non terminée et fin dépassée. */
export const isLate = (r: GanttRow, today: string) => r.status !== 'DONE' && r.end < today;

/**
 * Planning en tableau : les sous-phases des phases terminées sont regroupées sur la ligne de leur phase (« 4 sous-phases
 * terminées ») ; le détail reste pour ce qui est en cours ou à venir — l'information utile au comité.
 */
export function foldPlan(g: GanttData): GanttData {
  const rows: GanttRow[] = [];
  let folding = false;
  for (let i = 0; i < g.rows.length; i++) {
    const r = g.rows[i];
    if (r.level === 1) { if (!folding) rows.push({ ...r }); continue; }
    let n = 0;
    for (let j = i + 1; j < g.rows.length && g.rows[j].level === 1; j++) n++;
    folding = r.status === 'DONE' && n > 0;
    rows.push(folding ? { ...r, folded: n } : { ...r });
  }
  return { ...g, rows };
}

/**
 * Gantt : frise graduée, couloir des jalons, une barre par phase (avancement dans la barre ; en retard : rouge), phase
 * en cours mise en avant, repère du jour, puis un bandeau de lecture immédiate (phase en cours, prochain jalon, fin).
 */
export function drawGantt(d: Draw, a: Box, g: GanttData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [];
  const rows = g.rows, show = g.show ?? {};
  if (!rows.length) return d.text(a, [{ runs: [{ t: 'Aucune phase sur le périmètre.', size: ty.body, color: t.muted }] }]);
  // Frise étendue aux atterrissages affichés : chaque repère est à sa vraie date.
  const ends = rows.flatMap((r) => [r.end, ...(r.status !== 'DONE' && show.landCurrent && r.lc ? [r.lc] : []), ...(r.status !== 'DONE' && show.landPlanned && r.lp ? [r.lp] : [])]);
  const sc = timeScale(rows.reduce((m, r) => (r.start < m ? r.start : m), rows[0].start), ends.reduce((m, e) => (e > m ? e : m), ends[0]));
  const labelW = Math.min(a.w * 0.26, 2.8 * IN), pctW = 0.82 * IN;
  const x0 = a.x + labelW, x1 = a.x + a.w - pctW, W = x1 - x0;
  const X = (iso: string) => x0 + timeRatio(iso, sc) * W;
  const ms = g.milestones.filter((m) => m.iso >= sc.start && m.iso <= sc.end).sort((p, q) => p.iso.localeCompare(q.iso));
  const headH = 0.46 * IN, laneH = ms.length ? 0.44 * IN : 0, tagH = 0.32 * IN, legendH = 0.26 * IN;
  let stripH = 0.92 * IN;
  // Lignes d'au moins 0,24 pouce : sinon le bandeau de lecture cède sa place.
  if ((a.h - headH - laneH - tagH - legendH - stripH) / rows.length < 0.24 * IN) stripH = 0;
  const yL = a.y + headH, y0 = yL + laneH;
  const rowH = Math.min(0.46 * IN, (a.h - headH - laneH - tagH - legendH - stripH) / rows.length);
  const yOf = (i: number) => y0 + i * rowH, yEnd = y0 + rows.length * rowH;
  const doneFill = mixHex(t.ink, 'FFFFFF', 0.7);

  // Phase en cours : bandeau très clair sur toute la largeur.
  rows.forEach((r, i) => { if (r.current && r.level === 0) out.push(d.sp({ box: { x: a.x, y: yOf(i), w: a.w, h: rowH }, fill: mixHex(t.accent, 'FFFFFF', 0.93) })); });
  // Graduations : filets verticaux très fins, libellés courts, années au-dessus.
  for (const k of sc.ticks) {
    const x = X(k.iso);
    if (x > x1 + 1) continue;
    out.push(d.line(x, yL, x, yEnd, mixHex(t.hairline, 'FFFFFF', 0.3), 0.5));
    if (x < x1 - 0.2 * IN) out.push(d.text({ x: x + 0.05 * IN, y: a.y + headH * 0.5, w: 0.8 * IN, h: headH * 0.42 }, [{ runs: [{ t: k.label, size: ty.label, color: t.subtle }] }], 'b'));
    if (k.year) out.push(d.text({ x: x + 0.05 * IN, y: a.y, w: 0.9 * IN, h: headH * 0.48 }, [{ runs: [{ t: k.year, size: ty.label, color: t.ink, bold: true, spc: 0.6 }] }], 'b'));
  }
  out.push(d.line(a.x, yL, a.x + a.w, yL, t.hairline, 0.75));
  out.push(d.text({ x: x1 + 0.04 * IN, y: a.y + headH * 0.5, w: pctW - 0.06 * IN, h: headH * 0.42 }, [{ align: 'r', runs: [{ t: 'Réalisé', size: ty.label - 0.5, color: t.subtle, caps: true, spc: 0.6 }] }], 'b'));

  // Couloir des jalons : passés en gris, à venir en encre, le prochain nommé ; jalons proches regroupés.
  if (laneH) {
    out.push(d.label({ x: a.x + 0.06 * IN, y: yL, w: labelW - 0.2 * IN, h: laneH * 0.72 }, 'Jalons', t.muted));
    out.push(d.line(a.x, y0, a.x + a.w, y0, t.hairline, 0.5));
    const s = 0.13 * IN, cy = yL + laneH * 0.55;
    const next = ms.find((m) => m.iso >= g.today);
    const groups: Array<typeof ms> = [];
    for (const m of ms) { const last = groups[groups.length - 1]; if (last && X(m.iso) - X(last[last.length - 1].iso) < s * 0.5) last.push(m); else groups.push([m]); }
    for (const grp of groups) {
      const cx = X(grp[grp.length - 1].iso), isNext = !!next && grp.includes(next), past = grp.every((m) => m.iso < g.today);
      out.push(d.sp({ box: { x: cx - s / 2, y: cy - s / 2, w: s, h: s }, geom: 'diamond', fill: isNext ? t.accent2 : past ? mixHex(t.ink, 'FFFFFF', 0.72) : t.ink, line: { color: 'FFFFFF', w: 0.75 } }));
    }
  }

  // Lignes : libellé, barre (avancement dedans), pourcentage.
  rows.forEach((r, i) => {
    const y = yOf(i), sub = r.level === 1, late = isLate(r, g.today);
    const bh = Math.max(0.07 * IN, Math.min(0.17 * IN, rowH * (sub ? 0.26 : 0.38)));
    const by = y + (rowH - bh) / 2;
    const xs = X(r.start), xe = Math.max(X(r.end), xs + bh);
    const lbl: Para[] = [{ runs: [{ t: `${r.code}   `, size: ty.label, color: r.current ? t.accent : t.subtle, bold: true }, { t: r.name, size: sub ? ty.small : ty.body, color: r.current ? t.accent : r.status === 'DONE' ? t.muted : t.ink, bold: r.current || !sub }] }];
    if (r.current && rowH >= 0.4 * IN) lbl.push({ runs: [{ t: `${monthYear(r.start)} → ${monthYear(r.end)}`, size: ty.label, color: t.muted }] });
    out.push(d.text({ x: a.x + (sub ? 0.22 * IN : 0.06 * IN), y, w: labelW - 0.24 * IN, h: rowH }, lbl, 'ctr'));
    if (i > 0) out.push(d.line(a.x, y, a.x + a.w, y, mixHex(t.hairline, 'FFFFFF', 0.45), 0.5));
    if (r.status === 'DONE') out.push(d.pill({ x: xs, y: by, w: xe - xs, h: bh }, doneFill));
    else if (r.current || r.status === 'IN_PROGRESS' || r.progress > 0) {
      out.push(d.pill({ x: xs, y: by, w: xe - xs, h: bh }, late ? mixHex(t.risk, 'FFFFFF', 0.82) : t.accentSoft));
      if (r.progress > 0) out.push(d.pill({ x: xs, y: by, w: Math.max(bh, (xe - xs) * Math.min(1, r.progress / 100)), h: bh }, late ? t.risk : t.accent));
    } else out.push(d.pill({ x: xs, y: by, w: xe - xs, h: bh }, null, { color: t.subtle, w: 0.75 }));
    // Chemin critique : contour rouge détaché de la barre.
    if (show.critical && r.critical) { const o = 0.028 * IN; out.push(d.pill({ x: xs - o, y: by - o, w: xe - xs + 2 * o, h: bh + 2 * o }, null, { color: t.risk, w: 1.1 })); }
    // Atterrissages (phase non terminée) : cercle ambre (rythme actuel), losange gris (rythme prévu), filet pointillé
    // depuis la fin prévue ; écart en jours s'il dépasse la fin prévue.
    if (r.status !== 'DONE') {
      const marks = [show.landCurrent && r.lc ? { iso: r.lc, geom: 'ellipse', color: t.watch } : null, show.landPlanned && r.lp ? { iso: r.lp, geom: 'diamond', color: t.muted } : null].filter((m): m is { iso: string; geom: string; color: string } => !!m);
      const ms2 = Math.max(0.09 * IN, Math.min(0.13 * IN, bh * 0.95)), cy2 = by + bh / 2;
      let labelX = 0;
      for (const m of marks) {
        const mx = Math.min(x1 - ms2 / 2, Math.max(x0 + ms2 / 2, X(m.iso)));
        if (mx > xe + ms2) out.push(d.line(xe, cy2, mx - ms2 / 2, cy2, m.color, 0.75, true));
        out.push(d.sp({ box: { x: mx - ms2 / 2, y: cy2 - ms2 / 2, w: ms2, h: ms2 }, geom: m.geom, fill: 'FFFFFF', line: { color: m.color, w: 1.5 } }));
        labelX = Math.max(labelX, mx + ms2 / 2);
      }
      // Écart à la fin prévue, au-dessus du filet, aligné sur le repère le plus lointain.
      const slips = marks.map((m) => ({ m, n: days(r.end, m.iso) })).filter((x) => x.n > 0);
      if (slips.length && labelX) {
        const lw2 = 1.2 * IN, lh2 = ty.label * 1.3 * PT;
        out.push(d.text({ x: Math.max(xe, labelX - lw2), y: by - lh2 - 0.015 * IN, w: Math.min(lw2, labelX - xe), h: lh2 }, [{ align: 'r', runs: slips.flatMap((x, k) => [...(k ? [{ t: '  ·  ', size: ty.label - 0.5, color: t.subtle }] : []), { t: `+${x.n} j`, size: ty.label - 0.5, color: x.m.color, bold: true }]) }], 'b'));
      }
    }
    const pc = r.status === 'PLANNED' && !r.progress ? '—' : pctTxt(r.progress);
    out.push(d.text({ x: x1 + 0.08 * IN, y, w: pctW - 0.1 * IN, h: rowH }, [{ align: 'r', runs: [{ t: pc, size: r.current ? ty.body : ty.small, color: late ? t.risk : r.current ? t.accent : t.subtle, bold: r.current || late }] }], 'ctr'));
  });
  out.push(d.line(a.x, yEnd, a.x + a.w, yEnd, t.hairline, 0.75));

  // Repère du jour : filet de couleur sur toute la frise, étiquette sous la dernière ligne.
  const xt = X(g.today);
  if (g.today >= sc.start && g.today <= sc.end) {
    out.push(d.line(xt, yL, xt, yEnd + 0.06 * IN, t.accent2, 1.25));
    const lw = 1.3 * IN, lh = 0.22 * IN;
    out.push(d.sp({ box: { x: Math.min(Math.max(xt - lw / 2, x0), x1 - lw), y: yEnd + 0.06 * IN, w: lw, h: lh }, geom: 'roundRect', adj: 50000, fill: t.accent2, paras: [{ align: 'ctr', runs: [{ t: `Aujourd'hui · ${frShortDate(g.today)}`, size: ty.label, color: contrastText(t.accent2), bold: true }] }], anchor: 'ctr' }));
  }

  // Bandeau de lecture immédiate : phase en cours, prochain jalon, fin du planning.
  if (stripH) {
    const sy = yEnd + tagH + 0.12 * IN, cw = a.w / 3;
    const cur = rows.find((r) => r.current && r.level === 0) ?? rows.find((r) => r.status === 'IN_PROGRESS');
    const next = ms.find((m) => m.iso >= g.today) ?? g.milestones.find((m) => m.iso >= g.today);
    const endIso = rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0].end);
    const elapsed = cur ? Math.max(0, Math.min(100, R((100 * days(cur.start, g.today)) / Math.max(1, days(cur.start, cur.end))))) : 0;
    const done = rows.filter((r) => r.level === 0 && r.status === 'DONE').length, phases = rows.filter((r) => r.level === 0).length;
    const small = (x: string, color = t.muted, bold = false): Run => ({ t: x, size: ty.small, color, bold });
    const cells: Array<{ label: string; value: string; color: string; after?: Run; sub: Run[] }> = [
      cur ? { label: 'Phase en cours', value: cur.name, color: isLate(cur, g.today) ? t.risk : t.accent, after: small(`   jusqu'au ${longDate(cur.end)}`), sub: [small(`${pctTxt(cur.progress)} réalisé`, isLate(cur, g.today) || cur.progress + 10 < elapsed ? t.risk : t.ink, true), small(`  ·  ${elapsed} % du temps écoulé`)] }
          : { label: 'Phase en cours', value: '—', color: t.subtle, sub: [] },
      next ? { label: 'Prochain jalon', value: longDate(next.iso), color: t.ink, after: small(`   ${inTime(g.today, next.iso)}`, t.accent2, true), sub: [small(`${next.code}  `, t.ink, true), small(next.label)] }
           : { label: 'Prochain jalon', value: '—', color: t.subtle, sub: [small('aucun jalon à venir')] },
      { label: 'Fin du planning', value: longDate(endIso), color: t.ink, after: small(`   ${inTime(g.today, endIso)}`), sub: [small(`${done} phase${done > 1 ? 's' : ''} sur ${phases} terminée${done > 1 ? 's' : ''}`)] },
    ];
    cells.forEach((c, i) => {
      const cx = a.x + i * cw, pad = i ? 0.22 * IN : 0;
      out.push(d.sp({ box: { x: cx + pad, y: sy, w: 0.3 * IN, h: 0.028 * IN }, fill: i === 0 ? t.accent : t.ink }));
      if (i) out.push(d.line(cx, sy + 0.06 * IN, cx, sy + stripH - 0.1 * IN, t.hairline, 0.75));
      out.push(d.label({ x: cx + pad, y: sy + 0.06 * IN, w: cw - pad - 0.1 * IN, h: 0.2 * IN }, c.label));
      out.push(d.text({ x: cx + pad, y: sy + 0.28 * IN, w: cw - pad - 0.12 * IN, h: (ty.lead + 3) * 1.4 * PT }, [{ runs: [{ t: c.value, size: ty.lead + 3, color: c.color, bold: true, font: t.head }, ...(c.after ? [c.after] : [])] }], 't'));
      if (c.sub.length) out.push(d.text({ x: cx + pad, y: sy + 0.28 * IN + (ty.lead + 3) * 1.45 * PT, w: cw - pad - 0.12 * IN, h: 0.24 * IN }, [{ runs: c.sub }], 't'));
    });
  }

  // Légende discrète, en bas à droite.
  const ly = a.y + a.h - legendH, lh = legendH;
  const items: Array<{ w: number; draw: (x: number) => string; txt: string }> = [];
  const sw = 0.22 * IN, sh = 0.08 * IN, sy2 = ly + (lh - sh) / 2;
  items.push({ txt: 'Terminé', w: 0.66 * IN, draw: (x) => d.pill({ x, y: sy2, w: sw, h: sh }, doneFill) });
  items.push({ txt: 'Avancement', w: 0.95 * IN, draw: (x) => d.pill({ x, y: sy2, w: sw, h: sh }, t.accent) });
  items.push({ txt: 'Prochain jalon', w: 1.05 * IN, draw: (x) => d.sp({ box: { x: x + 0.06 * IN, y: ly + lh / 2 - 0.045 * IN, w: 0.09 * IN, h: 0.09 * IN }, geom: 'diamond', fill: t.accent2 }) });
  items.push({ txt: 'En retard', w: 0.74 * IN, draw: (x) => d.pill({ x, y: sy2, w: sw, h: sh }, t.risk) });
  items.push({ txt: 'À venir', w: 0.6 * IN, draw: (x) => d.pill({ x, y: sy2, w: sw, h: sh }, null, { color: t.subtle, w: 0.75 }) });
  if (laneH) items.push({ txt: 'Jalon', w: 0.46 * IN, draw: (x) => d.sp({ box: { x: x + 0.06 * IN, y: ly + lh / 2 - 0.045 * IN, w: 0.09 * IN, h: 0.09 * IN }, geom: 'diamond', fill: t.ink }) });
  if (show.critical) items.push({ txt: 'Chemin critique', w: 1.08 * IN, draw: (x) => d.pill({ x, y: sy2 - 0.02 * IN, w: sw, h: sh + 0.04 * IN }, null, { color: t.risk, w: 1.1 }) });
  if (show.landCurrent) items.push({ txt: 'Atterr. rythme actuel', w: 1.42 * IN, draw: (x) => d.sp({ box: { x: x + 0.055 * IN, y: ly + lh / 2 - 0.05 * IN, w: 0.1 * IN, h: 0.1 * IN }, geom: 'ellipse', fill: 'FFFFFF', line: { color: t.watch, w: 1.5 } }) });
  if (show.landPlanned) items.push({ txt: 'Atterr. rythme prévu', w: 1.38 * IN, draw: (x) => d.sp({ box: { x: x + 0.055 * IN, y: ly + lh / 2 - 0.05 * IN, w: 0.1 * IN, h: 0.1 * IN }, geom: 'diamond', fill: 'FFFFFF', line: { color: t.muted, w: 1.5 } }) });
  // Place insuffisante : les entrées qui se lisent d'elles-mêmes cèdent d'abord (« Terminé », puis « À venir »).
  const room = a.w - (g.hidden ? 2.5 * IN : 0), width = () => items.reduce((s, it) => s + 0.28 * IN + it.w + 0.14 * IN, 0);
  for (const drop of ['Terminé', 'À venir']) if (width() > room) items.splice(items.findIndex((it) => it.txt === drop), 1);
  const total = width();
  let lx = a.x + a.w - total;
  for (const it of items) { out.push(it.draw(lx)); out.push(d.text({ x: lx + 0.28 * IN, y: ly, w: it.w, h: lh }, [{ runs: [{ t: it.txt, size: ty.label, color: t.muted }] }], 'ctr')); lx += 0.28 * IN + it.w + 0.14 * IN; }
  if (g.hidden) out.push(d.text({ x: a.x, y: ly, w: 2.5 * IN, h: lh }, [{ runs: [{ t: `… et ${g.hidden} autres lignes`, size: ty.label, color: t.subtle, italic: true }] }], 'ctr'));
  return out.join('');
}

/**
 * Planning en tableau (plus de 25 lignes) : phases en lignes de tête, sous-phases en retrait, période, barre
 * d'avancement fine, statut en pastille (en retard : rouge) ; la phase en cours est teintée de l'accent.
 */
export function drawPlanTable(d: Draw, a: Box, g: GanttData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [], show = g.show ?? {};
  const land = !!(show.landCurrent || show.landPlanned);
  const cols = (land ? [0.35, 0.16, 0.21, 0.12, 0.16] : [0.42, 0.19, 0.25, 0.14]).map((f) => f * a.w);
  const xs = cols.reduce<number[]>((acc, _w, i) => [...acc, i ? acc[i - 1] + cols[i - 1] : a.x], []);
  const headH = PLAN_TABLE_HEAD_IN * IN;
  const rowH = Math.max(PLAN_TABLE_MIN_ROW_IN * IN, Math.min(0.36 * IN, (a.h - headH - (g.hidden ? 0.26 * IN : 0)) / Math.max(1, g.rows.length)));
  const head = ['Phase · sous-phase', 'Période', 'Avancement', 'Statut', ...(land ? ['Atterrissage'] : [])];
  head.forEach((h, i) => out.push(d.text({ x: xs[i] + (i ? 0.1 : 0.06) * IN, y: a.y, w: cols[i] - 0.16 * IN, h: headH - 0.08 * IN }, [{ runs: [{ t: h, size: ty.label, color: t.muted, bold: true, caps: true, spc: 0.8 }] }], 'b')));
  out.push(d.line(a.x, a.y + headH, a.x + a.w, a.y + headH, t.ink, 1));
  g.rows.forEach((r, i) => {
    const y = a.y + headH + i * rowH, sub = r.level === 1, late = isLate(r, g.today);
    if (r.current && !sub) out.push(d.sp({ box: { x: a.x, y, w: a.w, h: rowH }, fill: mixHex(t.accent, 'FFFFFF', 0.92) }));
    if (!sub && r.current) out.push(d.sp({ box: { x: a.x, y, w: 0.035 * IN, h: rowH }, fill: t.accent }));
    // Nom sur une ligne, abrégé pour laisser la place aux mentions (sous-phases regroupées, « critique »).
    const tags = (r.folded ? `   ${r.folded} sous-phases terminées`.length * ty.label * 0.6 * PT : 0) + (show.critical && r.critical ? 0.95 * IN : 0);
    const nameW = Math.max(0.8 * IN, cols[0] - (sub ? 0.42 : 0.16) * IN - (r.code.length + 3) * ty.label * 0.6 * PT - tags);
    const runs: Run[] = [{ t: `${r.code}   `, size: ty.label, color: r.current ? t.accent : t.subtle, bold: true }, { t: wrapText(r.name, nameW * 1.12, sub ? ty.small : ty.body, 1)[0], size: sub ? ty.small : ty.body, color: r.current ? t.accent : sub ? t.ink : r.status === 'DONE' ? t.muted : t.ink, bold: !sub }];
    if (r.folded) runs.push({ t: `   ${r.folded} sous-phase${r.folded > 1 ? 's' : ''} terminée${r.folded > 1 ? 's' : ''}`, size: ty.label, color: t.subtle });
    if (show.critical && r.critical) runs.push({ t: '   critique', size: ty.label, color: t.risk, bold: true, caps: true, spc: 0.6 });
    out.push(d.text({ x: xs[0] + (sub ? 0.36 : 0.1) * IN, y, w: cols[0] - 0.42 * IN, h: rowH }, [{ runs }], 'ctr'));
    out.push(d.text({ x: xs[1] + 0.1 * IN, y, w: cols[1] - 0.12 * IN, h: rowH }, [{ runs: [{ t: monthYear(r.start), size: ty.small, color: t.muted }, { t: '  →  ', size: ty.label, color: t.subtle }, { t: monthYear(r.end), size: ty.small, color: late ? t.risk : t.muted, bold: late }] }], 'ctr'));
    const bw = cols[2] * 0.6, bh = Math.max(0.05 * IN, Math.min(0.08 * IN, rowH * 0.24)), bx = xs[2] + 0.1 * IN, by = y + (rowH - bh) / 2;
    out.push(d.pill({ x: bx, y: by, w: bw, h: bh }, mixHex(t.hairline, 'FFFFFF', 0.2)));
    const fc = late ? t.risk : r.status === 'DONE' ? mixHex(t.ink, 'FFFFFF', 0.62) : t.accent;
    if (r.progress > 0) out.push(d.pill({ x: bx, y: by, w: Math.max(bh, bw * Math.min(1, r.progress / 100)), h: bh }, fc));
    out.push(d.text({ x: bx + bw + 0.06 * IN, y, w: cols[2] - bw - 0.24 * IN, h: rowH }, [{ align: 'r', runs: [{ t: r.status === 'PLANNED' && !r.progress ? '—' : pctTxt(r.progress), size: ty.small, color: late ? t.risk : r.current ? t.accent : r.status === 'DONE' ? t.subtle : t.ink, bold: r.current || late }] }], 'ctr'));
    const st = late ? 'En retard' : r.status === 'DONE' ? 'Terminé' : r.status === 'IN_PROGRESS' ? 'En cours' : 'À venir';
    const dot = late ? t.risk : r.status === 'DONE' ? t.ok : r.status === 'IN_PROGRESS' ? t.accent : mixHex(t.ink, 'FFFFFF', 0.75);
    out.push(d.text({ x: xs[3] + 0.1 * IN, y, w: cols[3] - 0.1 * IN, h: rowH }, [{ runs: [{ t: '●  ', size: ty.label, color: dot }, { t: st, size: ty.small, color: late ? t.risk : r.status === 'DONE' ? t.muted : t.ink, bold: late }] }], 'ctr'));
    if (land) {
      // Atterrissage : rythme actuel (ambre s'il dépasse la fin prévue), puis rythme prévu.
      const lruns: Run[] = [];
      if (show.landCurrent && r.lc && r.status !== 'DONE') lruns.push({ t: monthYear(r.lc), size: ty.small, color: r.lc > r.end ? t.watch : t.ink, bold: r.lc > r.end });
      if (show.landPlanned && r.lp && r.status !== 'DONE') lruns.push({ t: `${lruns.length ? '  ·  ' : ''}${show.landCurrent ? 'prévu ' : ''}${monthYear(r.lp)}`, size: ty.label, color: t.muted });
      out.push(d.text({ x: xs[4] + 0.1 * IN, y, w: cols[4] - 0.12 * IN, h: rowH }, [{ runs: lruns.length ? lruns : [{ t: '—', size: ty.small, color: t.subtle }] }], 'ctr'));
    }
    const nextIsPhase = !g.rows[i + 1] || g.rows[i + 1].level === 0;
    out.push(d.line(a.x, y + rowH, a.x + a.w, y + rowH, nextIsPhase ? t.hairline : mixHex(t.hairline, 'FFFFFF', 0.5), nextIsPhase ? 0.75 : 0.5));
  });
  if (g.hidden) out.push(d.text({ x: a.x, y: a.y + headH + g.rows.length * rowH + 0.04 * IN, w: a.w, h: 0.22 * IN }, [{ runs: [{ t: `… et ${g.hidden} autres lignes`, size: ty.label, color: t.subtle, italic: true }] }], 'ctr'));
  return out.join('');
}

// ───────────── Baromètre ─────────────

export interface BarometerData {
  month: string; score: number | null; prevScore: number | null; prevMonth: string | null; respondents: number | null; population: number | null;
  sentiment: { positive: number; neutral: number; negative: number } | null; prevPositive: number | null;
  domains: Array<{ name: string; score: number | null; prev: number | null; resp: number }>;
  themes: Array<{ label: string; tone: 'OK' | 'WATCH' | 'RISK' }>;
  questions: Array<{ label: string; score: number; delta: number | null }>;
  show: { score: boolean; sentiment: boolean; domains: boolean; themes: boolean };
}
/** Disposition du tableau de bord : rectangles de chaque bloc (le graphique de tendance est un graphique natif). */
export function barometerLayout(a: Box, show: BarometerData['show']) {
  const g = Math.min(0.28 * IN, a.w * 0.025), topH = show.score || show.sentiment ? a.h * 0.44 : 0;
  const heroW = show.score ? a.w * 0.22 : 0, sentW = show.sentiment ? a.w * 0.3 : 0;
  const chartW = show.score ? a.w - heroW - sentW - g * (show.sentiment ? 2 : 1) : 0;
  const hero = { x: a.x, y: a.y, w: heroW, h: topH };
  const chart = { x: a.x + heroW + g, y: a.y + 0.3 * IN, w: chartW, h: topH - 0.3 * IN };
  const chartLabel = { x: chart.x, y: a.y, w: chartW, h: 0.24 * IN };
  const sent = { x: a.x + a.w - sentW, y: a.y, w: sentW, h: topH };
  const by = a.y + topH + (topH ? g * 1.4 : 0), bh = a.y + a.h - by;
  const both = show.domains && show.themes;
  const dom = { x: a.x, y: by, w: both ? a.w * 0.52 - g / 2 : a.w, h: bh };
  const th = { x: both ? a.x + a.w * 0.52 + g / 2 : a.x, y: by, w: both ? a.w * 0.48 - g / 2 : a.w, h: bh };
  return { hero, chart, chartLabel, sent, dom, th, topH, separator: by - g * 0.7 };
}

/** Tableau de bord du baromètre : score et évolution, avis des répondants, scores par domaine, points clés. */
export function drawBarometer(d: Draw, a: Box, b: BarometerData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [], L = barometerLayout(a, b.show);
  const delta = (v: number | null, unit = '', dec = 1) => (v === null || v === undefined ? null : { t: v === 0 ? '= stable' : `${v > 0 ? '▲ +' : '▼ '}${dec ? v.toFixed(dec).replace('.', ',') : frNum(v, 0)}${unit}`, color: v > 0 ? t.ok : v < 0 ? t.risk : t.muted });
  if (b.show.score) {
    out.push(d.label({ x: L.hero.x, y: L.hero.y, w: L.hero.w, h: 0.24 * IN }, `Score global · ${b.month}`));
    out.push(d.text({ x: L.hero.x, y: L.hero.y + 0.3 * IN, w: L.hero.w, h: ty.hero * PT * 1.25 }, [{ runs: [{ t: b.score === null ? '—' : frNum(b.score), size: ty.hero, color: t.ink, bold: true, font: t.head }, { t: ' /10', size: ty.lead, color: t.subtle }] }], 'b'));
    const dl = b.prevScore !== null && b.score !== null ? delta(b.score - b.prevScore) : null;
    const lines: Para[] = [];
    if (dl) lines.push({ spcAft: 3, runs: [{ t: dl.t, size: ty.small, color: dl.color, bold: true }, { t: `  depuis ${b.prevMonth}`, size: ty.small, color: t.muted }] });
    if (b.respondents !== null) lines.push({ runs: [{ t: `${b.respondents}`, size: ty.small, color: t.ink, bold: true }, { t: b.population ? ` répondants sur ${b.population}` : ' répondants', size: ty.small, color: t.muted }] });
    out.push(d.text({ x: L.hero.x, y: L.hero.y + 0.3 * IN + ty.hero * PT * 1.3, w: L.hero.w, h: L.hero.h - 0.3 * IN - ty.hero * PT * 1.3 }, lines));
    out.push(d.label(L.chartLabel, 'Évolution du score'));
  }
  if (b.show.sentiment && b.sentiment) {
    const s = b.sentiment, S = L.sent;
    out.push(d.label({ x: S.x, y: S.y, w: S.w, h: 0.24 * IN }, 'Avis des répondants'));
    const big = s.positive;
    out.push(d.text({ x: S.x, y: S.y + 0.3 * IN, w: S.w, h: ty.stat * PT * 1.3 }, [{ runs: [{ t: `${R(big)} %`, size: ty.stat, color: t.ok, bold: true, font: t.head }, { t: '  d’avis positifs', size: ty.small, color: t.muted }] }], 'b'));
    const by = S.y + 0.3 * IN + ty.stat * PT * 1.45, bh = 0.13 * IN, tot = Math.max(1, s.positive + s.neutral + s.negative);
    let x = S.x;
    for (const [v, c] of [[s.positive, t.ok], [s.neutral, mixHex(t.ink, 'FFFFFF', 0.8)], [s.negative, t.risk]] as Array<[number, string]>) {
      const w = (S.w * v) / tot;
      if (w > 0) out.push(d.sp({ box: { x, y: by, w: Math.max(1, w - 0.02 * IN), h: bh }, fill: c }));
      x += w;
    }
    const legend: Run[] = [{ t: `${R(s.positive)} % positifs`, size: ty.label, color: t.ink, bold: true }, { t: `   ${R(s.neutral)} % neutres   `, size: ty.label, color: t.muted }, { t: `${R(s.negative)} % négatifs`, size: ty.label, color: t.risk, bold: true }];
    const ds = b.prevPositive !== null ? delta(s.positive - b.prevPositive, ' pt', 0) : null;
    out.push(d.text({ x: S.x, y: by + bh + 0.08 * IN, w: S.w, h: 0.5 * IN }, [{ spcAft: 3, runs: legend }, ...(ds ? [{ runs: [{ t: ds.t, size: ty.label, color: ds.color, bold: true }, { t: `  avis positifs depuis ${b.prevMonth}`, size: ty.label, color: t.muted }] }] : [])]));
  }
  if (L.topH && (b.show.domains || b.show.themes)) out.push(d.line(a.x, L.separator, a.x + a.w, L.separator, t.hairline, 0.75));
  if (b.show.domains) {
    const D = L.dom, rows = b.domains.filter((x) => x.score !== null).sort((p, q) => (q.score ?? 0) - (p.score ?? 0));
    out.push(d.label({ x: D.x, y: D.y, w: D.w, h: 0.24 * IN }, 'Score par domaine'));
    const top = D.y + 0.32 * IN, rh = Math.min(0.3 * IN, (D.h - 0.32 * IN) / Math.max(1, rows.length));
    const nameW = D.w * 0.3, valW = 0.42 * IN, dW = 0.6 * IN, bw = D.w - nameW - valW - dW - 0.2 * IN;
    rows.forEach((r, i) => {
      const y = top + i * rh, bh = Math.max(0.05 * IN, rh * 0.26), by = y + (rh - bh) / 2;
      const c = (r.score ?? 0) < 4 ? t.risk : (r.score ?? 0) < 5 ? t.watch : t.accent;
      out.push(d.text({ x: D.x, y, w: nameW - 0.08 * IN, h: rh }, [{ runs: [{ t: r.name, size: ty.small, color: t.ink }] }], 'ctr'));
      out.push(d.pill({ x: D.x + nameW, y: by, w: bw, h: bh }, t.hairline));
      out.push(d.pill({ x: D.x + nameW, y: by, w: Math.max(bh, (bw * (r.score ?? 0)) / 10), h: bh }, c));
      out.push(d.text({ x: D.x + nameW + bw + 0.06 * IN, y, w: valW, h: rh }, [{ align: 'r', runs: [{ t: (r.score ?? 0).toFixed(1).replace('.', ','), size: ty.small, color: t.ink, bold: true }] }], 'ctr'));
      const dl = r.prev !== null ? delta((r.score ?? 0) - r.prev) : null;
      if (dl) out.push(d.text({ x: D.x + D.w - dW, y, w: dW, h: rh }, [{ align: 'r', runs: [{ t: dl.t, size: ty.label, color: dl.color, bold: true }] }], 'ctr'));
    });
  }
  if (b.show.themes) {
    const T = L.th, order = { RISK: 0, WATCH: 1, OK: 2 } as const;
    out.push(d.label({ x: T.x, y: T.y, w: T.w, h: 0.24 * IN }, 'Points clés'));
    const paras: Para[] = [...b.themes].sort((p, q) => order[p.tone] - order[q.tone]).slice(0, 5).map((x) => ({ spcAft: 5, line: 105, bullet: { char: '●', color: x.tone === 'RISK' ? t.risk : x.tone === 'WATCH' ? t.watch : t.ok, size: ty.small }, runs: [{ t: x.label, size: ty.small, color: t.ink }] }));
    for (const q of b.questions.slice(0, 2)) {
      const dl = delta(q.delta);
      paras.push({ spcBef: 4, spcAft: 3, runs: [{ t: `${q.score.toFixed(1).replace('.', ',')}/10  `, size: ty.small, color: t.accent, bold: true }, ...(dl ? [{ t: `${dl.t}   `, size: ty.label, color: dl.color, bold: true }] : []), { t: q.label, size: ty.small, color: t.muted }] });
    }
    out.push(d.text({ x: T.x, y: T.y + 0.32 * IN, w: T.w, h: T.h - 0.32 * IN }, paras.length ? paras : [{ runs: [{ t: 'Aucun point clé renseigné.', size: ty.small, color: t.subtle }] }]));
  }
  return out.join('');
}

// ───────────── Texte : coupe en lignes (largeur estimée) ─────────────

/** Largeur moyenne d'un caractère (fraction du corps) : estimation prudente pour les polices larges. */
const CHAR_EM = 0.6;
/** Coupe un texte en `max` lignes au plus pour une largeur donnée (EMU) ; la dernière se termine par « … » si besoin. */
export function wrapText(text: string, width: number, size: number, max: number): string[] {
  const per = Math.max(6, Math.floor(width / (size * CHAR_EM * PT)));
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let cur = '';
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length <= per) { cur = cand; continue; }
    if (cur) lines.push(cur); else { lines.push(w.slice(0, per)); cur = ''; continue; }
    cur = w;
    if (lines.length === max) { cur = ''; break; }
  }
  if (cur && lines.length < max) lines.push(cur);
  const used = lines.join(' ').length;
  if (used < text.replace(/\s+/g, ' ').trim().length) {
    const last = lines[max - 1] ?? lines[lines.length - 1] ?? '';
    lines[Math.min(max, lines.length) - 1] = (last.length + 1 > per ? last.slice(0, per - 1).trimEnd() : last.trimEnd()).replace(/[\s,;:.—-]+$/, '') + '…';
  }
  return lines.slice(0, max);
}

// ───────────── Jalons : frise ─────────────

export interface MilestoneRow { code: string; name: string; iso: string; baseline: string | null; phase: string | null }
export interface MilestonesData { today: string; rows: MilestoneRow[]; show: Record<string, boolean> }
/** Jalons par ligne de frise, et lignes au plus : au-delà, fenêtre centrée sur le prochain jalon. */
export const MILESTONES_PER_ROW = 6;
export const MILESTONES_MAX = 12;

/**
 * État d'un jalon (le référentiel ne dit pas si un jalon est « atteint ») : franchi (date passée), prochain (première
 * date à venir), glissé (date à venir postérieure à la référence), à venir.
 */
type MsState = 'done' | 'late' | 'next' | 'todo';
const slipOf = (m: MilestoneRow) => (m.baseline ? R((Date.parse(`${m.iso}T00:00:00Z`) - Date.parse(`${m.baseline}T00:00:00Z`)) / 86400000) : 0);
export function milestoneStates(rows: MilestoneRow[], today: string): MsState[] {
  const nextIdx = rows.findIndex((m) => m.iso >= today);
  return rows.map((m, i) => (m.iso < today ? 'done' : i === nextIdx ? 'next' : slipOf(m) > 0 ? 'late' : 'todo'));
}

/**
 * Frise des jalons : un cercle par jalon (franchi : plein, couleur d'accent ; prochain : plein, encre ; glissé :
 * contour rouge ; à venir : contour d'accent), filet de liaison coloré jusqu'au dernier jalon franchi, nom, date,
 * écart à la référence ; puis quatre indicateurs sur cartes sombres (franchis, glissés, prochain, glissement moyen).
 */
export function drawMilestones(d: Draw, a: Box, m: MilestonesData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [];
  if (!m.rows.length) return d.text(a, [{ runs: [{ t: 'Aucun jalon sur la période.', size: ty.body, color: t.muted }] }]);
  const all = m.rows, states = milestoneStates(all, m.today);
  // Fenêtre : le prochain jalon et ce qui l'entoure (deux jalons passés au plus avant lui).
  const nextIdx = Math.max(0, states.indexOf('next') >= 0 ? states.indexOf('next') : all.length);
  const from = all.length <= MILESTONES_MAX ? 0 : Math.max(0, Math.min(nextIdx - 2, all.length - MILESTONES_MAX));
  const rows = all.slice(from, from + MILESTONES_MAX), st = states.slice(from, from + MILESTONES_MAX);
  const before = from, after = all.length - from - rows.length;
  const perRow = Math.min(MILESTONES_PER_ROW, rows.length > MILESTONES_PER_ROW ? Math.ceil(rows.length / 2) : rows.length);
  const lines = Math.ceil(rows.length / perRow);
  const cardsH = m.show.kpis !== false ? 1.18 * IN : 0, noteH = before || after ? 0.26 * IN : 0;
  const showCards = cardsH > 0 && a.h - cardsH - noteH - 0.3 * IN >= lines * 1.75 * IN;
  const avail = a.h - (showCards ? cardsH + 0.3 * IN : 0) - noteH;
  const rowH = Math.min(2.1 * IN, avail / lines);
  // Frise centrée verticalement dans la place laissée par les indicateurs.
  const cw = a.w / perRow, cs = Math.min(0.46 * IN, rowH * 0.24), top0 = a.y + Math.max(0.22 * IN, (avail - lines * rowH) / 2 + 0.22 * IN);
  const center = (k: number) => ({ x: a.x + (k % perRow) * cw + cs / 2, y: top0 + Math.floor(k / perRow) * rowH + cs / 2 });
  // Filets de liaison (entre deux jalons de la même ligne).
  for (let k = 0; k < rows.length - 1; k++) {
    if (Math.floor(k / perRow) !== Math.floor((k + 1) / perRow)) continue;
    const p = center(k), q = center(k + 1);
    const done = st[k] === 'done' && st[k + 1] === 'done';
    out.push(d.line(p.x + cs / 2 + 0.06 * IN, p.y, q.x - cs / 2 - 0.06 * IN, q.y, done ? t.accent : t.hairline, done ? 1.5 : 0.75));
  }
  const days = (x: string, y: string) => R((Date.parse(`${y}T00:00:00Z`) - Date.parse(`${x}T00:00:00Z`)) / 86400000);
  rows.forEach((r, k) => {
    const c = center(k), s = st[k], x = c.x - cs / 2, tw = cw - 0.28 * IN;
    const fill = s === 'done' ? t.accent : s === 'next' ? t.ink : 'FFFFFF';
    const ring = s === 'late' ? t.risk : s === 'todo' ? t.accent : fill;
    const numColor = s === 'done' || s === 'next' ? 'FFFFFF' : s === 'late' ? t.risk : t.accent;
    out.push(d.sp({ box: { x, y: c.y - cs / 2, w: cs, h: cs }, geom: 'ellipse', fill, line: { color: ring, w: 1.5 }, anchor: 'ctr', paras: [{ align: 'ctr', runs: [{ t: r.code.length <= 4 ? r.code : String(from + k + 1), size: r.code.length > 3 ? ty.label - 0.5 : ty.label + 0.5, color: numColor, bold: true }] }] }));
    // Mention d'état au-dessus du cercle : prochain, en retard.
    if (s === 'next' || s === 'late') out.push(d.text({ x, y: c.y - cs / 2 - 0.22 * IN, w: tw, h: 0.18 * IN }, [{ runs: [{ t: s === 'next' ? 'Prochain' : 'Glissé', size: ty.label - 0.5, color: s === 'next' ? t.accent2 : t.risk, bold: true, caps: true, spc: 1 }] }], 'b'));
    let y = c.y + cs / 2 + 0.14 * IN;
    const nameSize = ty.body + 1, nl = wrapText(r.name, tw, nameSize, 3);
    out.push(d.text({ x, y, w: tw, h: nl.length * nameSize * 1.3 * PT }, nl.map((l) => ({ line: 100, runs: [{ t: l, size: nameSize, color: s === 'done' ? t.muted : t.ink, bold: s === 'next' }] }))));
    y += nl.length * nameSize * 1.3 * PT + 0.06 * IN;
    const dateRuns: Run[] = [{ t: longDate(r.iso), size: ty.small, color: s === 'late' ? t.risk : s === 'done' ? t.muted : t.ink, bold: true }];
    if (s === 'next') dateRuns.push({ t: `  ·  ${inTime(m.today, r.iso)}`, size: ty.small, color: t.accent2, bold: true });
    out.push(d.text({ x, y, w: tw, h: ty.small * 1.4 * PT }, [{ runs: dateRuns }]));
    y += ty.small * 1.45 * PT;
    // Référence affichée seulement quand la date a bougé : « à l'heure » partout n'apporte rien.
    if (m.show.baseline !== false && r.baseline && days(r.baseline, r.iso) !== 0) {
      const slip = days(r.baseline, r.iso);
      const runs: Run[] = [{ t: `Réf. ${frShortDate(r.baseline)}`, size: ty.label, color: t.muted }];
      if (m.show.slip !== false) runs.push({ t: slip === 0 ? '  ·  à l’heure' : `  ·  ${slip > 0 ? '+' : ''}${slip} j`, size: ty.label, color: slip > 0 ? t.risk : slip < 0 ? t.ok : t.muted, bold: slip !== 0 });
      out.push(d.text({ x, y, w: tw, h: ty.label * 1.4 * PT }, [{ runs }]));
      y += ty.label * 1.45 * PT;
    }
    if (m.show.phase && r.phase) out.push(d.text({ x, y, w: tw, h: ty.label * 1.4 * PT }, [{ runs: [{ t: r.phase, size: ty.label, color: t.subtle }] }]));
  });
  if (noteH) {
    const parts = [before ? `${before} jalon${before > 1 ? 's' : ''} antérieur${before > 1 ? 's' : ''}` : '', after ? `${after} jalon${after > 1 ? 's' : ''} ultérieur${after > 1 ? 's' : ''}` : ''].filter(Boolean);
    out.push(d.text({ x: a.x, y: top0 + lines * rowH - 0.1 * IN, w: a.w, h: noteH }, [{ runs: [{ t: `Non affichés : ${parts.join(' · ')}`, size: ty.label, color: t.subtle, italic: true }] }], 'ctr'));
  }
  // Indicateurs sur cartes sombres.
  if (showCards) {
    const y = a.y + a.h - cardsH, gap = 0.16 * IN, w = (a.w - 3 * gap) / 4;
    const done = all.filter((x, i) => states[i] === 'done').length, late = all.filter((x) => x.iso >= m.today && slipOf(x) > 0).length;
    const next = all[states.indexOf('next')];
    const slips = all.filter((x) => x.baseline).map((x) => days(x.baseline!, x.iso));
    const avg = slips.length ? R(slips.reduce((p, q) => p + q, 0) / slips.length) : null;
    const lite = (c: string) => mixHex(c, 'FFFFFF', 0.25);
    const cards = [
      { label: 'Jalons franchis', value: `${done} / ${all.length}`, color: 'FFFFFF', sub: 'sur la période' },
      { label: 'Jalons glissés', value: String(late), color: late ? lite(t.risk) : 'FFFFFF', sub: late ? 'à venir, après leur référence' : 'aucun glissement à venir' },
      { label: 'Prochain jalon', value: next ? inTime(m.today, next.iso).replace(/^dans /, '') : '—', color: 'FFFFFF', sub: next ? `${next.code} · ${longDate(next.iso)}` : 'aucun jalon à venir' },
      { label: 'Glissement moyen', value: avg === null ? '—' : avg === 0 ? '0 j' : `${avg > 0 ? '+' : ''}${avg} j`, color: avg && avg > 0 ? lite(t.risk) : 'FFFFFF', sub: 'par rapport à la référence' },
    ];
    cards.forEach((c, i) => {
      const x = a.x + i * (w + gap), pad = 0.2 * IN;
      out.push(d.sp({ box: { x, y, w, h: cardsH }, fill: t.ink }));
      out.push(d.text({ x: x + pad, y: y + 0.16 * IN, w: w - 2 * pad, h: 0.2 * IN }, [{ runs: [{ t: c.label, size: ty.label, color: mixHex(t.accent, 'FFFFFF', 0.3), bold: true, caps: true, spc: 1.2 }] }]));
      out.push(d.text({ x: x + pad, y: y + 0.38 * IN, w: w - 2 * pad, h: ty.stat * 0.75 * 1.3 * PT }, [{ runs: [{ t: c.value, size: ty.stat * 0.75, color: c.color, bold: true, font: t.head }] }]));
      out.push(d.text({ x: x + pad, y: y + cardsH - 0.34 * IN, w: w - 2 * pad, h: 0.22 * IN }, [{ runs: [{ t: c.sub, size: ty.label, color: mixHex(t.ink, 'FFFFFF', 0.6) }] }]));
    });
  }
  return out.join('');
}

// ───────────── Risques : tableau et matrice P × I ─────────────

export interface RiskRow { code: string; name: string; p: number; i: number; plan: string | null; owner: string; ws: string | null; due: string | null; status: string }
export interface RisksData { today: string; rows: RiskRow[]; show: Record<string, boolean> }
/** Seuils de criticité (probabilité × impact) : identiques à `scoreTone`. */
export const RISK_LEVELS = [{ tone: 'risk' as const, label: 'Critique', range: '≥ 20', min: 20 }, { tone: 'watch' as const, label: 'Élevé', range: '12–19', min: 12 }, { tone: 'ok' as const, label: 'Modéré', range: '< 12', min: 0 }];

/** Matrice 5 × 5 : zones de criticité en teinte claire, cases occupées en plein avec les codes des risques. */
export function drawRiskMatrix(d: Draw, a: Box, rows: RiskRow[]): string {
  const t = d.t, ty = typeScale(t), out: string[] = [];
  out.push(d.label({ x: a.x, y: a.y, w: a.w, h: 0.22 * IN }, 'Matrice des risques P × I'));
  const axisW = 0.3 * IN, legendH = 0.95 * IN, gap = 0.05 * IN;
  const cell = Math.min((a.w - axisW - 4 * gap) / 5, (a.h - 0.36 * IN - 0.3 * IN - legendH - 4 * gap) / 5);
  const gx = a.x + axisW, gy = a.y + 0.36 * IN, gw = 5 * cell + 4 * gap;
  const zoneColor = (tone: 'risk' | 'watch' | 'ok') => t[tone];
  for (let p = 5; p >= 1; p--) {
    for (let i = 1; i <= 5; i++) {
      const x = gx + (i - 1) * (cell + gap), y = gy + (5 - p) * (cell + gap), tone = scoreTone(p * i);
      const here = rows.filter((r) => r.p === p && r.i === i);
      out.push(d.sp({ box: { x, y, w: cell, h: cell }, geom: 'roundRect', adj: 14000, fill: here.length ? zoneColor(tone) : mixHex(zoneColor(tone), 'FFFFFF', tone === 'ok' ? 0.88 : 0.8) }));
      if (here.length) {
        // Une étiquette blanche, codes empilés (trois au plus, puis « +N »).
        const size = Math.min(ty.label - 0.5, (cell / PT) * 0.17), lh = size * 1.18 * PT, cap = Math.max(1, Math.floor((cell - 0.12 * IN) / lh));
        const shown = here.length > cap ? here.slice(0, cap - 1) : here;
        const labels = cap === 1 && here.length > 1 ? [`${here[0].code} +${here.length - 1}`] : shown.map((r) => r.code).concat(here.length > cap ? [`+${here.length - shown.length}`] : []);
        const bh = labels.length * lh + 0.05 * IN;
        out.push(d.sp({ box: { x: x + 0.06 * IN, y: y + (cell - bh) / 2, w: cell - 0.12 * IN, h: bh }, geom: 'roundRect', adj: 18000, fill: 'FFFFFF', anchor: 'ctr', paras: labels.map((l) => ({ align: 'ctr' as const, line: 90, runs: [{ t: l, size, color: t.ink, bold: true }] })) }));
      }
    }
    out.push(d.text({ x: gx - 0.2 * IN, y: gy + (5 - p) * (cell + gap), w: 0.16 * IN, h: cell }, [{ align: 'r', runs: [{ t: String(p), size: ty.label - 0.5, color: t.subtle }] }], 'ctr'));
  }
  for (let i = 1; i <= 5; i++) out.push(d.text({ x: gx + (i - 1) * (cell + gap), y: gy + gw + 0.02 * IN, w: cell, h: 0.16 * IN }, [{ align: 'ctr', runs: [{ t: String(i), size: ty.label - 0.5, color: t.subtle }] }], 't'));
  out.push(d.text({ x: a.x, y: gy, w: 0.12 * IN, h: gw }, [{ runs: [{ t: 'P', size: ty.small, color: t.muted, bold: true }] }], 'ctr'));
  out.push(d.text({ x: gx, y: gy + gw + 0.18 * IN, w: gw, h: 0.2 * IN }, [{ runs: [{ t: 'Impact →', size: ty.label, color: t.muted, bold: true }] }], 't'));
  // Légende : seuils et nombre de risques par niveau.
  let ly = gy + gw + 0.46 * IN;
  for (const lv of RISK_LEVELS) {
    const n = rows.filter((r) => scoreTone(r.p * r.i) === lv.tone).length;
    out.push(d.sp({ box: { x: a.x, y: ly + 0.04 * IN, w: 0.13 * IN, h: 0.13 * IN }, geom: 'roundRect', adj: 20000, fill: zoneColor(lv.tone) }));
    out.push(d.text({ x: a.x + 0.22 * IN, y: ly, w: a.w - 0.22 * IN, h: 0.22 * IN }, [{ runs: [{ t: `${lv.label} `, size: ty.small, color: t.ink, bold: true }, { t: `(${lv.range})`, size: ty.label, color: t.muted }, { t: `   ${n} risque${n > 1 ? 's' : ''}`, size: ty.label, color: n ? t.ink : t.subtle, bold: n > 0 }] }], 'ctr'));
    ly += 0.25 * IN;
  }
  return out.join('');
}

/**
 * Risques : tableau (code, risque et plan de mitigation, criticité en pastille avec P × I, porteur et chantier,
 * échéance) et matrice P × I à droite ; lignes à hauteur variable, risques au-delà de la page signalés.
 */
export function drawRisks(d: Draw, a: Box, r: RisksData): string {
  const t = d.t, ty = typeScale(t), out: string[] = [];
  const show = r.show, rows = r.rows;
  const withMatrix = show.matrix !== false;
  const mw = withMatrix ? Math.min(a.w * 0.3, 3.3 * IN) : 0, gap = withMatrix ? 0.4 * IN : 0;
  if (withMatrix) out.push(drawRiskMatrix(d, { x: a.x + a.w - mw, y: a.y, w: mw, h: a.h }, rows));
  const T: Box = { x: a.x, y: a.y, w: a.w - mw - gap, h: a.h };
  if (!rows.length) { out.push(d.text(T, [{ runs: [{ t: 'Aucun risque ouvert sur le périmètre.', size: ty.body, color: t.muted }] }])); return out.join(''); }
  type Col = { id: string; label: string; w: number; align?: 'l' | 'r' | 'ctr' };
  const cols: Col[] = [];
  if (show.code !== false) cols.push({ id: 'code', label: '#', w: 0.55 * IN });
  cols.push({ id: 'name', label: show.plan !== false ? 'Risque · plan de mitigation' : 'Risque', w: 0 });
  if (show.score !== false || show.p || show.i) cols.push({ id: 'score', label: 'Crit.', w: 0.7 * IN, align: 'ctr' });
  if (show.owner !== false) cols.push({ id: 'owner', label: 'Porteur', w: 1.35 * IN });
  if (show.due !== false) cols.push({ id: 'due', label: 'Échéance', w: 1.05 * IN });
  if (show.status) cols.push({ id: 'status', label: 'Statut', w: 1.4 * IN });
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  cols.find((c) => c.id === 'name')!.w = Math.max(1.6 * IN, T.w - fixed);
  const xs: number[] = []; cols.reduce((x, c) => (xs.push(x), x + c.w), T.x);
  const headH = 0.34 * IN;
  cols.forEach((c, k) => out.push(d.text({ x: xs[k] + 0.06 * IN, y: T.y, w: c.w - 0.12 * IN, h: headH - 0.08 * IN }, [{ align: c.align ?? 'l', runs: [{ t: c.label, size: ty.label, color: t.muted, bold: true, caps: true, spc: 0.8 }] }], 'b')));
  out.push(d.line(T.x, T.y + headH, T.x + T.w, T.y + headH, t.ink, 1));
  const nameW = cols.find((c) => c.id === 'name')!.w - 0.2 * IN, nameSize = ty.small + 0.5;
  let y = T.y + headH, shown = 0;
  const limit = T.y + T.h - 0.26 * IN;
  for (const row of rows) {
    const nl = wrapText(row.name, nameW, nameSize, 2);
    const plan = show.plan !== false ? (row.plan?.trim() ? wrapText(row.plan, nameW, ty.label, 1) : null) : undefined;
    const h = Math.max(0.5 * IN, (nl.length * nameSize * 1.25 + (plan !== undefined ? ty.label * 1.5 : 0)) * PT + 0.2 * IN);
    if (y + h > limit && shown > 0) break;
    const score = row.p * row.i, tone = scoreTone(score), overdue = !!row.due && row.due < r.today;
    cols.forEach((c, k) => {
      const x = xs[k] + 0.06 * IN, w = c.w - 0.12 * IN;
      if (c.id === 'code') out.push(d.text({ x, y, w, h }, [{ runs: [{ t: row.code, size: ty.small, color: t.muted, bold: true }] }], 'ctr'));
      if (c.id === 'name') {
        const paras: Para[] = nl.map((l) => ({ line: 100, runs: [{ t: l, size: nameSize, color: t.ink, bold: true }] }));
        if (plan !== undefined) paras.push({ spcBef: 3, runs: [plan ? { t: plan[0], size: ty.label, color: t.muted } : { t: 'Aucun plan approuvé — à qualifier', size: ty.label, color: t.risk, bold: true }] });
        out.push(d.text({ x, y, w: c.w - 0.2 * IN, h }, paras, 'ctr'));
      }
      if (c.id === 'score') {
        const pw = 0.46 * IN, ph = 0.24 * IN, py = y + (h - ph) / 2 - (show.p || show.i ? 0.07 * IN : 0);
        if (show.score !== false) out.push(d.sp({ box: { x: xs[k] + (c.w - pw) / 2, y: py, w: pw, h: ph }, geom: 'roundRect', adj: 26000, fill: t[tone], anchor: 'ctr', paras: [{ align: 'ctr', runs: [{ t: String(score), size: ty.small, color: 'FFFFFF', bold: true }] }] }));
        if (show.p || show.i) out.push(d.text({ x: xs[k], y: py + ph + 0.03 * IN, w: c.w, h: 0.16 * IN }, [{ align: 'ctr', runs: [{ t: `P${row.p} × I${row.i}`, size: ty.label - 1, color: t.subtle }] }], 't'));
      }
      if (c.id === 'owner') out.push(d.text({ x, y, w, h }, [{ runs: [{ t: row.owner, size: ty.small, color: t.ink }] }, ...(row.ws ? [{ spcBef: 2, runs: [{ t: row.ws, size: ty.label, color: t.subtle }] }] : [])], 'ctr'));
      if (c.id === 'due') out.push(d.text({ x, y, w, h }, [{ runs: [{ t: row.due ? frShortDate(row.due) : '—', size: ty.small, color: overdue ? t.risk : row.due ? t.ink : t.subtle, bold: !!row.due }] }, ...(overdue ? [{ spcBef: 2, runs: [{ t: 'échue', size: ty.label, color: t.risk }] }] : [])], 'ctr'));
      if (c.id === 'status') out.push(d.text({ x, y, w, h }, [{ runs: [{ t: '●  ', size: ty.label, color: toneColor(t, statusTone(row.status)) }, { t: row.status, size: ty.small, color: t.ink }] }], 'ctr'));
    });
    y += h;
    shown++;
    out.push(d.line(T.x, y, T.x + T.w, y, t.hairline, 0.5));
  }
  if (shown < rows.length) out.push(d.text({ x: T.x, y: y + 0.04 * IN, w: T.w, h: 0.22 * IN }, [{ runs: [{ t: `… et ${rows.length - shown} autre${rows.length - shown > 1 ? 's' : ''} risque${rows.length - shown > 1 ? 's' : ''}${withMatrix ? ' (tous dans la matrice)' : ''}`, size: ty.label, color: t.subtle, italic: true }] }], 'ctr'));
  return out.join('');
}

// ───────────── Tableaux, indicateurs, synthèse ─────────────

export interface TableColumn { id: string; label: string; width: number; align: 'l' | 'r'; kind: 'code' | 'text' | 'status' | 'score' | 'slip' | 'number' }
export const COLUMN_KIND: Record<string, TableColumn['kind']> = { code: 'code', status: 'status', score: 'score', slip: 'slip', progress: 'number', p: 'number', i: 'number' };
const tc = (body: string, line: string, fill?: string) => `<a:tc>${body}<a:tcPr marL="45720" marR="45720" marT="22860" marB="22860" anchor="ctr"><a:lnL w="0"><a:noFill/></a:lnL><a:lnR w="0"><a:noFill/></a:lnR><a:lnT w="0"><a:noFill/></a:lnT>${line}${fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>'}</a:tcPr></a:tc>`;

/** En-tête de tableau : petites capitales espacées, filet d'encre dessous. */
export function tableHeaderRow(d: Draw, cols: TableColumn[], rowH: number) {
  const ty = typeScale(d.t);
  return `<a:tr h="${R(rowH)}">${cols.map((c) => tc(`<a:txBody><a:bodyPr/><a:lstStyle/>${d.para({ align: c.align, runs: [{ t: c.label, size: ty.label, color: d.t.muted, bold: true, caps: true, spc: 0.8 }] })}</a:txBody>`, `<a:lnB w="${R(1 * PT)}"><a:solidFill><a:srgbClr val="${d.t.ink}"/></a:solidFill></a:lnB>`)).join('')}</a:tr>`;
}
/** Ligne de tableau : statut en pastille de couleur, criticité et écarts colorés, chiffres alignés à droite, filet fin. */
export function tableRow(d: Draw, cols: TableColumn[], cells: string[], rowH: number, opts: { muted?: boolean } = {}) {
  const t = d.t, ty = typeScale(t);
  const line = `<a:lnB w="${R(0.5 * PT)}"><a:solidFill><a:srgbClr val="${t.hairline}"/></a:solidFill></a:lnB>`;
  return `<a:tr h="${R(rowH)}">${cols.map((c, i) => {
    const v = cells[i] ?? '';
    let runs: Run[];
    const n = Number(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
    if (opts.muted) runs = [{ t: v, size: ty.small, color: t.subtle, italic: true }];
    else if (c.kind === 'status' && v && v !== '—') runs = [{ t: '●  ', size: ty.label, color: toneColor(t, statusTone(v)) }, { t: v, size: ty.small, color: t.ink }];
    else if (c.kind === 'score' && v && !Number.isNaN(n)) runs = [{ t: v, size: ty.small, color: t[scoreTone(n)], bold: true }];
    else if (c.kind === 'slip' && v && v !== '—' && !Number.isNaN(n)) runs = [{ t: n > 0 ? `+${v}` : v, size: ty.small, color: n > 0 ? t.risk : n < 0 ? t.ok : t.subtle, bold: n !== 0 }];
    else if (c.kind === 'code') runs = [{ t: v, size: ty.small, color: t.muted, bold: true }];
    else runs = [{ t: v, size: ty.small, color: v === '—' ? t.subtle : t.ink }];
    return tc(`<a:txBody><a:bodyPr/><a:lstStyle/>${d.para({ align: c.align, runs })}</a:txBody>`, line);
  }).join('')}</a:tr>`;
}

/** Cartes d'indicateurs : libellé en petites capitales, valeur en grand, filets verticaux entre les cartes. */
export function kpiCards(d: Draw, a: Box, items: Array<{ id: string; label: string; field: string }>): string {
  const t = d.t, ty = typeScale(t), n = items.length, w = a.w / n, out: string[] = [];
  items.forEach((it, i) => {
    const x = a.x + i * w, pad = i ? 0.2 * IN : 0;
    out.push(d.sp({ box: { x: x + pad, y: a.y, w: 0.3 * IN, h: 0.028 * IN }, fill: i === 0 ? t.accent : t.ink }));
    if (i) out.push(d.line(x, a.y + 0.14 * IN, x, a.y + a.h - 0.04 * IN, t.hairline, 0.75));
    out.push(d.text({ x: x + pad, y: a.y + 0.12 * IN, w: w - pad - 0.1 * IN, h: 0.24 * IN }, [{ runs: [{ t: it.label, size: ty.label, color: t.muted, bold: true, caps: true, spc: 0.8 }] }], 't', `Libellé ${it.label}`));
    out.push(d.text({ x: x + pad, y: a.y + 0.38 * IN, w: w - pad - 0.1 * IN, h: a.h - 0.42 * IN }, [{ runs: [{ t: '—', size: ty.stat, color: i === 0 ? t.accent : t.ink, bold: true, font: t.head }] }], 't', `rise:${it.field}`));
  });
  return out.join('');
}

/** Synthèse : première phrase en message principal, puis les faits en liste à puces carrées de l'accent. */
export function synthesisParas(d: Draw, lines: string[]): Para[] {
  const t = d.t, ty = typeScale(t);
  if (!lines.length) return [{ runs: [{ t: '—', size: ty.body, color: t.subtle }] }];
  const clean = lines.map((l) => l.replace(/^[•\-–]\s*/, ''));
  return clean.map((l, i) => (i === 0 && clean.length > 1
    ? { spcAft: 9, line: 108, runs: [{ t: l, size: ty.lead, color: t.ink, bold: true, font: t.head }] }
    : { spcAft: 6, line: 110, bullet: { char: '■', color: t.accent, size: ty.body }, runs: [{ t: l, size: ty.body, color: t.ink }] }));
}
