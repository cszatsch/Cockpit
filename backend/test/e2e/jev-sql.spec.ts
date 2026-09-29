import { setup, TestCtx, Client, WHO } from '../helpers';
import { LlmService } from '../../src/core/llm.service';
import { JevSqlService } from '../../src/admin/jev-sql.service';

const JEV = '/api/admin/assistant/messages';
type Call = { functionId: string; prompt: string; system: string };

/**
 * Jev de la Console, interrogation des données en langage naturel (Text-to-SQL) :
 * question → requête (dictionnaire) → exécution en lecture seule → réponse à partir des résultats.
 * Le modèle est simulé : il répond selon un scénario (requête, puis réponse), pour vérifier ce que le serveur
 * lui envoie et ce qu'il exécute.
 */
describe('Console — Jev interroge les données (Text-to-SQL)', () => {
  let t: TestCtx;
  let admin: Client;
  let calls: Call[];
  const script = (...replies: string[]) => {
    calls = [];
    const queue = [...replies];
    jest.spyOn(t.app.get(LlmService), 'complete').mockImplementation(async (input: any) => {
      calls.push(input);
      return { text: queue.shift() ?? 'Fin du scénario.', modelId: 'haiku', providerId: 'anthropic', tokensIn: 1, tokensOut: 1, costEur: 0, fallbackUsed: false, ms: 1 };
    });
  };
  const sql = (s: string) => '```sql\n' + s + '\n```';

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
    await t.db.skill.updateMany({ data: { on: false } });
    await admin.post('/api/assistant/skills', { n: 'Guidage console', t: '## Objectif\nGuider l’administrateur.', on: true }).expect(201);
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => t.close());

  it('question sur les données : requête d’après le dictionnaire, exécution, réponse à partir des résultats', async () => {
    const q = 'Quels sont les modèles LLM utilisés par Anthropic ?';
    script(sql("SELECT nom FROM jev.modeles_ia WHERE fournisseur_id = 'anthropic' AND categorie = 'LLM' ORDER BY nom"), 'Anthropic : trois modèles.');
    const r = await admin.post(JEV, { context: { section: 'providers' }, text: q }).expect(200);
    expect(r.body).toMatchObject({ reply: 'Anthropic : trois modèles.', sources: ['modeles_ia'], actions: [], ai: { functionId: 'guidage', modelId: 'haiku' } });
    expect(calls).toHaveLength(2);
    // 1. Écrire la requête : prompt de la Console (Identité, Soul, skill, page) + dictionnaire lu en base + date du jour.
    const [c1, c2] = calls;
    expect(c1.functionId).toBe('guidage');
    expect(c1.prompt).toBe(q);
    for (const s of ['## Identité', '## Personnalité', '## Skill : Guidage console', '## Page de console ouverte\nproviders', '## Données de la Console', '## Dictionnaire des données', '### jev.modeles_ia', '### jev.comptes', 'Date du jour de la plateforme : 2026-09-26.']) expect(c1.system).toContain(s);
    // 3. Répondre : résultats réels, fiche de la seule vue consultée.
    const names = (await t.db.aiModel.findMany({ where: { providerId: 'anthropic', category: 'LLM' }, orderBy: { name: 'asc' } })).map((m) => m.name);
    expect(names.length).toBeGreaterThan(0);
    expect(c2.prompt.startsWith(`${q}\n\n## Résultats de la requête (${names.length} ligne(s))\n`)).toBe(true);
    expect(c2.prompt).toContain(JSON.stringify(names.map((nom) => ({ nom }))));
    expect(c2.system).toContain('## Réponse à partir des données');
    expect(c2.system).toContain('## Skill : Guidage console');
    expect(c2.system).toContain('### jev.modeles_ia');
    expect(c2.system).not.toContain('### jev.comptes');
  });

  it('le dictionnaire envoyé est celui des tables : une fiche désactivée n’est plus envoyée', async () => {
    await t.db.dictionnaireTable.update({ where: { espace_nom: { espace: 'console', nom: 'sessions' } }, data: { actif: false } });
    script('Réponse directe.');
    await admin.post(JEV, { context: { section: 'users' }, text: 'Bonjour' }).expect(200);
    expect(calls[0].system).not.toContain('### jev.sessions');
    await t.db.dictionnaireTable.update({ where: { espace_nom: { espace: 'console', nom: 'sessions' } }, data: { actif: true } });
  });

  it('question sans données : réponse directe, un seul appel, sans source', async () => {
    script('Ouvrez « Utilisateurs », puis « Inviter ».');
    const r = await admin.post(JEV, { context: { section: 'users' }, text: 'Comment inviter un utilisateur ?' }).expect(200);
    expect(r.body).toMatchObject({ reply: 'Ouvrez « Utilisateurs », puis « Inviter ».', sources: [] });
    expect(calls).toHaveLength(1);
  });

  it('requête en échec : le modèle reçoit l’erreur et la corrige une fois', async () => {
    script(sql('SELECT nom_modele FROM jev.modeles_ia'), sql("SELECT count(*) AS n FROM jev.comptes WHERE statut = 'ACTIVE'"), 'Il y a des comptes actifs.');
    const r = await admin.post(JEV, { context: { section: 'users' }, text: 'Combien de comptes actifs ?' }).expect(200);
    expect(calls).toHaveLength(3);
    expect(calls[1].prompt).toContain('## Requête à corriger');
    expect(calls[1].prompt).toContain('column "nom_modele" does not exist');
    const n = await t.db.account.count({ where: { status: 'ACTIVE' } });
    expect(calls[2].prompt).toContain(`[{"n":${n}}]`);
    expect(r.body).toMatchObject({ reply: 'Il y a des comptes actifs.', sources: ['comptes'] });
  });

  it('deux échecs : Jev dit qu’il n’a pas pu lire les données, sans troisième appel', async () => {
    script(sql('SELECT x FROM jev.inconnue'), sql('SELECT y FROM jev.inconnue'));
    const r = await admin.post(JEV, { context: { section: 'users' }, text: 'Question' }).expect(200);
    expect(calls).toHaveLength(2);
    expect(r.body.reply).toMatch(/^Je n’ai pas pu lire les données de la plateforme pour répondre \(relation "jev.inconnue" does not exist\)/);
    expect(r.body.sources).toEqual([]);
  });

  it('une écriture proposée par le modèle est refusée et rien ne change', async () => {
    const before = await t.db.account.findMany({ orderBy: { id: 'asc' }, select: { id: true, fullName: true } });
    script(sql("UPDATE jev.comptes SET nom = 'Pirate'"), sql("WITH x AS (DELETE FROM jev.comptes RETURNING id) SELECT * FROM x"));
    const r = await admin.post(JEV, { context: { section: 'users' }, text: 'Renomme tout le monde' }).expect(200);
    expect(r.body.reply).toMatch(/^Je n’ai pas pu lire les données/);
    expect(calls[1].prompt).toContain('Motif du refus ou de l’échec : seule une lecture (SELECT) est permise');
    expect(await t.db.account.findMany({ orderBy: { id: 'asc' }, select: { id: true, fullName: true } })).toEqual(before);
  });

  describe('garanties de la base, indépendantes du contrôle de la requête', () => {
    let svc: JevSqlService;
    beforeAll(() => {
      svc = t.app.get(JevSqlService);
    });
    const fails = async (q: string, why: RegExp) => {
      await expect(svc.executeReadOnly(q)).rejects.toThrow(why);
    };

    it('lecture des vues jev : permise', async () => {
      const rows = await svc.executeReadOnly('SELECT count(*)::int AS n FROM jev.comptes');
      expect(rows[0].n).toBe(await t.db.account.count());
    });

    it('écriture au travers d’une vue : refusée (la requête est lue comme une sous-requête)', async () => {
      await fails("WITH x AS (UPDATE jev.comptes SET nom = 'Pirate' RETURNING id) SELECT * FROM x", /data-modifying statement must be at the top level/);
      expect(await t.db.account.count({ where: { fullName: 'Pirate' } })).toBe(0);
    });

    it('toute écriture : refusée (transaction en lecture seule)', async () => {
      await fails('SELECT lo_create(0)', /read-only transaction/);
    });

    it('tables réelles et secrets : inaccessibles', async () => {
      await fails('SELECT "passwordHash" FROM public."Account"', /permission denied/);
      await fails('SELECT "keyCipher" FROM public."Provider"', /permission denied/);
      await fails('SELECT * FROM "Account"', /does not exist/);
    });

    it('retour au compte de l’application et SQL écrit dans une chaîne : refusés', async () => {
      await fails("SELECT set_config('role', 'none', true)", /permission denied for function set_config/);
      await fails(`SELECT query_to_xml('select 1', true, false, '')`, /permission denied for function query_to_xml/);
    });

    it('requête trop longue : interrompue au bout de 5 s', async () => {
      await fails('SELECT count(*) FROM generate_series(1, 2000000000)', /statement timeout/);
    }, 20_000);

    it('nombre de lignes borné', async () => {
      const rows = await svc.executeReadOnly('SELECT g FROM generate_series(1, 1000) g');
      expect(rows).toHaveLength(201);
    });
  });
});
