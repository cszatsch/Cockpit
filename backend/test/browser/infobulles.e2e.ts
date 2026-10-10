/// <reference lib="dom" />
/**
 * Recette navigateur « aucune infobulle » (demande du commanditaire, 10/10/2026) : dans le Cockpit (chaque page, chaque onglet,
 * barre de Jev, « Saisir sans Jev ») et dans la Console (chaque page de la barre latérale), aucun attribut `title`, aucun texte
 * de <title> SVG, aucune infobulle affichée au survol ; les boutons à icône gardent un nom accessible.
 *   npx ts-node --transpile-only test/browser/infobulles.e2e.ts   (serveur de recette sur 3302)
 */
import { chromium, Page } from 'playwright';
const BASE = 'http://localhost:3302';
(async () => {
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  let ko = 0, seen = 0;
  const check = (what: string, ok: boolean, got?: unknown) => { if (!ok) ko++; console.log(ok ? '✔' : '✘', what, ok ? '' : '→ ' + JSON.stringify(got).slice(0, 400)); };
  const wait = (p: Page, ms = 300) => p.waitForTimeout(ms);
  // Titres restants, textes de <title> SVG, infobulles visibles, boutons sans nom.
  const audit = (p: Page) => p.evaluate(() => {
    const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0'; };
    return {
      titles: Array.from(document.querySelectorAll('body [title]')).map((e) => e.tagName + ':' + e.getAttribute('title')).slice(0, 5),
      svgTitles: Array.from(document.querySelectorAll('svg title')).filter((t) => (t.textContent || '').trim()).map((t) => t.textContent).slice(0, 5),
      tooltips: Array.from(document.querySelectorAll('[role="tooltip"]')).filter(vis).map((e) => (e.textContent || '').slice(0, 60)),
      unnamed: Array.from(document.querySelectorAll('button')).filter((x) => vis(x) && !(x.textContent || '').trim() && !x.getAttribute('aria-label') && !x.getAttribute('aria-labelledby')).length,
    };
  });
  // Survol de quelques éléments cliquables : aucune infobulle ne doit apparaître.
  const hover = async (p: Page) => {
    const els = await p.$$('button, [role=button], [onclick], a, span[style*="cursor:pointer"], div[style*="cursor:pointer"]');
    for (const e of els.slice(0, 25)) { try { await e.hover({ timeout: 300 }); await wait(p, 60); } catch { /* élément masqué */ } }
    await wait(p, 700);
  };
  const step = async (p: Page, where: string) => {
    await hover(p);
    const a = await audit(p); seen++;
    if (a.titles.length || a.svgTitles.length || a.tooltips.length) check(where + ' : aucune infobulle', false, a);
    return a;
  };

  // ── Cockpit ──
  const p = await b.newPage({ viewport: { width: 1600, height: 950 } });
  const errs: string[] = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`${BASE}/RISE%20Cockpit.dc.html?as=p01&project=RISE&e2e=1`);
  await wait(p, 6000);
  let a = await step(p, 'Cockpit · Aujourd’hui');
  const navs = ['Pilotage', 'Comités et rapports', 'Base de connaissance', 'Info projet', 'Aujourd\'hui'];
  for (const n of navs) {
    await p.evaluate((t) => (Array.from(document.querySelectorAll('aside *')).find((e) => (e as HTMLElement).innerText?.trim() === t && (e as HTMLElement).children.length <= 2) as HTMLElement)?.click(), n);
    await wait(p, 1200);
    a = await step(p, 'Cockpit · ' + n);
  }
  // Onglets du Pilotage.
  for (const tab of ['planning', 'jalons', 'livrables', 'risques', 'actions', 'decisions', 'barometre', 'comites', 'taches']) {
    await p.evaluate((t) => (window as any).__riseCockpit.setState({ space: 'pilotage', tab: t }), tab);
    await wait(p, 900);
    a = await step(p, 'Cockpit · Pilotage › ' + tab);
  }
  await p.evaluate(() => (window as any).__riseCockpit.setState({ assistant: true }));
  await wait(p, 600);
  a = await step(p, 'Cockpit · barre de Jev');
  await p.getByRole('button', { name: 'Saisir sans Jev' }).click();
  await wait(p, 700);
  a = await step(p, 'Cockpit · Saisir sans Jev');
  check('Cockpit : les boutons à icône gardent un nom accessible', a.unnamed === 0, a.unnamed);
  check('Cockpit : aucune erreur de page', !errs.length, errs.slice(0, 2));

  // ── Console ──
  const c = await b.newPage({ viewport: { width: 1600, height: 950 } });
  const cerrs: string[] = []; c.on('pageerror', (e) => cerrs.push(String(e)));
  await c.goto(`${BASE}/Console%20Admin.dc.html?as=u1`);
  await wait(c, 6000);
  await step(c, 'Console · accueil');
  const items = await c.$$eval('nav button, nav [role=button], nav a', (els) => els.map((e) => (e as HTMLElement).innerText.trim()).filter((t) => t && t.length < 40));
  for (const t of [...new Set(items)].slice(0, 30)) {
    await c.evaluate((x) => (Array.from(document.querySelectorAll('nav button, nav [role=button], nav a')).find((e) => (e as HTMLElement).innerText.trim() === x) as HTMLElement)?.click(), t);
    await wait(c, 1200);
    await step(c, 'Console · ' + t);
  }
  const ca = await audit(c);
  check('Console : les boutons à icône gardent un nom accessible', ca.unnamed === 0, ca.unnamed);
  check('Console : aucune erreur de page', !cerrs.length, cerrs.slice(0, 2));

  console.log(`${seen} écrans contrôlés (attribut title, <title> SVG, infobulle au survol)`);
  console.log(ko ? `\n${ko} contrôle(s) en échec` : '\nTous les contrôles passent');
  await b.close();
  process.exit(ko ? 1 : 0);
})();
