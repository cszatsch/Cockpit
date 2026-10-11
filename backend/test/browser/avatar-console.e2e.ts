/// <reference lib="dom" />
/**
 * Recette navigateur (11/10/2026) : la pastille de la Console n'affiche jamais le profil de démonstration (Julien Morel)
 * le temps du chargement ; elle affiche directement le compte connecté (ici u4, administrateur).
 *   npx ts-node --transpile-only test/browser/avatar-console.e2e.ts   (serveur de recette sur 3302, u4 administrateur)
 */
import { chromium } from 'playwright';

const BASE = process.env.CONSOLE_URL || 'http://localhost:3302';
(async () => {
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
  let ko = 0;
  const check = (what: string, ok: boolean, got?: unknown) => { if (!ok) ko++; console.log(ok ? '✔' : '✘', what, ok ? '' : '→ ' + JSON.stringify(got)); };
  await p.addInitScript(() => {
    (window as any).__demoSeen = false;
    // Barre latérale seulement : Julien Morel est aussi un vrai compte de la base de test (journal, liste des comptes).
    new MutationObserver(() => { const sb = document.querySelector('aside, nav'); if (sb && /Julien Morel/.test((sb as HTMLElement).innerText)) (window as any).__demoSeen = true; })
      .observe(document, { subtree: true, childList: true, characterData: true });
  });
  await p.goto(`${BASE}/Console%20Admin.dc.html?as=u4`);
  await p.waitForFunction(() => /Philippe Aubert/.test((document.querySelector('aside, nav') as HTMLElement | null)?.innerText || ''), null, { timeout: 60000 });
  await p.waitForTimeout(1000);
  check('compte connecté affiché (u4, Philippe Aubert)', true);
  check('profil de démonstration (Julien Morel) jamais affiché pendant le chargement', !(await p.evaluate(() => (window as any).__demoSeen)));
  await b.close();
  console.log(ko ? `${ko} échec(s)` : 'Recette réussie');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
