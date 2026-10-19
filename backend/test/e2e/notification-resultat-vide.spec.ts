import { setup, TestCtx } from '../helpers';
import { LlmService } from '../../src/core/llm.service';
import { NO_DATA_TEXT, NotificationWriterService } from '../../src/admin/notification-writer.service';
import { NotificationsService } from '../../src/admin/notifications.service';
import { NO_ACCESS_SPECULATION, NO_MATCH_TEXT } from '../../src/domain/notification-results';

/**
 * Incident du 19/10/2026 : notification « Analyse des risques » d'un PMO rédigée « vérifiez votre habilitation PMO »
 * alors que les droits et les données étaient corrects. La requête du modèle exigeait une décision en cours pour chaque
 * risque ; sans décision en cours, elle n'a rendu aucune ligne, et le modèle a inventé une cause liée aux droits.
 * Modèle simulé ; requêtes réellement exécutées sur les vues du Cockpit avec le rôle restreint.
 */
describe('Notifications — requête sans résultat (incident du 19/10/2026)', () => {
  let t: TestCtx;
  let RISE: string;
  let openRisks: number;

  /** Requête de l'incident : jointure qui exige une décision (ici, une décision introuvable) pour chaque risque. */
  const STRICT = "SELECT r.code, d.id AS decision FROM jev_cockpit.risques r JOIN jev_cockpit.decisions d ON d.chantier_id = r.chantier_id WHERE r.statut <> 'CLOSED' AND d.statut = 'INTROUVABLE'";
  /** Requête plus large attendue : les risques d'abord, la décision en LEFT JOIN. */
  const WIDE = "SELECT r.code, r.statut, d.id AS decision FROM jev_cockpit.risques r LEFT JOIN jev_cockpit.decisions d ON d.chantier_id = r.chantier_id AND d.statut = 'INTROUVABLE' WHERE r.statut <> 'CLOSED'";
  const EMPTY = "SELECT r.code FROM jev_cockpit.risques r WHERE r.statut = 'INTROUVABLE'";
  /** Texte réellement reçu le 19/10/2026 (extrait). */
  const INCIDENT_TEXT = 'Le projet PMS n’affiche aucune donnée accessible : vérifiez votre habilitation PMO et que le projet_id est correct dans le Référentiel.\n- Restriction d’accès possible\n- Filtre applicatif masquant les données';

  type Step = 'first' | 'fix' | 'retry' | 'answer' | 'plain' | 'shorten';
  let script: Partial<Record<Step, string>>;
  let calls: Array<{ step: Step; prompt: string; system: string }>;
  const sqlBlock = (s: string) => '```sql\n' + s + '\n```';
  const stepOf = (prompt: string, system: string): Step =>
    /## Requête sans résultat/.test(prompt) ? 'retry'
      : /## Requête à corriger/.test(prompt) ? 'fix'
        : /## Résultats de la requête/.test(prompt) ? 'answer'
          : /Ce contenu de notification compte/.test(prompt) ? 'shorten'
            : /raison technique/.test(system) ? 'plain'
              : 'first';

  const write = () => t.app.get(NotificationWriterService).write({ modelId: 'modele-simule' }, 'Analyse en profondeur les risques projet en cours et les décisions à prendre pour les couvrir et fais moi une synthèse.', { id: RISE, code: 'RISE' }, { profile: 'pmo', chantiers: '*' });

  beforeAll(async () => {
    t = await setup();
    RISE = (await t.db.project.findFirstOrThrow({ where: { code: 'RISE' } })).id;
    openRisks = await t.db.risk.count({ where: { projectId: RISE, status: { not: 'CLOSED' } } });
    jest.spyOn(t.app.get(LlmService), 'completeWithModelLive').mockImplementation(async (modelId, input) => {
      const step = stepOf(input.prompt, input.system ?? '');
      calls.push({ step, prompt: input.prompt, system: input.system ?? '' });
      const text = script[step] ?? (step === 'answer' ? `${openRisks} risques ouverts.` : '');
      return { text, modelId, providerId: 'anthropic', tokensIn: 100, tokensOut: 20, costEur: 0.001, fallbackUsed: false, ms: 1 };
    });
  });
  beforeEach(() => {
    calls = [];
    script = {};
  });
  afterAll(() => t.close());

  it('la requête de l’incident ne rend rien alors que les risques ouverts existent', async () => {
    expect(openRisks).toBeGreaterThan(0);
    script = { first: sqlBlock(STRICT), retry: sqlBlock(STRICT) };
    const r = await write();
    expect(r.rows).toBe(0);
  });

  it('requête vide → une requête plus large est demandée, exécutée et retenue : les risques arrivent à la rédaction', async () => {
    script = { first: sqlBlock(STRICT), retry: sqlBlock(WIDE), answer: `${openRisks} risques ouverts, aucune décision en cours.` };
    const r = await write();
    expect(calls.map((c) => c.step)).toEqual(['first', 'retry', 'answer']);
    // La consigne de la nouvelle requête cite la requête vide et demande des jointures facultatives.
    expect(calls[1].prompt).toContain(STRICT);
    expect(calls[1].prompt).toMatch(/LEFT JOIN/);
    // La rédaction reçoit les lignes de la requête large (codes des risques ouverts).
    const codes = (await t.db.risk.findMany({ where: { projectId: RISE, status: { not: 'CLOSED' } }, select: { code: true } })).map((x) => x.code);
    expect(calls[2].prompt).toMatch(new RegExp(`## Résultats de la requête \\(${openRisks} ligne`));
    for (const code of codes.slice(0, 3)) expect(calls[2].prompt).toContain(code);
    expect(r).toMatchObject({ sql: WIDE, rows: openRisks, text: `${openRisks} risques ouverts, aucune décision en cours.` });
  });

  it('résultat vraiment vide et texte qui accuse les droits → repli neutre, jamais « habilitation »', async () => {
    script = { first: sqlBlock(EMPTY), retry: sqlBlock(EMPTY), answer: INCIDENT_TEXT };
    const r = await write();
    expect(calls.map((c) => c.step)).toEqual(['first', 'retry', 'answer']);
    expect(r.text).toBe(NO_MATCH_TEXT);
    expect(r.text).not.toMatch(/habilitation|accès|projet_id/i);
    expect(r).toMatchObject({ sql: EMPTY, rows: 0 });
  });

  it('résultat vide et texte neutre → texte du modèle gardé', async () => {
    script = { first: sqlBlock(EMPTY), retry: sqlBlock(EMPTY), answer: 'Aucun risque ne correspond à la demande.' };
    const r = await write();
    expect(r.text).toBe('Aucun risque ne correspond à la demande.');
    expect(r.rows).toBe(0);
  });

  it('consigne de rédaction : interdiction d’invoquer les droits, transmise avec les résultats', async () => {
    script = { first: sqlBlock(EMPTY), retry: sqlBlock(EMPTY), answer: 'Aucun risque.' };
    await write();
    expect(calls.find((c) => c.step === 'answer')!.system).toContain(NO_ACCESS_SPECULATION);
  });

  it('requête plus large refusée (écriture) ou en erreur → la première, valide mais vide, est gardée sans plantage', async () => {
    script = { first: sqlBlock(EMPTY), retry: sqlBlock("UPDATE jev_cockpit.risques SET statut = 'CLOSED'"), answer: 'Aucun risque.' };
    expect(await write()).toMatchObject({ sql: EMPTY, rows: 0, text: 'Aucun risque.' });
    script = { first: sqlBlock(EMPTY), retry: sqlBlock('SELECT colonne_inconnue FROM jev_cockpit.risques'), answer: 'Aucun risque.' };
    expect(await write()).toMatchObject({ sql: EMPTY, rows: 0 });
  });

  it('requête qui rend des lignes du premier coup → aucune nouvelle requête', async () => {
    script = { first: sqlBlock(WIDE) };
    const r = await write();
    expect(calls.map((c) => c.step)).toEqual(['first', 'answer']);
    expect(r.rows).toBe(openRisks);
  });

  it('données illisibles (requête en erreur) → consigne sans motif technique ni droits, et repli si le texte accuse les droits', async () => {
    script = { first: sqlBlock('SELECT colonne_inconnue FROM jev_cockpit.risques'), fix: sqlBlock('SELECT autre_inconnue FROM jev_cockpit.risques'), plain: INCIDENT_TEXT };
    const r = await write();
    expect(calls.map((c) => c.step)).toEqual(['first', 'fix', 'plain']);
    const plain = calls[2];
    expect(plain.system).toContain(NO_ACCESS_SPECULATION);
    expect(plain.system).not.toMatch(/colonne_inconnue|autre_inconnue|does not exist|n’existe pas/);
    expect(r).toMatchObject({ text: NO_DATA_TEXT, rows: null });
  });

  it('l’envoi garde la requête retenue et le nombre de lignes (diagnostic)', async () => {
    script = { first: sqlBlock(STRICT), retry: sqlBlock(WIDE), answer: `${openRisks} risques ouverts.` };
    const svc = t.app.get(NotificationsService);
    const rule = await t.db.notificationRule.update({ where: { id: 'n4' }, data: { body: '{reponse_llm}', channels: ['APP', 'EMAIL'] } });
    const out = await svc.deliver(rule, RISE, { projet: 'RISE' }, 'test|resultat-vide', { accountIds: ['u1'] });
    const [app, mail] = out;
    expect(app).toMatchObject({ channel: 'APP', sqlQuery: WIDE, rowCount: openRisks, body: `${openRisks} risques ouverts.` });
    // Un seul enregistrement de la rédaction par envoi : le premier canal (comme le coût et le texte rédigé).
    expect(mail).toMatchObject({ channel: 'EMAIL', sqlQuery: null, rowCount: null });
  });
});
