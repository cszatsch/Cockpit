import { DOC_COMPLEMENT_RULES, DOC_DATA_ANSWER_RULES, DOCS_PART_TITLE, explicitSource, parseDocComplement, usesDocsPart } from '../../src/domain/jev-cockpit-answers';

/** Double recherche de Jev (13/10/2026) : source demandée explicitement, partie « documents », règles de rédaction. */
describe('Jev du Cockpit : source explicite et double recherche', () => {
  it('« uniquement / seulement / sans les documents » : données seules', () => {
    for (const q of ['Quel est l’avancement de C1, d’après le Cockpit uniquement ?', 'Réponds seulement avec les données du projet : risques critiques ?', 'Liste les jalons sans les documents', 'Uniquement dans les données : qui pilote C2 ?']) {
      expect(explicitSource(q)).toBe('data');
    }
  });

  it('« uniquement / seulement dans les documents », « sans les données » : documents seuls', () => {
    for (const q of ['Que dit la base documentaire uniquement sur la gouvernance ?', 'Cherche seulement dans les documents la feuille de route', 'Résume la mission de pré-cadrage, sans les données']) {
      expect(explicitSource(q)).toBe('docs');
    }
  });

  it('rien d’explicite : null (l’aiguillage décide)', () => {
    for (const q of ['Donne-moi des infos sur le chantier Data gouvernance', 'Analyse la base documentaire', 'Cherche dans les documents : quels risques ?', 'Combien d’actions sont en retard ?', 'Seulement trois risques sont critiques ?']) {
      expect(explicitSource(q)).toBeNull();
    }
  });

  it('partie « documents » repérée par son titre (apostrophe droite ou courbe, ## ou ###)', () => {
    expect(usesDocsPart(`Réponse.\n\n${DOCS_PART_TITLE}\n- point`)).toBe(true);
    expect(usesDocsPart('Réponse.\n\n### D\'après les documents\n- point')).toBe(true);
    expect(usesDocsPart('Réponse tirée des données seules. Les documents ne disent rien.')).toBe(false);
  });

  it('règles : les informations d’un document qui contredisent les données ne sont pas citées', () => {
    expect(DOC_COMPLEMENT_RULES).toContain('toute information qui diffère de la réponse tirée des données');
    expect(DOC_COMPLEMENT_RULES).toContain('l’état des objets du Cockpit');
    expect(DOC_DATA_ANSWER_RULES).toContain('ne cite pas celle du document');
    expect(DOC_DATA_ANSWER_RULES).toContain('demande explicitement de comparer');
  });

  it('complément : « RIEN » ou vide → aucun ; titre ajouté par le modèle retiré (14/10/2026)', () => {
    expect(parseDocComplement('RIEN')).toBeNull();
    expect(parseDocComplement(' **RIEN**. ')).toBeNull();
    expect(parseDocComplement('')).toBeNull();
    expect(parseDocComplement(`${DOCS_PART_TITLE}\n- Point daté.`)).toBe('- Point daté.');
    expect(parseDocComplement('- Le support du 09/10/2026 présente la feuille de route.')).toBe('- Le support du 09/10/2026 présente la feuille de route.');
  });
});
