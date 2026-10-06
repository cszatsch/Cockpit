/**
 * PDF minimal écrit à la main (police Helvetica, codage WinAnsi) : texte page par page, lignes coupées à la largeur.
 * Variantes : `protected` (dictionnaire de chiffrement : pdf.js demande un mot de passe), `scanned` (pages sans texte,
 * seulement des formes). Sert aux tests du préremplissage et à l'exemple ORION (`scripts/prefill-exemple.ts`).
 */
const WIN: Record<string, number> = { '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '–': 0x96, '—': 0x97, '…': 0x85, '€': 0x80, 'œ': 0x9c, 'Œ': 0x8c, '•': 0x95, ' ': 0xa0 };
function encode(s: string): string {
  let out = '';
  for (const ch of s) {
    let code = WIN[ch] ?? ch.charCodeAt(0);
    if (code > 255) code = 0x3f;
    const c = String.fromCharCode(code);
    out += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c;
  }
  return out;
}
function wrap(line: string, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of line.split(' ')) {
    if ((cur + ' ' + w).trim().length > width) { out.push(cur.trim()); cur = w; } else cur += ' ' + w;
  }
  out.push(cur.trim());
  return out;
}

export function makeTextPdf(pages: string[][], opts: { protected?: boolean; scanned?: boolean } = {}): Buffer {
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('PAGES');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const page of pages) {
    let stream: string;
    if (opts.scanned) {
      stream = '0.85 g 50 80 495 680 re f 0.6 g 80 600 300 20 re f 80 560 420 12 re f 80 540 400 12 re f\n';
    } else {
      const lines: Array<{ t: string; bold: boolean }> = [];
      page.forEach((l, i) => {
        const bold = i === 0 || l.startsWith('# ');
        for (const w of wrap(l.replace(/^# /, ''), bold ? 70 : 95)) lines.push({ t: w, bold });
      });
      let y = 790;
      stream = 'BT\n';
      for (const l of lines) {
        stream += `/${l.bold ? 'F2' : 'F1'} ${l.bold ? 13 : 10} Tf 1 0 0 1 50 ${y} Tm (${encode(l.t)}) Tj\n`;
        y -= l.bold ? 20 : 14;
        if (y < 40) break;
      }
      stream += 'ET\n';
    }
    const content = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const hex = (n: number, b = 'ab') => '<' + b.repeat(n) + '>';
  const encrypt = opts.protected ? add(`<< /Filter /Standard /V 5 /R 6 /Length 256 /P -1028 /O ${hex(48)} /U ${hex(48, 'cd')} /OE ${hex(32)} /UE ${hex(32, 'cd')} /Perms ${hex(16)} /CF << /StdCF << /CFM /AESV3 /AuthEvent /DocOpen /Length 32 >> >> /StmF /StdCF /StrF /StdCF >>`) : 0;
  let out = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R${encrypt ? ` /Encrypt ${encrypt} 0 R /ID [<0123456789abcdef0123456789abcdef> <0123456789abcdef0123456789abcdef>]` : ''} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
