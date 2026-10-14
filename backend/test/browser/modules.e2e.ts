/// <reference lib="dom" />
/**
 * Recette navigateur de la page Modules de la Console (maquette « Modules - refonte », 15/10/2026) : textes, tuiles de
 * même hauteur et sélecteurs alignés, mise à jour optimiste, retour arrière sur erreur, clavier (roving tabindex),
 * sélection des projets en mode « Par projet », affichage sur téléphone.
 *
 * Usage (application démarrée, AUTH_DEV=true) :
 *   cd backend && npx ts-node --transpile-only test/browser/modules.e2e.ts
 * Variable : CONSOLE_URL (défaut http://localhost:3302, serveur de recette sur la base de test — jamais l'application
 * réelle, dont la base serait modifiée). Le module Budget est remis désactivé à la fin.
 */
import { Page } from 'playwright';
import { newPage, openBrowser } from './harness';

const API = process.env.CONSOLE_URL || 'http://localhost:3302';
const results: Array<{ step: string; ok: boolean; detail?: string }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok, detail }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };

async function openModules(page: Page) {
  await page.goto(`${API}/Console%20Admin.dc.html?as=u1`, { waitUntil: 'load' });
  const menu = page.getByRole('button', { name: /menu/i });
  if (await menu.isVisible().catch(() => false)) await menu.click();
  const head = page.locator('aside button[aria-expanded]', { hasText: 'Plateforme' }).first();
  if ((await head.getAttribute('aria-expanded').catch(() => 'true')) === 'false') await head.click();
  await page.locator('aside').getByText('Modules', { exact: true }).first().click();
  await page.waitForSelector('[data-module-tile]', { timeout: 30000 });
  await page.waitForTimeout(600);
}

