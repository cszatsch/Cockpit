/**
 * Banc d'essai de l'aiguillage de Jev dans le Cockpit (5 cas d'usage, brief du 01/10/2026) : soumet le jeu de test
 * (`test/fixtures/jev-routage-cockpit.json`) à l'API TypeSafe de la carte « JEV » du Registre, plusieurs passages,
 * puis écrit les résultats et régénère le rapport.
 *
 *   npm run jev:aiguillage-cockpit -- --version cockpit-v2 --passages 3
 *   npm run jev:aiguillage-cockpit -- --rapport-seul
 *
 * Résultats : docs/aiguillage-jev/cockpit-resultats-<version>.json ; rapport : docs/RAPPORT - aiguillage de Jev (Cockpit).md
 * (toutes les versions mesurées, plus l'analyse rédigée dans docs/aiguillage-jev/analyse-cockpit.md).
 * Chaque classification est aussi tracée dans jev_classifications (app cockpit, source EVAL).
 */
import fs from 'fs';
import path from 'path';
import { PrismaService } from '../src/core/prisma.service';
import { TodayService } from '../src/core/today.service';
import { ApiCardsService } from '../src/admin/api-cards.service';
import { JevRouterService } from '../src/admin/jev-router.service';
import {
  COCKPIT_CASES, COCKPIT_CASE_LABEL, COCKPIT_ROUTER_MIN_CONFIDENCE, COCKPIT_ROUTER_MULTI_NOUL_MIN, COCKPIT_ROUTER_PROMPTS, COCKPIT_ROUTER_WRITE_MIN_CONFIDENCE, COCKPIT_ROUTER_WRITE_NOUL_MIN,
  CockpitCase, CockpitRouterVersion,
} from '../src/domain/jev-router-cockpit';

interface Q { id: string; groupe: string; question: string; attendu: CockpitCase; acceptes?: CockpitCase[]; multi?: boolean; ecriture?: boolean; justification: string; historique?: Array<{ question: string; cas?: CockpitCase }> }
interface Obs { id: string; passage: number; cas: CockpitCase; choice: string | null; confiance: number; ecriture: number | null; multi: boolean; multiScore: number | null; downgrade: string | null; ms: number | null; status: string; error: string | null; probabilities: Record<string, number> }
interface Result { version: string; date: string; passages: number; seuils: Record<string, number>; obs: Obs[] }

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.resolve(ROOT, '../docs');
const OUT = path.join(DOCS, 'aiguillage-jev');
const DATASET = path.join(ROOT, 'test/fixtures/jev-routage-cockpit.json');
/** Objectifs du brief : bonne classification et aucune lecture classée en modification. */
const TARGET_ACCURACY = 0.95;

const arg = (name: string, def: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };

