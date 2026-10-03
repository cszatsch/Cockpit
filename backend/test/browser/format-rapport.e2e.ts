/// <reference lib="dom" />
/**
 * Recette navigateur de l'étape « Format du rapport » (Comités et rapports › Créer un template, étape B).
 *
 * Usage (application démarrée, AUTH_DEV=true, `npm run build` préalable) :
 *   cd backend && npx ts-node --transpile-only test/browser/format-rapport.e2e.ts
 * Variable : CONSOLE_URL (défaut http://localhost:3000).
 *
 * Écrit dans la base : des fichiers de format et un template « Recette format » (supprimé à la fin).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium, Browser, Page } from 'playwright';
import JSZip from 'jszip';
import { newPage } from './harness';
import { makeFormatPptx, pptxIntegrity } from '../format-fixture';

const API = process.env.CONSOLE_URL || 'http://localhost:3000';
const NAME = 'Recette format';
const results: Array<{ step: string; ok: boolean }> = [];
const check = (step: string, ok: boolean, detail = '') => { results.push({ step, ok }); console.log(`${ok ? '✔' : '✘'} ${step}${detail ? ' — ' + detail : ''}`); };
const text = (page: Page, re: RegExp) => page.evaluate((src) => (document.body.innerText.match(new RegExp(src)) || [''])[0], re.source);
const cockpit = (page: Page, fn: string, ...args: unknown[]) => page.evaluate(([f, a]) => (window as any).__riseCockpit[f as string](...(a as unknown[])), [fn, args] as const);

async function launch(): Promise<Browser> {
  try { return await chromium.launch(); } catch { return chromium.launch({ channel: 'chrome' }); }
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'format-'));
  const pptx = path.join(dir, 'Charte ACME.pptx'), bad = path.join(dir, 'faux.pptx');
  fs.writeFileSync(pptx, await makeFormatPptx());
  fs.writeFileSync(bad, 'pas un PowerPoint');
  const browser = await launch();
  const errors: string[] = [];
  const page = await newPage(browser, { errors });
  try {
    await page.goto(`${API}/RISE%20Cockpit.dc.html?as=p01&e2e=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window as any).__riseCockpit && !!(window as any).__riseCockpit._api, null, { timeout: 60000 });
    // Restes d'une exécution précédente : templates de recette retirés.
    await page.waitForTimeout(2000);
    await page.evaluate((n) => { const c = (window as any).__riseCockpit; c.setState((s: any) => ({ templates: (s.templates || []).filter((t: any) => t.name !== n) })); }, NAME);
    await page.evaluate((n) => { const c = (window as any).__riseCockpit; c.setState({ space: 'comites', tab: 'creer', tplStep: 1, tplDraft: { ...c.state.tplDraft, name: n } }); }, NAME);
    await page.waitForFunction(() => document.body.innerText.includes('Fiche d\'identité'), null, { timeout: 15000 });
    const steps = await page.evaluate(() => ['Fiche d\'identité', 'Format du rapport', 'Composants', 'Ordre et données', 'Prévisualisation', 'Publication'].map((n) => document.body.innerText.indexOf(n)));
    check('1. six étapes, « Format du rapport » en étape 2', steps.every((x, k) => x >= 0 && (k === 0 || x > steps[k - 1])), JSON.stringify(steps));
    await page.getByText('Suivant ›').click();
    await page.waitForTimeout(500);
    check('   étape B (maquette du 04/10/2026) : stepper, 0 / 4 pages, bandeau de validation', (await text(page, /0 \/ 4\s*pages chargées/)) !== '' && (await text(page, /0 \/ 4 pages vérifiées/)) !== '' && (await text(page, /B · FORMAT DU RAPPORT/)) !== '' && (await text(page, /Valider le format/)) !== '');

    const input = page.locator('input[type=file][accept*=pptx]');
    await input.setInputFiles(pptx);
    await page.waitForFunction(() => /4 \/ 4\s*pages chargées/.test(document.body.innerText), null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelectorAll('[style*="blob:"]').length >= 5, null, { timeout: 30000 }).catch(() => {});
    const previews = await page.evaluate(() => document.querySelectorAll('[style*="blob:"]').length);
    check('2. un fichier pour les 4 pages : diapositives 1, 2, 3 et 4, rendu réel en vignette et dans l\'espace de travail', previews === 5, `${previews} aperçus`);
    const pages = await page.evaluate(() => (window as any).__riseCockpit.state.tplDraft.fmt.pages);
    check('   correspondance automatique des diapositives', ['cover', 'divider', 'standard', 'closing'].every((k, i) => pages[k].slide === i + 1), JSON.stringify(pages));
    check('   extraction affichée (fond, éléments, polices)', (await text(page, /uni #10233A/)) !== '' && (await text(page, /1 logo · 1 bandeau/)) !== '' && (await text(page, /Police introuvable : « Montserrat »/)) !== '');
    await page.waitForFunction(() => { const c = (window as any).__riseCockpit.state.tplFmtCheck; return c && c.complete; }, null, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => { const r = (window as any).__riseCockpit.state.tplFmtRoles || {}; return ['cover', 'divider', 'standard', 'closing'].every((k) => r[k] && !r[k].busy); }, null, { timeout: 120000 }).catch(() => {});
    check('   zones de la page proposées (rôles des formes), titre désigné sur la page standard', (await text(page, /Zones de la page · \d+ formes/)) !== '' && await page.evaluate(() => { const s = (window as any).__riseCockpit.state; return Object.values(s.tplDraft.fmt.pages.standard.roles || {}).includes('title'); }));
    check('   contrôle du serveur : format complet', await page.evaluate(() => !!((window as any).__riseCockpit.state.tplFmtCheck || {}).complete));

    await page.evaluate(() => { const c = (window as any).__riseCockpit; c._fmtKind = 'closing'; c.setState({ fbSel: 3 }); });
    await input.setInputFiles(bad);
    await page.waitForFunction(() => /faux\.pptx —/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    check('3. fichier invalide : message clair dans l\'espace de travail', /illisible ou endommagé/.test(await text(page, /faux\.pptx — [^\n]+/)));
    await cockpit(page, 'tplFmtSet', 'closing', null);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'Valider le format' }).click();
    await page.waitForTimeout(300);
    check('   suppression : 3 / 4 pages, validation refusée', (await text(page, /3 \/ 4\s*pages chargées/)) !== '' && (await page.evaluate(() => (window as any).__riseCockpit.state.tplStep)) === 2);
    await page.evaluate(() => { (window as any).__riseCockpit._fmtKind = 'closing'; });
    await input.setInputFiles(pptx);
    await page.waitForFunction(() => /4 \/ 4\s*pages chargées/.test(document.body.innerText), null, { timeout: 30000 });
    check('   remplacement : la clôture reprend la diapositive 4', (await page.evaluate(() => (window as any).__riseCockpit.state.tplDraft.fmt.pages.closing.slide)) === 4);
    await page.waitForFunction(() => { const c = (window as any).__riseCockpit.state; return c.tplFmtCheck && c.tplFmtCheck.complete && c.tplFmtCheck.key === (window as any).__riseCockpit.fmtPagesKey(c.tplDraft.fmt.pages); }, null, { timeout: 15000 });
    // Rôles : changer un rôle colore la zone et met à jour les compteurs ; « Rétablir la proposition » restaure les rôles proposés.
    await page.evaluate(() => (window as any).__riseCockpit.setState({ fbSel: 2 }));
    await page.waitForTimeout(400);
    const counts = () => text(page, /Zone de données\s*\d+[\s\S]*?Contenu retiré\s*\d+/);
    const c0 = await counts();
    const roleSel = page.locator('select').filter({ hasText: 'Numéro de page' }).first();
    const r0 = await roleSel.inputValue();
    await roleSel.selectOption("Contenu d'exemple (retiré)");
    await page.waitForTimeout(500);
    const c1 = await counts();
    const reset = await page.getByRole('button', { name: /^Rétablir la proposition/ }).count();
    check('   rôle modifié : compteurs à jour, « Rétablir la proposition » proposé', c0 !== c1 && reset === 1, `${r0} · ${c0.replace(/\s+/g, ' ')} → ${c1.replace(/\s+/g, ' ')}`);
    await page.getByRole('button', { name: /^Rétablir la proposition/ }).click();
    await page.waitForTimeout(500);
    check('   proposition rétablie', (await counts()) === c0 && (await roleSel.inputValue()) === r0);
    // Vérification des 4 pages puis validation du format.
    for (let i = 0; i < 4; i++) { await page.evaluate((k) => (window as any).__riseCockpit.setState({ fbSel: k }), i); await page.getByRole('button', { name: 'Marquer comme vérifiée' }).click(); await page.waitForTimeout(150); }
    check('   4 / 4 pages vérifiées (vignettes, en-tête, bandeau)', (await text(page, /4 \/ 4 pages vérifiées/)) !== '' && (await page.evaluate(() => (document.body.innerText.match(/Vérifiée/g) || []).length)) >= 5);
    await page.waitForFunction(() => { const c = (window as any).__riseCockpit; return c.state.tplFmtCheck && c.state.tplFmtCheck.complete && c.state.tplFmtCheck.key === c.fmtPagesKey(c.state.tplDraft.fmt.pages); }, null, { timeout: 15000 });

    // Étape 3 : composants (nature affichée).
    await page.getByRole('button', { name: 'Valider le format' }).click();
    await page.waitForTimeout(600);
    await page.evaluate(() => { const c = (window as any).__riseCockpit; c.setState({ tplDraft: { ...c.state.tplDraft, comps: ['synthese', 'risques', 'barometre', 'jalons'].map((id) => ({ id, kind: 'Projet', target: '' })) } }); });
    await page.waitForTimeout(300);
    check('4. composants : nature affichée (Gantt, Frise, Matrice et tableau, Tableau de bord, Indicateurs et texte)', (await text(page, /GANTT/)) !== '' && (await text(page, /FRISE/)) !== '' && (await text(page, /MATRICE ET TABLEAU/)) !== '' && (await text(page, /TABLEAU DE BORD/)) !== '' && (await text(page, /INDICATEURS ET TEXTE/)) !== '');
    // Étape 4 : sections, période, indicateurs.
    await page.getByText('Suivant ›').click();
    await page.waitForTimeout(500);
    await page.getByText("+ Nouvelle section à partir d'ici").nth(1).click(); // le baromètre ouvre la section 2
    await page.waitForTimeout(300);
    await page.locator('input[placeholder^="Titre de la section"]').nth(1).fill('Climat et pilotage');
    await page.locator('input[placeholder^="Titre de la section"]').nth(1).dispatchEvent('change');
    await page.getByText('Statut', { exact: true }).first().click(); // colonne ajoutée au tableau des risques
    await page.waitForTimeout(300);
    const comps = await page.evaluate(() => (window as any).__riseCockpit.state.tplDraft.comps);
    check('5. ordre et données : 2 sections, colonne ajoutée', (await text(page, /2 sections/)) !== '' && comps[2].newSection === true && (comps[1].indicators || []).includes('status'), JSON.stringify(comps.map((c: any) => [c.id, c.newSection, c.indicators])));
    // Étape 5 : aperçu complet construit par le serveur.
    await page.getByText('Suivant ›').click();
    await page.waitForFunction(() => { const c = (window as any).__riseCockpit.state; return c.tplPrev && c.tplPrev.slides && Object.keys(c.tplPrevImgs || {}).length === c.tplPrev.slides.length; }, null, { timeout: 90000 }).catch(() => {});
    const pv = await page.evaluate(() => (window as any).__riseCockpit.state.tplPrev);
    check('6. prévisualisation : 2 + 2 sections + 4 pages, vignettes du rapport au format', !!pv && pv.pages === 8 && (await page.evaluate(() => document.querySelectorAll('[role=img][style*="blob:"]').length)) === 8, pv && JSON.stringify(pv.slides.map((x: any) => x.label)));
    check('   contrôle des données affiché', (await text(page, /CONTRÔLE DES DONNÉES|Contrôle des données/)) !== '');
    await page.getByText('Suivant ›').click(); await page.waitForTimeout(500);
    check('   récapitulatif : format, sections et pages exactes', (await text(page, /16:9 · 33,87 × 19,05 cm · Charte ACME\.pptx/)) !== '' && (await text(page, /Synthèse de situation · Climat et pilotage/)) !== '');
    await page.getByText('Valider et publier').click();
    await page.waitForFunction((n) => ((window as any).__riseCockpit.state.templates || []).some((t: any) => t.name === n && /^T-/.test(t.id) && t.format && String(t.format.cover.fileId).startsWith('RF')), NAME, { timeout: 30000 }).catch(() => {});
    const saved = await page.evaluate((n) => ((window as any).__riseCockpit.state.templates || []).find((t: any) => t.name === n), NAME);
    check('7. template publié avec son format et sa version 1 (serveur)', !!saved && !!saved.format && saved.format.closing.slide === 4 && saved.publishedVersion === 1, JSON.stringify(saved && saved.format));

    // Génération : contrôle des données d'abord ; anomalies → fenêtre de confirmation.
    await page.evaluate((n) => { const c = (window as any).__riseCockpit; c.setState({ tab: 'generer', tplSel: c.state.templates.find((t: any) => t.name === n).id }); }, NAME);
    await page.waitForTimeout(600);
    await page.evaluate(() => (window as any).__riseCockpit.setState({}));
    const checkRes = await page.evaluate(async (n) => { const c = (window as any).__riseCockpit; return c._api.tplCheck(c.state.templates.find((t: any) => t.name === n)); }, NAME);
    check('8. contrôle avant génération : version 1, anomalies listées', !!checkRes && checkRes.version.seq === 1 && Array.isArray(checkRes.issues), JSON.stringify(checkRes && checkRes.issues.map((i: any) => i.message)));
    const dl = page.waitForEvent('download', { timeout: 30000 });
    const toasts = await page.evaluate(async (n) => { const c = (window as any).__riseCockpit; const seen: string[] = []; const orig = c.showToast.bind(c); c.showToast = (m: string) => { seen.push(m); orig(m); }; await c._api.tplPptx(c.state.templates.find((t: any) => t.name === n)); c.showToast = orig; return seen; }, NAME);
    if (toasts.length) console.log('   messages :', toasts.join(' | '));
    const file = path.join(dir, 'rapport.pptx');
    await (await dl).saveAs(file);
    const buf = fs.readFileSync(file);
    const z = await JSZip.loadAsync(buf);
    const cover = await z.file('ppt/slides/slide1.xml')!.async('string');
    check('9. publication téléchargée : paquet intègre, titre sur la couverture', (await pptxIntegrity(buf)).length === 0 && cover.includes(`<a:t>${NAME}</a:t>`));

    // Nettoyage : brouillon de recette et template de recette supprimés.
    await page.evaluate(() => (window as any).__riseCockpit._api.tplDraftDrop());
    if (saved) await page.evaluate(async (id) => { const c = (window as any).__riseCockpit; c.setState((s: any) => ({ templates: s.templates.filter((t: any) => t.id !== id) })); }, saved.id);
    await page.waitForTimeout(2500);
    const left = errors.filter((e) => !/Expected|never resolved|cannot be parsed|conform|Failed to load resource/.test(e));
    check('10. aucune erreur JavaScript', left.length === 0, left.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
  }
  const ko = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - ko} / ${results.length} vérifications réussies`);
  process.exit(ko ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
