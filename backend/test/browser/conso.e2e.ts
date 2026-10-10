/// <reference lib="dom" />
/**
 * Recette navigateur de l'écran « Consommation et coûts » (CONSO - specification.md, 02/10/2026), points 1 à 7.
 *
 * Usage (application démarrée, AUTH_DEV=true) :
 *   cd backend && npx ts-node --transpile-only test/browser/conso.e2e.ts
 * Variable : CONSOLE_URL (défaut http://localhost:3302, serveur de recette sur la base de test — jamais l'application réelle, dont la base serait polluée : 10/10/2026).
 *
 * Rien n'est écrit dans la base : les routes de l'écran (`/usage/month`, `/usage/daily`, `/usage/calls`,
 * `/usage/calls.csv`, `PUT /budget-thresholds/:id`) sont interceptées et servies par un jeu de données de test
 * dont les plafonds évoluent avec les enregistrements de l'écran (persistance vérifiée après rechargement).
 */
import { chromium, Browser, Page } from 'playwright';
import { newPage } from './harness';
import { addDays } from '../../src/domain/dates';

const API = process.env.CONSOLE_URL || 'http://localhost:3302';
const TODAY = '2026-10-02';
const LINES = ['insights', 'rapports', 'guidage', 'docs', 'crud'];
const SPENT: Record<string, number> = { insights: 0.56, rapports: 0, guidage: 0.13, docs: 0.18, crud: 0.01 };
const PROJ: Record<string, number> = { insights: 3.5, rapports: 0, guidage: 4.0, docs: 2.14, crud: 0.1 };
const MODELS: Record<string, string[]> = { insights: ['Claude Sonnet 5'], rapports: ['Claude Sonnet 5'], guidage: ['Claude Haiku 4.5'], docs: ['Claude Sonnet 5', 'Voyage rerank-2.5', 'Qwen3 Embedding 8B'], crud: ['GPT-6 Luna'] };
const PRICE = { anthropic: [2.62, 13.1], openai: [1.1, 8.8] } as const;

const results: Array<{ step: string; ok: boolean; detail?: string }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok, detail }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };

