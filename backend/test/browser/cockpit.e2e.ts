/**
 * Vérification navigateur du RISE Cockpit branché sur l'API (brief § 13.11).
 *
 * Lancement : `cd backend && npx ts-node --transpile-only test/browser/cockpit.e2e.ts`
 *
 * 1. Amorce la base `rise_fe_cockpit`, démarre l'API (port 3101) si elle ne répond pas, et sert la copie
 *    d'origine du frontend (dernière révision git sans api.js, port 3199) pour la comparaison visuelle.
 * 2. Visite chaque espace et onglet principal dans les deux versions, sans erreur JS bloquante,
 *    prend une capture de chacun et mesure l'écart de pixels avec le rendu d'origine.
 * 3. Vérifie que des modifications survivent au rechargement (relecture de l'API puis de l'écran).
 *
 * Variables : E2E_API (défaut http://localhost:3101), E2E_ORIG (défaut http://localhost:3199),
 * E2E_OUT (dossier des captures, défaut <tmp>/rise-cockpit-e2e), E2E_NO_SEED=1 pour ne pas réamorcer.
 */
import path from 'path';
import os from 'os';
import fs from 'fs';
import http from 'http';
import { execSync, spawn, ChildProcess } from 'child_process';
import { Page } from 'playwright';
import { openBrowser, newPage } from './harness';

const ROOT = path.join(__dirname, '../..');
const REPO = path.join(ROOT, '..');
const API = process.env.E2E_API || 'http://localhost:3101';
const ORIG = process.env.E2E_ORIG || 'http://localhost:3199';
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), 'rise-cockpit-e2e');
const DB = 'postgresql://rise:rise@localhost:5432/rise_fe_cockpit';
// `as=p01` : connexion de développement par jeton (sans `as=`, la page exige une session par cookie).
const PAGE = '/RISE%20Cockpit.dc.html?e2e=1&as=p01';

const pwBase = path.dirname(require.resolve('playwright-core/package.json'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PNG } = require(pwBase + '/lib/utilsBundle');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pmMod = require(pwBase + '/lib/third_party/pixelmatch');
const pixelmatch: (a: Buffer, b: Buffer, o: Buffer | null, w: number, h: number, opt: object) => number = pmMod.default || pmMod;

const children: ChildProcess[] = [];
const results: Array<{ view: string; diffPct: number[]; errors: string[] }> = [];
const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

function up(url: string): Promise<boolean> {
  return new Promise((res) => {
    const req = http.get(url, (r) => { r.resume(); res((r.statusCode ?? 500) < 500); });
    req.on('error', () => res(false));
    req.setTimeout(2000, () => { req.destroy(); res(false); });
  });
}
async function waitUp(url: string, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await up(url)) return; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('Service injoignable : ' + url);
}

/**
 * Fichier HTML d'origine : dernière révision du dépôt qui ne charge pas encore api.js
 * (E2E_ORIG_REV pour la forcer, ex. f7707a4).
 */
function originalHtml(): Buffer {
  const file = 'frontends/RISE Cockpit.dc.html';
  const show = (rev: string) => execSync(`git show ${rev}:"${file}"`, { cwd: REPO, maxBuffer: 64 << 20 });
  if (process.env.E2E_ORIG_REV) return show(process.env.E2E_ORIG_REV);
  const revs = execSync(`git log --format=%H -- "${file}"`, { cwd: REPO }).toString().trim().split('\n').filter(Boolean);
  for (const rev of revs) {
    const html = show(rev);
    if (!html.includes("import('./api.js')")) return html;
  }
  throw new Error('Révision d’origine introuvable (E2E_ORIG_REV)');
}

