/**
 * Réponses de Jev dans le Cockpit selon le cas d'usage (brief « Aiguillage des questions dans l'assistant JEV », 01/10/2026)
 * — règles pures, sans réseau. Cas 2 (guide) : `guideAnswerRules('cockpit')` et `guideExtractsBlock` (jev-rag.ts) ;
 * cas 5 (clarification) : consignes et demande ci-dessous. Les autres cas suivront (1, 4, 3).
 */
import { COCKPIT_CASE_LABEL, CockpitCase } from './jev-router-cockpit';

/** Ce que Jev sait faire dans le Cockpit (rappelé dans la clarification). */
export const COCKPIT_CAPABILITIES = [
  'Dans le Cockpit, je peux :',
  '- répondre sur les données du projet (risques, actions, jalons, décisions, comités, chantiers, planning…), dans la limite des chantiers que vous voyez ;',
  '- expliquer l’utilisation de l’application, d’après le guide utilisateur du Cockpit ;',
  '- créer, modifier ou supprimer un risque, un problème, une action ou une décision, après votre confirmation ;',
  '- retrouver une information dans les documents de la Base de connaissance (supports de comité, comptes rendus…).',
].join('\n');

/** Motif de la clarification : il oriente la demande de précision. */
export type CockpitClarifyReason = 'AMBIGU' | 'HORS_SUJET' | 'CONFIANCE' | 'ECRITURE' | 'INDISPONIBLE';

/** Consignes de la réponse de clarification (partie stable, mise en cache). */
export const COCKPIT_CLARIFY_RULES = [
  '## Demander une précision',
  COCKPIT_CAPABILITIES,
  '',
  'Consignes :',
  '- Réponds en français, en vouvoyant l’utilisateur, en 3 à 6 lignes au plus, sans emoji.',
  '- Dis en une phrase ce qui manque pour répondre, sans reproche.',
  '- Propose 2 ou 3 reformulations ou choix précis, en liste, que l’utilisateur peut reprendre tels quels.',
  '- N’invente aucune donnée du projet, aucune règle de l’application, aucune procédure.',
  '- N’annonce jamais qu’une modification a été faite : rien n’est enregistré à ce stade.',
].join('\n');

/**
 * Demande de clarification (partie variable), selon le motif. La phrase d'ouverture est celle du brief ;
 * `probable` : cas retenu par l'aiguillage avant le seuil, pour orienter les reformulations.
 */
export function cockpitClarifyPrompt(question: string, reason: CockpitClarifyReason, probable?: CockpitCase | null): string {
  const hint = probable && probable !== '5' ? ` La piste la plus probable est : ${COCKPIT_CASE_LABEL[probable].toLowerCase()}.` : '';
  const why: Record<CockpitClarifyReason, string> = {
    AMBIGU: 'La demande est ambiguë ou trop vague : on ne sait pas si elle porte sur les données du projet, l’utilisation de l’application, une modification ou un document.',
    HORS_SUJET: 'La demande semble sans rapport avec le Cockpit ou le projet : rappelle poliment ce que tu sais faire, puis propose des questions possibles sur le projet.',
    CONFIANCE: `La demande n’est pas assez précise pour savoir avec certitude ce qui est attendu.${hint}`,
    ECRITURE: 'La demande semble viser une modification des données, mais ce n’est pas certain : demande à l’utilisateur de confirmer ce qu’il veut enregistrer (objet, champ, nouvelle valeur), ou s’il veut seulement une information. Ne propose aucune modification comme déjà faite.',
    INDISPONIBLE: 'Le service qui oriente les questions est momentanément indisponible : demande à l’utilisateur de préciser s’il veut une donnée du projet, une explication sur l’application, une modification ou une information tirée d’un document.',
  };
  return `Génère une réponse à cette demande qui nécessite une clarification de l’utilisateur :\n${question}\n\n${why[reason]}`;
}

