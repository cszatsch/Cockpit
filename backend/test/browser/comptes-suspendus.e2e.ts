/// <reference lib="dom" />
/**
 * Recette navigateur (11/10/2026) : Accès › Utilisateurs › onglet « Suspendus » › « Supprimer les comptes suspendus » —
 * confirmation (supprimés, gardés avec leur raison, saisie « SUPPRIMER »), suppression, comptes gardés toujours présents.
 *   DATABASE_URL_TEST=… npx ts-node --transpile-only test/browser/comptes-suspendus.e2e.ts   (serveur de recette sur 3302, base de test)
 */
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.CONSOLE_URL || 'http://localhost:3302';
(async () => {
  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST || 'postgresql://rise@localhost:5433/rise_test' } } });
  // Deux comptes suspendus de recette : l'un supprimable, l'autre administrateur (gardé).
  for (const id of ['rec-susp-libre', 'rec-susp-admin']) await db.account.upsert({ where: { id }, create: { id, email: id + '@example.com', fullName: id === 'rec-susp-libre' ? 'Zoé Libre' : 'Yann Admin', status: 'SUSPENDED' }, update: { status: 'SUSPENDED' } });
  await db.adminGrant.upsert({ where: { accountId: 'rec-susp-admin' }, create: { accountId: 'rec-susp-admin' }, update: {} });
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  let ko = 0;
  const check = (what: string, ok: boolean, got?: unknown) => { if (!ok) ko++; console.log(ok ? '✔' : '✘', what, ok ? '' : '→ ' + JSON.stringify(got)); };
  const errs: string[] = [];
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(`${BASE}/Console%20Admin.dc.html?as=u1`);
  await p.waitForTimeout(6000);
  for (let i = 0; i < 3 && (await p.locator('button[aria-label^="Accès"][aria-expanded="true"]').count()) === 0; i++) { await p.locator('button[aria-label^="Accès"][aria-expanded]').first().click(); await p.waitForTimeout(700); }
  await p.locator('#sb-acces').getByText('Utilisateurs', { exact: true }).click();
  await p.waitForTimeout(2000);
  check('onglet « Tous » : pas de bouton', (await p.locator('[data-purge-suspended]').count()) === 0);
  await p.getByText('Suspendus', { exact: true }).first().click();
  await p.waitForTimeout(800);
  check('onglet « Suspendus » : bouton « Supprimer les comptes suspendus »', (await p.locator('[data-purge-suspended]').count()) === 1);
  await p.locator('[data-purge-suspended]').click();
  await p.waitForTimeout(1500);
  check('confirmation : titre et comptes supprimés / gardés avec la raison', (await p.getByText(/^Supprimer \d+ comptes? suspendus? \?$/).count()) === 1
    && (await p.getByText(/Zoé Libre/).count()) > 0 && (await p.getByText(/Gardé · Administrateur de la Console/).count()) > 0);
  await p.screenshot({ path: process.env.SHOT || 'comptes-suspendus.png' });
  const field = p.locator('input').filter({ hasNot: p.locator('xpath=..//*[@aria-label="Rechercher un utilisateur"]') }).last();
  await field.fill('SUPPRIMER');
  await p.getByRole('button', { name: /^Supprimer \d+ comptes?$/ }).click();
  await p.waitForTimeout(3000);
  check('compte libre supprimé, administrateur gardé', !(await db.account.findUnique({ where: { id: 'rec-susp-libre' } })) && !!(await db.account.findUnique({ where: { id: 'rec-susp-admin' } })));
  check('message de résultat', (await p.getByText(/comptes? supprimés? · \d+ gardés?/).count()) > 0);
  check('aucune erreur de page', errs.length === 0, errs);
  await b.close();
  await db.$disconnect();
  console.log(ko ? `${ko} échec(s)` : 'Recette réussie');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
