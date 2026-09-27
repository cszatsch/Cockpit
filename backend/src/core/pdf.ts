/**
 * Générateur PDF minimal (texte, une ou plusieurs pages A4, police Helvetica standard).
 * Suffisant pour les rapports de séance et l'export de documents générés ; le moteur de mise
 * en page réel des supports de comité est hors périmètre.
 */
function esc(s: string): string {
  // Encodage WinAnsi : on remplace les caractères hors Latin-1 par des équivalents.
  return s
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\xff]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrap(line: string, max = 95): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of line.split(' ')) {
    if ((cur + ' ' + w).trim().length > max) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  out.push(cur);
  return out;
}

export function renderPdf(title: string, lines: string[]): Buffer {
  const all = [title, '', ...lines].flatMap((l) => wrap(l));
  const perPage = 50;
  const pages: string[][] = [];
  for (let i = 0; i < all.length; i += perPage) pages.push(all.slice(i, i + perPage));
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) - 1 + 1; // numéro d'objet (1-based)
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('PAGES_PLACEHOLDER');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const [pi, page] of pages.entries()) {
    const content = ['BT', '/F1 10 Tf', '14 TL', '50 800 Td', ...page.map((l, i) => `${i === 0 && pi === 0 ? '/F1 14 Tf ' : i === 1 && pi === 0 ? '/F1 10 Tf ' : ''}(${esc(l)}) Tj T*`), 'ET'].join('\n');
    const len = Buffer.byteLength(content, 'latin1');
    const contentId = add(`<< /Length ${len} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`));
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
