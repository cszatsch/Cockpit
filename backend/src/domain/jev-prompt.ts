/**
 * Prompt système de Jev et skills (spécification SKILLS § 1 et § 6).
 * Règles pures : l'assemblage ne dépend que de ses entrées (testé dans test/unit).
 */

/** Longueur maximale du nom d'une skill (caractères). */
export const SKILL_NAME_MAX = 60;
/** Longueur maximale du texte d'une skill (caractères). */
export const SKILL_TEXT_MAX = 20_000;
/** Nom retenu quand une skill est enregistrée sans nom (spécification § 3). */
export const SKILL_UNNAMED = 'Sans nom';

/** Prompt système de base de Jev, avant le Persona et les skills. */
export const JEV_SYSTEM_PROMPT =
  'Tu es Jev, l’assistant IA de RISE Cockpit. Tu réponds en français, de façon factuelle et concise, à partir des données du projet et de la plateforme. ' +
  'Tu ne modifies jamais une donnée sans la validation explicite de l’utilisateur.';

/**
 * Persona de Jev (ton, style, règles de comportement). La page Persona reste à concevoir :
 * tant qu'elle n'existe pas, aucun texte de Persona n'est ajouté.
 */
export const JEV_PERSONA: string | null = null;

export interface SkillText {
  n: string;
  t: string;
  on: boolean;
  position: number;
}

/**
 * Assemble le prompt système de Jev : prompt de base, Persona, puis une section par skill active,
 * dans l'ordre de `position`. Les skills désactivées sont ignorées ; le texte est injecté tel quel
 * (aucun rendu Markdown).
 */
export function assembleJevPrompt(base: string, persona: string | null, skills: SkillText[]): string {
  const parts = [base];
  if (persona && persona.trim()) parts.push(persona);
  for (const s of [...skills].filter((x) => x.on).sort((a, b) => a.position - b.position)) parts.push(`## Skill : ${s.n}\n${s.t}`);
  return parts.join('\n\n');
}

/** Contrôle des limites d'une skill : message par champ en cas de dépassement (422 côté API). */
export function skillLimits(v: { n?: string; t?: string }): Record<string, string> {
  const e: Record<string, string> = {};
  if (v.n !== undefined && v.n.length > SKILL_NAME_MAX) e.n = `${SKILL_NAME_MAX} caractères au plus`;
  if (v.t !== undefined && v.t.length > SKILL_TEXT_MAX) e.t = `${SKILL_TEXT_MAX.toLocaleString('fr-FR')} caractères au plus`;
  return e;
}

/** Skills de démonstration (livraison Skills), chargées comme données initiales. */
export const DEMO_SKILLS: Array<{ id: string; n: string; on: boolean; t: string }> = [
  { id: 's1', n: 'Analyser le projet', on: true, t: "## Objectif\nAider à comprendre l’état réel du projet : santé, risques, jalons et évolutions.\n\n## Consignes\n- Toujours partir des données du projet et citer la source de chaque chiffre.\n- Distinguer les faits, les tendances et les hypothèses.\n- Pour un Go / No-Go, lister chaque critère avec son seuil et sa valeur.\n\n## Format\n1. Le constat en une phrase.\n2. Les trois points qui comptent le plus.\n3. La recommandation, si elle est demandée." },
  { id: 's2', n: 'Rédiger un livrable', on: true, t: "## Objectif\nProduire des livrables prêts à relire : comptes rendus, rapports, ordres du jour, relances.\n\n## Consignes\n- Reprendre la structure du modèle de document du projet.\n- Chaque action a un porteur et une échéance.\n- Signaler une information manquante au lieu de la supposer.\n\n## Format\nUn brouillon, jamais diffusé sans relecture." },
  { id: 's3', n: 'Mettre à jour les données', on: true, t: "## Objectif\nCréer, modifier ou supprimer des actions, risques et jalons à la demande.\n\n## Consignes\n- Toujours présenter la modification avant de l’appliquer.\n- Attendre la validation explicite de l’utilisateur.\n- Refuser une suppression groupée sans confirmation élément par élément." },
  { id: 's4', n: 'Assister l’administration', on: false, t: "## Objectif\nAssister l’administrateur de la plateforme.\n\n## Consignes\n- Contrôler un fichier d’initialisation et lister les non-conformités.\n- Expliquer une panne IA et proposer le correctif." },
  { id: 's5', n: 'Guider l’utilisateur', on: true, t: "## Objectif\nRépondre aux questions « comment faire » sur le Cockpit.\n\n## Consignes\n- Répondre en trois étapes au plus.\n- Terminer par le lien vers l’écran concerné." },
];
