/**
 * Applique le catalogue des fournisseurs et modèles d'IA (prisma/catalog/ia-modeles.ts) à la base.
 *
 *   npm run ia:catalogue                 affiche ce qui serait ajouté ou mis à jour
 *   npm run ia:catalogue -- --confirmer  l'applique (tracé au journal d'audit)
 *   npm run ia:catalogue -- --modele "<nom>" [--confirmer]   un seul modèle, sans toucher aux autres ni aux affectations
 *
 * - Fournisseur absent : créé sans clé (« Non testée ») ; la clé se saisit dans la console.
 * - Modèle : retrouvé par fournisseur et nom (sans tenir compte de la casse), sinon créé.
 *   Mis à jour : description, catégorie, identifiant chez le fournisseur, contexte, date de sortie,
 *   max output tokens (LLM), dimensions (Embedding), tarif (converti en euros).
 * Les mêmes contrôles que l'API s'appliquent (tarif selon la catégorie, date pas dans le futur).
 */
import { PrismaClient } from '@prisma/client';
import { normalizeDimensions, normalizePrice } from '../src/domain/ai-pricing';
import { CATALOG_ASSIGNMENTS, CATALOG_MODELS, CATALOG_PROVIDERS, toEur, USD_PER_EUR, USD_PER_EUR_DATE } from '../prisma/catalog/ia-modeles';

const slug = (name: string) => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'modele';
const audit = (db: PrismaClient, action: string, target: string, entityType: string, entityId: string, severity: 'SENSITIVE' | 'CRITICAL' = 'SENSITIVE') =>
  db.auditEntry.create({ data: { accountId: null, actorName: 'Catalogue IA', origin: 'SYSTEM', action, target, severity, entityType, entityId } });

async function main(): Promise<number> {
  const apply = process.argv.includes('--confirmer');
  const only = process.argv.includes('--modele') ? process.argv[process.argv.indexOf('--modele') + 1] : null;
  const models = only ? CATALOG_MODELS.filter((m) => m.name.toLowerCase() === only.toLowerCase()) : CATALOG_MODELS;
  if (only && !models.length) throw new Error(`Modèle « ${only} » absent du catalogue`);
  const db = new PrismaClient();
  const today = new Date().toISOString().slice(0, 10);
  try {
    console.log(`Catalogue IA · tarifs convertis au cours BCE du ${USD_PER_EUR_DATE} : 1 € = ${USD_PER_EUR} $${apply ? '' : ' · simulation (ajoutez --confirmer)'}`);
    for (const p of CATALOG_PROVIDERS) {
      if (await db.provider.findUnique({ where: { id: p.id } })) { console.log(`= fournisseur ${p.name} : déjà présent`); continue; }
      console.log(`+ fournisseur ${p.name} (sans clé)`);
      if (apply) {
        await db.provider.create({ data: { id: p.id, name: p.name, status: 'UNTESTED' } });
        await audit(db, 'Ajout d’un fournisseur LLM', `${p.name} · sans clé (${p.note})`, 'Provider', p.id, 'CRITICAL');
      }
    }
    for (const m of models) {
      if (!(await db.provider.findUnique({ where: { id: m.providerId } }))) throw new Error(`Fournisseur ${m.providerId} absent : ${m.name} ne peut pas être ajouté`);
      if (m.releaseDate > today) throw new Error(`${m.name} : date de sortie dans le futur`);
      const priced = normalizePrice(m.category, { unit: 'TOKENS', in: toEur(m.usd.in), out: m.usd.out == null ? null : toEur(m.usd.out) });
      if ('errors' in priced) throw new Error(`${m.name} : tarif invalide ${JSON.stringify(priced.errors)}`);
      const dims = normalizeDimensions(m.category, m.dimensions ?? [], m.defaultDimension ?? null);
      if ('errors' in dims) throw new Error(`${m.name} : dimensions invalides ${JSON.stringify(dims.errors)}`);
      if (m.category === 'LLM' && !m.maxOutputTokens) throw new Error(`${m.name} : max output tokens manquant`);
      const data = {
        name: m.name, description: m.description, category: m.category, releaseDate: new Date(m.releaseDate),
        maxOutputTokens: m.category === 'LLM' ? m.maxOutputTokens! : null, providerModelId: m.apiId, contextTokens: m.contextTokens ?? null, ...dims,
        priceUnit: priced.price.unit, priceInPerMTok: priced.price.in, priceOutPerMTok: priced.price.out, pricePer1kRequests: null,
      };
      const price = m.usd.out == null
        ? `${m.usd.in} $ → ${priced.price.in} € par M tokens`
        : `${m.usd.in} $ / ${m.usd.out} $ → ${priced.price.in} € / ${priced.price.out} € par M tokens`;
      const cat = { LLM: 'LLM', EMBEDDING: 'Embedding', RERANKING: 'Reranking' }[m.category];
      const size = m.category === 'LLM' ? `${m.maxOutputTokens} tokens` : m.category === 'EMBEDDING' ? `${dims.dimensions.join('/')} dim. (défaut ${dims.defaultDimension})` : `contexte ${m.contextTokens ?? '—'}`;
      const found = await db.aiModel.findFirst({ where: { providerId: m.providerId, name: { equals: m.name, mode: 'insensitive' } } });
      if (found) {
        console.log(`~ ${m.providerId} · ${m.name} (${found.id}) : mis à jour · ${price}`);
        if (apply) {
          await db.aiModel.update({ where: { id: found.id }, data: { ...data, version: { increment: 1 } } });
          await audit(db, 'Modification d’un modèle', `${m.name} · catalogue du 28/09/2026 · ${price}`, 'AiModel', found.id);
        }
        continue;
      }
      let id = slug(m.name);
      for (let n = 2; await db.aiModel.findUnique({ where: { id } }); n++) id = `${slug(m.name)}-${n}`;
      console.log(`+ ${m.providerId} · ${m.name} (${id}) · ${cat} · sortie ${m.releaseDate} · ${size} · ${price}`);
      if (apply) {
        await db.aiModel.create({ data: { id, providerId: m.providerId, active: true, ...data } });
        await audit(db, 'Ajout d’un modèle', `${m.name} · ${cat} · catalogue du 28/09/2026 · ${price}`, 'AiModel', id);
      }
    }
    // Affectations par défaut : seulement si la fonction n'est pas encore affectée (un choix de l'administrateur est gardé).
    for (const a of only ? [] : CATALOG_ASSIGNMENTS) {
      if (await db.modelAssignment.findUnique({ where: { functionId: a.functionId } })) { console.log(`= affectation ${a.functionId} : déjà présente`); continue; }
      const find = ([pv, n]: [string, string]) => db.aiModel.findFirst({ where: { providerId: pv, name: { equals: n, mode: 'insensitive' } } });
      const [p, f] = [await find(a.primary), await find(a.fallback)];
      if (!p) { console.log(`! affectation ${a.functionId} : ${a.primary[1]} absent`); continue; }
      console.log(`+ affectation ${a.functionId} : ${p.name} / ${f?.name ?? 'sans secours'}`);
      if (apply) {
        await db.modelAssignment.create({ data: { functionId: a.functionId, primaryModelId: p.id, fallbackModelId: f?.id ?? null } });
        await audit(db, 'Changement de modèle principal', `${a.functionId} → ${p.name} (affectation par défaut)`, 'ModelAssignment', a.functionId);
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
