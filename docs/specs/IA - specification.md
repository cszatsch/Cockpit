# RISE · IA : pipeline Documents, Génération de rapports et fiche modèle

Spécification d’intégration des écrans 1b (Affectation), 1f (Vue réseau) et 1h (Fiche modèle) dans la Console Admin.

## 1. Fichiers

| Fichier | Rôle | Remplace dans `Console Admin.dc.html` |
|---|---|---|
| `Affectation des modeles.dc.html` | Écran « Affectation des modèles » | le bloc `<sc-if value="{{ isAsg }}">` |
| `Vue reseau IA.dc.html` | Vue réseau Fournisseurs → Modèles → Fonctions | le bloc sombre `pv.wire` de « Fournisseurs et modèles » |
| `Fiche modele.dc.html` | Modale « Ajouter / Modifier un modèle » | la modale d’ajout et l’édition d’un modèle |
| `ia-data.js` | Données de démonstration **et règles métier** (`window.RISE_IA`) | à fusionner avec `S.models`, `S.provs`, `FNS`, `S.asg` |
| `support.js`, `assets/logos/` | Runtime et logos | déjà présents dans la livraison principale |

Chaque écran s’ouvre seul dans un navigateur. Intégration : `<dc-import name="Affectation des modeles" …>` (ou reprise du template et de la classe dans la console), en passant les données réelles par props.

## 2. Modèle de données

### Model (évolution)
```ts
type Category = 'llm' | 'embedding' | 'reranking';
type Price =
  | { unit: 'tokens'; in: number; out?: number }   // € / M tokens ; out : LLM uniquement
  | { unit: 'requests'; per1k: number };           // € / 1 000 requêtes (reranking)
interface Model {
  id: string; pv: string; n: string; d: string;
  cat: Category;
  rel: string;          // NOUVEAU · date de sortie ISO (YYYY-MM-DD), obligatoire
  maxOut?: number;      // NOUVEAU · max output tokens, LLM uniquement, entier > 0
  price: Price;         // REMPLACE pin/pout
  act: boolean;
}
```
Migration : `pin/pout` → `price: { unit: 'tokens', in: pin, out: pout }` pour les LLM ; `out` supprimé pour les embeddings ; `rel` à renseigner (null accepté pour l’existant, l’écran n’affiche alors pas d’ancienneté).

### AiFunction (évolution)
```ts
interface AiFunction {
  id: string; n: string; sh: string; d: string;
  cat: Category;               // NOUVEAU · seule catégorie acceptée
  group?: string;              // NOUVEAU · ex. 'documents'
  step?: number;               // NOUVEAU · ordre dans le groupe (1, 2, 3)
  vol: { in?: number; out?: number; req?: number };  // volume réel 30 j (M tokens ou requêtes)
}
```
La fonction « Analyse de documents » (`documents`) est remplacée par trois fonctions :

| id | Étape | Catégorie | Volume mesuré |
|---|---|---|---|
| `doc_vec` | 1 · Vectorisation | embedding | tokens en entrée |
| `doc_rrk` | 2 · Reclassement | reranking | requêtes |
| `doc_syn` | 3 · Synthèse | llm | tokens entrée + sortie |

Migration de l’affectation : l’ancien principal/secours de `documents` devient celui de `doc_syn`. `doc_vec` et `doc_rrk` démarrent sans affectation (état Indisponible jusqu’à configuration).

`UsageRecord.fn` doit accepter ces trois identifiants ; le suivi de consommation (ConsoCouts) regroupe par `group` quand il existe.

## 3. Règles métier (implémentées dans `ia-data.js`)

