/**
 * Banc d'essai de l'aiguillage des questions de Jev (décision du 30/09/2026) : soumet le jeu de test
 * (`test/fixtures/jev-routage.json`) à l'API TypeSafe de la carte « JEV » du Registre (base de la plateforme, clé du
 * Registre), plusieurs passages, puis écrit les résultats et régénère le rapport.
 *
 *   npm run jev:aiguillage -- --version v1 --passages 3
 *
 * Résultats : docs/aiguillage-jev/resultats-<version>.json ; rapport : docs/RAPPORT - aiguillage de Jev.md
 * (toutes les versions déjà mesurées, plus l'analyse rédigée dans docs/aiguillage-jev/analyse.md).
 * Chaque classification est aussi tracée dans jev_classifications (source EVAL).
 */
import fs from 'fs';
import path from 'path';
import { PrismaService } from '../src/core/prisma.service';
import { TodayService } from '../src/core/today.service';
import { ApiCardsService } from '../src/admin/api-cards.service';
import { JevRouterService } from '../src/admin/jev-router.service';
import { RouteType, RouterPromptVersion, ROUTER_PROMPTS, ROUTER_MIN_CONFIDENCE } from '../src/domain/jev-router';

interface Q { id: string; groupe: string; piege?: string; question: string; attendu: RouteType; justification: string; historique?: Array<{ question: string; type?: RouteType }> }
interface Obs { id: string; passage: number; type: RouteType; choice: string | null; confiance: number; ms: number | null; status: string; error: string | null; probabilities: Record<string, number>; justification?: string }
interface Result { version: string; date: string; passages: number; seuil: number; obs: Obs[] }

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.resolve(ROOT, '../docs');
const OUT = path.join(DOCS, 'aiguillage-jev');
const DATASET = path.join(ROOT, 'test/fixtures/jev-routage.json');
const TYPES: RouteType[] = ['USAGE', 'DONNEES', 'AMBIGU', 'HORS_SUJET'];

const arg = (name: string, def: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };

