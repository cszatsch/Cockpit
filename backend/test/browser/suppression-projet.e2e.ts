/// <reference lib="dom" />
/**
 * Recette navigateur de la suppression d'un projet (Console › Projets › Bibliothèque des projets, 10/10/2026) : bouton réservé
 * au Super Admin, fenêtre de confirmation (inventaire, comptes, sauvegarde de 48 h, code à saisir), projet retiré de la liste,
 * « Projets supprimés » et restauration.
 *   DATABASE_URL_TEST=… npx ts-node --transpile-only test/browser/suppression-projet.e2e.ts   (serveur de recette sur 3302, base de test)
 */
import { chromium, Page } from 'playwright';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.CONSOLE_URL || 'http://localhost:3302';
const ADM = 'acc-recette-admin';
const CODE = process.env.RECETTE_PROJET || 'NOVA';
(async () => {
  const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_TEST || 'postgresql://rise@localhost:5433/rise_test' } } });
  await db.account.upsert({ where: { id: ADM }, create: { id: ADM, email: 'recette.admin@example.com', fullName: 'Alice Recette', status: 'ACTIVE' }, update: { status: 'ACTIVE' } });
  await db.adminGrant.upsert({ where: { accountId: ADM }, create: { accountId: ADM }, update: { superAdmin: false } });
  await db.adminGrant.update({ where: { accountId: 'u1' }, data: { superAdmin: true } });
  if (!(await db.project.findUnique({ where: { code: CODE } }))) throw new Error(`Projet ${CODE} absent de la base de test`);
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  let ko = 0;
  const check = (what: string, ok: boolean, got?: unknown) => { if (!ok) ko++; console.log(ok ? '✔' : '✘', what, ok ? '' : '→ ' + JSON.stringify(got)); };
  const errs: string[] = [];
  const open = async (as: string) => {
    const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(`${BASE}/Console%20Admin.dc.html?as=${as}`);
    await p.waitForTimeout(6000);
    for (let i = 0; i < 3 && (await p.locator('button[aria-label^="Projets"][aria-expanded="true"]').count()) === 0; i++) { await p.locator('button[aria-label^="Projets"][aria-expanded]').first().click(); await p.waitForTimeout(700); }
    await p.locator('#sb-projets').getByText('Bibliothèque des projets', { exact: true }).click();
    await p.waitForTimeout(2500);
    return p;
  };
  const pick = async (p: Page, code: string) => { await p.locator('[aria-label="Liste des projets"] [role="button"]').filter({ hasText: code }).first().click(); await p.waitForTimeout(500); };

  // ── Admin : pas de bouton.
  const a = await open(ADM);
  await pick(a, CODE);
  check('Admin : « Supprimer le projet » absent', (await a.locator('[data-del-project]').count()) === 0);
  await a.close();

  // ── Super Admin
  const s = await open('u1');
  await pick(s, CODE);
  check('Super Admin : « Supprimer le projet » dans la fiche', (await s.locator('[data-del-project]').count()) === 1);
  await s.locator('[data-del-project]').click();
  await s.waitForTimeout(1500);
  const dlg = s.locator('[data-del-dialog]');
  check('fenêtre : titre, sauvegarde de 48 h, consommation conservée, « Sans équipe »', (await dlg.getByText(`Supprimer le projet ${CODE} ?`).count()) === 1 && (await dlg.getByText(/conservée 48 h/).count()) === 1
    && (await dlg.getByText(/journal d’audit sont conservés/).count()) === 1 && (await dlg.getByText(/Sans équipe/).count()) === 1);
  check('fenêtre : inventaire chiffré', (await dlg.getByText(/enregistrements? au total/).count()) === 1);
  const confirm = s.locator('[data-del-confirm]');
  check('bouton désactivé tant que le code n’est pas saisi', await confirm.isDisabled());
  await s.locator('[data-del-code]').fill(CODE.slice(0, -1));
  check('code incomplet : toujours désactivé', await confirm.isDisabled());
  await s.screenshot({ path: process.env.SHOT || 'suppression-projet.png' });
  await s.keyboard.press('Escape');
  await s.waitForTimeout(400);
  check('Échap ferme la fenêtre sans rien supprimer', (await s.locator('[data-del-dialog]').count()) === 0 && !!(await db.project.findUnique({ where: { code: CODE } })));
  await s.locator('[data-del-project]').click();
  await s.waitForTimeout(1500);
  await s.locator('[data-del-code]').pressSequentially(CODE.toLowerCase(), { delay: 60 }); // frappe réelle : aucun raccourci de la Console ne doit se déclencher
  check('code saisi (casse indifférente) : bouton actif', await confirm.isEnabled());
  await confirm.click();
  await s.waitForTimeout(3000);
  check('projet supprimé en base', !(await db.project.findUnique({ where: { code: CODE } })));
  check('message de confirmation avec la date limite de restauration', (await s.getByText(new RegExp(`Projet ${CODE} supprimé\\. Restaurable jusqu’au`)).count()) === 1);
  check('projet retiré de la liste', (await s.locator('[aria-label="Liste des projets"] [role="button"]').filter({ hasText: CODE }).count()) === 0);
  // Démarrage de la Console après la suppression (10/10/2026) : le projet présélectionné des Snapshots (« RISE ») n'existe
  // plus — la Console doit démarrer quand même (auparavant 404 « Projet introuvable » et données de démonstration affichées).
  const fresh = await b.newPage({ viewport: { width: 1500, height: 950 } });
  fresh.on('pageerror', (e) => errs.push(String(e)));
  await fresh.goto(`${BASE}/Console%20Admin.dc.html?as=u1`);
  await fresh.waitForTimeout(6000);
  check('la Console redémarre sans « Projet introuvable » ni squelette de chargement', (await fresh.getByText('Projet introuvable').count()) === 0 && (await fresh.getByText(/Utilisateurs actifs/i).count()) > 0);
  await fresh.close();
  const trash = s.locator('[data-project-trash]');
  check('« Projets supprimés » : le projet, restaurable encore 48 h', (await trash.getByText(CODE, { exact: true }).count()) === 1 && (await trash.getByText(/Restaurable encore 4[78] h/).count()) === 1);
  await s.screenshot({ path: (process.env.SHOT || 'suppression-projet.png').replace(/\.png$/, '-corbeille.png'), fullPage: true });
  await trash.locator('[data-restore-project]').click();
  await s.waitForTimeout(3000);
  check('restauration : projet de retour en base et dans la liste', !!(await db.project.findUnique({ where: { code: CODE } })) && (await s.locator('[aria-label="Liste des projets"] [role="button"]').filter({ hasText: CODE }).count()) === 1);
  check('restauration : « Projets supprimés » vide', (await s.locator('[data-project-trash]').count()) === 0);
  await s.close();

  check('aucune erreur de page', errs.length === 0, errs);
  await b.close();
  await db.$disconnect();
  console.log(ko ? `${ko} échec(s)` : 'Recette réussie');
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
