import { shortTitle, GREETING_TITLE_MAX, checkGreeting, GREETING_MAX_CHARS, GREETING_MAX_FACTS, GreetingFacts, greetingPrompt, momentOf, rankedFacts, ruleGreeting } from '../../src/domain/today-greeting';

const none = { count: 0, first: null };
const base: GreetingFacts = {
  firstName: 'Cédric', weekday: 'vendredi', dateLabel: '2 oct.', moment: 'matin', committee: { name: 'COPIL', dateLabel: '26 oct.', inDays: 24 },
  decisions: none, lateActions: none, dueThisWeek: none, criticalRisks: { ...none, recent: 0 }, milestonesThisWeek: none, doneYesterday: 0,
};
const f = (p: Partial<GreetingFacts>): GreetingFacts => ({ ...base, ...p });

describe('Message d’accueil de Jev : règles', () => {
  it('moment de la journée', () => {
    expect([8, 11, 12, 17, 18, 23].map(momentOf)).toEqual(['matin', 'matin', 'après-midi', 'après-midi', 'soir', 'soir']);
  });

  it('message par règles : une seule priorité, sans zéro ni « prêt »', () => {
    expect(ruleGreeting(base)).toBe('Bonjour Cédric, rien d’urgent aujourd’hui : le prochain COPIL a lieu le 26 oct., dans 24 jours.');
    expect(ruleGreeting(f({ committee: { name: 'COPIL', dateLabel: '3 oct.', inDays: 1 }, decisions: { count: 1, first: 'Choix ERP' } }))).toBe('Bonjour Cédric, le COPIL a lieu demain : 1 décision attend encore votre arbitrage.');
    expect(ruleGreeting(f({ lateActions: { count: 1, first: 'Valider le plan de recette' } }))).toBe('Bonjour Cédric, une de vos actions a dépassé l’échéance, à commencer par « Valider le plan de recette ».');
    expect(ruleGreeting(f({ lateActions: { count: 3, first: null } }))).toBe('Bonjour Cédric, 3 de vos actions ont dépassé l’échéance.');
    expect(ruleGreeting(f({ decisions: { count: 2, first: 'x' } }))).toBe('Bonjour Cédric, 2 décisions attendent votre arbitrage avant le COPIL du 26 oct.');
    expect(ruleGreeting(f({ committee: null }))).toBe('Bonjour Cédric, rien d’urgent aujourd’hui.');
    expect(ruleGreeting(f({ moment: 'soir' }))).toMatch(/^Bonsoir Cédric, /);
    expect(ruleGreeting(f({ weekday: 'lundi' }))).toMatch(/^Bonne semaine Cédric, /);
    expect(ruleGreeting(f({ dueThisWeek: { count: 1, first: 'b' } }))).toBe('Bonjour Cédric, 1 action arrive à échéance cette semaine ; prochain COPIL le 26 oct.');
    for (const m of [base, f({ decisions: { count: 1, first: 'a' } }), f({ dueThisWeek: { count: 1, first: 'b' } })]) expect(ruleGreeting(m)).not.toMatch(/prêt| 0 /);
  });

  it('faits classés par priorité, au plus 6, faits nuls absents', () => {
    const all = f({
      committee: { name: 'COPIL', dateLabel: '3 oct.', inDays: 1 }, decisions: { count: 1, first: 'D' }, lateActions: { count: 2, first: 'A' }, dueThisWeek: { count: 1, first: 'B' },
      criticalRisks: { count: 2, first: 'R', recent: 1 }, milestonesThisWeek: { count: 1, first: 'J' }, doneYesterday: 3,
    });
    const r = rankedFacts(all);
    expect(r).toHaveLength(GREETING_MAX_FACTS);
    expect(r[0]).toMatch(/^Prochaine séance du COPIL : demain/);
    expect(r[1]).toMatch(/^2 actions .* dépassé/);
    expect(r[2]).toMatch(/^1 décision attend son arbitrage \(« D »\)/);
    expect(rankedFacts(f({ committee: null }))).toEqual([]);
    expect(greetingPrompt(f({ committee: null }))).toContain('- Rien d’urgent aujourd’hui.');
  });

  it('contrôle de la réponse : texte brut, longueur, vouvoiement, aucun chiffre inventé', () => {
    const m = f({ decisions: { count: 1, first: 'Choix ERP' } });
    expect(checkGreeting('« Bonjour Cédric, une décision attend votre arbitrage avant le COPIL du 26 oct. »', m)).toEqual({ ok: true, text: 'Bonjour Cédric, une décision attend votre arbitrage avant le COPIL du 26 oct.' });
    expect(checkGreeting('Bonjour **Cédric**, 1 décision vous attend.', m)).toEqual({ ok: true, text: 'Bonjour Cédric, 1 décision vous attend.' });
    expect(checkGreeting('Bonjour Cédric, 4 décisions vous attendent.', m)).toEqual({ ok: false, reason: 'nombre absent des faits (4)' });
    expect(checkGreeting('Salut Cédric, tu as 1 décision à prendre.', m)).toEqual({ ok: false, reason: 'tutoiement' });
    expect(checkGreeting('Bonjour Cédric, voir [le tableau](cockpit://x).', m)).toMatchObject({ ok: false, reason: 'lien ou mise en forme' });
    expect(checkGreeting('x'.repeat(GREETING_MAX_CHARS + 1), m)).toMatchObject({ ok: false });
    expect(checkGreeting('   ', m)).toEqual({ ok: false, reason: 'réponse vide' });
    // « aujourd’hui », « t’ » de « tout » : pas de faux tutoiement.
    expect(checkGreeting('Bonjour Cédric, tout est calme aujourd’hui.', m)).toMatchObject({ ok: true });
  });

  it('titre cité raccourci au mot entier (lisible d’un coup d’œil)', () => {
    expect(shortTitle('Reprise des données')).toBe('Reprise des données');
    const long = 'Reprise et qualité des données au démarrage avec un Run 3 planifié en 6 semaines contre 17 pour le Run 2';
    const s = shortTitle(long)!;
    expect(s.length).toBeLessThanOrEqual(GREETING_TITLE_MAX);
    expect(s.endsWith('…')).toBe(true);
    expect(long.startsWith(s.slice(0, -1))).toBe(true);
    expect(s).not.toMatch(/\s…$/);
  });
});