/** Motif de clarification d'après la décision de l'aiguillage. */
export function clarifyReasonOf(route: { status: string; choice: string | null; downgrade: string | null }): CockpitClarifyReason {
  if (route.status !== 'OK') return 'INDISPONIBLE';
  if (route.choice === 'hors_sujet') return 'HORS_SUJET';
  if (route.choice === 'modification' && route.downgrade) return 'ECRITURE';
  if (route.downgrade) return 'CONFIANCE';
  return 'AMBIGU';
}

/** Écran ouvert, pour le contexte de la demande. */
export const cockpitPageLabel = (space: string, tab?: string | null) => `Écran ouvert du Cockpit : ${[space, tab].filter(Boolean).join(' › ')}`;

/** Maintenant, heure de Paris (contexte de la demande). */
export const nowParisLabel = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' }).format(d);

// ───────────── Cas 1 : Insight sur les données du projet ─────────────

/** Consigne ajoutée à l'étape « requête » : la question vient de l'aiguillage (cas 1, données). */
export const COCKPIT_INSIGHT_DATA_HINT = 'La question porte sur les données du projet (aiguillage) : réponds par une requête SQL sur les vues ci-dessus. '
  // Correctif du 08/10/2026 : une question de suite (« par chantier », « pour chacune… ») était répondue depuis la mémoire
  // de la conversation, sans requête, en reprenant une réponse précédente fausse.
  + 'Écris toujours une nouvelle requête, même si un échange précédent semble déjà contenir la réponse : un nouveau découpage, regroupement ou filtre se calcule sur les données, jamais à partir des réponses précédentes (elles peuvent être incomplètes ou fausses).';

/** Périmètre de lecture de l'utilisateur, tel que les vues l'appliquent (projet, chantiers lisibles). */
export function cockpitScopeLine(chantiers: '*' | string[]): string {
  if (chantiers === '*') return 'L’utilisateur voit tout le projet (tous les chantiers).';
  if (!chantiers.length) return 'L’utilisateur n’a accès à aucun chantier : seules les données du projet non rattachées à un chantier sont lisibles.';
  return `L’utilisateur ne voit que les chantiers ${chantiers.join(', ')} (chantier_id) ; les lignes des autres chantiers sont absentes des vues. Ne laisse jamais entendre que tu vois tout le projet.`;
}

/** Consignes de l'étape « rédiger la réponse » (cas 1). */
export const COCKPIT_INSIGHT_ANSWER_RULES = [
  '## Réponse à partir des données du projet',
  'La question a été traduite en requête SQL, exécutée sur les données du projet que l’utilisateur a le droit de voir. Réponds à partir des résultats fournis, et d’eux seuls :',
  '- N’invente aucune valeur, aucun code, aucune date. Si les résultats sont vides, dis qu’aucune donnée ne correspond dans ton périmètre. S’ils sont tronqués, dis-le.',
  // Correctif du 13/10/2026 : « le chantier Data gouvernance » (inexistant) répondu par la fiche complète de C1 Datalake.
  '- Si la question nomme un objet (chantier, jalon, risque, livrable, personne…) et qu’aucun résultat ne porte ce nom, dis-le dès la première phrase : aucun objet de ce nom n’existe dans les données du projet (de ton périmètre). Ne présente jamais un autre objet à sa place, même s’il partage un mot du nom, et ne détaille aucune de ses données. Seule exception : un nom presque identique (faute de frappe, abréviation, sigle) ; demande alors si c’est celui-là, sans détailler ses données.',
  '- N’explique pas un résultat par une règle de gestion que les données ne disent pas (« éléments communs à tous les chantiers », « phase transverse »…) : décris ce que montrent les résultats ; si un rattachement paraît anormal, signale-le comme tel.',
  '- Commence par la réponse elle-même (le chiffre, la date, la liste), puis les éléments utiles, hiérarchisés : ce qui menace le prochain jalon d’abord.',
  // 14/10/2026 : « les principaux risques » répondu par 3 risques sur 4 sans dire combien il y en a ni pourquoi.
  '- Si tu ne retiens qu’une partie des résultats (« les principaux », « les plus en retard »…), indique le total et le critère retenu (par exemple : « les 3 plus critiques sur 4 risques ouverts »).',
  // Banc du 14/10/2026 : « son code (C1 à C8) » pour 5 chantiers, « R01, R05… » en exemple, « aucun jalon sur C6, C7 ou C8 ».
  '- Ne cite jamais un code d’objet absent des résultats, même en exemple ou pour dire qu’il n’a rien (« C1 à C8 », « R05 ») ; le nombre et les codes des chantiers, risques ou jalons viennent des seuls résultats, jamais de la description du projet.',
  '- Cite les codes des objets (R03, A-41, D-005, J07) ; traduis les statuts et les codes d’après le dictionnaire ; ne montre pas la requête SQL.',
  '- Si le périmètre de l’utilisateur est limité à certains chantiers, précise que la réponse porte sur ces chantiers.',
  '- Tu n’agis pas : n’annonce aucune modification ; indique, si c’est utile, l’écran du Cockpit où agir (Pilotage › Risques, par exemple).',
  '- Ne cite jamais les noms techniques des vues ou des colonnes (date_golive_prevue, jev_cockpit…) : emploie les mots de l’application.',
].join('\n');

