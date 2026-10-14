/**
 * Banc des réponses du Jev du Cockpit (14/10/2026, docs/DECISIONS.md) : rejoue `scripts/banc/jev-cockpit-questions.json`
 * par la route de l'écran (`POST /api/projects/:id/assistant/messages` : aiguillage, mémoire, double recherche réels),
 * pour une ou plusieurs configurations de modèles (Insights / Synthèse forcés pour le banc : affectations de la base
 * inchangées), et contrôle chaque réponse sans modèle (`bancChecks` : codes et noms de chantiers, complément répété,
 * source imposée, objet inexistant). Durée et coût mesurés par question (journal des appels du compte).
 *
 *   npm run jev:banc-cockpit -- [--projet PMS] [--compte <id du compte>] [--ids D01,I01]
 *     [--configs "opus=claude-opus-5-5/claude-opus-5-5;sol=gpt-6-sol/gpt-6-sol"]   (nom=Insights/Synthèse, id des modèles)
 *   npm run jev:banc-cockpit -- --reverifier docs/aiguillage-jev/banc-cockpit-<date>.json   (contrôles refaits, sans modèle)
 *
 * Coût réel : environ 15 centimes par question avec Opus, 5 avec GPT-6 Sol. Résultats : docs/aiguillage-jev/
 * banc-cockpit-<date>.json et « Jev Cockpit - banc des reponses.xlsx » (relecture humaine). Les conversations du banc
 * sont supprimées à la fin.
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import type { BancAttendu, BancRef } from '../src/domain/jev-cockpit-banc';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '../docs/aiguillage-jev');
const arg = (name: string, def: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };

interface Q { id: string; attendu: BancAttendu; question: string; historique?: Array<{ question: string }> }
interface Row {
  config: string; id: string; attendu: BancAttendu; question: string; route: string; docsUsed: boolean | null; sources: string[];
  reply: string; ms: number; costEur: number; ok: boolean; motifs: string[];
}

async function main() {
  if (fs.existsSync(path.join(ROOT, '.env'))) (process as any).loadEnvFile?.(path.join(ROOT, '.env'));
  process.env.JOBS_ENABLED = 'false';
  // Jeton du compte du banc, dans ce seul processus (aucun serveur n'écoute) : connexion de développement.
  process.env.AUTH_DEV = 'true';
  const { createApp } = await import('../src/app.factory');
  const { PrismaService } = await import('../src/core/prisma.service');
  const { LlmService } = await import('../src/core/llm.service');
  const { INITIAL_ADMIN } = await import('../src/core/auth/initial-admin');
  const { bancChecks } = await import('../src/domain/jev-cockpit-banc');
  const request = (await import('supertest')).default;
  const app = await createApp({ logger: false });
  await app.init();
  const prisma = app.get(PrismaService);
  const llm = app.get(LlmService);
  const projectId = arg('projet', 'PMS');
  const accountId = arg('compte', '') || (await prisma.account.findUnique({ where: { email: INITIAL_ADMIN.email } }))?.id;
  if (!accountId) throw new Error('compte du banc introuvable : --compte <id>');
  const only = arg('ids', '').split(',').filter(Boolean);
  const qs: Q[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'banc/jev-cockpit-questions.json'), 'utf8')).questions.filter((q: Q) => !only.length || only.includes(q.id));
  const configs = arg('configs', 'base=/').split(';').filter(Boolean).map((c) => { const [name, models] = c.split('='); const [insights, docSyn] = (models ?? '/').split('/'); return { name, insights: insights || null, docSyn: docSyn || null }; });

  // Référentiel du projet pour les contrôles : chantiers (code → nom) et codes des objets.
  const where = { projectId };
  const ws = await prisma.workstream.findMany({ where, select: { code: true, name: true } });
  const codes = (await Promise.all([prisma.risk.findMany({ where, select: { code: true } }), prisma.action.findMany({ where, select: { code: true } }), prisma.milestone.findMany({ where, select: { code: true } }), prisma.decision.findMany({ where, select: { code: true } })])).flat().map((x) => x.code);
  const ref: BancRef = { chantiers: new Map(ws.map((w) => [w.code, w.name])), codes: new Set([...ws.map((w) => w.code), ...codes]) };

  // Contrôles refaits sur un banc déjà joué (réponses gardées, aucun appel aux modèles).
  const again = arg('reverifier', '');
  if (again) {
    const prev = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), again), 'utf8'));
    const rows: Row[] = prev.rows.map((r: Row) => { const motifs = r.reply ? bancChecks(r.attendu, r.reply, r.sources.map((l) => ({ entityType: /^Données/.test(l) ? 'DATA' : 'DOCUMENT' })), ref, { docOnly: r.route === '4a' }) : r.motifs; return { ...r, ok: !motifs.length, motifs }; });
    await app.close();
    fs.writeFileSync(path.resolve(process.cwd(), again), JSON.stringify({ ...prev, rows }, null, 1));
    await report(rows, prev.configs);
    return;
  }

  const server = app.getHttpServer();
  const token = (await request(server).post('/api/auth/dev-login').send({ accountId })).body.token as string;
  const url = `/api/projects/${projectId}/assistant/messages`;
  const ask = (text: string, conversationId?: string) => request(server).post(url).set('Authorization', `Bearer ${token}`).send({ context: { space: 'today' }, text, ...(conversationId ? { conversationId } : {}) });
  const route0 = llm.route.bind(llm);
  const rows: Row[] = [];
  const convs: string[] = [];
  try {
    for (const c of configs) {
      // Modèles du banc : Insights et Synthèse forcés, les autres fonctions selon les affectations de la base.
      (llm as any).route = async (f: string) => (f === 'insights' && c.insights ? { modelId: c.insights, fallback: false } : f === 'doc_syn' && c.docSyn ? { modelId: c.docSyn, fallback: false } : route0(f as any));
      process.stdout.write(`${c.name} (${c.insights ?? 'base'} / ${c.docSyn ?? 'base'}) `);
      for (const q of qs) {
        let conv: string | undefined;
        for (const h of q.historique ?? []) { const r = await ask(h.question, conv); conv = r.body.conversationId; if (conv) convs.push(conv); }
        const start = new Date();
        const r = await ask(q.question, conv);
        const ms = Date.now() - start.getTime();
        if (r.body.conversationId) convs.push(r.body.conversationId);
        await new Promise((res) => setTimeout(res, 300));
        const cost = await prisma.usageRecord.aggregate({ where: { accountId, at: { gte: start } }, _sum: { costEur: true } });
        const reply = r.status === 200 ? String(r.body.reply ?? '') : '';
        const sources = (r.body.sources ?? []) as Array<{ entityType: string; label: string }>;
        const motifs = r.status === 200 ? bancChecks(q.attendu, reply, sources, ref, { docOnly: r.body.route === '4a' }) : [`erreur HTTP ${r.status} : ${r.body?.message ?? ''}`];
        rows.push({ config: c.name, id: q.id, attendu: q.attendu, question: q.question, route: String(r.body.route ?? ''), docsUsed: r.body.docsUsed ?? null, sources: sources.map((s) => s.label), reply, ms, costEur: cost._sum.costEur ?? 0, ok: !motifs.length, motifs });
        process.stdout.write(motifs.length ? 'x' : '.');
      }
      process.stdout.write('\n');
    }
  } finally {
    (llm as any).route = route0;
    await prisma.jevConversation.deleteMany({ where: { id: { in: convs } } });
    await app.close();
  }

  const stamp = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `banc-cockpit-${stamp}.json`), JSON.stringify({ date: new Date().toISOString(), projectId, configs, rows }, null, 1));
  await report(rows, configs);
}

async function report(rows: Row[], configs: Array<{ name: string }>) {
  await excel(rows, configs.map((c) => c.name), path.join(OUT, 'Jev Cockpit - banc des reponses.xlsx'));
  for (const c of configs) {
    const g = rows.filter((r) => r.config === c.name), cost = g.reduce((s, r) => s + r.costEur, 0);
    console.log(`${c.name} : ${g.filter((r) => r.ok).length} / ${g.length} conformes · coût ${cost.toFixed(2)} € (${((cost / Math.max(1, g.length)) * 100).toFixed(1)} c / question) · durée moyenne ${(g.reduce((s, r) => s + r.ms, 0) / Math.max(1, g.length) / 1000).toFixed(1)} s`);
    for (const r of g.filter((x) => !x.ok)) console.log(`  ${r.id} ${r.question} — ${r.motifs.join(' ; ')}`);
  }
}

async function excel(rows: Row[], configs: string[], file: string) {
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet('Synthèse');
  sum.columns = [{ header: 'Configuration', width: 18 }, { header: 'Questions', width: 11 }, { header: 'Conformes', width: 11 }, { header: 'Coût total (€)', width: 14 }, { header: 'Coût moyen (c)', width: 14 }, { header: 'Durée moyenne (s)', width: 17 }];
  for (const c of configs) {
    const g = rows.filter((r) => r.config === c), cost = g.reduce((s, r) => s + r.costEur, 0);
    sum.addRow([c, g.length, g.filter((r) => r.ok).length, +cost.toFixed(3), +((cost / Math.max(1, g.length)) * 100).toFixed(2), +(g.reduce((s, r) => s + r.ms, 0) / Math.max(1, g.length) / 1000).toFixed(1)]);
  }
  sum.getRow(1).font = { bold: true };
  const detail = wb.addWorksheet('Réponses');
  detail.columns = [
    { header: 'Configuration', width: 14 }, { header: 'Id', width: 6 }, { header: 'Attendu', width: 15 }, { header: 'Question', width: 42 }, { header: 'Cas', width: 6 },
    { header: 'Conforme', width: 10 }, { header: 'Motifs', width: 40 }, { header: 'Partie documents', width: 10 }, { header: 'Réponse', width: 90 }, { header: 'Sources', width: 40 },
    { header: 'Durée (s)', width: 10 }, { header: 'Coût (c)', width: 10 }, { header: 'Relecture humaine', width: 30 },
  ];
  for (const r of rows) {
    const row = detail.addRow([r.config, r.id, r.attendu, r.question, r.route, r.ok ? 'oui' : 'non', r.motifs.join('\n'), r.docsUsed === null ? '' : r.docsUsed ? 'oui' : 'non', r.reply, r.sources.join('\n'), +(r.ms / 1000).toFixed(1), +(r.costEur * 100).toFixed(2), '']);
    row.alignment = { vertical: 'top', wrapText: true };
    if (!r.ok) row.getCell(6).font = { bold: true, color: { argb: 'FFC2473B' } };
  }
  detail.getRow(1).font = { bold: true };
  detail.views = [{ state: 'frozen', ySplit: 1 }];
  await wb.xlsx.writeFile(file);
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
