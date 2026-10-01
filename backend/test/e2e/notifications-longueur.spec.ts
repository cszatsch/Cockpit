import { setup, TestCtx } from '../helpers';
import { LlmService } from '../../src/core/llm.service';
import { NotificationsService } from '../../src/admin/notifications.service';
import { fitWords, NOTIFICATION_MAX_WORDS, wordCount } from '../../src/domain/notification-rules';

/**
 * Longueur des notifications (01/10/2026) : moins de 100 mots pour tout le message, gabarit compris. Le contenu rédigé
 * dispose du reste ; trop long, il est réécrit une fois par le modèle, puis coupé proprement s'il dépasse encore.
 */
describe('Notifications — moins de 100 mots', () => {
  let t: TestCtx;
  beforeAll(async () => { t = await setup(); });
  afterAll(() => t.close());

  const long = (n: number) => ['L’essentiel tient en une phrase.', ...Array.from({ length: n }, (_, i) => `- ${i + 1} constat numéro ${i + 1} avec des détails`)].join('\n');

  it('comptage des mots : marques de mise en forme et puces exclues', () => {
    expect(wordCount('## À surveiller\n- **R03** sans plan\n1. Documenter le plan')).toBe(8);
    expect(wordCount('| R01 | 25 | Ouvert |')).toBe(3);
  });

  it('coupe : lignes entières, rubrique orpheline retirée, phrase seule coupée avec « … »', () => {
    expect(fitWords('Une phrase utile.\n## À faire\n1. Une action longue à faire aujourd’hui', 4)).toBe('Une phrase utile.');
    expect(fitWords('un deux trois quatre', 2)).toBe('un deux…');
  });

  it('contenu trop long : réécrit une fois, puis coupé ; message complet sous 100 mots', async () => {
    const llm = t.app.get(LlmService);
    const texts = [long(30), long(25)];
    let i = 0;
    const calls: any[] = [];
    const spy = jest.spyOn(llm, 'completeWithModelLive').mockImplementation(async (modelId: string, input: any) => {
      calls.push(input);
      return { text: texts[Math.min(i++, texts.length - 1)], modelId, providerId: 'anthropic', tokensIn: 1, tokensOut: 1, costEur: 0, fallbackUsed: false, ms: 1 } as any;
    });
    const svc = t.app.get(NotificationsService);
    const rule = { modelId: 'm', prompt: 'Synthèse des risques', subject: 'Synthèse', body: 'Bonjour {projet},\n{reponse_llm}\nBonne journée.' };
    const out = await svc.generate(rule as any, { projet: 'RISE', date: '01/10/2026' } as any, null);
    // Le gabarit compte 3 mots (Bonjour, RISE, Bonne journée) : le contenu en dispose de 100 − 1 − 4.
    expect(calls[0].system).toMatch(/LONGUEUR IMPÉRATIVE : 95 mots au plus/);
    expect(calls[1].prompt).toMatch(/réécris-le en 95 mots au plus/);
    expect(wordCount(out.body)).toBeLessThan(NOTIFICATION_MAX_WORDS);
    expect(out.body.startsWith('Bonjour RISE,\nL’essentiel tient en une phrase.')).toBe(true);
    spy.mockRestore();
  });
});
