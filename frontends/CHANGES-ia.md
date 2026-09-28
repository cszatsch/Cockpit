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
