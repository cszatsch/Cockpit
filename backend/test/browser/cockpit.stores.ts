/**
 * Sonde de synchronisation du RISE Cockpit : modifie chaque magasin persistant de l'écran
 * (comme le font les gestionnaires de l'interface) et relève les appels API émis et leur statut.
 *
 * Lancement (API démarrée sur E2E_API ; réamorcer d'abord la base : DATABASE_URL=…/rise_fe_cockpit npm run db:seed) :
 *   cd backend && npx ts-node --transpile-only test/browser/cockpit.stores.ts
 */
import { Page } from 'playwright';
import { openBrowser, newPage } from './harness';

const API = process.env.E2E_API || 'http://localhost:3101';
type Step = [string, string];

const STEPS: Step[] = [
  ['ed · jalon (nom, porteur, référence, confirmation)', `c.edit('ms','J02','n','Recette CRM e2e'); c.edit('ms','J02','owner','p05'); c.edit('ms','J02','baselineIso','2026-10-20'); c.edit('ms','J02','confIso','2026-09-26')`],
  ['ed · problème (sévérité, cible, chantier)', `c.edit('is','P01','sev',4); c.edit('is','P01','targetIso','2026-10-31'); c.edit('is','P01','ws','Interfaces')`],
  ['ed · action (échéance, porteur, origine)', `c.edit('ac','A-42','dueIso','2026-10-05'); c.edit('ac','A-42','owner','p07'); c.edit('ac','A-42','source','R02')`],
  ['ed · décision (fiche : titre, priorité, statut, instance, chantier)', `c.edit('fa','D-006','t','Décision e2e'); c.edit('fa','D-006','p',2); c.edit('fa','D-006','st','En instruction'); c.edit('fa','D-006','inst','Comité de projet'); c.edit('fa','D-006','ch','Finance')`],
  ['ed · décision (statut du panneau)', `c.edit('dc','D-008','status','IN_REVIEW')`],
  ['ed · planning (dates, réel, porteur, prévu forcé)', `c.edit('pl','SP5.2','end','2026-11-15'); c.edit('pl','SP5.2','reel',61); c.edit('pl','C3','owner','p05'); c.edit('pl','P5','prevuSet',40)`],
  ['actStatus', `c.setState(s => ({ actStatus: { ...(s.actStatus||{}), 'A-42': 'En cours' } }))`],
  ['sesEd · annulation, déplacement, heure', `c.setState(s => ({ sesEd: { ...(s.sesEd||{}), 'S-g1-22': { status: 'CANCELLED' }, 'S-g1-23': { dateIso: '2026-12-18', time: '10:00' } } }))`],
  ['sesAdded · nouvelle séance', `c.setState(s => ({ sesAdded: [ ...(s.sesAdded||[]), { id: 'S-g2-x-n1', bodyId: 'g2', number: 99, dateIso: '2026-11-05', time: '09:30', place: 'Visio', status: 'PLANNED', participants: [], reportId: null } ] }))`],
  ['refValues · Lot, Phase, Sous-phase', `const M=c.state.data.model; const cells=(k,id,i,v)=>{const r=M[k].rows.find(x=>x.id===id); const d=[...r.cells]; d[i]=v; return d;}; c.setState(s => ({ refValues: { ...(s.refValues||{}), 'WAVE/w3': cells('WAVE','w3',2,'01/2028'), 'PHASE/P6': cells('PHASE','P6',1,'Run e2e'), 'SUBPHASE/SP5.2': cells('SUBPHASE','SP5.2',2,'Formation e2e') } }))`],
  ['refValues · Chantier (responsable, dépendances, phases)', `const r=c.state.data.model.WORKSTREAM.rows.find(x=>x.id==='C2'); const d=[...r.cells]; d[2]='Sophie Marchand'; d[4]='C1 · C5'; d[5]='P4 P5 P6'; c.setState(s => ({ refValues: { ...(s.refValues||{}), 'WORKSTREAM/C2': d } }))`],
  ['refValues · Personne (poste, rôles, actif)', `const r=c.state.data.model.PERSON.rows.find(x=>x.id==='p02'); const d=[...r.cells]; d[3]='Directeur de mission'; d[4]='AMOA Externe · Intégrateur'; c.setState(s => ({ refValues: { ...(s.refValues||{}), 'PERSON/p02': d } }))`],
  ['refValues · Instance, Projet, Client, Rôle, Affectation, Livrable', `const M=c.state.data.model; const cells=(k,id,i,v)=>{const r=M[k].rows.find(x=>x.id===id); const d=[...r.cells]; d[i]=v; return d;}; c.setState(s => ({ refValues: { ...(s.refValues||{}), 'GOVERNANCE_BODY/g3': cells('GOVERNANCE_BODY','g3',2,'Mensuelle'), 'PROJECT/city': cells('PROJECT','city',1,'Lyon'), 'CLIENT/c1': cells('CLIENT','c1',2,'Client e2e'), ['ROLE/'+M.ROLE.rows[12].id]: cells('ROLE',M.ROLE.rows[12].id,0,'Rôle e2e'), 'PROJECT_ASSIGNMENT/as-p01-ro10': cells('PROJECT_ASSIGNMENT','as-p01-ro10',4,'31/03/2027'), 'DELIVERABLE/l2': cells('DELIVERABLE','l2',1,'Robin Lefèvre') } }))`],
  ['refDeleted · livrable', `c.setState(s => ({ refDeleted: { ...(s.refDeleted||{}), 'DELIVERABLE/l3': true } }))`],
  ['bmEd · ressenti, sentiment, domaine, question', `c.editBm('ecf.series.6', 5.9); c.editBm('sentiment.jul', [20,40,40]); c.editBm('domains.0.n', 'Logistique e2e'); c.editBm('domains.1.series.5', 6.1); c.bmPut({ questions: c.mergedData().barometre.questions.map((q,i)=> i ? q : { ...q, q: 'Question e2e' }) })`],
  ['bmAdd · domaine et relevé mensuel', `c.setState(s => ({ bmAdd: { ...(s.bmAdd||{}), domains: [{ n: 'Domaine e2e', size: 0, resp: 4, series: [null,null,null,null,null,null,6], range: '' }], months: [{ key: 'm2026-08', label: 'août', v: 5.8, resp: 30, sent: [25,35,40], qs: [{ q: 'Q e2e', v: 6, delta: 0 }], th: [['Thème e2e','ok']] }] } }))`],
  ['phLots · lots d’une phase', `c.phSet('P6', { w1: { start: '07/2027', end: '06/2028' }, w2: { start: '01/2028', end: '12/2028' } }, 'e2e')`],
  ['arbData · fiche d’arbitrage de D-009', `c.setState(s => ({ arbData: { ...(s.arbData||{}), 'D-009': { tx: { dcTitle: 'FA-e2e', dcQ: 'Question e2e ?', recOpt: 'Option A' }, crit: [['Coût','60 %',3,'ok',2,'moins'],['Délai','40 %',2,'',4,'']], dec: 'D-022' } }, ed: { ...(s.ed||{}), 'fa:D-009': { dec: 'D-022', decL: 'Décision e2e' } } }))`],
  ['lvTrack · avancement et risque', `c.lvSetTrack('l50', { prog: 55 }); c.lvSetTrack('l51', { risk: 'crit' })`],
  ['newTasks · tâche manuelle', `c.setState(s => ({ newTasks: [ ...(s.newTasks||[]), { id: 'tk-e2e', author: 'p01', status: 'TODO', link: null, n: 'Tâche e2e', detail: 'détail', due: '', dueIso: '2026-10-02', cta: 'Ouvrir', lvl: 'due' } ] }))`],
  ['mine* · surcharges de tâches calculées', `const n = c._mineRows.length; c.setState(s => ({ mineTitles: { ...(s.mineTitles||{}), [n-1]: 'Titre e2e' }, mineDue: { ...(s.mineDue||{}), [n-1]: '2026-10-09' }, mineCta: { ...(s.mineCta||{}), [n-1]: 'Relancer' }, mineArch: { ...(s.mineArch||{}), [n-1]: '23 sept.' } }))`],
  ['gbExtra, gbMem · instance', `c.setState(s => ({ gbExtra: { ...(s.gbExtra||{}), g4: { shortName: 'ARB', color: '#aa3355' } }, gbMem: { ...(s.gbMem||{}), g4: ['p03','p05','p01'] } }))`],
  ['added · jalon, problème, action, décision', `c.setState(s => ({ added: { ms: [{ id: 'ms-e2e', code: 'J10', n: 'Jalon e2e', iso: '2026-12-01', baselineIso: '2026-12-01', owner: 'p01', wsId: 'C3', ws: 'Ventes / CRM', phaseId: 'P5', subphaseId: null, confirmedDays: 0 }], is: [{ id: 'P04', n: 'Problème e2e', sev: 3, owner: 'p01', ws: 'Finance', targetIso: '2026-11-01', detail: 'x', status: 'OPEN' }], ac: [{ id: 'A-50', n: 'Action e2e', owner: 'p01', dueIso: '2026-10-10', status: 'OPEN', source: 'R02' }], fa: [{ id: 'D-011', t: 'Décision e2e créée', p: 3, dec: '', decL: '', st: 'Brouillon', ddIso: '', ch: 'Interfaces', inst: 'Comité de projet', crIso: '2026-09-26' }] } }))`],
  ['lvAdded, dlOwner · livrable', `c.setState(s => ({ lvAdded: [{ id: 'lx-e2e', owner: 'p01', cells: ['Livrable e2e', '@p01', 'AMOA', 'Deploy', '5.2 Formation', 'Finance'] }], lvTrack: { ...(s.lvTrack||{}), 'lx-e2e': { prog: 10, risk: null } }, dlOwner: { ...(s.dlOwner||{}), l4: 'p05' } }))`],
  ['psAdded, psAcc · personne et invitation', `c.setState(s => ({ psAdded: [{ id: 'n-e2e', cells: ['Zoé Test', 'Onepoint', 'Onepoint', 'Consultante', '', '', 'zoe.test@example.com', 'oui'] }], psAcc: { ...(s.psAcc||{}), p05: 'pending' } }))`],
  ['gbAdded, roAdded, roTier, tmAdded, wsAdded', `c.setState(s => ({ gbAdded: [{ id: 'gn-e2e', cells: ['Instance e2e', '', 'Mensuelle'], members: [] }], roAdded: [{ id: 'ron-e2e', cells: ['Rôle créé e2e', '0'] }], roTier: { ...(s.roTier||{}), 'ron-e2e': 2, ro01: 1 }, tmAdded: [{ id: 'tn-e2e', cells: ['', 'Équipe e2e', 'desc', '0'] }], wsAdded: [{ id: 'wn-e2e', cells: ['9', 'Chantier e2e', '', 'Actif', '', ''], waves: [0,0,0,0] }] }))`],
  ['spAdded, phAdded, waAdded', `c.setState(s => ({ spAdded: [{ id: 'spn-e2e', desc: '', cells: ['5.9', 'Deploy', 'Sous-phase e2e', '01/10/2026', '31/10/2026', 'Prévue'] }], phAdded: [{ id: 'phn-e2e', desc: '', cells: ['7', 'Phase e2e', 'Lot 2', '01/2029', '12/2029', 'Prévue'] }], waAdded: [{ id: 'wan-e2e', cells: ['5', 'Lot 5 · Lot e2e', '2031', '2032', 'Prévu'] }] }))`],
  ['spDesc, phDesc', `c.setState(s => ({ spDesc: { ...(s.spDesc||{}), 'SP5.3': 'Description e2e' }, phDesc: { ...(s.phDesc||{}), P4: 'Phase e2e' } }))`],
  ['plAdd · phase, sous-phase, chantier', `c.setState(s => ({ plAdd: { ph: [{ id: 'P8-x', code: '8', n: 'Planning e2e', start: '2028-07-01', end: '2028-12-31', reel: 0, prevuSet: null, owner: 'p03' }], sp: [{ id: 'SP5.8-x', code: '5.8', ph: 'P5', n: 'SP planning e2e', start: '2026-10-01', end: '2026-11-30', reel: 5, prevuSet: null, crit: false, owner: 'p01' }], ch: [{ id: 'C10-x', code: 'C10', n: 'Chantier planning e2e', start: '2026-10-01', end: '2027-06-30', reel: 0, prevuSet: null, owner: 'p03', phases: ['P5'] }] } }))`],
  ['templates · activation, suppression, publication', `c.setState(s => ({ templates: [{ id: 'T9999999999999', name: 'Template e2e', author: 'Robin Lefèvre', version: '1.0', comps: [{ id: 'synthese', kind: 'Projet', target: '' }, { id: 'planning', kind: 'Vague', target: 'Lot 1 · AMC Corp, Brand X et stores' }], pages: 5, published: '', committee: 'Comité de projet', active: true, desc: 'e2e' }, ...s.templates.filter(t => t.id !== 'T6').map(t => t.id === 'T4' ? { ...t, active: true } : t)] }))`],
  ['tplHistory · rapport versé', `c.setState(s => ({ tplHistory: [{ id: 'H' + Date.now(), name: 'Support COPIL standard', version: '2.1', committee: 'Comité de pilotage', bodyId: 'g1', sessionId: 'S-g1-21', date: '', time: '', by: '', saved: true }, ...s.tplHistory] }))`],
  ['modPh · demande d’activation Budget', `c.setState(s => ({ modPh: { ...(s.modPh||{}), b: 1 } }))`],
  ['préférences · disposition, ville, prénom', `c.setState({ dbL: ['ai','golive'], profCity: 'Lyon', profFirst: 'Rob' })`],
  ['sections · fiche projet, go-live, chronologie', `c.setState(s => ({ projEd: { ...(s.projEd||{}), 'fiche:0.1.2': 'Texte e2e' }, goliveEd: { 0: 'Reportée' }, goliveDate: { 0: '2026-12-01' }, chronoEd: { 2: { t: 'Étape e2e' } } }))`],
];

