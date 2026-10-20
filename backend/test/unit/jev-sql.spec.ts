import { extractSql, formatRows, JEV_SQL_MAX_ROWS, JEV_SQL_MAX_STATEMENTS, looksLikeSql, renderDictionary, resultsSection, splitStatements, sqlCut, sqlError, sqlInstructions, viewsUsed } from '../../src/domain/jev-sql';

describe('Jev de la Console — Text-to-SQL : règles', () => {
  it('extrait la requête du bloc ```sql``` ; sans bloc, réponse directe', () => {
    expect(extractSql('```sql\nSELECT nom FROM jev.modeles_ia\n```')).toBe('SELECT nom FROM jev.modeles_ia');
    expect(extractSql('Voici :\n```SQL\nSELECT 1;\n```\nfin')).toBe('SELECT 1;');
    expect(extractSql('Ouvrez « Utilisateurs », puis « Inviter ».')).toBeNull();
  });

  it('réponse coupée (bloc sql jamais refermé) ou requête nue : reconnue, jamais montrée telle quelle', () => {
    const cut = 'Bonjour,\nVoici l’analyse.\n\n```sql\nWITH r AS (\n  SELECT code FROM jev_cockpit.risques';
    expect(extractSql(cut)).toBeNull();
    expect(sqlCut(cut)).toBe(true);
    expect(looksLikeSql(cut)).toBe(true);
    expect(sqlCut('```sql\nSELECT 1\n```')).toBe(false);
    expect(looksLikeSql('SELECT code FROM jev_cockpit.risques')).toBe(true);
    expect(looksLikeSql('Avec 3 risques critiques, la semaine est tendue.')).toBe(false);
    expect(sqlCut('Ouvrez « Utilisateurs ».')).toBe(false);
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
    ['SELECT 1; DROP TABLE "Account"', 'instruction 2 : seule une lecture'],
    ['SELECT 1 FROM jev.comptes; SELECT * FROM public."Account"', 'instruction 2 : seules les vues jev'],
    ['SELECT 1; SELECT 2; SELECT 3; SELECT 4; SELECT 5', '4 instructions SELECT au plus (5 reçues)'],
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

import { cockpitRightsFilter, DICTIONNAIRE_COCKPIT } from '../../src/domain/jev-dictionnaire-cockpit';

describe('Vues du Cockpit : filtre de droits (rôle jev_lecteur_cockpit)', () => {
  const f = (n: string) => cockpitRightsFilter(DICTIONNAIRE_COCKPIT.find((t) => t.nom === n)!);
  it('toutes les vues filtrent le projet ; les vues d’un chantier filtrent aussi les chantiers', () => {
    for (const t of DICTIONNAIRE_COCKPIT) expect(cockpitRightsFilter(t)).toMatch(/^\(current_user <> 'jev_lecteur_cockpit' OR \(.+ = current_setting\('rise\.projet', true\)/);
    // Risques (08/10/2026) : visibles si transverse ou si l'un de leurs chantiers est dans la liste.
    expect(f('risques')).toContain(`t."allWs" OR t."wsIds" && string_to_array(current_setting('rise.chantiers', true), ',')`);
    expect(f('risques_chantiers')).toContain(`w.id = ANY(string_to_array(current_setting('rise.chantiers', true), ','))`);
    expect(f('problemes')).toContain(`t."wsId" = ANY(string_to_array(current_setting('rise.chantiers', true), ','))`);
    expect(f('chantiers')).toContain('t.id = ANY(');
    expect(f('livrables')).not.toContain('rise.chantiers');
    expect(f('commentaires')).toContain(`current_setting('rise.chantiers', true) = '*'`);
    expect(f('documents')).toContain(`t.conf::text <> 'RESTRICTED'`);
    expect(f('projets')).toContain(`t.id = current_setting('rise.projet', true)`);
  });

  // Incident du 20/10/2026 : « Résumer la situation du jour » → une requête par sujet, refusée en bloc.
  describe('plusieurs instructions (incident du 20/10/2026)', () => {
    it('découpe sur les « ; » hors des chaînes et des identifiants, sans instruction vide', () => {
      expect(splitStatements("SELECT 'a;b' AS x FROM jev.comptes;\n-- commentaire ; ici\nSELECT \"c;d\" FROM jev.cartes;  ;")).toEqual(["SELECT 'a;b' AS x FROM jev.comptes", 'SELECT "c;d" FROM jev.cartes']);
      expect(splitStatements('SELECT 1;')).toEqual(['SELECT 1']);
      expect(splitStatements(' ; ')).toEqual([]);
    });

    it(`accepte jusqu’à ${JEV_SQL_MAX_STATEMENTS} lectures, chacune contrôlée`, () => {
      expect(sqlError('SELECT code FROM jev.risques;\nSELECT code FROM jev.jalons;\nSELECT code FROM jev.actions;')).toBeNull();
      expect(sqlError(Array.from({ length: JEV_SQL_MAX_STATEMENTS }, () => 'SELECT 1').join(';'))).toBeNull();
    });

    it('résultats : section unique pour une requête (forme historique), une sous-section par requête sinon', () => {
      const one = resultsSection(['SELECT 1'], [[{ n: 1 }]]);
      expect(one).toEqual({ text: '## Résultats de la requête (1 ligne(s))\n[{"n":1}]', count: 1 });
      const two = resultsSection(['SELECT code FROM risques', 'SELECT code FROM jalons'], [[{ code: 'R01' }, { code: 'R02' }], []]);
      expect(two.count).toBe(2);
      expect(two.text).toContain('## Résultats des 2 requêtes (2 ligne(s) en tout)');
      expect(two.text).toContain('### Requête 1 (2 ligne(s))\n```sql\nSELECT code FROM risques\n```\n[{"code":"R01"},{"code":"R02"}]');
      expect(two.text).toContain('### Requête 2 (0 ligne(s))\n```sql\nSELECT code FROM jalons\n```\n[]');
    });

    it('consignes au modèle : plusieurs requêtes courtes permises pour une synthèse', () => {
      const s = sqlInstructions('', null, null);
      expect(s).toContain(`Une instruction par sujet, ${JEV_SQL_MAX_STATEMENTS} au plus`);
      expect(s).not.toContain('Une seule instruction');
    });
  });
});