async function run(version: CockpitRouterVersion, passages: number) {
  if (fs.existsSync(path.join(ROOT, '.env'))) (process as any).loadEnvFile?.(path.join(ROOT, '.env'));
  const prisma = new PrismaService();
  const today = new TodayService();
  const router = new JevRouterService(prisma, new ApiCardsService(prisma, {} as any, today), today);
  const qs: Q[] = JSON.parse(fs.readFileSync(DATASET, 'utf8')).questions;
  const obs: Obs[] = [];
  try {
    for (let p = 1; p <= passages; p++) {
      for (const q of qs) {
        const r = await router.classifyCockpit(q.question, { history: q.historique, version, source: 'EVAL' });
        obs.push({ id: q.id, passage: p, cas: r.cas, choice: r.choice, confiance: r.confiance, ecriture: r.ecriture, multi: r.multi, multiScore: r.multiScore, downgrade: r.downgrade, ms: r.latencyMs, status: r.status, error: r.error, probabilities: r.probabilities as Record<string, number> });
        process.stdout.write(ok(q, r.cas) ? '.' : r.status === 'OK' ? 'x' : '!');
      }
      process.stdout.write(` passage ${p}\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
  fs.mkdirSync(OUT, { recursive: true });
  const res: Result = { version, date: new Date().toISOString(), passages, seuils: { general: COCKPIT_ROUTER_MIN_CONFIDENCE, ecriture: COCKPIT_ROUTER_WRITE_MIN_CONFIDENCE, ecritureNoul: COCKPIT_ROUTER_WRITE_NOUL_MIN, multi: COCKPIT_ROUTER_MULTI_NOUL_MIN }, obs };
  fs.writeFileSync(path.join(OUT, `cockpit-resultats-${version}.json`), JSON.stringify(res, null, 1));
}

const ok = (q: Q, cas: CockpitCase) => cas === q.attendu || (q.acceptes ?? []).includes(cas);
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10} %` : '—');
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function stats(r: Result, qs: Q[]) {
  const byId = new Map(qs.map((q) => [q.id, q]));
  const good = (o: Obs) => ok(byId.get(o.id)!, o.cas);
  const acc = (xs: Obs[]) => ({ n: xs.filter(good).length, d: xs.length, s: `${pct(xs.filter(good).length, xs.length)} (${xs.filter(good).length}/${xs.length})` });
  const byCase = Object.fromEntries(COCKPIT_CASES.map((c) => [c, acc(r.obs.filter((o) => byId.get(o.id)!.attendu === c))]));
  const byGroup = Object.fromEntries([...new Set(qs.map((q) => q.groupe))].map((g) => [g, acc(r.obs.filter((o) => byId.get(o.id)!.groupe === g))]));
  const conf: Record<string, Record<string, number>> = {};
  for (const c of COCKPIT_CASES) conf[c] = Object.fromEntries(COCKPIT_CASES.map((u) => [u, 0]));
  for (const o of r.obs) conf[byId.get(o.id)!.attendu][o.cas]++;
  // Sécurité : lectures (attendu ≠ 3) classées en modification ; modifications reconnues.
  const reads = r.obs.filter((o) => byId.get(o.id)!.attendu !== '3');
  const readAsWrite = reads.filter((o) => o.cas === '3');
  const writes = r.obs.filter((o) => byId.get(o.id)!.attendu === '3');
  const multiQ = r.obs.filter((o) => byId.get(o.id)!.multi), singleQ = r.obs.filter((o) => !byId.get(o.id)!.multi);
  const unstable = qs.filter((q) => new Set(r.obs.filter((o) => o.id === q.id).map((o) => o.cas)).size > 1).map((q) => q.id);
  const perRun = Array.from({ length: r.passages }, (_, i) => { const xs = r.obs.filter((o) => o.passage === i + 1); return pct(xs.filter(good).length, xs.length); });
  const ms = r.obs.map((o) => o.ms).filter((x): x is number => typeof x === 'number');
  return {
    global: acc(r.obs), byCase, byGroup, conf, unstable, perRun,
    readAsWrite, readAsWriteS: `${pct(readAsWrite.length, reads.length)} (${readAsWrite.length}/${reads.length})`,
    writeRecall: `${pct(writes.filter((o) => o.cas === '3').length, writes.length)} (${writes.filter((o) => o.cas === '3').length}/${writes.length})`,
    multiDetect: `${pct(multiQ.filter((o) => o.multi).length, multiQ.length)} (${multiQ.filter((o) => o.multi).length}/${multiQ.length})`,
    multiFalse: `${pct(singleQ.filter((o) => o.multi).length, singleQ.length)} (${singleQ.filter((o) => o.multi).length}/${singleQ.length})`,
    msMoy: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0, msMed: med(ms), msMax: ms.length ? Math.max(...ms) : 0,
    replis: r.obs.filter((o) => o.status !== 'OK').length,
    good,
  };
}

function report() {
  const qs: Q[] = JSON.parse(fs.readFileSync(DATASET, 'utf8')).questions;
  const results: Result[] = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => /^cockpit-resultats-.*\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))) : [];
  const count = (c: CockpitCase) => qs.filter((q) => q.attendu === c).length;
  const L: string[] = [];
  L.push('# Rapport de test — aiguillage des questions de Jev (Cockpit)', '');
  L.push(`Généré par \`npm run jev:aiguillage-cockpit\` le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.`, '');
  L.push(`Jeu de test : \`backend/test/fixtures/jev-routage-cockpit.json\`, ${qs.length} questions dont le cas attendu et sa justification ont été fixés **avant** tout appel à l'API :`);
  L.push(`- par cas : ${COCKPIT_CASES.map((c) => `${c} ${COCKPIT_CASE_LABEL[c]} (${count(c)})`).join(', ')} ;`);
  L.push(`- par groupe : ${[...new Set(qs.map((q) => q.groupe))].map((g) => `${g} (${qs.filter((q) => q.groupe === g).length})`).join(', ')} ;`);
  L.push(`- ${qs.filter((q) => q.multi).length} questions à plusieurs demandes (cas attendu : celui de la première demande).`, '');
  L.push(`Objectifs du brief : au moins ${TARGET_ACCURACY * 100} % de bonne classification, et **0 %** de question de lecture classée en modification.`, '');
  L.push('## Synthèse par version des consignes', '');
  L.push('| Version | Passages | Global | Lecture classée en modification (objectif 0 %) | Modifications reconnues | Plusieurs demandes détectées | Fausses alertes « plusieurs demandes » | Par passage | Questions instables | Temps moyen / médian / max | Replis |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const s = stats(r, qs);
    L.push(`| ${r.version} | ${r.passages} | ${s.global.s} | ${s.readAsWriteS} | ${s.writeRecall} | ${s.multiDetect} | ${s.multiFalse} | ${s.perRun.join(' · ')} | ${s.unstable.length} | ${s.msMoy} / ${s.msMed} / ${s.msMax} ms | ${s.replis} |`);
  }
  L.push('');
  for (const r of results) {
    const s = stats(r, qs);
    L.push(`## Version ${r.version} — détail`, '');
    L.push(`Consignes : \`COCKPIT_ROUTER_PROMPTS['${r.version}']\` (\`backend/src/domain/jev-router-cockpit.ts\`). Seuils : général ${r.seuils.general}, écriture ${r.seuils.ecriture} et « demande d’écriture » ≥ ${r.seuils.ecritureNoul}, plusieurs demandes ≥ ${r.seuils.multi}. Mesure du ${new Date(r.date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.`, '');
    L.push('### Taux de bonne classification par cas et par groupe', '');
    L.push('| Cas | Taux |', '|---|---|');
    for (const c of COCKPIT_CASES) L.push(`| ${c} · ${COCKPIT_CASE_LABEL[c]} | ${s.byCase[c].s} |`);
    L.push('', '| Groupe | Taux |', '|---|---|');
    for (const [g, v] of Object.entries(s.byGroup)) L.push(`| ${g} | ${v.s} |`);
    L.push('', '### Matrice de confusion (lignes : cas attendu, colonnes : cas obtenu, tous passages)', '');
    L.push(`| Attendu \\ Obtenu | ${COCKPIT_CASES.join(' | ')} |`, `|---|${COCKPIT_CASES.map(() => '---').join('|')}|`);
    for (const c of COCKPIT_CASES) L.push(`| ${c} | ${COCKPIT_CASES.map((u) => (s.conf[c][u] ? (c === u ? `**${s.conf[c][u]}**` : String(s.conf[c][u])) : '·')).join(' | ')} |`);
    L.push('', `Stabilité : ${s.unstable.length ? `${s.unstable.length} question(s) changent de cas d’un passage à l’autre : ${s.unstable.join(', ')}` : 'aucune question ne change de cas d’un passage à l’autre'}.`, '');
    L.push('### Erreurs (tous passages)', '');
    const byId = new Map(qs.map((q) => [q.id, q]));
    const errs = qs.filter((q) => r.obs.some((o) => o.id === q.id && !s.good(o)));
    if (!errs.length) L.push('Aucune erreur.', '');
    else {
      L.push('| Id | Question | Attendu | Obtenu (par passage) | Option du modèle | Confiance | Écriture | Motif du seuil |', '|---|---|---|---|---|---|---|---|');
      for (const q of errs) {
        const os = r.obs.filter((o) => o.id === q.id), o = os.find((x) => !s.good(x))!;
        L.push(`| ${q.id} | ${q.question.replace(/\|/g, '/')} | ${q.attendu}${q.acceptes ? ' (ou ' + q.acceptes.join(', ') + ')' : ''} | ${os.map((x) => x.cas).join(' · ')} | ${o.choice ?? '—'} | ${o.status === 'OK' ? o.confiance.toFixed(2) : o.status} | ${o.ecriture === null ? '—' : o.ecriture.toFixed(2)} | ${o.downgrade ?? '—'} |`);
      }
      L.push('');
    }
    L.push('### Tableau détaillé (passage 1)', '');
    L.push('| Id | Groupe | Question | Attendu | Obtenu | Option | Confiance | Écriture | Plusieurs | Temps |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const q of qs) {
      const o = r.obs.find((x) => x.id === q.id && x.passage === 1);
      if (!o) continue;
      const hist = q.historique?.length ? ` *(suite de : « ${q.historique[q.historique.length - 1].question} »)*` : '';
      L.push(`| ${q.id} | ${q.groupe} | ${q.question.replace(/\|/g, '/')}${hist} | ${q.attendu} | ${s.good(o) ? o.cas : `**${o.cas}**`} | ${o.choice ?? '—'} | ${o.status === 'OK' ? o.confiance.toFixed(2) : o.status} | ${o.ecriture === null ? '—' : o.ecriture.toFixed(2)} | ${o.multiScore === null ? '—' : o.multiScore.toFixed(2)}${q.multi ? ' (attendu)' : ''} | ${o.ms ?? '—'} ms |`);
    }
    L.push('');
    void byId;
  }
  const analyse = path.join(OUT, 'analyse-cockpit.md');
  if (fs.existsSync(analyse)) L.push(fs.readFileSync(analyse, 'utf8').trim(), '');
  fs.writeFileSync(path.join(DOCS, 'RAPPORT - aiguillage de Jev (Cockpit).md'), L.join('\n'));
  console.log('Rapport écrit : docs/RAPPORT - aiguillage de Jev (Cockpit).md');
}

(async () => {
  if (!process.argv.includes('--rapport-seul')) {
    const version = arg('version', 'cockpit-v2') as CockpitRouterVersion;
    if (!(version in COCKPIT_ROUTER_PROMPTS)) throw new Error(`Version inconnue : ${version}`);
    await run(version, Number(arg('passages', '3')));
  }
  report();
})().catch((e) => { console.error(e); process.exit(1); });
