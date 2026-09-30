/**
 * Banc d'essai des réponses de Jev (décision du 30/09/2026) : rejoue le jeu de l'aiguillage
 * (`test/fixtures/jev-routage.json`) de bout en bout — classification par l'API de JEV, puis traitement (guide,
 * données ou clarification) avec les vrais modèles de la base de la plateforme — et vérifie la réponse finale :
 *   - USAGE : traitement « guide » et au moins une source dans les sections attendues (`test/fixtures/jev-reponses.json`,
 *     annotées avant tout appel) ;
 *   - DONNÉES : requête exécutée sans erreur (vues consultées renvoyées comme sources) ;
 *   - AMBIGU, HORS_SUJET : réponse de clarification.
 * Les questions de suite rejouent d'abord leur historique dans la même conversation (mémoire réelle).
 *
 *   npm run jev:reponses -- [--compte u1] [--ids U01,U02]
 *
 * Résultats : docs/aiguillage-jev/reponses-<date>.json et « Jev - reponses finales.xlsx » (relecture humaine).
 * Les conversations créées par le banc sont supprimées à la fin ; le journal technique (jev_answer_logs) les garde.
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(ROOT, '../docs/aiguillage-jev');
const arg = (name: string, def: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };

interface Q { id: string; groupe: string; question: string; attendu: string; justification: string; historique?: Array<{ question: string }> }
interface Row {
  id: string; question: string; attendu: string; route: string; treatment: string; reason: string | null; reply: string; sources: string[];
  attenduSections: string[]; model: string | null; reranker: string | null; rerankFallback: string | null; reformulated: string | null;
  extracts: Array<{ heading: string; pages: string; similarity: number; rerankScore: number | null }>; totalMs: number; ok: boolean; motif: string;
}

/** Numéro de section d'un titre (« 3.15.1 Créer… » → « 3.15.1 », « Annexe A. … » → « Annexe A »). */
const sectionOf = (heading: string) => (heading.match(/^Annexe [A-Z]/)?.[0] ?? heading.split(' ')[0]);
const inSection = (heading: string, want: string) => { const s = sectionOf(heading); return s === want || s.startsWith(want.endsWith('.') ? want : `${want}.`); };
const headingOfSource = (src: string) => src.replace(/^Guide · /, '').replace(/ · p\. [\d-]+$/, '');

function verdict(q: Q, r: { route: string; treatment: string; sources: string[] }, want: string[]): { ok: boolean; motif: string } {
  if (r.treatment === 'ERREUR') return { ok: false, motif: 'erreur' };
  if (q.attendu === 'USAGE') {
    if (r.treatment !== 'GUIDE') return { ok: false, motif: `traitement ${r.treatment} (aiguillé ${r.route})` };
    const hit = r.sources.some((s) => want.some((w) => inSection(headingOfSource(s), w)));
    return hit ? { ok: true, motif: 'section attendue citée' } : { ok: false, motif: 'aucune source dans les sections attendues' };
  }
  if (q.attendu === 'DONNEES') {
    if (r.treatment !== 'DONNEES' && r.treatment !== 'COMPLET') return { ok: false, motif: `traitement ${r.treatment} (aiguillé ${r.route})` };
    return r.sources.length ? { ok: true, motif: 'requête exécutée' } : { ok: false, motif: 'aucune requête exécutée' };
  }
  return r.treatment === 'CLARIFICATION' ? { ok: true, motif: 'clarification' } : { ok: false, motif: `traitement ${r.treatment} (aiguillé ${r.route})` };
}