async function ensureServices() {
  if (!process.env.E2E_NO_SEED) {
    console.log('▸ amorçage de rise_fe_cockpit');
    execSync('npm run db:seed', { cwd: ROOT, env: { ...process.env, DATABASE_URL: DB }, stdio: 'ignore' });
  }
  if (!(await up(API + '/api/docs'))) {
    console.log('▸ démarrage de l’API sur ' + API);
    const port = new URL(API).port || '3101';
    const p = spawn('node', ['dist/main.js'], { cwd: ROOT, env: { ...process.env, DATABASE_URL: DB, PORT: port, FRONTEND_DIR: '../frontends', AUTH_DEV: 'true', DEMO_TODAY: '2026-09-26', JOBS_ENABLED: 'false', OFFLINE: 'true' }, stdio: 'ignore' });
    children.push(p);
    await waitUp(API + '/api/docs');
  }
  if (!(await up(ORIG + PAGE))) {
    console.log('▸ copie d’origine servie sur ' + ORIG);
    const dir = fs.mkdtempSync('/tmp/rise-orig-');
    fs.writeFileSync(path.join(dir, 'RISE Cockpit.dc.html'), originalHtml());
    for (const f of ['support.js', 'rise-data.js', 'planning-data.js', 'Widget.dc.html']) fs.copyFileSync(path.join(REPO, 'frontends', f), path.join(dir, f));
    fs.cpSync(path.join(REPO, 'frontends/assets'), path.join(dir, 'assets'), { recursive: true });
    const p = spawn('python3', ['-m', 'http.server', new URL(ORIG).port || '3199'], { cwd: dir, stdio: 'ignore' });
    children.push(p);
    await waitUp(ORIG + PAGE);
  }
}

/** Vues visitées : [espace, libellé de l'espace dans la barre latérale, onglet, libellé de l'onglet, objet du Référentiel]. */
const VIEWS: Array<[string, string, string | null, string | null, string?]> = [
  ['today', "Aujourd'hui", null, null],
  ['pilotage', 'Pilotage', 'planning', 'Planning'],
  ['pilotage', 'Pilotage', 'jalons', 'Jalons'],
  ['pilotage', 'Pilotage', 'livrables', 'Livrables'],
  ['pilotage', 'Pilotage', 'risques', 'Risques et problèmes'],
  ['pilotage', 'Pilotage', 'actions', 'Actions'],
  ['pilotage', 'Pilotage', 'decisions', 'Décisions'],
  ['pilotage', 'Pilotage', 'barometre', 'Baromètre'],
  ['pilotage', 'Pilotage', 'seances', 'Comités'],
  ['pilotage', 'Pilotage', 'budget', 'Budget'],
  ['pilotage', 'Pilotage', 'mes', 'Mes tâches'],
  ['comites', 'Comités et rapports', 'generer', 'Générer un rapport'],
  ['comites', 'Comités et rapports', 'templates', 'Bibliothèque'],
  ['comites', 'Comités et rapports', 'historique', 'Historique'],
  ['documents', 'Base de connaissance', 'bibliotheque', null],
  ['projet', 'Info projet', 'fiche', 'Fiche projet'],
  ['projet', 'Info projet', 'dispositif', 'Dispositif'],
  ['projet', 'Info projet', 'referentiel', 'Référentiel'],
  ['projet', 'Info projet', 'referentiel', 'Référentiel', 'Lots'],
  ['projet', 'Info projet', 'referentiel', 'Référentiel', 'Chantiers'],
  ['projet', 'Info projet', 'referentiel', 'Référentiel', 'Personnes'],
  ['projet', 'Info projet', 'referentiel', 'Référentiel', 'Instances de pilotage'],
  ['projet', 'Info projet', 'referentiel', 'Référentiel', 'Livrables'],
];

async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.innerText.includes('Bonjour'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
}

async function clickVisible(page: Page, label: string) {
  const loc = page.getByText(label, { exact: true });
  const n = await loc.count();
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (await el.isVisible()) { await el.click(); return; }
  }
}

async function visit(page: Page, sideLabel: string, tabLabel: string | null, sub?: string) {
  await page.locator('aside, nav, body').getByText(sideLabel, { exact: true }).first().click();
  await page.waitForTimeout(500);
  if (tabLabel) await clickVisible(page, tabLabel);
  if (sub) { await page.waitForTimeout(400); await clickVisible(page, sub); }
  await page.mouse.move(5, 895);
  await page.waitForTimeout(1200);
}

