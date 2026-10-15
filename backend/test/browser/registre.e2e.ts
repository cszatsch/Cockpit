/// <reference lib="dom" />
/**
 * Recette navigateur du Registre des cartes API (maquette « tuiles symétriques », 15/10/2026).
 *
 * Phase 1 : les 40 cartes fictives de la maquette remplacent la liste du serveur (réponse de `GET /api-cards`
 * interceptée) — affichage, compteurs, mosaïque, filtres combinés, tri, recherche, clavier ; une écriture sur une carte
 * fictive est refusée par le serveur (404) : retour visible à l'état d'avant et message.
 * Phase 2 : vraies cartes de la base — widget associé puis dissocié, nom modifié puis rétabli, suppression annulée.
 *
 * Usage (application démarrée sur la base de test, AUTH_DEV=true) :
 *   cd backend && npx ts-node --transpile-only test/browser/registre.e2e.ts
 * Variable : CONSOLE_URL (défaut http://localhost:3101 — jamais l'application réelle, dont la base serait modifiée).
 */
import { Page } from 'playwright';
import { newPage, openBrowser } from './harness';

const API = process.env.CONSOLE_URL || 'http://localhost:3101';
const SHOTS = process.env.SHOTS_DIR || '';
const results: Array<{ step: string; ok: boolean; detail?: string }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok, detail }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };

