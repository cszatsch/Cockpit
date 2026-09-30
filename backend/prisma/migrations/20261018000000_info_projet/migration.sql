-- Objet « Info projet » (30/09/2026) : les rubriques de l'onglet Fiche projet écrites en dur dans l'écran
-- (programme en une phrase, enjeux stratégiques, périmètres géographique et juridique) rejoignent le bloc
-- `referential` du projet RISE, à côté du client, des marques et des périmètres fonctionnel et applicatif.
UPDATE "ContentBlock" b
SET data = $json${"pitch": "Programme de transformation digitale d'AMC Corp, nom de code de l'ambition « next level ». Intégrateur AMC Corp (fit-to-standard, forfait) ; éditeur Brand X. AMC Corp intervient en AMOA et conseil stratégique depuis le cadrage de l'appel d'offres (septembre 2023).", "stakes": ["Intégrer rapidement les entités acquises — core model Brand X comme accélérateur (30+ acquisitions en 5 ans)", "Sortir de 19 ERP hétérogènes et de l'obsolescence de Brand X", "Vision omnicanale unifiée : magasins, e-commerce, télévente, terrain", "Fonction Finance réarmée pour piloter le Groupe à l'international"], "geo": ["France", "Belgique", "Luxembourg", "Allemagne", "Italie", "UK", "UAE", "Arabie Saoudite", "Nouvelle Zélande", "Australie"], "legal": ["AMC Corp", "AMC Corp", "AMC Corp", "AMC Corp", "AMC Corp", "AMC Corp", "AMC Corp", "AMC Corp", "AMC Corp"]}$json$::jsonb || b.data, version = b.version + 1
FROM "Project" p
WHERE p.id = b."projectId" AND p.code = 'RISE' AND b.key = 'referential'
  AND NOT (b.data::jsonb ?| ARRAY['pitch', 'stakes', 'geo', 'legal']);

-- Dictionnaire des données du Cockpit : vue de l’objet « Info projet » (cockpitViewSql(), src/domain/jev-dictionnaire-cockpit.ts).
CREATE OR REPLACE VIEW jev_cockpit.infos_projet AS
SELECT
  t.project_id || ':' || t.ordre_rubrique || ':' || t.ordre AS id,
  t.project_id AS projet_id,
  t.rubrique AS rubrique,
  t.ordre_rubrique AS ordre_rubrique,
  t.ordre AS ordre,
  t.libelle AS libelle,
  t.valeur AS valeur
FROM (SELECT b."projectId" AS project_id, r.rubrique, r.ordre_rubrique, e.ord AS ordre,
      CASE WHEN r.kv THEN e.el->>0 END AS libelle, CASE WHEN r.kv THEN e.el->>1 ELSE e.el#>>'{}' END AS valeur
    FROM "ContentBlock" b
    CROSS JOIN LATERAL (VALUES ('Le client', 1, 'identity', true), ('Marques du groupe', 2, 'brands', false), ('Programme en une phrase', 3, 'pitch', false), ('Enjeux stratégiques', 4, 'stakes', false),
      ('Périmètre fonctionnel', 5, 'scope', true), ('Périmètre applicatif', 6, 'systems', true), ('Périmètre géographique', 7, 'geo', false), ('Périmètre juridique', 8, 'legal', false)) r(rubrique, ordre_rubrique, cle, kv)
    CROSS JOIN LATERAL jsonb_array_elements(CASE jsonb_typeof(b.data::jsonb -> r.cle) WHEN 'array' THEN b.data::jsonb -> r.cle WHEN 'string' THEN jsonb_build_array(b.data::jsonb -> r.cle) ELSE '[]'::jsonb END) WITH ORDINALITY e(el, ord)
    WHERE b.key = 'referential' AND coalesce(CASE WHEN r.kv THEN e.el->>1 ELSE e.el#>>'{}' END, '') <> '') t
WHERE (current_user <> 'jev_lecteur_cockpit' OR (t.project_id = current_setting('rise.projet', true)));
GRANT SELECT ON jev_cockpit.infos_projet TO jev_lecteur_cockpit;