/** Nombre maximal d'écrans capturés par vue (défilement du conteneur principal). */
const SCROLL_STEPS = 6;
/** Fait défiler le plus grand conteneur défilant (ou la page) jusqu'à l'écran k ; faux s'il n'y a plus rien à voir. */
async function scrollTo(page: Page, k: number): Promise<boolean> {
  const moved = await page.evaluate((k) => {
    const els = [document.scrollingElement as HTMLElement, ...Array.from(document.querySelectorAll<HTMLElement>('main, main *, body > * *'))].filter((e) => {
      if (!e) return false;
      const cs = getComputedStyle(e);
      return e.scrollHeight > e.clientHeight + 40 && (e === document.scrollingElement || /(auto|scroll)/.test(cs.overflowY)) && e.clientHeight > 300;
    });
    const el = els.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth)[0];
    if (!el) return k === 0;
    const target = k * (el.clientHeight - 80);
    if (k > 0 && target >= el.scrollHeight - el.clientHeight + (el.clientHeight - 80)) return false;
    el.scrollTop = target;
    return true;
  }, k);
  await page.mouse.move(5, 895);
  await page.waitForTimeout(400);
  return moved;
}

function diff(a: string, b: string, out: string): number {
  const A = PNG.sync.read(fs.readFileSync(a));
  const B = PNG.sync.read(fs.readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) return -1; // hauteurs différentes : comparaison impossible au pixel
  const D = new PNG({ width: A.width, height: A.height });
  const n = pixelmatch(A.data, B.data, D.data, A.width, A.height, { threshold: 0.12 });
  fs.writeFileSync(out, PNG.sync.write(D));
  return (n / (A.width * A.height)) * 100;
}

const blocking = (errs: string[]) => errs.filter((e) => !/attribute .*Expected|Failed to load resource|net::ERR/.test(e));

function check(name: string, ok: boolean, detail = '') {
  checks.push({ name, ok, detail });
  console.log((ok ? '  ✔ ' : '  ✘ ') + name + (detail ? ' — ' + detail : ''));
}

async function apiGet(token: string, p: string) {
  const r = await fetch(API + '/api/projects/RISE' + p, { headers: { Authorization: 'Bearer ' + token } });
  return r.json() as Promise<any>;
}

