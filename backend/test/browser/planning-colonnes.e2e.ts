/// <reference lib="dom" />
/**
 * Recette navigateur (10/10/2026) : dans Pilotage › Planning, l'ordre des colonnes du « Suivi d'avancement » suit le niveau
 * choisi — Phase > Chantier > Sous-phase (et Phase > Chantier) : Phase, Chantier, Sous-phase ; sinon Phase, Sous-phase, Chantier.
 *   npx ts-node --transpile-only test/browser/planning-colonnes.e2e.ts   (serveur de recette sur 3302)
 */
import { chromium, Page } from 'playwright';
(async () => {
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  let ko = 0;
  const check = (what: string, ok: boolean, got?: unknown) => { if (!ok) ko++; console.log(ok ? '✔' : '✘', what, ok ? '' : '→ ' + JSON.stringify(got)); };
  await p.goto('http://localhost:3302/RISE%20Cockpit.dc.html?as=p01&project=RISE');
  await p.waitForTimeout(6000);
  await p.evaluate(() => (Array.from(document.querySelectorAll('aside *')).find((e) => (e as HTMLElement).innerText?.trim() === 'Pilotage' && (e as HTMLElement).children.length <= 2) as HTMLElement)?.click());
  await p.waitForTimeout(1500);
  await p.getByText('Planning', { exact: true }).first().click();
  await p.waitForTimeout(1500);
  /** En-têtes et première ligne de chantier du Suivi d'avancement. */
  const read = (pg: Page) => pg.evaluate(() => {
    const head = document.querySelector('[data-suivi-head]') as HTMLElement;
    const heads = Array.from(head.children).slice(0, 3).map((c) => (c as HTMLElement).innerText.trim().toUpperCase());
    const rows = Array.from(document.querySelectorAll('[data-suivi-row]')) as HTMLElement[];
    const cells = rows.map((r) => Array.from(r.children).slice(0, 3).map((c) => (c as HTMLElement).innerText.trim()));
    return { heads, cells };
  });
  const level = async (l: string) => { await p.getByText(l, { exact: true }).first().click(); await p.waitForTimeout(1200); return read(p); };

  const a = await level('Phase > Chantier > Sous-phase');
  check('Phase > Chantier > Sous-phase : colonnes Phase, Chantier, Sous-phase', a.heads.join('|') === 'PHASE|CHANTIER|SOUS-PHASE', a.heads);
  // Jeu RISE de démonstration : chantiers sans sous-phase ; une sous-phase, s'il y en a, n'a jamais de chantier en 2e colonne.
  const empty = (x: string) => !x || x === '—';
  const ws = a.cells.filter((c) => !empty(c[1]) && empty(c[2])), sp = a.cells.filter((c) => !empty(c[2]));
  check('… chantiers dans la 2e colonne, sous-phases dans la 3e', ws.length > 0 && sp.every((c) => empty(c[1])), a.cells.slice(0, 6));
  await p.screenshot({ path: process.env.SHOT || 'planning-colonnes.png' });
  const c = await level('Phase > Chantier');
  check('Phase > Chantier : colonnes Phase, Chantier, Sous-phase', c.heads.join('|') === 'PHASE|CHANTIER|SOUS-PHASE', c.heads);
  const s = await level('Phase > Sous-phase');
  check('Phase > Sous-phase : ordre d’origine (Phase, Sous-phase, Chantier)', s.heads.join('|') === 'PHASE|SOUS-PHASE|CHANTIER', s.heads);
  const t = await level('Tous les chantiers');
  check('Tous les chantiers : ordre d’origine', t.heads.join('|') === 'PHASE|SOUS-PHASE|CHANTIER', t.heads);
  check('aucune erreur de page', errs.length === 0, errs);
  await b.close();
  console.log(ko ? `${ko} échec(s)` : 'Recette réussie');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
