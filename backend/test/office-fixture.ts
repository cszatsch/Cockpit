import JSZip from 'jszip';
import ExcelJS from 'exceljs';

/** Fichiers Office minimaux pour les tests de la Base de connaissance (structure OOXML réelle, contenu maîtrisé). */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export interface DocxSection { h?: string; level?: number; paras?: string[]; items?: string[]; table?: string[][] }

export async function makeDocx(sections: DocxSection[]): Promise<Buffer> {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`);
  // Styles localisés comme dans Word en français : identifiant « Titre1 », nom « heading 1 ».
  z.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Titre2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>');
  const p = (t: string, style?: string, num = false) => `<w:p>${style || num ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${num ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ''}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  let body = '';
  for (const s of sections) {
    if (s.h) body += p(s.h, `Titre${s.level ?? 1}`);
    for (const t of s.paras ?? []) body += p(t);
    for (const t of s.items ?? []) body += p(t, undefined, true);
    if (s.table) body += `<w:tbl>${s.table.map((r) => `<w:tr>${r.map((c) => `<w:tc>${p(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
  }
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`);
  return z.generateAsync({ type: 'nodebuffer' });
}

export interface PptxSlideSpec { title?: string; lines?: string[]; notes?: string[]; table?: string[][] }

export async function makePptx(slides: PptxSlideSpec[]): Promise<Buffer> {
  const z = new JSZip();
  const P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>');
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  const para = (t: string) => `<a:p><a:r><a:rPr lang="fr-FR"/><a:t>${esc(t)}</a:t></a:r></a:p>`;
  const sp = (type: string | null, lines: string[]) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="z"/><p:cNvSpPr/><p:nvPr>${type ? `<p:ph type="${type}"/>` : ''}</p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/>${lines.map(para).join('')}</p:txBody></p:sp>`;
  const presRels: string[] = [];
  const ids: string[] = [];
  slides.forEach((s, i) => {
    const n = i + 1;
    const table = s.table ? `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="t"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><a:graphic><a:graphicData><a:tbl>${s.table.map((r) => `<a:tr>${r.map((c) => `<a:tc><a:txBody>${para(c)}</a:txBody></a:tc>`).join('')}</a:tr>`).join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>` : '';
    z.file(`ppt/slides/slide${n}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:sld ${P}><p:cSld><p:spTree>${s.title ? sp('title', [s.title]) : ''}${s.lines?.length ? sp('body', s.lines) : ''}${sp('sldNum', [String(n)])}${table}</p:spTree></p:cSld></p:sld>`);
    if (s.notes?.length) {
      z.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/></Relationships>`);
      z.file(`ppt/notesSlides/notesSlide${n}.xml`, `<?xml version="1.0" encoding="UTF-8"?><p:notes ${P}><p:cSld><p:spTree>${sp('sldImg', [])}${sp('body', s.notes)}</p:spTree></p:cSld></p:notes>`);
    }
    presRels.push(`<Relationship Id="rId${n + 10}" Type="${REL}/slide" Target="slides/slide${n}.xml"/>`);
    ids.push(`<p:sldId id="${255 + n}" r:id="rId${n + 10}"/>`);
  });
  z.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${P}><p:sldIdLst>${ids.join('')}</p:sldIdLst></p:presentation>`);
  z.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels.join('')}</Relationships>`);
  return z.generateAsync({ type: 'nodebuffer' });
}

export async function makeXlsx(sheets: Array<{ name: string; rows: unknown[][] }>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name);
    for (const r of s.rows) ws.addRow(r);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Fichier Office protégé par mot de passe : conteneur OLE (format composé), comme l'enregistre Office. */
export const protectedOffice = () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(2048)]);
