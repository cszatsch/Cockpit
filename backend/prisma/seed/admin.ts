import { Prisma, PrismaClient } from '@prisma/client';
import { encryptSecret } from '../../src/core/crypto';
import { genDemoUsage } from '../../src/domain/demo-usage';
import { RISE_ID } from './rise';
import { DEMO_PERSONA, DEMO_SKILLS } from '../../src/domain/jev-prompt';

/**
 * Amorçage de la Console Admin à partir des constantes de `Console Admin.dc.html`
 * (USERS, AUDIT0, PROV0, MODELS0, SNAPS0, EV, RULES0, HIST0, mods, reqs, th, admins, sess, prof).
 * Instant de référence de la démonstration : 26/09/2026 10:24 (Europe/Paris) = 08:24 UTC.
 */
export const DEMO_NOW = new Date('2026-09-26T08:24:00Z');
const back = (min: number) => new Date(DEMO_NOW.getTime() - min * 60_000);
/** Date locale Paris (UTC+2 en été) → instant UTC. */
const paris = (y: number, m1: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, m1 - 1, d, h - 2, mi));

const USERS: Array<[string, string, string, string, string, number, string, string?]> = [
  ['u1', 'Julien Morel', 'julien.morel@example.com', 'admin', 'actif', 0, 'RISE ATLAS HORIZON NOVA', '09:12'],
  ['u2', 'Robin Lefèvre', 'robin.lefevre@example.com', 'pmo', 'actif', 0, 'RISE ATLAS', '08:47'],
  ['u3', 'Laurent Garnier', 'laurent.garnier@example.com', 'resp', 'actif', 14, 'RISE'],
  ['u4', 'Philippe Aubert', 'philippe.aubert@example.com', 'lec', 'actif', 21, 'RISE'],
  ['u5', 'Nathalie Roux', 'nathalie.roux@example.com', 'lec', 'actif', 5, 'RISE'],
  ['u6', 'Karim Benali', 'karim.benali@example.com', 'resp', 'actif', 0, 'RISE', '07:58'],
  ['u7', 'Sophie Marchand', 'sophie.marchand@example.com', 'resp', 'actif', 19, 'RISE'],
  ['u8', 'Thomas Girard', 'thomas.girard@example.com', 'resp', 'actif', 3, 'RISE'],
  ['u9', 'Élodie Faure', 'elodie.faure@example.com', 'resp', 'actif', 10, 'RISE'],
  ['u10', 'Isabelle Perrin', 'isabelle.perrin@example.com', 'resp', 'actif', 17, 'RISE'],
  ['u11', 'Marc Delorme', 'marc.delorme@example.com', 'lec', 'suspendu', 41, 'RISE'],
  ['u12', 'Antoine Mercier', 'antoine.mercier@example.com', 'lec', 'invité', 8, 'RISE'],
  ['u13', 'Camille Rey', 'camille.rey@example.com', 'pmo', 'actif', 0, 'RISE ATLAS', '10:02'],
  ['u14', 'Olivier Chevalier', 'olivier.chevalier@example.com', 'lec', 'actif', 22, 'RISE'],
  ['u15', 'Léa Fontaine', 'lea.fontaine@example.com', 'lec', 'actif', 0, 'RISE', '07:40'],
  ['u16', 'Vincent Lambert', 'vincent.lambert@example.com', 'lec', 'actif', 13, 'RISE'],
  ['u17', 'Henri Valmont', 'henri.valmont@example.com', 'lec', 'actif', 20, 'RISE'],
  ['u18', 'François Mallet', 'francois.mallet@example.com', 'lec', 'actif', 4, 'RISE'],
  ['u19', 'Guillaume Picard', 'guillaume.picard@example.com', 'lec', 'actif', 11, 'RISE'],
  ['u20', 'Catherine Vidal', 'catherine.vidal@example.com', 'lec', 'actif', 18, 'RISE'],
  ['u21', 'Aurélie Masson', 'aurelie.masson@example.com', 'lec', 'actif', 2, 'RISE'],
  ['u22', 'Valérie Collin', 'valerie.collin@example.com', 'lec', 'actif', 9, 'RISE'],
  ['u23', 'Stéphane Noël', 'stephane.noel@example.com', 'lec', 'actif', 16, 'RISE'],
  ['u24', 'Patrick Barbier', 'patrick.barbier@example.com', 'lec', 'actif', 0, 'RISE'],
  ['u25', 'Mathieu Caron', 'mathieu.caron@example.com', 'lec', 'actif', 7, 'RISE'],
  ['u26', 'Inès Haddad', 'ines.haddad@example.com', 'lec', 'actif', 14, 'RISE'],
  ['u27', 'Hugo Lemaire', 'hugo.lemaire@example.com', 'lec', 'actif', 21, 'RISE'],
  ['u28', 'Claire Dumont', 'claire.dumont@example.com', 'lec', 'actif', 5, 'RISE'],
  ['u29', 'Nicolas Brun', 'nicolas.brun@example.com', 'lec', 'actif', 12, 'RISE'],
  ['u30', 'Sandrine Moulin', 'sandrine.moulin@example.com', 'lec', 'actif', 19, 'RISE'],
  ['u31', 'Arnaud Leroy', 'arnaud.leroy@example.com', 'lec', 'invité', 3, 'RISE'],
  ['u32', 'Bernard Giraud', 'bernard.giraud@example.com', 'lec', 'actif', 10, 'RISE'],
  ['u33', 'Pauline Renard', 'pauline.renard@example.com', 'lec', 'actif', 17, 'RISE'],
  ['u34', 'Maxime Arnaud', 'maxime.arnaud@example.com', 'lec', 'actif', 1, 'RISE'],
  ['u35', 'Chloé Bertin', 'chloe.bertin@example.com', 'lec', 'actif', 8, 'RISE'],
  ['u36', 'Romain Gauthier', 'romain.gauthier@example.com', 'lec', 'actif', 15, 'RISE'],
  ['u37', 'Didier Carré', 'didier.carre@example.com', 'lec', 'actif', 22, 'RISE'],
  ['u38', 'Manon Petit', 'manon.petit@example.com', 'lec', 'invité', 6, 'RISE'],
];

