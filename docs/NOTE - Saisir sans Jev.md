# « Saisir sans Jev » — intégration de la maquette 5a (10/10/2026)

Maquette : `Jev - Saisir sans Jev 5a.dc.html` (ZIP « RISE COCKPIT », 10/10/2026), qui remplace la 3a du 09/10/2026. Fonction
intégrée dans la barre latérale de Jev du Cockpit, à l'identique de la maquette (mise en page, espacements, Plus Jakarta Sans,
couleurs, survols, sélection, libellés), aux écarts près listés plus bas.

## Parcours

1. **Lien** « Saisir sans Jev » sous le champ de Jev (`RISE Cockpit.dc.html`). Jev reste le mode par défaut.
2. **Un seul panneau à l'écran** (400 px, largeur de la barre latérale) :
   - **choix de l'objet** : bandeau bleu nuit avec le titre « Que voulez-vous créer ? » (sans champ de recherche, demande du
     commanditaire du 10/10/2026), liste des objets au clavier (↑ ↓, Début / Fin, Entrée ou Espace ouvrent), familles « Structure du projet » et « Suivi et pilotage », objet choisi
     sur fond bleu nuit, bouton orange « Continuer ». Flèche : retour à Jev ; × : fermeture de la barre latérale ;
   - **formulaire** de l'objet choisi, qui glisse depuis la droite à la place du choix de l'objet (0,42 s, fondu) ; flèche :
     retour au choix de l'objet (glissement inverse, focus dans la liste des objets) ; × et « Annuler » : formulaire vidé.
3. **Deux modèles de formulaire** :
   - « Parcours » (Phase, Chantier, Sous-phase, Jalon) : étapes numérotées, un seul champ ouvert, Entrée passe au suivant, coche
     turquoise et résumé des étapes remplies ;
   - « Chapitres » (Livrable, Risque, Action, Tâche, Décision, Fiche d'arbitrage) : trois chapitres par objet (`SSJ_CHAP`),
     résumé des chapitres fermés, bouton « Suivant ».
4. Anneau « requis remplis X/Y » ; « Créer … » grisé (opacité 0,4) tant qu'un requis manque ; création par l'API, message
   dans le panneau (« Phase 7 créée »), puis formulaire vidé.
5. **Fiche d'arbitrage** (maquette 11a, 10/10/2026) : après les chapitres Arbitrage et Contexte, « Composer la fiche » ouvre la
   fiche « barème commun » (composant Fiche arbitrage) à la place du formulaire ; son « Enregistrer » écrit la fiche de la
   décision ; la flèche ramène au formulaire.

Score d'une option : moyenne pondérée des critères qui ont un poids et une note, deux décimales, virgule. Criticité d'un risque :
P × I sur 16 (Critique ≥ 12, Majeure ≥ 6, Modérée ≥ 3).

## Composants

| Composant | Fichier | Rôle |
|---|---|---|
| Saisie sans Jev | `frontends/Saisie sans Jev.dc.html` | Panneaux ; moteur de champs générique piloté par `SSJ_F` (champs) et `SSJ_CHAP` (chapitres) |
| Champ de sélection | `frontends/Champ choix.dc.html` | Boîte (valeur, ou étiquettes tronquées « … » en choix multiple), liste dessous, fermée par un clic extérieur |
| Liste d'options | `frontends/Liste options.dc.html` | Choix simple (coche) ou multiple (cases), initiales d'une personne, « Transverse » exclusif ; clavier |
| Champ date | `frontends/Champ date.dc.html` | jj/mm/aaaa au clavier, « / » automatiques ; période début → fin ; date impossible en rouge |
| Échelle 1–4 | `frontends/Echelle 1-4.dc.html` | Probabilité, impact (chiffre et niveau) |
| Sélecteur segmenté | `frontends/Selecteur segmente.dc.html` | Statut, priorité (pastilles), option recommandée (point de suggestion) |
| Cycle de vie | `frontends/Cycle de vie.dc.html` | Brouillon → En instruction → À arbitrer → Arbitrée ; Annulée, Remplacée hors parcours |
| Fiche d'arbitrage | `frontends/Fiche arbitrage.dc.html` | Barème commun A / B (maquette 11a) : duel, échelle, grille, enregistrement |
| Calculs | `frontends/saisie-calc.js` | Score, poids, composition, comparaison et écart, criticité, dates — fonctions pures |

Écriture : `api.js` → `saisie(kind, values)` (routes `/phases`, `/subphases`, `/workstreams`, `/milestones`, `/deliverables`,
`/risks`, `/actions`, `/decisions`, `/tasks`, `PATCH /decisions/:id/arbitration`). Listes réelles : `ssjData()` dans
`RISE Cockpit.dc.html`.

Tests : `backend/test/unit/saisie-calc.spec.ts` (calculs), `backend/test/unit/arbitration.spec.ts`,
`backend/test/e2e/pilotage.spec.ts` ; recette navigateur `backend/test/browser/saisie.e2e.ts` (serveur de recette sur 3302).

## Extension du modèle de données (décision du commanditaire du 09/10/2026)

- **Action** : un ou plusieurs chantiers, ou transverse (`wsIds`, `allWs`) ; droits sur chacun des chantiers, transverse
  réservé au PMO. Les actions issues d'un risque reprennent ses chantiers.
- **Tâche** : responsable (`ownerId`), chantiers (`wsIds`, `allWs`), statuts À faire, En cours, Bloquée, Terminée.
- **Fiche d'arbitrage** : critères propres à chaque option (`options[].criteria`) du 09 au 10/10/2026 ; depuis le 10/10/2026,
  barème commun (critères et poids communs, notes et justifications par option, maquette 11a, `docs/DECISIONS.md`).

Migration `20261117000000_actions_taches_chantiers`.

## Écarts avec la maquette, justifiés

1. **Un seul panneau** (demande du commanditaire du 10/10/2026) au lieu des deux panneaux côte à côte de la maquette : le
   formulaire remplace le choix de l'objet, avec un glissement (supprimé si le système demande moins d'animations) ; largeur :
   400 px, celle de la barre latérale de Jev (380 px dans la maquette) ; hauteur : celle de l'écran (720 px dans la maquette).
