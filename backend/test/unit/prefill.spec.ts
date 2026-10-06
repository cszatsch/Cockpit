import {
  assessTab, emptyKnown, knownAfter, normalizeCell, normalizeRows, parseModelJson, parsePrefillDate, PrefillTabSpec, readingPage, smoothEta,
} from '../../src/domain/prefill';

/** Préremplissage depuis la proposition commerciale (07/10/2026) : règles pures. */
describe('Préremplissage — règles', () => {
  const persons: PrefillTabSpec = {
    index: 2, n: '03', label: 'Personnes', sheet: '03 Personnes', form: false, capacity: 150,
    fields: [
      { header: 'Nom complet', col: 2, required: true, kind: 'text' },
      { header: 'Email', col: 3, required: true, kind: 'text' },
      { header: 'Équipe', col: 4, required: true, kind: 'ref', ref: 'teams' },
      { header: 'Fonction', col: 5, required: false, kind: 'text' },
      { header: 'Actif', col: 7, required: false, kind: 'list', list: ['Oui', 'Non'] },
    ],
  };
  const known = { ...emptyKnown(), teams: ['AMC Corp', 'Onepoint'], phases: ['1 · Cadrage', '2 · Conception'], subphases: ['1.1 · Note de cadrage'] };

  it('dates : JJ/MM/AAAA, ISO, mois seul (à vérifier), date impossible refusée', () => {
    expect(parsePrefillDate('2/11/2026')).toEqual({ date: '02/11/2026', partial: false });
    expect(parsePrefillDate('2026-11-02')).toEqual({ date: '02/11/2026', partial: false });
    expect(parsePrefillDate('janv. 2027')).toEqual({ date: '01/01/2027', partial: true });
    expect(parsePrefillDate('03/2027')).toEqual({ date: '01/03/2027', partial: true });
    expect(parsePrefillDate('31/02/2027')).toBeNull();
    expect(parsePrefillDate('S+24')).toBeNull();
  });

  it('valeur extraite : confiance, page, motif ; liste et référence canoniques ; hors liste → incertaine', () => {
    expect(normalizeCell(persons.fields[4], { v: 'oui', c: 92, p: 3 }, known)).toEqual({ v: 'Oui', c: 92, p: 3, m: null });
    expect(normalizeCell(persons.fields[2], { v: 'amc corp', c: 90, p: 4 }, known)).toMatchObject({ v: 'AMC Corp', c: 90 });
    expect(normalizeCell(persons.fields[2], { v: 'Inconnue SA', c: 95, p: 4 }, known)).toEqual({ v: 'Inconnue SA', c: 69, p: 4, m: 'Absent des onglets précédents.' });
    expect(normalizeCell(persons.fields[4], { v: 'Peut-être', c: 99, p: 2 }, known)).toMatchObject({ c: 69, m: 'Valeur hors de la liste du modèle.' });
    // Confiance absente : 50 %, donc à vérifier ; confiance donnée entre 0 et 1 convertie.
    expect(normalizeCell(persons.fields[3], { v: 'PMO' }, known)).toMatchObject({ c: 50, m: 'Confiance faible.' });
    expect(normalizeCell(persons.fields[3], { v: 'PMO', c: 0.9 }, known)).toMatchObject({ c: 90 });
    expect(normalizeCell(persons.fields[3], { v: '  ' }, known)).toBeNull();
    // Date relative non convertible : proposée telle quelle, à vérifier.
    expect(normalizeCell({ header: 'Début', col: 5, required: true, kind: 'date' }, { v: 'S+24', c: 80, p: 14 }, known)).toMatchObject({ v: 'S+24', c: 69, m: 'Date à préciser.' });
  });

  it('choix multiple : N° des phases, « Tous » seul, références de l’onglet lui-même (Dépendances)', () => {
    const ws: PrefillTabSpec = { index: 9, n: '10', label: 'Chantiers', sheet: '10 Chantiers', form: false, capacity: 30, fields: [
      { header: 'Nom', col: 3, required: true, kind: 'text' },
      { header: 'Phases', col: 8, required: false, kind: 'refs', ref: 'phases' },
      { header: 'Dépendances', col: 10, required: false, kind: 'refs', ref: 'workstreams', allowAll: true },
    ] };
    const rows = normalizeRows(ws, { lignes: [
      { Nom: { v: 'Ventes', c: 95, p: 6 }, Phases: { v: 'Cadrage ; 2', c: 90, p: 5 } },
      { Nom: { v: 'Données', c: 95, p: 6 }, Dépendances: { v: 'Ventes', c: 90, p: 6 } },
      { Nom: { v: 'Socle', c: 95, p: 6 }, Dépendances: { v: 'tous', c: 90, p: 6 } },
    ] }, known);
    expect(rows[0].Phases).toMatchObject({ v: '1 ; 2', c: 90 });
    expect(rows[1].Dépendances).toMatchObject({ v: 'Ventes', c: 90 });
    expect(rows[2].Dépendances).toMatchObject({ v: 'Tous' });
  });

  it('décompte d’un onglet : attendus, trouvés, à vérifier ; manquant obligatoire ; onglet non trouvé = une ligne', () => {
    const rows = normalizeRows(persons, { lignes: [
      { 'Nom complet': { v: 'Claire Dumont', c: 95, p: 4 }, Équipe: { v: 'AMC Corp', c: 95, p: 4 } },
      { 'Nom complet': { v: 'Luc Nguyen', c: 95, p: 4 }, Email: { v: 'luc@amc.example', c: 95, p: 9 }, Équipe: { v: 'AMC Corp', c: 95, p: 4 }, Fonction: { v: 'Directeur des opérations', c: 58, p: 4, m: 'Deux intitulés.' } },
    ] }, known);
    const o = assessTab(persons, rows);
    expect(o).toMatchObject({ attendus: 7, trouves: 6, aVerifier: 2, statut: 'a_verifier' });
    expect(o.checks).toEqual([
      expect.objectContaining({ champ: 'Email · Claire Dumont', type: 'manquant', confiance: null, page: null, cell: { row: 9, col: 3 } }),
      expect.objectContaining({ champ: 'Fonction · Luc Nguyen', type: 'incertain', confiance: 58, motif: 'Deux intitulés.', page: 4, cell: { row: 10, col: 5 } }),
    ]);
    expect(assessTab(persons, [])).toMatchObject({ statut: 'non_trouve', aVerifier: 1, trouves: 0, attendus: 3, checks: [expect.objectContaining({ champ: 'Onglet entier', cell: { row: 9, col: 2 } })] });
    expect(knownAfter(persons, rows, known).persons).toEqual(['Claire Dumont', 'Luc Nguyen']);
  });

  it('Info projet : libellé obligatoire pour les rubriques en paires ; programme et enjeux obligatoires (D1)', () => {
    const info: PrefillTabSpec = { index: 5, n: '06', label: 'Info projet', sheet: '06 Info projet', form: false, capacity: 120, fields: [
      { header: 'Rubrique', col: 2, required: true, kind: 'list', list: ['Le client', 'Programme en une phrase', 'Enjeux stratégiques', 'Périmètre géographique'] },
      { header: 'Libellé', col: 3, required: false, kind: 'text' },
      { header: 'Valeur', col: 4, required: true, kind: 'text' },
    ] };
    const rows = normalizeRows(info, { lignes: [{ Rubrique: { v: 'Le client', c: 95, p: 2 }, Valeur: { v: '1 750 personnes', c: 95, p: 2 } }, { Rubrique: { v: 'Périmètre géographique', c: 95, p: 3 }, Valeur: { v: 'France', c: 95, p: 3 } }] }, known);
    const o = assessTab(info, rows);
    expect(o.checks.map((c) => [c.champ, c.type])).toEqual([['Libellé · Le client', 'manquant'], ['Programme en une phrase', 'manquant'], ['Enjeux stratégiques', 'manquant']]);
    expect(o.checks[1].cell).toEqual({ row: 11, col: 4 });
  });

  it('temps restant lissé : jamais en hausse, pas de chute brutale', () => {
    let eta = smoothEta(null, 60, 0);
    expect(eta).toBe(60);
    const seq = [80, 20, 5, 70, 40];
    for (const raw of seq) {
      const next = smoothEta(eta, raw, 1);
      expect(next).toBeLessThanOrEqual(eta);
      expect(next).toBeGreaterThanOrEqual(Math.floor((eta - 1) * 0.7));
      eta = next;
    }
    expect(smoothEta(3, 0, 5)).toBe(0);
  });

  it('page lue estimée et réponse du modèle (JSON entouré de texte)', () => {
    expect(readingPage(0, 0, 24)).toBe(1);
    expect(readingPage(6, 0.5, 24)).toBe(12);
    expect(readingPage(13, 1, 24)).toBe(24);
    expect(parseModelJson('Voici :\n```json\n{"lignes":[{"Nom":{"v":"AMC"}}]}\n```')).toEqual({ lignes: [{ Nom: { v: 'AMC' } }] });
    expect(parseModelJson('pas de JSON')).toBeNull();
  });
});