/** Lecture impossible (requête refusée deux fois ou en échec) : jamais de réponse inventée. */
/**
 * Réponse quand les données du projet n'ont pas pu être lues (incident du 20/10/2026) : jamais de motif technique
 * montré ; il reste dans la trace de la question (`erreur`) et dans l'analyse des temps de réponse.
 */
export const INSIGHT_UNAVAILABLE_REPLY = 'Je n’ai pas réussi à rassembler les données du projet pour cette question. Posez une question plus ciblée (un sujet à la fois : risques, jalons, actions…), ou consultez directement l’écran concerné du Cockpit.';

/** Source affichée sous la réponse : la vue consultée, en clair. */
export const insightSourceLabel = (view: string) => `Données · ${view.replace(/_/g, ' ')}`;

// ───────────── Réponses provisoires (étapes à venir) ─────────────

/** Cas 3 sans modification identifiée (en attendant le traitement complet des modifications). */
export const COCKPIT_WRITE_UNCLEAR_REPLY = 'Je n’ai pas identifié de modification précise à proposer. Indiquez l’objet (par exemple A-41 ou R03) et le changement voulu (statut, échéance…), ou créez une action avec « crée une action : … ».';

// ───────────── Cas 4 : documents de la Base de connaissance ─────────────

/** Extraits cherchés, gardés après reclassement, seuil quand aucun document n'est identifié, documents retenus au plus. */
export const DOC_SEARCH_K = 10;
export const DOC_KEEP = 5;
export const DOC_MIN_SIMILARITY = 0.3;
export const DOC_MAX_IDENTIFIED = 3;
/** Titres du plan d'un document transmis au modèle (questions de sommaire, de structure). */
export const DOC_OUTLINE_MAX = 60;
/** Séances tenues rappelées pour situer « le dernier COPIL », « la séance de mars »… */
export const DOC_SESSIONS_MAX = 15;

export interface DocCatalogItem { id: string; n: string; type: string; dateIso: string; v: string; format: string | null; description: string | null }
export interface DocSession { instance: string; short: string; number: number; dateIso: string }

/** Consignes de l'étape « identifier les documents » (réponse JSON). */
export const DOC_IDENTIFY_SYSTEM = [
  'Tu identifies, dans le catalogue des documents d’un projet, le ou les documents visés par la question de l’utilisateur.',
  '- Utilise le nom, le type, la date et la description de chaque document, et les séances de comité tenues pour situer « le dernier COPIL », « le kick-off », « la séance de mars » : le support ou le compte rendu d’une séance porte en général sa date ou celle d’un jour proche.',
  `- Retiens au plus ${DOC_MAX_IDENTIFIED} documents, du plus pertinent au moins pertinent. Si aucun document ne correspond clairement, n’en retiens aucun.`,
  '- Reformule la question en une requête de recherche courte, autonome, en français, qui décrit l’information cherchée dans le texte des documents.',
  'Réponds uniquement par un objet JSON, sans texte autour : {"documents": ["identifiant", …], "recherche": "…", "motif": "pourquoi ces documents, en une phrase"}',
].join('\n');