async function main() {
  if (fs.existsSync(path.join(ROOT, '.env'))) (process as any).loadEnvFile?.(path.join(ROOT, '.env'));
  process.env.JOBS_ENABLED = 'false';
  const { createApp } = await import('../src/app.factory');
  const { PrismaService } = await import('../src/core/prisma.service');
  const { JevAssistantService } = await import('../src/admin/jev-assistant.service');
  const app = await createApp({ logger: false });
  await app.init();
  const prisma = app.get(PrismaService);
  const jev = app.get(JevAssistantService);
  const accountId = arg('compte', 'u1');
  const only = arg('ids', '').split(',').filter(Boolean);
  const qs: Q[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/jev-routage.json'), 'utf8')).questions.filter((q: Q) => !only.length || only.includes(q.id));
  const want: Record<string, string[]> = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/jev-reponses.json'), 'utf8')).sections;
  const rows: Row[] = [];
  const convs: string[] = [];
  try {
    for (const q of qs) {
      let conv: string | undefined;
      for (const h of q.historique ?? []) { const r = await jev.answer(accountId, h.question, 'overview', conv); conv = r.conversationId; }
      const r = await jev.answer(accountId, q.question, 'overview', conv);
      convs.push(r.conversationId);
      const log = await prisma.jevAnswerLog.findFirst({ where: { conversationId: r.conversationId, question: q.question }, orderBy: { at: 'desc' } });
      const ex = ((log?.extracts as any)?.kept ?? []) as Row['extracts'];
      const v = verdict(q, r, want[q.id] ?? []);
      rows.push({ id: q.id, question: q.question, attendu: q.attendu, route: r.route, treatment: r.treatment, reason: log?.reason ?? null, reply: r.reply, sources: r.sources, attenduSections: want[q.id] ?? [], model: log?.model ?? null, reranker: log?.reranker ?? null, rerankFallback: log?.rerankFallback ?? null, reformulated: log?.reformulated ?? null, extracts: ex, totalMs: log?.totalMs ?? 0, ok: v.ok, motif: v.motif });
      process.stdout.write(v.ok ? '.' : 'x');
    }
    process.stdout.write('\n');
  } finally {
    // Conversations du banc : supprimées (le journal technique reste).
    await prisma.jevConversation.deleteMany({ where: { id: { in: convs } } });
    await app.close();
  }
  const stamp = new Date().toISOString().slice(0, 10);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `reponses-${stamp}.json`), JSON.stringify({ date: new Date().toISOString(), rows }, null, 1));
  await excel(rows, path.join(OUT, 'Jev - reponses finales.xlsx'));
  const by = (t: string) => rows.filter((r) => r.attendu === t || (t === 'CLARIF' && (r.attendu === 'AMBIGU' || r.attendu === 'HORS_SUJET')));
  for (const [t, l] of [['USAGE', 'USAGE (section attendue citée)'], ['DONNEES', 'DONNÉES (requête exécutée)'], ['CLARIF', 'AMBIGU / HORS SUJET (clarification)']]) {
    const g = by(t); console.log(`${l} : ${g.filter((r) => r.ok).length} / ${g.length}`);
  }
  console.log(`Total : ${rows.filter((r) => r.ok).length} / ${rows.length}`);
  for (const r of rows.filter((x) => !x.ok)) console.log(`  ${r.id} ${r.motif} — ${r.sources.join(' | ')}`);
}

async function excel(rows: Row[], file: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Réponses');
  ws.columns = [
    { header: 'Id', key: 'id', width: 6 }, { header: 'Question', key: 'question', width: 42 }, { header: 'Type attendu', key: 'attendu', width: 12 },
    { header: 'Type détecté', key: 'route', width: 12 }, { header: 'Traitement', key: 'treatment', width: 14 }, { header: 'Critère', key: 'critere', width: 10 },
    { header: 'Motif', key: 'motif', width: 30 }, { header: 'Réponse de Jev', key: 'reply', width: 90 }, { header: 'Sources', key: 'sources', width: 46 },
    { header: 'Sections attendues', key: 'sections', width: 16 }, { header: 'Question reformulée', key: 'reformulated', width: 30 },
    { header: 'Extraits (similarité / reclassement)', key: 'extracts', width: 50 }, { header: 'Reclassement', key: 'reranker', width: 22 },
    { header: 'Modèle', key: 'model', width: 18 }, { header: 'Durée (s)', key: 'duree', width: 9 }, { header: 'Relecture (OK / KO)', key: 'relecture', width: 14 }, { header: 'Commentaire', key: 'commentaire', width: 40 },
  ];
  for (const r of rows) {
    ws.addRow({
      ...r, critere: r.ok ? 'OK' : 'KO', sources: r.sources.join('\n'), sections: r.attenduSections.join(', '),
      extracts: r.extracts.map((x) => `${x.heading} · ${x.pages} · ${x.similarity}${x.rerankScore != null ? ` / ${x.rerankScore}` : ''}`).join('\n'),
      reranker: r.rerankFallback ? `repli : ${r.rerankFallback}` : r.reranker ?? '', duree: Math.round(r.totalMs / 100) / 10,
    });
  }
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10233A' } };
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'Q1' };
  ws.eachRow((row, i) => {
    row.alignment = { vertical: 'top', wrapText: true };
    if (i > 1) row.getCell('critere').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: row.getCell('critere').value === 'OK' ? 'FFDFF3EF' : 'FFF8DEDA' } };
  });
  await wb.xlsx.writeFile(file);
}

main().catch((e) => { console.error(e); process.exit(1); });
