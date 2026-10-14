-- Module de la Console « Recherche documentaire systématique » (13/10/2026) : actif sur tous les projets ; une question
-- de Jev sur les données du projet lit aussi la Base de connaissance. Désactivé : données seules, suggestion
-- « Chercher dans les documents » sous la réponse.
INSERT INTO "Module" ("id", "name", "description", "scope", "globalSince", "updatedAt", "version")
VALUES ('jev_documents', 'Recherche documentaire systématique', 'Jev complète chaque réponse sur les données du projet par la Base de connaissance, quand un document apporte un élément absent des données. Désactivé : données seules, recherche dans les documents sur demande.', 'ALL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
ON CONFLICT ("id") DO NOTHING;