const STATUS = { actif: 'ACTIVE', invité: 'INVITED', suspendu: 'SUSPENDED' } as const;
const SEV = { info: 'INFO', sensible: 'SENSITIVE', critique: 'CRITICAL' } as const;

/** Projets de la bibliothèque autres que RISE (brief Console § 12 : sans chantiers ni habilitations réels). */
export const OTHER_PROJECTS = [
  { code: 'ATLAS', name: 'ATLAS — Refonte finance groupe', client: 'AMC Corp · Direction financière', status: 'ACTIVE', phase: 'Realize · Paramétrage', start: '2025-02-03', end: '2027-06-30', counts: [2, 5, 6, 24], health: 'ok', created: '2025-01-20' },
  { code: 'HORIZON', name: 'HORIZON — Portail fournisseurs', client: 'AMC Corp · Achats', status: 'ACTIVE', phase: 'Explore · Ateliers', start: '2026-03-02', end: '2027-12-17', counts: [1, 5, 4, 15], health: 'ok', created: '2026-02-10' },
  { code: 'NOVA', name: 'NOVA — Data platform', client: 'AMC Corp · DSI', status: 'PREPARATION', phase: 'Préparation', start: '2026-11-02', end: '2028-03-31', counts: [1, 4, 3, 9], health: 'neu', created: '2026-09-01' },
  { code: 'ORBIT', name: 'ORBIT — Migration messagerie', client: 'AMC Corp · IT', status: 'CLOSED', phase: 'Clos le 30 juin 2025', start: '2024-01-08', end: '2025-06-30', counts: [1, 4, 3, 11], health: 'neu', created: '2023-12-01' },
] as const;