/** Catalogue transmis à l'étape d'identification (partie variable). */
export function docCatalogText(docs: DocCatalogItem[], sessions: DocSession[], todayIso: string): string {
  return [
    `## Date du jour\n${todayIso}`,
    '## Catalogue des documents (identifiant · nom · type · date · version · format · description)',
    ...docs.map((d) => `- ${d.id} · ${d.n} · ${d.type} · ${d.dateIso} · ${d.v}${d.format ? ` · ${d.format}` : ''}${d.description ? ` · ${d.description}` : ''}`),
    ...(sessions.length ? ['## Séances de comité tenues (instance · numéro · date), de la plus récente à la plus ancienne', ...sessions.map((s) => `- ${s.instance} (${s.short}) · n°${s.number} · ${s.dateIso}`)] : []),
  ].join('\n');
}

/** Réponse de l'étape d'identification : identifiants connus seulement, requête de recherche (repli : la question). */
export function parseDocIdentification(raw: string, known: string[], question: string): { ids: string[]; query: string; why: string } {
  const t = String(raw || '');
  const m = t.match(/\{[\s\S]*\}/);
  let ids: string[] = [], query = '', why = '';
  if (m) {
    try {
      const j = JSON.parse(m[0]);
      ids = Array.isArray(j.documents) ? j.documents.map(String) : [];
      query = typeof j.recherche === 'string' ? j.recherche.trim() : '';
      why = typeof j.motif === 'string' ? j.motif.trim() : '';
    } catch { /* réponse illisible : repli ci-dessous */ }
  }
  if (!ids.length && !m) ids = known.filter((id) => t.includes(id));
  return { ids: [...new Set(ids.filter((id) => known.includes(id)))].slice(0, DOC_MAX_IDENTIFIED), query: query && query.length <= 500 ? query : question, why };
}

export interface DocExtract { document: string; dateIso: string; location: string; content: string; similarity: number }

/** Extraits retenus (partie variable), avec le document et le repère de chacun. */
export function docExtractsBlock(xs: DocExtract[]): string {
  return ['## Extraits des documents', ...xs.map((x, i) => `### Extrait ${i + 1} · ${x.document} (${x.dateIso}) · ${x.location}\n${x.content}`)].join('\n\n');
}

/** Documents identifiés : résumé et plan (questions de sommaire, de structure, de synthèse). */
export function docOverviewBlock(docs: Array<{ n: string; dateIso: string; type: string; description: string | null; outline: string[] }>): string {
  return ['## Documents visés', ...docs.map((d) => `### ${d.n} (${d.type}, ${d.dateIso})\n${d.description ? `Description : ${d.description}\n` : ''}Plan :\n${d.outline.map((o) => `- ${o}`).join('\n')}`)].join('\n\n');
}

/** Source affichée sous la réponse : document et repère. */
export const docSourceLabel = (x: { document: string; location: string }) => `${x.document} · ${x.location.replace(/^Section : /, '')}`;

/** 4b : consigne de l'étape « requête » du cas 1 : lire l'état actuel, la comparaison avec les documents vient ensuite. */
export const DOC_DATA_QUERY_HINT = 'La question compare l’état actuel du projet avec ce que disent des documents (support de comité, compte rendu, présentation de lancement). Ta part : lire l’état ACTUEL des objets concernés (dates prévues et de référence, statuts, valeurs) ; la lecture des documents est faite ensuite, séparément.';
/** 4b : consigne de l'étape « réponse » du cas 1. */
export const DOC_DATA_ANSWER_HINT = 'Donne l’état actuel tel que les résultats le montrent (dates, statuts, valeurs), sans proposer de le vérifier : c’est ta seule tâche. Ne parle pas des documents : ils sont traités à part.';

