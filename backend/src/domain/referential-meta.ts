/**
 * Description des tables du Référentiel du Cockpit (libellé, colonnes, largeurs), commune à tous les projets
 * (07/10/2026) : un projet importé n'en avait pas (seul RISE la stockait, bloc « model.meta ») et son Référentiel
 * s'affichait sans libellés ni colonnes. Reprise du jeu de démonstration ; chantiers : début et fin en fin de ligne.
 */
export const REFERENTIAL_META: Record<string, { label: string; scope: string; constraints: unknown[]; cols: string[]; widths: string; sortable?: boolean }> = {
  CLIENT: {
    label: 'Client',
    scope: '',
    constraints: [],
    cols: ['code', 'nom', 'description', 'statut'],
    widths: '80px minmax(0,1fr) minmax(0,1.6fr) 90px',
  },
  PROJECT: {
    label: 'Projet',
    scope: '',
    constraints: [],
    cols: ['champ', 'valeur'],
    widths: '240px minmax(0,1fr)',
  },
  WAVE: {
    label: 'Lots',
    scope: '',
    constraints: [],
    cols: ['seq', 'nom', 'début', 'fin', 'statut'],
    widths: '44px minmax(0,1fr) 104px 104px 100px',
  },
  PHASE: {
    label: 'Phases',
    scope: '',
    constraints: [],
    cols: ['seq', 'nom', 'lot', 'début', 'fin', 'statut'],
    widths: '44px minmax(0,1fr) 180px 120px 120px 100px',
  },
  SUBPHASE: {
    label: 'Sous-phases',
    scope: '',
    constraints: [],
    cols: ['seq', 'phase', 'nom', 'début', 'fin', 'statut'],
    widths: '44px 84px minmax(0,1fr) 104px 104px 100px',
  },
  WORKSTREAM: {
    label: 'Chantiers',
    scope: '',
    constraints: [],
    cols: ['seq', 'nom', 'resp. chantier', 'statut', 'dépendances', 'phases', 'sous-phases', 'début', 'fin'],
    widths: '36px minmax(100px,1fr) 100px 80px 86px 87px 87px 88px 88px',
  },
  TEAM: {
    label: 'Équipes',
    scope: '',
    constraints: [],
    cols: ['société', 'équipe', 'description', 'personnes'],
    widths: '120px 110px minmax(0,1fr) 90px',
  },
  ROLE: {
    label: 'Rôles sur le projet',
    scope: '',
    constraints: [],
    cols: ['rôle', 'personnes'],
    widths: 'minmax(0,1fr) 90px',
  },
  PERSON: {
    label: 'Personnes',
    scope: '',
    constraints: [],
    cols: ['nom', 'société', 'équipe', 'position', 'rôle', 'chantier', 'email', 'actif'],
    widths: 'minmax(0,1fr) 90px 76px minmax(0,1.1fr) minmax(0,1fr) minmax(0,.9fr) minmax(0,1.1fr) 50px',
  },
  GOVERNANCE_BODY: {
    label: 'Instances de pilotage',
    scope: "Instances de gouvernance du projet ; chaque décision du registre est rattachée à l'une d'elles.",
    constraints: [],
    cols: ['libellé', 'description', 'fréquence'],
    widths: '170px minmax(0,1fr) 120px',
  },
  PROJECT_ASSIGNMENT: {
    label: 'Affectations',
    scope: "Plusieurs affectations possibles par personne ; le rôle métier est distinct des permissions ; l'équipe appartient au même projet.",
    constraints: ['project_role ≠ permission applicative', 'team_id du même projet', 'end_date attendue pour toute affectation externe'],
    cols: ['person_id', 'team_id', 'project_role', 'début', 'fin', 'active'],
    widths: 'minmax(0,1.2fr) 90px minmax(0,1.3fr) 90px 90px 60px',
  },
  DELIVERABLE: {
    label: 'Livrables',
    scope: 'Livrables attendus par phase et sous-phase ; chaque livrable a un responsable de production et une équipe.',
    constraints: [],
    cols: ['livrable', 'responsable', 'équipe', 'phase', 'sous-phase', 'chantier'],
    widths: 'minmax(0,1.6fr) 110px 96px 84px minmax(0,1fr) 150px',
    sortable: true,
  },
};