export async function seedAdmin(db: PrismaClient): Promise<void> {
  // ── Skills de Jev : les cinq skills de démonstration (mêmes données initiales que la migration 20261003000000_skills_jev) ──
  await db.skill.createMany({ data: DEMO_SKILLS.map((k, i) => ({ ...k, position: i + 1, updatedBy: 'Données initiales' })) });
  // ── Registre des cartes API : services déjà appelés par les widgets (mêmes données que la migration 20261006000000_registre_api) ──
  await db.apiCard.createMany({
    data: [
      { id: 'open-meteo-geocodage', name: 'Open-Meteo · géocodage', category: 'Météo', endpoint: 'https://geocoding-api.open-meteo.com/v1/search?name=Paris&count=1&format=json', widgets: ['Météo · ville'], updatedBy: 'Données initiales' },
      { id: 'open-meteo', name: 'Open-Meteo · prévisions', category: 'Météo', endpoint: 'https://api.open-meteo.com/v1/forecast?latitude=48.85&longitude=2.35&current=temperature_2m', widgets: ['Météo · ville'], updatedBy: 'Données initiales' },
    ],
  });
  // ── Flux RSS d'actualités (registre des cartes API) : Le Monde, L’Équipe, BBC (Les Échos et GDELT retirés le 28/09/2026) ──
  await db.apiCard.createMany({
    data: [
      { id: 'rss-le-monde', name: 'Le Monde', category: 'Actualités', endpoint: 'https://www.lemonde.fr/rss/une.xml', feed: true, widgets: ['Actualités'], updatedBy: 'Données initiales' },
      { id: 'rss-lequipe', name: 'L’Équipe', category: 'Actualités', endpoint: 'https://dwh.lequipe.fr/api/edito/rss?path=/', feed: true, widgets: ['Actualités'], updatedBy: 'Données initiales' },
      { id: 'rss-bbc', name: 'BBC News', category: 'Actualités', endpoint: 'https://feeds.bbci.co.uk/news/rss.xml', feed: true, widgets: ['Actualités'], updatedBy: 'Données initiales' },
    ],
  });
  // ── Persona de Jev : valeur initiale (même donnée que la migration 20261004000000_persona_jev) ──
  await db.persona.create({ data: { id: 'jev', ...DEMO_PERSONA.identity, soul: DEMO_PERSONA.soul, updatedBy: 'Données initiales' } });
  // ── Projets de la bibliothèque (hors RISE) ──
  for (const p of OTHER_PROJECTS) {
    await db.project.create({
      data: {
        id: p.code,
        clientId: 'c1',
        code: p.code,
        name: p.name,
        startDate: p.start,
        targetEndDate: p.end,
        status: p.status,
        createdAt: new Date(`${p.created}T08:00:00Z`),
        contentBlocks: {
          create: {
            key: 'project.display',
            // Valeurs d'affichage de la démonstration : aucun référentiel n'existe pour ces projets.
            data: { client: p.client, phase: p.phase, health: p.health, demoCounts: { waves: p.counts[0], phases: p.counts[1], workstreams: p.counts[2], persons: p.counts[3] } },
          },
        },
      },
    });
  }
  await db.contentBlock.upsert({
    where: { projectId_key: { projectId: RISE_ID, key: 'library.display' } },
    create: { projectId: RISE_ID, key: 'library.display', data: { phase: 'Deploy · Recette utilisateur', health: 'warn' } },
    update: {},
  });

  // ── Comptes (liés aux personnes du référentiel RISE par e-mail) ──
  const persons = await db.person.findMany({ where: { projectId: RISE_ID } });
  const personByMail = Object.fromEntries(persons.map((p) => [p.email.toLowerCase(), p.id]));
  for (const [id, name, email, prof, st, days, projects, time] of USERS) {
    const status = STATUS[st as keyof typeof STATUS];
    const [hh, mm] = (time ?? '09:00').split(':').map(Number);
    const lastLogin = status === 'INVITED' ? null : new Date(Date.UTC(2026, 8, 26 - days, hh - 2, mm));
    const invitedAt = status === 'INVITED' ? back(days * 24 * 60) : new Date('2024-03-01T08:00:00Z');
    await db.account.create({
      data: {
        id,
        email,
        fullName: name,
        personId: personByMail[email] ?? null,
        status,
        invitedAt,
        inviteExpiresAt: status === 'INVITED' ? new Date(invitedAt.getTime() + 14 * 86_400_000) : null,
        lastLoginAt: lastLogin,
        profile:
          id === 'u1'
            ? { position: 'Directeur de projet', company: 'Onepoint', team: 'Onepoint', phone: '+33 6 12 48 90 27', city: 'Paris', country: 'France', language: 'Français', timezone: 'Europe/Paris (UTC+2)' }
            : undefined,
        projects: { create: projects.split(' ').map((code) => ({ projectId: code })) },
      },
    });
    // Profil global PMO sur les autres projets rattachés (sur RISE, il vient de la personne).
    if (prof === 'pmo') {
      for (const code of projects.split(' ').filter((c) => c !== RISE_ID)) {
        await db.habilitation.create({ data: { id: `hab-${id}-${code}`, projectId: code, accountId: id, profile: 'PMO' } });
      }
    }
  }
  // Administrateur (habilitation h02 de rise-data + admins[] de la console).
  await db.adminGrant.create({ data: { accountId: 'u1', since: new Date('2025-01-14T08:00:00Z') } });

  // Sessions de l'administrateur connecté (`sess`).
  await db.authSession.createMany({
    data: [
      { id: 's1', accountId: 'u1', device: 'MacBook Pro · Chrome', location: 'Paris, France', createdAt: back(60), lastSeenAt: DEMO_NOW },
      { id: 's2', accountId: 'u1', device: 'iPhone 15 · Safari', location: 'Paris, France', createdAt: back(60 * 30), lastSeenAt: back(180) },
      { id: 's3', accountId: 'u1', device: 'Windows · Edge', location: 'Lyon, France', createdAt: back(60 * 24 * 5), lastSeenAt: back(60 * 48) },
    ],
  });

  // ── Journal d'audit initial (AUDIT0) ──
  const AUDIT0: Array<[string, string, string, keyof typeof SEV, number, string]> = [
    ['Système', 'Échec du test de clé API', 'Google · 401 clé révoquée', 'critique', 124, 'Provider'],
    ['Julien Morel', 'Attribution d’un profil global', 'Camille Rey · RISE · profil PMO attribué', 'sensible', 312, 'Account'],
    ['Julien Morel', 'Création d’un snapshot manuel', 'RISE · Avant le 19e COPIL', 'info', 60 * 65 + 44, 'Snapshot'],
    ['Camille Rey', 'Demande d’activation de module', 'Suivi des bénéfices · RISE', 'info', 60 * 48 + 40, 'ModuleRequest'],
    ['Julien Morel', 'Suspension d’un utilisateur', 'Marc Delorme', 'sensible', 60 * 72 + 15, 'Account'],
    ['Julien Morel', 'Rotation de clé API', 'OpenAI', 'critique', 60 * 96 + 200, 'Provider'],
    ['Julien Morel', 'Invitation d’un utilisateur', 'Antoine Mercier · Lecteur', 'info', 60 * 24 * 9, 'Account'],
    ['Julien Morel', 'Changement de modèle principal', 'Analyse de documents → Gemini 2.5 Pro', 'sensible', 60 * 24 * 12, 'ModelAssignment'],
    ['Julien Morel', 'Attribution d’un profil global', 'Robin Lefèvre · RISE · PMO', 'sensible', 60 * 24 * 18, 'Account'],
    ['Julien Morel', 'Export de snapshot', 'ATLAS · état du 3 août', 'critique', 60 * 24 * 21, 'Snapshot'],
  ];
  for (const [who, action, target, sev, min, entityType] of AUDIT0) {
    const acc = who === 'Julien Morel' ? 'u1' : who === 'Camille Rey' ? 'u13' : null;
    await db.auditEntry.create({
      data: {
        at: back(min),
        accountId: acc,
        actorName: who,
        personId: acc === 'u1' ? 'p02' : acc === 'u13' ? 'p13' : null,
        profileUsed: acc === 'u1' ? 'ADMIN' : acc === 'u13' ? 'PMO' : null,
        origin: acc ? 'MANUAL' : 'SYSTEM',
        severity: SEV[sev],
        action,
        target,
        entityType,
      },
    });
  }

  // ── Fournisseurs et modèles ──
  // Clés de démonstration (fictives), chiffrées : le test réel les refusera.
  const PROV = [
    { id: 'anthropic', name: 'Anthropic', key: 'sk-ant-demo-000000000000000000007Q2f' },
    { id: 'openai', name: 'OpenAI', key: 'sk-proj-demo-00000000000000000000m81X' },
    { id: 'mistral', name: 'Mistral AI', key: 'demo-mistral-0000000000000000000Zp0c' },
    { id: 'google', name: 'Google', key: 'AIza-demo-revoked-00000000000000Qe4k' },
  ] as const;
  for (const p of PROV) {
    await db.provider.create({
      data: {
        id: p.id,
        name: p.name,
        keyPrefix: p.key.startsWith('sk-ant-') ? 'sk-ant-' : p.key.startsWith('sk-proj-') ? 'sk-proj-' : p.key.startsWith('AIza') ? 'AIza' : '',
        keyLast4: p.key.slice(-4),
        keyCipher: encryptSecret(p.key),
        // Clés fictives : jamais testées tant que l'administrateur ne les a pas remplacées (test réel, 28/09/2026).
        status: 'UNTESTED',
      },
    });
  }
  // Modèles, affectation et consommation : aucun à l'amorçage depuis la réinitialisation du 28/09/2026
  // (docs/DECISIONS.md). L'ancien jeu reste disponible pour les tests : `seedDemoAi()`.
  await db.budgetThreshold.createMany({
    data: [
      { id: 'all', limitEur: 1200, warnPct: 80, enabled: true },
      { id: 'insights', limitEur: 800, warnPct: 80, enabled: true },
      { id: 'docs', limitEur: 400, warnPct: 80, enabled: true },
      // `crud` : pas de plafond par défaut (brief Console § 6.3).
      { id: 'crud', limitEur: null, warnPct: 80, enabled: false },
    ],
  });

  // ── Snapshots (SNAPS0) ; les écarts EV sont rattachés au snapshot où ils apparaissent ──
  const SN = (m0: number, d: number, h: number, mi: number) => paris(2026, m0 + 1, d, h, mi);
  const SNAPS: Record<string, Array<[string, Date, string?, string?]>> = {
    RISE: [['r1', SN(6, 17, 4, 0)], ['r2', SN(6, 26, 18, 30), 'Après le 18e COPIL', 'Julien Morel'], ['r3', SN(7, 21, 4, 0)], ['r4', SN(7, 28, 4, 0)], ['r5', SN(8, 4, 4, 0)], ['r6', SN(8, 8, 11, 5), 'Replanification du Run 3', 'Julien Morel'], ['r7', SN(8, 11, 4, 0)], ['r8', SN(8, 18, 4, 0)], ['r9', SN(8, 22, 16, 40), 'Avant le 19e COPIL', 'Julien Morel'], ['r10', SN(8, 25, 4, 0)]],
    ATLAS: [['a1', SN(7, 3, 9, 0), 'Avant la migration du lot 2', 'Julien Morel'], ['a2', SN(8, 11, 4, 0)], ['a3', SN(8, 18, 4, 0)]],
    HORIZON: [['h1', SN(8, 11, 4, 0)], ['h2', SN(8, 18, 4, 0)]],
  };
  const EV: Array<[number, string, string, string, string?, string?, string?]> = [
    [1, 'mod', 'Jalon', 'J01 · Fin de la recette Finance', 'Date prévue', '12 sept. 2026', '19 sept. 2026'], [1, 'add', 'Risque', 'Disponibilité de l’équipe intégrateur'], [1, 'mod', 'Action', 'Spécifications des flux Achats', 'Avancement', '60 %', '100 %'],
    [2, 'add', 'Action', 'Plan de conduite du changement'], [2, 'mod', 'Risque', 'Retard des flux Brand X', 'Probabilité', '3', '4'],
    [3, 'add', 'Livrable', 'Dossier d’architecture v2'], [3, 'del', 'Livrable', 'Note de cadrage v0 (doublon)'], [3, 'mod', 'Action', 'Migration du référentiel fournisseurs', 'Avancement', '20 %', '40 %'],
    [4, 'mod', 'Action', 'Recette des interfaces SI Achats', 'Responsable', 'Karim Benali', 'Élodie Faure'], [4, 'add', 'Action', 'Paramétrage des workflows de validation'],
    [5, 'mod', 'Jalon', 'J06 · Go / No-Go Go-Live', 'Date prévue', '4 oct. 2026', '15 mars 2027'], [5, 'add', 'Risque', 'Charge du support en période de clôture'],
    [6, 'mod', 'Action', 'Migration du référentiel fournisseurs', 'Date de fin', '30 sept.', '16 oct.'], [6, 'mod', 'Jalon', 'J08 · Go-Live Lot 1', 'Date prévue', '1er nov. 2026', '1er avr. 2027'], [6, 'del', 'Action', 'Atelier en doublon · cadrage du reporting'],
    [7, 'mod', 'Action', 'Migration du référentiel fournisseurs', 'Avancement', '40 %', '65 %'], [7, 'add', 'Livrable', 'Plan de recette utilisateur'],
    [8, 'mod', 'Risque', 'Disponibilité de l’équipe intégrateur', 'Statut', 'Ouvert', 'En mitigation'], [8, 'add', 'Action', 'Formation des key users'], [8, 'mod', 'Livrable', 'Dossier d’architecture v2', 'Statut', 'En rédaction', 'Validé'],
    [9, 'mod', 'Action', 'Recette des interfaces SI Achats', 'Avancement', '30 %', '55 %'], [9, 'del', 'Risque', 'Indisponibilité de la salle de formation'], [9, 'add', 'Action', 'Préparation du 20e COPIL'], [9, 'mod', 'Jalon', 'J07 · Répétition générale', 'Responsable', 'Karim Benali', 'Antoine Mercier'],
  ];
  const BASE: Record<string, Record<string, number>> = {
    RISE: { Action: 138, Jalon: 12, Risque: 17, Livrable: 34 },
    ATLAS: { Action: 96, Jalon: 9, Risque: 11, Livrable: 22 },
    HORIZON: { Action: 54, Jalon: 6, Risque: 7, Livrable: 12 },
  };
  for (const [project, list] of Object.entries(SNAPS)) {
    for (const [ix, [id, t, label, by]] of list.entries()) {
      const changes = project === RISE_ID ? EV.filter((e) => e[0] === ix).map(([, op, entity, object, field, before, after]) => ({ op, entity, object, field: field ?? null, before: before ?? null, after: after ?? null })) : [];
      await db.snapshot.create({
        data: {
          id,
          projectId: project,
          takenAt: t,
          kind: label ? 'MANUAL' : 'AUTO',
          label: label ?? null,
          takenBy: by ?? null,
          takenById: by ? 'u1' : null,
          status: 'DONE',
          // Snapshots de démonstration : pas de contenu capturé ; écarts connus avec le précédent.
          stats: { counts: BASE[project], demo: true, changesFromPrevious: changes } as Prisma.InputJsonValue,
        },
      });
    }
  }
  for (const code of [RISE_ID, ...OTHER_PROJECTS.map((p) => p.code)]) {
    await db.snapshotSchedule.create({ data: { projectId: code, enabled: code !== 'ORBIT', frequency: 'Hebdomadaire', day: 'vendredi', hour: '04:00', retention: '12 mois' } });
  }

  // ── Notifications ──
  const PROMPTS: Record<string, string> = {
    n1: 'Tu es l’assistant PMO du projet {projet}. Le jalon {jalon} a dépassé sa date prévue du {date}. Rédige une alerte de 3 phrases maximum : le constat, l’impact probable sur le planning et l’action attendue du responsable. Ton factuel, sans formule de politesse.',
    n2: 'Tu es l’assistant PMO du projet {projet}. Le risque « {risque} » est devenu critique. Résume en 2 phrases pourquoi, puis propose une première action de traitement. Ne cite que des faits présents dans les données du projet.',
    n3: 'Rédige une alerte courte pour l’administrateur : la consommation IA du mois atteint {seuil} du plafond. Indique la fonction qui consomme le plus et un levier d’économie chiffré.',
    n4: 'Tu es l’assistant PMO du projet {projet}. Rédige la synthèse de la {semaine} en 5 puces : avancement, jalons des 15 prochains jours, risques critiques, décisions attendues, points d’attention. 120 mots maximum.',
    n5: 'Le document {document} vient d’être analysé. Liste en puces les décisions, actions et risques extraits, chacun avec sa page source. Termine par : « À vérifier avant intégration ».',
  };
  const RULES = [
    { id: 'n1', kind: 'ALERT', name: 'Jalon en retard', tg: ['resp', 'pmo'], fq: 'IMMEDIATE', ch: ['APP', 'EMAIL'], on: true, sub: 'Jalon en retard · {jalon}', body: 'Le jalon {jalon} du projet {projet} a dépassé sa date prévue du {date}. Ouvrez le planning pour réviser la trajectoire.', pj: ['RISE', 'ATLAS'], model: 'haiku' },
    { id: 'n2', kind: 'ALERT', name: 'Risque critique ouvert', tg: ['resp', 'pmo'], fq: 'IMMEDIATE', ch: ['APP', 'EMAIL'], on: true, sub: 'Nouveau risque critique · {projet}', body: 'Le risque « {risque} » est devenu critique (probabilité × impact ≥ 20) sur {projet}. Un plan de traitement est attendu.', pj: ['RISE', 'ATLAS', 'HORIZON', 'NOVA'], model: 'sonnet' },
    { id: 'n3', kind: 'ALERT', name: 'Seuil budgétaire IA atteint', tg: ['pmo'], fq: 'IMMEDIATE', ch: ['EMAIL'], on: true, sub: 'Budget IA : seuil de {seuil} atteint', body: 'La consommation IA du mois atteint {seuil} du plafond fixé. Consultez la console pour ajuster les modèles ou le budget.', pj: [], model: 'haiku', platform: true },
    { id: 'n4', kind: 'NOTIFICATION', name: 'Synthèse hebdomadaire du projet', tg: ['pmo', 'resp'], fq: 'WEEKLY', day: 'lundi', hour: '08:00', ch: ['APP', 'EMAIL'], on: true, sub: '{projet} · votre synthèse de la {semaine}', body: 'Avancement, jalons à venir et points d’attention de la semaine pour {projet}.', pj: ['RISE'], model: 'sonnet' },
    { id: 'n5', kind: 'NOTIFICATION', name: 'Nouveau document analysé', tg: ['resp'], fq: 'DAILY', hour: '18:00', ch: ['APP'], on: false, sub: 'Document analysé · {document}', body: 'Jev a extrait les décisions et actions de {document}. Vérifiez les éléments proposés avant intégration.', pj: ['RISE', 'HORIZON'], model: 'mlarge' },
  ] as const;
  for (const r of RULES) {
    await db.notificationRule.create({
      data: {
        id: r.id,
        kind: r.kind,
        name: r.name,
        targetProfiles: [...r.tg],
        projectIds: [...r.pj],
        platform: 'platform' in r ? r.platform : false,
        modelId: r.model,
        prompt: PROMPTS[r.id],
        subject: r.sub,
        body: r.body,
        frequency: r.fq,
        day: 'day' in r ? r.day : null,
        hour: 'hour' in r ? r.hour : null,
        channels: [...r.ch],
        trigger: ({ n1: 'MILESTONE_LATE', n2: 'RISK_CRITICAL', n3: 'BUDGET_THRESHOLD', n4: 'SCHEDULE', n5: 'DOCUMENT_ANALYZED' } as const)[r.id],
        enabled: r.on,
      },
    });
  }
  // Historique des envois : vide ; le jeu d'essai (`seedDemoDeliveries`) n'est chargé que par les tests.

  // ── Modules (Q10 : Budget inactif partout) et demandes ──
  await db.module.create({ data: { id: 'bud', name: 'Budget', description: 'Budget prévisionnel, consommé, reste à faire et arbitrages.', scope: 'OFF' } });
  await db.module.create({ data: { id: 'ben', name: 'Suivi des bénéfices', description: 'Indicateurs de valeur, trajectoire des bénéfices et revues.', scope: 'OFF' } });
  await db.moduleRequest.create({ data: { id: 'q1', moduleId: 'ben', projectId: RISE_ID, requestedById: 'u13', requestedBy: 'Camille Rey', at: back(60 * 48 + 40) } });
}

