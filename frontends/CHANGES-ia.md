# Écrans IA (pipeline Documents, vue réseau, fiche modèle) — modifications du frontend livré

Livraison d'origine : `Affectation des modeles.dc.html`, `Vue reseau IA.dc.html`, `Fiche modele.dc.html` et `ia-data.js`, versés à l'identique au commit `5f55f4b` avec leur spécification (`docs/specs/IA - specification.md`). Les écarts se lisent avec `git diff 5f55f4b -- frontends/`. Design, textes et règles de `ia-data.js` sont inchangés ; `support.js` et les logos de la livraison ne sont pas repris (le dépôt a les siens, logos identiques).

## Intégration dans la Console

Les trois écrans sont chargés par `<dc-import>` dans `Console Admin.dc.html` et reçoivent les données réelles par propriétés (`providers`, `models`, `functions`, `groups`, `assignment`) ; `ia-data.js` n'apporte plus que les règles (`window.RISE_IA` : coût, états, ancienneté), ses données de démonstration ne servant qu'à l'ouverture seule d'un écran. Détail dans `CHANGES-console.md`.

## `Affectation des modeles.dc.html`

| Modification | Raison |
|---|---|
| propriété `embedded` : sans titre de page ni marges propres | l'écran s'insère sous l'en-tête de section de la console |
| `saved()` lit d'abord `props.assignment` | l'affectation enregistrée vient du serveur ; auparavant l'état local l'emportait après un premier enregistrement |
| `save` : avec `onSave`, le brouillon reste affiché jusqu'à la nouvelle affectation (`componentDidUpdate`) | la console demande confirmation ; si l'on annule, la modification n'est pas perdue |

## `Vue reseau IA.dc.html`

| Modification | Raison |
|---|---|
| propriété `embedded` : sans marges ni largeur maximale propres | insertion dans « Fournisseurs et modèles » |

## `Fiche modele.dc.html`

| Modification | Raison |
|---|---|
| `onSubmit` peut renvoyer une promesse ; la fiche ne se ferme qu'après l'accord du serveur (`false` : reste ouverte) | un refus du serveur (catégorie d'un modèle affecté, doublon…) ne doit pas faire perdre la saisie |
| propriété `onDelete` et bouton « Supprimer » (modification seulement), au dessin du bouton de suppression de la console | la suppression d'un modèle existait dans l'ancien formulaire (décision du 28/09/2026) |
| en choisissant Reranking, unité « À la requête » par défaut | la spécification indique que le Reranking est « souvent au nombre de requêtes » ; la livraison gardait l'unité précédente (au token) |
| tarifs affichés jusqu'à 4 décimales | 0,125 € / M tokens devenait 0,13 € à la réouverture |

## Dimensions des modèles d'embedding et réindexation (28/09/2026)

| Modification | Justification |
|---|---|
| `ia-data.js` : champs `dims` / `dim` sur les modèles d'embedding de démonstration ; fonctions `dimOf`, `reindex` et texte `REINDEX_WARNING` | demande du commanditaire : liste des dimensions de sortie acceptées, valeur par défaut, avertissement de réindexation |
| Fiche modèle : champs « Identifiant chez le fournisseur » et « Longueur de contexte » (tous modèles) ; pour un Embedding, « Dimensions » (liste séparée par des virgules) et « Dimension par défaut » (choisie dans la liste) | renseigner l'identifiant, le contexte et les dimensions demandés pour les modèles OpenRouter |
| Affectation : sous le modèle principal d'une fonction d'embedding, sélecteur de dimension (verrouillé si le modèle n'en a qu'une) ; changer de principal revient à sa dimension par défaut | choisir la taille des vecteurs parmi les seules valeurs acceptées par le modèle |
| Affectation : encadré « ⚠️ » avec le texte du commanditaire dans la carte Vectorisation dès que le modèle d'embedding ou sa dimension change | avertissement demandé, y compris pour un changement de dimension d'un même modèle |

## Livraison IA v2 : Génération de rapports et repli des groupes (28/09/2026)

Livraison intégrée par fusion à trois voies (livraison v1 → v2 appliquée sur les écrans adaptés) ; toutes les modifications de la livraison sont reprises. Adaptations propres au dépôt, conservées :

| Modification | Justification |
|---|---|
| `ia-data.js` exporte à la fois `kTok`, `fitsOut` (livraison) et `dimOf`, `reindex`, `REINDEX_WARNING` (dimensions) | les deux évolutions coexistent |
| Affectation : sélecteur de dimension et avertissement de réindexation dans la carte Vectorisation, visibles une fois le groupe Documents déplié | dimensions des modèles d'embedding (28/09/2026) ; la confirmation de la console reprend l'avertissement même groupe replié |
