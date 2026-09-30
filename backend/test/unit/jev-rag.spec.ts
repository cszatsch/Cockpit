import {
  clarifyPrompt, cleanReformulation, GuideExtract, guideExtractsBlock, guideSource, guideSources, pagesOf, queryForEmbedding, RAG_DEFAULTS, ragSettingsErrors,
} from '../../src/domain/jev-rag';

/** Recherche de Jev dans le guide utilisateur (décision du 30/09/2026) : réglages, sources, prompts. */
describe('Jev — recherche dans le guide (règles)', () => {
  const x = (o: Partial<GuideExtract>): GuideExtract => ({ id: 'c', sectionPath: '3 Gérer › 3.18.4 Planification', heading: '3.18.4 Planification', pageStart: 31, pageEnd: 31, content: 'Texte.', similarity: 0.8, ...o });

  it('réglages : valeurs par défaut valides ; bornes, entiers, conservés ≤ recherchés', () => {
    expect(ragSettingsErrors(RAG_DEFAULTS)).toEqual({});
    expect(RAG_DEFAULTS).toMatchObject({ searchK: 8, keepK: 4 });
    expect(ragSettingsErrors({ ...RAG_DEFAULTS, searchK: 0 })).toEqual({ searchK: 'entre 1 et 30' });
    expect(ragSettingsErrors({ ...RAG_DEFAULTS, searchK: 3, keepK: 4 })).toEqual({ keepK: 'au plus le nombre d’extraits recherchés' });
    expect(ragSettingsErrors({ ...RAG_DEFAULTS, keepK: 2.5 })).toEqual({ keepK: 'nombre entier attendu' });
    expect(ragSettingsErrors({ ...RAG_DEFAULTS, minSimilarity: 0.625 })).toEqual({});
    expect(ragSettingsErrors({ ...RAG_DEFAULTS, minSimilarity: 1 })).toHaveProperty('minSimilarity');
    expect(ragSettingsErrors({ ...RAG_DEFAULTS, llmTimeoutMs: NaN })).toHaveProperty('llmTimeoutMs');
  });

  it('sources : section et page(s), une par section (pages réunies), dans l’ordre des extraits', () => {
    expect(pagesOf({ pageStart: 31, pageEnd: 31 })).toBe('p. 31');
    expect(pagesOf({ pageStart: 31, pageEnd: 32 })).toBe('p. 31-32');
    expect(guideSource(x({}))).toBe('Guide · 3.18.4 Planification · p. 31');
    expect(guideSources([x({ id: 'a' }), x({ id: 'b', heading: '2.4 Mot de passe', pageStart: 9, pageEnd: 9 }), x({ id: 'c', pageStart: 30, pageEnd: 31 })])).toEqual(['Guide · 3.18.4 Planification · p. 30-31', 'Guide · 2.4 Mot de passe · p. 9']);
  });

  it('extraits dans le prompt : titre de bloc, section et pages de chacun', () => {
    const b = guideExtractsBlock([x({ content: 'Premier.' }), x({ sectionPath: '2 Accès › 2.4 Mot de passe', heading: '2.4 Mot de passe', pageStart: 9, pageEnd: 10, content: 'Second.' })]);
    // Titre de section seul : le chemin complet se retrouvait dans les citations du modèle.
    expect(b).toBe('## Extraits du guide utilisateur\n\n### Extrait 1 · 3.18.4 Planification · p. 31\nPremier.\n\n### Extrait 2 · 2.4 Mot de passe · p. 9-10\nSecond.');
  });

  it('question vectorisée : consigne pour Qwen3 Embedding seulement', () => {
    expect(queryForEmbedding('qwen3-embedding-8b Qwen3 Embedding 8B', 'Q ?')).toMatch(/^Instruct: .+\nQuery: Q \?$/);
    expect(queryForEmbedding('te3large text-embedding-3-large', 'Q ?')).toBe('Q ?');
  });

  it('clarification : phrase imposée, question, puis motif', () => {
    for (const r of ['AMBIGU', 'HORS_SUJET', 'AUCUN_EXTRAIT', 'GUIDE_NON_INDEXE', 'INDISPONIBLE'] as const) {
      const p = clarifyPrompt('Et ça ?', r);
      expect(p.startsWith('Génère une réponse à cette demande, qui nécessite une clarification de la part de l’utilisateur :\nEt ça ?\n\n')).toBe(true);
      expect(p.length).toBeGreaterThan(120);
    }
    expect(clarifyPrompt('Q', 'AUCUN_EXTRAIT')).toMatch(/pas trouvé cette information dans le guide/);
  });

  it('reformulation : une ligne sans guillemets ; réponse vide ou trop longue → question d’origine', () => {
    expect(cleanReformulation('« Comment relancer une invitation ? »\n', 'Et pour le relancer ?')).toBe('Comment relancer une invitation ?');
    expect(cleanReformulation('\n  Comment relancer ?\nExplication', 'x')).toBe('Comment relancer ?');
    expect(cleanReformulation('   ', 'Et pour le relancer ?')).toBe('Et pour le relancer ?');
    expect(cleanReformulation('a'.repeat(501), 'Q')).toBe('Q');
  });
});
