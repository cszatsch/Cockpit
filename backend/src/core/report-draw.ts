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

export interface GanttRow { level: 0 | 1; code: string; name: string; start: string; end: string; status: 'DONE' | 'IN_PROGRESS' | 'PLANNED'; progress: number; current: boolean; /** Sous-phases terminées regroupées sous la phase (planning en tableau). */ folded?: number }
export interface GanttData { today: string; rows: GanttRow[]; milestones: Array<{ code: string; label: string; iso: string; row: number }>; hidden?: number }
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
  const rows = g.rows;
  if (!rows.length) return d.text(a, [{ runs: [{ t: 'Aucune phase sur le périmètre.', size: ty.body, color: t.muted }] }]);
  const sc = timeScale(rows.reduce((m, r) => (r.start < m ? r.start : m), rows[0].start), rows.reduce((m, r) => (r.end > m ? r.end : m), rows[0].end));
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
  const total = items.reduce((s, it) => s + 0.28 * IN + it.w + 0.14 * IN, 0);
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
  const t = d.t, ty = typeScale(t), out: string[] = [];
  const cols = [0.42, 0.19, 0.25, 0.14].map((f) => f * a.w);
  const xs = cols.reduce<number[]>((acc, _w, i) => [...acc, i ? acc[i - 1] + cols[i - 1] : a.x], []);
  const headH = PLAN_TABLE_HEAD_IN * IN;
  const rowH = Math.max(PLAN_TABLE_MIN_ROW_IN * IN, Math.min(0.36 * IN, (a.h - headH - (g.hidden ? 0.26 * IN : 0)) / Math.max(1, g.rows.length)));
  const head = ['Phase · sous-phase', 'Période', 'Avancement', 'Statut'];
  head.forEach((h, i) => out.push(d.text({ x: xs[i] + (i ? 0.1 : 0.06) * IN, y: a.y, w: cols[i] - 0.16 * IN, h: headH - 0.08 * IN }, [{ runs: [{ t: h, size: ty.label, color: t.muted, bold: true, caps: true, spc: 0.8 }] }], 'b')));
  out.push(d.line(a.x, a.y + headH, a.x + a.w, a.y + headH, t.ink, 1));
  g.rows.forEach((r, i) => {
    const y = a.y + headH + i * rowH, sub = r.level === 1, late = isLate(r, g.today);
    if (r.current && !sub) out.push(d.sp({ box: { x: a.x, y, w: a.w, h: rowH }, fill: mixHex(t.accent, 'FFFFFF', 0.92) }));
    if (!sub && r.current) out.push(d.sp({ box: { x: a.x, y, w: 0.035 * IN, h: rowH }, fill: t.accent }));
    const runs: Run[] = [{ t: `${r.code}   `, size: ty.label, color: r.current ? t.accent : t.subtle, bold: true }, { t: r.name, size: sub ? ty.small : ty.body, color: r.current ? t.accent : sub ? t.ink : r.status === 'DONE' ? t.muted : t.ink, bold: !sub }];
    if (r.folded) runs.push({ t: `   ${r.folded} sous-phase${r.folded > 1 ? 's' : ''} terminée${r.folded > 1 ? 's' : ''}`, size: ty.label, color: t.subtle });
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
