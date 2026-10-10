/// <reference lib="dom" />
/**
 * Recette navigateur de « Saisir sans Jev » (maquette 5a, 10/10/2026) : un seul panneau (le formulaire glisse à la place du
 * choix de l'objet, la flèche le ramène ; bandeau sans recherche, liste au clavier), « Parcours » (Phase créée pour de vrai), « Chapitres » (criticité, cycle de vie, listes déroulantes, dates
 * masquées), fiche d'arbitrage (deux chapitres puis la fiche « barème commun »), message de confirmation et formulaire vidé.
 *   npx ts-node --transpile-only test/browser/saisie.e2e.ts [dossier des captures]   (serveur de recette sur 3302)
 */
import { chromium, Page } from 'playwright';
(async () => {
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const p: Page = await b.newPage({ viewport: { width: 1700, height: 950 } });
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e)));
  p.on('console', (m) => { if (m.type() === 'error' && /TypeError|ReferenceError/.test(m.text())) errs.push(m.text()); });
  const shots = process.argv[2];
  const shot = async (n: string) => { if (shots) await p.locator('[data-screen-label="Jev"]').screenshot({ path: `${shots}/${n}.png` }); };
  let ko = 0;
  const check = (what: string, ok: boolean, got?: unknown) => { if (!ok) ko++; console.log(ok ? '✔' : '✘', what, ok ? '' : '→ ' + JSON.stringify(got)); };
  const wait = (ms = 250) => p.waitForTimeout(ms);

  await p.goto('http://localhost:3302/RISE%20Cockpit.dc.html?as=p01&project=RISE&e2e=1');
  await wait(6000);
  await p.evaluate(() => (window as any).__riseCockpit.setState({ assistant: true }));
  await wait(600);
  await p.getByRole('button', { name: 'Saisir sans Jev' }).click();
  await wait(800);

  // 1. Un seul panneau de 400 px, sans filet à gauche ; bandeau sans recherche ; la liste des objets a le focus.
  const w = await p.evaluate(() => { const a = document.querySelector('[data-screen-label="Jev"]') as HTMLElement; const l = document.getElementById('ssj-objs') as HTMLElement;
    return { aside: Math.round(a.getBoundingClientRect().width), border: getComputedStyle(a).borderLeftWidth, pick: Math.round((l.closest('[data-ssj-pick]') as HTMLElement).getBoundingClientRect().width),
      line: getComputedStyle(l).borderLeftWidth, focus: document.activeElement === l, inputs: (l.closest('[data-ssj-pick]') as HTMLElement).querySelectorAll('input').length }; });
  check('barre latérale 400 px sans filet sur le bandeau, trait fin le long de la liste, choix de l’objet sur toute la largeur, sans champ de recherche, focus dans la liste', w.aside === 400 && w.border === '0px' && w.line === '1px' && w.pick === 400 && w.inputs === 0 && w.focus, w);
  const shown = () => p.evaluate(() => ({ pick: getComputedStyle(document.querySelector('[data-ssj-pick]') as Element).visibility, form: getComputedStyle(document.querySelector('[data-screen-label="Jev"] [role=region]') as Element).visibility }));
  check('formulaire caché au départ', (await shown()).form === 'hidden', await shown());
  // Choix d'un objet : retour au menu si le formulaire est affiché, puis clic sur l'objet.
  const pick = async (k: string) => { if ((await shown()).pick !== 'visible') { await p.getByRole('button', { name: "Changer d'objet" }).click(); await wait(600); } await p.locator('#ssj-o-' + k).click(); await wait(600); };
  const order = await p.$$eval('#ssj-objs [role=option]', (els) => els.map((e) => (e as HTMLElement).innerText.trim()));
  check('ordre des objets (commanditaire)', order.join(',') === 'Phase,Chantier,Sous-phase,Jalon,Livrable,Risque,Action,Tâche,Décision,Fiche d\'arbitrage', order);
  await shot('1-choix');

  // 2. Clavier : Fin → Fiche d'arbitrage, flèche haut → Décision, Entrée ouvre le formulaire à la place du menu.
  await p.keyboard.press('End'); await p.keyboard.press('ArrowUp');
  await wait();
  check('flèches : objet actif annoncé (aria-activedescendant)', (await p.locator('#ssj-objs').getAttribute('aria-activedescendant')) === 'ssj-o-decision');
  await p.keyboard.press('Enter');
  await wait(800);
  check('formulaire à la place du menu (menu caché après le glissement)', (await shown()).pick === 'hidden' && (await shown()).form === 'visible', await shown());
  check('Entrée ouvre « Nouvelle décision », focus sur le premier champ', (await p.getByRole('heading', { name: 'Nouvelle décision' }).count()) === 1
    && (await p.evaluate(() => (document.activeElement as HTMLInputElement).placeholder)) === 'Ex. Choisir une solution de remplacement CRM');
  await p.getByRole('button', { name: "Changer d'objet" }).click();
  await wait(600);
  check('flèche : retour au menu, focus dans la liste', (await shown()).pick === 'visible' && (await p.evaluate(() => document.activeElement === document.getElementById('ssj-objs'))));

  // 3. Parcours : Phase créée au clavier (nom, période masquée, responsable).
  await pick('phase');
  await p.keyboard.type('Phase recette 5a');
  await p.keyboard.press('Enter');
  await wait(300);
  await p.keyboard.type('01112026');
  check('masque de date : « / » ajoutés, passage à la date de fin', (await p.evaluate(() => (document.activeElement as HTMLInputElement).getAttribute('aria-label'))) === 'Date de fin');
  await p.keyboard.type('31122026');
  await p.keyboard.press('Enter');
  await wait(300);
  await shot('2-parcours-liste');
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
  await wait(300);
  const ring = await p.locator('[role=region] [role=img]').first().getAttribute('aria-label');
  check('anneau « 2 champs requis remplis sur 2 »', ring === '2 champs requis remplis sur 2', ring);
  await shot('3-parcours-rempli');
  await p.getByRole('button', { name: 'Créer la phase' }).click();
  await wait(1500);
  const toast = await p.locator('[role=region] [role=status]').last().innerText();
  check('message « Phase … créée » dans le panneau', /^Phase .+ créée$/.test(toast.trim()), toast);
  check('formulaire vidé, « Créer la phase » désactivé', (await p.getByRole('button', { name: 'Créer la phase' }).getAttribute('aria-disabled')) === 'true'
    && (await p.locator('[role=region] input').first().inputValue()) === '');
  await shot('4-cree');

  // 4. Chapitres : Risque, criticité, échelle 1–4.
  await pick('risque');
  const region = p.getByRole('region', { name: 'Nouveau risque' });
  check('Chantier par défaut : « Transverse » (PMO), en étiquette', (await region.locator('[role=combobox]').first().innerText()).includes('Transverse'));
  await region.getByRole('button', { name: 'Suivant' }).click();
  await wait(300);
  check('criticité 3 × 3 = « 9 / 16 · Majeure »', (await region.getByText('9 / 16 · Majeure').count()) === 1);
  await region.getByRole('radio', { name: '4 · Très forte' }).first().click();
  await wait(200);
  check('probabilité 4 → « 12 / 16 · Critique »', (await region.getByText('12 / 16 · Critique').count()) === 1);
  await shot('5-risque-evaluation');
  await region.getByRole('button', { name: 'Suivant' }).click();
  await wait(300);
  // Liste déroulante : s'ouvre, se referme par un clic à l'extérieur.
  await region.locator('[role=combobox]', { hasText: 'Choisir une personne' }).click();
  await wait(300);
  check('liste des personnes ouverte', (await region.locator('[role=listbox]').count()) === 1);
  await shot('6-risque-liste');
  await p.getByRole('heading', { name: 'Nouveau risque' }).click();
  await wait(300);
  check('clic à l’extérieur : liste refermée', (await region.locator('[role=listbox]').count()) === 0);
  // Date impossible : rouge, création refusée avec la raison.
  await region.getByPlaceholder('jj/mm/aaaa').click();
  await p.keyboard.type('31022027');
  await wait(200);
  const inv = await region.getByPlaceholder('jj/mm/aaaa').getAttribute('aria-invalid');
  const tip = await region.getByRole('button', { name: 'Créer le risque' }).getAttribute('title');
  check('31/02/2027 : date invalide signalée, « À corriger : Échéance »', inv === 'true' && /Échéance/.test(tip || ''), { inv, tip });
  await region.getByRole('button', { name: 'Annuler' }).click();
  await wait(300);
  check('Annuler vide le formulaire (retour au chapitre 1)', (await region.getByRole('button', { name: /Chapitre 1 · Risque/ }).getAttribute('aria-expanded')) === 'true');

  // 5. Décision : cycle de vie, statut hors parcours.
  await pick('decision');
  const dr = p.getByRole('region', { name: 'Nouvelle décision' });
  await dr.getByRole('button', { name: 'Suivant' }).click();
  await wait(300);
  await dr.getByRole('radio', { name: 'À arbitrer' }).click();
  await dr.getByRole('radio', { name: 'Annulée' }).click();
  await wait(200);
  check('cycle de vie : « Annulée » choisie hors parcours', (await dr.getByRole('radio', { name: 'Annulée' }).getAttribute('aria-checked')) === 'true');
  await dr.getByRole('radio', { name: 'Annulée' }).click();
  await wait(200);
  check('second clic : retour à « Brouillon »', (await dr.getByRole('radio', { name: 'Brouillon' }).getAttribute('aria-checked')) === 'true');
  await shot('7-decision-instance');

  // 6. Fiche d'arbitrage : chapitres Arbitrage et Contexte, puis « Composer la fiche » (détail : test/browser/fiche-arbitrage.e2e.ts).
  await pick('arbitrage');
  const ar = p.getByRole('region', { name: "Nouvelle fiche d'arbitrage" });
  check('fiche d’arbitrage : deux chapitres, « Composer la fiche »', (await ar.getByRole('button', { name: /^Chapitre \d/ }).count()) === 2 && (await ar.getByRole('button', { name: 'Composer la fiche' }).count()) === 1);
  await shot('9-arbitrage');

  if (errs.length) { ko++; console.log('✘ erreurs de la page :', errs.slice(0, 3)); }
  console.log(ko ? `\n${ko} contrôle(s) en échec` : '\nTous les contrôles passent');
  await b.close();
  process.exit(ko ? 1 : 0);
})();
