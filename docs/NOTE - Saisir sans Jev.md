# « Saisir sans Jev » — intégration de la maquette 3a (09/10/2026)

Maquette : `Jev - Saisir sans Jev 3a.dc.html` (ZIP « RISE COCKPIT »). Fonction intégrée dans la barre latérale de Jev du
Cockpit, à l'identique de la maquette (mise en page, espacements, Plus Jakarta Sans, couleurs, survols, sélection, libellés).

## Parcours

1. **Bouton** : lien « Saisir sans Jev » sous le champ de Jev, centré entre deux filets, icône de crayon (`RISE Cockpit.dc.html`).
   Jev reste le mode par défaut.
2. **Choix de l'objet** : tuiles sur deux colonnes, familles « Structure du projet » (Phase, Chantier, Sous-phase, Jalon) et
   « Suivi et pilotage » (Risque, Action, Décision, Tâche, Fiche d'arbitrage). Flèche : retour à Jev.
3. **Formulaire** de l'objet choisi, champs requis marqués d'un astérisque. Flèche : changer d'objet. « Annuler » : retour au
   choix de l'objet. Bouton « Créer … » : écriture par l'API, puis retour à Jev avec un message de confirmation.
4. **Détail de l'option** (fiche d'arbitrage seulement) : intitulé, score, barre de composition, critères.

Le bouton × ferme la barre latérale et réinitialise : à la réouverture, Jev (étape 1).

## Composants créés

| Composant | Fichier | Rôle |
|---|---|---|
| Saisie sans Jev | `frontends/Saisie sans Jev.dc.html` | Panneaux 2, 3 et 4 ; champs par objet (`SSJ_F`), cartes A / B, recommandation |
| Champ de sélection simple | `frontends/Champ choix.dc.html` | Liste déroulante avec coche, « Transverse » précédé d'un filet, icône personne |
| Sélection multiple en étiquettes | `frontends/Champ etiquettes.dc.html` | Étiquettes retirables, « Ajouter », liste à cocher qui reste ouverte |
| Échelle 1–4 | `frontends/Echelle 1-4.dc.html` | Probabilité, impact ; niveau en clair à droite |
| Sélecteur segmenté | `frontends/Selecteur segmente.dc.html` | Statut, priorité (pastilles de couleur), option recommandée (point de suggestion) |
| Ligne de critère | `frontends/Ligne critere.dc.html` | Critère, poids (%), note 1–4 (second clic : retirée), description, suppression |
| Calculs | `frontends/saisie-calc.js` | Score, total des poids, composition, comparaison, criticité — fonctions pures |

Écriture : `api.js` → `saisie(kind, values)` (routes `/phases`, `/subphases` + `PUT /workstreams/:id/subphases`,
`/workstreams`, `/milestones`, `/risks`, `/actions`, `/decisions`, `/tasks`, `PATCH /decisions/:id/arbitration`).
Listes réelles : `ssjData()` dans `RISE Cockpit.dc.html` (personnes actives, phases, chantiers, risques / décisions / jalons
ouverts, actions ouvertes, décisions non arbitrées, instances).

Tests : `backend/test/unit/saisie-calc.spec.ts` (calculs), `backend/test/unit/arbitration.spec.ts`,
`backend/test/e2e/pilotage.spec.ts` (actions sur plusieurs chantiers, tâches confiées, critères par option).

## Extension du modèle de données (décision du commanditaire du 09/10/2026)

- **Action** : un ou plusieurs chantiers, ou transverse (`wsIds`, `allWs`, `wsId` = chantier principal, nul si transverse),
  comme les risques ; droits sur chacun des chantiers, transverse réservé au PMO ; vues `jev_cockpit.actions` (colonnes
  `chantier_ids`, `transverse`) et `jev_cockpit.actions_chantiers`. Les actions issues d'un risque reprennent ses chantiers.