async function launch(): Promise<Browser> {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

/** Plafonds du jeu de test, modifiés par les PUT de l'écran. */
const caps: Record<string, { limitEur: number | null; warnPct: number; enabled: boolean }> = Object.fromEntries([['all', { limitEur: 100, warnPct: 80, enabled: true }], ...LINES.map((l) => [l, { limitEur: l === 'insights' ? 50 : 10, warnPct: 80, enabled: true }])]);
const month = () => ({
  today: TODAY, monthStart: '2026-10-01', monthEnd: '2026-10-31', spent: 0.88, projection: 9.74, rate7d: 0.31, sameDateLastMonth: 0, tokensMonth: 780000,
  dailyCumul: [{ date: '2026-10-01', spent: 0.8 }, { date: '2026-10-02', spent: 0.88 }], fallbackDays: [], crossDate: null,
  byFunction: LINES.map((l) => ({ functionId: l, spent: SPENT[l], tokensIn: 0, tokensOut: 0, fallbackCost: 0, models: MODELS[l] })),
  thresholds: [{ id: 'all', ...caps.all, spent: 0.88, projection: 9.74 }, ...LINES.map((l) => ({ id: l, ...caps[l], spent: SPENT[l], projection: PROJ[l] }))],
});
/** Appels d'une période et d'une ligne : 2 par jour et par ligne (le premier lit le cache), du plus récent au plus ancien. */
function callsOf(from: string, to: string, fn: string | null) {
  const out: any[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) {
    for (const [i, l] of LINES.entries()) {
      if (fn && fn !== l) continue;
      for (let k = 0; k < 2; k++) {
        const pv = l === 'crud' ? 'openai' : 'anthropic', [pin, pout] = PRICE[pv], tin = 9000 + i * 700 + k * 113, tout = 300 + i * 40 + k * 7;
        const cr = k === 0 && pv === 'anthropic' ? 6000 : 0, cw = k === 0 && pv === 'anthropic' ? 1000 : 0, billed = tin - cr - cw + cr * 0.1 + cw * 1.25;
        out.push({ id: `req_${d.replace(/-/g, '')}${l.slice(0, 3)}${k}`, at: `${d}T${String(19 - i).padStart(2, '0')}:${k ? 12 : 47}:00Z`, fn: l, step: l, modelName: MODELS[l][0], provider: pv, providerName: pv === 'openai' ? 'OpenAI' : 'Anthropic',
          tokensIn: tin, tokensOut: tout, requests: 0, priceIn: pin, priceOut: pout, pricePer1k: null, costEur: Math.round(((billed * pin + tout * pout) / 1e6) * 1e6) / 1e6, durationMs: 4000 + i * 900, cacheRead: cr, cacheWrite: cw, billedIn: billed });
      }
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}
function dailyOf(from: string, to: string, fn: string | null, byHour: boolean) {
  const calls = callsOf(from, to, fn);
  const pts = byHour ? Array.from({ length: 24 }, (_, h) => ({ date: from, hour: h, tokensIn: 0, tokensOut: 0, costIn: 0, costOut: 0, calls: 0 })) : [] as any[];
  if (!byHour) for (let d = from; d <= to; d = addDays(d, 1)) pts.push({ date: d, tokensIn: 0, tokensOut: 0, costIn: 0, costOut: 0, calls: 0 });
  for (const c of calls) {
    const p = byHour ? pts[(+c.at.slice(11, 13) + 2) % 24] : pts.find((x) => x.date === c.at.slice(0, 10));
    if (!p) continue;
    p.tokensIn += c.tokensIn; p.tokensOut += c.tokensOut; p.costOut += (c.tokensOut * c.priceOut) / 1e6; p.costIn += c.costEur - (c.tokensOut * c.priceOut) / 1e6; p.calls++;
  }
  return pts;
}

/** État visible : bandeau, en-tête du graphique, compteurs, tuiles, journal. */
const read = (page: Page) => page.evaluate(() => {
  const root = document.querySelector('[data-screen-label="Consommation et coûts"] [data-screen-label="Consommation et coûts"]') as HTMLElement
    ?? document.querySelector('[data-screen-label="Consommation et coûts"]') as HTMLElement;
  const txt = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const band = root.children[1] as HTMLElement;
  const tiles = Array.from(root.querySelectorAll('div[role="button"]')).map((t) => ({ text: txt(t), on: t.getAttribute('aria-pressed') === 'true', top: Math.round(t.getBoundingClientRect().top) }));
  const rows = Array.from(root.querySelectorAll('button[aria-expanded]')).map((b) => Array.from(b.children).map((c) => txt(c)));
  const chip = Array.from(band.querySelectorAll('button')).find((b) => txt(b).endsWith('×'));
  const svg = band.querySelector('svg');
  const projEl = band.querySelector('span[style*="56px"]');
  const tabs = band.querySelector('div[role="tablist"]');
  return {
    proj: txt(projEl), note: txt(projEl?.parentElement?.nextElementSibling ?? null),
    head: txt(tabs?.parentElement?.firstElementChild ?? null), counters: txt(band.lastElementChild), chip: chip ? txt(chip) : null,
    svgText: svg ? Array.from(svg.querySelectorAll('text')).map((t) => t.textContent).join(' | ') : '', tiles, rows,
    jCount: txt(Array.from(root.querySelectorAll('span')).find((s) => /appels? ·/.test(s.textContent ?? '')) ?? null),
    detail: txt(Array.from(root.querySelectorAll('div')).find((x) => /^requête\s*req_/.test((x.textContent ?? '').trim()) && !!x.querySelector('span')) ?? null),
  };
});

async function main() {
  const browser = await launch();
  const errors: string[] = [];
  const seen: { calls: string[]; daily: string[]; csv: string[]; puts: Array<{ id: string; body: any }> } = { calls: [], daily: [], csv: [], puts: [] };
  try {
    const page = await newPage(browser, { errors });
    await page.route(/\/api\/admin\/(usage\/(month|daily|calls(\.csv)?)|budget-thresholds\/[a-z]+)(\?|$)/, async (route) => {
      const req = route.request(), u = new URL(req.url()), q = Object.fromEntries(u.searchParams), fn = q.fn || null;
      if (u.pathname.endsWith('/usage/month')) return route.fulfill({ json: month() });
      if (u.pathname.includes('/budget-thresholds/') && req.method() === 'PUT') {
        const id = u.pathname.split('/').pop()!, body = req.postDataJSON();
        seen.puts.push({ id, body }); caps[id] = { limitEur: body.limitEur, warnPct: body.warnPct, enabled: body.enabled };
        return route.fulfill({ json: { id, ...caps[id] } });
      }
      if (u.pathname.endsWith('/usage/daily')) { seen.daily.push(u.search); return route.fulfill({ json: dailyOf(q.from, q.to, fn, q.by === 'hour') }); }
      const all = callsOf(q.from, q.to, fn);
      if (u.pathname.endsWith('/calls.csv')) {
        seen.csv.push(u.search);
        const csv = '﻿' + ['Date;Fonction;Modèle;Requête;Coût (€)', ...all.map((c) => [c.at, c.fn, c.modelName, c.id, String(c.costEur).replace('.', ',')].join(';'))].join('\r\n');
        return route.fulfill({ status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="journal.csv"' }, body: csv });
      }
      seen.calls.push(u.search);
      const off = Number(q.cursor || 0), lim = Number(q.limit || 30), items = all.slice(off, off + lim);
      return route.fulfill({ json: { items, nextCursor: off + lim < all.length ? String(off + lim) : null, total: all.length } });
    });
    const open = async () => {
      await page.goto(`${API}/Console%20Admin.dc.html?as=u1`, { waitUntil: 'load' });
      await page.waitForSelector('text=Vue d’ensemble', { timeout: 30000 });
      await page.waitForTimeout(2000);
      // Groupe IA de la barre latérale : déplié s'il ne l'est pas (la page active peut l'ouvrir d'elle-même).
      const ia = page.locator('#sb-ia');
      for (let i = 0; i < 3 && (await page.locator('button[aria-controls="sb-ia"][aria-expanded="true"]').count()) === 0; i++) { await page.locator('button[aria-controls="sb-ia"]').click(); await page.waitForTimeout(1000); }
      const items = await ia.innerText();
      await ia.getByText('Consommation et coûts', { exact: true }).click();
      await page.waitForSelector('[data-screen-label="Consommation et coûts"] button[aria-expanded]', { timeout: 20000 });
      await page.waitForTimeout(800);
      return items;
    };
    const menu = await open();
    check('menu IA : une seule entrée « Consommation et coûts » (ni Vue générale des coûts, ni Journal)', menu.includes('Consommation et coûts') && !menu.includes('Vue générale des coûts') && !menu.includes('Journal consommation'), menu.replace(/\s+/g, ' '));

    // 1. Période : graphique, compteurs et journal changent ; le budget du mois ne bouge pas.
    await page.getByRole('tab', { name: 'Coûts', exact: true }).click();
    await page.waitForTimeout(300);
    const a = await read(page), nCalls = seen.calls.length;
    await page.getByRole('tab', { name: '7 j', exact: true }).click();
    await page.waitForTimeout(1200);
    const b = await read(page), last = new URLSearchParams(seen.calls[seen.calls.length - 1]);
    check('1. période → graphique, compteurs et journal mis à jour, budget inchangé', seen.calls.length > nCalls && last.get('from') === addDays(TODAY, -6) && a.head !== b.head && a.counters !== b.counters && a.jCount !== b.jCount && a.proj === b.proj && a.note === b.note,
      `${a.jCount} → ${b.jCount} ; projection ${a.proj} → ${b.proj}`);

    // 2. Tuile : filtre ; nouveau clic ou « × » : retrait.
    await page.locator('div[role="button"]', { hasText: 'Insights' }).click();
    await page.waitForTimeout(1200);
    const f1 = await read(page), q1 = new URLSearchParams(seen.calls[seen.calls.length - 1]);
    const onlyIns = f1.rows.every((r) => r[1] === 'Insights');
    await page.locator('div[role="button"]', { hasText: 'Insights' }).click();
    await page.waitForTimeout(1000);
    const f2 = await read(page);
    await page.locator('div[role="button"]', { hasText: 'Documents' }).click();
    await page.waitForTimeout(1000);
    const f3 = await read(page);
    await page.getByRole('button', { name: 'Documents ×' }).click();
    await page.waitForTimeout(1000);
    const f4 = await read(page);
    check('2. clic sur une tuile filtre graphique, compteurs et journal ; nouveau clic ou « × » retire le filtre', q1.get('fn') === 'insights' && onlyIns && f1.chip === 'Insights ×' && f1.counters !== b.counters && f2.chip === null && f3.chip === 'Documents ×' && f4.chip === null && !new URLSearchParams(seen.calls[seen.calls.length - 1]).get('fn'),
      `puce ${f1.chip} / ${f2.chip} / ${f3.chip} / ${f4.chip}`);

    // 3. Plafond et seuil d'une tuile : barre, « x % → y % » et statut recalculés, enregistrés, relus.
    const tile = page.locator('div[role="button"]', { hasText: 'Insights' });
    const t0 = await read(page);
    await tile.getByRole('spinbutton', { name: 'Plafond' }).fill('4');
    await page.waitForTimeout(1600);
    await tile.getByRole('button', { name: 'Monter l’alerte' }).click();
    await page.waitForTimeout(1200);
    const t1 = await read(page), ins1 = t1.tiles.find((x) => x.text.startsWith('Insights'))!.text;
    const put = seen.puts.filter((p) => p.id === 'insights');
    check('3a. plafond 4 € et alerte 85 % : statut et « x % → y % » recalculés', ins1.includes('14 % → 88 % fin de mois') && ins1.includes('Alerte projetée') && ins1.includes('85 %') && ins1 !== t0.tiles.find((x) => x.text.startsWith('Insights'))!.text, ins1);
    check('3b. enregistrés (PUT { limitEur, warnPct, enabled })', put.length >= 2 && put[put.length - 1].body.limitEur === 4 && put[put.length - 1].body.warnPct === 85 && put[put.length - 1].body.enabled === true, JSON.stringify(put.map((p) => p.body)));
    await tile.getByRole('spinbutton', { name: 'Plafond' }).fill('3');
    await page.waitForTimeout(1600);
    const ins2 = (await read(page)).tiles.find((x) => x.text.startsWith('Insights'))!.text;
    check('3c. plafond sous la projection → Dépassement projeté', ins2.includes('Dépassement projeté') && ins2.includes('19 % → 117 % fin de mois'), ins2);

    // 4. Graphique Budget : plafond et alerte globaux ; note en dépassement quand la projection dépasse le plafond.
    await page.getByRole('tab', { name: 'Budget', exact: true }).click();
    await page.waitForTimeout(400);
    const g0 = await read(page);
    await page.getByRole('spinbutton', { name: 'Plafond global' }).fill('9');
    await page.waitForTimeout(1600);
    await page.getByRole('button', { name: 'Baisser l’alerte globale' }).click();
    await page.waitForTimeout(1200);
    const g1 = await read(page);
    check('4. Budget : plafond et alerte globaux suivis ; note « Dépassement projeté »', g0.note.startsWith('Reste 90,26 €') && g0.svgText.includes('Plafond 100 €') && g1.svgText.includes('Plafond 9 €') && g1.svgText.includes('Alerte 75 % · 7 €') && g1.note === 'Dépassement projeté de 0,74 € en fin de mois.',
      `${g0.note} → ${g1.note}`);

    // Persistance : après rechargement, plafonds relus.
    await open();
    const r = await read(page);
    const pl = await page.locator('div[role="button"]', { hasText: 'Insights' }).getByRole('spinbutton', { name: 'Plafond' }).inputValue();
    check('3d / 4b. après rechargement : plafonds et seuils conservés', pl === '3' && (await page.getByRole('spinbutton', { name: 'Plafond global' }).inputValue()) === '9' && r.tiles.find((x) => x.text.startsWith('Insights'))!.text.includes('85 %'), `Insights ${pl} €`);

    // 5. Détail d'un appel avec cache : le résultat du calcul est le coût de la ligne.
    const first = page.locator('[data-screen-label="Consommation et coûts"] [data-screen-label="Consommation et coûts"] button[aria-expanded]').first();
    await first.click();
    await page.waitForTimeout(400);
    const d = await read(page), line = d.rows[0], cost = line[line.length - 1];
    check('5. détail : requête, durée, calcul dont le résultat = coût de la ligne', d.detail.includes('req_') && /durée\s*\d+,\d s/.test(d.detail) && d.detail.endsWith('= ' + cost) && d.detail.includes('lus en cache'), `${d.detail} | ligne ${cost}`);

    // Pagination au défilement.
    const n0 = d.rows.length;
    await page.mouse.wheel(0, 20000);
    await page.waitForTimeout(1500);
    const n1 = (await read(page)).rows.length;
    check('pagination au défilement (30 appels par page)', n0 === 30 && n1 > n0, `${n0} → ${n1}`);

    // 6. Export : exactement le journal affiché (période et fonction).
    await page.getByRole('tab', { name: 'Jour', exact: true }).click();
    await page.locator('div[role="button"]', { hasText: 'Guidage console' }).click();
    await page.waitForTimeout(1200);
    const e = await read(page);
    await page.getByRole('button', { name: 'Exporter en CSV' }).click();
    await page.waitForTimeout(1200);
    const cq = new URLSearchParams(seen.csv[seen.csv.length - 1] || ''), lq = new URLSearchParams(seen.calls[seen.calls.length - 1]);
    const rows = callsOf(cq.get('from')!, cq.get('to')!, cq.get('fn'));
    check('6. export CSV : même période et même fonction que le journal affiché', seen.csv.length === 1 && cq.get('fn') === 'guidage' && cq.get('from') === lq.get('from') && cq.get('to') === lq.get('to') && cq.get('from') === TODAY && e.jCount.startsWith(`${rows.length} appel`) && e.rows.length === rows.length && e.rows.every((x) => x[1] === 'Guidage console'), `${e.jCount} ; CSV ${rows.length} lignes`);

    // 7. Lisible à 900 et 1 440 px : aucun débordement horizontal, valeurs entières, tuiles en 3 + 2 à 900 px.
    for (const w of [1440, 900]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(900);
      const lay = await page.evaluate(() => {
        const root = document.querySelector('[data-screen-label="Consommation et coûts"]') as HTMLElement;
        const cut = Array.from(root.querySelectorAll('span, b')).filter((el) => {
          const s = getComputedStyle(el); if (s.whiteSpace !== 'nowrap' || s.textOverflow === 'ellipsis' || !el.textContent?.trim()) return false;
          return el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && s.display !== 'inline';
        }).map((el) => el.textContent!.trim()).slice(0, 5);
        const ell = Array.from(root.querySelectorAll('span')).filter((el) => getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent!.trim()).slice(0, 5);
        // Lignes du journal : la dernière colonne (coût) entière, dans la ligne.
        const rowCut = Array.from(root.querySelectorAll('button[aria-expanded]')).filter((b) => { const last = b.lastElementChild as HTMLElement, r = b.getBoundingClientRect(), c = last.getBoundingClientRect(); return b.scrollWidth > b.clientWidth + 1 || c.right > r.right + 1; }).length;
        const tops = Array.from(root.querySelectorAll('div[role="button"]')).map((t) => Math.round(t.getBoundingClientRect().top));
        const rows: number[] = []; tops.forEach((t) => { if (!rows.some((r) => Math.abs(r - t) < 8)) rows.push(t); }); // tuile active : relevée de 2 px
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, rootOverflow: root.scrollWidth - root.clientWidth, cut, ell, rowCut, perRow: rows.map((r) => tops.filter((t) => Math.abs(r - t) < 8).length), width: Math.round(root.getBoundingClientRect().width) };
      });
      await page.screenshot({ path: `${process.env.TEMP || '/tmp'}/conso-${w}.png`, fullPage: true });
      check(`7. ${w} px : pas de débordement, aucun texte coupé${w === 900 ? ', tuiles en 3 + 2' : ''}`, lay.overflow <= 0 && lay.rootOverflow <= 1 && lay.cut.length === 0 && lay.ell.length === 0 && lay.rowCut === 0 && lay.perRow.join('+') === (w === 900 ? '3+2' : '5'), JSON.stringify(lay));
    }
    const js = errors.filter((e) => !e.startsWith('Failed to load resource')); // polices et bibliothèques coupées par le banc
    check('aucune erreur JS', js.length === 0, js.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  const ko = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ko.length}/${results.length} vérifications réussies`);
  process.exit(ko.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
