import ExcelJS from 'exceljs';

/**
 * Lecture du fichier « Referentiel RISE - initialisation.xlsx » (brief Cockpit § 10, Console § 10.6).
 * Onglets de saisie : types en ligne 7 (OBLIGATOIRE, FACULTATIF, CALCULÉ, CONTRÔLE), en-têtes en ligne 8,
 * données à partir de la ligne 9. L'onglet « 05 Projet » est un formulaire (libellé en B, type en C, valeur en D).
 */

export const SHEETS = [
  '01 Équipes',
  '02 Rôles',
  '03 Personnes',
  '04 Affectations',
  '05 Projet',
  '06 Lots',
  '07 Phases',
  '08 Sous-phases',
  '09 Chantiers',
  '10 Instances',
  '11 Membres',
  '12 Jalons',
  '13 Livrables',
] as const;

export type ColumnType = 'REQUIRED' | 'OPTIONAL' | 'COMPUTED' | 'CONTROL' | 'NONE';
export type CellValue = string | number | Date | null;

export interface SheetRow {
  row: number;
  values: Record<string, CellValue>;
  /** Texte de la colonne CONTRÔLE (valeur calculée enregistrée dans le fichier), s'il existe. */
  control: string | null;
}

export interface SheetData {
  name: string;
  columns: Array<{ header: string; type: ColumnType; col: number; letter: string }>;
  rows: SheetRow[];
}

export interface FormField {
  label: string;
  type: ColumnType;
  row: number;
  value: CellValue;
}

export interface ParsedWorkbook {
  missingSheets: string[];
  sheets: Record<string, SheetData>;
  projectForm: FormField[];
  projectControl: string | null;
}

export function columnType(raw: unknown): ColumnType {
  const s = String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
  if (s.startsWith('OBLIGATOIRE')) return 'REQUIRED';
  if (s.startsWith('FACULTATIF')) return 'OPTIONAL';
  if (s.startsWith('CALCULE')) return 'COMPUTED';
  if (s.startsWith('CONTROLE')) return 'CONTROL';
  return 'NONE';
}

/** Valeur exploitable d'une cellule : résultat de formule, texte enrichi, lien, date. */
export function cellValue(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (typeof v === 'object') {
    const o = v as any;
    if ('result' in o) return cellValue(o.result);
    if ('formula' in o || 'sharedFormula' in o) return null;
    if ('richText' in o) return cellValue(o.richText.map((x: any) => x.text).join(''));
    if ('text' in o) return cellValue(o.text);
    if ('error' in o) return null;
  }
  return String(v);
}

function sheetByName(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  const norm = (s: string) => s.normalize('NFC').trim().toLowerCase();
  return wb.worksheets.find((w) => norm(w.name) === norm(name));
}

export async function readWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const out: ParsedWorkbook = { missingSheets: [], sheets: {}, projectForm: [], projectControl: null };
  for (const name of SHEETS) {
    const ws = sheetByName(wb, name);
    if (!ws) {
      out.missingSheets.push(name);
      continue;
    }
    if (name === '05 Projet') {
      for (let r = 7; r <= Math.max(ws.rowCount, 30); r++) {
        const label = cellValue(ws.getRow(r).getCell(2).value);
        const type = columnType(ws.getRow(r).getCell(3).value);
        if (label && type !== 'NONE') out.projectForm.push({ label: String(label), type, row: r, value: cellValue(ws.getRow(r).getCell(4).value) });
        const ctl = cellValue(ws.getRow(r).getCell(4).value);
        if (typeof ctl === 'string' && /^[⚠◔✓]/.test(ctl) && !label) out.projectControl = ctl;
      }
      continue;
    }
    const typeRow = ws.getRow(7);
    const headRow = ws.getRow(8);
    const columns: SheetData['columns'] = [];
    for (let c = 2; c <= Math.max(ws.columnCount, 2); c++) {
      const type = columnType(typeRow.getCell(c).value);
      const header = cellValue(headRow.getCell(c).value);
      if (!header || type === 'NONE') continue;
      columns.push({ header: String(header), type, col: c, letter: ws.getColumn(c).letter });
    }
    const rows: SheetRow[] = [];
    for (let r = 9; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const values: Record<string, CellValue> = {};
      let control: string | null = null;
      let filled = false;
      for (const col of columns) {
        const v = cellValue(row.getCell(col.col).value);
        if (col.type === 'CONTROL') control = typeof v === 'string' ? v : null;
        else if (col.type === 'REQUIRED' || col.type === 'OPTIONAL') {
          values[col.header] = v;
          if (v !== null) filled = true;
        }
      }
      // Une ligne est lue dès qu'une de ses cellules de saisie est remplie (§ 10).
      if (filled) rows.push({ row: r, values, control });
    }
    out.sheets[name] = { name, columns, rows };
  }
  return out;
}
