# Comités et rapports › Créer un template › Étape 6 – Publication
# + mise en service dans « Générer un rapport »

## Contenu
- `Template - Etape 6 Publication.dc.html` : écran de l'étape 6.
- `Generer un rapport - mise en service.dc.html` : onglet « Générer un rapport » pendant et après la mise en service du template publié.
- `support.js` : runtime requis, à garder dans le même dossier.

## 1. Étape 6 – Publication
**Fiche du template (gauche)**
- En-tête : Nom « Test », badge de version v1.0, comité, Auteur, Date de création.
- Lignes : Format (16:9 · 33,87 × 19,05 cm + 4 fichiers PPTX en étiquettes), Composants (étiquettes), Sections, Pages, Contrôle des données, Description.
- Au survol d'une ligne, un lien vers l'étape concernée s'affiche (« Étape B › », etc.) pour corriger avant de publier.

**Panneau de publication (droite)**
- « Prêt à publier » avec le texte de validation et le rappel du contrôle des données.
- Bouton « Valider et publier ».
- Après le clic : « Publication en cours », 4 tâches enchaînées (Génération du PowerPoint de référence · Gel de la structure, du design et des zones de données · Activation du template · Ajout à la Bibliothèque), puis « Template publié · Actif » avec « Générer un rapport » et « Voir dans la Bibliothèque ».
- Réglage de démonstration : `etat` = Prêt / Publié.

## 2. Générer un rapport – mise en service
Après la publication, l'application ouvre « Générer un rapport » immédiatement, mais le template n'est utilisable qu'après quelques secondes.

**Pendant la mise en service**
- La carte du nouveau template apparaît en tête du groupe du comité. Elle porte un reflet animé et la pastille « Mise en service ». Le téléchargement et l'interrupteur sont masqués.
- Sous la carte : la phase en cours (Enregistrement du PowerPoint de référence → Ajout à la Bibliothèque → Préparation des zones de données), le compteur n / 3 et une barre de progression.
- Prévisualisation : le bandeau du rapport s'affiche tout de suite, avec le message « Template en cours de mise en service. Il sera utilisable dans quelques secondes. ». Les sections sont estompées et animées, et « Télécharger le rapport » est désactivé.
- Les autres templates restent sélectionnables et utilisables.

**Quand le template est prêt**
- Une onde verte unique passe sur la carte, qui reçoit l'étiquette « Nouveau » et retrouve ses boutons.
- Les sections de la prévisualisation apparaissent l'une après l'autre et le bouton de téléchargement s'active.
- La notification « Test v1.0 est prêt à être utilisé. » reste affichée environ 3,5 s.
- Réglages de démonstration : `etat` (animation / Prêt) et `vitesse`.

## Intégration
- Remplacer les simulations (`publish()` à l'étape 6, `run()` dans Générer un rapport) par l'état réel transmis par le serveur, en SSE/WebSocket ou par interrogation périodique : phase en cours, puis statut « prêt ».
- La redirection vers « Générer un rapport » se fait dès la validation. Le template est présélectionné.
- Le statut « mise en service » doit survivre à un rechargement de page : il est lu côté serveur à l'ouverture de l'onglet.
- L'étiquette « Nouveau » peut rester affichée jusqu'à la première génération de rapport ou pendant 24 h (à arbitrer).
- Le bandeau photo de l'en-tête est remplacé par un aplat dans la maquette : conserver l'en-tête existant de l'application.
