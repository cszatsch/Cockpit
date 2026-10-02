/// <reference lib="dom" />
/**
 * Recette navigateur de la vue « Fournisseurs et modèles » (livraison du 02/10/2026, 8 points).
 *
 * Usage (application démarrée, AUTH_DEV=true) :
 *   cd backend && npx ts-node --transpile-only test/browser/fournisseurs.e2e.ts
 * Variable : CONSOLE_URL (défaut http://localhost:3000).
 *
 * Rien n'est écrit dans la base : les appels de la Console à /providers, /models, /assignments et /functions sont
 * interceptés et servis par un double en mémoire, initialisé avec les vraies données (tests de clé simulés, états de
 * route, refus 409 d'un modèle affecté). Les règles du serveur elles-mêmes sont couvertes par test/e2e/fournisseurs.spec.ts.
 */
import { chromium, Browser, Page, Route } from 'playwright';
import { newPage } from './harness';

const API = process.env.CONSOLE_URL || 'http://localhost:3000';
const results: Array<{ step: string; ok: boolean; detail?: string }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok, detail }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };
async function launch(): Promise<Browser> { try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); } }

// ───── Double de l'API (mémoire) ─────
type Fake = { providers: any[]; models: any[]; functions: any[]; assignments: any[]; next: Record<string, 'OK' | 'ERROR'> };
const DOCS = ['doc_vec', 'doc_rrk', 'doc_syn'];
function states(f: Fake) {
  const ok = (mid: string | null) => { const m = f.models.find((x) => x.id === mid); return !!m && m.active && f.providers.find((p) => p.id === m.providerId)?.status === 'OK'; };
  let down = false;
  for (const a of f.assignments) a.state = ok(a.primary) ? 'NOMINAL' : a.fallback && ok(a.fallback) ? 'FALLBACK' : 'UNAVAILABLE';
  for (const id of DOCS) { const a = f.assignments.find((x) => x.functionId === id); if (!a) continue; if (down) a.state = 'BLOCKED'; else if (a.state === 'UNAVAILABLE') down = true; }
}
const usesOf = (f: Fake, id: string) => f.assignments.filter((a) => a.primary === id || a.fallback === id).map((a) => ({ entityType: 'MODEL_ASSIGNMENT', id: a.functionId, label: `${a.primary === id ? 'Principal' : 'Secours'} de ${a.functionId}` }));
async function serve(f: Fake, route: Route) {
  const req = route.request(), u = new URL(req.url()), path = u.pathname.replace('/api/admin', ''), m = req.method(), body = req.postDataJSON?.() ?? null;
  const json = (status: number, j: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(j) });
  const test = (p: any) => { if (f.next[p.id]) p.status = f.next[p.id]; p.lastTestedAt = new Date().toISOString(); return p; };
  if (path === '/providers' && m === 'GET') return json(200, f.providers);
  if (path === '/providers/test-all' && m === 'POST') { f.providers.forEach(test); states(f); return json(200, f.providers); }
  let r = path.match(/^\/providers\/([^/]+)\/test$/);
  if (r && m === 'POST') { const p = f.providers.find((x) => x.id === r![1]); test(p); states(f); return json(200, p); }
  r = path.match(/^\/providers\/([^/]+)\/key$/);
  if (r && m === 'PUT') { const p = f.providers.find((x) => x.id === r![1]); p.keyPrefix = ''; p.keyLast4 = body.apiKey.slice(-4); p.status = /invalide/.test(body.apiKey) ? 'ERROR' : 'OK'; p.lastTestedAt = new Date().toISOString(); states(f); return json(200, p); }
  if (path === '/providers' && m === 'POST') { const p = { id: body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: body.name, keyPrefix: '', keyLast4: body.apiKey.slice(-4), hasKey: true, status: /invalide/.test(body.apiKey) ? 'ERROR' : 'OK', lastTestedAt: new Date().toISOString(), lastError: null }; f.providers.push(p); return json(201, p); }
  if (path === '/models' && m === 'GET') return json(200, f.models);
  if (path === '/models' && m === 'POST') { const x = { id: body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), providerId: body.providerId, name: body.name, description: body.description, category: body.category, releaseDate: body.releaseDate, maxOutputTokens: body.maxOutputTokens, providerModelId: body.providerModelId, contextTokens: body.contextTokens, dimensions: body.dimensions, defaultDimension: body.defaultDimension, price: body.price, priceIn: body.price.in, priceOut: body.price.out, active: true }; f.models.push(x); return json(201, x); }
  r = path.match(/^\/models\/([^/]+)$/);
  if (r && m === 'PATCH') { const x = f.models.find((y) => y.id === r![1]); if (body.active === false && usesOf(f, x.id).length) return json(409, { code: 'MODEL_IN_USE', message: `${x.name} est affecté — réaffectez-le avant de le désactiver`, usages: usesOf(f, x.id) }); Object.assign(x, body); states(f); return json(200, x); }
  if (r && m === 'DELETE') { const id = r[1]; if (usesOf(f, id).length) return json(409, { code: 'IN_USE', message: 'Modèle utilisé', usages: usesOf(f, id) }); f.models = f.models.filter((y) => y.id !== id); return route.fulfill({ status: 204 }); }
  if (path === '/assignments' && m === 'GET') { states(f); return json(200, f.assignments); }
  if (path === '/assignments' && m === 'PUT') { for (const [fn, v] of Object.entries<any>(body)) { const a = f.assignments.find((x) => x.functionId === fn); a.primary = v.primary; a.fallback = v.fallback ?? null; if (v.dimension != null) a.dimension = v.dimension; } states(f); return json(200, f.assignments); }
  if (path === '/functions' && m === 'GET') return json(200, { functions: f.functions, groups: [] });
  return route.continue();
}

