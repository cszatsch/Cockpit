/// <reference lib="dom" />
/**
 * Recette navigateur du menu « Projet » du Cockpit (07/10/2026) : projets ouverts au compte, changement de projet,
 * projet importé (sans données de démonstration) affiché sans erreur, et mise à jour en direct quand l'Administrateur
 * change les habilitations dans la Console (sans recharger la page).
 *
 * Prérequis : serveur de recette lancé sur la base de test (`test/browser/prefill-server.ts`, port 3302) ; le projet ORION
 * est importé par la Console (dépôt, contrôle, publication) s'il manque.
 *   DATABASE_URL_TEST=… npx ts-node --transpile-only test/browser/projets-cockpit.e2e.ts
 */
import { chromium, Page } from 'playwright';
import { PrismaClient } from '@prisma/client';
import { buildWorkbook, validAtlas } from '../fixtures/excel';

const BASE = process.env.PREFILL_URL || 'http://localhost:3302';
const results: Array<{ step: string; ok: boolean }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };

const menu = async (p: Page) => {
  await p.evaluate(() => (document.querySelector('[data-proj-switch]') as HTMLElement).click());
  await p.waitForTimeout(300);
  const items = await p.evaluate(() => Array.from(document.querySelectorAll('[role=listbox][aria-label=Projets] [role=option]')).map((o) => ({ code: (o as HTMLElement).innerText.split('\n')[0], on: o.getAttribute('aria-selected') === 'true' })));
  await p.evaluate(() => (document.querySelector('[data-proj-switch]') as HTMLElement).click());
  return items;
};
const current = (p: Page) => p.evaluate(() => (document.querySelector('[data-proj-switch]') as HTMLElement).innerText.replace(/\s+/g, ' ').trim());

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST } } });
  const acc = await db.account.findFirstOrThrow({ where: { personId: 'p01' } });
  const tok = (await (await fetch(BASE + '/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: 'u1' }) })).json()).token;
  const B = BASE + '/api', H = { Authorization: 'Bearer ' + tok };
  // Projet importé par la Console, comme un projet réel (aucune donnée de démonstration).
  if (!(await db.project.findUnique({ where: { code: 'ORION' } }))) {
    const fd = new FormData(); fd.append('files', new Blob([await buildWorkbook(validAtlas('ORION'))]), 'orion.xlsx');
    const up = await (await fetch(B + '/admin/projects/init/files', { method: 'POST', headers: H, body: fd })).json();
    const t = await (await fetch(B + `/admin/projects/init/files/${up.id}/processing`, { method: 'POST', headers: H })).json();
    for (let i = 0; i < 50 && (await db.prefillTask.findUniqueOrThrow({ where: { id: t.tacheId } })).status === 'RUNNING'; i++) await new Promise((r) => setTimeout(r, 200));
    const pv = await (await fetch(B + `/admin/projects/init/tasks/${t.tacheId}/preview`, { headers: H })).json();
    await fetch(B + '/admin/projects/import/commit', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: pv.jobId }) });
    for (let i = 0; i < 100 && !(await db.project.findUnique({ where: { code: 'ORION' } })); i++) await new Promise((r) => setTimeout(r, 200));
  }
  /** Habilitations du compte de p01, posées par la route de la Console (comme l'écran Utilisateurs). */
  const habilitate = (codes: string[]) => fetch(BASE + `/api/admin/accounts/${acc.id}/habilitations`, { method: 'PUT', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ admin: false, projects: codes.map((code) => ({ code, pmo: true })) }) }).then((r) => r.status);
  await habilitate(['RISE', 'ATLAS']);

  let browser;
  try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ channel: 'chrome' }); }
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && /TypeError|renderVals/.test(m.text())) errors.push(m.text()); });
  await p.goto(BASE + '/RISE%20Cockpit.dc.html?as=p01');
  await p.waitForTimeout(5000);
  check('le bloc affiche le projet ouvert', (await current(p)) === 'PROJET RISE', await current(p));
  const m1 = await menu(p);
  check('menu : projets ouverts au compte, projet ouvert coché', m1.map((x) => x.code).join(',') === 'RISE,ATLAS' && m1[0].on, JSON.stringify(m1));

  // Mise à jour en direct : l'Administrateur ouvre ORION au compte dans la Console, le Cockpit suit sans rechargement.
  await p.evaluate(() => { (window as any).__sansRechargement = true; });
  check('Console : ORION attribué', (await habilitate(['RISE', 'ATLAS', 'ORION'])) === 200);
  await p.waitForTimeout(2500);
  const m2 = await menu(p);
  check('en direct : ORION apparaît dans le menu, sans recharger la page', m2.some((x) => x.code === 'ORION') && (await p.evaluate(() => (window as any).__sansRechargement === true)), m2.map((x) => x.code).join(','));
  await habilitate(['RISE', 'ATLAS']);
  await p.waitForTimeout(2500);
  const m3 = await menu(p);
  check('en direct : ORION retiré disparaît du menu', !m3.some((x) => x.code === 'ORION') && (await p.evaluate(() => (window as any).__sansRechargement === true)), m3.map((x) => x.code).join(','));

  // Changement de projet : projet importé (sans données de démonstration) affiché sans erreur.
  await habilitate(['RISE', 'ATLAS', 'ORION']);
  await p.waitForTimeout(2500);
  await p.evaluate(() => (document.querySelector('[data-proj-switch]') as HTMLElement).click());
  await p.waitForTimeout(300);
  await Promise.all([p.waitForNavigation(), p.evaluate(() => (Array.from(document.querySelectorAll('[role=option]')).find((o) => (o as HTMLElement).innerText.startsWith('ORION')) as HTMLElement).click())]);
  await p.waitForTimeout(5000);
  check('changement de projet : ORION ouvert (?project=ORION)', /project=ORION/.test(p.url()) && (await current(p)) === 'PROJET ORION');
  check('projet importé affiché sans erreur', !/renderVals\(\)/.test(await p.evaluate(() => document.body.innerText.slice(0, 200))) && errors.length === 0, errors.slice(0, 2).join(' · '));

  await habilitate(['RISE', 'ATLAS']);
  await browser.close();
  await db.$disconnect();
  const ko = results.filter((r) => !r.ok).length;
  console.log(ko ? `${ko} échec(s)` : `${results.length} vérifications réussies`);
  process.exit(ko ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
