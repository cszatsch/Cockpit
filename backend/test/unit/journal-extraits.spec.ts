import { CALL_EXCERPT_CHARS, callContentView, callExcerpt, EMAIL_MASK } from '../../src/domain/call-content';

describe('Journal des appels : extraits de la question et de la réponse', () => {
  it('coupe à 50 caractères avec « … » et réduit les espaces et retours à la ligne', () => {
    const long = 'Quels sont les risques\n\n  majeurs du chantier Finance et leurs responsables ?';
    const e = callExcerpt(long)!;
    expect(e.endsWith('…')).toBe(true);
    expect(e).not.toMatch(/\n| {2}/);
    expect(Array.from(e.slice(0, -1)).length).toBeLessThanOrEqual(CALL_EXCERPT_CHARS);
    expect(callExcerpt('Bonjour')).toBe('Bonjour');
    expect(callExcerpt('   ')).toBeNull();
    expect(callExcerpt(null)).toBeNull();
  });

  it('masque les adresses e-mail avant de couper', () => {
    expect(callExcerpt('Écris à jean.dupont@exemple.fr demain')).toBe(`Écris à ${EMAIL_MASK} demain`);
    // Une adresse à cheval sur la coupe ne laisse rien de lisible.
    const e = callExcerpt(`${'x'.repeat(40)} marie.martin@societe.com`)!;
    expect(e).not.toContain('marie');
  });

  const row = { contentState: 'KEPT', promptExcerpt: 'Où en est le chantier ?', responseExcerpt: 'Le chantier avance…', accountId: 'u1' };
  const o = { llm: true, canSee: true, fnLabel: 'Insights' };

  it('montre la question et la réponse avec le droit « voir le détail individuel »', () => {
    expect(callContentView(row, o)).toEqual({ state: 'kept', question: 'Où en est le chantier ?', response: 'Le chantier avance…', context: null });
  });

  it('sans question saisie : tâche de fond ou action de l’écran, avec la fonction', () => {
    expect(callContentView({ ...row, promptExcerpt: null, accountId: null }, o).context).toBe('tâche de fond · Insights');
    expect(callContentView({ ...row, promptExcerpt: null }, o).context).toBe('action de l’écran · Insights');
  });

  it('masqué sans le droit, rien pour la vectorisation, effacé, ou non enregistré', () => {
    expect(callContentView(row, { ...o, canSee: false })).toMatchObject({ state: 'hidden', question: null, response: null });
    expect(callContentView(row, { ...o, llm: false }).state).toBe('none');
    expect(callContentView({ ...row, contentState: 'PURGED' }, o).state).toBe('purged');
    expect(callContentView({ ...row, contentState: null }, o).state).toBe('not_recorded');
  });
});
