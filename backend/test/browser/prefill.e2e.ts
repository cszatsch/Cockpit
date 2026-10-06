/// <reference lib="dom" />
/**
 * Recette navigateur du préremplissage (07/10/2026, maquette « Initialisation projet v2 ») : critère 7 (filtres par
 * type et par tuile de la liste « À vérifier »), compteurs de l'écran = liste du serveur (critère 6), annulation
 * (critère 5), erreur de format sans appel au serveur (critère 2).
 *
 * Prérequis : serveur de recette lancé (modèle d'IA simulé, base de test) :
 *   DATABASE_URL_TEST=… npx ts-node --transpile-only test/browser/prefill-server.ts
 *   npx ts-node --transpile-only test/browser/prefill.e2e.ts
 */
import { chromium, Page } from 'playwright';
import { newPage } from './harness';
import { makeTextPdf } from '../fixtures/pdf';
import { ORION_PAGES } from '../../scripts/prefill-exemple';

const URL = (process.env.PREFILL_URL || 'http://localhost:3302') + '/Console%20Admin.dc.html?as=u1';
const results: Array<{ step: string; ok: boolean }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };

const head = (page: Page) => page.evaluate(() => {
  const x = (document.querySelector('[data-screen-label="Initialisation d’un projet"]') as HTMLElement).innerText.split('\n').filter(Boolean);
  const i = x.findIndex((y) => /^(PRÉREMPLISSAGE|PRÊT|IMPORT|ANALYSE|TERMINÉ|ERREUR)/.test(y));
  return x.slice(i, i + 3).join(' | ');
});
const review = (page: Page) => page.evaluate(() => {
  const sec = document.querySelector('section[aria-label="Champs à vérifier"]') as HTMLElement;
  const rows = Array.from(sec.querySelectorAll(':scope > div')).filter((d) => (d as HTMLElement).style.padding.startsWith('14px') && (d as HTMLElement).style.gridTemplateColumns) as HTMLElement[];
  return { count: sec.innerText.split('\n')[1], rows: rows.map((r) => ({ tab: r.innerText.split('\n')[0], missing: r.innerText.includes('Non trouvé') })) };
});
const click = (page: Page, text: string) => page.evaluate((t) => (Array.from(document.querySelectorAll('button')).find((b) => b.innerText.replace(/\s+/g, ' ').trim().startsWith(t)) as HTMLElement).click(), text);