/** Historique des envois de démonstration (10 envois, dont un échec) : tests seulement, depuis le 29/09/2026. */
export async function seedDemoDeliveries(db: PrismaClient): Promise<void> {
  const HIST: Array<[string, number, 'APP' | 'EMAIL', number, 'OK' | 'ERROR']> = [
    ['n3', 125, 'EMAIL', 3, 'OK'], ['n1', 300, 'APP', 4, 'OK'], ['n1', 300, 'EMAIL', 4, 'OK'], ['n2', 60 * 26, 'EMAIL', 3, 'ERROR'], ['n2', 60 * 26, 'APP', 3, 'OK'],
    ['n4', 60 * 24 * 4 + 146, 'EMAIL', 9, 'OK'], ['n4', 60 * 24 * 4 + 146, 'APP', 9, 'OK'], ['n1', 60 * 24 * 6, 'EMAIL', 4, 'OK'], ['n3', 60 * 24 * 9, 'EMAIL', 3, 'OK'], ['n4', 60 * 24 * 11 + 146, 'EMAIL', 9, 'OK'],
  ];
  for (const [ruleId, min, channel, n, status] of HIST) {
    await db.delivery.create({
      data: { ruleId, at: back(min), channel, recipientsCount: n, status, error: status === 'ERROR' ? '2 adresses rejetées par le serveur de messagerie' : null, projectId: ruleId === 'n3' ? null : RISE_ID },
    });
  }
}

