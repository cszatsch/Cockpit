/**
 * Lecture des traces de Jev (01/10/2026) : décomposition chronométrée des dernières questions.
 *
 *   npm run jev:traces                       # les 5 dernières
 *   npm run jev:traces -- --dernieres 20 --min 10000 --etape vectorisation
 *
 * --min : durée totale minimale (ms) ; --etape : seulement les traces qui contiennent cette étape (texte), avec un
 * résumé de ses durées (moyenne, médiane, maximum).
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { formatTrace, TraceSpan } from '../src/core/trace';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };

(async () => {
  const env = path.resolve(__dirname, '../.env');
  if (fs.existsSync(env)) (process as any).loadEnvFile?.(env);
  const db = new PrismaClient();
  const n = Number(arg('dernieres', '5')), min = Number(arg('min', '0')), step = arg('etape', '').toLowerCase();
  const rows = await db.jevTrace.findMany({ where: { totalMs: { gte: min } }, orderBy: { at: 'desc' }, take: step ? 500 : n });
  const picked = (step ? rows.filter((r) => (r.spans as unknown as TraceSpan[]).some((s) => s.name.toLowerCase().includes(step))) : rows).slice(0, n);
  for (const r of picked.reverse()) console.log(`\n${r.at.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}\n` + formatTrace({ id: r.id, label: r.label, at: r.at, totalMs: r.totalMs, meta: r.meta as any, spans: r.spans as any }));
  if (step) {
    const ms = rows.flatMap((r) => (r.spans as unknown as TraceSpan[]).filter((s) => s.name.toLowerCase().includes(step) && s.ms > 0).map((s) => s.ms)).sort((a, b) => a - b);
    if (ms.length) console.log(`\nÉtape « ${step} » : ${ms.length} mesure(s) · moyenne ${Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)} ms · médiane ${Math.round(ms[Math.floor(ms.length / 2)])} ms · maximum ${Math.round(ms[ms.length - 1])} ms`);
  }
  if (!picked.length) console.log('Aucune trace.');
  await db.$disconnect();
})();
