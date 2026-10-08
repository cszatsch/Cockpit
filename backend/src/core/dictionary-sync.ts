import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { DICTIONNAIRE, DictTable } from '../domain/jev-dictionnaire';
import { DICTIONNAIRE_COCKPIT } from '../domain/jev-dictionnaire-cockpit';

/** Espaces du dictionnaire : Console (vues `jev`) et Cockpit (vues `jev_cockpit`). */
export const ESPACES: Array<{ espace: 'console' | 'cockpit'; fiches: DictTable[] }> = [
  { espace: 'console', fiches: DICTIONNAIRE },
  { espace: 'cockpit', fiches: DICTIONNAIRE_COCKPIT },
];

type Db = Pick<PrismaClient, '$transaction' | 'dictionnaireTable' | 'dictionnaireColonne'>;

/**
 * Charge le dictionnaire des données (`src/domain/jev-dictionnaire*.ts`) dans `dictionnaire_tables` et
 * `dictionnaire_colonnes`, pour la Console et le Cockpit : remplace tout le contenu (idempotent).
 * Le code fait foi : le dictionnaire n'est modifiable par aucun écran.
 */
export async function seedDictionnaire(db: Db, by = 'Chargement initial'): Promise<Record<string, number>> {
  await db.$transaction(async (tx) => {
    await tx.dictionnaireColonne.deleteMany();
    await tx.dictionnaireTable.deleteMany();
    for (const { espace, fiches } of ESPACES) {
      for (const [i, t] of fiches.entries()) {
        await tx.dictionnaireTable.create({
          data: {
            espace, nom: t.nom, description: t.description, relations: t.relations.join('\n'), usages: t.usages.join('\n'), regles: t.regles.join('\n'),
            position: i, modifiePar: by,
            colonnes: { create: t.colonnes.map((c, j) => ({ nom: c.nom, type: c.type, signification: c.signification, exemplesUnites: c.exemples ?? null, position: j })) },
          },
        });
      }
    }
  }, { timeout: 60_000 });
  return Object.fromEntries(ESPACES.map((e) => [e.espace, e.fiches.length]));
}

/** Empreinte comparable d'une fiche (code ou base). */
const fiche = (t: { nom: string; description: string; relations: string; usages: string; regles: string; colonnes: Array<{ nom: string; type: string; signification: string; exemples: string | null }> }) =>
  JSON.stringify([t.nom, t.description, t.relations, t.usages, t.regles, t.colonnes.map((c) => [c.nom, c.type, c.signification, c.exemples ?? null])]);

/**
 * Écarts entre le dictionnaire en base et celui du code (fiches absentes, en trop ou différentes), par espace.
 * Vide : la base est à jour.
 */
export async function dictionaryDrift(db: Pick<PrismaClient, 'dictionnaireTable'>): Promise<string[]> {
  const rows = await db.dictionnaireTable.findMany({ include: { colonnes: { orderBy: { position: 'asc' } } }, orderBy: [{ espace: 'asc' }, { position: 'asc' }] });
  const out: string[] = [];
  for (const { espace, fiches } of ESPACES) {
    const inDb = new Map(rows.filter((r) => r.espace === espace).map((r) => [r.nom, fiche({ ...r, colonnes: r.colonnes.map((c) => ({ ...c, exemples: c.exemplesUnites })) })]));
    const inCode = new Map(fiches.map((t) => [t.nom, fiche({ ...t, relations: t.relations.join('\n'), usages: t.usages.join('\n'), regles: t.regles.join('\n'), colonnes: t.colonnes.map((c) => ({ ...c, exemples: c.exemples ?? null })) })]));
    for (const [nom, f] of inCode) if (!inDb.has(nom)) out.push(`${espace}.${nom} : absente en base`); else if (inDb.get(nom) !== f) out.push(`${espace}.${nom} : différente`);
    for (const nom of inDb.keys()) if (!inCode.has(nom)) out.push(`${espace}.${nom} : en trop en base`);
    const order = (m: Map<string, string>) => [...m.keys()].join(',');
    if (!out.some((x) => x.startsWith(espace + '.')) && order(inDb) !== order(inCode)) out.push(`${espace} : ordre des fiches`);
  }
  return out;
}

/**
 * Au démarrage de l'API (08/10/2026) : le dictionnaire lu par Jev (Text-to-SQL de la Console et du Cockpit,
 * rédaction des notifications) est rechargé s'il diffère du code. Avant, seul l'amorçage ou `npm run
 * dictionnaire:charger` le mettaient à jour : une vue ajoutée par une migration (`chantiers_sous_phases`, 06/10/2026)
 * restait inconnue de Jev, qui rattachait alors les sous-phases aux chantiers par la phase.
 */
@Injectable()
export class DictionarySyncService implements OnApplicationBootstrap {
  private readonly log = new Logger('Dictionnaire');

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await this.sync();
    } catch (e) {
      this.log.error(`Synchronisation du dictionnaire impossible : ${(e as Error).message}`);
    }
  }

  /** Recharge le dictionnaire s'il diffère du code ; renvoie les écarts trouvés (vide : rien à faire). */
  async sync(): Promise<string[]> {
    const drift = await dictionaryDrift(this.prisma);
    if (!drift.length) return [];
    await seedDictionnaire(this.prisma as unknown as Db, 'Synchronisation au démarrage');
    this.log.log(`Dictionnaire rechargé (${drift.length} écart(s) : ${drift.slice(0, 5).join(' ; ')}${drift.length > 5 ? ' ; …' : ''})`);
    return drift;
  }
}