/** Séances tenues rappelées à la rédaction (« le dernier COPIL » : vérifier que le document trouvé est bien le sien). */
export function docSessionsBlock(sessions: DocSession[]): string {
  return sessions.length ? ['## Séances de comité tenues (de la plus récente à la plus ancienne)', ...sessions.map((s) => `- ${s.instance} (${s.short}) · n°${s.number} · ${s.dateIso}`)].join('\n') : '';
}

/** Consignes de la réponse « documents » (cas 4a), partie stable. */
export const DOC_ANSWER_RULES = [
  '## Répondre à partir des documents du projet',
  'Les documents de la Base de connaissance qui correspondent à la question sont décrits dans « Documents visés » (description, plan) et cités dans « Extraits des documents ».',
  '- Réponds uniquement à partir de ces éléments : n’ajoute aucun fait, aucune date, aucun chiffre qui n’y figure pas.',
  '- Dis de quel document vient la réponse (nom et date), et cite le repère dans le texte : (Nom du document, diapositive 4) ou (Nom du document, p. 12).',
  '- Pour un sommaire ou une structure, appuie-toi sur le plan du document, dans l’ordre.',
  '- Si la question vise une séance précise (« le dernier COPIL », « la séance de mars ») : vérifie, d’après « Séances de comité tenues », que le document trouvé correspond bien à cette séance. Sinon, dis-le d’abord explicitement (par exemple : « Le dernier COPIL est le n°20 du 26/09/2026 ; son support n’est pas dans la Base de connaissance. Le plus récent disponible est celui du 19/03/2025 »), puis réponds à partir de ce document en le datant.',
  '- Si les éléments ne permettent pas de répondre, dis-le clairement (« Je n’ai pas trouvé cette information dans les documents de la Base de connaissance »), puis indique ce qui s’en approche le plus.',
  '- Ne termine pas par une liste « Sources » : elles s’affichent sous la réponse.',
  // 13/10/2026 : la skill « Analyser un document » demande de rapprocher avec le Cockpit ; ici, aucune donnée n'est fournie.
  '- Les données du Cockpit ne te sont pas fournies ici : ne fais aucun rapprochement avec le Cockpit et n’affirme rien sur l’état actuel du projet ; décris ce que dit le document, à sa date.',
].join('\n');

/** Consignes de la réponse « données + documents » (cas 4b), partie stable. */
export const DOC_DATA_ANSWER_RULES = [
  '## Répondre à partir des données du projet et des documents',
  'Deux sources sont fournies : « Réponse tirée des données du projet » (lue dans les tables du Cockpit) et les documents de la Base de connaissance (« Documents visés », « Extraits des documents »).',
  '- Commence par la réponse à la question, en une ou deux phrases.',
  '- Puis deux parties distinctes, avec ces titres exacts : « ## D’après les données du projet » et « ## D’après les documents ». Ne mélange jamais les deux : chaque fait reste dans la partie de sa source.',
  // Règles du 13/10/2026 (docs/DECISIONS.md) : les données font foi ; une information de document qui les contredit
  // n'est pas citée (décision du commanditaire), sauf question de comparaison explicite.
  '- Les données du projet font foi pour l’état actuel (dates, statuts, avancement, chiffres, responsables).',
  '- Si une information d’un document diffère de celle des données sur le même point, ne cite pas celle du document : garde uniquement celle des données. Exception : la question demande explicitement de comparer ce qui était annoncé, présenté ou décidé avec la situation actuelle ; dis alors ce que disait le document, daté, et l’écart.',
  '- Si la question vise une séance précise et que le document trouvé correspond à une autre séance, dis-le explicitement, d’après « Séances de comité tenues ».',
  '- N’invente rien. Si une des deux sources ne dit rien sur la question, écris-le dans sa partie.',
  '- Cite les codes des objets (R03, J07) pour les données, et le document et son repère pour les documents.',
  '- Ne termine pas par une liste « Sources » : elles s’affichent sous la réponse.',
].join('\n');

