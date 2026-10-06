import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { columnType, SHEETS } from '../import/excel-reader';
import { PREFILL_SKIPPED_FIELDS, PrefillCheck, PrefillField, PrefillFile, PrefillRow, PrefillTabSpec, RefKind, sourceLabel } from '../domain/prefill';

/**
 * Préremplissage (07/10/2026) : champs des 14 onglets lus dans le modèle Excel (en-têtes, obligatoires, validations),
 * et Excel prérempli écrit dans une copie du modèle — mêmes onglets, colonnes et validations ; seules les cellules
 * de saisie changent. Cellule à vérifier : fond ambre et commentaire (motif, confiance, page source).
 */

/** Fond des cellules incertaines ou manquantes (maquette : ambre #FFE3AD). */
export const PREFILL_HIGHLIGHT = 'FFFFE3AD';

/** Lignes de saisie de chaque onglet du modèle (de la ligne 9 à la dernière ligne mise en forme). */
const CAPACITY: Record<string, number> = {
  '01 Équipes': 30, '02 Rôles': 40, '03 Personnes': 150, '04 Affectations': 200, '06 Info projet': 120, '07 Lots': 30, '08 Phases': 30,
  '09 Sous-phases': 80, '10 Chantiers': 30, '11 Instances': 20, '12 Membres': 200, '13 Jalons': 100, '14 Livrables': 150,
};
/** Listes ▾ reliées à un onglet précédent. */
const REFS: Record<string, RefKind> = {
  L_Equipes: 'teams', L_Roles: 'roles', L_Personnes: 'persons', L_Lots: 'lots', L_Phases: 'phases', L_SousPhases: 'subphases', L_Chantiers: 'workstreams', L_Instances: 'bodies',
};
/** Colonnes à choix multiple de « 10 Chantiers » (sans liste dans le modèle). */
const MULTI: Record<string, { ref: RefKind; allowAll?: boolean }> = { Phases: { ref: 'phases' }, 'Sous-phases': { ref: 'subphases' }, Dépendances: { ref: 'workstreams', allowAll: true } };

const TAB_LABEL = (sheet: string) => sheet.replace(/^\d+\s+/, '');

function listsOf(wb: ExcelJS.Workbook): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const listes = wb.getWorksheet('Listes');
  for (const d of ((wb as any).definedNames.model ?? []) as Array<{ name: string; ranges: string[] }>) {
    const m = /^Listes!\$([A-Z]+)\$(\d+):\$[A-Z]+\$(\d+)$/.exec(d.ranges?.[0] ?? '');
    if (!m || !listes) continue;
    const vals: string[] = [];
    for (let r = +m[2]; r <= +m[3]; r++) { const v = listes.getCell(`${m[1]}${r}`).value; if (v !== null && v !== undefined && String(v).trim()) vals.push(String(v).trim()); }
    out[d.name] = vals;
  }
  return out;
}

function fieldOf(header: string, required: boolean, col: number, dv: any, lists: Record<string, string[]>, row?: number): PrefillField {
  const f: PrefillField = { header, col, row, required, kind: 'text' };
  if (MULTI[header]) return { ...f, kind: 'refs', ...MULTI[header] };
  if (!dv) return f;
  if (dv.type === 'date') return { ...f, kind: 'date' };
  if (dv.type === 'whole' || dv.type === 'decimal') return { ...f, kind: 'number' };
  if (dv.type === 'list') {
    const formula = String(dv.formulae?.[0] ?? '');
    const name = /^[A-Za-z_]+$/.test(formula) ? formula : /L_SousPhases/.test(formula) ? 'L_SousPhases' : '';
    if (REFS[name]) return { ...f, kind: 'ref', ref: REFS[name] };
    if (lists[name]) return { ...f, kind: 'list', list: lists[name] };
  }
  return f;
}