- **Filtrage par catégorie** : les listes principal / secours d’une fonction ne proposent que les modèles actifs de `fn.cat` (`catModels`). Le serveur refuse (`422`) une affectation d’une autre catégorie.
- Le secours doit différer du principal ; choisir comme principal le modèle secours vide le secours.
- **Modèle utilisable** (`usable`) : actif et fournisseur au statut `ok`.
- **État d’une fonction** (`states`) :
  - `ok` : principal utilisable ;
  - `fallback` : principal inutilisable, secours utilisable ;
  - `down` : aucun des deux ;
  - `blocked` : fonction d’un groupe dont une étape **précédente** est `down`. `blockedBy` indique l’étape fautive. Une étape `fallback` ne bloque pas la suite.
- **Coût mensuel estimé** (`cost`) :
  - tokens : `vol.in × price.in + vol.out × price.out` ;
  - requêtes : `vol.req / 1000 × price.per1k`.
  Le coût affiché est celui du principal ; en `fallback`, le coût du secours est affiché à côté. Total groupe = somme des étapes.
- **Correctif proposé** : pour une fonction `down`, le modèle utilisable le moins cher de la catégorie est proposé en secours (bouton, sans enregistrement).
- **Ancienneté** (`age`) : mois écoulés depuis `rel` · `< 12` récent · `12 à 24` à surveiller · `> 24` ancien. Seuils à confirmer.

## 4. Écrans

### Affectation des modèles (1b)
- Fonctions autonomes en cartes compactes ; chaque groupe en « ligne de traitement » : Texte extrait → étapes → Réponse.
- La ligne est allumée tant que le flux passe ; elle s’éteint (pointillé) après une étape `down`. Étapes suspendues hachurées.
- Barre d’enregistrement collante dès qu’une modification est en cours ; `onSave(assignment)` reçoit l’affectation complète. Côté serveur : même confirmation et même trace d’audit qu’aujourd’hui (« Changement d’affectation de modèle »), une entrée par étape modifiée.
- Sous 1 000 px la ligne défile horizontalement (largeur minimale 190 px par étape).

### Vue réseau (1f)
- Une ligne par fonction, deux voies : principal (P) et secours (S). La voie qui répond est lumineuse (teal pour le principal, ambre pour un secours en service) ; une voie coupée porte une croix rouge.
- Groupe Documents : étapes numérotées reliées par une colonne ; étapes suspendues à 45 % d’opacité.
- Colonne Fournisseurs : un fournisseur en erreur liste les fonctions touchées.
- Callbacks : `onOpenModel(id)`, `onOpenProvider(id)`, `onTestKey(id)`, `onReplaceKey(id)`, `onAddFallback(fnId, slot)`.

### Fiche modèle (1h)
- La catégorie se choisit en premier ; les champs suivent :
  - LLM : date de sortie, max output tokens, entrée + sortie € / M tokens ;
  - Embedding : date de sortie, entrée € / M tokens ;
  - Reranking : date de sortie, unité « à la requête » (€ / 1 000 requêtes) ou « au token » (€ / M tokens).
- Volet « Aperçu en direct » : fonctions où le modèle sera proposé, coût sur leur volume réel, continuité (autres modèles de la catégorie disponibles en secours).
- Validation : nom, date (pas dans le futur), tarif(s) ≥ 0, max output tokens entier > 0 pour un LLM. Décimales avec virgule acceptées.
- `onSubmit(model)` reçoit un objet `Model` ; `onClose()` sur Annuler, Échap ou clic hors de la modale. Prop `model` pour l’édition (titre « Modifier le modèle », bouton « Enregistrer »).
- Changer la catégorie d’un modèle déjà affecté : refuser côté serveur (`409`) tant qu’il est utilisé par une fonction d’une autre catégorie.

## 5. API attendue

| Méthode | Route | Corps / réponse |
|---|---|---|
| GET | `/api/ai/models` | `Model[]` |
| POST | `/api/ai/models` | `Model` sans id → `Model` |
| PATCH | `/api/ai/models/:id` | champs modifiés → `Model` |
| GET | `/api/ai/functions` | `AiFunction[]` avec `vol` des 30 derniers jours |
| GET | `/api/ai/assignment` | `Record<fnId, { p, f }>` |
| PUT | `/api/ai/assignment` | `Record<fnId, { p, f }>` · valide catégorie et p ≠ f |

