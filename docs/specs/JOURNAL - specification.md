# Journal des appels — spécification

Nouvelle vue de la Console d’administration, section **IA**, placée sous « Consommation et coûts ».

## 1. Navigation
- Identifiant de page : `journal`. Libellé : « Journal des appels ».
- `Sidebar Console.dc.html` : `['journal', 'Journal des appels']` ajouté dans le domaine `ia`, après `conso`.
- Console Admin : ajouter `journal` à `META` (`['Intelligence artificielle', 'Journal des appels', 'Tokens consommés et détail de chaque appel LLM.']`) et monter `Journal des appels.dc.html` quand `S.sec === 'journal'`.
- Habilitation : identique à « Consommation et coûts » (lecture réservée aux administrateurs).

## 2. Contenu de la vue
1. **En-tête chiffré** : total du mois (tokens ou €), répartition entrée / sortie, nombre d’appels, filtre par fonction (Toutes, Insights, Rapports, Guidage console, Documents, Gestion des données).
2. **Graphique double flux** : une colonne par jour du mois. Entrée au-dessus de l’axe (couleur de la fonction, sarcelle si « Toutes »), sortie en dessous (marine), à la même échelle. Bascule **Tokens / Coûts**. Survol d’un jour : ligne de lecture (entrée, sortie, appels, coût).
3. **Journal** : un appel par ligne, du plus récent au plus ancien. Colonnes : date et heure, fonction, fournisseur et modèle (pastille « Secours » si le modèle de secours a servi), tokens (total, entrée → sortie, barre proportionnelle), coût à 3 décimales. Une ligne s’ouvre sur l’identifiant de requête, la durée et le calcul du coût.
4. Pagination par 10 (« Afficher 10 de plus »), export CSV du filtre courant.

## 3. Modèle de données
`UsageRecord` existant, complété si besoin :

| Champ | Type | Note |
|---|---|---|
| `id` | string | Identifiant de requête (`req_…`) |
| `at` | datetime | Horodatage UTC, affiché dans le fuseau de la plateforme |
| `fn` | enum | `insights`, `rapports`, `guidage`, `docs`, `crud` |
| `provider` | string | `anthropic`, `openai`, `mistral`, `google`, `cohere` |
| `model` | string | Identifiant du catalogue |
| `fallback` | bool | Vrai si le modèle de secours a répondu |
| `tokensIn`, `tokensOut` | int | Tels que renvoyés par le fournisseur |
| `priceIn`, `priceOut` | decimal | €/M tokens **au moment de l’appel** (figés, pas relus du catalogue) |
| `costEur` | decimal(10,6) | `tokensIn × priceIn / 1e6 + tokensOut × priceOut / 1e6` |
| `durationMs` | int | Latence totale |

Le contenu des prompts et des réponses n’est jamais stocké dans le journal.

## 4. Routes
- `GET /usage/daily?from=&to=&fn=` → `[{ date, tokensIn, tokensOut, costIn, costOut, calls }]` (un point par jour, jours vides inclus).
- `GET /usage/calls?from=&to=&fn=&provider=&cursor=&limit=10` → `{ items: UsageRecord[], nextCursor, total }`, tri `at` décroissant, pagination par curseur.
- `GET /usage/calls.csv?from=&to=&fn=&provider=` → CSV UTF-8 avec BOM, séparateur `;`, décimales à la virgule.

## 5. Règles d’affichage
- Tokens : `14,9 M`, `824 k` dans les agrégats ; valeur exacte avec espaces fines dans le journal (`12 480`).
- Coût par appel : 3 décimales (`0,062 €`). Agrégats : 2 décimales sous 100 €, entier au-delà.
- Jours ouvrés pour la moyenne : lundi à vendredi.
- État vide (aucun appel) : total `0`, graphique à plat, journal « Aucun appel sur la période ».

## 6. Recette
1. Un appel Insights génère une ligne dans le journal en moins de 5 s, avec le bon modèle et le bon coût (recalculer à la main).
2. Bascule Coûts : les totaux entrée + sortie égalent la dépense de « Consommation et coûts » pour la même période.
3. Filtre Guidage console : graphique, total, appels et journal ne montrent que `guidage`.
4. Appel servi par le secours : pastille « Secours » et modèle de secours affichés.
5. Changer un tarif au catalogue : les appels passés gardent leur coût d’origine.
6. Export CSV : même nombre de lignes que `total`, colonnes identiques au journal.