async function main() {
  let browser;
  try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: 'chrome' }); }
  const errors: string[] = [];
  const page = await newPage(browser, { errors });
  await page.goto(URL);
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find((e) => e.children.length === 0 && e.textContent!.trim() === 'Initialisation d’un projet') as HTMLElement;
    el.click();
  });
  await page.waitForSelector('[data-screen-label="Initialisation d’un projet"]');
  await page.waitForTimeout(800);
  check('état initial : 14 onglets et leur nombre de champs', (await head(page)).startsWith('PRÉREMPLISSAGE PAR IA') && (await page.locator('[role=listitem]').count()) === 14);

  // Critère 2 : format refusé dans l'écran, sans appel au serveur.
  let posted = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/prefill/proposals')) posted++; });
  await page.setInputFiles('input[type=file]', { name: 'Budget ORION.numbers', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await page.waitForTimeout(300);
  check('critère 2 : .numbers → ERREUR · FORMAT, sans appel au serveur', (await head(page)).startsWith('ERREUR · FORMAT') && posted === 0);

  // Plusieurs fichiers choisis d'un coup (proposition et annexe) : un seul dépôt, analysé comme un seul document.
  await page.setInputFiles('input[type=file]', [
    { name: 'Proposition.pdf', mimeType: 'application/pdf', buffer: makeTextPdf(ORION_PAGES.slice(0, 4)) },
    { name: 'Annexe planning.pdf', mimeType: 'application/pdf', buffer: makeTextPdf(ORION_PAGES.slice(4)) },
  ]);
  await page.waitForFunction(() => /TERMINÉ/.test(document.body.innerText), null, { timeout: 60_000 });
  const multi = await page.evaluate(() => (document.querySelector('[data-screen-label="Initialisation d’un projet"]') as HTMLElement).innerText);
  check('plusieurs fichiers : un seul dépôt (« Proposition.pdf + 1 fichier », 8 pages)', multi.includes('Proposition.pdf + 1 fichier') && multi.includes(`${ORION_PAGES.length} pages`));
  await click(page, 'Analyser une autre proposition');

  // Exemple ORION jusqu'au résultat.
  await click(page, 'Essayer avec l’exemple ORION');
  await page.waitForFunction(() => /TERMINÉ/.test(document.body.innerText), null, { timeout: 60_000 });
  const taskChecks = await page.evaluate(async () => {
    const tok = localStorage.getItem('rise-admin-token');
    const list = await (await fetch('/api/admin/projects/prefill/tabs', { headers: { Authorization: 'Bearer ' + tok } })).json();
    return list.length;
  });
  check('14 onglets servis par l’API', taskChecks === 14);

  // Critère 7 : filtres par type et par tuile.
  const all = await review(page);
  const nAll = all.rows.length, nMissing = all.rows.filter((r) => r.missing).length;
  await click(page, 'Incertains');
  const u = await review(page);
  await click(page, 'Manquants');
  const m = await review(page);
  check('critère 7 : « Incertains » et « Manquants » partagent la liste « Tous »', u.rows.length + m.rows.length === nAll && m.rows.length === nMissing && u.rows.every((r) => !r.missing) && m.rows.every((r) => r.missing), `${u.rows.length} + ${m.rows.length} = ${nAll}`);
  await click(page, 'Tous');
  const tiles = await page.locator('[role=listitem]').evaluateAll((bs) => bs.map((b) => ({ text: (b as HTMLElement).innerText, off: (b as HTMLButtonElement).disabled })));
  const target = tiles.findIndex((t) => /à vérifier|non trouvé/.test(t.text));
  await page.locator('[role=listitem]').nth(target).click();
  const byTab = await review(page);
  const n = tiles[target].text.split('\n')[0];
  check('critère 7 : clic sur une tuile → seules les lignes de cet onglet', byTab.rows.length > 0 && byTab.rows.every((r) => r.tab === n) && byTab.count === `${byTab.rows.length} / ${nAll}`, `${n} : ${byTab.count}`);
  check('critère 7 : tuiles sans valeur à vérifier non cliquables', tiles.filter((t) => !/à vérifier|non trouvé/.test(t.text)).every((t) => t.off));
  await page.locator('[role=listitem]').nth(target).click();
  check('critère 7 : second clic sur la tuile → filtre retiré', (await review(page)).rows.length === nAll);

  // Critère 6 (écran) : « N champs demandent votre regard » = lignes de la liste = somme des tuiles.
  const sumTiles = tiles.reduce((a, t) => a + (/(\d+) à vérifier/.exec(t.text) ? +/(\d+) à vérifier/.exec(t.text)![1] : /non trouvé/.test(t.text) ? 1 : 0), 0);
  check('critère 6 : compteurs de l’écran cohérents (titre, liste, tuiles)', (await head(page)).includes(`${nAll} champs demandent votre regard`) && sumTiles === nAll, `${nAll} / ${sumTiles}`);

  // Critère 5 : annulation pendant l'analyse → état initial.
  await click(page, 'Analyser une autre proposition');
  await click(page, 'Essayer avec l’exemple ORION');
  await page.waitForFunction(() => /ANALYSE EN COURS/.test(document.body.innerText), null, { timeout: 20_000 });
  await click(page, 'Annuler');
  await page.waitForTimeout(500);
  check('critère 5 : « Annuler » ramène à l’état initial', (await head(page)).startsWith('PRÉREMPLISSAGE PAR IA'));

  // Polices et ressources externes bloquées par le banc (harness) : « Failed to load resource: net::ERR_FAILED ».
  const real = errors.filter((e) => !/Failed to load resource: net::ERR_FAILED/.test(e));
  check('aucune erreur dans la console', real.length === 0, real.slice(0, 3).join(' · '));
  await browser.close();
  const ko = results.filter((r) => !r.ok).length;
  console.log(ko ? `${ko} échec(s)` : `${results.length} vérifications réussies`);
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