À l’exécution, le routeur de Documents applique la même règle que l’écran : si une étape n’a aucun modèle utilisable, la requête s’arrête à cette étape avec une erreur explicite, sans appeler les étapes suivantes.

## 6. Démonstration
Le prop `googleKeyOk` (écrans 1b et 1f) simule la clé Google valide ou refusée. `demo` (1h) pré-remplit l’exemple Rerank 3.5. Données de démonstration : 5 fournisseurs dont **Cohere** (ajouté pour disposer d’un modèle Reranking), tarifs et dates indicatifs.

## 7. Évolution v2 : Génération de rapports et repli des groupes (variantes 2a et 2d)

### Nouvelle fonction `rapports`
```ts
{ id: 'rapports', n: 'Génération de rapports', sh: 'Rapports', cat: 'llm',
  isNew: true,        // badge « Nouveau » (à retirer après la mise en service)
  needOut: 38000,     // longueur du plus long rapport produit (tokens), mesurée sur 30 jours
  vol: { in: 1.9, out: 0.9 } }
```
- Affectation initiale : principal Claude Sonnet 4.5, secours à choisir par l’administrateur (démo : Mistral Large 2 pour illustrer l’alerte).
- `needOut` est un champ générique d’`AiFunction` : toute fonction LLM à sortie longue peut le renseigner. Côté serveur, le calculer comme le maximum des `output_tokens` de la fonction sur 30 jours.
- `UsageRecord.fn` accepte `rapports`.

### Règle de capacité (`fitsOut`, `kTok` dans `ia-data.js`)
- Un modèle LLM couvre la fonction si `maxOut ≥ needOut`. Sans `needOut`, ou pour Embedding / Reranking, la règle ne s’applique pas.
- Un modèle trop court reste sélectionnable (libellé « trop court » dans la liste) mais déclenche une alerte :
  - principal trop court : « Principal limité à N tokens… » ;
  - secours trop court : « Secours limité à N tokens… » + bouton proposant le modèle utilisable le moins cher qui couvre la longueur.
- Le correctif proposé pour une fonction à l’arrêt tient aussi compte de la capacité.
- Le routeur, à l’exécution, doit passer au secours si le principal renvoie une réponse tronquée (`stop_reason = max_tokens`), et journaliser l’événement.

### Affectation des modèles
- Cartes des fonctions autonomes : 3 par ligne sur grand écran (min 300 px).
- Carte Rapports : badge Nouveau, jauge « Sortie maximale » (barres P et S proportionnelles au Max output tokens, repère = `needOut`, teal si couvert, ambre sinon).
- Groupes (Documents) **repliés par défaut** : une ligne avec mini-tracé des étapes (mêmes couleurs d’état que la ligne complète), noms des étapes, état, total mensuel, bouton « Déplier ». Déplié : la ligne de traitement complète, bouton « Plier » dans l’en-tête. `aria-expanded` renseigné.
- L’état replié / déplié est mémorisé (`localStorage` `rise-ia-asg-open`, liste des groupes ouverts). Pour un stockage par administrateur : `GET/PUT /api/me/preferences` avec la clé `ia.asg.open`.

### Vue réseau
- Ligne Rapports après Gestion des données : badge Nouveau, « Sortie requise ≈ N ». Sur les voies, l’étiquette de la puce affiche le Max output tokens (`64k`) ; un modèle trop court affiche `32k < 38k` et un contour ambre.
- Groupe Documents replié par défaut : étapes numérotées sur une ligne, colorées selon leur état, bouton « Déplier ». Déplié : voies complètes par étape et bouton « Plier ». État mémorisé séparément (`rise-ia-net-open`, préférence `ia.net.open`).
- Légende : ajout « 64k = Max output tokens ».

### Fiche modèle
- Aucune modification : le champ Max output tokens existe déjà ; la fonction Rapports apparaît automatiquement dans l’aperçu « Proposé pour » des modèles LLM.