/** État d'une tuile : option choisie, pastille, note, tabindex des options. */
const tile = (page: Page, i: number) => page.evaluate((k) => {
  const t = document.querySelectorAll('[data-module-tile]')[k] as HTMLElement;
  const g = t.querySelector('[role=radiogroup]') as HTMLElement;
  return {
    name: t.querySelector('h2')!.textContent,
    checked: t.querySelector('[role=radio][aria-checked=true]')?.textContent,
    pill: (t.querySelector('h2')!.previousElementSibling!.lastElementChild as HTMLElement).innerText.trim(),
    note: (g.nextElementSibling as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
    tabs: Array.from(t.querySelectorAll('[role=radio]')).map((b) => (b as HTMLElement).tabIndex).join(','),
    summary: (document.querySelector('.md-root [role=status]') as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
  };
}, i);

async function main() {
  const browser = await openBrowser();
  const errors: string[] = [];
  try {
    const page = await newPage(browser, { errors });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openModules(page);

    // 1. Textes et mise en page.
    const text = await page.evaluate(() => document.querySelector('.md-root')!.textContent!.replace(/\s+/g, ' '));
    check('1. en-tête : « PLATEFORME », « Modules », sous-titre de la maquette', /PLATEFORME Modules Activez les modules optionnels pour toute la plateforme ou projet par projet\./.test(text));
    const geo = await page.evaluate(() => Array.from(document.querySelectorAll('[data-module-tile]')).map((t) => ({ top: Math.round(t.getBoundingClientRect().top), h: Math.round(t.getBoundingClientRect().height), sel: Math.round(t.querySelector('[role=radiogroup]')!.getBoundingClientRect().top) })));
    const rows = [...new Set(geo.map((g) => g.top))];
    check('   tuiles de même hauteur, sélecteurs alignés par rangée, 2 colonnes', new Set(geo.map((g) => g.h)).size === 1 && rows.every((r) => new Set(geo.filter((g) => g.top === r).map((g) => g.sel)).size === 1) && rows.length === Math.ceil(geo.length / 2), JSON.stringify(geo));

    // 2. Clic : mise à jour immédiate, date du serveur ensuite.
    const before = await tile(page, 0);
    await page.locator('[data-module-tile]').first().getByRole('radio', { name: 'Tous les projets' }).click();
    const now = await tile(page, 0);
    check('2. « Tous les projets » : pastille, note et résumé mis à jour aussitôt', now.checked === 'Tous les projets' && now.pill === 'Actif sur tous les projets' && /^Activé sur tous les projets le (1er|\d+) \S+\. Les nouveaux projets en bénéficient automatiquement\.$/.test(now.note) && now.summary !== before.summary, JSON.stringify(now));
    check('   pas de double point dans la date (« oct.. »)', !/\.\./.test(now.note), now.note);

    // 3. Erreur du serveur : retour à l'état précédent et message.
    let failed = false;
    await page.route(/\/api\/admin\/modules\/[^/]+$/, async (r) => {
      if (r.request().method() === 'PATCH' && !failed) { failed = true; await new Promise((x) => setTimeout(x, 500)); return r.fulfill({ status: 500, json: { code: 'INTERNAL', message: 'Panne simulée du serveur' } }); }
      return r.fallback();
    });
    await page.locator('[data-module-tile]').first().getByRole('radio', { name: 'Désactivé' }).click();
    const during = await tile(page, 0);
    await page.waitForTimeout(1200);
    const after = await tile(page, 0);
    check('3. erreur du serveur : « Désactivé » affiché aussitôt, puis retour à « Tous les projets » et message', during.checked === 'Désactivé' && after.checked === 'Tous les projets' && (await page.getByText('Panne simulée du serveur').count()) > 0, `${during.checked} → ${after.checked}`);
    await page.unroute(/\/api\/admin\/modules\/[^/]+$/);

    // 4. Clavier : flèches en boucle, focus et tabindex suivent l'option choisie.
    await page.locator('[data-module-tile]').first().getByRole('radio', { name: 'Tous les projets' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    const k1 = await tile(page, 0), f1 = await page.evaluate(() => document.activeElement?.textContent);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(500);
    const k2 = await tile(page, 0);
    check('4. clavier : flèche droite depuis « Tous les projets » → « Désactivé » (boucle), focus suivi, roving tabindex', k1.checked === 'Désactivé' && f1 === 'Désactivé' && k1.tabs === '0,-1,-1' && k2.checked === 'Tous les projets' && k2.tabs === '-1,-1,0', `${k1.checked} ${k1.tabs} · ${k2.checked} ${k2.tabs}`);

    // 5. « Par projet » : la sélection des projets s'ouvre ; un projet activé ; Échap la ferme.
    await page.locator('[data-module-tile]').first().getByRole('radio', { name: 'Par projet' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 });
    const sw = dialog.getByRole('switch').first();
    const wasOn = await sw.getAttribute('aria-checked');
    if (wasOn === 'false') await sw.click();
    await page.waitForTimeout(800);
    const pj = await tile(page, 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('5. « Par projet » : sélection des projets ouverte, projet activé, note et bouton « Projets (N) », Échap ferme', pj.pill === 'Actif par projet' && /^Activé projet par projet\. Les nouveaux projets ne l’héritent pas\. Projets \(\d+\)$/.test(pj.note) && !/Projets \(0\)/.test(pj.note) && (await page.getByRole('dialog').count()) === 0, pj.note);

    // 6. Téléphone : une colonne, trois options sur une ligne, pas de défilement horizontal.
    await page.setViewportSize({ width: 375, height: 812 });
    await openModules(page);
    const mob = await page.evaluate(() => {
      const ts = Array.from(document.querySelectorAll('[data-module-tile]'));
      const g = ts[0].querySelector('[role=radiogroup]')!;
      return { cols: new Set(ts.map((t) => Math.round(t.getBoundingClientRect().left))).size, w: Math.round(ts[0].getBoundingClientRect().width), oneLine: new Set(Array.from(g.querySelectorAll('[role=radio]')).map((b) => Math.round(b.getBoundingClientRect().top))).size === 1, hScroll: document.documentElement.scrollWidth > innerWidth };
    });
    check('6. téléphone : une colonne pleine largeur, options sur une ligne, sans défilement horizontal', mob.cols === 1 && mob.w > 300 && mob.oneLine && !mob.hScroll, JSON.stringify(mob));

    // Remise à l'état initial : Budget désactivé.
    await page.locator('[data-module-tile]').first().getByRole('radio', { name: 'Désactivé' }).click();
    await page.waitForTimeout(800);
    check('erreurs JavaScript de la page', errors.length === 0, errors.join(' | '));
  } finally {
    await browser.close();
  }
  const ko = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ko.length} / ${results.length} vérifications réussies`);
  process.exit(ko.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
