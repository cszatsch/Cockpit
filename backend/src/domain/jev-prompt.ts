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

/** Persona de Jev (spécification PERSONA § 5) : un seul pour la plateforme. */
export const PERSONA_NAME_MAX = 30;
export const PERSONA_CREATURE_MAX = 40;
export const PERSONA_STYLE_MAX = 60;
export const PERSONA_SOUL_MAX = 20_000;
/** Avatars prédéfinis et emojis proposés par l'écran Persona. */
export const PERSONA_AVATARS = ['nuit', 'ambre', 'lagon', 'encre'] as const;
export const PERSONA_EMOJIS = ['🧭', '✨', '🦉', '🛰️', '🐙', '🌱'];

export interface PersonaIdentity {
  name: string;
  creature: string;
  style: string;
  emoji: string;
  avatar: string;
  photo: string | null;
}
export interface PersonaText {
  identity: PersonaIdentity;
  soul: string;
}

/** Contrôle d'un Persona : message par champ (422 côté API). */
export function personaErrors(p: PersonaText): Record<string, string> {
  const e: Record<string, string> = {};
  const i = p.identity;
  if (!i.name.trim()) e['identity.name'] = 'obligatoire';
  else if (i.name.length > PERSONA_NAME_MAX) e['identity.name'] = `${PERSONA_NAME_MAX} caractères au plus`;
  if (i.creature.length > PERSONA_CREATURE_MAX) e['identity.creature'] = `${PERSONA_CREATURE_MAX} caractères au plus`;
  if (i.style.length > PERSONA_STYLE_MAX) e['identity.style'] = `${PERSONA_STYLE_MAX} caractères au plus`;
  if (i.emoji && !PERSONA_EMOJIS.includes(i.emoji)) e['identity.emoji'] = `un parmi ${PERSONA_EMOJIS.join(' ')}`;
  if (!(PERSONA_AVATARS as readonly string[]).includes(i.avatar)) e['identity.avatar'] = `un parmi ${PERSONA_AVATARS.join(', ')}`;
  if (p.soul.length > PERSONA_SOUL_MAX) e.soul = `${PERSONA_SOUL_MAX.toLocaleString('fr-FR')} caractères au plus`;
  return e;
}

/**
 * Section « Identité » du prompt (§ 6) : une phrase par champ renseigné (un champ vide est omis).
 * L'avatar et la photo ne sont jamais envoyés au modèle.
 */
export function identityText(i: PersonaIdentity): string {
  const s = [`Tu t’appelles ${i.name.trim()}.`];
  if (i.creature.trim()) s.push(`Tu es ${i.creature.trim()}.`);
  if (i.style.trim()) s.push(`Ton style : ${i.style.trim()}.`);
  if (i.emoji) s.push(`Ton emoji : ${i.emoji}.`);
  return s.join(' ');
}

/** Persona de démonstration (livraison Persona), valeur initiale. */
export const DEMO_PERSONA: PersonaText = {
  identity: { name: 'Jev', creature: 'Copilote de projet', style: 'Direct, chaleureux, précis', emoji: '🧭', avatar: 'nuit', photo: null },
  soul: "## Qui je suis\nJe suis le copilote des équipes projet. Je lis les données avant de parler, et je dis ce que je vois, même quand ce n’est pas agréable.\n\n## Comment j’écris\n- Je tutoie et je vais droit au but.\n- Une idée par phrase ; les chiffres avant les adjectifs.\n- Je cite toujours mes sources.\n\n## Ce en quoi je crois\n- Un risque nommé tôt coûte moins cher qu’un risque découvert tard.\n- La décision appartient à l’humain : je l’éclaire, je ne la prends pas.\n- Mieux vaut « je ne sais pas » qu’une réponse inventée.",
};

export interface SkillText {
  n: string;
  t: string;
  on: boolean;
  position: number;
}

/**
 * Assemble le prompt système de Jev (Persona § 6, Skills § 6) : prompt de base, « ## Identité »,
 * « ## Personnalité » (le Soul, tel quel), puis une section par skill active dans l'ordre de `position`.
 * Les skills désactivées sont ignorées ; aucun rendu Markdown.
 */
export function assembleJevPrompt(base: string, persona: PersonaText | null, skills: SkillText[]): string {
  const parts = [base];
  if (persona) {
    parts.push(`## Identité\n${identityText(persona.identity)}`);
    if (persona.soul.trim()) parts.push(`## Personnalité\n${persona.soul}`);
  }
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

/**
 * Skill de guidage de la Console (spécification IA § 8) : la première skill **active** dont le nom est l'un
 * de ceux-ci (ou commence par lui), dans cet ordre. « Guidage console » est le nom retenu le 28/09/2026 (ancien nom :
 * « Répondre sur la Console d’administration ») ; « Guider l’utilisateur » est le nom de la spécification IA § 8.
 * « Guidage Cockpit » n'est pas retenu : il guide dans le Cockpit, pas dans la Console.
 */
export const CONSOLE_GUIDANCE_SKILLS = ['Guidage console', 'Répondre sur la Console d’administration', 'Guider l’utilisateur'];

/** Pages de la Console : identifiant (`S.sec`) → titre, pour situer la question de l'administrateur. */
export const CONSOLE_PAGE_TITLES: Record<string, string> = {
  overview: 'Vue d’ensemble', users: 'Utilisateurs', admins: 'Administrateurs', rights: 'Droits et habilitations',
  providers: 'Fournisseurs et modèles', assign: 'Affectation des modèles', conso: 'Consommation et coûts',
  persona: 'Persona', skills: 'Skills', library: 'Bibliothèque des projets', init: 'Initialisation d’un projet',
  snaps: 'Snapshots', modules: 'Modules', apis: 'Registre des cartes API', notifs: 'Notifications et alertes', profil: 'Mon profil',
};

/** Nom de skill comparable : sans tenir compte de la casse, des espaces en trop ni de la forme de l'apostrophe (« Guidage Console » = « Guidage console »). */
export const skillKey = (n: string) => n.trim().replace(/\s+/g, ' ').replace(/[’']/g, '’').toLocaleLowerCase('fr');

/** Choix de la skill de guidage parmi les skills actives. */
export function pickGuidanceSkill<T extends SkillText>(skills: T[]): T | null {
  const on = skills.filter((s) => s.on);
  for (const n of CONSOLE_GUIDANCE_SKILLS.map(skillKey)) {
    const hit = on.find((s) => skillKey(s.n) === n) ?? on.find((s) => skillKey(s.n).startsWith(n));
    if (hit) return hit;
  }
  return null;
}

/**
 * Prompt du guidage console (spécification IA § 8), dans cet ordre : contexte système, persona (Identité,
 * Personnalité), skill de guidage si elle est active, puis la page de console ouverte (identifiant et titre).
 */
export function assembleConsoleGuidancePrompt(base: string, persona: PersonaText | null, skills: SkillText[], page: string): string {
  const skill = pickGuidanceSkill(skills);
  const head = assembleJevPrompt(base, persona, skill ? [{ ...skill, position: 0 }] : []);
  const title = CONSOLE_PAGE_TITLES[page] ?? page;
  return `${head}

## Page de console ouverte
${page} · ${title}`;
}