/** Champs des 14 onglets, dans l'ordre du fichier, d'après le modèle. */
export async function prefillSpecs(template: Buffer): Promise<PrefillTabSpec[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(template as any);
  const lists = listsOf(wb);
  return SHEETS.map((sheet, index) => {
    const ws = wb.getWorksheet(sheet);
    if (!ws) throw new Error(`Modèle d'initialisation : onglet « ${sheet} » absent`);
    const dvs = (ws as any).dataValidations?.model ?? {};
    const skip = PREFILL_SKIPPED_FIELDS[sheet] ?? [];
    const fields: PrefillField[] = [];
    const n = sheet.slice(0, 2);
    if (sheet === '05 Projet') {
      for (let r = 7; r <= 30; r++) {
        const label = ws.getCell(r, 2).value, type = columnType(ws.getCell(r, 3).value);
        if (!label || (type !== 'REQUIRED' && type !== 'OPTIONAL')) continue;
        fields.push(fieldOf(String(label), type === 'REQUIRED', 4, dvs[`D${r}`], lists, r));
      }
      return { index, n, label: TAB_LABEL(sheet), sheet, form: true, fields, capacity: 1 };
    }
    for (let c = 2; c <= ws.columnCount; c++) {
      const type = columnType(ws.getRow(7).getCell(c).value), header = ws.getRow(8).getCell(c).value;
      if (!header || (type !== 'REQUIRED' && type !== 'OPTIONAL') || skip.includes(String(header))) continue;
      fields.push(fieldOf(String(header), type === 'REQUIRED', c, dvs[`${ws.getColumn(c).letter}9`], lists));
    }
    return { index, n, label: TAB_LABEL(sheet), sheet, form: false, fields, capacity: CAPACITY[sheet] ?? 30 };
  });
}

// ───────────── Écriture : XML du modèle modifié en place ─────────────
// Le modèle est réécrit au niveau XML, et non par ExcelJS, dont la réécriture de ce fichier n'est pas relue par
// Microsoft Excel : seules les cellules de saisie, les styles surlignés et les commentaires changent.

const esc = (v: string) => v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (c: number) => { let s = ''; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const colNum = (ref: string) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
/** Date « JJ/MM/AAAA » → numéro de série Excel (les cellules de date du modèle ont le format jj/mm/aaaa). */
const serial = (v: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v); return m ? (Date.UTC(+m[3], +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30)) / 86_400_000 : null; };

function cellXml(ref: string, style: string | null, f: PrefillField, v: string | number | null): string {
  const s = style !== null ? ` s="${style}"` : '';
  if (v === null || v === '') return `<c r="${ref}"${s}/>`;
  if (f.kind === 'date' && typeof v === 'string') { const n = serial(v); if (n !== null) return `<c r="${ref}"${s}><v>${n}</v></c>`; }
  if (typeof v === 'number') return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
}