async function persistence(page: Page) {
  console.log('▸ persistance après rechargement');
  const token: string = await page.evaluate(() => localStorage.getItem('rise-token') as string);
  const settle = () => page.waitForTimeout(2500); // regroupement (600 ms) + écriture + rechargement (400 ms)

  // 1. Plan de mitigation d'un risque : saisie réelle dans la cellule éditable du registre (Pilotage › Risques)
  const PLAN = 'Plan e2e — renfort de la reprise des données (' + Date.now() + ')';
  await visit(page, 'Pilotage', 'Risques et problèmes');
  const cell = await page.locator('[contenteditable="true"]', { hasText: 'Replanification du Run 3' }).first().elementHandle();
  if (cell) {
    await cell.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(PLAN);
    await page.locator('body').click({ position: { x: 700, y: 120 } });
  }
  check('Interface · cellule « plan de mitigation » trouvée', !!cell);
  // 2. Date d'un jalon (enregistrement du calendrier : edit('ms', id, 'iso', …))
  await page.evaluate(() => (window as any).__riseCockpit.edit('ms', 'J05', 'iso', '2026-10-21'));
  // 3. Lieu d'une séance : saisie réelle dans le champ « lieu » du calendrier (Pilotage › Comités), puis sortie du champ
  const PLACE = 'Salle e2e · visio';
  await page.evaluate(() => (window as any).__riseCockpit.setState({ space: 'pilotage', tab: 'seances', sesSel: '2026-10-26', sesCm: '2026-10' }));
  await page.waitForTimeout(800);
  const placeInput = await page.locator('input[value="Siège · salle du Conseil + visio"]').first().elementHandle();
  if (placeInput) { await placeInput.fill(PLACE); await placeInput.press('Tab'); }
  check('Interface · champ « lieu » de la séance S-g1-21 trouvé', !!placeInput);
  // 4. Cellule du Référentiel (description d'une équipe) et date de fin d'un lot (précision mois)
  await page.evaluate(() => {
    const c = (window as any).__riseCockpit, M = c.state.data.model;
    const t = M.TEAM.rows[0], w = M.WAVE.rows.find((r: any) => r.id === 'w2');
    const tc = [...t.cells]; tc[2] = 'Description e2e';
    const wc = [...w.cells]; wc[3] = '09/2029';
    c.setState((s: any) => ({ refValues: { ...(s.refValues || {}), ['TEAM/' + t.id]: tc, ['WAVE/w2']: wc } }));
  });
  // 5. Statut d'une action et commentaire de cellule
  await page.evaluate(() => (window as any).__riseCockpit.setState((s: any) => ({ actStatus: { ...(s.actStatus || {}), 'A-41': 'Bloquée' } })));
  await page.evaluate(() => (window as any).__riseCockpit.setState((s: any) => ({ cmts: { ...(s.cmts || {}), 'risques|R01 · e2e|2': [{ who: 'Robin', text: 'Commentaire e2e', val: '', when: '' }] } })));
  // 6. Fiche d'arbitrage d'une décision arbitrée : 409 attendu, toast affiché
  await page.evaluate(() => (window as any).__riseCockpit.setState((s: any) => ({ txtEd: { ...(s.txtEd || {}), dcCtx: 'Tentative e2e' } })));
  const toast409 = await page.waitForFunction(() => /lecture seule/i.test(document.body.innerText), null, { timeout: 5000 }).then(() => true, () => false);
  check('D-007 arbitrée : écriture refusée (409) et message affiché', toast409);
  await settle();

  const B = await apiGet(token, '/bootstrap');
  check('API · plan du risque R01', B.risks.find((r: any) => r.id === 'R01')?.plan === PLAN);
  check('API · date du jalon J05', B.milestones.find((m: any) => m.id === 'J05')?.iso === '2026-10-21');
  check('API · lieu de la séance S-g1-21', B.sessions.find((s: any) => s.id === 'S-g1-21')?.place === PLACE);
  check('API · description d’équipe (Référentiel)', B.model.TEAM.rows[0].cells[2] === 'Description e2e');
  check('API · fin du lot 2 au format MM/AAAA', B.model.WAVE.rows.find((r: any) => r.id === 'w2')?.cells[3] === '09/2029');
  check('API · statut de l’action A-41', B.actions.find((a: any) => a.id === 'A-41')?.status === 'BLOCKED');
  const cm = await apiGet(token, '/comments');
  check('API · commentaire de cellule rattaché au risque', cm.some((c: any) => c.text === 'Commentaire e2e' && c.entityType === 'RISK' && c.entityId === 'R01'));

  // Rechargement complet de la page : l'écran relit le serveur
  await open(page, API + PAGE);
  const screen = await page.evaluate(() => {
    const c = (window as any).__riseCockpit, D = c.mergedData();
    return {
      plan: D.risks.find((r: any) => r.id === 'R01').plan,
      iso: D.milestones.find((m: any) => m.id === 'J05').iso,
      place: c.sessionList().find((s: any) => s.id === 'S-g1-21').place,
      team: D.model.TEAM.rows[0].cells[2],
      cmt: (c.state.cmts['risques|R01 · e2e|2'] || [])[0]?.text,
    };
  });
  check('Écran rechargé · plan du risque', screen.plan === PLAN);
  check('Écran rechargé · date du jalon', screen.iso === '2026-10-21');
  check('Écran rechargé · lieu de la séance', screen.place === PLACE);
  check('Écran rechargé · cellule du Référentiel', screen.team === 'Description e2e');
  check('Écran rechargé · commentaire de cellule', screen.cmt === 'Commentaire e2e');

  // Plan affiché dans l'onglet Risques
  await visit(page, 'Pilotage', 'Risques et problèmes');
  const shown = await page.evaluate((v) => document.body.innerText.includes(v.slice(0, 40)), PLAN);
  check('Écran · plan visible dans Pilotage › Risques', shown);

  // Création : nouveau risque (identifiant attribué par le serveur)
  await page.evaluate(() => {
    const c = (window as any).__riseCockpit;
    c.setState((s: any) => ({ added: { ...(s.added || {}), rk: [...((s.added || {}).rk || []), { id: 'R15', n: 'Risque e2e créé', p: 2, i: 3, plan: null, owner: 'p01', ws: 'Finance', due: 'à planifier', dueIso: '', status: 'OPEN' }] } }));
  });
  await settle();
  const B2 = await apiGet(token, '/bootstrap');
  const created = B2.risks.find((r: any) => r.n === 'Risque e2e créé');
  check('Création d’un risque : identifiant serveur, chantier résolu', !!created && created.wsId === 'C1', created ? created.id + ' / ' + created.wsId : 'absent');
  const local = await page.evaluate(() => (window as any).__riseCockpit.state.added);
  check('Magasin `added` remis à zéro après rechargement', !local || !(local.rk || []).length);

  // Suppression refusée : objet utilisé (409 + usages)
  await page.evaluate(() => (window as any).__riseCockpit.setState((s: any) => ({ refDeleted: { ...(s.refDeleted || {}), 'WORKSTREAM/C1': true } })));
  const used = await page.waitForFunction(() => /utilisé/i.test(document.body.innerText), null, { timeout: 5000 }).then(() => true, () => false);
  check('Suppression d’un chantier utilisé : 409 et usages affichés', used);
  await settle();
  const back = await page.evaluate(() => (window as any).__riseCockpit.mergedData().model.WORKSTREAM.rows.some((r: any) => r.id === 'C1') && !(window as any).__riseCockpit.state.refDeleted['WORKSTREAM/C1']);
  check('Suppression refusée : la ligne réapparaît (rechargement)', back);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await ensureServices();
  const browser = await openBrowser();
  const origErrors: string[] = [];
  const liveErrors: string[] = [];
  const orig = await newPage(browser, { errors: origErrors });
  const live = await newPage(browser, { errors: liveErrors });
  try {
    await open(orig, ORIG + PAGE);
    await open(live, API + PAGE);
    console.log('▸ visite des espaces et onglets');
    for (const [space, side, tab, tabLabel, sub] of VIEWS) {
      const name = space + (tab ? '-' + tab : '') + (sub ? '-' + sub.split(' ')[0].toLowerCase() : '');
      origErrors.length = 0;
      liveErrors.length = 0;
      await visit(orig, side, tabLabel, sub);
      await visit(live, side, tabLabel, sub);
      const pcts: number[] = [];
      for (let k = 0; k < SCROLL_STEPS; k++) {
        const more = await Promise.all([scrollTo(live, k), scrollTo(orig, k)]);
        if (k > 0 && !more[0] && !more[1]) break;
        const a = path.join(OUT, name + '.' + k + '.png'), b = path.join(OUT, name + '.' + k + '.orig.png');
        await live.screenshot({ path: a });
        await orig.screenshot({ path: b });
        pcts.push(Math.round(diff(a, b, path.join(OUT, name + '.' + k + '.diff.png')) * 100) / 100);
      }
      await Promise.all([scrollTo(live, 0), scrollTo(orig, 0)]);
      const errs = blocking(liveErrors).filter((e) => !blocking(origErrors).includes(e));
      results.push({ view: name, diffPct: pcts, errors: errs });
      console.log(`  ${errs.length ? '✘' : '✔'} ${name.padEnd(22)} écart par écran ${pcts.map((x) => x.toFixed(2) + ' %').join(' · ')}${errs.length ? '  erreurs : ' + errs.slice(0, 2).join(' | ') : ''}`);
    }
    await persistence(live);
  } finally {
    await browser.close();
    children.forEach((c) => c.kill());
  }
  const errViews = results.filter((r) => r.errors.length);
  const failed = checks.filter((c) => !c.ok);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, checks }, null, 2));
  const all = results.flatMap((r) => r.diffPct).filter((x) => x >= 0);
  console.log(`\nVues : ${results.length} (${all.length} écrans comparés) · avec erreur JS : ${errViews.length} · écart moyen ${(all.reduce((a, x) => a + x, 0) / all.length).toFixed(2)} % · max ${Math.max(...all).toFixed(2)} %`);
  console.log(`Contrôles de persistance : ${checks.length - failed.length}/${checks.length} réussis`);
  if (errViews.length || failed.length) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  children.forEach((c) => c.kill());
  process.exit(1);
});
