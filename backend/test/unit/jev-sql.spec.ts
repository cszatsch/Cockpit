import { extractSql, formatRows, JEV_SQL_MAX_ROWS, renderDictionary, sqlError, sqlInstructions, viewsUsed } from '../../src/domain/jev-sql';

describe('Jev de la Console — Text-to-SQL : règles', () => {
  it('extrait la requête du bloc ```sql``` ; sans bloc, réponse directe', () => {
    expect(extractSql('```sql\nSELECT nom FROM jev.modeles_ia\n```')).toBe('SELECT nom FROM jev.modeles_ia');
    expect(extractSql('Voici :\n```SQL\nSELECT 1;\n```\nfin')).toBe('SELECT 1;');
    expect(extractSql('Ouvrez « Utilisateurs », puis « Inviter ».')).toBeNull();
  });

  it.each([
    ['SELECT nom FROM jev.modeles_ia WHERE fournisseur_id = \'anthropic\''],
    ['select count(*) from jev.comptes where statut = \'INVITED\';'],
    ['WITH m AS (SELECT sum(cout_eur) s FROM jev.consommation_ia) SELECT s FROM m'],
    ['SELECT c.nom FROM jev.comptes c JOIN jev.administrateurs a ON a.compte_id = c.id'],
    ['SELECT action FROM jev.journal_audit WHERE action = \'Suppression d’une carte API\' -- update'],
    ['SELECT nom FROM jev.skills WHERE texte ILIKE \'%delete%\''],
  ])('accepte une lecture : %s', (sql) => {
    expect(sqlError(sql)).toBeNull();
  });

  it.each([
    ['', 'requête vide'],
    ['UPDATE jev.comptes SET nom = \'x\'', 'seule une lecture'],
    ['DELETE FROM jev.comptes', 'seule une lecture'],
    ['SELECT 1; DROP TABLE "Account"', 'une seule instruction'],
    ['WITH x AS (DELETE FROM jev.comptes RETURNING id) SELECT * FROM x', 'mot interdit : DELETE'],
    ['SELECT pg_sleep(30)', 'mot interdit : PG_SLEEP'],
    ['SELECT * FROM pg_catalog.pg_authid', 'tables système'],
    ['SELECT * FROM information_schema.columns', 'tables système'],
    ['SELECT "passwordHash" FROM public."Account"', 'seules les vues jev'],
    ['SELECT set_config(\'role\', \'rise\', true)', 'mot interdit : SET_CONFIG'],
    ['SELECT query_to_xml(\'select 1 from public."Account"\', true, false, \'\')', 'mot interdit : QUERY_TO_XML'],
  ])('refuse %s', (sql, why) => {
    expect(sqlError(sql)).toContain(why);
  });

  it('vues citées par la requête, sans les alias ni les colonnes', () => {
    const views = ['comptes', 'administrateurs', 'modeles_ia', 'fournisseurs_ia'];
    expect(viewsUsed('SELECT m.nom FROM jev.modeles_ia m JOIN jev.fournisseurs_ia f ON f.id = m.fournisseur_id', views)).toEqual(['modeles_ia', 'fournisseurs_ia']);
    expect(viewsUsed('SELECT count(*) FROM comptes', views)).toEqual(['comptes']);
  });

  it('dictionnaire mis en forme : fiche, colonnes, relations, usages, règles', () => {
    const txt = renderDictionary([{ nom: 'comptes', description: 'Comptes.', relations: 'comptes.id = sessions.compte_id', usages: 'Compter', regles: 'En attente = INVITED\nExpirée = …', colonnes: [{ nom: 'statut', type: 'texte', signification: 'État', exemplesUnites: 'INVITED, ACTIVE' }, { nom: 'id', type: 'texte', signification: 'Identifiant', exemplesUnites: null }] }]);
    expect(txt).toBe('### jev.comptes\nComptes.\nColonnes :\n- statut (texte) : État [INVITED, ACTIVE]\n- id (texte) : Identifiant\nRelations :\n- comptes.id = sessions.compte_id\nUsages :\n- Compter\nRègles :\n- En attente = INVITED\n- Expirée = …');
  });

  it('consignes : date du jour et maintenant fournis, jamais CURRENT_DATE', () => {
    const s = sqlInstructions('### jev.x', '2026-09-26', '2026-09-26 10:24:00');
    expect(s).toContain('Date du jour de la plateforme : 2026-09-26. Maintenant (heure de Paris) : 2026-09-26 10:24:00.');
    expect(s).toContain('jamais CURRENT_DATE');
    expect(s.endsWith('## Dictionnaire des données\n### jev.x')).toBe(true);
  });

  it('résultats : entiers longs, dates en heure de Paris, borne des lignes', () => {
    const r = formatRows([{ n: BigInt(3), d: new Date('2026-09-26T10:24:05.000Z'), j: new Date('2026-09-26T00:00:00.000Z'), s: 'x' }]);
    expect(r).toEqual({ text: '[{"n":3,"d":"2026-09-26 10:24:05","j":"2026-09-26","s":"x"}]', count: 1, truncated: false });
    const many = formatRows(Array.from({ length: JEV_SQL_MAX_ROWS + 1 }, (_, i) => ({ i })));
    expect(many).toMatchObject({ count: JEV_SQL_MAX_ROWS, truncated: true });
  });
});
