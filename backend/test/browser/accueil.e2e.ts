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
const JEV = 'Bonsoir Robin, le COPIL du 26 oct. se prépare dès maintenant : trois risques critiques méritent votre regard.';

const results: Array<{ step: string; ok: boolean; detail?: string }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok, detail }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };

async function launch(): Promise<Browser> {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

/** Message d'accueil affiché (ligne qui commence par la salutation et le prénom). */
const sub = (page: Page) => page.evaluate(() => (document.body.innerText.match(/(Bonjour|Bonsoir|Bonne semaine) Robin, [^\n]*/) ?? [''])[0].trim());

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
    const s1 = await sub(page);
    check('1. message de Jev affiché sous « Aujourd’hui »', s1.includes(JEV), s1);
    await page.waitForTimeout(3000);
    check('   un seul appel à /today/greeting (pas de rechargement en boucle)', calls === 1, `${calls} appel(s)`);
    await page.close();

    // 2. Route en échec : l'écran garde son message par règles (ni « prêt », ni compteur à zéro).
    page = await newPage(browser, { errors });
    await page.route(/\/api\/projects\/RISE\/today\/greeting$/, (r) => r.fulfill({ status: 500, json: { code: 'INTERNAL', message: 'panne simulée' } }));
    await page.goto(`${API}/RISE%20Cockpit.dc.html?as=p01`, { waitUntil: 'load' });
    await page.waitForFunction(() => /Bonjour|Bonsoir|Bonne semaine/.test(document.body.innerText), null, { timeout: 30000 });
    await page.waitForTimeout(2500);
    const s2 = await sub(page);
    check('2. échec de la route : message par règles, sans « prêt » ni zéro', /^(Bonjour|Bonsoir|Bonne semaine) Robin, /.test(s2) && !/prêt| 0 /.test(s2), s2);
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
