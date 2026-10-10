/// <reference lib="dom" />
/**
 * Recette navigateur du profil Super Admin (10/10/2026) : le Super Admin voit les commandes du menu IA ; l'Admin voit les mêmes
 * pages en lecture seule (bandeau, commandes de modification masquées, plafonds non modifiables), le niveau des administrateurs
 * et l'interrupteur « Super Admin » du compte ne sont proposés qu'au Super Admin.
 *   DATABASE_URL_TEST=… npx ts-node --transpile-only test/browser/super-admin.e2e.ts   (serveur de recette sur 3302, base de test)
 */
import { chromium, Page } from 'playwright';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.CONSOLE_URL || 'http://localhost:3302';
const ADM = 'acc-recette-admin';
(async () => {
  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST || 'postgresql://rise@localhost:5433/rise_test' } } });
  await db.account.upsert({ where: { id: ADM }, create: { id: ADM, email: 'recette.admin@example.com', fullName: 'Alice Recette', status: 'ACTIVE' }, update: { status: 'ACTIVE' } });
  await db.adminGrant.upsert({ where: { accountId: ADM }, create: { accountId: ADM }, update: { superAdmin: false } });
  await db.adminGrant.update({ where: { accountId: 'u1' }, data: { superAdmin: true } });
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  let ko = 0;
  const check = (what: string, ok: boolean, got?: unknown) => { if (!ok) ko++; console.log(ok ? '✔' : '✘', what, ok ? '' : '→ ' + JSON.stringify(got)); };
  const errs: string[] = [];
  const open = async (as: string) => {
    const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(`${BASE}/Console%20Admin.dc.html?as=${as}`);
    await p.waitForTimeout(6000);
    return p;
  };
  const GROUPS: Record<string, string> = { ia: 'IA', acces: 'Accès' };
  const page = async (p: Page, gid: string, label: string) => {
    for (let i = 0; i < 3 && (await p.locator(`button[aria-label^="${GROUPS[gid]}"][aria-expanded="true"]`).count()) === 0; i++) { await p.locator(`button[aria-label^="${GROUPS[gid]}"][aria-expanded]`).first().click(); await p.waitForTimeout(700); }
    await p.locator(`#sb-${gid}`).getByText(label, { exact: true }).click();
    await p.waitForTimeout(2200);
  };
  const banner = (p: Page) => p.getByText('Lecture seule : modification réservée au Super Admin.').count();

  // ── Super Admin
  const s = await open('u1');
  check('Super Admin : « Super Admin » sous l’avatar de la barre latérale', (await s.getByText('Super Admin', { exact: true }).count()) > 0);
  await s.getByRole('button', { name: 'Mon profil' }).first().click();
  await s.waitForTimeout(1500);
  const prof = s.locator('[data-screen-label="Mon profil"]');
  check('Super Admin : Mon profil affiche « Super Admin »', (await prof.getByText('Super Admin', { exact: true }).count()) > 0 && (await prof.getByText('Administrateur', { exact: true }).count()) === 0);
  await page(s, 'ia', 'Fournisseurs et modèles');
  check('Super Admin : commandes de Fournisseurs et modèles visibles, sans bandeau', (await s.getByRole('button', { name: /Tester toutes les clés/ }).count()) === 1 && (await s.getByRole('button', { name: /Ajouter un modèle/ }).count()) === 1 && (await banner(s)) === 0);
  await page(s, 'acces', 'Administrateurs');
  check('Super Admin : niveau des administrateurs proposé (Super Admin / Admin)', (await s.getByText('Super Admin', { exact: true }).count()) > 0);
  await page(s, 'acces', 'Utilisateurs');
  await s.getByText('Alice Recette').first().click();
  await s.waitForTimeout(800);
  const edit = s.getByRole('button', { name: 'Modifier le compte' });
  if (await edit.count()) { await edit.first().click(); await s.waitForTimeout(800); }
  check('Super Admin : interrupteur « Super Admin » dans « Modifier le compte »', (await s.getByRole('button', { name: 'Super Admin', exact: true }).count()) === 1);
  await s.close();

  // ── Admin
  const a = await open(ADM);
  check('Admin : « Administrateur » sous l’avatar', (await a.getByText('Super Admin', { exact: true }).count()) === 0 && (await a.getByText('Administrateur', { exact: true }).count()) > 0);
  await page(a, 'ia', 'Fournisseurs et modèles');
  check('Admin : Fournisseurs et modèles en lecture seule (bandeau, sans Tester / Ajouter / Remplacer la clé)', (await banner(a)) === 1 && (await a.getByRole('button', { name: /Tester toutes les clés/ }).count()) === 0
    && (await a.getByRole('button', { name: /Ajouter un modèle/ }).count()) === 0 && (await a.getByRole('button', { name: /Remplacer la clé/ }).count()) === 0);
  check('Admin : catalogue des modèles toujours lisible', (await a.getByText('Modèles', { exact: true }).count()) > 0);
  await page(a, 'ia', 'Consommation et coûts');
  const ro = await a.locator('input[aria-label="Plafond global"]').getAttribute('readonly');
  check('Admin : Consommation et coûts › IA, plafonds non modifiables et bandeau', ro !== null && (await banner(a)) === 1, ro);
  await page(a, 'acces', 'Administrateurs');
  check('Admin : pas de sélecteur de niveau', (await a.getByRole('button', { name: 'Super Admin', exact: true }).count()) === 0);
  await a.close();

  check('aucune erreur de page', !errs.length, errs.slice(0, 2));
  await db.adminGrant.deleteMany({ where: { accountId: ADM } });
  await db.account.deleteMany({ where: { id: ADM } });
  await db.$disconnect();
  console.log(ko ? `\n${ko} contrôle(s) en échec` : '\nTous les contrôles passent');
  await b.close();
  process.exit(ko ? 1 : 0);
})();
