/// <reference lib="dom" />
/**
 * Vérification navigateur du branchement de la Console Admin (brief Console § 13.10).
 *
 * Usage (backend de la console démarré sur le port 3102, base rise_fe_console) :
 *   cd backend && npx ts-node --transpile-only test/browser/console.e2e.ts
 * Variables : CONSOLE_URL (défaut http://localhost:3102), DATABASE_URL (défaut rise_fe_console),
 *             ORIG_PORT (défaut 3297), OUT (dossier des captures, défaut <tmp>/rise-console-e2e), NO_SEED=1.
 *
 * Étapes :
 *  1. amorce la base rise_fe_console (`npm run db:seed`) ;
 *  2. sert la copie d'origine des écrans (révision qui précède `admin-api.js`) avec `python3 -m http.server` ;
 *  3. visite chaque menu de la console branchée et de la copie d'origine, sans erreur JS bloquante,
 *     capture les deux rendus et mesure l'écart visuel (pourcentage de pixels différents) ;
 *  4. fait des modifications par l'interface (suspendre un compte, changer un plafond, désactiver une règle,
 *     capturer un snapshot libellé, importer un projet), recharge la page et vérifie qu'elles ont survécu.
 */
import { execSync, spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Browser, BrowserContext, Page } from 'playwright';
import { openBrowser } from './harness';
import { buildWorkbook, validAtlas } from '../fixtures/excel';

const ROOT = path.join(__dirname, '../../..');
const BACKEND = path.join(ROOT, 'backend');
const API = process.env.CONSOLE_URL || 'http://localhost:3102';
const DB = process.env.DATABASE_URL || 'postgresql://rise:rise@localhost:5432/rise_fe_console';
const ORIG_PORT = Number(process.env.ORIG_PORT || 3297);
const OUT = process.env.OUT || path.join(os.tmpdir(), 'rise-console-e2e');
const PAGE = 'Console%20Admin.dc.html';

const MENUS: Array<[string, string]> = [
  ['overview', 'Vue d’ensemble'], ['users', 'Utilisateurs'], ['admins', 'Administrateurs'], ['providers', 'Fournisseurs et modèles'], ['assign', 'Affectation des modèles'],
  ['conso', 'Consommation et coûts'], ['snaps', 'Snapshots'], ['notifs', 'Notifications et alertes'], ['modules', 'Modules'], ['init', 'Initialisation d’un projet'],
  ['library', 'Bibliothèque des projets'], ['profil', 'Mon profil'],
];

const NM = path.join(BACKEND, 'node_modules');
const LOCAL: Record<string, string> = {
  'react.production.min.js': path.join(NM, 'react/umd/react.production.min.js'),
  'react-dom.production.min.js': path.join(NM, 'react-dom/umd/react-dom.production.min.js'),
  'babel.min.js': path.join(NM, '@babel/standalone/babel.min.js'),
};