// [id, nom, tag, endpoint, latence, quota %, échéance jj/mm/aa, widgets] — les 40 cartes fictives de la maquette.
const RAW: Array<[string, string, string, string, number, number | null, string | null, string]> = [
  ['bbc', 'BBC News', 'Actualités', 'https://feeds.bbci.co.uk/news/rss.xml', 41, null, null, 'news news_en'],
  ['gnews', 'GNews', 'Actualités', 'https://gnews.io/api/v4/top-headlines?lang=fr', 325, 5, '28/02/27', 'news_fr eco_fr'],
  ['monde', 'Le Monde', 'Actualités', 'https://www.lemonde.fr/rss/une.xml', 33, null, null, 'news_fr'],
  ['equipe', 'L’Équipe', 'Actualités', 'https://dwh.lequipe.fr/api/edito/rss', 33, null, null, 'sport_fr'],
  ['newsdata', 'NewsData.io', 'Actualités', 'https://newsdata.io/api/1/latest?country=fr', 418, 2, '28/02/27', 'tech_fr'],
  ['reuters', 'Reuters', 'Actualités', 'https://www.reuters.com/arc/outboundfeeds/rss/', 88, null, null, 'news_en eco_en'],
  ['guardian', 'The Guardian', 'Actualités', 'https://content.guardianapis.com/search', 142, 12, '15/01/27', 'news_en'],
  ['franceinfo', 'France Info', 'Actualités', 'https://www.francetvinfo.fr/titres.rss', 52, null, null, 'news_fr news'],
  ['echos', 'Les Échos', 'Actualités', 'https://services.lesechos.fr/rss/les-echos-economie.xml', 71, null, null, 'eco_fr'],
  ['nyt', 'NYT Top Stories', 'Actualités', 'https://api.nytimes.com/svc/topstories/v2/home.json', 196, 31, '30/11/26', 'news_en'],
  ['euronews', 'Euronews', 'Actualités', 'https://www.euronews.com/rss', 64, null, null, ''],
  ['afp', 'AFP Flux', 'Actualités', 'https://api.afp.com/v1/api/search', 357, 64, '31/03/27', 'news_fr'],
  ['finnhub', 'Finnhub', 'Finance', 'https://finnhub.io/api/v1/news?category=general', 185, null, '28/02/27', ''],
  ['alpha', 'Alpha Vantage', 'Finance', 'https://www.alphavantage.co/query?function=NEWS_SENTIMENT', 264, 48, '12/05/27', 'eco_en'],
  ['yahoo', 'Yahoo Finance', 'Finance', 'https://query1.finance.yahoo.com/v1/finance/trending/FR', 122, null, null, 'eco_fr'],
  ['bce', 'BCE · taux de change', 'Finance', 'https://data-api.ecb.europa.eu/service/data/EXR', 96, null, null, 'eco_fr eco_en'],
  ['bourso', 'Boursorama', 'Finance', 'https://www.boursorama.com/rss/actualites/', 78, null, null, 'eco_fr'],
  ['polygon', 'Polygon.io', 'Finance', 'https://api.polygon.io/v2/reference/news', 212, 22, '01/09/27', 'eco_en'],
  ['iex', 'IEX Cloud', 'Finance', 'https://cloud.iexapis.com/stable/stock/market/news', 448, 87, '20/12/26', ''],
  ['bdf', 'Banque de France', 'Finance', 'https://webstat.banque-france.fr/api/v1/data', 158, null, '14/02/27', 'eco_fr'],
  ['omgeo', 'Open-Meteo · géocodage', 'Météo', 'https://geocoding-api.open-meteo.com/v1/search?name=Paris', 136, null, null, 'meteo'],
  ['omfc', 'Open-Meteo · prévisions', 'Météo', 'https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35', 113, null, null, 'meteo'],
  ['mf', 'Météo-France', 'Météo', 'https://public-api.meteofrance.fr/public/DPObs/v1/station', 174, 9, '31/01/27', 'meteo'],
  ['ow', 'OpenWeather', 'Météo', 'https://api.openweathermap.org/data/3.0/onecall', 139, 18, '30/04/27', 'meteo'],
  ['wapi', 'WeatherAPI', 'Météo', 'https://api.weatherapi.com/v1/current.json', 109, 4, '15/06/27', ''],
  ['tomtom', 'TomTom Traffic', 'Trafic', 'https://api.tomtom.com/traffic/services/4/flowSegmentData', 114, 2, '31/12/26', 'trafic'],
  ['here', 'HERE Traffic', 'Trafic', 'https://data.traffic.hereapi.com/v7/flow', 167, 11, '30/09/27', 'trafic'],
  ['sytadin', 'Sytadin', 'Trafic', 'https://www.sytadin.fr/opendata/flux', 382, null, null, 'trafic'],
  ['waze', 'Waze Partner', 'Trafic', 'https://www.waze.com/partnerhub-api/feeds', 241, null, '31/08/27', ''],
  ['jina', 'Jina Reader', 'Stratégie', 'https://r.jina.ai/', 220, null, '30/06/27', ''],
  ['statista', 'Statista', 'Stratégie', 'https://api.statista.com/v1/statistics', 288, 35, '31/12/26', 'eco_fr'],
  ['gartner', 'Gartner Feed', 'Stratégie', 'https://www.gartner.com/en/newsroom/rss', 134, null, null, 'tech_en'],
  ['mck', 'McKinsey Insights', 'Stratégie', 'https://www.mckinsey.com/insights/rss', 117, null, null, ''],
  ['tc', 'TechCrunch', 'Tech', 'https://techcrunch.com/feed/', 59, null, null, 'tech_en'],
  ['verge', 'The Verge', 'Tech', 'https://www.theverge.com/rss/index.xml', 63, null, null, 'tech_en'],
  ['hn', 'Hacker News', 'Tech', 'https://hacker-news.firebaseio.com/v0/topstories.json', 47, null, null, 'tech_en'],
  ['01net', '01net', 'Tech', 'https://www.01net.com/actualites/feed/', 81, null, null, 'tech_fr'],
  ['espn', 'ESPN', 'Sports', 'https://site.api.espn.com/apis/site/v2/sports/soccer/news', 153, null, null, 'sport_en'],
  ['bbcsport', 'BBC Sport', 'Sports', 'https://feeds.bbci.co.uk/sport/rss.xml', 44, null, null, 'sport_en'],
  ['rmc', 'RMC Sport', 'Sports', 'https://rmcsport.bfmtv.com/rss/info/flux-rss/', 69, null, null, 'sport_fr'],
];
const FAKE = RAW.map(([id, name, category, endpoint, lat, q, key, w]) => ({
  id: 'fx-' + id, name, category, endpoint, enabled: true, status: 'ok', statusNote: null,
  latencyMedian24h: lat, latency24h: Array.from({ length: 24 }, (_, i) => Math.round(lat * (0.85 + ((i * 37) % 11) / 40))),
  quotaLimit: q == null ? null : 100, quotaUsed: q, keyLast4: key ? 'ab12' : null, keyExpiresAt: key ? `20${key.slice(6)}-${key.slice(3, 5)}-${key.slice(0, 2)}` : null,
  widgets: w ? w.split(' ') : [], authMode: 'HEADER', method: 'GET', body: null, feed: /rss|xml|feed/.test(endpoint),
  lastTest: id === 'bbc' ? { code: 200, ms: 40, at: new Date(Date.now() - 3600_000).toISOString(), body: '<?xml version="1.0"?>\n<rss version="2.0">\n  <channel>\n    <title>BBC News</title>\n  </channel>\n</rss>' } : null,
}));