// ───────────── Double recherche : données et documents pour toute question sur les données (13/10/2026) ─────────────

/** Module de la Console « Recherche documentaire systématique » : actif, une question du cas 1 lit aussi les documents. */
export const DOCS_MODULE_ID = 'jev_documents';

/** Titre de la partie « documents » : sa présence dans la réponse décide des sources « document » affichées. */
export const DOCS_PART_TITLE = '## D’après les documents';
/** La réponse contient-elle la partie « documents » (titre de niveau 2 ou 3, apostrophe droite ou courbe) ? */
export const usesDocsPart = (reply: string) => /^#{2,3}\s*D[’']apr[èe]s les documents/im.test(reply);

/**
 * Consignes de la double recherche (cas 1, module actif) : les données d'abord et elles font foi ; les documents
 * seulement s'ils apportent un élément absent des données, datés ; une information de document qui contredit les
 * données n'est jamais citée (décision du commanditaire du 13/10/2026).
 */
/**
 * Complément tiré des documents (14/10/2026, essai réel) : rédiger toute la réponse mêlait les deux sources (chiffres d'un
 * ancien support glissés dans la réponse des données) ; la réponse des données est désormais affichée telle quelle, et
 * le modèle n'écrit que le complément, ou « RIEN » (`DOC_COMPLEMENT_NONE`, `parseDocComplement`).
 */
export const DOC_COMPLEMENT_NONE = 'RIEN';
export const DOC_COMPLEMENT_RULES = [
  '## Compléter une réponse tirée des données par les documents',
  'La « Réponse tirée des données du projet » ci-dessous est déjà rédigée, fait foi et sera affichée telle quelle. Ta seule tâche : écrire le complément tiré des « Extraits des documents », ou le mot RIEN.',
  `- Écris ${DOC_COMPLEMENT_NONE} (ce seul mot) si les extraits n’apportent aucun élément utile à la question que les données ne peuvent pas contenir. C’est la réponse attendue le plus souvent, en particulier pour une question de comptage, de liste ou d’état (« combien », « lesquels », « où en est »).`,
  '- Exclus du complément, même si un document en parle : l’état des objets du Cockpit (nombre, liste, statut, échéance, porteur, responsable, avancement, criticité des actions, risques, problèmes, jalons, livrables, décisions et chantiers), et toute information qui diffère de la réponse tirée des données. Ne dis jamais qu’un document confirme, nuance ou date les données.',
  '- Complément autorisé : contexte, objectifs, périmètre, organisation, raisons d’une décision, ce qui a été présenté ou recommandé. Au plus trois points courts, chacun daté (nom du document, date, diapositive ou page).',
  '- Si la réponse tirée des données dit qu’aucun objet de ce nom n’existe dans le projet et qu’un document en parle : le complément est la réponse tirée de ce document (six points au plus), datée.',
  '- Ni titre, ni introduction, ni conclusion, ni question finale, ni liste « Sources ». N’invente rien.',
].join('\n');

