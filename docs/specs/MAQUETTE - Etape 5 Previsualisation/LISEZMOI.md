# Comités et rapports › Créer un template › Étape 5 – Prévisualisation

## Contenu
- `Template - Etape 5 Previsualisation.dc.html` : écran complet (ouvrir dans un navigateur).
- `Slide.dc.html` : rendu schématique d'une page (vignette et vue agrandie). En production, il est remplacé par l'image réelle de chaque diapositive générée.
- `support.js` : runtime requis, à garder dans le même dossier.

## Principe : rendre visible l'attente
La génération prend plusieurs secondes. Pendant ce temps, l'écran affiche ce qui est déjà connu et montre l'avancement réel :
- la structure (9 pages, leurs numéros et leurs libellés, la structure du document) est affichée **immédiatement** ;
- une carte de progression affiche « Construction du rapport au format défini, avec les données du jour… », un pourcentage, une barre et 4 phases :
  1. Format de l'étape B appliqué
  2. Données du jour collectées
  3. Pages générées · n / 9
  4. Contrôle des données
- les 9 emplacements de page sont visibles dès le départ. La page en cours porte un reflet animé et la mention « En cours ». Chaque page apparaît dès qu'elle est prête, avec un effet de « développement » (flou puis net) ;
- le panneau « Contrôle des données » affiche un squelette pendant les contrôles, puis les alertes ;
- « Suivant › » reste désactivé jusqu'à la fin de la construction ;
- à la fin, la carte passe à « Aperçu prêt · 100 % » et l'en-tête affiche « 9 pages · 1 section · format de l'étape B, données du jour ».

## Interactions
- **Survol d'une vignette** : contour vert, loupe. Il est synchronisé avec la ligne correspondante de « Structure du document » (et inversement).
- **Clic sur une vignette** : vue agrandie plein écran, avec navigation ‹ › et points de pagination, flèches du clavier, Échap ou clic hors de la page pour fermer.
- **Alerte de contrôle** : un point ambre marque la page concernée. « Voir la page 04 » ouvre directement cette page.

## Réglages de démonstration (Tweaks)
- `etat` : « Construction animée » ou « Terminé ».
- `vitesse` : accélère ou ralentit la simulation.

## Intégration
- Remplacer la simulation (`run()`) par l'avancement réel transmis par le serveur, en flux SSE/WebSocket ou par interrogation périodique : phase en cours, pages prêtes (index + URL de l'image), alertes de contrôle.
- Les pages s'affichent dans l'ordre où le serveur les livre. L'emplacement « En cours » correspond à la prochaine page attendue.
- Le nombre de pages, les libellés et la structure viennent de la configuration des étapes B à D : ils sont connus avant la génération.
- Au retour depuis les étapes B, C ou D, l'aperçu est reconstruit (même séquence).
