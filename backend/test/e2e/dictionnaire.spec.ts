import { setup, TestCtx, Client, WHO } from '../helpers';
import { DICTIONNAIRE, JEV_SCHEMA } from '../../src/domain/jev-dictionnaire';
import { encryptSecret } from '../../src/core/crypto';

/**
 * Dictionnaire des données du Jev de la Console (Text-to-SQL).
 * 1. Fiches, vues et tables du dictionnaire concordent.
 * 2. Aucun secret n'est lisible par les vues.
 * 3. Questions de référence : une requête écrite d'après le dictionnaire (règles comprises) trouve
 *    le même résultat que l'écran de la Console.
 */
describe('Jev de la Console — dictionnaire des données', () => {
  let t: TestCtx;
  let admin: Client;
  const sql = <T = any>(s: string, ...p: unknown[]) => t.db.$queryRawUnsafe<T[]>(s, ...p);
  // « Maintenant » et « date du jour » de la plateforme, comme le serveur les donnera au modèle (heure de Paris).
  const NOW = `('${process.env.DEMO_NOW}'::timestamptz AT TIME ZONE 'Europe/Paris')`;
  const TODAY = `'${process.env.DEMO_TODAY}'::date`;

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
  });
  afterAll(() => t.close());

  describe('fiches, vues et tables', () => {
    it('une vue par fiche, et une fiche par vue du schéma jev', async () => {
      const views = (await sql<{ table_name: string }>(`SELECT table_name FROM information_schema.views WHERE table_schema = $1 ORDER BY 1`, JEV_SCHEMA)).map((r) => r.table_name);
      expect(views).toEqual(DICTIONNAIRE.map((f) => f.nom).sort());
    });

    it.each(DICTIONNAIRE.map((f) => [f.nom, f] as const))('%s : colonnes de la vue = colonnes documentées, dans l’ordre', async (nom, f) => {
      const cols = (await sql<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, JEV_SCHEMA, nom)).map((r) => r.column_name);
      expect(cols).toEqual(f.colonnes.map((c) => c.nom));
      // Chaque vue s'exécute.
      await sql(`SELECT * FROM ${JEV_SCHEMA}.${nom} LIMIT 1`);
    });

    it('fiches complètes : description, usages ; chaque colonne a un type et une signification', () => {
      for (const f of DICTIONNAIRE) {
        expect(f.description.length).toBeGreaterThan(20);
        expect(f.usages.length).toBeGreaterThan(0);
        for (const c of f.colonnes) {
          expect(c.signification.length).toBeGreaterThan(3);
          expect(['texte', 'entier', 'décimal', 'booléen', 'date', 'date-heure', 'json', 'liste de textes', 'liste d’entiers']).toContain(c.type);
        }
      }
    });

    it('tables du dictionnaire chargées par l’amorçage, conformes au fichier source', async () => {
      const tables = await t.db.dictionnaireTable.findMany({ where: { espace: 'console' }, include: { colonnes: { orderBy: { position: 'asc' } } }, orderBy: { position: 'asc' } });
      expect(tables.map((x) => x.nom)).toEqual(DICTIONNAIRE.map((f) => f.nom));
      for (const [i, f] of DICTIONNAIRE.entries()) {
        expect(tables[i]).toMatchObject({ description: f.description, regles: f.regles.join('\n'), actif: true });
        expect(tables[i].colonnes.map((c) => [c.nom, c.type])).toEqual(f.colonnes.map((c) => [c.nom, c.type]));
      }
    });
  });

  describe('aucun secret lisible', () => {
    it('aucune colonne de secret', async () => {
      const cols = (await sql<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1`, JEV_SCHEMA)).map((r) => r.column_name);
      for (const c of cols) expect(c).not.toMatch(/hash|cipher|encrypt|token_|jeton_session|rotation|storage|file_?key|password|mot_de_passe/i);
    });

    it('ni clé API, ni empreinte de mot de passe dans le contenu des vues', async () => {
      await t.db.account.update({ where: { id: 'u1' }, data: { passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$SECRETSELSECRET$SECRETHASHSECRET' } });
      await t.db.apiCard.create({ data: { id: 'c-secret', name: 'Carte test', category: 'Autre', endpoint: 'https://api.example.com/v1?q=paris&apikey=CLEENCLAIR123456&lang=fr', keyEncrypted: encryptSecret('CLECHIFFREE987654'), keyLast4: '7654' } });
      const secrets = ['sk-ant-demo-000000000000000000007Q2f', 'sk-proj-demo-00000000000000000000m81X', 'SECRETHASHSECRET', 'CLEENCLAIR123456', 'CLECHIFFREE987654'];
      const ciphers = (await t.db.provider.findMany()).map((p) => p.keyCipher).filter(Boolean) as string[];
      for (const f of DICTIONNAIRE) {
        const dump = (await sql<{ j: string }>(`SELECT coalesce(json_agg(v)::text, '') AS j FROM ${JEV_SCHEMA}.${f.nom} v`))[0].j;
        for (const s of [...secrets, ...ciphers]) expect(dump).not.toContain(s);
      }
      const [card] = await sql(`SELECT endpoint FROM ${JEV_SCHEMA}.cartes_api WHERE id = 'c-secret'`);
      expect(card.endpoint).toBe('https://api.example.com/v1?q=paris&apikey=••••&lang=fr');
      await t.db.apiCard.delete({ where: { id: 'c-secret' } });
    });
  });

  describe('questions de référence : même résultat que l’écran', () => {
    let overview: any;
    beforeAll(async () => {
      overview = (await admin.get('/api/admin/overview').expect(200)).body;
    });

    it('comptes par statut (Vue d’ensemble : comptes actifs, invités, suspendus)', async () => {
      const rows = await sql(`SELECT statut, count(*)::int AS n FROM jev.comptes GROUP BY statut`);
      const n = (s: string) => rows.find((r) => r.statut === s)?.n ?? 0;
      const v = overview.vitals.find((x: any) => x.id === 'accounts');
      expect(n('ACTIVE')).toBe(v.value);
      expect(v.detail).toBe(`${n('INVITED')} invité(s) · ${n('SUSPENDED')} suspendu(s)`);
    });

    it('invitations sans réponse depuis plus de 7 jours (point « À traiter »)', async () => {
      const rows = await sql(`SELECT id FROM jev.comptes WHERE statut = 'INVITED' AND invite_le < ${NOW} - interval '7 days' ORDER BY id`);
      const a = overview.attention.find((x: any) => x.kind === 'STALE_INVITES');
      expect(rows.map((r) => r.id)).toEqual([...(a?.ids ?? [])].sort());
    });

    it('invitations expirées (liste des utilisateurs)', async () => {
      const invited = await t.db.account.findFirstOrThrow({ where: { status: 'INVITED' }, orderBy: { id: 'asc' } });
      await t.db.account.update({ where: { id: invited.id }, data: { inviteExpiresAt: new Date(new Date(process.env.DEMO_NOW!).getTime() - 86_400_000) } });
      const rows = await sql(`SELECT id FROM jev.comptes WHERE statut = 'INVITED' AND invitation_expire_le < ${NOW} ORDER BY id`);
      const accounts = (await admin.get('/api/admin/accounts').expect(200)).body;
      const list = (Array.isArray(accounts) ? accounts : accounts.accounts ?? accounts.items).filter((a: any) => a.inviteExpired).map((a: any) => a.id).sort();
      expect(rows.map((r) => r.id)).toEqual(list);
      expect(rows.map((r) => r.id)).toContain(invited.id);
    });

    it('fournisseurs opérationnels', async () => {
      const [{ ok, total }] = await sql(`SELECT count(*) FILTER (WHERE statut = 'OK')::int AS ok, count(*)::int AS total FROM jev.fournisseurs_ia`);
      const v = overview.vitals.find((x: any) => x.id === 'providers');
      expect(ok).toBe(v.value);
      expect(`sur ${total}`).toBe(v.detail);
    });

    it('dernier snapshot réussi', async () => {
      const [s] = await sql(`SELECT projet_id, type FROM jev.snapshots WHERE statut = 'DONE' ORDER BY date DESC LIMIT 1`);
      const v = overview.vitals.find((x: any) => x.id === 'snapshot');
      expect(v.detail).toBe(s ? `${s.projet_id} · ${s.type}` : 'aucun');
    });

    it('dépense du mois et projection de fin de mois (Vue générale des coûts)', async () => {
      const month = (await admin.get('/api/admin/usage/month').expect(200)).body;
      const [r] = await sql(`
        WITH d AS (SELECT ${TODAY} AS j),
        m AS (SELECT coalesce(sum(cout_eur), 0) AS depense FROM jev.consommation_ia, d WHERE date::date BETWEEN date_trunc('month', d.j)::date AND d.j),
        s AS (SELECT coalesce(sum(cout_eur), 0) / 7 AS rythme FROM jev.consommation_ia, d WHERE date::date BETWEEN d.j - 6 AND d.j),
        f AS (SELECT ((date_trunc('month', d.j) + interval '1 month - 1 day')::date - d.j) AS restants FROM d)
        SELECT round(m.depense::numeric, 2)::float AS depense, round((m.depense + s.rythme * f.restants)::numeric, 2)::float AS projection FROM m, s, f`);
      expect(r.depense).toBeCloseTo(month.spent, 2);
      expect(r.projection).toBeCloseTo(month.projection, 2);
    });

    it('statut du plafond global', async () => {
      const month = (await admin.get('/api/admin/usage/month').expect(200)).body;
      const [p] = await sql(`SELECT plafond_eur, seuil_alerte_pct, actif FROM jev.plafonds_budget_ia WHERE id = 'all'`);
      const expected = !p || !p.actif || !p.plafond_eur ? 'NO_LIMIT' : month.projection > p.plafond_eur ? 'EXCEEDED' : month.spent >= (p.plafond_eur * p.seuil_alerte_pct) / 100 ? 'ALERT' : 'UNDER';
      expect(month.thresholds.find((x: any) => x.id === 'all').status).toBe(expected);
    });

    it('état des fonctions IA (principal, secours, indisponible)', async () => {
      await t.db.provider.update({ where: { id: 'anthropic' }, data: { status: 'ERROR' } });
      const rows = await sql(`
        WITH dispo AS (
          SELECT m.id, m.categorie FROM jev.modeles_ia m JOIN jev.fournisseurs_ia f ON f.id = m.fournisseur_id WHERE m.actif AND f.statut = 'OK')
        SELECT a.fonction,
          CASE WHEN EXISTS (SELECT 1 FROM dispo WHERE id = a.principal_id AND categorie = c.cat) THEN 'NOMINAL'
               WHEN EXISTS (SELECT 1 FROM dispo WHERE id = a.secours_id AND categorie = c.cat) THEN 'FALLBACK'
               ELSE 'UNAVAILABLE' END AS etat
        FROM jev.affectations_ia a
        CROSS JOIN LATERAL (SELECT CASE a.fonction WHEN 'doc_vec' THEN 'EMBEDDING' WHEN 'doc_rrk' THEN 'RERANKING' ELSE 'LLM' END AS cat) c
        WHERE a.fonction NOT LIKE 'doc_%'`);
      const asg = (await admin.get('/api/admin/assignments').expect(200)).body;
      for (const r of rows) expect([r.fonction, r.etat]).toEqual([r.fonction, asg.find((x: any) => x.functionId === r.fonction).state]);
      await t.db.provider.update({ where: { id: 'anthropic' }, data: { status: 'OK' } });
    });

    it('appels du jour et état d’une carte API (quota, clé expirée, désactivée)', async () => {
      const now = new Date(process.env.DEMO_NOW!);
      await t.db.apiCard.create({ data: { id: 'c-quota', name: 'Carte quota', category: 'Météo', endpoint: 'https://api.example.com/w', quotaLimit: 10 } });
      await t.db.apiCard.create({ data: { id: 'c-exp', name: 'Carte expirée', category: 'Trafic', endpoint: 'https://api.example.com/t', keyExpiresAt: new Date('2026-09-20') } });
      const calls = [-60, -30, -5, -1].map((m) => ({ id: `k${m}`, cardId: 'c-quota', at: new Date(now.getTime() + m * 60_000), code: 200, ms: 120, source: 'PROXY' }));
      calls.push(...[5, 6, 7, 8, 9].map((i) => ({ id: `k${i}`, cardId: 'c-quota', at: new Date(now.getTime() - i * 60_000), code: 200, ms: 90, source: 'HEALTH' })));
      calls.push({ id: 'k-hier', cardId: 'c-quota', at: new Date(now.getTime() - 20 * 3_600_000), code: 200, ms: 90, source: 'PROXY' });
      await t.db.apiCardCall.createMany({ data: calls });
      const [{ n }] = await sql(`SELECT count(*)::int AS n FROM jev.appels_cartes_api WHERE carte_id = 'c-quota' AND date >= date_trunc('day', ${NOW}) AND date <= ${NOW}`);
      const cards = (await admin.get('/api/admin/api-cards').expect(200)).body;
      const list = Array.isArray(cards) ? cards : cards.cards ?? cards.items;
      const q = list.find((c: any) => c.id === 'c-quota');
      expect(n).toBe(q.quotaUsed);
      // Règle d'état : ≥ 80 % du quota → avertissement ; clé expirée → erreur.
      expect(q.status).toBe(n / 10 >= 0.8 ? 'warn' : 'ok');
      const [e] = await sql(`SELECT cle_expire_le < ${TODAY} AS expiree FROM jev.cartes_api WHERE id = 'c-exp'`);
      expect(e.expiree).toBe(true);
      expect(list.find((c: any) => c.id === 'c-exp')).toMatchObject({ status: 'err', statusNote: 'Clé expirée' });
      await t.db.apiCardCall.deleteMany({ where: { cardId: 'c-quota' } });
      await t.db.apiCard.deleteMany({ where: { id: { in: ['c-quota', 'c-exp'] } } });
    });

    it('actions sensibles récentes (journal d’audit)', async () => {
      const rows = await sql(`SELECT id FROM jev.journal_audit WHERE gravite IN ('SENSITIVE', 'CRITICAL') ORDER BY date DESC LIMIT 6`);
      expect(rows.map((r) => r.id)).toEqual(overview.recentSensitive.map((a: any) => a.id));
    });
  });
});