/**
 * Jeu de modèles de démonstration (9 LLM, affectation des 3 fonctions, 90 jours de consommation recalés
 * sur 1 032,40 € au 26/09). Il n'est plus chargé par `npm run db:seed` : les tests e2e l'utilisent
 * comme jeu d'essai de la passerelle LLM, de l'affectation et de la consommation.
 */
export async function seedDemoAi(db: PrismaClient): Promise<void> {
  // État des clés du jeu d'essai (les tests remplacent l'appel réel au fournisseur par un double).
  for (const [id, status, latencyMs, ago, lastError] of [
    ['anthropic', 'OK', 384, 118, null], ['openai', 'OK', 512, 118, null], ['mistral', 'OK', 297, 118, null],
    ['google', 'ERROR', null, 124, '401 · API key revoked. La clé a été révoquée côté fournisseur.'],
  ] as const) {
    await db.provider.update({ where: { id }, data: { status, latencyMs, lastTestedAt: back(ago), lastError } });
  }
  const MODELS: Array<[string, string, string, string, number, number, boolean]> = [
    ['opus', 'anthropic', 'Claude Opus 4.1', 'Raisonnement long et analyses complexes.', 15, 75, true],
    ['sonnet', 'anthropic', 'Claude Sonnet 4.5', 'Polyvalent, excellent en synthèse et en rédaction.', 3, 15, true],
    ['haiku', 'anthropic', 'Claude Haiku 4.5', 'Rapide et économique pour les opérations courantes.', 1, 5, true],
    ['gpt5', 'openai', 'GPT-5', 'Généraliste haut de gamme.', 1.25, 10, true],
    ['gpt5mini', 'openai', 'GPT-5 mini', 'Version légère pour les volumes élevés.', 0.25, 2, true],
    ['mlarge', 'mistral', 'Mistral Large 2', 'Modèle européen, hébergement UE.', 2, 6, true],
    ['msmall', 'mistral', 'Mistral Small 3', 'Très faible coût, tâches simples.', 0.1, 0.3, true],
    ['gpro', 'google', 'Gemini 2.5 Pro', 'Grand contexte, adapté aux documents longs.', 1.25, 10, true],
    ['gflash', 'google', 'Gemini 2.5 Flash', 'Rapide, multimodal.', 0.3, 2.5, false],
  ];
  const RELEASE: Record<string, [string, number]> = {
    opus: ['2025-08-05', 32000], sonnet: ['2025-09-29', 64000], haiku: ['2025-10-15', 64000], gpt5: ['2025-08-07', 128000], gpt5mini: ['2025-08-07', 128000],
    mlarge: ['2024-07-24', 32000], msmall: ['2025-03-17', 32000], gpro: ['2025-06-17', 65536], gflash: ['2025-06-17', 65536],
  };
  for (const [id, providerId, name, description, pin, pout, active] of MODELS) {
    await db.aiModel.create({ data: { id, providerId, name, description, priceInPerMTok: pin, priceOutPerMTok: pout, active, releaseDate: new Date(RELEASE[id][0]), maxOutputTokens: RELEASE[id][1] } });
  }
  // Chaîne Documents : un Embedding et un Reranking (Cohere, facturé à la requête).
  await db.provider.upsert({ where: { id: 'cohere' }, create: { id: 'cohere', name: 'Cohere', keyPrefix: '', keyLast4: 'Co01', keyCipher: encryptSecret('cohere-demo-000000000000000000Co01'), status: 'OK', latencyMs: 288, lastTestedAt: back(118) }, update: {} });
  await db.aiModel.create({ data: { id: 'te3large', providerId: 'openai', name: 'text-embedding-3-large', description: 'Vecteurs 3 072 dimensions', category: 'EMBEDDING', priceInPerMTok: 0.12, releaseDate: new Date('2024-01-25'), dimensions: [3072, 1536, 1024, 512, 256], defaultDimension: 3072, contextTokens: 8191, providerModelId: 'text-embedding-3-large' } });
  await db.aiModel.create({ data: { id: 'rerank35', providerId: 'cohere', name: 'Rerank 3.5', description: 'Reclassement multilingue', category: 'RERANKING', priceUnit: 'REQUESTS', pricePer1kRequests: 1.85, releaseDate: new Date('2024-12-02') } });
  await db.modelAssignment.create({ data: { functionId: 'doc_vec', primaryModelId: 'te3large', fallbackModelId: null, primaryDimension: 3072 } });
  await db.modelAssignment.create({ data: { functionId: 'doc_rrk', primaryModelId: 'rerank35', fallbackModelId: null } });
  // Rapports : secours Mistral Large 2 (32k) plus court que la sortie requise, pour illustrer l'alerte (spécification IA § 7).
  const asg = { insights: { p: 'sonnet', f: 'gpt5' }, crud: { p: 'haiku', f: 'gpt5mini' }, rapports: { p: 'sonnet', f: 'mlarge' }, guidage: { p: 'haiku', f: 'gpt5mini' }, doc_syn: { p: 'gpro', f: 'sonnet' } };
  for (const [fn, a] of Object.entries(asg)) {
    await db.modelAssignment.create({ data: { functionId: fn, primaryModelId: a.p, fallbackModelId: a.f } });
  }

  // ── Consommation de démonstration (genUsage, déterministe) ──
  const models = await db.aiModel.findMany();
  const rows = genDemoUsage(models, asg, '2026-09-26', 1032.4);
  await db.usageRecord.createMany({
    data: rows.map((x) => ({
      at: new Date(`${x.date}T10:00:00Z`),
      projectId: RISE_ID,
      functionId: x.fn,
      modelId: x.model,
      providerId: x.provider,
      tokensIn: x.tin,
      tokensOut: x.tout,
      costEur: x.cost,
      fallbackUsed: x.fallback,
      source: x.fn === 'crud' ? 'JEV' : 'COCKPIT',
    })),
  });
}
