/// <reference lib="dom" />
/**
 * Recette navigateur : chaque page du Cockpit et chacun de ses onglets s'affichent sans erreur pour un projet donné
 * (07/10/2026 : un projet importé, sans les données de démonstration de RISE, faisait échouer l'écran). Les actions qui
 * écrivent (créer, supprimer, enregistrer…) ne sont pas cliquées.
 *   npx ts-node --transpile-only test/browser/cockpit-ecrans.e2e.ts [RISE|ATLAS|ORION]   (serveur de recette sur 3302)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
(async () => {
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs: string[] = [];
  p.on('console', (m) => { if (m.type() === 'error' && /TypeError|ReferenceError/.test(m.text())) errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push(String(e.stack || e)));
  const proj = process.argv[2] || 'ATLAS';
  await p.goto(`http://localhost:3302/RISE%20Cockpit.dc.html?as=p01&project=${proj}`);
  await p.waitForTimeout(6000);
  const block = await p.evaluate(() => (document.querySelector('[data-proj-switch]') as HTMLElement)?.innerText.replace(/\n/g, ' '));
  console.log('Bloc projet :', block);
  const src = readFileSync('../frontends/RISE Cockpit.dc.html', 'utf8').split('\n');
  const start = src.findIndex((l) => l.includes('<script type="text/x-dc"')) + 1;
  let ko = 0;
  const show = (where: string) => {
    if (!errs.length) return false;
    const e = errs[0]; errs.length = 0; ko++;
    console.log(`✘ ${where} :`, e.split('\n').slice(0, 2).join(' / '));
    const m = /<anonymous>:(\d+):(\d+)/.exec(e);
    if (m) { const line = start + Number(m[1]) - 3; console.log(`  l.${line} :`, (src[line - 1] || '').slice(Math.max(0, +m[2] - 160), +m[2] + 60)); }
    return true;
  };
  let visited = 0; show('Aujourd’hui');
  // Entrées de la barre latérale, puis onglets internes de chaque page.
  const navs = await p.evaluate(() => Array.from(document.querySelectorAll('aside [onclick], aside div, aside a')).map((e) => (e as HTMLElement).innerText.trim()).filter((t) => /^(Aujourd'hui|Pilotage|Comités et rapports|Base de connaissance|Info projet)$/.test(t)));
  for (const n of [...new Set(navs)]) {
    await p.evaluate((t) => (Array.from(document.querySelectorAll('aside *')).find((e) => (e as HTMLElement).innerText?.trim() === t && (e as HTMLElement).children.length <= 2) as HTMLElement)?.click(), n);
    await p.waitForTimeout(1200);
    const bad = await p.evaluate(() => /renderVals\(\)/.test(document.body.innerText.slice(0, 200)));
    if (!show(n) && !bad) console.log('✔', n);
    // Onglets et sélecteurs de la page (éléments cliquables hors barre latérale), sans les actions qui écrivent.
    const tabs: string[] = await p.evaluate(() => { const aside = document.querySelector('aside')!; return Array.from(document.querySelectorAll('*')).filter((e) => !aside.contains(e) && e.children.length <= 1 && getComputedStyle(e).cursor === 'pointer' && (e as HTMLElement).innerText && (e as HTMLElement).innerText.trim().length < 28 && (e as HTMLElement).offsetParent).map((e) => (e as HTMLElement).innerText.trim()); });
    for (const t of [...new Set(tabs)].filter((x) => !/créer|supprim|enregistr|valider|envoyer|publier|annuler|ajouter|générer|importer|déposer|inviter|archiver|retirer|réinitial|choisir|saisir|demander|exporter|télécharger|confirmer|^×$|^[+]/i.test(x))) {
      await p.evaluate((x) => { const aside = document.querySelector('aside')!; (Array.from(document.querySelectorAll('*')).find((e) => !aside.contains(e) && e.children.length <= 1 && getComputedStyle(e).cursor === 'pointer' && (e as HTMLElement).innerText?.trim() === x) as HTMLElement)?.click(); }, t);
      await p.waitForTimeout(350);
      show(`${n} › ${t}`); visited++;
    }
  }
  console.log('onglets visités :', visited, ko ? `· ${ko} erreur(s)` : '· aucune erreur');
  await b.close();
  process.exit(ko ? 1 : 0);
})();
