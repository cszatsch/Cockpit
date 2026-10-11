/// <reference lib="dom" />
/**
 * Recette navigateur (11/10/2026) : Comités et rapports › Créer un template — étape « Composants » : Livrables après Jalons,
 * Fiches d'arbitrage après Décisions ; étape « Ordre et données » : le Planning propose les niveaux de l'écran Planning
 * comme périmètre (plus de pastille « Sous-phases ») et « Un chantier » fait choisir le chantier.
 *   npx ts-node --transpile-only test/browser/composants-rapport.e2e.ts   (serveur de recette sur 3302, base de test)
 */
import { chromium } from 'playwright';

const BASE = process.env.CONSOLE_URL || 'http://localhost:3302';
(async () => {
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  let ko = 0;
  const check = (what: string, ok: boolean, got?: unknown) => { if (!ok) ko++; console.log(ok ? '✔' : '✘', what, ok ? '' : '→ ' + JSON.stringify(got)); };
  await p.goto(`${BASE}/RISE%20Cockpit.dc.html?as=p01&project=RISE&e2e=1`);
  await p.waitForFunction(() => !!(window as any).__riseCockpit && !!(window as any).__riseCockpit._api, null, { timeout: 60000 });
  await p.waitForTimeout(2500);

  // Étape « Composants ».
  await p.evaluate(() => { const c = (window as any).__riseCockpit; c.setState({ space: 'comites', tab: 'creer', tplStep: 3, tplDraft: { ...c.state.tplDraft, name: 'Recette composants', comps: [] } }); });
  await p.waitForTimeout(1200);
  const order = await p.evaluate(() => ['Synthèse de situation', 'Planning', 'Jalons', 'Livrables', 'Risques et problèmes', 'Actions', 'Décisions', 'Fiches d’arbitrage', 'Baromètre du projet'].map((n) => document.body.innerText.indexOf(n)));
  check('Composants : Livrables après Jalons, Fiches d’arbitrage après Décisions', order.every((x, k) => x >= 0 && (k === 0 || x > order[k - 1])), order);
  await p.screenshot({ path: process.env.SHOT || 'composants-rapport.png' });

  // Étape « Ordre et données » avec un Planning.
  await p.evaluate(() => { const c = (window as any).__riseCockpit; c.setState({ tplStep: 4, tplDraft: { ...c.state.tplDraft, comps: [{ id: 'planning', kind: 'Projet', target: '' }] } }); });
  await p.waitForTimeout(1200);
  const sel = p.locator('select').filter({ has: p.locator('option', { hasText: 'Phase > Chantier > Sous-phase' }) }).first();
  const opts = await sel.locator('option').allInnerTexts();
  check('Planning : périmètre = niveaux de l’écran Planning', opts.join('|') === 'Phases|Phase > Sous-phase|Phase > Chantier > Sous-phase|Tous les chantiers|Un chantier', opts);
  check('Planning : plus de pastille « Sous-phases »', (await p.getByText('Sous-phases', { exact: true }).count()) === 0);
  check('Planning : cible « Projet entier » par défaut', (await p.getByText('Projet entier', { exact: true }).count()) > 0);
  await sel.selectOption({ label: 'Un chantier' });
  await p.waitForTimeout(800);
  const st = await p.evaluate(() => (window as any).__riseCockpit.state.tplDraft.comps[0]);
  const cible = p.locator('select').filter({ has: p.locator('option', { hasText: st.target || '§' }) });
  check('Un chantier : niveau « one », périmètre chantier, chantier choisi dans la cible', st.level === 'one' && st.kind === 'Chantier' && !!st.target && (await cible.count()) > 0, st);
  await p.screenshot({ path: (process.env.SHOT || 'composants-rapport.png').replace(/\.png$/, '-planning.png') });
  // « Date du jour » (pastille), période des Livrables, statuts en choix multiple (11/10/2026).
  check('Planning : pastille « Date du jour »', (await p.getByText('Date du jour', { exact: true }).count()) > 0);
  const per = p.locator('select').filter({ has: p.locator('option', { hasText: '60 prochains jours' }) }).first();
  check('Planning : période = 30, 60, 90 prochains jours, sans filtre', (await per.locator('option').allInnerTexts()).join('|') === '30 prochains jours|60 prochains jours|90 prochains jours|Sans filtre de période', await per.locator('option').allInnerTexts());
  const statut = p.locator('[data-statut-row]').first();
  check('Planning : ligne STATUT (Tous les statuts, En cours, À venir, En retard, Terminé)', (await statut.locator('button').allInnerTexts()).join('|') === 'Tous les statuts|En cours|À venir|En retard|Terminé', await statut.locator('button').allInnerTexts());
  await statut.getByRole('button', { name: 'En cours' }).click();
  await statut.getByRole('button', { name: 'En retard' }).click();
  await p.waitForTimeout(400);
  const st3 = await p.evaluate(() => (window as any).__riseCockpit.state.tplDraft.comps[0].statuses);
  check('Statut : choix multiple enregistré (En cours, En retard)', JSON.stringify(st3) === JSON.stringify(['ACTIVE', 'LATE']), st3);
  await statut.getByRole('button', { name: 'Tous les statuts' }).click();
  await p.waitForTimeout(400);
  check('Statut : « Tous les statuts » efface le choix', ((await p.evaluate(() => (window as any).__riseCockpit.state.tplDraft.comps[0].statuses)) || []).length === 0);
  await sel.selectOption({ label: 'Tous les chantiers' });
  await p.waitForTimeout(500);
  const st2 = await p.evaluate(() => (window as any).__riseCockpit.state.tplDraft.comps[0]);
  check('Tous les chantiers : niveau « ch », périmètre projet', st2.level === 'ch' && st2.kind === 'Projet', st2);
  // Livrables : ligne STATUT avec « Livré ».
  await p.evaluate(() => { const c = (window as any).__riseCockpit; c.setState({ tplDraft: { ...c.state.tplDraft, comps: [{ id: 'livrables', kind: 'Projet', target: '' }] } }); });
  await p.waitForTimeout(800);
  check('Livrables : ligne STATUT (… Livré)', (await p.locator('[data-statut-row]').first().locator('button').allInnerTexts()).join('|') === 'Tous les statuts|En cours|À venir|En retard|Livré');
  await p.screenshot({ path: (process.env.SHOT || 'composants-rapport.png').replace(/\.png$/, '-livrables.png') });
  check('aucune erreur de page', errs.length === 0, errs);
  await b.close();
  console.log(ko ? `${ko} échec(s)` : 'Recette réussie');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
