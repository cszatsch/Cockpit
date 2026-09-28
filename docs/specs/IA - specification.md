# RISE · IA : pipeline Documents et fiche modèle

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
