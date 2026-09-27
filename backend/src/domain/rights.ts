/**
 * Droits effectifs (brief Cockpit § 8). Calcul pur, sans accès à la base.
 * Règle RG5 : pour chaque espace, catégorie et chantier, le droit le plus fort parmi les profils.
 */

export type ProfileCode = 'ADMIN' | 'PMO' | 'RESPONSABLE' | 'LECTEUR';

export interface HabilitationRow {
  profile: ProfileCode;
  wsId: string | null;
}

/** Accès d'un utilisateur à un projet donné. */
export interface ProjectAccess {
  projectId: string;
  /** Personne du référentiel correspondant au compte sur ce projet (si elle existe). */
  personId: string | null;
  admin: boolean;
  pmo: boolean;
  responsable: string[];
  lecteur: string[];
  /** Directeur de programme du projet (droit Séances, § 8.6). */
  programDirector: boolean;
}

export function buildAccess(
  projectId: string,
  personId: string | null,
  isPlatformAdmin: boolean,
  rows: HabilitationRow[],
  programDirectorId: string | null,
): ProjectAccess {
  const responsable = new Set<string>();
  const lecteur = new Set<string>();
  let pmo = false;
  for (const r of rows) {
    if (r.profile === 'PMO') pmo = true;
    else if (r.profile === 'RESPONSABLE' && r.wsId) responsable.add(r.wsId);
    else if (r.profile === 'LECTEUR' && r.wsId) lecteur.add(r.wsId);
  }
  for (const ws of responsable) lecteur.delete(ws);
  return {
    projectId,
    personId,
    admin: isPlatformAdmin,
    pmo,
    responsable: [...responsable].sort(),
    lecteur: [...lecteur].sort(),
    programDirector: !!personId && personId === programDirectorId,
  };
}

/** L'utilisateur a-t-il un accès quelconque au projet ? (sinon 404, RG16) */
export function hasAnyAccess(a: ProjectAccess): boolean {
  return a.admin || a.pmo || a.responsable.length > 0 || a.lecteur.length > 0 || a.programDirector;
}

/** Profil global : voit tous les chantiers. */
export function seesAllWorkstreams(a: ProjectAccess): boolean {
  return a.admin || a.pmo;
}

/** Chantiers visibles (RG8) ; `null` = tous. */
export function visibleWorkstreams(a: ProjectAccess): string[] | null {
  if (seesAllWorkstreams(a)) return null;
  return [...new Set([...a.responsable, ...a.lecteur])];
}

export function canReadWs(a: ProjectAccess, wsId: string | null | undefined): boolean {
  if (seesAllWorkstreams(a)) return true;
  if (!wsId) return false;
  return a.responsable.includes(wsId) || a.lecteur.includes(wsId);
}

/** Onglet Référentiel (lecture de l'administration du référentiel) : ADMIN, PMO. */
export function canSeeReferentialTab(a: ProjectAccess): boolean {
  return a.admin || a.pmo;
}

/** Écriture du Référentiel : PMO uniquement (l'Admin est en lecture seule, RG6). */
export function canWriteReferential(a: ProjectAccess): boolean {
  return a.pmo;
}

/** Écriture du transactionnel d'un chantier (RG9). */
export function canWriteWs(a: ProjectAccess, wsId: string | null | undefined): boolean {
  if (a.pmo) return true;
  return !!wsId && a.responsable.includes(wsId);
}

/** Séances : PMO et directeur de programme (§ 8.6). */
export function canWriteSessions(a: ProjectAccess): boolean {
  return a.pmo || a.programDirector;
}

/** Outils sans chantier (documents, templates, rapports) : tout profil non Lecteur, Admin exclu. */
export function canWriteTools(a: ProjectAccess): boolean {
  return a.pmo || a.responsable.length > 0;
}

/** Dates du planning (§ 8.7) : PMO partout ; Responsable sur son chantier uniquement. */
export function canEditPlanning(a: ProjectAccess, kind: 'phase' | 'subphase' | 'workstream' | 'milestone' | 'deliverable', id: string): boolean {
  if (a.pmo) return true;
  return kind === 'workstream' && a.responsable.includes(id);
}

/**
 * Profil utilisé pour une écriture (journal d'audit, RG13) : le profil qui accorde le droit.
 */
export function profileUsedFor(a: ProjectAccess, wsId?: string | null): ProfileCode | null {
  if (a.pmo) return 'PMO';
  if (wsId && a.responsable.includes(wsId)) return 'RESPONSABLE';
  if (!wsId && a.responsable.length) return 'RESPONSABLE';
  if (a.admin) return 'ADMIN';
  if (a.lecteur.length) return 'LECTEUR';
  return null;
}

/** Profil le plus fort (affichage console) : ADMIN > PMO > RESPONSABLE > LECTEUR. */
export function strongestProfile(a: Pick<ProjectAccess, 'admin' | 'pmo' | 'responsable' | 'lecteur'>): ProfileCode | null {
  if (a.admin) return 'ADMIN';
  if (a.pmo) return 'PMO';
  if (a.responsable.length) return 'RESPONSABLE';
  if (a.lecteur.length) return 'LECTEUR';
  return null;
}

/** Résumé des droits renvoyé par `GET /api/me` (RG10) pour masquer les actions côté frontend. */
export function rightsSummary(a: ProjectAccess) {
  return {
    referentiel: canSeeReferentialTab(a),
    referentielEdit: canWriteReferential(a),
    admin: a.admin,
    sessions: canWriteSessions(a),
    tools: canWriteTools(a),
    editDates: { all: a.pmo, workstreams: a.pmo ? null : a.responsable },
    edit: { all: a.pmo, workstreams: a.pmo ? null : a.responsable },
    read: { all: seesAllWorkstreams(a), workstreams: visibleWorkstreams(a) },
  };
}
