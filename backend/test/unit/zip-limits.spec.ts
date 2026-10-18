import JSZip from 'jszip';
import ExcelJS from 'exceljs';
import { loadZipBounded, ZIP_MAX_XML_PART_BYTES, ZIP_TOO_LARGE_MESSAGE, ZipTooLargeError } from '../../src/core/zip-limits';
import { OfficeReadError, readDocx, readXlsx } from '../../src/core/office-text';
import { analyzeFormatFile } from '../../src/core/report-format-read';
import { readProposal } from '../../src/core/prefill-text';
import { readWorkbook } from '../../src/import/excel-reader';
import { makeDocx, makePptx } from '../office-fixture';

/** Fichier piégé : une partie XML très compressible, au-delà du plafond une fois décompressée (quelques dizaines de Ko). */
async function bomb(part: string, extra: Record<string, string> = {}): Promise<Buffer> {
  const z = new JSZip();
  for (const [p, c] of Object.entries(extra)) z.file(p, c);
  z.file(part, '<x>' + '<a/>'.repeat(Math.ceil((ZIP_MAX_XML_PART_BYTES + 1024 * 1024) / 4)) + '</x>');
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}
const CT = { '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' };

/** Plafonds de décompression des fichiers Office déposés (audit de sécurité du 18/10/2026). */
describe('Fichiers Office : plafonds de décompression', () => {
  it('un fichier piégé de quelques dizaines de Ko est refusé avant d’être décompressé en entier', async () => {
    const buf = await bomb('word/document.xml', CT);
    expect(buf.length).toBeLessThan(200 * 1024);
    await expect(loadZipBounded(buf)).rejects.toBeInstanceOf(ZipTooLargeError);
  });

  it('un document ordinaire passe sans changement', async () => {
    const docx = await makeDocx([{ h: 'Contexte', level: 1, paras: ['Bonjour'] }]);
    await expect(loadZipBounded(docx)).resolves.toBeInstanceOf(JSZip);
    expect((await readDocx(docx)).length).toBeGreaterThan(0);
    await expect(analyzeFormatFile(await makePptx([{ title: 'Titre', lines: ['a'] }]), 'modele.pptx')).resolves.toBeTruthy();
  });

  it('Base de connaissance : DOCX et XLSX piégés refusés avec un message clair', async () => {
    await expect(readDocx(await bomb('word/document.xml', CT))).rejects.toThrow(new OfficeReadError(ZIP_TOO_LARGE_MESSAGE));
    await expect(readXlsx(await bomb('xl/worksheets/sheet1.xml', CT))).rejects.toThrow(ZIP_TOO_LARGE_MESSAGE);
  });

  it('Format du rapport : PPTX piégé refusé (et non plus un arrêt du processus)', async () => {
    await expect(analyzeFormatFile(await bomb('ppt/presentation.xml', CT), 'modele.pptx')).rejects.toThrow(ZIP_TOO_LARGE_MESSAGE);
  });

  it('Préremplissage : proposition DOCX piégée refusée', async () => {
    await expect(readProposal(await bomb('word/document.xml', CT), 'proposition.docx')).rejects.toThrow(ZIP_TOO_LARGE_MESSAGE);
  });

  it('Import Excel : une cellule isolée en ligne 1 048 576 est lue sans parcourir les lignes vides', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('10 Chantiers');
    ws.getRow(7).getCell(2).value = 'OBLIGATOIRE';
    ws.getRow(8).getCell(2).value = 'Nom';
    ws.getRow(1_048_576).getCell(2).value = 'x';
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    expect(buf.length).toBeLessThan(20 * 1024);
    const t0 = Date.now();
    const read = await readWorkbook(buf);
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(read.sheets['10 Chantiers'].rows).toEqual([{ row: 1_048_576, values: { Nom: 'x' }, control: null }]);
    await expect(readWorkbook(await bomb('xl/worksheets/sheet1.xml', CT))).rejects.toBeInstanceOf(ZipTooLargeError);
  });
});