const results: Array<{ step: string; ok: boolean; detail?: string }> = [];
const check = (step: string, ok: boolean, detail = '') => {
  results.push({ step, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`);
};

/** Contexte identique pour les deux rendus : fuseau de la démonstration, mouvement réduit, bibliothèques locales. */
async function newContext(b: Browser): Promise<BrowserContext> {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Paris', locale: 'fr-FR', reducedMotion: 'reduce' });
  await ctx.route('https://unpkg.com/**', async (route) => {
    const file = Object.entries(LOCAL).find(([k]) => route.request().url().endsWith(k))?.[1];
    if (file) return route.fulfill({ path: file, contentType: 'application/javascript' });
    return route.abort();
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|cdn\.sheetjs\.com/, (r) => r.abort());
  return ctx;
}

/**
 * Erreurs JS de la page. Sont ignorés : les ressources externes bloquées (polices, CDN) et l'avertissement du
 * navigateur sur `<path d="{{ it.d }}">`, émis par le gabarit brut avant le rendu (présent aussi dans la copie d'origine).
 */
const PREEXISTING = /Failed to load resource|ERR_FAILED|ERR_ABORTED|attribute d: Expected moveto path command \('M' or 'm'\), "\{\{ it\.d \}\}"/;
function watch(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !PREEXISTING.test(m.text())) errors.push('console: ' + m.text());
  });
}

async function settle(page: Page, ms = 1600) {
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

/** Erreurs d'exécution affichées par le moteur des écrans (support.js). */
const dcErrors = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('.sc-logic-error, .sc-placeholder-error')).map((e) => e.textContent || ''));

async function goMenu(page: Page, label: string) {
  // « Mon profil » s'ouvre par la carte de l'administrateur connecté, en bas de la navigation.
  // Sidebar Console : les pages sont rangées par domaine (accordéon) ; on déplie le domaine s'il est replié.
  const DOM: Record<string, string> = { Utilisateurs: 'Accès', Administrateurs: 'Accès', 'Fournisseurs et modèles': 'IA', 'Affectation des modèles': 'IA', 'Consommation et coûts': 'IA', Persona: 'Assistant', Skills: 'Assistant', 'Bibliothèque des projets': 'Projets', 'Initialisation d’un projet': 'Projets', Snapshots: 'Projets', Modules: 'Plateforme', 'Notifications et alertes': 'Plateforme' };
  if (label === 'Mon profil') await page.locator('aside button[aria-label="Mon profil"]').click();
  else {
    const dom = DOM[label];
    if (dom) {
      const head = page.locator('aside button[aria-expanded]', { hasText: dom }).first();
      if ((await head.getAttribute('aria-expanded')) !== 'true') { await head.click(); await page.waitForTimeout(400); }
    }
    await page.locator('aside button', { hasText: label }).first().click();
  }
  await settle(page);
}

/** Écart visuel entre deux captures (même taille) : pourcentage de pixels dont un canal diffère de plus de 40. */
async function diffPct(page: Page, a: string, b: string, outDiff: string): Promise<number> {
  const [da, db] = [fs.readFileSync(a).toString('base64'), fs.readFileSync(b).toString('base64')];
  const res = await page.evaluate(async ([x, y]) => {
    const load = (s: string) => new Promise<HTMLImageElement>((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const cv = (i: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; g.drawImage(i, 0, 0); return g.getImageData(0, 0, w, h); };
    const A = cv(ia), B = cv(ib), out = document.createElement('canvas'); out.width = w; out.height = h;
    const g = out.getContext('2d')!, O = g.createImageData(w, h); let n = 0;
    for (let p = 0; p < A.data.length; p += 4) {
      const d = Math.max(Math.abs(A.data[p] - B.data[p]), Math.abs(A.data[p + 1] - B.data[p + 1]), Math.abs(A.data[p + 2] - B.data[p + 2]));
      const grey = (A.data[p] + A.data[p + 1] + A.data[p + 2]) / 3;
      if (d > 40) { n++; O.data[p] = 230; O.data[p + 1] = 40; O.data[p + 2] = 40; O.data[p + 3] = 255; } else { O.data[p] = O.data[p + 1] = O.data[p + 2] = 180 + grey / 5; O.data[p + 3] = 255; }
    }
    g.putImageData(O, 0, 0);
    return { pct: (n / (w * h)) * 100, png: out.toDataURL('image/png').split(',')[1] };
  }, [da, db]);
  fs.writeFileSync(outDiff, Buffer.from(res.png, 'base64'));
  return Math.round(res.pct * 10) / 10;
}

/** Révision d'origine des écrans : celle qui précède l'ajout d'admin-api.js (branchement). */
function originalRev(): string {
  const added = execSync('git log --diff-filter=A --format=%H -- frontends/admin-api.js', { cwd: ROOT }).toString().trim().split('\n').pop();
  return added ? `${added}^` : 'HEAD';
}

function serveOriginal(): { dir: string; proc: ChildProcess } {
  const rev = originalRev();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rise-console-orig-'));
  for (const f of ['Console Admin.dc.html', 'ConsoCouts.dc.html', 'ProjetInit.dc.html', 'ProjetsBiblio.dc.html', 'support.js', 'rise-data.js', 'planning-data.js']) {
    fs.writeFileSync(path.join(dir, f), execSync(`git show "${rev}:frontends/${f}"`, { cwd: ROOT, maxBuffer: 64 << 20 }));
  }
  fs.cpSync(path.join(ROOT, 'frontends/assets'), path.join(dir, 'assets'), { recursive: true });
  const proc = spawn('python3', ['-m', 'http.server', String(ORIG_PORT), '--bind', '127.0.0.1', '--directory', dir], { stdio: 'ignore' });
  return { dir, proc };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!process.env.NO_SEED) {
    console.log('Amorçage de', DB);
    execSync('npm run db:seed', { cwd: BACKEND, env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  }
  const busy = await fetch(`http://127.0.0.1:${ORIG_PORT}/`).then(() => true, () => false);
  if (busy) throw new Error(`Le port ${ORIG_PORT} est déjà utilisé : choisissez-en un autre avec ORIG_PORT=…`);
  const orig = serveOriginal();
  await new Promise((r) => setTimeout(r, 800));
  const b = await openBrowser();
  const errsA: string[] = [], errsO: string[] = [];
  try {
    const ctxA = await newContext(b), ctxO = await newContext(b), cmpCtx = await newContext(b);
    const pa = await ctxA.newPage(), po = await ctxO.newPage(), pc = await cmpCtx.newPage();
    watch(pa, errsA); watch(po, errsO);
    await pa.goto(`${API}/${PAGE}?as=u1`, { waitUntil: 'load' });
    await po.goto(`http://127.0.0.1:${ORIG_PORT}/${PAGE}`, { waitUntil: 'load' });
    await settle(pa, 2000); await settle(po, 2000);

    // ── 3. Chaque menu : rendu branché, rendu d'origine, écart ──
    const table: string[] = [];
    for (const [id, label] of MENUS) {
      if (id !== 'overview') { await goMenu(pa, label); await goMenu(po, label); }
      const fa = path.join(OUT, `${id}-api.png`), fo = path.join(OUT, `${id}-orig.png`);
      await pa.screenshot({ path: fa }); await po.screenshot({ path: fo });
      await pa.screenshot({ path: path.join(OUT, `${id}-api-full.png`), fullPage: true });
      await po.screenshot({ path: path.join(OUT, `${id}-orig-full.png`), fullPage: true });
      const pct = await diffPct(pc, fo, fa, path.join(OUT, `${id}-diff.png`));
      const pctFull = await diffPct(pc, path.join(OUT, `${id}-orig-full.png`), path.join(OUT, `${id}-api-full.png`), path.join(OUT, `${id}-diff-full.png`));
      const de = await dcErrors(pa);
      const title = await pa.locator('h1').first().textContent().catch(() => '');
      check(`menu « ${label} » affiché sans erreur`, de.length === 0 && (id === 'overview' || (title || '').includes(label.split(' ')[0])), de.join(' | ') || `titre : ${title}`);
      table.push(`${label.padEnd(30)} ${String(pct).padStart(5)} % (fenêtre) · ${String(pctFull).padStart(5)} % (page entière)`);
    }
    check('aucune erreur JS (console branchée)', errsA.length === 0, errsA.slice(0, 5).join(' | '));
    console.log('\nÉcarts visuels, pixels différents (origine vs branchée, 1440×900 et page entière) :\n  ' + table.join('\n  '));

    // ── 4. Modifications par l'interface, puis rechargement ──
    const toastText = async () => (await pa.locator('[role="status"], [aria-live]').allTextContents().catch(() => [])).join(' ');
    // a) suspendre un compte
    await goMenu(pa, 'Utilisateurs');
    await pa.getByRole('button', { name: 'Suspendre Léa Fontaine' }).click();
    await pa.getByRole('button', { name: 'Suspendre le compte' }).click();
    await settle(pa, 800);
    // b) changer un plafond (Consommation et coûts)
    await goMenu(pa, 'Consommation et coûts');
    const lim = pa.getByRole('textbox', { name: 'Plafond Budget global' });
    await lim.fill('1500');
    await pa.getByRole('button', { name: 'Enregistrer les plafonds' }).click();
    await settle(pa, 800);
    // c) désactiver une règle
    await goMenu(pa, 'Notifications et alertes');
    await pa.getByRole('switch', { name: 'Désactiver Synthèse hebdomadaire du projet' }).click();
    await settle(pa, 800);
    // d) snapshot sans libellé → 400 affiché ; puis snapshot libellé
    await goMenu(pa, 'Snapshots');
    await pa.getByRole('button', { name: 'Créer un snapshot' }).first().click();
    await pa.getByRole('button', { name: 'Capturer maintenant' }).click();
    await pa.waitForTimeout(900);
    const t400 = await pa.evaluate(() => document.body.innerText);
    check('snapshot manuel sans libellé refusé (400 affiché)', /libellé obligatoire/.test(t400));
    await pa.getByRole('button', { name: 'Créer un snapshot' }).first().click();
    await pa.getByPlaceholder('Ex. Avant le 20e COPIL').fill('Test e2e navigateur');
    await pa.getByRole('button', { name: 'Capturer maintenant' }).click();
    await pa.waitForFunction(() => document.body.innerText.includes('Test e2e navigateur'), null, { timeout: 20000 }).catch(() => {});
    await settle(pa, 600);
    // e) planification : changer l'heure (par projet)
    // f) importer un projet (ORION) : contrôle, prévisualisation, validation
    await goMenu(pa, 'Initialisation d’un projet');
    const exampleShown = await pa.getByRole('button', { name: 'Charger l’exemple' }).count();
    check('« Charger l’exemple » masqué hors mode démonstration', exampleShown === 0);
    const xlsx = path.join(OUT, 'Referentiel ORION - initialisation.xlsx');
    fs.writeFileSync(xlsx, await buildWorkbook(validAtlas('ORION') as any));
    await pa.locator('input[type=file]').setInputFiles(xlsx);
    await pa.getByRole('button', { name: 'Prévisualiser →' }).click({ timeout: 20000 });
    await settle(pa, 600);
    await pa.screenshot({ path: path.join(OUT, 'init-preview-api.png') });
    await pa.getByRole('button', { name: 'Valider l’importation' }).click();
    await pa.waitForFunction(() => document.body.innerText.includes('a rejoint la bibliothèque'), null, { timeout: 30000 }).catch(() => {});
    check('import ORION validé par le serveur', (await pa.evaluate(() => document.body.innerText)).includes('ORION a rejoint la bibliothèque'));
    // g) autres actions branchées : tests de clés, rotation (clé jamais conservée), invitation, demande de module,
    //    planification, préférences, envoi de test d'une règle.
    const body = () => pa.evaluate(() => document.body.innerText);
    await goMenu(pa, 'Fournisseurs et modèles');
    await pa.getByRole('button', { name: 'Tester toutes les clés' }).click();
    await pa.waitForFunction(() => /clés? valides? sur 4/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    check('« Tester toutes les clés » : résultat réel du serveur', /3 clés valides sur 4/.test(await body()));
    await goMenu(pa, 'Vue d’ensemble');
    await pa.getByRole('button', { name: 'Remplacer la clé' }).first().click();
    await settle(pa, 400);
    const KEY = 'AIzaSy-e2e-nouvelle-cle-0000000000XYZ9';
    await pa.getByPlaceholder('Collez la clé fournie par le fournisseur').fill(KEY);
    await pa.getByRole('button', { name: 'Remplacer et tester' }).click();
    await pa.waitForFunction(() => /Google répond en \d+ ms/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    check('rotation de la clé Google : retestée par le serveur', /Google répond en \d+ ms/.test(await body()));
    check('la clé saisie n’est conservée ni dans la page ni dans le stockage', !(await pa.evaluate((k) => document.documentElement.outerHTML.includes(k) || JSON.stringify(localStorage).includes(k), KEY)));
    await goMenu(pa, 'Utilisateurs');
    await pa.getByRole('button', { name: 'Inviter' }).first().click();
    await pa.getByLabel('NOM COMPLET').fill('Nora Partenaire');
    await pa.getByLabel('E-MAIL PROFESSIONNEL').fill('nora.partenaire@exemple.fr');
    await pa.getByRole('button', { name: 'Envoyer l’invitation' }).click();
    await pa.waitForTimeout(900);
    check('invitation d’un lecteur externe envoyée', /Invitation envoyée à nora\.partenaire@exemple\.fr/.test(await body()));
    await goMenu(pa, 'Modules');
    await pa.getByRole('button', { name: 'Activer sur RISE' }).click();
    await pa.waitForTimeout(800);
    await goMenu(pa, 'Snapshots');
    await pa.getByRole('switch', { name: 'Planification automatique' }).click();
    await pa.waitForTimeout(800);
    await goMenu(pa, 'Mon profil');
    await pa.getByRole('tab', { name: 'Notifications' }).click().catch(() => pa.getByText('Notifications', { exact: true }).last().click());
    await pa.getByRole('switch', { name: 'Échecs d’envoi de notifications' }).click().catch(() => pa.getByRole('button', { name: 'Échecs d’envoi de notifications' }).click());
    await pa.waitForTimeout(800);
    await goMenu(pa, 'Notifications et alertes');
    await pa.getByRole('button', { name: 'M’envoyer un test' }).click();
    await pa.waitForFunction(() => /Message de test envoyé|Échec de l’envoi de test/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    check('« M’envoyer un test » : envoi réel par le serveur', /Message de test envoyé à julien\.morel@example\.com/.test(await body()));
    check('aucune erreur JS pendant les modifications', errsA.length === 0, errsA.slice(0, 5).join(' | '));
    void toastText;

    // Rechargement complet : tout vient du serveur.
    await pa.reload({ waitUntil: 'load' });
    await settle(pa, 2000);
    await goMenu(pa, 'Utilisateurs');
    check('après rechargement : Léa Fontaine est suspendue (bouton « Réactiver »)', (await pa.getByRole('button', { name: 'Réactiver Léa Fontaine' }).count()) > 0 && (await pa.getByRole('button', { name: 'Suspendre Léa Fontaine' }).count()) === 0);
    await goMenu(pa, 'Consommation et coûts');
    await pa.waitForTimeout(800);
    check('après rechargement : plafond global à 1 500 €', (await pa.getByRole('textbox', { name: 'Plafond Budget global' }).inputValue()) === '1500');
    await goMenu(pa, 'Notifications et alertes');
    check('après rechargement : « Synthèse hebdomadaire du projet » désactivée', (await pa.getByRole('switch', { name: 'Activer Synthèse hebdomadaire du projet' }).count()) === 1);
    await goMenu(pa, 'Snapshots');
    check('après rechargement : snapshot « Test e2e navigateur » présent', (await pa.evaluate(() => document.body.innerText)).includes('Test e2e navigateur'));
    await goMenu(pa, 'Bibliothèque des projets');
    const lib = await pa.evaluate(() => document.body.innerText);
    check('après rechargement : ORION en tête de la bibliothèque, badge « Nouveau »', /ORION[\s\S]*Nouveau/.test(lib) && lib.indexOf('ORION') < lib.indexOf('RISE —'));
    const href = await pa.getByRole('link', { name: 'Ouvrir', exact: true }).first().getAttribute('href');
    check('« Ouvrir » pointe vers le Cockpit du projet', href === './RISE Cockpit.dc.html?project=ORION', String(href));
    await pa.screenshot({ path: path.join(OUT, 'library-after-api.png') });
    await goMenu(pa, 'Administrateurs');
    await pa.getByRole('tab', { name: 'Journal d’audit' }).click().catch(() => pa.getByText('Journal d’audit').first().click());
    await settle(pa, 500);
    const audit = await pa.evaluate(() => document.body.innerText);
    check('journal d’audit écrit par le serveur (suspension, plafond, règle, snapshot, import)', ['Suspension d’un utilisateur', 'Modification d’un plafond budgétaire IA', 'Désactivation d’une règle', 'Création d’un snapshot manuel', 'Initialisation d’un projet'].every((a) => audit.includes(a)));
    await pa.screenshot({ path: path.join(OUT, 'audit-after-api.png') });

    // Contrôle direct par l'API (même base).
    const tok = await pa.evaluate(() => localStorage.getItem('rise-admin-token'));
    const j = async (p: string) => (await fetch(`${API}/api/admin${p}`, { headers: { Authorization: `Bearer ${tok}` } })).json();
    const acc = (await j('/accounts')).items.find((a: any) => a.id === 'u15');
    const th = (await j('/budget-thresholds')).find((t: any) => t.id === 'all');
    const n4 = (await j('/notification-rules')).find((r: any) => r.id === 'n4');
    check('API : u15 SUSPENDED, plafond all = 1500, n4 désactivée', acc?.status === 'SUSPENDED' && th?.limitEur === 1500 && n4?.enabled === false, `${acc?.status} · ${th?.limitEur} · ${n4?.enabled}`);
    const google = (await j('/providers')).find((p: any) => p.id === 'google');
    const nora = (await j('/accounts')).items.find((a: any) => a.email === 'nora.partenaire@exemple.fr');
    const ben = (await j('/modules')).find((m: any) => m.id === 'ben');
    const sched = await j('/projects/RISE/snapshot-schedule');
    const me = await j('/me/profile');
    check('API : clé Google OK (fin AIza…XYZ9), invitation, module sur RISE, planification RISE suspendue, préférence enregistrée',
      google?.status === 'OK' && google?.keyLast4 === 'XYZ9' && nora?.status === 'INVITED' && ben?.scope === 'PROJECTS' && ben?.projectIds.includes('RISE') && sched?.enabled === false && me?.notifications?.fail === true,
      `${google?.status}/${google?.keyLast4} · ${nora?.status} · ${ben?.scope}:${ben?.projectIds} · ${sched?.enabled} · ${me?.notifications?.fail}`);
    await goMenu(pa, 'Utilisateurs');
    check('après rechargement : invitation de Nora Partenaire listée', (await pa.getByRole('button', { name: 'Modifier Nora Partenaire' }).count()) > 0);
    check('aucune erreur JS après rechargement', errsA.length === 0, errsA.slice(0, 5).join(' | '));
    // Mode démonstration : aucun appel à l'API, écrans et simulations d'origine.
    const errsD: string[] = [], calls: string[] = [];
    const pd = await (await newContext(b)).newPage();
    watch(pd, errsD);
    pd.on('request', (r) => { if (/\/api\//.test(r.url())) calls.push(r.url()); });
    await pd.goto(`${API}/${PAGE}?demo=1&as=u1`, { waitUntil: 'load' });
    await settle(pd, 1500);
    await goMenu(pd, 'Initialisation d’un projet');
    check('mode démonstration (?demo=1) : aucun appel à l’API, « Charger l’exemple » proposé', calls.length === 0 && (await pd.getByRole('button', { name: 'Charger l’exemple' }).count()) === 1 && errsD.length === 0, `${calls.length} appel(s) · ${errsD.slice(0, 2).join(' | ')}`);
    if (errsO.length) console.log('(copie d’origine : ' + errsO.length + ' message(s) d’erreur console, hors périmètre)');
  } finally {
    await b.close();
    orig.proc.kill();
    fs.rmSync(orig.dir, { recursive: true, force: true });
  }
  const ko = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ko.length}/${results.length} vérifications réussies · captures dans ${OUT}`);
  process.exitCode = ko.length ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
