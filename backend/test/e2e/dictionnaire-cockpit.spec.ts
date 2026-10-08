import { setup, TestCtx, Client, WHO } from '../helpers';
import { DICTIONNAIRE_COCKPIT, JEV_COCKPIT_SCHEMA } from '../../src/domain/jev-dictionnaire-cockpit';
import { JevSqlService } from '../../src/admin/jev-sql.service';
import { DictionarySyncService, dictionaryDrift } from '../../src/core/dictionary-sync';
import { COCKPIT_INSIGHT_DATA_HINT } from '../../src/domain/jev-cockpit-answers';

/**
 * Dictionnaire des données du Cockpit (schéma jev_cockpit).
 * 1. Fiches, vues et tables du dictionnaire concordent.
 * 2. Aucun secret ni chemin de stockage ; vues fermées au rôle de lecture tant que les droits ne sont pas filtrés.
 * 3. Questions de référence : une requête écrite d'après le dictionnaire trouve le même résultat que le Cockpit.
 */
describe('Cockpit — dictionnaire des données', () => {
  let t: TestCtx;
  let pmo: Client;
  const sql = <T = any>(s: string, ...p: unknown[]) => t.db.$queryRawUnsafe<T[]>(s, ...p);
  const TODAY = `'${process.env.DEMO_TODAY}'`;
  const PROJ = `(SELECT id FROM ${JEV_COCKPIT_SCHEMA}.projets WHERE code = 'RISE')`;

  beforeAll(async () => {
    t = await setup();
    pmo = await t.as(WHO.pmo);
  });
  afterAll(() => t.close());

  describe('fiches, vues et tables', () => {
    it('une vue par fiche, et une fiche par vue du schéma jev_cockpit', async () => {
      const views = (await sql<{ table_name: string }>(`SELECT table_name FROM information_schema.views WHERE table_schema = $1 ORDER BY 1`, JEV_COCKPIT_SCHEMA)).map((r) => r.table_name);
      expect(views).toEqual(DICTIONNAIRE_COCKPIT.map((f) => f.nom).sort());
    });

    it.each(DICTIONNAIRE_COCKPIT.map((f) => [f.nom, f] as const))('%s : colonnes de la vue = colonnes documentées ; projet_id présent', async (nom, f) => {
      const cols = (await sql<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, JEV_COCKPIT_SCHEMA, nom)).map((r) => r.column_name);
      expect(cols).toEqual(f.colonnes.map((c) => c.nom));
      expect(cols.includes('projet_id') || nom === 'projets').toBe(true);
      await sql(`SELECT * FROM ${JEV_COCKPIT_SCHEMA}.${nom} LIMIT 1`);
    });

    it('fiches complètes, avec une règle de droits', () => {
      for (const f of DICTIONNAIRE_COCKPIT) {
        expect(f.description.length).toBeGreaterThan(20);
        expect(f.usages.length).toBeGreaterThan(0);
        expect(f.regles.some((r) => /Droits|droits/.test(r))).toBe(true);
        for (const c of f.colonnes) expect(c.signification.length).toBeGreaterThan(3);
      }
    });

    it('tables du dictionnaire : espace cockpit chargé, conforme au fichier source ; espace console intact', async () => {
      const tables = await t.db.dictionnaireTable.findMany({ where: { espace: 'cockpit' }, include: { colonnes: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } });
      expect(tables.map((x) => x.nom)).toEqual(DICTIONNAIRE_COCKPIT.map((f) => f.nom));
      for (const [i, f] of DICTIONNAIRE_COCKPIT.entries()) expect(tables[i].colonnes.map((c) => c.nom)).toEqual(f.colonnes.map((c) => c.nom));
      expect(await t.db.dictionnaireTable.count({ where: { espace: 'console' } })).toBeGreaterThan(30);
    });
  });

  describe('synchronisation avec le code (correctif du 08/10/2026)', () => {
    it('au démarrage, un dictionnaire en base périmé (vue chantiers_sous_phases absente) est rechargé ; à jour, rien n’est réécrit', async () => {
      const sync = t.app.get(DictionarySyncService);
      expect(await dictionaryDrift(t.db)).toEqual([]);
      expect(await sync.sync()).toEqual([]);
      await t.db.dictionnaireTable.delete({ where: { espace_nom: { espace: 'cockpit', nom: 'chantiers_sous_phases' } } });
      await t.db.dictionnaireTable.update({ where: { espace_nom: { espace: 'cockpit', nom: 'sous_phases' } }, data: { relations: 'ancienne relation' } });
      expect(await dictionaryDrift(t.db)).toEqual(['cockpit.sous_phases : différente', 'cockpit.chantiers_sous_phases : absente en base']);
      expect(await sync.sync()).toHaveLength(2);
      expect(await dictionaryDrift(t.db)).toEqual([]);
      const f = await t.db.dictionnaireTable.findUnique({ where: { espace_nom: { espace: 'cockpit', nom: 'chantiers_sous_phases' } } });
      expect(f!.modifiePar).toBe('Synchronisation au démarrage');
    });
    it('chantier d’une sous-phase : par chantiers_sous_phases, jamais par la phase ; nouvelle requête à chaque question de données', () => {
      const sp = DICTIONNAIRE_COCKPIT.find((x) => x.nom === 'sous_phases')!, cp = DICTIONNAIRE_COCKPIT.find((x) => x.nom === 'chantiers_phases')!;
      expect(sp.regles.join(' ')).toMatch(/uniquement par chantiers_sous_phases.*Jamais par la phase/);
      expect(cp.regles.join(' ')).toMatch(/utiliser chantiers_sous_phases/);
      expect(COCKPIT_INSIGHT_DATA_HINT).toMatch(/toujours une nouvelle requête/);
    });
  });

  describe('sécurité', () => {
    it('ni chemin de stockage, ni image, ni JSON de présentation', async () => {
      const cols = (await sql<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1`, JEV_COCKPIT_SCHEMA)).map((r) => r.column_name);
      for (const c of cols) expect(c).not.toMatch(/file|storage|photo|arbitration|components|questions|content|section/i);
      const doc = await t.db.document.findFirstOrThrow();
      await t.db.document.update({ where: { id: doc.id }, data: { fileKey: 'stockage/secret/CHEMINSECRET.pdf' } });
      const dump = (await sql<{ j: string }>(`SELECT coalesce(json_agg(v)::text, '') AS j FROM ${JEV_COCKPIT_SCHEMA}.documents v`))[0].j;
      expect(dump).not.toContain('CHEMINSECRET');
    });

    it('fermées au rôle de lecture de Jev tant que le filtrage par droits n’existe pas', async () => {
      await expect(t.app.get(JevSqlService).executeReadOnly(`SELECT * FROM ${JEV_COCKPIT_SCHEMA}.risques`)).rejects.toThrow(/permission denied/);
    });
  });

  describe('questions de référence : même résultat que le Cockpit', () => {
    let anomalies: any[];
    beforeAll(async () => {
      anomalies = (await pmo.get('/api/projects/RISE/anomalies').expect(200)).body;
    });
    const count = (k: string) => anomalies.filter((a) => a.kind === k).length;

    it('actions en retard', async () => {
      const [{ n }] = await sql(`SELECT count(*)::int AS n FROM ${JEV_COCKPIT_SCHEMA}.actions WHERE projet_id = ${PROJ} AND statut <> 'DONE' AND echeance IS NOT NULL AND echeance < ${TODAY}`);
      expect(n).toBe(count('ACTION_LATE'));
      expect(n).toBeGreaterThan(0);
    });

    it('risques critiques sans plan de mitigation', async () => {
      const [{ n }] = await sql(`SELECT count(*)::int AS n FROM ${JEV_COCKPIT_SCHEMA}.risques WHERE projet_id = ${PROJ} AND statut <> 'CLOSED' AND criticite >= 20 AND coalesce(trim(plan_mitigation), '') = ''`);
      expect(n).toBe(count('CRITICAL_RISK_WITHOUT_PLAN'));
    });

    it('jalons à venir non confirmés depuis plus de 7 jours', async () => {
      const [{ n }] = await sql(`SELECT count(*)::int AS n FROM ${JEV_COCKPIT_SCHEMA}.jalons WHERE projet_id = ${PROJ} AND date_prevue >= ${TODAY} AND coalesce(${TODAY}::date - confirme_le::date, 0) > 7`);
      expect(n).toBe(count('MILESTONE_UNCONFIRMED'));
    });

    it('suivi des livrables : total, terminés, en retard, actifs, à venir, à échéance sous 30 jours', async () => {
      const api = (await pmo.get('/api/projects/RISE/deliverables/tracking').expect(200)).body.counters;
      const [r] = await sql(`
        WITH d AS (
          SELECT l.avancement_pct AS prog, COALESCE(l.date_debut, sp.date_debut) AS deb, COALESCE(l.echeance, sp.date_fin, (COALESCE(l.date_debut, sp.date_debut)::date + 120)::text) AS ech
          FROM ${JEV_COCKPIT_SCHEMA}.livrables l JOIN ${JEV_COCKPIT_SCHEMA}.sous_phases sp ON sp.id = l.sous_phase_id WHERE l.projet_id = ${PROJ}),
        s AS (SELECT *, CASE WHEN prog >= 100 THEN 'DONE' WHEN ${TODAY} > ech THEN 'LATE' WHEN (deb IS NOT NULL AND ${TODAY} >= deb) OR prog > 0 THEN 'ACTIVE' ELSE 'FUTURE' END AS st FROM d)
        SELECT count(*)::int AS total, count(*) FILTER (WHERE st = 'DONE')::int AS done, count(*) FILTER (WHERE st = 'LATE')::int AS late,
               count(*) FILTER (WHERE st = 'ACTIVE')::int AS active, count(*) FILTER (WHERE st = 'FUTURE')::int AS future,
               count(*) FILTER (WHERE st <> 'DONE' AND ech >= ${TODAY} AND ech <= (${TODAY}::date + 30)::text)::int AS "dueIn30Days"
        FROM s`);
      expect(r).toEqual({ total: api.total, done: api.done, late: api.late, active: api.active, future: api.future, dueIn30Days: api.dueIn30Days });
    });

    it('prochain COPIL (écran Aujourd’hui)', async () => {
      const today = (await pmo.get('/api/projects/RISE/today').expect(200)).body;
      const [s] = await sql(`SELECT s.numero, s.date FROM ${JEV_COCKPIT_SCHEMA}.seances s JOIN ${JEV_COCKPIT_SCHEMA}.instances i ON i.id = s.instance_id
        WHERE s.projet_id = ${PROJ} AND i.sigle = 'COPIL' AND s.statut = 'PLANNED' AND s.date >= ${TODAY} ORDER BY s.date, s.heure LIMIT 1`);
      expect(s ? { number: s.numero, dateIso: s.date } : null).toEqual(today.nextCommittee ? { number: today.nextCommittee.number, dateIso: today.nextCommittee.dateIso } : null);
    });

    it('risques visibles du PMO = risques du projet', async () => {
      const boot = (await pmo.get('/api/projects/RISE/bootstrap').expect(200)).body;
      const [{ n }] = await sql(`SELECT count(*)::int AS n FROM ${JEV_COCKPIT_SCHEMA}.risques WHERE projet_id = ${PROJ}`);
      expect(n).toBe(boot.risks.length);
    });
  });
});
