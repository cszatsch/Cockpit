-- Jev de la Console, Text-to-SQL : le rôle jev_lecteur ne doit ni revenir au compte de l'application
-- (set_config('role', …) équivaut à SET / RESET ROLE), ni exécuter du SQL écrit dans une chaîne
-- (query_to_xml et apparentées), ni lire des fichiers ou des objets du serveur.
-- Ces fonctions sont retirées à PUBLIC : le compte de l'application (propriétaire, superutilisateur en local)
-- n'est pas concerné.
REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pg_catalog.query_to_xml(text, boolean, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pg_catalog.query_to_xmlschema(text, boolean, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pg_catalog.query_to_xml_and_xmlschema(text, boolean, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pg_catalog.cursor_to_xml(refcursor, integer, boolean, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pg_catalog.cursor_to_xmlschema(refcursor, boolean, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION pg_catalog.pg_sleep(double precision) FROM PUBLIC;
