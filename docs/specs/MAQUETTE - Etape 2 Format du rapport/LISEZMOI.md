# Comités et rapports › Créer un template › Étape 2 – Format du rapport

## Contenu
- `Template - Etape 2 Format du rapport.dc.html` : écran complet (ouvrir directement dans un navigateur).
- `support.js` : runtime requis, à garder dans le même dossier.

## Structure de l'écran
1. **Stepper** des 6 étapes (A terminée, B en cours).
2. **En-tête** : titre, consigne, compteur « 4 / 4 pages chargées », bouton « Importer un fichier pour les 4 pages ».
3. **Séquence des 4 pages** (couverture, intercalaire, standard, clôture) : vignette, statut « À vérifier » / « Vérifiée ». Un clic ouvre la page dans l'espace de travail.
4. **Espace de travail**
   - Aperçu de la diapositive avec zones superposées : vert = zone de données, pointillé gris = design fixe (au survol), hachuré rouge = contenu d'exemple retiré.
   - Légende avec le nombre de zones par catégorie.
   - Fichier (PPTX, Remplacer, Supprimer), fiche technique, palette.
   - Liste « Zones de la page » : un sélecteur de rôle par forme, coloré selon la catégorie. Le survol est synchronisé avec l'aperçu.
   - « Proposé par l'IA » devient « Rétablir la proposition de l'IA » dès qu'une affectation est modifiée.
   - Alertes : police introuvable, forme libre.
5. **Bandeau de validation** : texte v1.0, compteur de pages vérifiées, « Étape précédente », « Valider le format ».

## Intégration
- Les données (`PAGES` dans la classe logique) sont des données de démonstration, à remplacer par l'analyse réelle du PPTX : formes (type, libellé, position x/y/l/h en % de la diapositive, rôle proposé par l'IA), fiche technique, palette, alertes.
- Rôles disponibles : constante `ROLES` (13 valeurs).
- Catégorie dérivée du rôle : `Design fixe (gardé)` → fixe, `Contenu d'exemple (retiré)` → retiré, tout autre rôle → donnée.
- À brancher côté serveur : import / remplacement / suppression du fichier, enregistrement des rôles, statut vérifié par page, validation (génération du PowerPoint de référence v1.0, passage du template à l'état actif, ajout à la Bibliothèque).
- Les aperçus sont reconstruits à partir des zones. En production, on peut utiliser en fond le rendu image réel de la diapositive, avec la même couche de zones par-dessus.
