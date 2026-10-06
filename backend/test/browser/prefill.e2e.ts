/// <reference lib="dom" />
/**
 * Recette navigateur de l'écran unique « Initialisation d'un projet » (07/10/2026, maquette « Initialisation projet
 * v3 ») : critère 7 (le glisser-déposer allume la voie du type de fichier), voie Excel (liste « À corriger » avec les
 * cellules, filtres, prévisualisation et retour), voie proposition (plusieurs fichiers, liste « À vérifier » et ses
 * filtres, « Déposer l'Excel vérifié » sur la même zone), erreur de format sans appel au serveur, annulation et
 * réinitialisation.
 *
 * Prérequis : serveur de recette lancé (modèle d'IA simulé, base de test) :
 *   DATABASE_URL_TEST=… npx ts-node --transpile-only test/browser/prefill-server.ts
 *   npx ts-node --transpile-only test/browser/prefill.e2e.ts
 */
import { chromium, Page } from 'playwright';
import { newPage } from './harness';
import { buildWorkbook, validAtlas } from '../fixtures/excel';
import { makeTextPdf } from '../fixtures/pdf';
import { ORION_PAGES } from '../../scripts/prefill-exemple';

const URL = (process.env.PREFILL_URL || 'http://localhost:3302') + '/Console%20Admin.dc.html?as=u1';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const results: Array<{ step: string; ok: boolean }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };

const SCREEN = '[data-screen-label="Initialisation d’un projet"]';
/** Sur-titre, titre et sous-titre de la zone de dépôt. */
const head = (page: Page) => page.evaluate(() => {
  const s = document.querySelector('section[aria-label="Dépôt"]') as HTMLElement;
  return [s.querySelector('div > div > div')!.textContent!.trim(), s.querySelector('h2')!.textContent!.trim()].join(' | ');
});
/** Liste « À vérifier » ou « À corriger » : compteur et lignes (onglet, valeur, colonne 4, colonne 5). */
const review = (page: Page, title: string) => page.evaluate((t) => {
  const sec = document.querySelector(`section[aria-label="${t}"]`) as HTMLElement | null;
  if (!sec) return null;
  const rows = Array.from(sec.querySelectorAll(':scope > div')).filter((d) => (d as HTMLElement).style.padding.startsWith('14px') && (d as HTMLElement).style.gridTemplateColumns) as HTMLElement[];
  return { count: sec.querySelector('div > div > div > span + span')!.textContent!.trim(), rows: rows.map((r) => { const c = Array.from(r.children) as HTMLElement[]; return { tab: c[0].innerText.split('\n')[0], v: c[2].innerText, k: c[3].innerText.trim(), src: c[4].innerText.trim() }; }) };
}, title);
const click = (page: Page, text: string) => page.evaluate((t) => (Array.from(document.querySelectorAll('button')).find((b) => b.innerText.replace(/\s+/g, ' ').trim().startsWith(t)) as HTMLElement).click(), text);
/** Glisser un fichier du type donné au-dessus de la zone (événements du navigateur, `dataTransfer.items[0].type`). */
const dragOver = (page: Page, name: string, type: string) => page.evaluate(([n, ty]) => {
  const dt = new DataTransfer();
  dt.items.add(new File(['x'], n, { type: ty }));
  document.querySelector('section[aria-label="Dépôt"]')!.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
}, [name, type]);
const dragLeave = (page: Page) => page.evaluate(() => document.querySelector('section[aria-label="Dépôt"]')!.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body })));
/** Voies : fond et opacité de « Proposition commerciale » et « Excel d'initialisation rempli ». */
const lanes = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('section[aria-label="Dépôt"] [style*="padding: 14px 16px"]')).slice(0, 2).map((l) => ({ on: (l as HTMLElement).style.boxShadow.includes('rgb(61, 214, 198)'), dim: (l as HTMLElement).style.opacity === '0.3' })));
/** Étape active du parcours. */
const step = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('ol[aria-label="Parcours"] li')).map((li) => ({ l: (li as HTMLElement).innerText.replace(/\s+/g, ' ').trim(), on: (li.children[1] as HTMLElement).style.background.includes('rgb(16, 35, 58)'), op: (li.children[1] as HTMLElement).style.opacity })));
const until = (page: Page, re: RegExp, timeout = 60_000) => page.waitForFunction((s) => new RegExp(s).test((document.querySelector('section[aria-label="Dépôt"] h2') as HTMLElement)?.textContent || ''), re.source, { timeout });

