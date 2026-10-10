/// <reference lib="dom" />
/**
 * Vérification navigateur de l'écran « Analyse des temps de réponse » (spécification TEMPS § 4) branché sur l'API.
 *
 * Usage (application démarrée, `npm run build` préalable, AUTH_DEV=true) :
 *   cd backend && npx ts-node --transpile-only test/browser/latency.e2e.ts
 * Variable : CONSOLE_URL (défaut http://localhost:3000).
 *
 * Rien n'est écrit dans la base de l'application (01/10/2026 : les mesures de test s'y voyaient) : les appels de
 * l'écran à `/api/ai/latency` sont interceptés dans le navigateur et servis à partir du jeu de mesures de test
 * (183 jours se terminant au dernier jour des périodes, un jour laissé vide), calculés par les règles du serveur.
 */
import { chromium, Browser, Page } from 'playwright';
import { newPage } from './harness';
import { addDays } from '../../src/domain/dates';
import { parisDay } from '../../src/domain/notification-rules';
import { latencyFixture } from '../fixtures/latency';
import { buildLatencyReport, buildLatencySeries, isLatencyPeriod, LATENCY_END_OFFSET_DAYS, latencyInstants, latencyRange, TimingRow } from '../../src/domain/latency';

const API = process.env.CONSOLE_URL || 'http://localhost:3000';
const haikuName = 'Claude Haiku 4.5';
const EMPTY_BACK = 10; // jour sans mesure (période Jour, 10 jours avant le dernier jour)
/** Noms et fournisseurs des modèles du jeu de mesures (champ `models` du rapport). */
const MODELS: Record<string, { name: string; provider: string; service?: boolean }> = {
  haiku: { name: 'Claude Haiku 4.5', provider: 'Anthropic' }, sonnet: { name: 'Claude Sonnet 5', provider: 'Anthropic' }, te3large: { name: 'Qwen3 Embedding 8B', provider: 'OpenRouter' },
  rerank35: { name: 'Voyage rerank-2.5', provider: 'OpenRouter' }, gpt5: { name: 'GPT-6 Luna', provider: 'OpenAI' }, mlarge: { name: 'Mistral Medium 3.5', provider: 'Mistral AI' },
  svc: { name: 'Service RISE', provider: 'Traitement interne', service: true },
};

const results: Array<{ step: string; ok: boolean; detail?: string }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok, detail }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };

