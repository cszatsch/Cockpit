/**
 * Guides utilisateur en PDF (08/10/2026) : `docs/GUIDE UTILISATEUR - Cockpit.md` et `… - Console.md` → PDF prêts à
 * déposer dans Console › Plateforme › Guide utilisateur. Markdown → HTML (convertisseur minimal ci-dessous : titres,
 * paragraphes, listes imbriquées, tableaux, citations, gras, italique, code) → PDF par Chromium (Playwright, déjà
 * utilisé par les tests navigateur). Les titres gardent une taille décroissante nette (H1 > H2 > H3 > texte) : c'est
 * d'après la taille de police que l'indexation du guide (`src/domain/guide-index.ts`) retrouve les sections.
 *
 * Usage : `npm run guides:pdf` (les deux guides) ou `npm run guides:pdf -- cockpit` / `console`.
 */
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

const ROOT = join(__dirname, '..', '..');
const GUIDES = {
  cockpit: { md: 'GUIDE UTILISATEUR - Cockpit.md', pdf: 'Guide utilisateur du Cockpit RISE.pdf', title: 'Guide utilisateur du Cockpit RISE' },
  console: { md: 'GUIDE UTILISATEUR - Console.md', pdf: "Guide utilisateur de la Console d'administration RISE.pdf", title: "Guide utilisateur de la Console d'administration RISE" },
} as const;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Mise en forme d'une ligne : code, gras, italique, liens (texte seul). */
function inline(s: string): string {
  const codes: string[] = [];
  let t = s.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(esc(c)) - 1}\u0000`);
  t = esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

/** Markdown → HTML (sous-ensemble utilisé par les guides). */
export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  const isList = (l: string) => /^\s*([-*]|\d+\.)\s+/.test(l);
  const isTable = (l: string) => /^\s*\|/.test(l);
  const isBlockStart = (l: string) => /^#{1,6}\s/.test(l) || isList(l) || isTable(l) || /^>/.test(l) || /^\s*(---|\*\*\*)\s*$/.test(l);
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2].trim())}</h${n}>`); i++; continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (isTable(l)) {
      const rows: string[][] = [];
      while (i < lines.length && isTable(lines[i])) { rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())); i++; }
      const sep = rows.length > 1 && rows[1].every((c) => /^:?-{2,}:?$/.test(c));
      const head = sep ? rows[0] : null, body = sep ? rows.slice(2) : rows;
      out.push('<table>' + (head ? `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '') + `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^>/.test(l)) {
      const q: string[] = [];
      while (i < lines.length && /^>/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push(`<blockquote>${markdownToHtml(q.join('\n'))}</blockquote>`);
      continue;
    }
    if (isList(l)) {
      // Liste, imbriquée par l'indentation (2 espaces ou plus par niveau).
      const items: Array<{ indent: number; ordered: boolean; text: string }> = [];
      while (i < lines.length && (isList(lines[i]) || (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m) items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
        else items[items.length - 1].text += ' ' + lines[i].trim();
        i++;
      }
      const render = (from: number, to: number): string => {
        const base = items[from].indent, tag = items[from].ordered ? 'ol' : 'ul';
        let html = `<${tag}>`, k = from;
        while (k < to) {
          let j = k + 1;
          while (j < to && items[j].indent > base) j++;
          html += `<li>${inline(items[k].text)}${j > k + 1 ? render(k + 1, j) : ''}</li>`;
          k = j;
        }
        return html + `</${tag}>`;
      };
      out.push(render(0, items.length));
      continue;
    }
    const p: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { p.push(lines[i].trim()); i++; }
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}

const CSS = `
@page { size: A4; margin: 18mm 16mm 20mm 16mm; }
body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #10233a; }
h1 { font-size: 22pt; margin: 0 0 10pt; padding-top: 4pt; color: #0f5f5a; page-break-before: always; page-break-after: avoid; }
h1:first-of-type { page-break-before: auto; font-size: 26pt; }
h2 { font-size: 16pt; margin: 18pt 0 6pt; color: #10233a; page-break-after: avoid; }
h3 { font-size: 13pt; margin: 14pt 0 4pt; color: #1d8f86; page-break-after: avoid; }
h4, h5, h6 { font-size: 11.5pt; margin: 10pt 0 3pt; page-break-after: avoid; }
p { margin: 0 0 6pt; }
ul, ol { margin: 0 0 6pt 16pt; padding: 0; }
li { margin: 0 0 2pt; }
table { border-collapse: collapse; width: 100%; margin: 4pt 0 10pt; font-size: 9.5pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 0.6pt solid #cfdcd9; padding: 3pt 5pt; text-align: left; vertical-align: top; }
th { background: #e6f3f2; font-weight: 700; }
blockquote { margin: 6pt 0 10pt; padding: 4pt 10pt; border-left: 3pt solid #1d8f86; background: #f3f8f7; }
blockquote p { margin: 2pt 0; }
code { font-family: Consolas, monospace; font-size: 9pt; background: #eef3f2; padding: 0 2pt; border-radius: 2pt; }
hr { border: 0; border-top: 0.6pt solid #cfdcd9; margin: 10pt 0; }
`;

async function main() {
  const which = (process.argv[2] ?? 'all') as 'all' | keyof typeof GUIDES;
  const list = which === 'all' ? (Object.keys(GUIDES) as Array<keyof typeof GUIDES>) : [which];
  const out = join(ROOT, 'docs', 'guides');
  mkdirSync(out, { recursive: true });
  // Chromium de Playwright, sinon Chrome installé (comme les tests navigateur).
  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  try {
    for (const k of list) {
      const g = GUIDES[k];
      if (!g) throw new Error(`Guide inconnu : ${k} (cockpit ou console)`);
      const md = readFileSync(join(ROOT, 'docs', g.md), 'utf8');
      const version = /Version du ([^.]+)\./.exec(md)?.[1] ?? '';
      const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(g.title)}</title><style>${CSS}</style></head><body>${markdownToHtml(md)}</body></html>`;
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const file = join(out, g.pdf);
      await page.pdf({
        path: file, format: 'A4', printBackground: true, displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;font-size:8px;color:#8a9aa6;padding:0 16mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial"><span>${esc(g.title)}${version ? ` · version du ${esc(version)}` : ''}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
      });
      await page.close();
      console.log(`Écrit : docs/guides/${g.pdf}`);
    }
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });
