import { setup, TestCtx, Client, WHO } from '../helpers';
import { LlmService } from '../../src/core/llm.service';
import { TodayService } from '../../src/core/today.service';
import { JEV_CONVERSATION_RETENTION_DAYS, JEV_HISTORY_TURNS, JevMemoryService } from '../../src/admin/jev-memory.service';

const JEV = '/api/admin/assistant/messages';
const CONV = '/api/admin/assistant/conversations';
type Call = { functionId: string; prompt: string; system: string; systemTail?: string; history?: Array<{ role: string; content: string }>; cache?: boolean; source: string };

/**
 * Mémoire conversationnelle du Jev de la Console (décision du 30/09/2026, scénarios du document d'analyse) :
 * derniers échanges et résumé envoyés au modèle, conversation par administrateur, « Nouvelle conversation ».
 * Le modèle est simulé (réponses scriptées) pour vérifier ce que le serveur lui envoie.
 */
describe('Console — mémoire conversationnelle de Jev', () => {
  let t: TestCtx;
  let admin: Client;
  let calls: Call[];
  let replies: string[];
  const sql = (s: string) => '```sql\n' + s + '\n```';
  const ask = async (text: string, conversationId?: string | null, section = 'overview') =>
    (await admin.post(JEV, { context: { section }, text, ...(conversationId !== undefined ? { conversationId } : {}) }).expect(200)).body;

  beforeAll(async () => {
    t = await setup();
    admin = await t.as(WHO.admin);
  });
  beforeEach(() => {
    calls = [];
    replies = [];
    jest.spyOn(t.app.get(LlmService), 'complete').mockImplementation(async (input: any) => {
      calls.push(input);
      const text = input.source === 'JEV' ? `Résumé : conversation sur le projet RISE (${calls.length}).` : replies.shift() ?? 'Réponse.';
      return { text, modelId: 'haiku', providerId: 'anthropic', tokensIn: 1, tokensOut: 1, costEur: 0, fallbackUsed: false, ms: 1 };
    });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => t.close());

  it('exemple RISE : la 2e question part avec le 1er échange ; le périmètre fonctionnel se lit dans jev.infos_projet', async () => {
    replies = ['RISE est le projet de transformation d’AMC Corp.'];
    const a = await ask('Donne-moi des informations sur le projet RISE.');
    expect(a.conversationId).toMatch(/^jc/);
    expect(calls[0].history).toEqual([]);
    expect(calls[0].cache).toBe(true);

    calls = [];
    replies = [sql("SELECT i.libelle, i.valeur FROM jev.infos_projet i JOIN jev.projets p ON p.id = i.projet_id WHERE p.code = 'RISE' AND i.rubrique = 'Périmètre fonctionnel' ORDER BY i.ordre"), 'Le périmètre fonctionnel de RISE couvre la finance, les achats…'];
    const b = await ask('Quel est le périmètre fonctionnel du projet ?', a.conversationId);
    expect(b.conversationId).toBe(a.conversationId);
    // Les deux appels (requête, puis réponse) reçoivent le même historique.
    for (const c of calls) expect(c.history).toEqual([{ role: 'user', content: 'Donne-moi des informations sur le projet RISE.' }, { role: 'assistant', content: 'RISE est le projet de transformation d’AMC Corp.' }]);
    expect(b.sources).toEqual(expect.arrayContaining(['infos_projet']));
    // La requête a bien lu les rubriques du projet.
    expect(calls[1].prompt).toContain('Finance');
  });

  it('changement de sujet puis retour : l’historique garde les deux sujets, dans l’ordre', async () => {
    const id = (await ask('Parle-moi du projet RISE.')).conversationId;
    await ask('Qui est administrateur de la plateforme ?', id);
    await ask('Depuis quand ?', id);
    calls = [];
    await ask('Et pour le projet, combien de chantiers ?', id);
    expect(calls[0].history!.filter((h) => h.role === 'user').map((h) => h.content)).toEqual(['Parle-moi du projet RISE.', 'Qui est administrateur de la plateforme ?', 'Depuis quand ?']);
  });

  it('conversation très longue : fenêtre de 10 échanges, les plus anciens dans le résumé (partie variable du prompt)', async () => {
    const id = (await ask('Question 1 : le projet RISE.')).conversationId;
    for (let i = 2; i <= 40; i++) {
      await ask(`Question ${i}`, id);
      await t.app.get(JevMemoryService).pending;
    }
    calls = [];
    await ask('Question 41 : et son périmètre ?', id);
    const main = calls.find((c) => c.source !== 'JEV')!;
    expect(main.history!.length).toBeLessThanOrEqual(2 * JEV_HISTORY_TURNS);
    expect(main.history![main.history!.length - 2].content).toBe('Question 40');
    // La 1re question n'est plus dans l'historique, mais le résumé l'a gardée.
    expect(main.history!.some((h) => h.content.startsWith('Question 1 '))).toBe(false);
    expect(main.systemTail).toContain('## Résumé des échanges précédents de la conversation');
    expect(main.systemTail).toMatch(/Résumé : conversation sur le projet RISE/);
    const conv = await t.db.jevConversation.findUniqueOrThrow({ where: { id } });
    expect(conv.summarizedCount).toBeGreaterThanOrEqual(2 * (40 - JEV_HISTORY_TURNS - 2));
  });

  it('« Nouvelle conversation » : plus d’historique ; la conversation en cours est reprise après rechargement', async () => {
    const id = (await ask('Parle-moi du projet RISE.')).conversationId;
    let cur = (await admin.get(`${CONV}/current`).expect(200)).body;
    expect(cur.id).toBe(id);
    expect(cur.messages.map((m: any) => m.role)).toEqual(['user', 'assistant']);

    const fresh = (await admin.post(CONV).expect(201)).body;
    expect(fresh).toEqual({ id: expect.stringMatching(/^jc/), messages: [] });
    calls = [];
    await ask('Quel est son périmètre ?', fresh.id);
    expect(calls[0].history).toEqual([]);
    cur = (await admin.get(`${CONV}/current`).expect(200)).body;
    expect(cur.id).toBe(fresh.id);
  });

  it('deux administrateurs : conversations séparées ; celle d’un autre compte est introuvable', async () => {
    const id = (await ask('Parle-moi du projet RISE.')).conversationId;
    await t.db.account.create({ data: { id: 'u-admin2', email: 'admin2@example.com', fullName: 'Second Admin', status: 'ACTIVE' } });
    await t.db.adminGrant.create({ data: { accountId: 'u-admin2' } });
    const other = await t.as({ accountId: 'u-admin2' } as any);
    await other.post(JEV, { context: { section: 'overview' }, text: 'Et son périmètre ?', conversationId: id }).expect(404);
    expect((await other.get(`${CONV}/current`).expect(200)).body).toEqual({ id: null, messages: [] });
  });

  it('modèle indisponible : l’échange n’est pas gardé', async () => {
    const id = (await ask('Parle-moi du projet RISE.')).conversationId;
    jest.restoreAllMocks();
    jest.spyOn(t.app.get(LlmService), 'complete').mockRejectedValue(new Error('modèles indisponibles'));
    const r = await ask('Et son périmètre ?', id);
    expect(r.reply).toMatch(/^Je ne peux pas répondre pour l’instant/);
    expect(await t.db.jevMessage.count({ where: { conversationId: id } })).toBe(2);
  });

  it(`conservation : une conversation sans échange depuis plus de ${JEV_CONVERSATION_RETENTION_DAYS} jours est supprimée`, async () => {
    const id = (await ask('Parle-moi du projet RISE.')).conversationId;
    // Horloge de la plateforme (date figée des tests) : dernier échange il y a 31 jours.
    const old = new Date(t.app.get(TodayService).now().getTime() - (JEV_CONVERSATION_RETENTION_DAYS + 1) * 86_400_000);
    await t.db.jevConversation.update({ where: { id }, data: { updatedAt: old } });
    await admin.post(JEV, { context: { section: 'overview' }, text: 'Et son périmètre ?', conversationId: id }).expect(404);
    await t.app.get(JevMemoryService).purge();
    expect(await t.db.jevConversation.count({ where: { id } })).toBe(0);
    expect(await t.db.jevMessage.count({ where: { conversationId: id } })).toBe(0);
  });
});
