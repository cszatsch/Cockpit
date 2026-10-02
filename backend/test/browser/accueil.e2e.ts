/// <reference lib="dom" />
/**
 * Vérification navigateur du message d'accueil de Jev (écran Aujourd'hui du Cockpit) et de son module dans la Console.
 *
 * Usage (application démarrée, AUTH_DEV=true) :
 *   cd backend && npx ts-node --transpile-only test/browser/accueil.e2e.ts
 * Variable : CONSOLE_URL (défaut http://localhost:3000).
 *
 * Rien n'est généré ni écrit : `GET /today/greeting` est intercepté (message de Jev, puis échec de la route).
 */
import { chromium, Browser, Page } from 'playwright';
import { newPage } from './harness';

const API = process.env.CONSOLE_URL || 'http://localhost:3000';
const JEV = 'Bonsoir Robin, le COPIL du 26 oct. se prépare dès maintenant : 3 risques critiques méritent votre regard.';

const results: Array<{ step: string; ok: boolean; detail?: string }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok, detail }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };

async function launch(): Promise<Browser> {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

/** Message d'accueil affiché : salutation, message, mots en relief, signature (bloc `data-greet`). */
const greet = (page: Page) => page.evaluate(() => {
  const b = document.querySelector('[data-greet]') as HTMLElement | null;
  if (!b) return null;
  const col = b.children[1] as HTMLElement, hi = (col.children[0] as HTMLElement).innerText.trim(), body = (col.children[1] as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
  const hot = [...new Set(Array.from((col.children[1] as HTMLElement).querySelectorAll('span')).filter((x) => getComputedStyle(x).color === 'rgb(255, 213, 138)' && !x.querySelector('span') && x.textContent!.trim()).map((x) => x.textContent!.trim()))];
  return { hi, body, hot, signed: /(^|\n)JEV$/i.test(col.innerText.trim()), top: Math.round((col.children[0] as HTMLElement).getBoundingClientRect().top), bodyTop: Math.round((col.children[1] as HTMLElement).getBoundingClientRect().top) };
});

async function main() {
  const browser = await launch();
  const errors: string[] = [];
  try {
    // 1. Message de Jev reçu : il remplace le message de l'écran.
    // Le jour renvoyé doit être celui de l'écran : celui du serveur (GET /today).
    const day = await (await fetch(`${API}/api/auth/dev-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ personId: 'p01' }) })).json()
      .then((j: any) => fetch(`${API}/api/projects/RISE/today`, { headers: { Authorization: `Bearer ${j.accessToken ?? j.token}` } })).then((r) => r.json()).then((x: any) => x.today as string);
    let page = await newPage(browser, { errors });
    let calls = 0;
    await page.route(/\/api\/projects\/RISE\/today\/greeting$/, (r) => { calls++; return r.fulfill({ json: { text: JEV, source: 'jev', reason: null, day } }); });
    await page.goto(`${API}/RISE%20Cockpit.dc.html?as=p01`, { waitUntil: 'load' });
    await page.waitForFunction((t) => document.body.innerText.includes(t), JEV.slice(0, 40), { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500); // apparition mot à mot
    const g1 = await greet(page);
    check('1. message de Jev : « Bonsoir Robin, » sur sa ligne, puis le message (majuscule)', !!g1 && g1.hi === 'Bonsoir Robin,' && g1.body === 'Le COPIL du 26 oct. se prépare dès maintenant : 3 risques critiques méritent votre regard.' && g1.bodyTop > g1.top, JSON.stringify(g1));
    check('   chiffres et dates en relief, signature « Jev »', !!g1 && ['26', 'oct.', '3'].every((w) => g1.hot.includes(w)) && g1.hot.length === 3 && g1.signed, JSON.stringify(g1?.hot));
    await page.locator('header').screenshot({ path: `${process.env.TEMP || '/tmp'}/accueil-jev.png` });
    await page.waitForTimeout(3000);
    check('   un seul appel à /today/greeting (pas de rechargement en boucle)', calls === 1, `${calls} appel(s)`);
    await page.close();

    // 2. Route en échec : l'écran garde son message par règles (ni « prêt », ni compteur à zéro).
    page = await newPage(browser, { errors });
    await page.route(/\/api\/projects\/RISE\/today\/greeting$/, (r) => r.fulfill({ status: 500, json: { code: 'INTERNAL', message: 'panne simulée' } }));
    await page.goto(`${API}/RISE%20Cockpit.dc.html?as=p01`, { waitUntil: 'load' });
    await page.waitForFunction(() => /Bonjour|Bonsoir|Bonne semaine/.test(document.body.innerText), null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    const g2 = await greet(page);
    check('2. échec de la route : message par règles (salutation sur sa ligne, sans « prêt » ni zéro, non signé)', !!g2 && /^(Bonjour|Bonsoir|Bonne semaine) Robin,$/.test(g2.hi) && !/prêt|^0 | 0 /.test(g2.body) && !g2.signed, JSON.stringify(g2));
    await page.locator('header').screenshot({ path: `${process.env.TEMP || '/tmp'}/accueil-regles.png` });
    // Panneau de Jev : plus de trombone « Joindre un fichier ».
    await page.locator('button, span, div', { hasText: /^Jev$/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    check('   panneau de Jev : aucun bouton « Joindre un fichier »', (await page.locator('[title="Joindre un fichier"]').count()) === 0);
    await page.close();

    // 3. Console › Plateforme › Modules : le module « Message d’accueil de Jev » est listé, actif partout.
    page = await newPage(browser, { errors });
    await page.goto(`${API}/Console%20Admin.dc.html?as=u1`, { waitUntil: 'load' });
    await page.waitForSelector('text=Vue d’ensemble', { timeout: 30000 });
    await page.waitForTimeout(2000);
    for (let i = 0; i < 3 && (await page.locator('button[aria-controls="sb-plat"][aria-expanded="true"]').count()) === 0; i++) { await page.locator('button[aria-controls="sb-plat"]').click(); await page.waitForTimeout(800); }
    await page.locator('#sb-plat').getByText('Modules', { exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes('Message d’accueil de Jev'), null, { timeout: 20000 }).catch(() => {});
    const txt = await page.evaluate(() => document.body.innerText);
    const i = txt.indexOf('Message d’accueil de Jev');
    check('3. Console › Modules : « Message d’accueil de Jev », actif sur tous les projets', i >= 0 && txt.slice(i, i + 400).includes('Actif sur tous les projets'), txt.slice(i, i + 160).replace(/\s+/g, ' '));
    await page.close();

    // Hors périmètre : ressources coupées par le banc, attributs SVG des gabarits lus avant leur rendu (« {{ … }} »).
    const js = errors.filter((e) => !e.startsWith('Failed to load resource') && !/attribute .*\{\{/.test(e));
    check('aucune erreur JS', js.length === 0, js.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  const ko = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ko.length}/${results.length} vérifications réussies`);
  process.exit(ko.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