async function openRegistry(page: Page) {
  await page.goto(`${API}/Console%20Admin.dc.html?as=u1`, { waitUntil: 'load' });
  const head = page.locator('aside button[aria-expanded]', { hasText: 'Plateforme' }).first();
  if ((await head.getAttribute('aria-expanded').catch(() => 'true')) === 'false') await head.click();
  await page.locator('aside').getByText('Registre des cartes API', { exact: true }).first().click();
  await page.waitForSelector('[data-tile="registre"] [role=tab]', { timeout: 30000 });
  await page.waitForTimeout(500);
}
const state = (page: Page) => page.evaluate(() => {
  const root = document.querySelector('.rg-root') as HTMLElement;
  const metrics = Array.from(root.querySelectorAll('[aria-label="Filtrer par état"] button')).map((b) => (b as HTMLElement).innerText.replace(/\s+/g, ' ').trim());
  const rows = Array.from(root.querySelectorAll('[data-row]')) as HTMLElement[];
  return {
    meta: (root.querySelector('header') as HTMLElement).innerText.split('\n')[2],
    metrics, tabs: root.querySelectorAll('[role=tab]').length, cells: root.querySelectorAll('[data-cell]').length,
    dim: Array.from(root.querySelectorAll('[data-cell]')).filter((c) => getComputedStyle(c).opacity === '0.22').length,
    rows: rows.map((r) => r.querySelector('span span')!.textContent), sel: rows.find((r) => r.getAttribute('aria-current') === 'true')?.querySelector('span span')!.textContent,
    lats: rows.map((r) => (r.children[1] as HTMLElement).innerText.trim()),
    title: (root.querySelector('[data-tile="detail"] h2') as HTMLElement | null)?.innerText,
    wCount: Array.from(root.querySelectorAll('[data-tile="detail"] span')).find((s) => /^(\d+ widgets?|Aucun widget)$/.test((s as HTMLElement).innerText))?.textContent,
    toast: (document.querySelector('.rg-root [role=status]') as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() || '',
    hScroll: document.documentElement.scrollWidth > innerWidth,
  };
});

async function main() {
  const browser = await openBrowser();
  const errors: string[] = [];
  try {
    const page = await newPage(browser, { errors });
    await page.setViewportSize({ width: 1440, height: 1000 });
    // ── Phase 1 : les 40 cartes fictives ──
    await page.route(/\/api\/admin\/api-cards$/, (r) => (r.request().method() === 'GET' ? r.fulfill({ json: FAKE }) : r.fallback()));
    await openRegistry(page);
    let s = await state(page);
    check('1. 40 cartes, 7 tags, une case par carte', s.meta.startsWith('40 cartes · 7 tags · dernière vérification') && s.tabs === 7 && s.cells === 40, s.meta);
    check('   compteurs : 35 opérationnelles, 5 lentes, 7 sans widget', s.metrics.join(' | ') === '35 Opérationnelles | 5 Lentes | 7 Sans widget', s.metrics.join(' | '));
    check('   premier tag ouvert, première carte sélectionnée', s.rows.length === 12 && s.sel === 'BBC News' && s.title === 'BBC News', `${s.rows.length} lignes · ${s.sel}`);
    const geo = await page.evaluate(() => Array.from(document.querySelectorAll('[data-tile]')).map((t) => { const r = t.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; }));
    check('   tuiles de même hauteur (800 px)', geo.every((g) => g.h === 800), JSON.stringify(geo));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/registre-1440.png`, fullPage: true });

    // 2. Filtres combinés : « Lentes » + recherche ; opacité des cases.
    await page.getByRole('button', { name: /Lentes/ }).click();
    await page.waitForTimeout(400); // fondu de 0,25 s des cases
    s = await state(page);
    check('2. « Lentes » : liste du tag filtrée, cases hors filtre à 22 %', s.rows.join(',') === 'GNews,NewsData.io,AFP Flux' && s.dim === 35, `${s.rows.join(',')} · ${s.dim} estompées`);
    await page.getByRole('textbox', { name: 'Rechercher une carte' }).fill('newsdata');
    await page.waitForTimeout(400);
    s = await state(page);
    check('   + recherche « newsdata » (nom ou endpoint)', s.rows.join(',') === 'NewsData.io' && s.dim === 39, `${s.rows.join(',')} · ${s.dim}`);
    await page.getByRole('button', { name: 'Tout afficher' }).click();
    await page.waitForTimeout(400);
    s = await state(page);
    check('   « Tout afficher » : 40 cartes, aucune estompée', s.rows.length === 40 && s.dim === 0, `${s.rows.length}`);

    // 3. Tri par latence : croissant, décroissant, aucun.
    const sortLat = page.getByRole('button', { name: 'Trier par latence 24 h' });
    await sortLat.click();
    const asc = (await state(page)).lats.map((l) => parseInt(l, 10));
    await sortLat.click();
    const desc = (await state(page)).lats.map((l) => parseInt(l, 10));
    await sortLat.click();
    const none = (await state(page)).rows;
    check('3. tri latence ↑ puis ↓ puis ordre d’origine', asc.every((v, i) => !i || v >= asc[i - 1]) && desc.every((v, i) => !i || v <= desc[i - 1]) && none[0] === 'BBC News', `${asc[0]}…${asc[39]} / ${desc[0]}…`);

    // 4. Clavier : flèche bas dans la liste sélectionne la ligne suivante ; mosaïque, flèche bas → tag suivant.
    await page.locator('[data-row]').first().focus();
    await page.keyboard.press('ArrowDown');
    s = await state(page);
    check('4. clavier : flèche bas → carte suivante sélectionnée', s.sel === 'GNews' && s.title === 'GNews', s.sel || '');
    await page.locator('[role=tab]').first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    s = await state(page);
    check('   mosaïque : flèche bas puis Entrée → tag « Finance »', s.rows.length === 8 && (await page.locator('[role=tab][aria-selected=true]').innerText()).startsWith('Finance'), `${s.rows.length} lignes`);

    // 5. Widget sur une carte fictive : mise à jour immédiate partout, puis refus du serveur (404) → retour et message.
    await page.locator('[data-row]', { hasText: 'Finnhub' }).click();
    const before = await state(page);
    await page.route(/\/api-cards\/fx-finnhub\/widgets$/, async (r) => { await new Promise((x) => setTimeout(x, 600)); return r.fallback(); });
    await page.locator('[data-widget="eco_fr"]').click();
    const during = await state(page);
    const mini = await page.evaluate(() => (document.querySelector('[aria-current=true]')!.lastElementChild as HTMLElement).innerText.trim());
    await page.waitForTimeout(2000);
    const after = await state(page);
    check('5. widget coché : compteur « Sans widget », nombre et mini-grille de la ligne, en-tête mis à jour aussitôt', before.metrics[2] === '7 Sans widget' && during.metrics[2] === '6 Sans widget' && during.wCount === '1 widget' && mini.startsWith('1'), `${during.metrics[2]} · ${during.wCount} · ${mini}`);
    check('   refus du serveur : retour à l’état d’avant et message', after.metrics[2] === '7 Sans widget' && after.wCount === 'Aucun widget' && /introuvable/i.test(after.toast), after.toast);

    // 6. Largeur 1100 px : pas de défilement horizontal.
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.waitForTimeout(300);
    check('6. 1100 px : pas de défilement horizontal', !(await state(page)).hScroll);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/registre-1100.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });

    // ── Phase 2 : vraies cartes de la base de test ──
    await page.unroute(/\/api\/admin\/api-cards$/);
    await openRegistry(page);
    s = await state(page);
    const real = s.sel!;
    await page.locator('[data-widget="tech_en"]').click();
    await page.waitForTimeout(1500);
    const pressed = await page.locator('[data-widget="tech_en"]').getAttribute('aria-pressed');
    await page.locator('[data-widget="tech_en"]').click();
    await page.waitForTimeout(1500);
    check('7. vraie carte : widget « Tech EN » associé puis dissocié (enregistré)', pressed === 'true' && (await page.locator('[data-widget="tech_en"]').getAttribute('aria-pressed')) === 'false', real);

    await page.getByRole('button', { name: 'Modifier' }).click();
    await page.getByRole('textbox', { name: 'Nom de la carte' }).fill('');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    const nErr = await page.getByText('Donnez un nom à la carte.').count();
    await page.getByRole('textbox', { name: 'Nom de la carte' }).fill(real + ' (essai)');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.waitForTimeout(1500);
    const renamed = (await state(page)).title;
    await page.getByRole('button', { name: 'Modifier' }).click();
    await page.getByRole('textbox', { name: 'Nom de la carte' }).fill(real);
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await page.waitForTimeout(1500);
    check('8. « Modifier » : nom vide refusé, nom enregistré puis rétabli', nErr === 1 && renamed === real + ' (essai)' && (await state(page)).title === real, `${renamed}`);

    await page.getByRole('button', { name: 'Supprimer la carte' }).click();
    const gone = await state(page);
    await page.locator('.rg-root [role=status]').getByRole('button', { name: 'Annuler' }).click();
    await page.waitForTimeout(5000);
    await openRegistry(page);
    check('9. suppression : message « « Nom » supprimée », Annuler → carte gardée (aucun DELETE)', gone.toast.startsWith(`« ${real} » supprimée`) && !gone.rows.includes(real) && (await state(page)).rows.includes(real), gone.toast);

    check('erreurs JavaScript de la page', errors.filter((e) => !/404|Failed to load resource/.test(e)).length === 0, errors.join(' | '));
  } finally {
    await browser.close();
  }
  const ko = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ko.length} / ${results.length} vérifications réussies`);
  process.exit(ko.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
