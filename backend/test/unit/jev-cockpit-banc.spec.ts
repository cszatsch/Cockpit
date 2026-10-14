import { bancChecks, BancRef, splitDocsPart } from '../../src/domain/jev-cockpit-banc';

/** Contrôles automatiques du banc des réponses du Jev du Cockpit (14/10/2026). */
describe('Banc du Jev du Cockpit : contrôles automatiques', () => {
  const ref: BancRef = {
    chantiers: new Map([['C1', 'Datalake / Industrialisation des reportings'], ['C2', 'Refonte du cycle prévisionnel / Évolution Board']]),
    codes: new Set(['C1', 'C2', 'R01', 'R03', 'A-01']),
  };
  const DATA = [{ entityType: 'DATA' }], DOC = [{ entityType: 'DOCUMENT' }];

  it('réponse juste : aucun motif', () => {
    expect(bancChecks('DONNEES', 'Le projet compte 2 chantiers : **C1 – Datalake / Industrialisation des reportings** et C2 — Refonte du cycle prévisionnel.', DATA, ref)).toEqual([]);
  });

  it('noms de chantiers inventés et codes inconnus (essai du 14/10/2026)', () => {
    const m = bancChecks('DONNEES', 'Les chantiers actifs sont : C1 — Cadrage & gouvernance, C2 — Socle technique, C6 — Gains.', DATA, ref);
    expect(m).toContain('code inconnu du projet : C6');
    expect(m.filter((x) => x.startsWith('nom de chantier inexact'))).toHaveLength(2);
  });

  it('faux positifs écartés (banc du 14/10/2026) : puce à la ligne suivante, réponse tirée des seuls documents', () => {
    expect(bancChecks('DONNEES', '- **Chantier** : C2\n- **Priorité** : 3', DATA, ref)).toEqual([]);
    expect(bancChecks('DOCUMENTS', '- **C1 – Reporting, données et KPI** : centraliser…\n- C9 – Volet futur', DOC, ref, { docOnly: true })).toEqual([]);
  });

  it('complément qui recopie la réponse des données', () => {
    const r = 'Aucune action n’est en retard au 14/10/2026 sur l’ensemble du projet.\n\n## D’après les documents\nAucune action n’est en retard au 14/10/2026 sur l’ensemble du projet. Six sans échéance.';
    expect(bancChecks('DONNEES', r, [...DATA, ...DOC], ref)).toContain('complément qui répète la réponse des données');
    expect(splitDocsPart(r).docs).toMatch(/^Aucune action/);
  });

  it('source imposée, objet inexistant, documents attendus', () => {
    expect(bancChecks('SOURCE_DONNEES', 'R03 est critique.\n\n## D’après les documents\n- Présenté au COPIL.', [...DATA, ...DOC], ref)).toContain('documents cités alors que les données seules étaient demandées');
    expect(bancChecks('SOURCE_DOCS', 'Le livrable décrit trois risques.', [...DATA, ...DOC], ref)).toContain('données consultées alors que les documents seuls étaient demandés');
    expect(bancChecks('INEXISTANT', 'Aucun chantier nommé « Zorglub » n’existe dans le projet.', DATA, ref)).toEqual([]);
    expect(bancChecks('INEXISTANT', 'Le chantier C1 avance bien.', DATA, ref)).toContain('objet inexistant non signalé');
    expect(bancChecks('DOCUMENTS', 'D’après le livrable…', [], ref)).toContain('aucun document cité');
    expect(bancChecks('DONNEES', '', DATA, ref)).toEqual(['réponse vide']);
  });
});
