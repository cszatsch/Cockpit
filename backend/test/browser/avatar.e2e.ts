/// <reference lib="dom" />
/**
 * Recette navigateur (11/10/2026) : l'avatar du Cockpit n'affiche jamais la personne de démonstration (p01, Robin
 * Lefèvre) le temps du chargement ; il affiche directement le compte connecté (ici p06).
 *   npx ts-node --transpile-only test/browser/avatar.e2e.ts   (serveur de recette sur 3302, base de test)
 */
import { chromium } from 'playwright';

const BASE = process.env.CONSOLE_URL || 'http://localhost:3302';
(async () => {
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  let ko = 0;
  const check = (what: string, ok: boolean, got?: unknown) => { if (!ok) ko++; console.log(ok ? '✔' : '✘', what, ok ? '' : '→ ' + JSON.stringify(got)); };
  // Observateur posé avant le premier affichage : toute apparition de la personne de démonstration est relevée.
  await p.addInitScript(() => {
    (window as any).__demoSeen = false;
    new MutationObserver(() => { if (document.body && /Robin Lef[eè]vre/.test(document.body.innerText)) (window as any).__demoSeen = true; })
      .observe(document, { subtree: true, childList: true, characterData: true });
  });
  await p.goto(`${BASE}/RISE%20Cockpit.dc.html?as=p06&project=RISE&e2e=1`);
  await p.waitForFunction(() => !!(window as any).__riseCockpit?.state.data?.me, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  const me = await p.evaluate(() => (window as any).__riseCockpit.meName());
  check('compte connecté affiché (p06)', me === 'Karim Benali', me);
  check('personne de démonstration jamais affichée pendant le chargement', !(await p.evaluate(() => (window as any).__demoSeen)));
  await b.close();
  console.log(ko ? `${ko} échec(s)` : 'Recette réussie');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
