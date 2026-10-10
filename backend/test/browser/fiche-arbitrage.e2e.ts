/// <reference lib="dom" />
/**
 * Recette navigateur de la fiche d'arbitrage « barème commun » (maquette 11a, 10/10/2026) : création depuis « Saisir sans Jev »
 * (intitulé et décision, puis « Composer la fiche »), contrôle de complétude (soulignés orange, premier problème dans la légende),
 * clavier (Entrée : nom → poids → critère suivant), poids plafonné à 100, notes en barres (second clic : effacée), scores, verdict,
 * total des poids, justifications, enregistrement réel ; édition depuis Pilotage › Décisions (fiche rechargée), retour à la décision.
 *   npx ts-node --transpile-only test/browser/fiche-arbitrage.e2e.ts [dossier des captures]   (serveur de recette sur 3302)
 */
import { chromium, Page } from 'playwright';
(async () => {
  const b = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const p: Page = await b.newPage({ viewport: { width: 1700, height: 950 } });
  const errs: string[] = [];
  p.on('pageerror', (e) => errs.push(String(e.stack || e)));
  p.on('console', (m) => { if (m.type() === 'error' && /TypeError|ReferenceError/.test(m.text())) errs.push(m.text()); });
  const shots = process.argv[2];
  const shot = async (n: string) => { if (shots) await p.locator('[data-screen-label="Jev"]').screenshot({ path: `${shots}/fa-${n}.png` }); };
  let ko = 0;
  const check = (what: string, ok: boolean, got?: unknown) => { if (!ok) ko++; console.log(ok ? '✔' : '✘', what, ok ? '' : '→ ' + JSON.stringify(got)); };
  const wait = (ms = 250) => p.waitForTimeout(ms);
  const active = () => p.evaluate(() => (document.activeElement as HTMLElement).getAttribute('aria-label'));
  const foot = () => p.locator('.fa11 [data-foot]').innerText();
  const rate = async (side: 'A' | 'B', crit: string, n: number) => { await p.getByRole('radiogroup', { name: `Note de ${side} pour ${crit}` }).getByRole('radio', { name: 'Note ' + n }).click(); await wait(120); };

  await p.goto('http://localhost:3302/RISE%20Cockpit.dc.html?as=p01&project=RISE&e2e=1');
  await wait(6000);
  await p.evaluate(() => (window as any).__riseCockpit.setState({ assistant: true }));
  await wait(600);
  await p.getByRole('button', { name: 'Saisir sans Jev' }).click();
  await wait(800);

  // 1. Création : « Saisir sans Jev » › Fiche d'arbitrage, intitulé et décision, puis « Composer la fiche ».
  await p.locator('#ssj-o-arbitrage').click();
  await wait(700);
  await p.keyboard.type('Recette fiche 11a');
  const form = p.getByRole('region', { name: "Nouvelle fiche d'arbitrage" });
  await form.locator('[role=combobox]', { hasText: 'Choisir une décision' }).click();
  await wait(300);
  const opts = await form.locator('[role=option]').allInnerTexts();
  // Une décision sans fiche (la recette peut être relancée) ; à défaut, la première.
  const cands = opts.map((t) => t.trim()).filter((t) => /^D-\d+/.test(t));
  const blank = await p.evaluate((L) => L.find((t: string) => !(window as any).__riseCockpit._api.ficheOf(t.split(' · ')[0])), cands);
  const target = blank || cands[0] || '';
  const decId = (target.match(/^D-\d+/) || [''])[0];
  await form.locator('[role=option]', { hasText: target }).first().click();
  await wait(300);
  check('décision choisie dans la liste', !!decId, opts);
  await form.getByRole('button', { name: 'Composer la fiche' }).click();
  await wait(700);
  const fiche = p.locator('.fa11');
  check('« Composer la fiche » ouvre la fiche « barème commun » à la place du formulaire', (await fiche.count()) === 1 && (await fiche.isVisible()));
  const fresh = (await p.getByLabel("Intitulé de l'option A").inputValue()) === '';
  check('état initial : intitulés vides et un critère vierge', !fresh || ((await p.getByLabel('Nom du critère 1').count()) === 1 && (await p.getByLabel('Nom du critère 2').count()) === 0));
  check('verdict sans note : « Notez les critères pour comparer »', (await fiche.getByText('Notez les critères pour comparer').count()) === 1);
  await shot('1-vierge');

  // 2. Enregistrer une fiche incomplète : premier problème dans la légende, champs soulignés en orange.
  await p.getByLabel("Intitulé de l'option A").fill('');
  await fiche.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(200);
  check('« Renseignez l\'intitulé des deux options » en orange, intitulé A en défaut', (await foot()) === "Renseignez l'intitulé des deux options" && (await p.getByLabel("Intitulé de l'option A").getAttribute('aria-invalid')) === 'true', await foot());
  check('bouton gris tant que la fiche est incomplète', /background:\s*rgb\(237, 242, 240\)/.test((await fiche.getByRole('button', { name: 'Enregistrer' }).getAttribute('style')) || ''));
  await shot('2-incomplete');

  // 3. Intitulés, critères au clavier (Entrée : nom → poids → critère suivant), poids plafonné à 100.
  await p.getByLabel("Intitulé de l'option A").fill('Éditeur SaaS');
  await p.getByLabel("Intitulé de l'option B").fill('Développement interne');
  // Fiche déjà remplie (relance de la recette) : on repart de critères vides.
  while ((await p.getByLabel('Nom du critère 2').count()) > 0) { await p.getByLabel('Nom du critère 1').click(); await wait(150); await p.getByRole('button', { name: /^Supprimer / }).click(); await wait(150); }
  await p.getByLabel('Nom du critère 1').fill('');
  await p.getByLabel('Nom du critère 1').click();
  await p.keyboard.type('Coût');
  await p.keyboard.press('Enter');
  await wait(150);
  check('Entrée dans le nom : passe au poids', (await active()) === 'Poids de Coût en %', await active());
  await p.keyboard.press('Control+A'); await p.keyboard.type('40'); await p.keyboard.press('Enter');
  await wait(200);
  check('Entrée dans le poids de la dernière ligne : nouveau critère, focus sur son nom', (await active()) === 'Nom du critère 2', await active());
  await p.keyboard.type('Délai'); await p.keyboard.press('Enter'); await p.keyboard.type('35'); await p.keyboard.press('Enter');
  await wait(200);
  await p.keyboard.type('Couverture'); await p.keyboard.press('Enter'); await p.keyboard.type('250');
  await wait(150);
  check('poids : chiffres seuls, plafonné à 100', (await p.getByLabel('Poids de Couverture en %').inputValue()) === '100');
  await p.getByLabel('Poids de Couverture en %').fill('25');
  await wait(150);
  check('total des poids : « 100 % »', (await fiche.getByText('100 %', { exact: true }).count()) === 1);

  // 4. Notes en barres : scores, verdict, carte en tête ; second clic sur la note choisie : effacée.
  for (const [c, a, bb] of [['Coût', 3, 2], ['Délai', 4, 2], ['Couverture', 1, 4]] as [string, number, number][]) { await rate('A', c, a); await rate('B', c, bb); }
  check('scores 2,85 / 2,50, verdict « A devance B de 0,35 pt », A « En tête »', (await p.getByRole('status', { name: /Score de l'option A : 2,85 sur 4, en tête/ }).count()) === 1
    && (await p.getByRole('status', { name: /Score de l'option B : 2,50 sur 4/ }).count()) === 1 && (await fiche.getByText('A devance B de 0,35 pt').count()) === 1);
  await rate('A', 'Couverture', 1);
  check('second clic : note effacée', (await p.getByRole('radiogroup', { name: 'Note de A pour Couverture' }).getByRole('radio', { name: 'Note 1' }).getAttribute('aria-checked')) === 'false');
  await fiche.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(200);
  check('« Notez chaque critère pour A et B »', (await foot()) === 'Notez chaque critère pour A et B', await foot());
  await rate('A', 'Couverture', 1);

  // 5. Ligne ouverte au focus : justifications, suppression ; un clic en dehors la referme.
  await p.getByLabel('Nom du critère 1').click();
  await wait(150);
  await p.getByLabel('Justifier A pour Coût').fill('Licences connues');
  check('ligne ouverte : « Justifier A », « Justifier B », suppression', (await p.getByLabel('Justifier B pour Coût').count()) === 1 && (await p.getByRole('button', { name: 'Supprimer Coût' }).count()) === 1);
  await shot('3-complete');
  await fiche.getByText('Fiche d\'arbitrage', { exact: true }).click();
  await wait(150);
  check('clic en dehors des lignes : ligne refermée', (await p.getByLabel('Justifier A pour Coût').count()) === 0);

  // 6. Enregistrement réel, toast, fiche relue dans les données du projet.
  check('bouton bleu nuit : fiche complète', /background:\s*rgb\(19, 36, 61\)/.test((await fiche.getByRole('button', { name: 'Enregistrer' }).getAttribute('style')) || ''));
  await fiche.getByRole('button', { name: 'Enregistrer' }).click();
  await wait(700);
  check('toast « Fiche d\'arbitrage enregistrée »', (await fiche.getByText("Fiche d'arbitrage enregistrée").count()) === 1);
  await shot('4-enregistree');
  await wait(2500);
  const saved = await p.evaluate((id) => (window as any).__riseCockpit._api.ficheOf(id), decId);
  check('fiche enregistrée sur le serveur (barème commun)', saved && saved.optionA.intitule === 'Éditeur SaaS' && saved.criteres.length === 3 && saved.criteres[0].justificationA === 'Licences connues' && saved.criteres[2].noteB === 4, saved);
  await p.getByRole('button', { name: 'Retour au formulaire de la fiche' }).click();
  await wait(500);
  check('retour : le formulaire de la fiche (décision choisie)', (await form.locator('[role=combobox]', { hasText: decId }).count()) === 1);

  // 7. Édition depuis Pilotage › Décisions : fiche rechargée, retour à la décision.
  await p.evaluate((id) => (window as any).__riseCockpit.setState({ assistant: false, ssjOn: false, space: 'pilotage', tab: 'decisions', faSel: id }), decId);
  await wait(1200);
  await p.getByRole('button', { name: 'Modifier la fiche' }).click();
  await wait(800);
  check('Pilotage › Décisions : « Modifier la fiche » ouvre la fiche existante dans la barre de Jev', (await p.getByLabel("Intitulé de l'option B").inputValue()) === 'Développement interne' && (await p.getByLabel('Nom du critère 3').inputValue()) === 'Couverture');
  await rate('B', 'Coût', 4);
  check('édition : nouveau verdict « B devance A de 0,45 pt »', (await p.locator('.fa11').getByText('B devance A de 0,45 pt').count()) === 1);
  await p.locator('.fa11').getByRole('button', { name: 'Enregistrer' }).click();
  await wait(700);
  check('édition enregistrée', (await p.locator('.fa11').getByText("Fiche d'arbitrage enregistrée").count()) === 1);
  await shot('5-edition');
  await p.getByRole('button', { name: 'Retour à la décision' }).click();
  await wait(600);
  check('retour : barre latérale fermée, fiche de la décision à l’écran', (await p.evaluate(() => (window as any).__riseCockpit.state.assistant)) === false);
  await wait(2000);
  const after = await p.evaluate((id) => (window as any).__riseCockpit._api.ficheOf(id), decId);
  check('note B de Coût mise à jour (4)', after && after.criteres[0].noteB === 4, after);

  if (errs.length) { ko++; console.log('✘ erreurs de la page :', errs.slice(0, 3)); }
  console.log(ko ? `\n${ko} contrôle(s) en échec` : '\nTous les contrôles passent');
  await b.close();
  process.exit(ko ? 1 : 0);
})();
