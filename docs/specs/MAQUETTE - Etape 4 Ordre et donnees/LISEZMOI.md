# Comités et rapports › Créer un template › Étape 4 – Ordre et données

## Contenu
- `Template - Etape 4 Ordre et donnees.dc.html` : écran complet (ouvrir directement dans un navigateur).
- `support.js` : runtime requis, à garder dans le même dossier.

## Structure de l'écran
1. **Stepper** des 6 étapes (A à C terminées, D en cours).
2. **En-tête** : « D · ORDRE, SECTIONS ET DONNÉES », titre, résumé « n section(s) · une page intercalaire par section · données recalculées à chaque publication ».
3. **Liste des composants** avec **rail des chapitres** à gauche :
   - chaque section commence par un repère numéroté (fond marine, chiffre ambre), le libellé « SECTION n · INTERCALAIRE » et le champ titre (placeholder « Titre de la section (par défaut : <premier composant>) ») ;
   - entre deux composants, un point sur le rail. Au survol, la mention « + Nouvelle section à partir d'ici » apparaît à côté du rail. Un clic crée une section qui commence au composant suivant ;
   - un clic sur le repère numéroté d'une section (à partir de la section 2) la rattache à la section précédente. La section 1 n'est pas supprimable.
4. **Composant** : poignée de glisser-déposer, numéro, nom, type, description, indicateurs (pastilles activables, compteur « actifs / total »), bloc données :
   - Périmètre : Projet, Vague, Phase, Chantier ;
   - Cible : « Projet entier » si périmètre = Projet, sinon liste des éléments du périmètre ;
   - Période : liste pour les composants concernés (Mois en cours, 6 derniers mois, 90 prochains jours…), sinon « Situation du jour ».
5. **Réordonnancement par glisser-déposer** : on saisit une ligne et on la dépose au-dessus ou au-dessous d'une autre. Un trait vert indique l'emplacement de dépose et la ligne déplacée est atténuée. Les sélecteurs, boutons et champs ne déclenchent pas le glisser.
6. **Déroulé du rapport** (panneau latéral) : page de couverture, sections (titre saisi ou titre par défaut) et leurs composants, page de clôture. Mis à jour en temps réel.
7. **Navigation** : « ‹ Précédent », « Suivant › ».

## Règles
- Les sections sont des positions de coupure dans l'ordre des composants (`breaks`, la position 0 est toujours présente). Quand on déplace un composant, les coupures restent à leur position.
- Une section produit une page intercalaire dans le rapport.
- Le titre d'une section est facultatif : sans titre, le rapport reprend le nom du premier composant de la section.
- Au moins un indicateur actif par composant est recommandé (pas de blocage dans la maquette).

## Intégration
- Les données (constantes `C`, `PERIMS`, `CIBLES`) sont des données de démonstration. Il faut les remplacer par : les composants retenus à l'étape C, leurs indicateurs et l'état proposé, les périodes disponibles par composant, et les vagues, phases et chantiers réels du projet.
- À persister : ordre des composants, positions de coupure, titres de section, indicateurs actifs, périmètre, cible et période par composant.
- Les données sont recalculées à chaque publication à partir de ces paramètres.
