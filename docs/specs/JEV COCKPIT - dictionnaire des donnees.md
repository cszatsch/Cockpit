# Cockpit — dictionnaire des données

> Généré depuis `backend/src/domain/jev-dictionnaire-cockpit.ts` (`npm run dictionnaire:doc`) : ne pas modifier à la main.
> 36 vues en lecture seule du schéma `jev_cockpit`, chargées dans `dictionnaire_tables` et `dictionnaire_colonnes`.
> Dates métier en texte AAAA-MM-JJ, horodatages en heure de Paris. Chaque vue porte projet_id (et chantier_id) pour le filtrage par droits ; aucun rôle de lecture n’y a accès tant que ce filtrage n’est pas en place.

## Sommaire

- [`jev_cockpit.projets`](#projets) — 19 colonnes
- [`jev_cockpit.infos_projet`](#infos_projet) — 7 colonnes
- [`jev_cockpit.references_planning`](#references_planning) — 8 colonnes
- [`jev_cockpit.lots`](#lots) — 10 colonnes
- [`jev_cockpit.phases`](#phases) — 15 colonnes
- [`jev_cockpit.sous_phases`](#sous_phases) — 13 colonnes
- [`jev_cockpit.chantiers`](#chantiers) — 14 colonnes
- [`jev_cockpit.chantiers_phases`](#chantiers_phases) — 3 colonnes
- [`jev_cockpit.chantiers_sous_phases`](#chantiers_sous_phases) — 3 colonnes
- [`jev_cockpit.chantiers_lots`](#chantiers_lots) — 3 colonnes
- [`jev_cockpit.dependances_chantiers`](#dependances_chantiers) — 3 colonnes
- [`jev_cockpit.avancements`](#avancements) — 9 colonnes
- [`jev_cockpit.jalons`](#jalons) — 12 colonnes
- [`jev_cockpit.livrables`](#livrables) — 11 colonnes
- [`jev_cockpit.equipes`](#equipes) — 5 colonnes
- [`jev_cockpit.roles`](#roles) — 5 colonnes
- [`jev_cockpit.personnes`](#personnes) — 9 colonnes
- [`jev_cockpit.affectations`](#affectations) — 6 colonnes
- [`jev_cockpit.instances`](#instances) — 7 colonnes
- [`jev_cockpit.membres_instances`](#membres_instances) — 4 colonnes
- [`jev_cockpit.risques`](#risques) — 14 colonnes
- [`jev_cockpit.risques_chantiers`](#risques_chantiers) — 4 colonnes
- [`jev_cockpit.problemes`](#problemes) — 13 colonnes
- [`jev_cockpit.actions`](#actions) — 13 colonnes
- [`jev_cockpit.decisions`](#decisions) — 17 colonnes
- [`jev_cockpit.seances`](#seances) — 10 colonnes
- [`jev_cockpit.modeles_rapport`](#modeles_rapport) — 11 colonnes
- [`jev_cockpit.rapports`](#rapports) — 13 colonnes
- [`jev_cockpit.barometre_releves`](#barometre_releves) — 9 colonnes
- [`jev_cockpit.barometre_domaines`](#barometre_domaines) — 7 colonnes
- [`jev_cockpit.mission`](#mission) — 7 colonnes
- [`jev_cockpit.budget_programme`](#budget_programme) — 3 colonnes
- [`jev_cockpit.documents`](#documents) — 12 colonnes
- [`jev_cockpit.liens_documents`](#liens_documents) — 4 colonnes
- [`jev_cockpit.commentaires`](#commentaires) — 9 colonnes
- [`jev_cockpit.habilitations`](#habilitations) — 6 colonnes

## projets

Projets pilotés dans le Cockpit : identité, client, dates, statut, date de mise en service (Go-Live) prévue, appréciation manuelle de santé. Écrans : Info projet, Aujourd’hui, Pilotage.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du projet (= projet_id des autres vues) |  |
| `code` | texte | Code du projet | RISE |
| `nom` | texte | Nom du projet |  |
| `client` | texte | Nom du client |  |
| `objectif` | texte | Objectif du projet |  |
| `statut` | texte | Statut | PREPARATION = préparation, ACTIVE = actif, CLOSED = clos |
| `date_debut` | texte | Date de début | AAAA-MM-JJ |
| `date_fin_cible` | texte | Date de fin visée | AAAA-MM-JJ |
| `date_golive_prevue` | texte | Date de mise en service (Go-Live) prévue | AAAA-MM-JJ |
| `directeur_programme_id` | texte | Directeur de programme → personnes.id |  |
| `sponsor_id` | texte | Sponsor → personnes.id |  |
| `equipe_editeur_id` | texte | Équipe de l’éditeur → equipes.id |  |
| `equipe_integrateur_id` | texte | Équipe de l’intégrateur → equipes.id |  |
| `ville` | texte | Ville |  |
| `pays` | texte | Pays |  |
| `devise` | texte | Devise des montants | EUR |
| `fuseau` | texte | Fuseau horaire du projet (date du jour) | Europe/Paris |
| `sante_manuelle` | texte | Appréciation manuelle de la santé du projet (null si aucune) |  |
| `sante_motif` | texte | Motif de l’appréciation manuelle |  |

**Relations**

- projets.id = projet_id de toutes les autres vues
- projets.directeur_programme_id, sponsor_id = personnes.id
- projets.equipe_editeur_id, equipe_integrateur_id = equipes.id

**Usages**

- Quand est le Go-Live ? Combien de jours restent ?
- Quel est le statut, le client, l’objectif du projet ?

**Règles et précautions**

- Compte à rebours du Go-Live = date_golive_prevue::date − date du jour (J-n ; J+n si dépassée) ; à défaut, la date du jalon de Go-Live (jalons).
- Fin de projet affichée = la plus grande date_fin des phases, sinon date_fin_cible.
- Aucune météo n’est calculée : la santé affichée est seulement l’appréciation manuelle (sante_manuelle).
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id). Le directeur de programme a accès au projet.

## infos_projet

Objet « Info projet » du Référentiel : contexte client et périmètre du projet (client, marques du groupe, programme en une phrase, enjeux stratégiques, périmètres fonctionnel, applicatif, géographique et juridique), une ligne par élément. Écrans : Info projet › Fiche projet, Référentiel › Info projet.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la ligne (projet:rubrique:rang) |  |
| `projet_id` | texte | Projet → projets.id |  |
| `rubrique` | texte | Rubrique de l’objet | Le client, Marques du groupe, Programme en une phrase, Enjeux stratégiques, Périmètre fonctionnel, Périmètre applicatif, Périmètre géographique, Périmètre juridique |
| `ordre_rubrique` | entier | Rang de la rubrique (1 à 8, ordre ci-dessus) |  |
| `ordre` | entier | Rang de l’élément dans sa rubrique (à partir de 1) |  |
| `libelle` | texte | Libellé (Le client, périmètres fonctionnel et applicatif) ; null pour les rubriques en liste | Raison sociale, Siège, Finance |
| `valeur` | texte | Valeur de l’élément (texte, marque, enjeu, pays, entité…) |  |

**Relations**

- infos_projet.projet_id = projets.id

**Usages**

- Quels sont les enjeux stratégiques du projet ?
- Quel est le périmètre géographique (pays) ou juridique (entités) ?
- Quelles marques du groupe sont concernées ?

**Règles et précautions**

- Ordre d’affichage = ordre_rubrique puis ordre. Nombre de pays = nombre de lignes de la rubrique « Périmètre géographique » ; nombre d’entités = celles de « Périmètre juridique ».
- Le programme en une phrase est une seule ligne ; les rubriques en liste n’ont pas de libellé.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## references_planning

Versions de la référence de planning (baseline) d’un projet : version, date de Go-Live de référence, approbation. Une seule est en vigueur.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `version` | texte | Version | v4, v5 |
| `date` | texte | Date de référence de la version | AAAA-MM-JJ |
| `approuvee_le` | texte | Date d’approbation | AAAA-MM-JJ |
| `approuvee_par_id` | texte | Approbateur → personnes.id |  |
| `motif` | texte | Motif du changement de référence |  |
| `en_vigueur` | booléen | Version en vigueur |  |

**Relations**

- references_planning.projet_id = projets.id

**Usages**

- Quelle est la référence de planning en vigueur, et la précédente ?

**Règles et précautions**

- Référence en vigueur = en_vigueur vrai ; la précédente = la plus récente des autres.
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## lots

Lots (vagues de déploiement) d’un projet, avec leurs dates et leur statut.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du lot |  |
| `projet_id` | texte | Projet → projets.id |  |
| `numero` | entier | Numéro du lot (affiché « Lot n ») |  |
| `nom` | texte | Nom du lot |  |
| `date_debut` | texte | Date de début | AAAA-MM-JJ |
| `date_fin` | texte | Date de fin | AAAA-MM-JJ |
| `precision_debut` | texte | Précision de la date de début | D = jour (JJ/MM/AAAA), M = mois (MM/AAAA), Y = année (AAAA) ; en M ou Y, la date stockée est le 1er jour (début) ou le dernier jour (fin) |
| `precision_fin` | texte | Précision de la date de fin | D, M, Y |
| `statut` | texte | Statut | PLANNED = prévu, IN_PROGRESS = en cours, DONE = terminé |
| `responsable_id` | texte | Responsable → personnes.id |  |

**Relations**

- lots.projet_id = projets.id
- lots.id = jalons.lot_id, chantiers_lots.lot_id

**Usages**

- Quels sont les lots et leurs dates ?
- Quel lot est en cours ?

**Règles et précautions**

- En cours = date_debut ≤ date du jour ≤ date_fin (les deux dates renseignées).
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## phases

Phases du planning d’un projet : dates, statut, avancement réel et prévu, criticité. Écrans : Pilotage › Planning.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la phase |  |
| `projet_id` | texte | Projet → projets.id |  |
| `ordre` | entier | Rang de la phase |  |
| `code` | texte | Code | 1, 2, 5 |
| `nom` | texte | Nom de la phase |  |
| `description` | texte | Description |  |
| `date_debut` | texte | Début (toujours renseigné) | AAAA-MM-JJ |
| `date_fin` | texte | Fin (toujours renseignée) | AAAA-MM-JJ |
| `precision_debut` | texte | Précision de la date de début | D = jour (JJ/MM/AAAA), M = mois (MM/AAAA), Y = année (AAAA) ; en M ou Y, la date stockée est le 1er jour (début) ou le dernier jour (fin) |
| `precision_fin` | texte | Précision de la date de fin | D, M, Y |
| `statut` | texte | Statut | PLANNED = prévue, IN_PROGRESS = en cours, DONE = terminée |
| `avancement_reel_pct` | entier | Avancement réel | en % |
| `avancement_prevu_force_pct` | entier | Avancement prévu saisi à la main (null : calculé) | en % |
| `critique` | booléen | Sur le chemin critique |  |
| `responsable_id` | texte | Responsable → personnes.id |  |

**Relations**

- phases.projet_id = projets.id
- phases.id = sous_phases.phase_id, jalons.phase_id, chantiers_phases.phase_id

**Usages**

- Quelle phase est en cours ?
- Quelles phases sont en retard sur leur avancement prévu ?
- Chemin critique.

**Règles et précautions**

- Avancement prévu = avancement_prevu_force_pct s’il est renseigné ; sinon 0 si une date manque ; sinon round(clamp((date du jour − date_debut) / max(1, date_fin − date_debut), 0, 1) × 100). Avancement réel = avancement_reel_pct.
- En cours = date_debut ≤ date du jour ≤ date_fin (les deux dates renseignées).
- Retard d’avancement = avancement prévu − avancement réel > 0.
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## sous_phases

Sous-phases d’une phase : dates, statut, avancement, criticité. Les utilisateurs les appellent souvent « tâches ». Numérotation libre (le code ne désigne ni la phase ni le chantier). Chaque sous-phase est rattachée à un ou plusieurs chantiers précis : chantiers_sous_phases.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la sous-phase |  |
| `projet_id` | texte | Projet → projets.id |  |
| `phase_id` | texte | Phase → phases.id |  |
| `code` | texte | Code | 5.2, 5.3 |
| `nom` | texte | Nom de la sous-phase |  |
| `description` | texte | Description |  |
| `date_debut` | texte | Début (null possible) | AAAA-MM-JJ |
| `date_fin` | texte | Fin (null possible) | AAAA-MM-JJ |
| `statut` | texte | Statut | PLANNED = prévue, IN_PROGRESS = en cours, DONE = terminée |
| `avancement_reel_pct` | entier | Avancement réel | en % |
| `avancement_prevu_force_pct` | entier | Avancement prévu saisi à la main | en % |
| `critique` | booléen | Sur le chemin critique |  |
| `responsable_id` | texte | Responsable → personnes.id |  |

**Relations**

- sous_phases.phase_id = phases.id
- sous_phases.id = livrables.sous_phase_id, jalons.sous_phase_id, chantiers_sous_phases.sous_phase_id

**Usages**

- Chemin critique détaillé.
- Sous-phases en cours.
- Sous-phases (tâches) par chantier : jointure avec chantiers_sous_phases.

**Règles et précautions**

- Avancement prévu = avancement_prevu_force_pct s’il est renseigné ; sinon 0 si une date manque ; sinon round(clamp((date du jour − date_debut) / max(1, date_fin − date_debut), 0, 1) × 100). Avancement réel = avancement_reel_pct.
- En cours = date_debut ≤ date du jour ≤ date_fin (les deux dates renseignées).
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).
- Chantier d’une sous-phase : uniquement par chantiers_sous_phases (sous_phase_id → chantier_id). Jamais par la phase : une phase est partagée par plusieurs chantiers, chantiers_phases donnerait tous les chantiers de la phase.

## chantiers

Chantiers (workstreams) d’un projet : responsable, dates, avancement. Le chantier est l’unité des droits des Responsables et des Lecteurs.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du chantier (= chantier_id des autres vues) |  |
| `projet_id` | texte | Projet → projets.id |  |
| `code` | texte | Code | C1 … C8 (C8 porte le baromètre) |
| `ordre` | entier | Rang |  |
| `nom` | texte | Nom du chantier |  |
| `description` | texte | Description |  |
| `responsable_id` | texte | Responsable → personnes.id |  |
| `statut` | texte | Statut | ACTIVE = actif, CLOSED = clos |
| `date_debut` | texte | Date de début | AAAA-MM-JJ |
| `date_fin` | texte | Date de fin | AAAA-MM-JJ |
| `avancement_reel_pct` | entier | Avancement réel | en % |
| `avancement_prevu_force_pct` | entier | Avancement prévu saisi à la main | en % |
| `critique` | booléen | Chantier critique |  |
| `depend_de_tous` | booléen | Dépend de tous les autres chantiers (« Tous ») |  |

**Relations**

- chantiers.projet_id = projets.id
- chantiers.id = chantier_id des vues risques, problemes, actions, decisions, avancements, jalons, livrables, habilitations, chantiers_phases, chantiers_sous_phases

**Usages**

- Qui est responsable de quel chantier ?
- Chantiers en retard d’avancement.

**Règles et précautions**

- Avancement prévu = avancement_prevu_force_pct s’il est renseigné ; sinon 0 si une date manque ; sinon round(clamp((date du jour − date_debut) / max(1, date_fin − date_debut), 0, 1) × 100). Avancement réel = avancement_reel_pct.
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : le Cockpit affiche la liste de tous les chantiers du projet ; leur contenu (risques, actions…) est filtré par chantier.

## chantiers_phases

Phases couvertes par chaque chantier.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `projet_id` | texte | Projet → projets.id |  |
| `chantier_id` | texte | Chantier → chantiers.id |  |
| `phase_id` | texte | Phase → phases.id |  |

**Relations**

- chantiers_phases.chantier_id = chantiers.id
- chantiers_phases.phase_id = phases.id

**Usages**

- Quels chantiers travaillent sur telle phase ?

**Règles et précautions**

- Droits : visible de tout utilisateur habilité sur le projet (projet_id).
- Ne sert pas à trouver le chantier d’une sous-phase : une phase est partagée par plusieurs chantiers. Pour les sous-phases, utiliser chantiers_sous_phases.

## chantiers_sous_phases

Sous-phases couvertes par chaque chantier (06/10/2026) ; chacune appartient à l’une des phases du chantier. Un chantier sans ligne : sous-phases non précisées.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `projet_id` | texte | Projet → projets.id |  |
| `chantier_id` | texte | Chantier → chantiers.id |  |
| `sous_phase_id` | texte | Sous-phase → sous_phases.id |  |

**Relations**

- chantiers_sous_phases.chantier_id = chantiers.id
- chantiers_sous_phases.sous_phase_id = sous_phases.id

**Usages**

- Sur quelles sous-phases (tâches) travaille tel chantier ?
- Quels chantiers interviennent dans telle sous-phase ?
- Par chantier, sous-phases en retard de démarrage, en cours ou à venir.

**Règles et précautions**

- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## chantiers_lots

Lots concernés par chaque chantier.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `projet_id` | texte | Projet → projets.id |  |
| `chantier_id` | texte | Chantier → chantiers.id |  |
| `lot_id` | texte | Lot → lots.id |  |

**Relations**

- chantiers_lots.chantier_id = chantiers.id
- chantiers_lots.lot_id = lots.id

**Usages**

- Quels chantiers participent à tel lot ?

**Règles et précautions**

- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## dependances_chantiers

Dépendances entre chantiers : le chantier dépend d’un autre chantier.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `projet_id` | texte | Projet → projets.id |  |
| `chantier_id` | texte | Chantier dépendant → chantiers.id |  |
| `depend_de_id` | texte | Chantier dont il dépend → chantiers.id |  |

**Relations**

- dependances_chantiers.chantier_id, depend_de_id = chantiers.id

**Usages**

- De quels chantiers dépend tel chantier ?

**Règles et précautions**

- Un chantier avec depend_de_tous (chantiers) dépend de tous les autres, sans ligne ici.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## avancements

Bloc « Avancement » par chantier : valeur réelle et cible en %, avec son signal (en bonne voie, vigilance, en risque). Écrans : Aujourd’hui, Pilotage.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `chantier_id` | texte | Chantier → chantiers.id |  |
| `libelle` | texte | Libellé de l’indicateur |  |
| `reel_pct` | entier | Valeur réelle | en % |
| `cible_pct` | entier | Valeur cible | en % |
| `detail` | texte | Commentaire |  |
| `responsable_id` | texte | Responsable → personnes.id |  |
| `confirme_le` | date-heure | Dernière confirmation de la valeur (heure de Paris) |  |

**Relations**

- avancements.chantier_id = chantiers.id

**Usages**

- Quels chantiers sont en risque sur leur avancement ?

**Règles et précautions**

- Signal : écart = reel_pct − cible_pct ; RISK (en risque) si écart < −20 ; WATCH (vigilance) si écart < 0 ; OK (en bonne voie) sinon.
- Fraîcheur : ALERT si la dernière confirmation date de plus de 14 jours, WATCH si plus de 7 jours, OK sinon.
- Droits : le PMO voit tout le projet ; un Responsable ou un Lecteur ne voit que les lignes dont chantier_id fait partie de ses chantiers (habilitations).

## jalons

Jalons du planning : date prévue, date de référence, confirmation. Écrans : Pilotage › Jalons, Aujourd’hui (échéancier).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du jalon | J08 |
| `projet_id` | texte | Projet → projets.id |  |
| `code` | texte | Code | J01 … J08 |
| `libelle` | texte | Libellé | Go-Live Lot 1 |
| `phase_id` | texte | Phase → phases.id |  |
| `sous_phase_id` | texte | Sous-phase → sous_phases.id |  |
| `chantier_id` | texte | Chantier → chantiers.id (null : jalon de projet) |  |
| `lot_id` | texte | Lot → lots.id |  |
| `responsable_id` | texte | Responsable → personnes.id |  |
| `date_prevue` | texte | Date prévue actuelle | AAAA-MM-JJ |
| `date_reference` | texte | Date de la référence de planning | AAAA-MM-JJ |
| `confirme_le` | date-heure | Dernière confirmation de la date (heure de Paris ; null : jamais) |  |

**Relations**

- jalons.phase_id = phases.id
- jalons.chantier_id = chantiers.id
- jalons.lot_id = lots.id

**Usages**

- Prochains jalons.
- Jalons en glissement par rapport à la référence.
- Jalons non confirmés.

**Règles et précautions**

- Écart à la référence (jours) = date_prevue::date − date_reference::date ; 0 = conforme ; positif = glissement.
- État : passé si date_prevue < date du jour ; « prochain » = le premier jalon (trié par date_prevue puis code) avec date_prevue ≥ date du jour ; à venir pour les suivants.
- Jours depuis la confirmation = date du jour − date de confirme_le (0 si jamais confirmé). Anomalie « jalon non confirmé » : jalon à venir (date_prevue ≥ date du jour) non confirmé depuis plus de 7 jours (vigilance), plus de 14 jours (blocage).
- Étiquette de l’échéancier : À REVOIR si non confirmé depuis plus de 14 jours ; sinon EN RETARD si l’écart à la référence est positif ; sinon DANS LES TEMPS.
- Jalon hors période : date_prevue avant le début ou après la fin de sa phase (avertissement).
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : un jalon sans chantier_id est visible de tout le projet ; sinon, règle des chantiers (PMO : tout ; Responsable / Lecteur : ses chantiers).

## livrables

Livrables du projet : sous-phase, chantier, échéance, avancement et risque (maîtrisé, sous tension, critique). Écran : Pilotage › Livrables.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du livrable |  |
| `projet_id` | texte | Projet → projets.id |  |
| `nom` | texte | Nom du livrable |  |
| `sous_phase_id` | texte | Sous-phase → sous_phases.id |  |
| `chantier_id` | texte | Chantier → chantiers.id (facultatif) |  |
| `responsable_id` | texte | Responsable → personnes.id |  |
| `date_debut` | texte | Début (null : début de la sous-phase) | AAAA-MM-JJ |
| `echeance` | texte | Échéance | AAAA-MM-JJ |
| `avancement_pct` | entier | Avancement | en % |
| `risque_force` | texte | Risque saisi à la main (null : calculé) | OK = maîtrisé, TENSION = sous tension, CRITICAL = critique |
| `equipe` | texte | Équipe réalisatrice (libellé) |  |

**Relations**

- livrables.sous_phase_id = sous_phases.id
- livrables.chantier_id = chantiers.id

**Usages**

- Livrables en retard ou critiques.
- Livrables à échéance dans les 30 jours.
- Taux de livrables terminés.

**Règles et précautions**

- Dates effectives : début = COALESCE(date_debut, début de la sous-phase) ; échéance = COALESCE(echeance, fin de la sous-phase, début + 120 jours).
- Statut : terminé si avancement_pct ≥ 100 ; en retard si date du jour > échéance ; actif si (début renseigné et date du jour ≥ début) ou avancement_pct > 0 ; à venir sinon.
- Risque = risque_force s’il est renseigné ; sinon : en retard → critique ; statut autre qu’actif → maîtrisé ; actif : écoulé = clamp((date du jour − début) / max(1, échéance − début), 0, 1), écart = écoulé × 100 − avancement_pct ; critique si écart > 18, sous tension si écart > 6, maîtrisé sinon.
- À échéance dans les 30 jours = non terminé et date du jour ≤ échéance ≤ date du jour + 30. Taux terminé = round(terminés / total × 100).
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : les livrables sont visibles de tout le projet (pas de filtre par chantier dans le Cockpit).

## equipes

Équipes du projet (client, AMOA, intégrateur…).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de l’équipe |  |
| `projet_id` | texte | Projet → projets.id |  |
| `nom` | texte | Nom de l’équipe |  |
| `description` | texte | Description |  |
| `type` | texte | Organisation | CLIENT, AMOA, INTEGRATOR = intégrateur, OTHER = autre |

**Relations**

- equipes.id = personnes.equipe_id

**Usages**

- Effectif par équipe.

**Règles et précautions**

- Effectif d’une équipe = nombre de personnes actives de l’équipe.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## roles

Rôles du projet (organigramme) : libellé et niveau.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du rôle |  |
| `projet_id` | texte | Projet → projets.id |  |
| `libelle` | texte | Libellé du rôle | Chef de projet, PMO |
| `description` | texte | Description |  |
| `niveau` | entier | Niveau dans l’organigramme | 0 (direction) à 3 |

**Relations**

- roles.id = affectations.role_id

**Usages**

- Qui occupe tel rôle ?

**Règles et précautions**

- Effectif d’un rôle = personnes actives distinctes ayant une affectation active sur ce rôle.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## personnes

Personnes de l’équipe projet (Référentiel) : identité, équipe, fonction. Une ligne par personne et par projet.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la personne (= responsable_id, decideur_id… des autres vues) |  |
| `projet_id` | texte | Projet → projets.id |  |
| `prenom` | texte | Prénom |  |
| `nom` | texte | Nom de famille |  |
| `email` | texte | Adresse e-mail (unique dans le projet) |  |
| `equipe_id` | texte | Équipe → equipes.id |  |
| `fonction` | texte | Fonction dans le projet |  |
| `active` | booléen | Personne active dans le projet |  |
| `chantiers_affiches` | liste de textes | Chantiers de rattachement affichés (ne donnent aucun droit) |  |

**Relations**

- personnes.id = responsable_id, decideur_id, approuvee_par_id, relecteur_id, valideur_id… des autres vues
- personnes.equipe_id = equipes.id

**Usages**

- Nom d’un responsable (joindre sur responsable_id).
- Charge par personne : actions, risques ouverts.

**Règles et précautions**

- Afficher « prénom nom » plutôt que l’identifiant ; joindre sur le même projet_id.
- Porteur sans affectation active = personne sans affectation active qui porte au moins un objet ouvert (jalon à venir, action non terminée, risque non clos, problème non résolu, décision en cours, livrable < 100 %, chantier actif).
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## affectations

Affectations des personnes aux rôles du projet, avec leurs dates.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `personne_id` | texte | Personne → personnes.id |  |
| `role_id` | texte | Rôle → roles.id |  |
| `date_debut` | texte | Date de début | AAAA-MM-JJ |
| `date_fin` | texte | Fin (null : sans fin) | AAAA-MM-JJ |

**Relations**

- affectations.personne_id = personnes.id
- affectations.role_id = roles.id

**Usages**

- Qui est affecté à quel rôle aujourd’hui ?
- Affectations sans date de fin.

**Règles et précautions**

- Affectation active = date_debut ≤ date du jour et (date_fin null ou date_fin ≥ date du jour).
- « Fin manquante » : date_fin null pour une personne d’une équipe qui n’est pas CLIENT.
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## instances

Instances de gouvernance (COPIL, COPROJ…) : niveau, fréquence.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de l’instance | g1 |
| `projet_id` | texte | Projet → projets.id |  |
| `nom` | texte | Nom de l’instance | Comité de pilotage |
| `sigle` | texte | Sigle | COPIL, COPROJ |
| `frequence` | texte | Fréquence | DAILY = quotidienne, WEEKLY = hebdomadaire, BIWEEKLY = bimensuelle, MONTHLY = mensuelle, QUARTERLY = trimestrielle, SEMIANNUAL = semestrielle, ON_DEMAND = à la demande |
| `niveau` | texte | Niveau | STRATEGIC = stratégique, STEERING = pilotage, OPERATIONAL = opérationnel, OFF_CYCLE = hors cycle |
| `description` | texte | Description |  |

**Relations**

- instances.id = seances.instance_id, decisions.instance_id, membres_instances.instance_id

**Usages**

- Quelles instances, à quelle fréquence ?

**Règles et précautions**

- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## membres_instances

Membres de chaque instance et leur rôle.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `projet_id` | texte | Projet → projets.id |  |
| `instance_id` | texte | Instance → instances.id |  |
| `personne_id` | texte | Membre → personnes.id |  |
| `role` | texte | Rôle dans l’instance | CHAIR = président, MEMBER = membre, SECRETARY = secrétaire, GUEST = invité |

**Relations**

- membres_instances.instance_id = instances.id
- membres_instances.personne_id = personnes.id

**Usages**

- Qui siège au COPIL ?

**Règles et précautions**

- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## risques

Registre des risques : probabilité, impact, criticité, plan de mitigation, porteur, chantier. Écran : Pilotage › Risques.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `code` | texte | Code | R01, R05 |
| `libelle` | texte | Libellé du risque |  |
| `probabilite` | entier | Probabilité | 1 à 5 |
| `impact` | entier | Impact | 1 à 5 |
| `criticite` | entier | Criticité = probabilité × impact | 1 à 25 |
| `plan_mitigation` | texte | Plan de mitigation (null ou vide : aucun) |  |
| `responsable_id` | texte | Porteur → personnes.id |  |
| `chantier_id` | texte | Chantier principal (le premier cité) → chantiers.id ; null pour un risque transverse |  |
| `echeance` | texte | Échéance | AAAA-MM-JJ |
| `statut` | texte | Statut | OPEN = ouvert, MITIGATING = en mitigation, CLOSED = clos |
| `chantier_ids` | liste de textes | Chantiers concernés (un ou plusieurs) → chantiers.id ; vide pour un risque transverse |  |
| `transverse` | booléen | Risque transverse : concerne tous les chantiers du projet |  |

**Relations**

- risques.chantier_id = chantiers.id (chantier principal)
- risques.id = risques_chantiers.risque_id (tous les chantiers concernés)
- risques.responsable_id = personnes.id
- risques.id = problemes.risque_origine_id

**Usages**

- Risques critiques ouverts.
- Risques critiques sans plan de mitigation.
- Matrice probabilité × impact.

**Règles et précautions**

- Niveau : critique si criticite ≥ 20 ; élevé si ≥ 12 ; modéré si ≥ 6 ; faible sinon.
- Risque ouvert = statut autre que CLOSED.
- Anomalie bloquante « risque critique sans plan » : ouvert, criticite ≥ 20 et plan_mitigation null ou vide.
- Un risque concerne un ou plusieurs chantiers, ou tous (transverse). Risques d’un chantier : par risques_chantiers (un risque transverse y figure pour chaque chantier), jamais par risques.chantier_id seul.
- Droits : le PMO voit tout le projet ; un Responsable ou un Lecteur ne voit que les lignes dont chantier_id fait partie de ses chantiers (habilitations).

## risques_chantiers

Chantiers concernés par chaque risque (08/10/2026) : une ligne par risque et par chantier ; un risque transverse a une ligne pour chacun des chantiers du projet.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `projet_id` | texte | Projet → projets.id |  |
| `risque_id` | texte | Risque → risques.id |  |
| `chantier_id` | texte | Chantier concerné → chantiers.id |  |
| `transverse` | booléen | Ligne issue d’un risque transverse (tous les chantiers) |  |

**Relations**

- risques_chantiers.risque_id = risques.id
- risques_chantiers.chantier_id = chantiers.id

**Usages**

- Risques d’un chantier (y compris les risques transverses).
- Nombre de risques critiques par chantier.

**Règles et précautions**

- Droits : le PMO voit tout le projet ; un Responsable ou un Lecteur ne voit que les lignes dont chantier_id fait partie de ses chantiers (habilitations).

## problemes

Problèmes (risques avérés) : gravité, porteur, chantier, date cible de résolution.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `code` | texte | Code | P01 |
| `libelle` | texte | Libellé du problème |  |
| `gravite` | entier | Gravité | 1 à 5 |
| `risque_origine_id` | texte | Risque d’origine → risques.id |  |
| `ouvert_le` | texte | Date d’ouverture | AAAA-MM-JJ |
| `responsable_id` | texte | Porteur → personnes.id |  |
| `chantier_id` | texte | Chantier → chantiers.id |  |
| `date_cible` | texte | Date cible de résolution (celle de la séance cible si elle est renseignée) | AAAA-MM-JJ |
| `seance_cible_id` | texte | Séance cible → seances.id |  |
| `detail` | texte | Détail |  |
| `statut` | texte | Statut | OPEN = ouvert, RESOLVING = en résolution, RESOLVED = résolu |

**Relations**

- problemes.chantier_id = chantiers.id
- problemes.risque_origine_id = risques.id
- problemes.seance_cible_id = seances.id

**Usages**

- Problèmes ouverts par gravité.
- Problèmes dont la date cible est dépassée.

**Règles et précautions**

- Problème ouvert = statut autre que RESOLVED.
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : le PMO voit tout le projet ; un Responsable ou un Lecteur ne voit que les lignes dont chantier_id fait partie de ses chantiers (habilitations).

## actions

Plan d’actions : porteur, chantier, échéance, statut, priorité, origine. Écrans : Pilotage › Actions, Aujourd’hui (mes tâches).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `code` | texte | Code | A-01, A-45 |
| `libelle` | texte | Libellé de l’action |  |
| `detail` | texte | Détail |  |
| `responsable_id` | texte | Porteur → personnes.id |  |
| `chantier_id` | texte | Chantier → chantiers.id |  |
| `echeance` | texte | Échéance (null : sans échéance) | AAAA-MM-JJ |
| `statut` | texte | Statut | OPEN = à faire, IN_PROGRESS = en cours, BLOCKED = bloquée, DONE = terminée |
| `priorite` | texte | Priorité | HIGH = haute, MEDIUM = moyenne, LOW = basse |
| `origine_type` | texte | Type de l’objet d’origine | RISK, ISSUE, MILESTONE, DECISION |
| `origine_id` | texte | Objet d’origine (risques.id, problemes.id, jalons.id ou decisions.id selon origine_type) |  |
| `terminee_le` | texte | Date de passage à « terminée » (effacée à la réouverture) | AAAA-MM-JJ |

**Relations**

- actions.chantier_id = chantiers.id
- actions.responsable_id = personnes.id

**Usages**

- Actions en retard, par porteur ou par chantier.
- Actions de la semaine.
- Actions bloquées.

**Règles et précautions**

- Action en retard = statut ≠ DONE et echeance non null et echeance < date du jour (anomalie bloquante).
- Action ouverte = statut ≠ DONE.
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : le PMO voit tout le projet ; un Responsable ou un Lecteur ne voit que les lignes dont chantier_id fait partie de ses chantiers (habilitations).

## decisions

Registre des décisions : intitulé, statut (brouillon → arbitrée), instance, décideur, séance prévue, décision retenue. Écran : Comités › Décisions.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `code` | texte | Code | D-001, D-007 |
| `intitule` | texte | Intitulé de la question à trancher |  |
| `priorite` | entier | Priorité | 1 (haute) à 4 |
| `statut` | texte | Statut | DRAFT = brouillon, IN_REVIEW = en instruction, TO_ARBITRATE = à arbitrer, ARBITRATED = arbitrée, CANCELLED = annulée, SUPERSEDED = remplacée |
| `creee_le` | texte | Date de création | AAAA-MM-JJ |
| `decidee_le` | texte | Date de la décision (posée à la clôture) | AAAA-MM-JJ |
| `chantier_id` | texte | Chantier → chantiers.id |  |
| `instance_id` | texte | Instance qui arbitre → instances.id |  |
| `decision` | texte | Texte de la décision retenue (obligatoire si arbitrée) |  |
| `decideur_id` | texte | Décideur → personnes.id |  |
| `impact` | texte | Impact de la décision |  |
| `remplace_id` | texte | Décision remplacée → decisions.id |  |
| `seance_prevue_id` | texte | Séance où elle doit être arbitrée → seances.id |  |
| `fiche_complete` | booléen | Fiche d’arbitrage complète (options, critères, recommandation) |  |
| `option_retenue` | texte | Option retenue | A, B |

**Relations**

- decisions.chantier_id = chantiers.id
- decisions.instance_id = instances.id
- decisions.seance_prevue_id = seances.id
- decisions.decideur_id = personnes.id

**Usages**

- Décisions à arbitrer au prochain COPIL.
- Décisions prises depuis la dernière séance.
- Validations en attente d’un décideur.

**Règles et précautions**

- Décision en cours = statut DRAFT, IN_REVIEW ou TO_ARBITRATE. Décision close = ARBITRATED, CANCELLED ou SUPERSEDED.
- Validations d’une personne (écran Aujourd’hui) = décisions TO_ARBITRATE dont elle est le décideur.
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : le PMO voit tout le projet ; un Responsable ou un Lecteur ne voit que les lignes dont chantier_id fait partie de ses chantiers (habilitations).

## seances

Séances des instances (COPIL n°20…) : date, heure, lieu, statut, participants, rapport. Écran : Comités et rapports.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant de la séance |  |
| `projet_id` | texte | Projet → projets.id |  |
| `instance_id` | texte | Instance → instances.id |  |
| `numero` | entier | Numéro de la séance dans l’instance | 20, 21 |
| `date` | texte | Date | AAAA-MM-JJ |
| `heure` | texte | Heure | 14:00 |
| `lieu` | texte | Lieu |  |
| `statut` | texte | Statut | PLANNED = planifiée, HELD = tenue, CANCELLED = annulée |
| `participants` | liste de textes | Participants (identifiants → personnes.id) |  |
| `rapport_id` | texte | Rapport de la séance → rapports.id |  |

**Relations**

- seances.instance_id = instances.id
- seances.rapport_id = rapports.id
- seances.id = decisions.seance_prevue_id, rapports.seance_id

**Usages**

- Prochain COPIL.
- Séances à confirmer.
- Historique des séances.

**Règles et précautions**

- Prochaine séance d’une instance = statut PLANNED et date ≥ date du jour, la plus proche. Le « prochain COPIL » est la prochaine séance de l’instance de sigle COPIL (à défaut, de la première instance de niveau STRATEGIC), triée par date puis heure.
- Séance à confirmer = statut PLANNED et date ≤ date du jour.
- Libellé : sigle ou nom de l’instance + « n° » + numero.
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## modeles_rapport

Modèles (templates) de rapport de comité : instance, auteur, version, nombre de pages, publication.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du modèle |  |
| `projet_id` | texte | Projet → projets.id |  |
| `nom` | texte | Nom du modèle |  |
| `instance_id` | texte | Instance → instances.id |  |
| `auteur_id` | texte | Auteur → personnes.id |  |
| `auteur` | texte | Auteur (libellé) |  |
| `version` | texte | Version du modèle | v2 |
| `description` | texte | Description |  |
| `pages` | entier | Nombre de pages |  |
| `publie_le` | texte | Date de publication | AAAA-MM-JJ |
| `actif` | booléen | Modèle actif (utilisable pour générer un rapport) |  |

**Relations**

- modeles_rapport.instance_id = instances.id
- modeles_rapport.id = rapports.modele_id

**Usages**

- Modèles actifs par instance.

**Règles et précautions**

- Pages = 1 + somme des poids des sections (synthèse 2, planning 3, jalons 2, risques 3, décisions 2, actions 2, baromètre 2, tableau de bord 2, budget 2).
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## rapports

Rapports de comité générés : séance, version, statut (brouillon, relecture, publié), date des données capturées.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du rapport |  |
| `projet_id` | texte | Projet → projets.id |  |
| `modele_id` | texte | Modèle → modeles_rapport.id |  |
| `seance_id` | texte | Séance → seances.id |  |
| `nom` | texte | Nom du rapport |  |
| `version` | texte | Version | v1, v2 |
| `statut` | texte | Statut | DRAFT = brouillon, IN_REVIEW = en relecture, PUBLISHED = publié |
| `genere_le` | date-heure | Génération (heure de Paris) |  |
| `date_reporting` | texte | Date de reporting | AAAA-MM-JJ |
| `capture_le` | date-heure | Capture des données du rapport (heure de Paris) |  |
| `relecteur_id` | texte | Relecteur → personnes.id |  |
| `valideur_id` | texte | Valideur → personnes.id |  |
| `destinataires` | texte | Destinataires |  |

**Relations**

- rapports.seance_id = seances.id
- rapports.modele_id = modeles_rapport.id

**Usages**

- Le support du prochain comité est-il prêt ?
- Rapports en relecture.

**Règles et précautions**

- Anomalie « changements depuis la capture » : objets modifiés (journal) après capture_le du dernier rapport.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## barometre_releves

Relevés mensuels du baromètre des équipes : note globale, répondants, sentiment, thèmes.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `mois` | texte | Mois du relevé | AAAA-MM |
| `note_globale` | décimal | Note globale | sur 10, 1 décimale |
| `repondants` | entier | Nombre de répondants |  |
| `sentiment_positif_pct` | décimal | Part de sentiment positif | en % (les trois parts font 100) |
| `sentiment_neutre_pct` | décimal | Part de sentiment neutre | en % |
| `sentiment_negatif_pct` | décimal | Part de sentiment négatif | en % |
| `themes` | json | Thèmes du relevé et leur tendance |  |

**Relations**

- barometre_releves.projet_id = projets.id

**Usages**

- Évolution de la note globale.
- Sentiment du dernier relevé.

**Règles et précautions**

- Dernier relevé = mois le plus récent.
- Saisie réservée au chantier C8 ; lecture : tout le projet.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## barometre_domaines

Domaines du baromètre : effectif, répondants, notes par mois.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `domaine` | texte | Nom du domaine |  |
| `effectif` | entier | Effectif du domaine |  |
| `repondants` | entier | Répondants |  |
| `plage` | texte | Plage de la dernière note |  |
| `notes_par_mois` | json | Notes par mois | {"2026-08": 6.1, "2026-09": null} |

**Relations**

- barometre_domaines.projet_id = projets.id

**Usages**

- Domaines en baisse.

**Règles et précautions**

- Lire une note : (notes_par_mois->>'AAAA-MM')::float ; null = pas de note ce mois.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## mission

Périodes de la mission (budget) : montants AMOA et sous-traitance, statut de facturation. Module Budget.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `periode` | texte | Période (libellé libre, pas une date) |  |
| `montant_amoa` | décimal | Montant AMOA | dans la devise du projet |
| `montant_sous_traitance` | décimal | Montant de sous-traitance | dans la devise du projet |
| `total` | décimal | Total de la période = AMOA + sous-traitance |  |
| `statut` | texte | Statut | INVOICED = facturé, IN_PROGRESS = en cours, NEGOTIATION = en négociation |

**Relations**

- mission.projet_id = projets.id

**Usages**

- Montant facturé, en cours, en négociation.

**Règles et précautions**

- Visible seulement si le module Budget est actif pour le projet.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## budget_programme

Budget du programme : connu ou non, et pourquoi.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `projet_id` | texte | Projet → projets.id |  |
| `connu` | booléen | Budget du programme renseigné |  |
| `motif` | texte | Motif si le budget n’est pas connu |  |

**Relations**

- budget_programme.projet_id = projets.id

**Usages**

- Le budget est-il connu ?

**Règles et précautions**

- Anomalie « budget non renseigné » : connu faux.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).

## documents

Base de connaissance : documents du projet (type, version, confidentialité, état de l’extraction).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant du document |  |
| `projet_id` | texte | Projet → projets.id |  |
| `nom` | texte | Titre du document |  |
| `type` | texte | Type | Compte rendu, Livrable, Support de comité, Contractuel |
| `date` | texte | Date du document | AAAA-MM-JJ |
| `version` | texte | Version | v1, v2 |
| `confidentialite` | texte | Confidentialité | INTERNAL = interne, RESTRICTED = restreint |
| `origine` | texte | Origine | UPLOADED = déposé, GENERATED = généré |
| `extraction` | texte | État de l’extraction du texte | PENDING = traitement en cours, SUCCEEDED = extrait et indexé, PARTIAL = partiel, UNSUPPORTED = non exploitable, FAILED = traitement en échec |
| `pages` | entier | Nombre de pages |  |
| `taille_octets` | entier | Taille | en octets |
| `objets_lies` | texte | Objets liés (libellé) |  |

**Relations**

- documents.id = liens_documents.document_id

**Usages**

- Derniers documents déposés.
- Documents d’une séance ou d’un risque (via liens_documents).

**Règles et précautions**

- Droits : visible de tout le projet, sauf confidentialite = RESTRICTED, réservé au PMO et à l’administrateur.
- Les dates sont du texte AAAA-MM-JJ : comparer comme du texte, ou convertir avec ::date pour calculer un écart en jours.

## liens_documents

Liens entre documents et objets du projet (risque, action, décision, jalon, livrable, séance, rapport…).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `projet_id` | texte | Projet → projets.id |  |
| `document_id` | texte | Document → documents.id |  |
| `type_objet` | texte | Type d’objet lié | RISK, ISSUE, ACTION, DECISION, MILESTONE, DELIVERABLE, SESSION, REPORT, PROJECT, WORKSTREAM |
| `objet_id` | texte | Identifiant de l’objet lié (dans la vue de son type) |  |

**Relations**

- liens_documents.document_id = documents.id
- liens_documents.objet_id = risques.id, actions.id, decisions.id, jalons.id, livrables.id, seances.id, rapports.id… selon type_objet

**Usages**

- Documents liés à un objet.

**Règles et précautions**

- Droits : même règle que le document lié (visible de tout le projet, sauf document RESTRICTED : PMO et administrateur).

## commentaires

Commentaires posés sur les objets du Cockpit (collaboration) : texte, auteur, résolu ou non.

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `type_objet` | texte | Type d’objet commenté |  |
| `objet_id` | texte | Objet commenté |  |
| `texte` | texte | Texte du commentaire |  |
| `auteur_id` | texte | Auteur (personne ou compte) |  |
| `auteur` | texte | Nom de l’auteur |  |
| `resolu` | booléen | Commentaire résolu |  |
| `cree_le` | date-heure | Date du commentaire (heure de Paris) |  |

**Relations**

- commentaires.objet_id = identifiant de l’objet selon type_objet

**Usages**

- Commentaires non résolus.

**Règles et précautions**

- Droits : lisible seulement si l’objet commenté l’est (règle de son chantier).

## habilitations

Droits sur le projet : PMO (tout le projet), Responsable ou Lecteur (un chantier).

| Colonne | Type | Signification | Exemples, unités |
|---|---|---|---|
| `id` | texte | Identifiant |  |
| `projet_id` | texte | Projet → projets.id |  |
| `personne_id` | texte | Personne → personnes.id |  |
| `compte_id` | texte | Compte de connexion (si rattaché au compte) |  |
| `profil` | texte | Profil | PMO, RESPONSABLE, LECTEUR |
| `chantier_id` | texte | Chantier (Responsable, Lecteur) → chantiers.id ; null pour PMO |  |

**Relations**

- habilitations.personne_id = personnes.id
- habilitations.chantier_id = chantiers.id

**Usages**

- Qui est responsable de tel chantier ?
- Qui peut voir tel chantier ?

**Règles et précautions**

- Profil affiché = le plus fort : PMO > RESPONSABLE > LECTEUR. Le directeur de programme du projet a aussi accès.
- Droits : visible de tout utilisateur habilité sur le projet (projet_id).