async function main() {
  let browser;
  try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: 'chrome' }); }
  const errors: string[] = [];
  const page = await newPage(browser, { errors });
  await page.goto(URL);
  await page.waitForTimeout(2500);
  await page.evaluate(() => (Array.from(document.querySelectorAll('*')).find((e) => e.children.length === 0 && e.textContent!.trim() === 'Initialisation d’un projet') as HTMLElement).click());
  await page.waitForSelector('section[aria-label="Dépôt"]');
  await page.waitForTimeout(1200);
  check('état initial : détection automatique, deux voies, 14 onglets, modèle vierge', (await head(page)).startsWith('DÉTECTION AUTOMATIQUE | Déposez votre fichier.') && (await page.locator('[role=listitem]').count()) === 14 && (await lanes(page)).length === 2 && (await page.locator('button', { hasText: 'Modèle Excel vierge' }).count()) === 1);
  const tiles0 = await page.locator('[role=listitem]').evaluateAll((bs) => bs.map((b) => (b as HTMLElement).innerText.split('\n').pop()));
  check('nombre de champs fixes par onglet', tiles0.join(',') === '2 champs,2 champs,5 champs,4 champs,14 champs,3 champs,6 champs,7 champs,7 champs,8 champs,6 champs,3 champs,8 champs,6 champs');

  // Critère 7 : la voie du type de fichier s'allume, l'autre s'estompe, le titre change.
  await dragOver(page, 'Référentiel.xlsx', XLSX);
  await page.waitForTimeout(200);
  const lx = await lanes(page), sx = await step(page);
  check('critère 7 : Excel survolé → voie Excel allumée, proposition estompée, « Importer » actif', (await head(page)).startsWith('EXCEL DÉTECTÉ | Relâchez pour contrôler.') && lx[1].on && lx[0].dim && !lx[0].on && sx[1].on);
  await dragOver(page, 'Proposition.pdf', 'application/pdf');
  await page.waitForTimeout(200);
  const lp = await lanes(page), sp = await step(page);
  check('critère 7 : PDF survolé → voie proposition allumée, Excel estompée, « Préremplir » actif', (await head(page)).startsWith('PROPOSITION DÉTECTÉE | Relâchez pour préremplir.') && lp[0].on && lp[1].dim && sp[0].on);
  await dragLeave(page);
  await page.waitForTimeout(200);
  check('critère 7 : le fichier quitte la zone → état initial', (await head(page)).startsWith('DÉTECTION AUTOMATIQUE'));

  // Critère 4 : format refusé dans l'écran, sans appel au serveur.
  let posted = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/projects/init/files')) posted++; });
  await page.setInputFiles('input[type=file]', { name: 'Budget ORION.numbers', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await page.waitForTimeout(300);
  check('critère 4 : .numbers → ERREUR · FORMAT, sans appel au serveur', (await head(page)).startsWith('ERREUR · FORMAT') && posted === 0);

  // Critère 3 : Excel avec anomalies, déposé par glisser-déposer → « À corriger » avec les cellules ; Préremplir sautée.
  const ko = validAtlas('VEGA');
  ko.rows['03 Personnes'][2].Équipe = 'Data & IA';
  const koBuf = await buildWorkbook(ko);
  await page.evaluate(([b64, type]) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), dt = new DataTransfer();
    dt.items.add(new File([bin], 'Référentiel VEGA.xlsx', { type }));
    const s = document.querySelector('section[aria-label="Dépôt"]')!;
    s.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    s.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [koBuf.toString('base64'), XLSX]);
  await until(page, /anomalies? bloquantes?\./);
  const st = await step(page);
  const k = await review(page, 'À corriger');
  check('critère 3 : « À corriger » avec la cellule exacte (D11), gravité « Bloquant »', !!k && k.rows.some((r) => r.v === 'Data & IA' && r.src === 'D11' && r.k === 'Bloquant'), JSON.stringify(k?.rows.slice(0, 2)));
  check('voie Excel : « Préremplir » grisée, « Contrôler » actif', st[0].op === '0.45' && st[2].on);
  check('critère 3 : prévisualisation bloquée (aucun bouton « Prévisualiser »)', (await page.locator('button', { hasText: 'Prévisualiser le référentiel' }).count()) === 0);
  await click(page, 'Avertissements');
  const kw = await review(page, 'À corriger');
  await click(page, 'Bloquantes');
  const kb = await review(page, 'À corriger');
  check('filtre par gravité : « Bloquantes » + « Avertissements » = « Toutes »', !!kw && !!kb && kw.rows.every((r) => r.k === 'Avertissement') && kb.rows.every((r) => r.k === 'Bloquant') && kw.rows.length + kb.rows.length === k!.rows.length);
  await click(page, 'Toutes');
  const tiles = await page.locator('[role=listitem]').evaluateAll((bs) => bs.map((b) => ({ text: (b as HTMLElement).innerText, off: (b as HTMLButtonElement).disabled })));
  const target = tiles.findIndex((t) => /anomalie/.test(t.text));
  await page.locator('[role=listitem]').nth(target).click();
  const byTab = await review(page, 'À corriger');
  check('filtre par onglet : clic sur la tuile « 03 Personnes »', !!byTab && byTab.rows.length > 0 && byTab.rows.every((r) => r.tab === '03') && byTab.count === `${byTab.rows.length} / ${k!.rows.length}`);
  await page.locator('[role=listitem]').nth(target).click();
  const dl = page.waitForEvent('download');
  await click(page, 'Télécharger le rapport');
  check('rapport de contrôle téléchargé', (await dl).suggestedFilename() === 'Référentiel VEGA · rapport de contrôle.xlsx');

  // Critère 2 : Excel conforme → « Fichier conforme » → prévisualisation (étape existante), puis retour.
  await page.setInputFiles('input[type=file]', { name: 'Référentiel ORION.xlsx', mimeType: XLSX, buffer: await buildWorkbook(validAtlas('ORION')) });
  await until(page, /Fichier conforme\./);
  const w = await review(page, 'À corriger');
  check('critère 2 : XLSX conforme → « Fichier conforme. » ; avertissements listés sans bloquer', !!w && w.rows.length > 0 && w.rows.every((r) => r.k === 'Avertissement'), `${w?.rows.length} avertissement(s)`);
  await click(page, 'Prévisualiser le référentiel');
  await page.waitForFunction(() => /Valider l’importation/.test(document.body.innerText), null, { timeout: 20_000 });
  const pv = await page.evaluate(() => document.body.innerText);
  check('critère 2 : « Prévisualiser le référentiel » mène à l’étape existante (projet ORION)', /ORION/.test(pv));
  await click(page, 'Contrôle');
  await page.waitForTimeout(500);
  check('retour au contrôle : l’écran unique est intact (« Fichier conforme. »)', (await head(page)).endsWith('Fichier conforme.'));

  // Voie proposition : plusieurs fichiers d'un coup, analysés comme un seul document.
  await page.setInputFiles('input[type=file]', [
    { name: 'Proposition.pdf', mimeType: 'application/pdf', buffer: makeTextPdf(ORION_PAGES.slice(0, 4)) },
    { name: 'Annexe planning.pdf', mimeType: 'application/pdf', buffer: makeTextPdf(ORION_PAGES.slice(4)) },
  ]);
  await until(page, /demandent votre regard|sont remplis/);
  const multi = await page.evaluate((s) => (document.querySelector(s) as HTMLElement).innerText, SCREEN);
  check('plusieurs fichiers : un seul dépôt (« Proposition.pdf + 1 fichier », 8 pages)', multi.includes('Proposition.pdf + 1 fichier') && multi.includes(`${ORION_PAGES.length} pages`));
  const all = await review(page, 'À vérifier');
  await click(page, 'Incertains');
  const u = await review(page, 'À vérifier');
  await click(page, 'Manquants');
  const m = await review(page, 'À vérifier');
  check('« Incertains » et « Manquants » partagent la liste « Tous »', !!all && !!u && !!m && u.rows.length + m.rows.length === all.rows.length && m.rows.every((r) => r.k === 'Non trouvé'));
  await click(page, 'Tous');
  check('compteur du titre = lignes de la liste', (await head(page)).includes(`${all!.rows.length} champs demandent votre regard`));
  const chooser = page.waitForEvent('filechooser');
  await click(page, 'Déposer l’Excel vérifié');
  check('« Déposer l’Excel vérifié » ouvre le sélecteur de la même zone', !!(await chooser));

  // Réinitialisation (icône de la ligne du fichier) → état initial.
  await page.locator('[aria-label="Réinitialiser"]').click();
  await page.waitForTimeout(300);
  check('réinitialisation → état initial', (await head(page)).startsWith('DÉTECTION AUTOMATIQUE'));

  // Critère 9 : annulation pendant l'analyse → état initial.
  await page.setInputFiles('input[type=file]', { name: 'Proposition.pdf', mimeType: 'application/pdf', buffer: makeTextPdf(ORION_PAGES) });
  await page.waitForFunction(() => /ANALYSE EN COURS/.test(document.body.innerText), null, { timeout: 20_000 });
  await click(page, 'Annuler');
  await page.waitForTimeout(500);
  check('critère 9 : « Annuler » ramène à l’état initial', (await head(page)).startsWith('DÉTECTION AUTOMATIQUE'));

  // Polices et ressources externes bloquées par le banc (harness) : « Failed to load resource: net::ERR_FAILED ».
  const real = errors.filter((e) => !/Failed to load resource: net::ERR_FAILED/.test(e));
  check('aucune erreur dans la console', real.length === 0, real.slice(0, 3).join(' · '));
  await browser.close();
  const ko2 = results.filter((r) => !r.ok).length;
  console.log(ko2 ? `${ko2} échec(s)` : `${results.length} vérifications réussies`);
  process.exit(ko2 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