// ───── Lecture de l'écran ─────
const read = (page: Page) => page.evaluate(() => {
  const roots = document.querySelectorAll('[data-screen-label="Fournisseurs et modèles"]'), root = roots[roots.length - 1] as HTMLElement;
  const txt = (e: Element | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const band = root.children[1] as HTMLElement;
  const cells = Array.from(band.querySelectorAll(':scope > div:nth-child(2) > div')).map((c) => txt(c));
  const rows = Array.from(root.querySelectorAll('div')).filter((d) => (d as HTMLElement).style.gridTemplateColumns.startsWith('minmax(160px') && d.children.length >= 4 && !/FONCTION/.test(txt(d.children[0])));
  const fns = rows.map((rw) => {
    const btns = Array.from(rw.querySelectorAll('button')).filter((b) => (b as HTMLElement).style.height === '48px') as HTMLElement[];
    const chip = (b?: HTMLElement) => b ? { text: txt(b), bg: getComputedStyle(b).backgroundColor } : null;
    return { name: txt(rw.children[0]), p: chip(btns[0]), s: chip(btns[1]), cost: txt(rw.lastElementChild) };
  });
  const catalog = Array.from(root.querySelectorAll('div')).filter((d) => (d as HTMLElement).style.gridTemplateColumns.startsWith('minmax(0px, 2.3fr)') || (d as HTMLElement).style.gridTemplateColumns.startsWith('minmax(0, 2.3fr)')).slice(1).map((d) => ({ name: txt(d.children[0]), uses: txt(d.children[4]), on: d.querySelector('button[role="switch"]')?.getAttribute('aria-checked') }));
  const total = txt(Array.from(root.querySelectorAll('span')).find((s) => txt(s) === 'TOTAL')?.nextElementSibling ?? null);
  const filters = Array.from(root.querySelectorAll('[role="tablist"] button')).map((b) => txt(b));
  return { bandHead: txt(band.children[0]), cells, fns, catalog, total, filters, text: root.innerText };
});
const toastText = (page: Page) => page.evaluate(() => { const t = Array.from(document.querySelectorAll('div')).find((d) => (d as HTMLElement).style.position === 'fixed' && (d as HTMLElement).style.bottom === '28px'); return t ? (t.textContent || '').trim() : ''; });
const fnRow = (s: Awaited<ReturnType<typeof read>>, name: string) => s.fns.find((f) => f.name.startsWith(name))!;
const CORAL = 'rgb(255, 245, 242)', AMBER = 'rgb(255, 248, 236)';

async function main() {
  const browser = await launch();
  const errors: string[] = [];
  try {
    const lg: any = await (await fetch(`${API}/api/auth/dev-login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId: 'u1' }) })).json();
    const H = { Authorization: `Bearer ${lg.accessToken ?? lg.token}` };
    const get = async (p: string) => (await fetch(`${API}/api/admin${p}`, { headers: H })).json();
    const [providers, models, functions, assignments] = await Promise.all([get('/providers'), get('/models'), get('/functions'), get('/assignments')]);
    // Recette 8 (API réelle) : aucune clé en clair dans les réponses (préfixe et 4 derniers caractères).
    check('8. API réelle : aucune clé en clair (champs keyPrefix et keyLast4 seulement)', providers.every((p: any) => !('keyCipher' in p) && !('apiKey' in p) && (!p.keyLast4 || p.keyLast4.length <= 4)));
    const fake: Fake = { providers: providers.map((p: any) => ({ ...p, status: 'OK', hasKey: true })), models, functions: functions.functions, assignments, next: {} };
    states(fake);

    const page = await newPage(browser, { errors });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route(/\/api\/admin\/(providers|models|assignments|functions)(\/|\?|$)/, (route) => serve(fake, route));
    await page.goto(`${API}/Console%20Admin.dc.html?as=u1`, { waitUntil: 'load' });
    await page.waitForSelector('text=Vue d’ensemble', { timeout: 30000 });
    await page.waitForTimeout(2000);
    for (let i = 0; i < 3 && (await page.locator('button[aria-label="IA"][aria-expanded="true"]').count()) === 0; i++) { await page.click('button[aria-label="IA"]'); await page.waitForTimeout(1000); }
    await page.locator('#sb-ia').getByText('Fournisseurs et modèles', { exact: true }).click();
    await page.waitForTimeout(2500);
    const n = fake.providers.length;
    let s = await read(page);

    // 1. Tester toutes les clés : état de chaque fournisseur et compteur du bandeau.
    fake.next = { google: 'ERROR' };
    await page.getByRole('button', { name: 'Tester toutes les clés' }).click();
    await page.waitForTimeout(1500);
    s = await read(page);
    const gCell = s.cells.find((c) => c.startsWith('G') && c.includes('Google')) || '';
    check('1. Tester toutes les clés : état de chaque fournisseur et compteur du bandeau', s.bandHead.includes(`${n - 1} connectés`) && s.bandHead.includes('1 clé invalide') && gCell.includes('Clé invalide') && /connexion|clés valides|invalide/.test(await toastText(page)), `${s.bandHead} · ${gCell.slice(0, 40)}`);
    // Google redevient valide (son secours sert au point 2).
    fake.providers.find((p) => p.id === 'google').status = 'OK';
    fake.next = {};

    // 2. Clé du principal invalide : principal corail, secours ambre « en service », coût = celui du secours.
    fake.next = { ...fake.next, anthropic: 'ERROR' };
    const anth = page.locator('div', { hasText: /^AAnthropic/ }).last();
    await page.locator('button', { hasText: /^Tester$/ }).first().click();
    await page.waitForTimeout(1500);
    s = await read(page);
    const ins = fnRow(s, 'Insights');
    const secCost = (ins.s?.text.match(/(\d+,\d+ €)/) || [])[1];
    check('2. Clé invalide : principal corail « coupé », secours ambre « en service », coût du secours', !!ins.p && ins.p.bg === CORAL && /coupé · clé invalide/.test(ins.p.text) && !!ins.s && ins.s.bg === AMBER && /en service/.test(ins.s.text) && ins.name.includes('Secours en service') && !!secCost && ins.cost.includes(secCost), `${ins.p?.text} | ${ins.s?.text} | ${ins.cost}`);
    void anth;
    fake.next = { anthropic: 'OK' };
    await page.locator('button', { hasText: /^Tester$/ }).first().click();
    await page.waitForTimeout(1200);

    // 3. Une étape Documents à l'arrêt suspend les suivantes.
    fake.next = { openrouter: 'ERROR' };
    const orIdx = fake.providers.findIndex((p) => p.id === 'openrouter');
    await page.locator('button', { hasText: /^Tester$/ }).nth(orIdx).click();
    await page.waitForTimeout(1500);
    s = await read(page);
    const vec = fnRow(s, '1Vectorisation') || s.fns.find((f) => f.name.includes('Vectorisation'))!, rrk = s.fns.find((f) => f.name.includes('Reclassement'))!, syn = s.fns.find((f) => f.name.includes('Synthèse'))!;
    check('3. Étape Documents à l’arrêt : les étapes suivantes « Suspendu en amont »', vec.name.includes('À l’arrêt') && rrk.name.includes('Suspendu en amont') && syn.name.includes('Suspendu en amont'), `${vec.name.slice(0, 40)} | ${rrk.name.slice(0, 40)} | ${syn.name.slice(0, 40)}`);
    fake.next = { openrouter: 'OK' };
    await page.locator('button', { hasText: /^Tester$/ }).nth(orIdx).click();
    await page.waitForTimeout(1200);

    // 4. Changer d'affectation : coût de la ligne, total et colonne « Utilisé par » mis à jour.
    s = await read(page);
    const before = { cost: fnRow(s, 'Insights').cost, total: s.total };
    const target = fake.models.find((m) => m.category === 'LLM' && m.active && !fake.assignments.some((a) => a.primary === m.id || a.fallback === m.id))!;
    await page.locator('button', { hasText: fake.models.find((m) => m.id === fake.assignments.find((a) => a.functionId === 'insights').primary).name }).first().click();
    await page.locator('button', { hasText: target.name }).first().click();
    await page.waitForTimeout(1500);
    s = await read(page);
    const tRow = s.catalog.find((c) => c.name.startsWith(target.name));
    check('4. Changer d’affectation : coût de la ligne, total et « Utilisé par » mis à jour', fnRow(s, 'Insights').cost !== before.cost && s.total !== before.total && !!tRow && tRow.uses.includes('Insights · principal'), `${before.cost} → ${fnRow(s, 'Insights').cost} ; total ${before.total} → ${s.total} ; ${target.name} : ${tRow?.uses}`);

    // 5. Désactivation et suppression d'un modèle affecté : refusées, message explicite.
    const used = s.catalog.findIndex((c) => c.uses.includes('principal'));
    await page.locator('button[role="switch"][aria-label="Actif"]').nth(used).click();
    await page.waitForTimeout(400);
    const t5 = await toastText(page);
    await page.locator('button[aria-label="Modifier"]').nth(used).click();
    await page.waitForTimeout(500);
    const delBtn = page.getByRole('button', { name: 'Supprimer' });
    const delDisabled = await delBtn.isDisabled();
    const note = await page.getByText(/Réaffectez-le avant de le supprimer/).count();
    await page.getByRole('button', { name: 'Annuler' }).click();
    s = await read(page);
    check('5. Désactivation et suppression d’un modèle affecté refusées, message explicite', /Réaffectez-le avant de le désactiver/.test(t5) && delDisabled && note > 0 && s.catalog[used].on === 'true', t5.slice(0, 90));

    // 6. Formulaire : aperçu recalculé à la saisie, badge d'ancienneté selon la date, Enregistrer désactivé tant qu'incomplet.
    await page.getByRole('button', { name: 'Ajouter un modèle' }).click();
    await page.waitForTimeout(400);
    const save = page.getByRole('button', { name: 'Ajouter', exact: true });
    const dis0 = await save.isDisabled();
    const sum0 = await page.locator('span', { hasText: /^\d+,\d+ €$/ }).filter({ has: page.locator(':scope') }).last().textContent().catch(() => '');
    const inputs = page.locator('input');
    await page.getByPlaceholder('Ex. Claude Sonnet 5').fill('Modèle de recette');
    await page.getByPlaceholder('ex. claude-sonnet-5').fill('recette-1');
    await page.getByPlaceholder('0,00').nth(0).fill('2');
    await page.getByPlaceholder('0,00').nth(1).fill('10');
    await page.waitForTimeout(300);
    const sum1 = await page.locator('span', { hasText: /^\d+,\d+ €$/ }).last().textContent();
    await page.locator('input[type="date"]').fill('2024-01-15');
    await page.waitForTimeout(200);
    const old = await page.getByText(/mois · ancien/).count();
    await page.locator('input[type="date"]').fill('2025-06-15');
    await page.waitForTimeout(200);
    const watch = await page.getByText(/mois · à surveiller/).count();
    const dis1 = await save.isDisabled();
    await page.getByPlaceholder('ex. 64 000').fill('64000');
    await page.waitForTimeout(200);
    const dis2 = await save.isDisabled();
    await page.getByRole('button', { name: 'Annuler' }).click();
    void inputs;
    check('6. Formulaire : aperçu recalculé, badge d’ancienneté, Enregistrer bloqué tant qu’incomplet', dis0 && sum1 !== sum0 && old > 0 && watch > 0 && dis1 && !dis2, `aperçu ${sum0} → ${sum1} ; désactivé ${dis0}/${dis1}/${dis2}`);

    // 7. Ajouter un fournisseur : bandeau, filtres et sélecteur du formulaire ; clé testée à l'enregistrement.
    const KEY = 'cle-de-recette-0123456789-abcd';
    await page.getByRole('button', { name: 'Ajouter un fournisseur' }).click();
    await page.getByPlaceholder('Ex. Cohere').fill('Recette IA');
    await page.getByPlaceholder('Collez la clé fournie par le fournisseur').fill(KEY);
    await page.getByRole('button', { name: 'Ajouter et tester' }).click();
    await page.waitForTimeout(1500);
    const t7 = await toastText(page);
    s = await read(page);
    await page.getByRole('button', { name: 'Ajouter un modèle' }).click();
    await page.waitForTimeout(300);
    const opt = await page.locator('select option', { hasText: 'Recette IA' }).count();
    await page.getByRole('button', { name: 'Annuler' }).click();
    check('7. Ajouter un fournisseur : bandeau, filtres, sélecteur ; clé testée', s.cells.some((c) => c.includes('Recette IA') && c.includes('Connecté')) && s.filters.includes('Recette IA') && opt > 0 && /Recette IA ajouté : connexion réussie/.test(t7), t7);

    // 8. Aucune clé en clair dans l'interface (ajout et remplacement).
    await page.locator('button', { hasText: 'Remplacer la clé' }).first().click();
    await page.getByPlaceholder('Collez la clé fournie par le fournisseur').fill('nouvelle-cle-invalide-0000000000');
    await page.getByRole('button', { name: 'Remplacer et tester' }).click();
    await page.waitForTimeout(1500);
    const t8 = await toastText(page);
    s = await read(page);
    check('8. Interface : aucune clé en clair (masquée : préfixe + 4 derniers caractères) ; remplacement testé', !s.text.includes(KEY) && !s.text.includes('nouvelle-cle-invalide') && s.cells.some((c) => c.includes('••••••••abcd')) && /clé invalide/.test(t8), t8);

    const real = errors.filter((e) => !/Failed to load resource: net::ERR_FAILED/.test(e));
    check('aucune erreur dans la console du navigateur', real.length === 0, real.slice(0, 2).join(' | '));
  } finally {
    await browser.close();
  }
  const ko = results.filter((r) => !r.ok);
  console.log(`\n${results.length - ko.length}/${results.length} vérifications réussies`);
  process.exit(ko.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