async function run(version: RouterPromptVersion, passages: number) {
  if (fs.existsSync(path.join(ROOT, '.env'))) (process as any).loadEnvFile?.(path.join(ROOT, '.env'));
  const prisma = new PrismaService();
  const today = new TodayService();
  const router = new JevRouterService(prisma, new ApiCardsService(prisma, {} as any, today), today);
  const qs: Q[] = JSON.parse(fs.readFileSync(DATASET, 'utf8')).questions;
  const obs: Obs[] = [];
  try {
    for (let p = 1; p <= passages; p++) {
      for (const q of qs) {
        const r = await router.classify(q.question, { history: q.historique, version, source: 'EVAL' });
        obs.push({ id: q.id, passage: p, type: r.type, choice: r.choice, confiance: r.confiance, ms: r.latencyMs, status: r.status, error: r.error, probabilities: r.probabilities as Record<string, number>, justification: r.justification });
        process.stdout.write(r.type === q.attendu ? '.' : r.status === 'OK' ? 'x' : '!');
      }
      process.stdout.write(` passage ${p}\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
  fs.mkdirSync(OUT, { recursive: true });
  const res: Result = { version, date: new Date().toISOString(), passages, seuil: ROUTER_MIN_CONFIDENCE, obs };
  fs.writeFileSync(path.join(OUT, `resultats-${version}.json`), JSON.stringify(res, null, 1));
}

// ───────────── Rapport ─────────────

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10} %` : '—');
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function stats(r: Result, qs: Q[]) {
  const byId = new Map(qs.map((q) => [q.id, q]));
  const ok = (o: Obs) => o.type === byId.get(o.id)!.attendu;
  const sel = (f: (q: Q) => boolean) => r.obs.filter((o) => f(byId.get(o.id)!));
  const acc = (xs: Obs[]) => `${pct(xs.filter(ok).length, xs.length)} (${xs.filter(ok).length}/${xs.length})`;
  const ms = r.obs.map((o) => o.ms).filter((x): x is number => typeof x === 'number');
  const conf: Record<string, Record<string, number>> = {};
  for (const t of TYPES) conf[t] = Object.fromEntries(TYPES.map((u) => [u, 0]));
  for (const o of r.obs) conf[byId.get(o.id)!.attendu][o.type]++;
  // Stabilité : questions dont le type change d'un passage à l'autre.
  const unstable = qs.filter((q) => new Set(r.obs.filter((o) => o.id === q.id).map((o) => o.type)).size > 1).map((q) => q.id);
  const perRun = Array.from({ length: r.passages }, (_, i) => { const xs = r.obs.filter((o) => o.passage === i + 1); return pct(xs.filter(ok).length, xs.length); });
  return {
    global: acc(r.obs),
    nonAmbigu: acc(sel((q) => q.attendu !== 'AMBIGU')),
    usage: acc(sel((q) => q.groupe === 'usage')),
    donnees: acc(sel((q) => q.groupe === 'donnees')),
    pieges: acc(sel((q) => q.groupe === 'pieges')),
    perRun, unstable, conf,
    msMoy: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0, msMed: med(ms), msMax: ms.length ? Math.max(...ms) : 0,
    replis: r.obs.filter((o) => o.status !== 'OK').length,
    ok,
  };
}

function report() {
  const qs: Q[] = JSON.parse(fs.readFileSync(DATASET, 'utf8')).questions;
  const results: Result[] = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => /^resultats-.*\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))) : [];
  const L: string[] = [];
  L.push('# Rapport de test — aiguillage des questions de Jev (Console)', '');
  L.push(`Généré par \`npm run jev:aiguillage\` le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}. Jeu de test : \`backend/test/fixtures/jev-routage.json\` (${qs.length} questions : ${qs.filter((q) => q.groupe === 'usage').length} USAGE, ${qs.filter((q) => q.groupe === 'donnees').length} DONNÉES, ${qs.filter((q) => q.groupe === 'pieges').length} pièges), types attendus justifiés avant tout appel à l'API.`, '');
  L.push('## Synthèse par version des consignes', '');
  L.push('| Version | Passages | Global | Non ambiguës (objectif ≥ 95 %) | USAGE | DONNÉES | Pièges | Par passage | Questions instables | Temps moyen / médian / max | Replis |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const s = stats(r, qs);
    L.push(`| ${r.version} | ${r.passages} | ${s.global} | ${s.nonAmbigu} | ${s.usage} | ${s.donnees} | ${s.pieges} | ${s.perRun.join(' · ')} | ${s.unstable.length ? s.unstable.join(', ') : 'aucune'} | ${s.msMoy} / ${s.msMed} / ${s.msMax} ms | ${s.replis} |`);
  }
  L.push('');
  for (const r of results) {
    const s = stats(r, qs);
    L.push(`## Version ${r.version} — détail`, '');
    L.push(`Consignes : voir \`ROUTER_PROMPTS.${r.version}\` (\`backend/src/domain/jev-router.ts\`). Seuil de confiance : ${r.seuil} (en deçà : AMBIGU).`, '');
    L.push('### Matrice de confusion (lignes : type attendu, colonnes : type obtenu, tous passages)', '');
    L.push(`| Attendu \\ Obtenu | ${TYPES.join(' | ')} |`, `|---|${TYPES.map(() => '---').join('|')}|`);
    for (const t of TYPES) L.push(`| ${t} | ${TYPES.map((u) => (s.conf[t][u] ? (t === u ? `**${s.conf[t][u]}**` : String(s.conf[t][u])) : '·')).join(' | ')} |`);
    L.push('', '### Tableau détaillé (passage 1 ; les passages suivants signalés s’ils diffèrent)', '');
    L.push('| Id | Question | Attendu | Obtenu | Option | Confiance | Temps | Correct | Autres passages |', '|---|---|---|---|---|---|---|---|---|');
    for (const q of qs) {
      const os = r.obs.filter((o) => o.id === q.id), o = os[0];
      if (!o) continue;
      const others = os.slice(1).filter((x) => x.type !== o.type || Math.abs(x.confiance - o.confiance) > 0.05).map((x) => `p${x.passage} : ${x.type} (${x.confiance.toFixed(2)})`).join(' ; ');
      const hist = q.historique?.length ? ` *(suite de : « ${q.historique[q.historique.length - 1].question} »)*` : '';
      L.push(`| ${q.id} | ${q.question.replace(/\|/g, '/')}${hist} | ${q.attendu} | ${o.type} | ${o.choice ?? '—'} | ${o.status === 'OK' ? o.confiance.toFixed(2) : o.status} | ${o.ms ?? '—'} ms | ${s.ok(o) ? 'oui' : '**non**'} | ${others || '—'} |`);
    }
    L.push('');
  }
  const analyse = path.join(OUT, 'analyse.md');
  if (fs.existsSync(analyse)) L.push(fs.readFileSync(analyse, 'utf8').trim(), '');
  fs.writeFileSync(path.join(DOCS, 'RAPPORT - aiguillage de Jev.md'), L.join('\n'));
  console.log('Rapport écrit : docs/RAPPORT - aiguillage de Jev.md');
}

(async () => {
  if (!process.argv.includes('--rapport-seul')) {
    const version = arg('version', 'v1') as RouterPromptVersion;
    if (!(version in ROUTER_PROMPTS)) throw new Error(`Version inconnue : ${version}`);
    await run(version, Number(arg('passages', '3')));
  }
  report();
})().catch((e) => { console.error(e); process.exit(1); });
