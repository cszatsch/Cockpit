/**
 * Applique le catalogue des cartes API (prisma/catalog/api-cartes.ts) à la base.
 *
 *   npm run cartes:catalogue                 affiche ce qui serait supprimé, créé ou mis à jour
 *   npm run cartes:catalogue -- --confirmer  l'applique (tracé au journal d'audit)
 *
 * - Cartes de démonstration (absentes du catalogue) : supprimées.
 * - Cartes gardées : widgets thématiques du catalogue ajoutés, le reste inchangé (clé, réglages).
 * - Flux du catalogue : créés sans clé (flux RSS) ou, déjà présents, remis au nom, tag, endpoint et widgets du catalogue.
 * Mêmes contrôles que l'API : endpoint https public, widgets connus et alimentés par une carte.
 */
import { PrismaClient } from '@prisma/client';
import { endpointError } from '../src/domain/api-cards';
import { API_WIDGET_IDS, cardWidgets, widgetName } from '../src/domain/widgets';
import { CATALOG_CARDS, CATALOG_KEEP } from '../prisma/catalog/api-cartes';

const audit = (db: PrismaClient, action: string, target: string, entityId: string) =>
  db.auditEntry.create({ data: { accountId: null, actorName: 'Catalogue des cartes API', origin: 'SYSTEM', action, target, severity: 'SENSITIVE', entityType: 'ApiCard', entityId } });
const names = (ws: string[]) => ws.map(widgetName).join(', ') || 'aucun widget';

async function main(): Promise<number> {
  const apply = process.argv.includes('--confirmer');
  for (const c of CATALOG_CARDS) {
    const err = endpointError(c.endpoint);
    if (err) throw new Error(`${c.name} : endpoint refusé (${err})`);
  }
  const unknown = [...CATALOG_CARDS.flatMap((c) => c.widgets), ...Object.values(CATALOG_KEEP).flat()].filter((w) => !API_WIDGET_IDS.has(w));
  if (unknown.length) throw new Error(`Widgets inconnus : ${unknown.join(', ')}`);
  const db = new PrismaClient();
  try {
    console.log(`Catalogue des cartes API${apply ? '' : ' · simulation (ajoutez --confirmer)'}`);
    const all = await db.apiCard.findMany({ orderBy: { name: 'asc' } });
    const wanted = new Set([...Object.keys(CATALOG_KEEP), ...CATALOG_CARDS.map((c) => c.id)]);
    for (const c of all.filter((x) => !wanted.has(x.id))) {
      console.log(`- ${c.name} (${c.id}) · ${c.category} : carte de démonstration supprimée`);
      if (apply) {
        await db.$transaction(async (tx) => {
          await tx.apiCard.delete({ where: { id: c.id } });
          await audit(tx as unknown as PrismaClient, 'Suppression d’une carte API', `${c.name} · carte de démonstration (catalogue du 15/10/2026)`, c.id);
        });
      }
    }
    for (const [id, add] of Object.entries(CATALOG_KEEP)) {
      const c = all.find((x) => x.id === id);
      if (!c) { console.log(`! ${id} : carte à garder absente de la base`); continue; }
      const now = cardWidgets(c.widgets), next = [...new Set([...now, ...add])];
      if (next.length === now.length && next.every((w) => c.widgets.includes(w))) { console.log(`= ${c.name} : gardée`); continue; }
      console.log(`~ ${c.name} : gardée · widgets ${names(next)}`);
      if (apply) {
        await db.apiCard.update({ where: { id }, data: { widgets: next, version: { increment: 1 }, updatedBy: 'Catalogue des cartes API' } });
        if (add.some((w) => !now.includes(w))) await audit(db, 'Widgets alimentés par une carte API', `${c.name} · associée à ${names(add.filter((w) => !now.includes(w)))}`, id);
      }
    }
    for (const c of CATALOG_CARDS) {
      const found = all.find((x) => x.id === c.id);
      if (found) {
        console.log(`~ ${c.name} (${c.id}) : remise au catalogue · ${c.category} · ${names(c.widgets)}`);
        if (apply) await db.apiCard.update({ where: { id: c.id }, data: { name: c.name, category: c.category, endpoint: c.endpoint, widgets: c.widgets, feed: true, version: { increment: 1 }, updatedBy: 'Catalogue des cartes API' } });
        continue;
      }
      console.log(`+ ${c.name} (${c.id}) · ${c.category} · ${names(c.widgets)} · ${c.endpoint}`);
      if (apply) {
        await db.$transaction(async (tx) => {
          await tx.apiCard.create({ data: { id: c.id, name: c.name, category: c.category, endpoint: c.endpoint, feed: true, widgets: c.widgets, authMode: 'HEADER', method: 'GET', updatedBy: 'Catalogue des cartes API' } });
          await audit(tx as unknown as PrismaClient, 'Création d’une carte API', `${c.name} · ${c.category} · sans clé · ${names(c.widgets)}`, c.id);
        });
      }
    }
    return 0;
  } finally {
    await db.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