- **Tâche** : responsable (`ownerId`, sinon l'auteur), chantiers (`wsIds`, `allWs`), statuts À faire, En cours, Bloquée,
  Terminée ; visible et modifiable par l'auteur et le responsable, supprimable par l'auteur ; confier une tâche à une autre
  personne : profils non Lecteur.
- **Fiche d'arbitrage** : critères propres à chaque option (`options[].criteria` : intitulé, poids, note 0–4, description) ;
  l'ancien format (critères communs A / B) est déduit pour l'onglet Décisions (`legacyCriteria`) ; contrôle des poids par option.

Migration `20261117000000_actions_taches_chantiers`.

## Écarts avec la maquette, justifiés

1. **Largeur** : 400 px au lieu de 380 px — largeur actuelle de la barre latérale de Jev ; hauteur : celle de l'écran.
2. **Lien « Saisir sans Jev »** : en romain, comme la maquette (il avait été passé en italique le 09/10/2026, avant la maquette).
3. **Valeurs exigées par le serveur mais absentes du formulaire** (choix « valeurs déduites ») : phase du jalon = celle dont la
   période contient la date cible (sinon la première du chantier, puis du projet) ; responsable d'une phase = l'utilisateur s'il
   n'est pas choisi ; code d'une sous-phase = rang suivant dans sa phase (« 2.4 ») ; numéro d'une phase = suivant.
4. **Décision** : le serveur rattache une décision à un chantier ; « Transverse » ou aucun chantier sont refusés à
   l'enregistrement avec un message (la liste garde « Transverse » comme la maquette).
5. **Valeurs initiales** : les valeurs d'exemple de la maquette (Claire Martin, 23/10/2026, Refonte du SI RH…) ne sont pas
   reprises ; Responsable de l'action = l'utilisateur ; Chantier du risque = « Transverse » pour un PMO, vide sinon ; statut,
   priorité, probabilité et impact : valeurs par défaut de la maquette. Fiche d'arbitrage : un critère vide par option.
6. **« Transverse »** dans une sélection multiple : exclusif (le cocher retire les autres chantiers, cocher un chantier le
   retire) — cohérence avec le modèle (transverse = tous les chantiers).
7. **Champs requis manquants** : la mention « * Requis » du pied devient, en rouge, « À renseigner : … » et les champs
   concernés sont bordés de rouge — la maquette ne décrit pas cet état. Erreur du serveur : même emplacement.
8. **Dates** : champ date du navigateur (jj/mm/aaaa, clavier et calendrier natifs) dans la boîte de la maquette, icône de la
   maquette ; « Période » : deux dates séparées par une flèche.
9. **Accessibilité** : libellés associés (`label`, `aria-labelledby`), listes en `combobox` / `listbox` (flèches, Entrée,
   Échap), échelles et segments en groupes de boutons radio (flèches), contour de focus visible (#146b64). Le champ
   d'intitulé reçoit le focus à l'ouverture du formulaire (d'où sa bordure verte, comme dans la maquette).
10. **Droits** : les objets de structure (phase, sous-phase, chantier, jalon) relèvent du Référentiel (PMO) ; pour un autre
    profil, le serveur refuse et le message s'affiche dans le pied du formulaire (les tuiles restent visibles, comme la maquette).
11. **Probabilité et impact** sur 1 à 4 (maquette) : le registre des risques garde son échelle 1 à 5 ; un risque créé ici a
    donc une criticité au plus de 16 dans le registre (seuils ≥ 12, ≥ 20 du registre inchangés).
12. **Chantier : « Période » (début → fin), requise** — demande du commanditaire du 09/10/2026, absente de la maquette : un
    chantier sans dates n'était dessiné ni dans le Planning ni dans le Suivi d'avancement.
13. **Livrable** (demande du commanditaire du 09/10/2026, hors maquette) : tuile placée avant « Risque » ; champs Nom*, Phase*,
    Chantier, Sous-phase*, Responsable*, Date de début, Date de fin*. Sous-phase, responsable et date de fin sont requis par le
    serveur (un livrable appartient toujours à une sous-phase, dont il tire sa phase ; le plan de livraison les regroupe ainsi) ;
    la sous-phase est choisie parmi celles de la phase (et du chantier s'il en a dans cette phase), retirée si la phase change.