2. **Ordre des objets** (arbitrage du 10/10/2026) : celui du commanditaire — Phase, Chantier, Sous-phase, Jalon ; Livrable,
   Risque, Action, Tâche, Décision, Fiche d'arbitrage.
3. **Couleurs** (arbitrage du 10/10/2026) : palette de la maquette pour « Saisir sans Jev » et ses composants seulement.
4. **Valeurs exigées par le serveur mais absentes du formulaire** (valeurs déduites) : phase du jalon = celle dont la période
   contient la date cible (sinon la première du chantier, puis du projet) ; responsable d'une phase = l'utilisateur s'il n'est
   pas choisi ; numéro d'une phase et code d'une sous-phase calculés par le serveur.
5. **Décision** : le serveur la rattache à un chantier ; « Transverse » ou aucun chantier sont refusés à l'enregistrement avec un
   message. « Option choisie » : 3 caractères au plus (serveur).
6. **Valeurs initiales** : les exemples de la maquette (Cédric SCHMITZ, R-014, D-005, A-021, listes de phases et de chantiers…)
   sont remplacés par les données du projet ; Responsable de l'action = l'utilisateur ; Chantier du risque = « Transverse » pour
   un PMO, vide sinon ; statut, priorité, probabilité et impact : valeurs par défaut de la maquette ; fiche d'arbitrage : un
   critère vide par option.
7. **« Transverse »** dans un choix multiple : exclusif (le cocher retire les autres chantiers, et inversement).
8. **Message après création** : celui du serveur, qui porte le code de l'objet (« Risque R14 créé »), au lieu de « Risque créé ».
9. **Refus du serveur ou enregistrement impossible** (non décrit par la maquette) : message en rouge à la place de « * Requis »,
   valeurs conservées ; « Création… » pendant l'envoi.
10. **Dates** : une date impossible (31/02/2027) ou une fin avant le début est écrite en rouge (`aria-invalid`) et bloque la
    création ; l'infobulle du bouton dit « À corriger : … » (sinon « Renseignez les champs requis », comme la maquette).
11. **Probabilité et impact** sur 1 à 4 (maquette) : le registre des risques garde son échelle de 1 à 5 ; un risque créé ici a
    donc une criticité au plus de 16 dans le registre.
12. **Chantier : « Période » requise** (demande du commanditaire du 09/10/2026) ; la maquette 5a la prévoit aussi.
13. **Livrable** : sous-phase, responsable et date de fin requis par le serveur (la maquette 5a les marque aussi requis) ; la
    sous-phase est choisie parmi celles de la phase (et du chantier s'il en a dans cette phase), retirée si la phase change.
14. **Droits** : les objets de structure relèvent du Référentiel (PMO) ; pour un autre profil, le serveur refuse et le message
    s'affiche dans le pied du formulaire.
15. **Accessibilité** (demandée par le brief) : liste des objets en `listbox` (`aria-activedescendant`), listes en `listbox` (flèches, Début / Fin, Entrée, Espace, Échap), échelles, statuts et cycle de vie en groupes de boutons
    radio (flèches), libellés reliés aux champs (`aria-labelledby`), anneau et jauge décrits (`role="img"`), messages annoncés
    (`role="status"`), contours de focus visibles ; chiffres et pastilles des étapes doublés par des boutons nommés.
16. **Sans recherche** (demande du commanditaire du 10/10/2026) : le bandeau affiche « Que voulez-vous créer ? » en titre, sans
    champ de saisie (la maquette en faisait un champ de recherche) ; la liste des objets reçoit le focus.
17. **Filet à gauche** (demandes du 10/10/2026) : pendant la saisie, le bandeau bleu nuit touche celui de la page (pas de filet) ;
    un trait fin (#e0e9e6, celui de la barre de Jev) borde la partie blanche : liste, pied et formulaire.
