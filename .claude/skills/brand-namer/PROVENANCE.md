# Provenance de la skill brand-namer

- Source : [ellisjr/brand-namer](https://github.com/ellisjr/brand-namer), commit `b0ee7f6e46682698fbcba7d35117180e15178950` (version 1.1.0), licence MIT © Jonathan Ellis.
- Copiée telle quelle depuis `skills/brand-namer/` du dépôt d'origine (sans le manifeste de plugin, le README ni l'espace d'évaluation `brand-namer-workspace/`), comme skill de projet : elle se déclenche dans Claude Code ouvert sur ce dépôt, ou par `/brand-namer`.
- Ajout local (23/10/2026) : vérification des marques à l'INPI.
  - `scripts/check-inpi.mjs` (Node 18 ou plus, sans dépendance) : connexion à l'API de diffusion de l'INPI (`api-gateway.inpi.fr`, identifiants `INPI_USERNAME` / `INPI_PASSWORD` d'un compte gratuit data.inpi.fr, jamais dans un fichier), recherche en expression exacte dans les collections FR, EU et WO, classes de Nice en option, tableau Markdown ou `--json`. Un appel en échec donne « inconnu », jamais « aucune marque identique ».
  - Section « Vérification INPI (France) » de `steps/step-04d-trademark.md`, rappel des identifiants dans `steps/step-04a-screening.md`, méthode `USPTO + EUIPO + INPI` dans `SKILL.md`.
  - Le circuit d'appel (jeton XSRF renouvelé à chaque réponse, `POST /auth/login`, `POST /services/apidiffusion/api/marques/search`, syntaxe `[Mark_Exp="…"] ET [ClassNumber=(9 OU 42)]`) est reconstitué d'après la documentation technique de l'INPI et des retours publics d'octobre 2026 ; il a été testé contre un faux serveur, pas contre l'INPI réelle. À la première utilisation réelle, comparer un résultat avec la même recherche sur data.inpi.fr.
- Les sessions écrivent leurs fichiers dans `brand-namer-output/` à la racine (ignoré par Git).