async function run(page: Page, log: Array<{ step: string; calls: string[] }>) {
  for (const [name, code] of STEPS) {
    const calls: string[] = [];
    const onResp = (r: any) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && r.request().method() !== 'GET') calls.push(r.request().method() + ' ' + u.pathname.replace('/api/projects/RISE', '') + ' → ' + r.status()); };
    page.on('response', onResp);
    await page.evaluate((code) => { const c = (window as any).__riseCockpit; new Function('c', code)(c); }, code);
    await page.waitForTimeout(2600);
    const toast = await page.evaluate(() => (window as any).__riseCockpit.state.toast);
    page.off('response', onResp);
    log.push({ step: name, calls });
    const bad = calls.filter((x) => !/→ 2\d\d$/.test(x));
    console.log((bad.length || !calls.length ? '✘ ' : '✔ ') + name + '\n     ' + (calls.join('\n     ') || '(aucun appel)') + (bad.length ? '\n     toast : ' + toast : ''));
  }
}

(async () => {
  const b = await openBrowser();
  const errors: string[] = [];
  const page = await newPage(b, { errors });
  await page.goto(API + '/RISE%20Cockpit.dc.html?e2e=1&as=p01', { waitUntil: 'load' });
  await page.waitForFunction(() => (window as any).__riseCockpit && (window as any).__riseCockpit.state.data, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const log: Array<{ step: string; calls: string[] }> = [];
  await run(page, log);
  console.log('Erreurs JS :', errors.filter((e) => !/attribute .*Expected|Failed to load resource/.test(e)).slice(0, 5));
  await b.close();
})();
