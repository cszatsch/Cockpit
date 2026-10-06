# Initialisation d’un projet v2 : écarts par rapport à la maquette

Maquette validée : `Initialisation projet v2.dc.html`, livrée le 07/10/2026. Écran intégré : `frontends/Initialisation projet.dc.html`.

La structure, les styles, les textes, les 9 états et leurs transitions sont ceux de la maquette. Les écarts ci-dessous viennent tous de l’intégration dans la Console ou des données réelles.

| # | Écart | Justification |
|---|---|---|
| 1 | Dans la Console, la barre de 42 px (fil d’Ariane « Projets › Initialisation d’un projet », pastille « 1 incident ») n’est pas affichée (prop `chrome`, vraie par défaut). | La barre de la Console affiche déjà ce fil d’Ariane et l’indicateur d’incidents réel. Une seconde barre ferait doublon. |
| 2 | À l’étape « Préremplir », l’en-tête de page de la Console est masqué. Il revient à l’étape « Importer ». | L’en-tête de la maquette (« PROJETS », titre, parcours en 5 étapes) le remplace. On évite ainsi deux titres identiques. |
| 3 | La barre « ÉTATS » n’est pas affichée en mode réel. | Elle sert à parcourir la maquette. La maquette prévoit de la masquer (prop `demo=false`). |
| 4 | Nombre de champs par onglet : 2, 2, 5, 4, 14, 3, 6, 7, 7, 8, 6, 3, 8, 6 au lieu de 12, 18, 46… | Ce sont les champs de saisie du modèle Excel (colonnes obligatoires et facultatives). Après l’analyse, chaque tuile montre les champs trouvés sur les champs attendus. |
| 5 | Les nombres des textes (onglets, champs, pages, page lue, durée, onglet d’interruption) viennent du serveur. Avec 1 onglet conservé, la phrase devient « L’onglet déjà traité est conservé. » ; avec aucun, « Aucun onglet n’était encore traité. ». | Mêmes libellés que la maquette, qui ne prévoyait que le pluriel. |
| 6 | Un fichier de plus de 25 Mo mène à l’état « ERREUR · FORMAT ». | La maquette n’a pas d’état pour la taille. Celui-ci rappelle déjà la limite (« PDF, DOCX ou PPTX · 25 Mo max »). |
| 7 | « Télécharger l’Excel » propose le nom « [nom de la proposition] · prérempli.xlsx », repris dans le message de confirmation. | Le nom suit le document déposé et non l’exemple ORION. |
| 8 | « Importer le fichier vérifié » et « Importer l’Excel » ouvrent l’étape « Importer » existante, au lieu d’un message. | C’est l’enchaînement demandé : Importer → Contrôler → Prévisualiser → Publier. |
| 9 | « Modèle vierge » et « Remplir le modèle manuellement » téléchargent réellement le modèle, sous le nom « [nom] - Init projet Cockpit [AAMMJJ].xlsx ». Le message de la maquette est conservé. | Même nom que le bouton « Modèle Excel » de l’étape Importer. |
| 10 | La « page lue » est une position de lecture estimée. | Le modèle d’IA lit tout le document à chaque onglet et n’indique pas de page en cours. La page suit l’avancement de l’onglet. |
| 11 | Le temps restant n’apparaît qu’à la première mesure du serveur. Il ne remonte jamais. | Pas d’estimation sans mesure. Lissage demandé par les règles métier. |
| 12 | Plusieurs fichiers peuvent être déposés ensemble (demande du 07/10/2026). La ligne du fichier affiche alors « [premier fichier] + N fichiers ». | La proposition et ses annexes sont analysées comme un seul document. La colonne SOURCE garde le format « p. N » de la maquette, avec des pages numérotées à la suite. Le commentaire de l’Excel précise le fichier et la page. |
