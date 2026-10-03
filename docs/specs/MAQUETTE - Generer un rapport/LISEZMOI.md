# Comités et rapports › Générer un rapport

## Contenu
- `Generer un rapport.dc.html` : écran complet (ouvrir dans un navigateur).
- `support.js` : runtime requis, à garder dans le même dossier.

L'en-tête de l'application (onglets, bouton « Créer un template ») n'est pas inclus : il faut conserver l'en-tête existant.

## Structure
1. **Séance du rapport** : pavé date (mois + jour), libellé « SÉANCE DU RAPPORT », texte de rattachement, sélecteur de séance, lien « Calendrier des comités → ».
2. Deux tuiles **symétriques** de même hauteur (640 px), côte à côte, empilées sous ~950 px :
   - **Templates actifs · n** : recherche, filtre par comité, liste groupée par comité, pied « x sur n templates » + « Tout déplier / Tout replier ».
   - **Prévisualisation** : bandeau du rapport (titre, comité, date, version · pages), sommaire des sections (numéro, nom, pointillés, « Projet entier · 1 page »), note « Le rapport une fois généré peut être versé dans la Base de connaissance. ».
3. Chaque tuile défile en interne, sans barre de défilement visible. La page ne s'allonge pas, quel que soit le nombre de templates.

## Passage à l'échelle (100 templates et plus)
- **Recherche** sur le nom, l'auteur, les composants et le comité. Elle ignore les accents et la casse.
- **Filtre comité** : « Tous les comités » ou un comité précis.
- **Groupes repliables** par comité, avec compteur. L'en-tête de groupe reste collé en haut pendant le défilement. Par défaut, seul le groupe du template sélectionné est ouvert. Une recherche ou un filtre ouvre automatiquement les groupes concernés.
- **Lignes de hauteur fixe (66 px)**, toutes identiques : bouton radio, nom, version, une seule ligne de métadonnées (auteur · pages · composants, tronquée avec la liste complète au survol), téléchargement, interrupteur actif/inactif.
- **État vide** : « Aucun template ne correspond à cette recherche. »

## Mise en service d'un template tout juste publié
- La ligne du nouveau template porte un reflet animé, la mention « Mise en service », la phase en cours (Enregistrement du PowerPoint de référence → Ajout à la Bibliothèque → Préparation des zones de données) avec le compteur n / 3, et une barre de progression fine en bas de ligne. La hauteur de la ligne ne change pas.
- L'en-tête du groupe affiche un indicateur de chargement.
- La prévisualisation affiche le message « Template en cours de mise en service. Il sera utilisable dans quelques secondes. » et un sommaire estompé et animé.
- Une fois le template prêt :
  - une onde verte passe sur la ligne ;
  - l'étiquette « Nouveau » apparaît, avec le téléchargement et l'interrupteur ;
  - les sections du sommaire apparaissent l'une après l'autre ;
  - la notification « Test v1.0 est prêt à être utilisé. » s'affiche.
- Réglages de démonstration : `etat` (animation / Prêt) et `vitesse`.

## Intégration
- Les données (`ALL`, 100 templates générés, et `COMITES`) sont des exemples. Il faut les remplacer par l'API.
- À partir de quelques centaines de templates, prévoir une recherche et une pagination côté serveur. Une virtualisation de la liste est possible, puisque les lignes ont une hauteur fixe.
- Interrupteur : il fait passer le template de l'état actif à inactif. La ligne est grisée dans la maquette. En production, préciser si un template inactif reste listé.
- Mise en service : remplacer `run()` par l'état serveur (SSE, WebSocket ou interrogation périodique). Cet état doit être conservé au rechargement de la page.