async function launch(): Promise<Browser> {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

/** État visible de l'écran : vignettes, lignes de la cascade (nom, pastille, barre), totaux, courbe. */
const read = (page: Page) => page.evaluate(() => {
  const root = document.querySelector('[data-screen-label="Analyse des temps de réponse"]') as HTMLElement;
  const txt = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const tiles = Array.from(root.querySelectorAll('button[role="radio"]')).map((b) => ({ text: txt(b), on: b.getAttribute('aria-checked') === 'true' }));
  const bars = Array.from(root.querySelectorAll('span')).filter((s) => (s as HTMLElement).style.transition.includes('left')) as HTMLElement[];
  const rows = bars.map((b) => {
    const row = b.closest('div[style*="grid-template-columns"]') as HTMLElement;
    // Pastille d'erreur : son détail est dans son nom accessible (plus d'infobulle depuis le 10/10/2026).
    const pill = (Array.from(row.querySelectorAll('span[aria-label]')).find((s) => (s.textContent || '').trim()) as HTMLElement) || null;
    const head = row.previousElementSibling && /^[A-ZÉ ]+$/.test(txt(row.previousElementSibling)) ? txt(row.previousElementSibling) : '';
    const label = row.firstElementChild!.querySelector(':scope > div > div');
    return { name: txt(label), head, left: parseFloat(b.style.left), width: parseFloat(b.style.width), ring: b.style.boxShadow.includes('240, 123, 103') || b.style.boxShadow.includes('#f07b67'), pill: pill ? pill.getAttribute('aria-label') : null, value: txt(row.lastElementChild) };
  });
  const svg = root.querySelector('svg[role="img"]');
  const points = svg ? svg.querySelectorAll('circle').length : 0;
  const errDots = svg ? Array.from(svg.querySelectorAll('circle')).filter((c) => c.getAttribute('r') === '5').length : 0;
  const title = txt(Array.from(root.querySelectorAll('div')).find((d) => (d as HTMLElement).style.fontSize === '17px') ?? null);
  const band = txt(root.querySelector('b')?.parentElement ?? null);
  const day = txt(Array.from(root.querySelectorAll('span')).find((s) => (s as HTMLElement).style.minWidth === '124px') ?? null);
  const next = root.querySelector('button[aria-label="Jour suivant"]') as HTMLElement | null;
  return { tiles, rows, points, errDots, title, band, day, nextOff: next ? next.style.opacity === '0.3' : null, svgSig: svg ? svg.innerHTML.length + ':' + (svg.querySelector('path')?.getAttribute('d') ?? '') : '' };
});

async function main() {
  const browser = await launch();
  const errors: string[] = [];
  try {
    // Veille du serveur, puis jeu de mesures (un jour laissé vide).
    const ov = await (await fetch(`${API}/api/auth/dev-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId: 'u1' }) })).json();
    const token = ov.accessToken ?? ov.token;
    const date = (await (await fetch(`${API}/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } })).json()).date as string;
    const end = addDays(String(date).slice(0, 10), -LATENCY_END_OFFSET_DAYS); // dernier jour des périodes
    const empty = addDays(end, -EMPTY_BACK);
    const rows = latencyFixture(end, 183).filter((r) => parisDay(r.startedAt) !== empty) as TimingRow[];

    const page = await newPage(browser, { errors });
    // API des temps de réponse servie dans le navigateur (mêmes règles que le serveur) : aucune écriture en base.
    await page.route(/\/api\/ai\/latency(\/series)?\?/, (route) => {
      const u = new URL(route.request().url()), q = Object.fromEntries(u.searchParams);
      const period = isLatencyPeriod(q.period) ? q.period : '7';
      const r = latencyRange(period, period === 'd' ? q.day || null : null, end);
      if ('error' in r) return route.fulfill({ status: 400, json: { code: 'BAD_REQUEST', message: r.error } });
      const at = latencyInstants(r.from, r.to), mine = rows.filter((x) => x.startedAt >= at.gte && x.startedAt < at.lt);
      const json = u.pathname.endsWith('/series')
        ? buildLatencySeries(mine, period, r.from, r.to, q.axis === 'mod' ? 'mod' : 'cat', q.id)
        : { ...buildLatencyReport(mine, period, r.from, r.to), models: MODELS };
      return route.fulfill({ status: 200, json });
    });
    await page.goto(`${API}/Console%20Admin.dc.html?as=u1`, { waitUntil: 'load' });
    await page.waitForSelector('text=Vue d’ensemble', { timeout: 30000 });
    // Sidebar : groupe IA déplié (après le chargement initial de la Console), puis l'entrée.
    await page.waitForTimeout(2000);
    for (let i = 0; i < 3 && (await page.locator('button[aria-label^="IA"][aria-expanded="true"]').count()) === 0; i++) {
      await page.click('button[aria-label^="IA"]');
      await page.waitForTimeout(1000);
    }
    await page.locator('#sb-ia').getByText('Analyse des temps de réponse', { exact: true }).click();
    await page.waitForSelector('[data-screen-label="Analyse des temps de réponse"] button[role="radio"]', { timeout: 20000 });
    await page.waitForFunction(() => !document.body.textContent!.includes('Chargement…'), null, { timeout: 20000 });
    await page.waitForTimeout(500);

    // 1. 7 jours, par catégorie : 6 vignettes ; Base de connaissance sélectionnée ; 4 étapes + Bout en bout.
    let s = await read(page);
    const kbTile = s.tiles.find((x) => x.on);
    // Les vraies mesures de la base (questions posées à Jev) peuvent ajouter des étapes (Formulation de la requête) :
    // les 4 étapes du jeu de mesures doivent figurer dans l'ordre, et Bout en bout en dernier.
    const names = s.rows.map((r) => r.name), want = ['Routage', 'Vectorisation', 'Reclassement', 'Génération'];
    const inOrder = want.every((n, i) => names.indexOf(n) >= 0 && (i === 0 || names.indexOf(n) > names.indexOf(want[i - 1])));
    check('1. 6 vignettes, Base de connaissance sélectionnée, 4 étapes et Bout en bout', s.tiles.length === 6 && !!kbTile?.text.startsWith('Base de connaissance') && inOrder && names[names.length - 1] === 'Bout en bout', JSON.stringify(names));

    // 2. Chaque barre commence à la fin de la précédente.
    const gaps = s.rows.slice(1, -1).map((r, i) => Math.abs(r.left - (s.rows[i].left + s.rows[i].width)));
    check('2. barres en cascade (début = fin de la précédente)', gaps.every((g) => g < 0.02), gaps.map((g) => g.toFixed(3)).join(' '));

    // 3. Reclassement : liseré et pastille corail, type « Délai dépassé (5 s) » en infobulle.
    const rrk = s.rows.find((r) => r.name === 'Reclassement');
    check('3. Reclassement en erreur (liseré, pastille, infobulle)', !!rrk && rrk.ring && !!rrk.pill?.includes('Délai dépassé (5 s)'), rrk?.pill ?? 'absent');

    // Changement de période : vignettes, cascade, courbe et totaux mis à jour.
    const before = s;
    await page.getByRole('tab', { name: '1 mois', exact: true }).click();
    await page.waitForFunction((b) => { const t = document.querySelector('[data-screen-label="Analyse des temps de réponse"] button[role="radio"]'); return !!t && t.textContent !== b; }, before.tiles[0].text, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    s = await read(page);
    check('période → toutes les zones changent (vignettes, cascade, courbe, totaux)', s.tiles[0].text !== before.tiles[0].text && JSON.stringify(s.rows.map((r) => [r.value, r.pill])) !== JSON.stringify(before.rows.map((r) => [r.value, r.pill])) && s.svgSig !== before.svgSig && s.band !== before.band && s.points === 29, `${before.band} → ${s.band} ; ${s.points} points (30 jours, dont 1 sans mesure) ; vignette ${before.tiles[0].text} → ${s.tiles[0].text} ; bout en bout ${before.rows[before.rows.length - 1].value} → ${s.rows[s.rows.length - 1].value} ; courbe ${before.svgSig !== s.svgSig}`);

    // 4. Jour : « suivant » désactivé sur la veille ; « précédent » change la date et les valeurs.
    await page.getByRole('tab', { name: 'Jour', exact: true }).click();
    await page.waitForTimeout(1200);
    const d0 = await read(page);
    await page.getByRole('button', { name: 'Jour précédent' }).click();
    await page.waitForTimeout(1200);
    const d1 = await read(page);
    check('4. Jour : suivant désactivé sur le dernier jour (aujourd’hui) ; précédent change la date et les valeurs', d0.nextOff === true && d0.day.includes(LATENCY_END_OFFSET_DAYS ? 'hier' : 'aujourd’hui') && d1.day !== d0.day && d1.nextOff === false && d1.rows[d1.rows.length - 1]?.value !== d0.rows[d0.rows.length - 1]?.value, `${d0.day} → ${d1.day}`);

    // 7. Jour sans traitement : « Aucun traitement sur la période », sans erreur.
    for (let i = 1; i < EMPTY_BACK; i++) { await page.getByRole('button', { name: 'Jour précédent' }).click(); await page.waitForTimeout(150); }
    await page.waitForFunction(() => document.body.textContent!.includes('Aucun traitement sur la période'), null, { timeout: 15000 }).catch(() => {});
    const e = await read(page);
    check('7. jour sans prompt : « Aucun traitement sur la période »', e.title === 'Aucun traitement sur la période' && e.tiles.length === 0, e.title);

    // 5. Par modèle › Claude Haiku 4.5 : Par étape = Routage et Génération ; Par catégorie = 6 catégories.
    await page.getByRole('tab', { name: '7 jours', exact: true }).click();
    await page.getByRole('tab', { name: 'Par modèle' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('radio', { name: haikuName }).click();
    await page.waitForTimeout(500);
    s = await read(page);
    const idxSt = s.rows.findIndex((r) => r.head === 'PAR ÉTAPE'), idxCat = s.rows.findIndex((r) => r.head === 'PAR CATÉGORIE DE PROMPT');
    const steps = s.rows.slice(idxSt).map((r) => r.name), cats = s.rows.slice(idxCat, idxSt).map((r) => r.name);
    check(`5. Par modèle › ${haikuName} : Routage et Génération ; 6 catégories`, JSON.stringify(steps) === JSON.stringify(['Routage', 'Génération']) && cats.length === 6, `${steps.join(', ')} ; ${cats.length} catégories`);

    // 6. 3 et 6 mois : 13 et 27 points par semaine, points d'erreur à leur semaine.
    await page.getByRole('tab', { name: 'Par catégorie de prompt' }).click();
    await page.getByRole('tab', { name: '3 mois', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-screen-label="Analyse des temps de réponse"] svg[role="img"] circle').length >= 13, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(500);
    const m3 = await read(page);
    await page.getByRole('tab', { name: '6 mois', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-screen-label="Analyse des temps de réponse"] svg[role="img"] circle').length > 20, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(500);
    const m6 = await read(page);
    check('6. 3 et 6 mois : 13 et 27 points, erreurs placées', m3.points === 13 && m6.points === 27 && m3.errDots > 0 && m6.errDots > 0, `${m3.points} / ${m6.points} points, ${m3.errDots} / ${m6.errDots} en erreur`);

    // Ressources externes bloquées par le banc (polices Google) : sans rapport avec l'écran.
    const real = errors.filter((e) => !/Failed to load resource: net::ERR_FAILED/.test(e));
    check('aucune erreur dans la console du navigateur', real.length === 0, real.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  const ko = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ko.length}/${results.length} vérifications réussies`);
  process.exit(ko.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