/** Complément rédigé, sans titre ajouté par le modèle ; null : « RIEN » ou réponse vide. */
export function parseDocComplement(text: string): string | null {
  const t = String(text ?? '').trim().replace(/^#{1,4}\s*D[’']apr[èe]s les documents\s*\n+/i, '').trim();
  if (!t || new RegExp(`^\\**${DOC_COMPLEMENT_NONE}\\**[.!]?$`, 'i').test(t)) return null;
  return t;
}

/** Ancienne consigne de rédaction complète (avant le 14/10/2026), gardée pour mémoire. */
export const DOC_AUTO_ANSWER_RULES = [
  '## Répondre à partir des données du projet, complétées par les documents',
  'La question porte sur les données du projet. Deux sources sont fournies : « Réponse tirée des données du projet » (lue dans les tables du Cockpit, elle fait foi) et des extraits de documents de la Base de connaissance, trouvés par recherche automatique : ils peuvent être sans rapport, anciens ou dépassés.',
  '- Commence par la réponse tirée des données, en reprenant ses faits sans les modifier : réponse en une ou deux phrases, puis les éléments utiles.',
  // Correctif du 14/10/2026 (essai réel) : « Combien d'actions sont en retard ? » complété par les chiffres d'un ancien
  // support (actions ouvertes, sans échéance, porteur) présentés comme un point de vigilance.
  '- L’état des objets du Cockpit ne vient jamais des documents : nombre, liste, statut, échéance, porteur, responsable, avancement, criticité des actions, risques, problèmes, jalons, livrables, décisions et chantiers. Ces éléments viennent des seules données, même si un document semble les préciser ou les compléter ; ne les cite pas d’après un document, même pour dire qu’il les confirme.',
  `- Ajoute une partie avec exactement ce titre : « ${DOCS_PART_TITLE} », seulement si les extraits apportent un élément utile que les données ne peuvent pas contenir : contexte, objectifs, périmètre, organisation, raisons d’une décision, ce qui a été présenté ou recommandé. Au plus trois points. Pour une question de comptage, de liste ou d’état (« combien », « lesquels », « où en est »), il n’y a en général rien à ajouter. Sinon, n’écris rien sur les documents, pas même pour dire qu’ils ne disent rien.`,
  '- Date chaque élément tiré d’un document (nom du document et sa date, repère : diapositive, page) ; ne le présente jamais comme la situation actuelle.',
  '- Si une information d’un document diffère de celle des données sur le même point (date, statut, chiffre, avancement, responsable…), ne la cite pas : garde uniquement celle des données.',
  `- Si la réponse tirée des données dit qu’aucun objet de ce nom n’existe dans le projet et qu’un document en parle, dis-le en une phrase, puis réponds à partir du document, sous le titre « ${DOCS_PART_TITLE} ».`,
  '- N’invente rien. Cite les codes des objets (R03, J07) pour les données. Ne termine pas par une liste « Sources » : elles s’affichent sous la réponse.',
].join('\n');

/**
 * Source demandée explicitement par l'utilisateur (13/10/2026) : « uniquement d'après le Cockpit », « seulement dans les
 * documents », « sans les documents »… ; respectée quel que soit l'aiguillage. Null : rien d'explicite.
 */
export function explicitSource(text: string): 'data' | 'docs' | null {
  const t = text.toLowerCase().replace(/[’']/g, ' ');
  const DATA = '(?:cockpit|donn[ée]es(?: du projet)?)', DOCS = '(?:documents?|base documentaire|base de connaissances?)';
  const ONLY = '(?:uniquement|seulement|exclusivement)';
  const near = (src: string) => new RegExp(`${ONLY}[^.?!]{0,30}\\b${src}|\\b${src}[^.?!]{0,12}${ONLY}`);
  const without = (src: string) => new RegExp(`\\bsans (?:les |la |le )?${src}`);
  const data = near(DATA).test(t) || without(DOCS).test(t), docs = near(DOCS).test(t) || without(DATA).test(t);
  return data && !docs ? 'data' : docs && !data ? 'docs' : null;
}

/** Base de connaissance vide (pour l'utilisateur) : réponse fixe, sans modèle. */
export const DOC_EMPTY_REPLY = 'La Base de connaissance du projet ne contient aucun document indexé que vous puissiez consulter : je ne peux pas répondre à partir des documents. Déposez le document concerné depuis la Base de connaissance, puis reposez la question.';
/** Aucun extrait pertinent : réponse fixe, sans modèle (aucune procédure ni contenu inventé). */
export const DOC_NOT_FOUND_REPLY = 'Je n’ai pas trouvé cette information dans les documents de la Base de connaissance. Précisez le document (nom, séance, date) ou reformulez la question.';
