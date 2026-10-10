/// <reference lib="dom" />
/**
 * Recette navigateur de l'étape « Format du rapport » (Comités et rapports › Créer un template, étape B).
 *
 * Usage (application démarrée, AUTH_DEV=true, `npm run build` préalable) :
 *   cd backend && npx ts-node --transpile-only test/browser/format-rapport.e2e.ts
 * Variable : CONSOLE_URL (défaut http://localhost:3302, serveur de recette sur la base de test — jamais l'application réelle, dont la base serait polluée : 10/10/2026).
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

const API = process.env.CONSOLE_URL || 'http://localhost:3302';
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
    // Session sans persistance : quitter l'onglet ou le menu réinitialise l'assistant (étape A vierge).
    const away = async (to: Record<string, string>) => page.evaluate(async ([n, to]) => {
      const c = (window as any).__riseCockpit, wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      c.setState({ tplStep: 2, tplDraft: { ...c.state.tplDraft, name: n + ' (abandon)' } }); await wait(300);
      c.setState(to); await wait(400);
      c.setState({ space: 'comites', tab: 'creer' }); await wait(400);
      return { step: c.state.tplStep, name: c.state.tplDraft.name };
    }, [NAME, to] as const);
    const afterTab = await away({ tab: 'generer' }), afterMenu = await away({ space: 'pilotage', tab: 'planning' });
    check('   session sans persistance : changer d’onglet ou de menu ramène à l’étape A vierge', [afterTab, afterMenu].every((x) => x.step === 1 && x.name === ''), JSON.stringify({ afterTab, afterMenu }));
    await page.evaluate((n) => { const c = (window as any).__riseCockpit; c.setState({ tplStep: 1, tplDraft: { ...c.state.tplDraft, name: n } }); }, NAME);
    await page.waitForTimeout(300);
    const stepper = () => page.evaluate(() => (document.body.innerText.match(/Format du rapport/g) || []).length + '|' + Array.from(document.querySelectorAll('div')).filter((d) => /^Étape \d$/i.test((d.textContent || '').trim())).length);
    const stepperA = await stepper();
    await page.getByText('Suivant ›').click();
    await page.waitForTimeout(500);
    // Étape B : même bandeau qu'à l'étape A (un seul) ; vignettes vides sans libellé ni curseur en main.
    const thumbs = await page.evaluate(() => Array.from(document.querySelectorAll('button')).filter((b) => /PAGE \d/.test(b.textContent || '')).map((b) => ({ label: /Charger un fichier/.test(b.textContent || ''), cursor: getComputedStyle(b.querySelector('div')!).cursor })));
    const stepperB = await stepper();
    check('   étape B : bandeau des étapes identique à l’étape A ; vignettes vides sans « Charger un fichier », curseur normal', stepperA.split('|')[1] === '6' && stepperB.split('|')[1] === '6' && thumbs.length === 4 && thumbs.every((t) => !t.label && t.cursor === 'default'), JSON.stringify({ stepperA, stepperB, thumbs }));
    await page.evaluate(() => (window as any).__riseCockpit.setState({ tplStep: 1 }));
    await page.waitForTimeout(300);
    await page.getByText('Suivant ›').click();
    await page.waitForTimeout(500);
    check('   étape B (maquette du 04/10/2026) : stepper, 0 / 4 pages, bandeau de validation', (await text(page, /0 \/ 4\s*pages chargées/)) !== '' && (await text(page, /0 \/ 4 pages vérifiées/)) !== '' && (await text(page, /B · FORMAT DU RAPPORT/)) !== '' && (await text(page, /Valider le format/)) !== '');

    const input = page.locator('input[type=file][accept*=pptx]');
    // Plus de bouton « Importer un fichier pour les 4 pages » : le même fichier est chargé page par page (zone du panneau).
    check('   bouton « Importer un fichier pour les 4 pages » absent', !/Importer un fichier pour les 4 pages/.test(await page.evaluate(() => document.body.innerText)));
    for (const [i, k] of ['cover', 'divider', 'standard', 'closing'].entries()) {
      await page.evaluate((i) => (window as any).__riseCockpit.setState({ fbSel: i }), i);
      await page.waitForTimeout(200);
      await page.getByText('Charger un fichier', { exact: true }).click();
      await input.setInputFiles(pptx);
      await page.waitForFunction((k) => !!(window as any).__riseCockpit.state.tplDraft.fmt.pages[k], k, { timeout: 30000 });
    }
    await page.waitForFunction(() => /4 \/ 4\s*pages chargées/.test(document.body.innerText), null, { timeout: 30000 });
    await page.evaluate(() => (window as any).__riseCockpit.setState({ fbSel: 0 }));
    await page.waitForTimeout(300);
    await page.waitForFunction(() => document.querySelectorAll('[style*="blob:"]').length >= 5, null, { timeout: 30000 }).catch(() => {});
    const previews = await page.evaluate(() => document.querySelectorAll('[style*="blob:"]').length);
    check('2. un même fichier chargé pour chaque page : diapositives 1, 2, 3 et 4, rendu réel en vignette et dans l\'espace de travail', previews === 5, `${previews} aperçus`);
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
    // Retrait depuis la vignette (icône corbeille) : la page de clôture est vidée et sélectionnée.
    const icons = await page.locator('[aria-label^="Retirer la page"]').count();
    await page.getByRole('button', { name: 'Retirer la page de clôture', exact: true }).click();
    await page.waitForTimeout(500);
    check('   vignette : icône de retrait sur chaque page chargée ; retrait de la clôture, page sélectionnée', icons === 4 && (await page.evaluate(() => { const c = (window as any).__riseCockpit.state; return !c.tplDraft.fmt.pages.closing && c.fbSel === 3; })) && (await page.locator('[aria-label^="Retirer la page"]').count()) === 3, String(icons));
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
    await page.waitForTimeout(150);
    check('   étape E : structure et emplacements affichés avant la génération, Suivant désactivé', (await text(page, /8 pages/)) !== '' && (await text(page, /STRUCTURE DU DOCUMENT/)) !== '' && (await text(page, /Construction du rapport au format défini, avec les données du jour…/)) !== '' && await page.getByRole('button', { name: 'Suivant ›' }).isDisabled());
    await page.waitForFunction(() => { const c = (window as any).__riseCockpit.state; return c.tplPrev && c.tplPrev.done; }, null, { timeout: 120000 }).catch(() => {});
    const pv = await page.evaluate(() => (window as any).__riseCockpit.state.tplPrev);
    check('6. prévisualisation : 2 + 2 sections + 4 pages, vignettes du rapport au format', !!pv && pv.pages === 8 && (await page.evaluate(() => document.querySelectorAll('[role=img][aria-label][style*="blob:"]').length)) === 8 && (await text(page, /Aperçu prêt/)) !== '' && (await text(page, /8 pages · 2 sections · format de l'étape B, données du jour/)) !== '', pv && JSON.stringify(pv.slides.map((x: any) => x.label)));
    check('   contrôle des données affiché', (await text(page, /CONTRÔLE DES DONNÉES|Contrôle des données/)) !== '');
    await page.getByText('Suivant ›').click(); await page.waitForTimeout(500);
    check('   étape F : fiche du template (format, fichiers, sections, pages)', (await text(page, /F · VALIDATION ET PUBLICATION/)) !== '' && (await text(page, /16:9 · 33,87 × 19,05 cm/)) !== '' && (await text(page, /Charte ACME\.pptx/)) !== '' && (await text(page, /Synthèse de situation · Climat et pilotage/)) !== '');
    // Pendant l'enregistrement : pas de liste « Publication en cours » (suivi seulement dans « Générer un rapport »), bouton « Publication… ».
    await page.evaluate(() => { const w = window as any; w.__pubSeen = { list: false, busy: false }; w.__pubObs = new MutationObserver(() => { const t = document.body.innerText; if (/Publication en cours/.test(t)) w.__pubSeen.list = true; if (/Publication…/.test(t)) w.__pubSeen.busy = true; }); w.__pubObs.observe(document.body, { subtree: true, childList: true, characterData: true }); });
    await page.getByText('Valider et publier').click();
    // Redirection immédiate vers « Générer un rapport », template présélectionné, carte « Mise en service ».
    await page.waitForFunction(() => (window as any).__riseCockpit.state.tab === 'generer', null, { timeout: 30000 }).catch(() => {});
    const pubSeen = await page.evaluate(() => { const w = window as any; w.__pubObs.disconnect(); return w.__pubSeen; });
    check('   publication : bouton « Publication… » pendant l’enregistrement, sans liste « Publication en cours » (pas de double affichage)', pubSeen.busy && !pubSeen.list, JSON.stringify(pubSeen));
    check('   publication : redirection vers « Générer un rapport », carte « Mise en service »', await page.evaluate((n) => { const c = (window as any).__riseCockpit; const t = (c.state.templates || []).find((x: any) => x.name === n); return !!t && c.state.tplSel === t.id; }, NAME) && /Mise en service/.test(await page.evaluate(() => document.body.innerText)));
    await page.waitForFunction(() => document.body.innerText.includes('est prêt à être utilisé'), null, { timeout: 180000 }).catch(() => {});
    check('   mise en service terminée : « Nouveau », notification', /Nouveau/.test(await page.evaluate(() => document.body.innerText)) && /est prêt à être utilisé/.test(await page.evaluate(() => document.body.innerText)));
    await page.waitForFunction((n) => ((window as any).__riseCockpit.state.templates || []).some((t: any) => t.name === n && t.publishedVersion === 1), NAME, { timeout: 30000 }).catch(() => {});
    const saved = await page.evaluate((n) => ((window as any).__riseCockpit.state.templates || []).find((t: any) => t.name === n), NAME);
    check('7. template publié avec son format et sa version 1 (serveur)', !!saved && !!saved.format && saved.format.closing.slide === 4 && saved.publishedVersion === 1, JSON.stringify(saved && saved.format));
    // Session « Créer un template » réinitialisée : brouillon supprimé, retour sur l'onglet (même après rechargement) à l'étape A vierge.
    await page.waitForTimeout(1500);
    const draftAfter = await page.evaluate(async () => (await (window as any).__riseCockpit._api.tplDraftGet()).data);
    const backNow = await page.evaluate(async () => { const c = (window as any).__riseCockpit; c.setState({ tab: 'creer' }); await new Promise((r) => setTimeout(r, 1500)); return { step: c.state.tplStep, name: c.state.tplDraft.name, comps: c.state.tplDraft.comps.length }; });
    await page.reload(); await page.waitForFunction(() => !!(window as any).__riseCockpit, null, { timeout: 30000 });
    const backReload = await page.evaluate(async () => { const c = (window as any).__riseCockpit; c.setState({ space: 'comites', tab: 'creer' }); await new Promise((r) => setTimeout(r, 2000)); return { step: c.state.tplStep, name: c.state.tplDraft.name, comps: c.state.tplDraft.comps.length }; });
    check('   session réinitialisée : brouillon supprimé, « Créer un template » à l’étape A vierge (avant et après rechargement)', draftAfter === null && [backNow, backReload].every((b) => b.step === 1 && b.name === '' && b.comps === 0), JSON.stringify({ draftAfter, backNow, backReload }));
    await page.evaluate(() => (window as any).__riseCockpit.setState({ tab: 'generer' }));

    // Téléchargement depuis la ligne du template : étapes suivies (contrôle, collecte, rédaction, mise en page, fichier).
    await page.waitForTimeout(800);
    await page.evaluate((n) => { const c = (window as any).__riseCockpit; c.setState({ tplSel: c.state.templates.find((t: any) => t.name === n).id }); }, NAME);
    await page.evaluate(() => { const w = window as any; w.__genSeen = []; w.__genObs = new MutationObserver(() => { for (const l of ['Contrôle des données…', 'Collecte des données du jour…', 'Rédaction des titres et de la synthèse…', 'Mise en page au format du template…', 'Téléchargement du fichier…', 'Rapport téléchargé']) if (document.body.innerText.includes(l) && !w.__genSeen.includes(l)) w.__genSeen.push(l); }); w.__genObs.observe(document.body, { subtree: true, childList: true, characterData: true }); });
    const rowDl = page.waitForEvent('download', { timeout: 120000 });
    await page.getByRole('button', { name: 'Télécharger', exact: true }).first().click();
    for (let k = 0; k < 40; k++) {
      if (await page.getByText('Générer quand même').count()) await page.getByText('Générer quand même').click();
      if (await page.getByText('Non, télécharger seulement').count()) { await page.getByText('Non, télécharger seulement').click(); break; }
      await page.waitForTimeout(250);
    }
    const rowFile = await rowDl.catch(() => null);
    await page.waitForFunction(() => document.body.innerText.includes('Rapport téléchargé'), null, { timeout: 10000 }).catch(() => {});
    const genSeen = await page.evaluate(() => { const w = window as any; w.__genObs.disconnect(); return w.__genSeen as string[]; });
    check('   téléchargement suivi sur la ligne : étapes affichées dans l’ordre, puis « Rapport téléchargé »', !!rowFile && genSeen.includes('Contrôle des données…') && genSeen.includes('Rapport téléchargé') && ['Collecte des données du jour…', 'Rédaction des titres et de la synthèse…', 'Mise en page au format du template…', 'Téléchargement du fichier…'].every((l, k, all) => genSeen.indexOf(l) > 0 && (k === 0 || genSeen.indexOf(l) > genSeen.indexOf(all[k - 1]))), JSON.stringify(genSeen));

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