/** Remplace (ou insère, à sa place dans la ligne) une cellule ; `make` reçoit le style qu'elle avait. */
function putCell(xml: string, row: number, col: number, make: (style: string | null) => string): string {
  const ref = `${colName(col)}${row}`;
  const m = new RegExp(`<c r="${ref}"(?=[ >/])([^>]*?)(?:/>|>[\\s\\S]*?</c>)`).exec(xml);
  if (m) return xml.slice(0, m.index) + make(/ s="(\d+)"/.exec(m[1])?.[1] ?? null) + xml.slice(m.index + m[0].length);
  const r = new RegExp(`<row r="${row}"(?=[ >/])([^>]*?)(?:/>|>([\\s\\S]*?)</row>)`).exec(xml);
  if (r) {
    const parts = (r[2] ?? '').match(/<c r="[A-Z]+\d+"[\s\S]*?(?:\/>|<\/c>)/g) ?? [];
    const at = parts.findIndex((c) => colNum(/r="([A-Z]+)/.exec(c)![1]) > col);
    const cells = at < 0 ? [...parts, make(null)] : [...parts.slice(0, at), make(null), ...parts.slice(at)];
    return xml.slice(0, r.index) + `<row r="${row}"${r[1]}>${cells.join('')}</row>` + xml.slice(r.index + r[0].length);
  }
  const next = [...xml.matchAll(/<row r="(\d+)"/g)].find((x) => +x[1] > row);
  const add = `<row r="${row}">${make(null)}</row>`;
  if (next) return xml.slice(0, next.index) + add + xml.slice(next.index);
  return xml.includes('<sheetData/>') ? xml.replace('<sheetData/>', `<sheetData>${add}</sheetData>`) : xml.replace('</sheetData>', `${add}</sheetData>`);
}

const noteOf = (c: PrefillCheck, source: (page: number | null) => string) =>
  c.type === 'incertain'
    ? `À vérifier : ${c.motif}\nConfiance : ${c.confiance} %\nSource : ${source(c.page)}`
    : `Manquant : ${c.motif}\nConfiance : —\nSource : —`;

const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const REL_COMMENTS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments';
const REL_VML = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing';

function commentsXml(checks: PrefillCheck[], source: (page: number | null) => string): string {
  const list = checks.map((c) => `<comment ref="${colName(c.cell.col)}${c.cell.row}" authorId="0"><text><r><rPr><sz val="9"/><rFont val="Tahoma"/><family val="2"/></rPr><t xml:space="preserve">${esc(noteOf(c, source))}</t></r></text></comment>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>Cockpit</author></authors><commentList>${list}</commentList></comments>`;
}
function vmlXml(checks: PrefillCheck[], k: number): string {
  const shapes = checks.map((c, i) => {
    const r = c.cell.row - 1, col = c.cell.col - 1;
    return `<v:shape id="_x0000_s${k * 1024 + i + 1}" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:2pt;width:220pt;height:62pt;z-index:${i + 1};visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto"><v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox><x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>${col + 1}, 15, ${Math.max(0, r - 1)}, 4, ${col + 4}, 15, ${r + 4}, 4</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>${r}</x:Row><x:Column>${col}</x:Column></x:ClientData></v:shape>`;
  }).join('');
  return `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="${k}"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>${shapes}</xml>`;
}

/** Styles surlignés (fond ambre) : un clone de chaque style d'origine, ajouté une seule fois. */
function highlighter(styles: string) {
  const fills = /<fills count="(\d+)">([\s\S]*?)<\/fills>/.exec(styles)!;
  const fillId = +fills[1];
  const xml = styles.replace(fills[0], `<fills count="${fillId + 1}">${fills[2]}<fill><patternFill patternType="solid"><fgColor rgb="${PREFILL_HIGHLIGHT}"/><bgColor indexed="64"/></patternFill></fill></fills>`);
  const xfs = /<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/.exec(xml)![1].match(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) ?? [];
  const added: string[] = [];
  const cache = new Map<string, string>();
  return {
    style(base: string | null): string {
      const key = base ?? '0';
      if (!cache.has(key)) {
        let xf = (xfs[+key] ?? xfs[0]).replace(/fillId="\d+"/, `fillId="${fillId}"`).replace(/ applyFill="\d"/, '');
        xf = xf.replace(/^<xf\b/, '<xf applyFill="1"');
        added.push(xf);
        cache.set(key, String(xfs.length + added.length - 1));
      }
      return cache.get(key)!;
    },
    xml: () => xml.replace(/<cellXfs count="\d+">[\s\S]*?<\/cellXfs>/, `<cellXfs count="${xfs.length + added.length}">${xfs.join('')}${added.join('')}</cellXfs>`),
  };
}

/** Excel prérempli : copie du modèle, lignes extraites écrites, cellules à vérifier surlignées et commentées. */
export async function writePrefillWorkbook(template: Buffer, specs: PrefillTabSpec[], tabs: Array<{ rows: PrefillRow[]; checks: PrefillCheck[] }>, files: PrefillFile[] = []): Promise<Buffer> {
  const source = (page: number | null) => sourceLabel(files, page);
  const zip = await JSZip.loadAsync(template);
  const workbook = await zip.file('xl/workbook.xml')!.async('string');
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const unesc = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const partOf = (name: string) => {
    const sheet = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => unesc(/ name="([^"]*)"/.exec(t)?.[1] ?? '') === name);
    const rid = / r:id="([^"]+)"/.exec(sheet ?? '')?.[1];
    const rel = [...wbRels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`Id="${rid}"`));
    const target = /Target="([^"]+)"/.exec(rel ?? '')?.[1];
    if (!target) throw new Error(`Modèle d'initialisation : onglet « ${name} » introuvable`);
    return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  };
  const hl = highlighter(await zip.file('xl/styles.xml')!.async('string'));
  let types = await zip.file('[Content_Types].xml')!.async('string');
  let k = 0;
  for (const [i, spec] of specs.entries()) {
    const tab = tabs[i];
    if (!tab) continue;
    const part = partOf(spec.sheet);
    let xml = await zip.file(part)!.async('string');
    const flagged = new Map(tab.checks.map((c) => [`${c.cell.row}:${c.cell.col}`, c]));
    tab.rows.forEach((row, r) => {
      for (const f of spec.fields) {
        const cell = row[f.header];
        if (!cell) continue;
        const rr = spec.form ? f.row! : 9 + r, key = `${rr}:${f.col}`, hit = flagged.has(key);
        xml = putCell(xml, rr, f.col, (st) => cellXml(`${colName(f.col)}${rr}`, hit ? hl.style(st) : st, f, cell.v));
        flagged.delete(key);
      }
    });
    // Champs manquants : cellule vide, surlignée.
    for (const c of flagged.values()) xml = putCell(xml, c.cell.row, c.cell.col, (st) => `<c r="${colName(c.cell.col)}${c.cell.row}" s="${hl.style(st)}"/>`);
    if (tab.checks.length) {
      k++;
      const n = /sheet(\d+)\.xml$/.exec(part)?.[1] ?? String(k);
      const relsPath = part.replace(/([^/]+)$/, '_rels/$1.rels');
      const rels = zip.file(relsPath) ? await zip.file(relsPath)!.async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
      zip.file(relsPath, rels.replace('</Relationships>', `<Relationship Id="rIdPrefillC" Type="${REL_COMMENTS}" Target="../comments${n}.xml"/><Relationship Id="rIdPrefillV" Type="${REL_VML}" Target="../drawings/vmlDrawing${n}.vml"/></Relationships>`));
      zip.file(`xl/comments${n}.xml`, commentsXml(tab.checks, source));
      zip.file(`xl/drawings/vmlDrawing${n}.vml`, vmlXml(tab.checks, k));
      types = types.replace('</Types>', `<Override PartName="/xl/comments${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/></Types>`);
      // <legacyDrawing> à sa place dans le schéma : avant legacyDrawingHF, picture, oleObjects, controls, tableParts, extLst.
      const tag = `<legacyDrawing xmlns:r="${NS_R}" r:id="rIdPrefillV"/>`;
      const before = /<(legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b/.exec(xml);
      xml = before ? xml.slice(0, before.index) + tag + xml.slice(before.index) : xml.replace('</worksheet>', `${tag}</worksheet>`);
    }
    zip.file(part, xml);
  }
  if (k && !/Extension="vml"/.test(types)) types = types.replace('</Types>', '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/></Types>');
  zip.file('[Content_Types].xml', types);
  zip.file('xl/styles.xml', hl.xml());
  // Recalcul à l'ouverture (colonnes CALCULÉ et CONTRÔLE du modèle).
  let wbXml = workbook;
  if (/<calcPr\b/.test(wbXml)) { if (!/fullCalcOnLoad=/.test(wbXml)) wbXml = wbXml.replace('<calcPr', '<calcPr fullCalcOnLoad="1"'); }
  else wbXml = wbXml.replace('</workbook>', '<calcPr calcId="124519" fullCalcOnLoad="1"/></workbook>');
  zip.file('xl/workbook.xml', wbXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
