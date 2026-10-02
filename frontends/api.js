// RISE Cockpit — branchement du frontend sur l'API (brief backend § 11).
//
// Ce module centralise :
//   1. l'accès HTTP (base, jeton, projet courant, get/post/patch/put/del, erreurs du serveur) ;
//   2. le chargement des données (`GET /bootstrap`, même forme que rise-data.js + planning-data.js,
//      complété par les sections de fiche projet, les tâches, les commentaires et les préférences) ;
//   3. la synchronisation centralisée : `attach(comp)` enveloppe `comp.setState`, compare l'état
//      avant/après sur les magasins persistants et traduit chaque changement en appel API ;
//      après chaque écriture réussie, les données sont rechargées (anti-rebond) et les magasins de
//      surcharge remis à zéro, pour que les identifiants attribués par le serveur remplacent ceux du
//      client. En cas d'erreur, le message du serveur s'affiche dans le toast existant et le
//      rechargement annule la modification locale ;
//   4. les appels réels qui remplacent les blocs « SIMULÉ » (météo, actualités, documents, Jev,
//      demandes d'activation de module).
//
// Chaque modification du fichier HTML qui s'appuie sur ce module est justifiée dans CHANGES-cockpit.md.
//
// Authentification (auth-api.js) : session par cookie ouverte sur /connexion ; sans session, ou quand
// elle expire, retour à l'écran de connexion. `?as=<personne>` (serveur en AUTH_DEV) garde la connexion
// de développement par jeton, pour les tests et la démonstration.

import * as Auth from './auth-api.js';

// ───────────────────────────── Accès HTTP ─────────────────────────────

/** Base de l'API : `window.RISE_API_BASE` si défini (ex. 'https://api.exemple.fr'), sinon même origine. */
const API_ROOT = ((typeof window !== 'undefined' && window.RISE_API_BASE) || '').replace(/\/+$/, '') + '/api';
const QS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
/** Projet courant : `?project=` sinon RISE. */
export const projectId = QS.get('project') || 'RISE';
/** Personne de la connexion de développement : `?as=` (sans `?as=`, session par cookie). */
const AS = QS.get('as') || '';
/** Connexion de développement par jeton (`?as=`) plutôt que session par cookie. */
const DEV = !!AS;
const DEFAULT_PERSON = 'p01';
const TOKEN_KEY = 'rise-token';
const TOKEN_AS_KEY = 'rise-token-as';

const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch (x) { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (x) { /* stockage indisponible */ } },
};

/** Erreur de l'API au format `{ code, message, fields?, usages? }`. */
export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.message) || 'Erreur ' + status);
    this.status = status;
    this.code = (body && body.code) || 'HTTP_' + status;
    this.fields = (body && body.fields) || null;
    this.usages = (body && body.usages) || null;
    // Corps complet (ex. doublon de la Base de connaissance : `existing`).
    this.body = body || null;
  }
}

/** Texte lisible d'une erreur (message du serveur, détail des champs et des usages). */
export function errorText(e) {
  if (!e) return 'Erreur inconnue';
  if (!(e instanceof ApiError)) return 'API injoignable — ' + (e.message || String(e));
  let t = e.message;
  if (e.usages && e.usages.length) t += ' : ' + e.usages.map((u) => u.label || u.id).join(', ');
  else if (e.fields) { const f = Object.values(e.fields).filter(Boolean); if (f.length) t += ' (' + f.join(' · ') + ')'; }
  return t;
}

let tokenPromise = null;
async function login(personId) {
  const r = await fetch(API_ROOT + '/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId }) });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, body);
  ls.set(TOKEN_KEY, body.token);
  ls.set(TOKEN_AS_KEY, personId);
  return body.token;
}
/** Jeton : localStorage `rise-token`, sinon connexion de développement (`?as=` ou p01). */
function token(renew) {
  if (!renew) {
    const t = ls.get(TOKEN_KEY), tAs = ls.get(TOKEN_AS_KEY);
    if (t && (!AS || AS === tAs)) return Promise.resolve(t);
  }
  if (!tokenPromise) tokenPromise = login(AS || ls.get(TOKEN_AS_KEY) || DEFAULT_PERSON).finally(() => { tokenPromise = null; });
  return tokenPromise;
}

/** Appel HTTP. `path` commençant par `/projects/` ou `/me`… est relatif à `/api`. */
export async function request(method, path, body, opts = {}) {
  const send = async (tok) => {
    const headers = { ...(tok ? { Authorization: 'Bearer ' + tok } : Auth.sessionHeaders('app')), ...(opts.headers || {}) };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    return fetch(API_ROOT + path, { method, headers, body: payload, credentials: 'same-origin' });
  };
  let r;
  if (DEV) {
    r = await send(await token());
    if (r.status === 401) r = await send(await token(true));
  } else {
    r = await send(null);
    // Session absente, expirée ou limitée (mot de passe provisoire) : retour à l'écran de connexion.
    if (r.status === 401 || r.status === 403) {
      const b = await r.clone().json().catch(() => null);
      if (r.status === 401 || (b && b.code === 'PASSWORD_CHANGE_REQUIRED')) {
        Auth.toLogin('app', b && b.code === 'SESSION_EXPIRED' ? 'expiree' : '');
        throw new ApiError(r.status, b);
      }
    }
  }
  if (opts.raw) {
    if (!r.ok) throw new ApiError(r.status, await r.json().catch(() => null));
    return r;
  }
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, data);
  return data;
}
const P = (path) => '/projects/' + encodeURIComponent(projectId) + path;
export const get = (path, o) => request('GET', path, undefined, o);
export const post = (path, body, o) => request('POST', path, body, o);
export const patch = (path, body, o) => request('PATCH', path, body, o);
export const put = (path, body, o) => request('PUT', path, body, o);
export const del = (path, o) => request('DELETE', path, undefined, o);
/** Raccourcis relatifs au projet courant. */
export const pget = (path, o) => get(P(path), o);
export const ppost = (path, body, o) => post(P(path), body, o);
export const ppatch = (path, body, o) => patch(P(path), body, o);
export const pput = (path, body, o) => put(P(path), body, o);
export const pdel = (path, o) => del(P(path), o);

/** `GET /bootstrap` : même forme que les exports de rise-data.js et planning-data.js. */
export const bootstrap = () => pget('/bootstrap');

// ───────────────────────────── Correspondances ─────────────────────────────

const inv = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const PLAN_STATUS = inv({ PLANNED: 'Prévue', IN_PROGRESS: 'En cours', DONE: 'Terminée' });
const WAVE_STATUS = inv({ PLANNED: 'Prévu', IN_PROGRESS: 'En cours', DONE: 'Terminé' });
const WS_STATUS = inv({ ACTIVE: 'Actif', CLOSED: 'Clos' });
const CLIENT_STATUS = inv({ ACTIVE: 'Actif', INACTIVE: 'Inactif' });
const FREQUENCY = inv({ DAILY: 'Quotidienne', WEEKLY: 'Hebdomadaire', BIWEEKLY: 'Bimensuelle', MONTHLY: 'Mensuelle', QUARTERLY: 'Trimestrielle', SEMIANNUAL: 'Semestrielle', ON_DEMAND: 'À la demande' });
const DECISION_STATUS = inv({ DRAFT: 'Brouillon', IN_REVIEW: 'En instruction', TO_ARBITRATE: 'À arbitrer', ARBITRATED: 'Arbitrée', CANCELLED: 'Annulée', SUPERSEDED: 'Remplacée' });
const ACTION_STATUS = { 'À faire': 'OPEN', 'Ouverte': 'OPEN', 'En cours': 'IN_PROGRESS', 'Bloquée': 'BLOCKED', 'Terminée': 'DONE' };
const TONE = { ok: 'OK', vig: 'WATCH', risk: 'RISK' };
const TONE_FRONT = inv(TONE);
const DELIV_RISK = { ok: 'OK', tens: 'TENSION', crit: 'CRITICAL' };
const DELIV_RISK_FRONT = inv(DELIV_RISK);
const TPL_SCOPE = { Projet: 'PROJECT', Vague: 'WAVE', Phase: 'PHASE', Chantier: 'WORKSTREAM' };
const MODULE_OF = { b: 'bud', n: 'ben' };
/** Chantier transverse par défaut des créations sans chantier (DECISIONS Q2). */
const DEFAULT_WS_CODE = 'C8';
/** Champs du tableau PROJECT du Référentiel → champs de `PATCH /project`. */
const PROJECT_FIELD = { name: 'name', objectives: 'objective', start: 'startDate', end: 'targetEndDate', currency: 'currency', tz: 'timezone', city: 'city', country: 'country', owner: 'programDirectorId' };
/** Tableaux du Référentiel → routes de l'API. */
const ROUTE = { CLIENT: 'clients', WAVE: 'waves', PHASE: 'phases', SUBPHASE: 'subphases', WORKSTREAM: 'workstreams', DELIVERABLE: 'deliverables', TEAM: 'teams', ROLE: 'roles', PERSON: 'persons', PROJECT_ASSIGNMENT: 'assignments', GOVERNANCE_BODY: 'governance-bodies', MILESTONE: 'milestones' };
/** Magasins de contenu libre de la fiche projet, persistés en sections (`PATCH /project/sections/ui.<nom>`, DECISIONS Q8). */
const SECTION_STORES = ['projEd', 'goliveEd', 'goliveDate', 'chronoEd'];
/** Préférences de l'utilisateur (`PATCH /api/me/preferences`). */
const PREF_OF = { dbL: 'dashboardLayout', dbInv: 'theme', profFirst: 'firstName', profCity: 'city', profPhotoUrl: 'photoUrl', profNotif: 'notifications' };

const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const pad2 = (n) => String(n).padStart(2, '0');

/** « JJ/MM/AAAA », « MM/AAAA » ou « AAAA » → { iso, prec } (borne de début ou de fin). */
export function parseRefDate(s, bound) {
  const v = String(s == null ? '' : s).trim();
  if (!v || v === '—' || v === 'non renseigné') return { iso: null, prec: 'D' };
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return { iso: m[3] + '-' + pad2(m[2]) + '-' + pad2(m[1]), prec: 'D' };
  m = /^(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) { const y = +m[2], mo = +m[1]; return { iso: y + '-' + pad2(mo) + '-' + (bound === 'end' ? pad2(new Date(y, mo, 0).getDate()) : '01'), prec: 'M' }; }
  m = /^(\d{4})$/.exec(v);
  if (m) return { iso: m[1] + (bound === 'end' ? '-12-31' : '-01-01'), prec: 'Y' };
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return { iso: v, prec: 'D' };
  return undefined; // format non reconnu
}
const FR_MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const frShort = (iso, year) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return (d === 1 ? '1er' : d) + ' ' + FR_MONTHS[m - 1] + (String(y) !== String(year) ? ' ' + y : ''); };

// ───────────────────────────── Synchronisation ─────────────────────────────

/** Magasins persistants observés dans l'état du composant. */
const STORES = ['ed', 'actStatus', 'sesEd', 'sesAdded', 'refValues', 'refDeleted', 'bmEd', 'bmAdd', 'phLots', 'txtEd', 'critEd', 'arbData', 'lvTrack',
  'mineArch', 'mineTitles', 'mineDetails', 'mineDue', 'mineCta', 'newTasks', 'gbExtra', 'gbMem', 'gbAdded', 'added', 'lvAdded', 'dlOwner', 'psAdded', 'psAcc',
  'roAdded', 'roTier', 'tmAdded', 'wsAdded', 'ipAdded', 'spAdded', 'phAdded', 'waAdded', 'spDesc', 'phDesc', 'plAdd', 'templates', 'tplHistory', 'cmts', 'modPh',
  ...SECTION_STORES, ...Object.keys(PREF_OF)];

/** Relecture pendant le traitement d'un document de la Base de connaissance (avancement, fin). */
const KB_POLL_MS = 2500;
/** Délai d'anti-rebond du rechargement après écriture (ms). */
const RELOAD_DEBOUNCE_MS = 400;
/** Délai de regroupement des saisies continues (frappe dans un champ lieu, heure, %…) (ms). */
const TYPING_DEBOUNCE_MS = 600;

export function attach(comp) {
  const S = {
    B: null, // dernier bootstrap reçu
    extra: {}, // barometer, tasks, sections, modules…
    base: {}, // valeurs hydratées des magasins (référence de comparaison)
    baseBm: null, // baromètre fusionné de référence
    gen: 0, // compteur de changements locaux
    pending: new Map(), // écritures en attente de regroupement : clé → { timer, run }
    chain: Promise.resolve(),
    inflight: 0,
    reloadTimer: 0,
    firstLoad: true,
    failed: false,
    sentCreations: new Set(), // créations déjà envoyées depuis le dernier rechargement
  };
  const raw = comp.setState.bind(comp);
  const toast = (t) => { if (t) comp.showToast(t); };
  const fail = (e) => { console.warn('[api]', e); toast(errorText(e)); scheduleReload(); };

  // ── Enveloppe de setState : comparaison avant/après sur les magasins persistants ──
  comp.setState = (update, cb) => {
    const before = comp.state;
    raw(update, cb);
    if (!S.B) return;
    const after = comp.state;
    for (const k of STORES) {
      if (before[k] === after[k]) continue;
      try { onChange(k, before[k], after[k]); } catch (e) { console.error('[api] synchro ' + k, e); }
    }
  };

  // ── File d'écriture : regroupement par clé, exécution séquentielle, rechargement anti-rebond ──
  function write(key, run, delay = 0, opts = {}) {
    S.gen++;
    const cur = S.pending.get(key);
    if (cur) clearTimeout(cur.timer);
    const job = { run };
    job.timer = setTimeout(() => {
      S.pending.delete(key);
      S.inflight++;
      S.chain = S.chain
        .then(() => job.run())
        .then((res) => { const w = res && res.warnings; if (w && w.length) toast(w.join(' · ')); if (!opts.noReload) scheduleReload(); })
        .catch(fail)
        .finally(() => { S.inflight--; });
    }, delay);
    S.pending.set(key, job);
  }
  /** PATCH/PUT regroupés : les corps successifs d'une même ressource sont fusionnés. */
  function writePatch(method, path, body, delay = 0, opts = {}) {
    const key = method + ' ' + path;
    const cur = S.pending.get(key);
    const merged = { ...((cur && cur.body) || {}), ...body };
    S.gen++;
    if (cur) clearTimeout(cur.timer);
    const job = { body: merged };
    job.timer = setTimeout(() => {
      S.pending.delete(key);
      S.inflight++;
      S.chain = S.chain
        .then(() => request(method, P(path), job.body))
        .then((res) => { const w = res && res.warnings; if (w && w.length) toast(w.join(' · ')); if (!opts.noReload) scheduleReload(); })
        .catch(fail)
        .finally(() => { S.inflight--; });
    }, delay);
    S.pending.set(key, job);
  }
  function scheduleReload() {
    clearTimeout(S.reloadTimer);
    S.reloadTimer = setTimeout(() => {
      if (S.pending.size || S.inflight) return scheduleReload();
      reload();
    }, RELOAD_DEBOUNCE_MS);
  }

  // ── Chargement et hydratation ──
  async function load() {
    const opt = (p) => p.catch((e) => { console.warn('[api] chargement partiel', e); return null; });
    const [B, project, tasks, comments, me, barometer, modules, invites, accStates] = await Promise.all([
      bootstrap(),
      opt(pget('/project')),
      opt(pget('/me/tasks')),
      opt(pget('/comments')),
      opt(get('/me?projectId=' + encodeURIComponent(projectId))),
      opt(pget('/barometer')),
      opt(pget('/modules')),
      pget('/invitation-requests').catch(() => null), // réservé au PMO
      pget('/account-states').catch(() => null), // état réel du compte de chaque personne (PMO)
    ]);
    return { B, project, tasks, comments, me, barometer, modules, invites, accStates };
  }

  async function reload() {
    const gen0 = S.gen;
    let L;
    try { L = await load(); } catch (e) { toast(errorText(e)); return; }
    if (S.gen !== gen0 || S.pending.size || S.inflight) return scheduleReload(); // saisie en cours : on attend
    hydrate(L);
  }

  function hydrate(L) {
    const B = prepare(L.B);
    // Base de connaissance : documents en cours de traitement → relecture régulière jusqu'à la fin (avancement, statut).
    clearTimeout(S.kbTimer);
    if (((L.B && L.B.documents) || []).some((d) => d.ext === 'PENDING')) S.kbTimer = setTimeout(() => reload(), KB_POLL_MS);
    S.B = B;
    S.extra = L;
    const byId = {};
    ((L.project && L.project.sections) || []).forEach((s) => { byId[s.key] = s.value; });
    const st = {
      data: B, plan: B, templates: B.templates, tplHistory: B.tplHistory, kbDocs: [],
      // Droits effectifs de l'utilisateur connecté (serveur : habilitations du compte ET de sa personne du référentiel).
      meAccess: (L.me && L.me.effective) || null,
      psAccSrv: L.accStates || null,
      ed: {}, actStatus: {}, sesEd: {}, sesAdded: [], refValues: {}, refDeleted: {}, bmEd: {}, bmAdd: {},
      phLots: hydratePhLots(B), txtEd: {}, critEd: {}, arbData: {}, lvTrack: {}, gbExtra: {}, gbMem: {}, gbAdded: [], added: {}, lvAdded: [], dlOwner: {},
      psAdded: [], psAcc: {}, roAdded: [], roTier: {}, tmAdded: [], wsAdded: [], ipAdded: [], spAdded: [], phAdded: [], waAdded: [], spDesc: {}, phDesc: {}, plAdd: {},
      newTasks: [], mineArch: {}, mineTitles: {}, mineDetails: {}, mineDue: {}, mineCta: {}, cmts: {}, modPh: {},
    };
    SECTION_STORES.forEach((k) => { const v = byId['ui.' + k]; st[k] = v && typeof v === 'object' ? v : {}; });
    // Fiches d'arbitrage : D-007 (fiche complète du jeu) → txtEd ; fiches saisies ensuite → arbData.
    B.decisions.forEach((d) => {
      const a = d.arbitration;
      if (!a) return;
      const hasContent = (a.texts && Object.keys(a.texts).length) || (a.criteria && a.criteria.length);
      if (!hasContent) return;
      if (d._fullSeed) { st.txtEd = { ...a.texts }; return; }
      st.arbData[d.id] = { tx: { ...a.texts }, crit: (a.criteria || []).map((c) => [c.name, c.weightPct + ' %', c.scoreA, c.commentA || '', c.scoreB, c.commentB || '']), dec: d.id };
    });
    // Livrables : risque saisi manuellement.
    B.model.DELIVERABLE.rows.forEach((r) => { if (r.riskOverride) st.lvTrack[r.id] = { risk: r.riskOverride }; });
    // Rôles : niveau (tier) stocké.
    B.model.ROLE.rows.forEach((r) => { if (r.tier != null) st.roTier[r.id] = r.tier; });
    // Invitations en attente (Q8 bis).
    (L.invites || []).filter((x) => x.status === 'PENDING').forEach((x) => { st.psAcc[x.personId] = 'pending'; });
    // Demandes d'activation de module en attente.
    (L.modules || []).forEach((m) => { const k = Object.keys(MODULE_OF).find((x) => MODULE_OF[x] === m.id); if (k && m.pendingRequest) st.modPh[k] = 2; });
    // Commentaires de cellule.
    (L.comments || []).forEach((c) => {
      const d = new Date(c.createdAt);
      (st.cmts[c.field] = st.cmts[c.field] || []).push({ who: String(c.authorName || '').split(' ')[0], text: c.text, val: '', when: pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' · ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()), id: c.id });
    });
    // Tâches manuelles.
    const meId = (B.me && B.me.personId) || null;
    (L.tasks || []).filter((t) => t.kind === 'MANUAL').forEach((t) => {
      st.newTasks.push({ id: t.id, author: meId, status: t.status, link: t.link || null, n: t.title, detail: t.detail || '', due: t.dueIso ? new Date(t.dueIso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : 'à planifier', dueIso: t.dueIso || '', cta: t.cta || 'Ouvrir', lvl: 'due' });
    });
    // Préférences (premier chargement uniquement : ensuite, l'écran fait foi).
    if (S.firstLoad && L.me && L.me.preferences) {
      const pf = L.me.preferences;
      if (Array.isArray(pf.dashboardLayout)) st.dbL = pf.dashboardLayout;
      if (pf.theme && typeof pf.theme === 'object') st.dbInv = pf.theme;
      if (pf.firstName != null) st.profFirst = pf.firstName;
      if (pf.city != null) { st.profCity = pf.city; st.dbExt = { ...(comp.state.dbExt || {}), home: pf.city }; }
      if (pf.photoUrl) st.profPhotoUrl = pf.photoUrl;
      if (pf.notifications && typeof pf.notifications === 'object') st.profNotif = pf.notifications;
    }
    raw(st);
    // Surcharges de « Mes tâches » : indexées par position dans la liste calculée.
    const keys = mineKeys();
    const mine = { mineArch: {}, mineTitles: {}, mineDetails: {}, mineDue: {}, mineCta: {} };
    const byKey = Object.fromEntries((L.tasks || []).map((t) => [(t.kind === 'MANUAL' ? 'TASK' : t.kind) + '/' + t.id, t]));
    const D = comp.mergedData() || {};
    keys.forEach((k, i) => {
      const t = byKey[k]; if (!t || k.startsWith('TASK/')) { if (t && t.archived) mine.mineArch[i] = frShort(B.today, 0); return; }
      const [type, id] = k.split('/');
      const src = type === 'ACTION' ? (D.actions || []).find((x) => x.id === id) : type === 'DECISION' ? (D.decisions || []).find((x) => x.id === id) : (D.milestones || []).find((x) => x.id === id);
      if (!src) return;
      const baseTitle = type === 'DECISION' ? src.t : src.n, baseDue = type === 'MILESTONE' ? src.iso : type === 'DECISION' ? src.ddIso || null : src.dueIso || null;
      if (t.title && t.title !== baseTitle) mine.mineTitles[i] = t.title;
      if (t.dueIso && t.dueIso !== baseDue) mine.mineDue[i] = t.dueIso;
      if (t.detail && t.detail !== (src.detail || null)) mine.mineDetails[i] = t.detail;
      if (t.cta) mine.mineCta[i] = t.cta;
      if (t.archived) mine.mineArch[i] = frShort(B.today, 0);
    });
    raw(mine);
    S.base = {};
    STORES.forEach((k) => { S.base[k] = comp.state[k]; });
    S.baseBm = clone((comp.mergedData() || {}).barometre);
    S.sentCreations = new Set();
    S.firstLoad = false;
    S.gen++;
  }

  /** Ajustements du bootstrap pour conserver le comportement d'origine de l'écran. */
  function prepare(B) {
    // Le Gantt ne sait pas dessiner un élément sans dates (chantier ou sous-phase créés depuis le Référentiel sans période).
    ['phases', 'subphases', 'chantiers'].forEach((k) => { B[k] = (B[k] || []).filter((x) => x.start && x.end); });
    B.decisions.forEach((d) => {
      const a = d.arbitration, hasContent = a && ((a.texts && Object.keys(a.texts).length) || (a.criteria && a.criteria.length));
      // `full` désigne dans l'écran la fiche complète du jeu (D-007) ; une fiche saisie ensuite passe par arbData.
      d._fullSeed = !!d.full && (!hasContent || d.id === 'D-007');
      if (d.full && !d._fullSeed) d.full = false;
    });
    return B;
  }

  function hydratePhLots(B) {
    const out = {};
    B.model.PHASE.rows.forEach((r) => {
      const ids = r.waveIds || [], wd = r.waveDates || {};
      if (ids.length <= 1 && !Object.keys(wd).length) return; // la règle de l'écran (« Lot n » + dates de la phase) suffit
      const m = {};
      ids.forEach((w) => { m[w] = wd[w] ? { start: wd[w].start, end: wd[w].end } : { start: r.cells[3], end: r.cells[4] }; });
      if (Object.keys(m).length) out[r.id] = m;
    });
    return out;
  }

  // ── Recherches dans le dernier bootstrap ──
  const M = (k) => (S.B && S.B.model[k] ? S.B.model[k].rows : []);
  const findRow = (k, id) => M(k).find((r) => r.id === id);
  const wsId = (name) => { if (!name) return null; const r = M('WORKSTREAM').find((x) => norm(x.cells[1]) === norm(name) || x.code === name || x.id === name); return r ? r.id : null; };
  const defaultWs = () => { const r = M('WORKSTREAM').find((x) => x.code === DEFAULT_WS_CODE); return r ? r.id : (M('WORKSTREAM')[0] || {}).id; };
  const bodyId = (name) => { const r = M('GOVERNANCE_BODY').find((x) => norm(x.cells[0]) === norm(name) || x.id === name || norm(x.shortName) === norm(name)); return r ? r.id : null; };
  const personId = (name) => { if (!name) return null; const v = String(name); if (v[0] === '@') return v.slice(1); const r = M('PERSON').find((x) => x.id === v || norm(x.cells[0]) === norm(v)); return r ? r.id : null; };
  const teamId = (name) => { const r = M('TEAM').find((x) => norm(x.cells[1]) === norm(name) || norm(x.cells[0]) === norm(name) || x.id === name); return r ? r.id : null; };
  const roleId = (label) => { const r = M('ROLE').find((x) => norm(x.cells[0]) === norm(label)); return r ? r.id : null; };
  const phaseId = (name) => { const r = M('PHASE').find((x) => norm(x.cells[1]) === norm(name) || x.id === name); return r ? r.id : null; };
  const waveId = (label) => { const m = /(\d+)/.exec(String(label || '')); const r = M('WAVE').find((x) => x.cells[0] === (m && m[1]) || x.id === label || norm(x.cells[1]) === norm(label)); return r ? r.id : null; };
  const subphaseByCode = (code) => (S.B ? S.B.subphases.find((s) => s.code === code || s.id === code) : null);
  const known = (list, id) => !!(S.B && (S.B[list] || []).some((x) => x.id === id));
  const planType = (id) => (S.B.phases.some((x) => x.id === id) ? 'phase' : S.B.subphases.some((x) => x.id === id) ? 'subphase' : S.B.chantiers.some((x) => x.id === id) ? 'workstream' : null);
  const sourceOf = (id) => {
    if (!id) return { sourceType: null, sourceId: null };
    for (const [list, type] of [['risks', 'RISK'], ['issues', 'ISSUE'], ['milestones', 'MILESTONE'], ['decisions', 'DECISION']]) {
      const o = (S.B[list] || []).find((x) => x.id === id || x.code === id);
      if (o) return { sourceType: type, sourceId: o.id, wsId: o.wsId };
    }
    return null;
  };
  const date = (v) => (v === '' || v == null ? null : v);

  /** Clés d'entité des lignes de « Mes tâches », dans l'ordre de l'écran (même filtre que `mineSrc`). */
  function mineKeys(state = comp.state) {
    const D = comp.mergedData() || {}, me = comp.me().personId, td = comp.fToday(), AS0 = state.actStatus || {}, out = [];
    (D.actions || []).filter((a) => a.owner === me && a.status !== 'DONE' && AS0[a.id] !== 'Terminée').forEach((a) => out.push('ACTION/' + a.id));
    (D.decisions || []).filter((x) => x.maker === me && ['IN_REVIEW', 'TO_ARBITRATE'].includes(x.status)).forEach((x) => out.push('DECISION/' + x.id));
    (D.milestones || []).filter((m) => m.owner === me && m.iso >= td && Math.round((new Date(m.iso + 'T12:00:00') - new Date(td + 'T12:00:00')) / 864e5) <= 45).forEach((m) => out.push('MILESTONE/' + m.id));
    (state.newTasks || []).filter((t) => !t.author || t.author === me).forEach((t) => out.push('TASK/' + t.id));
    return out;
  }

  const changedKeys = (a, b) => { a = a || {}; b = b || {}; return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => !same(a[k], b[k])); };
  const newItems = (a, b) => { const ids = new Set((a || []).map((x) => x && x.id)); return (b || []).filter((x) => x && !ids.has(x.id)); };

  /**
   * « Info projet » : `PUT /project/info` avec l'objet reconstitué par l'écran (`projectInfo()`), seulement s'il diffère
   * de celui du serveur (une ligne ajoutée et encore vide n'est pas envoyée, et n'est donc pas effacée par le rechargement).
   */
  function onProjectInfo() {
    const norm = (o) => JSON.stringify(o);
    const R = (S.B && S.B.referential) || {}, arr = (x) => (Array.isArray(x) ? x : []);
    const server = { identity: arr(R.identity).map((p) => [String(p[0] || ''), String(p[1] || '')]).filter((p) => p[1].trim()), brands: arr(R.brands).map(String).filter((x) => x.trim()), pitch: typeof R.pitch === 'string' ? R.pitch : '', stakes: arr(R.stakes).map(String).filter((x) => x.trim()),
      scope: arr(R.scope).map((p) => [String(p[0] || ''), String(p[1] || '')]).filter((p) => p[1].trim()), systems: arr(R.systems).map((p) => [String(p[0] || ''), String(p[1] || '')]).filter((p) => p[1].trim()), geo: arr(R.geo).map(String).filter((x) => x.trim()), legal: arr(R.legal).map(String).filter((x) => x.trim()) };
    if (norm(comp.projectInfo()) === norm(server)) return;
    write('PUT project/info', () => request('PUT', P('/project/info'), comp.projectInfo()), 250);
  }

  // ── Traduction des changements en appels API ──
  function onChange(k, before, after) {
    // Objet « Info projet » : ses lignes (refValues, refDeleted, ipAdded) reconstituent l'objet complet, envoyé en une fois.
    if (k === 'ipAdded' || ((k === 'refValues' || k === 'refDeleted') && changedKeys(before, after).some((x) => x.startsWith('PROJECT_INFO/')))) onProjectInfo();
    if (k === 'ipAdded') return;
    if (SECTION_STORES.includes(k)) return writePatch('PATCH', '/project/sections/ui.' + k, { value: after || {} }, TYPING_DEBOUNCE_MS, { noReload: true });
    if (PREF_OF[k]) {
      const f = PREF_OF[k];
      return write('PREF ' + f, () => patch('/me/preferences', { [f]: after === undefined ? null : after }), TYPING_DEBOUNCE_MS, { noReload: true });
    }
    switch (k) {
      case 'ed': return changedKeys(before, after).forEach((key) => onEd(key, (before || {})[key] || {}, (after || {})[key] || {}));
      case 'actStatus': return changedKeys(before, after).forEach((id) => { if (known('actions', id) && after[id]) writePatch('PATCH', '/actions/' + enc(id), { status: ACTION_STATUS[after[id]] || 'OPEN' }); });
      case 'sesEd': return changedKeys(before, after).forEach((id) => onSession(id, (before || {})[id] || {}, (after || {})[id] || {}));
      case 'sesAdded': return newItems(before, after).forEach((x) => write('POST session ' + x.id, () => ppost('/sessions', { bodyId: x.bodyId, dateIso: x.dateIso, time: x.time || null, place: x.place || null })));
      case 'refValues': return changedKeys(before, after).forEach((key) => onRefValues(key, (after || {})[key]));
      case 'refDeleted': return changedKeys(before, after).forEach((key) => { if (!(after || {})[key]) return; const [obj, id] = splitKey(key); if (!ROUTE[obj] || !isServerRow(obj, id)) return; write('DELETE ' + key, () => pdel('/' + ROUTE[obj] + '/' + enc(id))); });
      case 'bmEd': case 'bmAdd': return write('BAROMETER', reconcileBarometer, 250);
      case 'phLots': return changedKeys(before, after).forEach((id) => onPhLots(id, (before || {})[id], (after || {})[id]));
      case 'txtEd': return writeArbitration('D-007', { texts: onlyFilled(after) });
      case 'critEd': return writeArbitration('D-007', { criteria: critFromArrays(comp._critCur || []) });
      case 'arbData': return changedKeys(before, after).forEach((id) => { const a = (after || {})[id]; if (!a) return; writeArbitration(id, { texts: onlyFilled(a.tx), criteria: critFromArrays(a.crit || []) }); });
      case 'lvTrack': return changedKeys(before, after).forEach((id) => {
        if (!isServerRow('DELIVERABLE', id)) return;
        const a = (after || {})[id] || {}, b = (before || {})[id] || {}, body = {};
        if (a.prog !== b.prog && a.prog != null) body.prog = a.prog;
        if (a.risk !== b.risk) body.riskOverride = a.risk ? DELIV_RISK[a.risk] : null;
        if (Object.keys(body).length) writePatch('PATCH', '/deliverables/' + enc(id), body, TYPING_DEBOUNCE_MS);
      });
      case 'mineArch': case 'mineTitles': case 'mineDetails': case 'mineDue': case 'mineCta': return onMine(k, before, after);
      case 'newTasks': return newItems(before, after).forEach((t) => write('POST task ' + t.id, () => ppost('/tasks', { title: t.n, dueIso: date(t.dueIso), detail: t.detail || null, cta: t.cta || null, status: t.status === 'DONE' ? 'DONE' : 'TODO' })));
      case 'gbExtra': return changedKeys(before, after).forEach((id) => { if (!isServerRow('GOVERNANCE_BODY', id)) return; const x = (after || {})[id] || {}, body = {}; if (x.shortName != null) body.shortName = x.shortName; if (x.color) body.color = String(x.color).toUpperCase(); writePatch('PATCH', '/governance-bodies/' + enc(id), body); });
      case 'gbMem': return changedKeys(before, after).forEach((id) => {
        if (!isServerRow('GOVERNANCE_BODY', id)) return;
        const row = findRow('GOVERNANCE_BODY', id), roles = Object.fromEntries(((row && row.memberRoles) || []).map((m) => [m.personId, m.role]));
        writePatch('PUT', '/governance-bodies/' + enc(id) + '/members', { members: ((after || {})[id] || []).map((pid) => ({ personId: pid, role: roles[pid] || 'MEMBER' })) });
      });
      case 'roTier': return changedKeys(before, after).forEach((id) => { if (isServerRow('ROLE', id)) writePatch('PATCH', '/roles/' + enc(id), { tier: (after || {})[id] ?? null }); });
      case 'dlOwner': return changedKeys(before, after).forEach((id) => { if (isServerRow('DELIVERABLE', id) && (after || {})[id]) writePatch('PATCH', '/deliverables/' + enc(id), { ownerId: after[id] }); });
      case 'psAcc': return changedKeys(before, after).forEach((id) => { if ((after || {})[id] === 'pending' && isServerRow('PERSON', id)) write('INVITE ' + id, () => ppost('/invitation-requests', { personId: id }).then((r) => {
        if (r && r.status === 'ALREADY_HAS_ACCOUNT') toast('Cette personne a déjà un compte' + (r.accountStatus === 'INVITED' ? ' : invitation en attente d’activation' : r.accountStatus === 'SUSPENDED' ? ' (suspendu)' : ' actif'));
        // État réel relu après la demande : l'icône suit le serveur (et non l'état local).
        pget('/account-states').then((m) => { const acc = { ...(comp.state.psAcc || {}) }; delete acc[id]; raw({ psAccSrv: m, psAcc: acc }); }).catch(() => {});
        return r; })); });
      case 'modPh': return changedKeys(before, after).forEach((key) => { const v = (after || {})[key] || 0, v0 = (before || {})[key] || 0; if (v >= 1 && v0 < 1 && MODULE_OF[key]) write('MODULE ' + key, () => ppost('/module-requests', { moduleId: MODULE_OF[key] }), 0, { noReload: true }); });
      case 'spDesc': return changedKeys(before, after).forEach((id) => { if (isServerRow('SUBPHASE', id)) writePatch('PATCH', '/subphases/' + enc(id), { description: (after || {})[id] || null }); });
      case 'phDesc': return changedKeys(before, after).forEach((id) => { if (isServerRow('PHASE', id)) writePatch('PATCH', '/phases/' + enc(id), { description: (after || {})[id] || null }); });
      case 'added': return ['ms', 'rk', 'is', 'ac', 'fa'].forEach((t) => newItems((before || {})[t], (after || {})[t]).forEach((o) => onCreate(t, o)));
      case 'plAdd': return ['ph', 'sp', 'ch'].forEach((t) => newItems((before || {})[t], (after || {})[t]).forEach((o) => onPlanCreate(t, o)));
      case 'lvAdded': return newItems(before, after).forEach((r) => onDeliverableCreate(r));
      case 'psAdded': return newItems(before, after).forEach((r) => { const [first, ...rest] = String(r.cells[0] || '').trim().split(' '); create('persons', r.id, { firstName: first || 'Nouveau', lastName: rest.join(' '), email: r.cells[6], teamId: teamId(r.cells[2]) || teamId(r.cells[1]) || (M('TEAM')[0] || {}).id, title: r.cells[3] || null }); });
      case 'gbAdded': return newItems(before, after).forEach((r) => { const n = String(r.cells[0] || 'Nouvelle instance'); create('governance-bodies', r.id, { name: n, shortName: n.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 12) || 'NI', color: '#8A9AA6', frequency: FREQUENCY[r.cells[2]] || 'MONTHLY', description: r.cells[1] || null, members: (r.members || []).map((p) => ({ personId: p, role: 'MEMBER' })) }); });
      case 'roAdded': return newItems(before, after).forEach((r) => create('roles', r.id, { label: r.cells[0] || 'Nouveau rôle', tier: (comp.state.roTier || {})[r.id] ?? null }));
      case 'tmAdded': return newItems(before, after).forEach((r) => create('teams', r.id, { name: r.cells[1] || r.cells[0] || 'Nouvelle équipe', description: r.cells[2] || null, kind: 'OTHER' }));
      case 'wsAdded': return newItems(before, after).forEach((r) => create('workstreams', r.id, { ...(+r.cells[0] ? { seq: +r.cells[0] } : {}), name: r.cells[1] || 'Nouveau chantier', ownerId: personId(r.cells[2]) || S.B.project.programDirectorId, status: WS_STATUS[r.cells[3]] || 'ACTIVE' }));
      case 'waAdded': return newItems(before, after).forEach((r) => { const s = parseRefDate(r.cells[2], 'start') || {}, e = parseRefDate(r.cells[3], 'end') || {}; create('waves', r.id, { seq: +r.cells[0], name: String(r.cells[1]).replace(/^Lot\s*\d+\s*·\s*/, ''), startDate: s.iso || null, endDate: e.iso || null, startPrecision: s.prec, endPrecision: e.prec, status: WAVE_STATUS[r.cells[4]] || 'PLANNED' }); });
      case 'phAdded': return newItems(before, after).forEach((r) => { const s = parseRefDate(r.cells[3], 'start') || {}, e = parseRefDate(r.cells[4], 'end') || {}; const w = waveId(r.cells[2]); create('phases', r.id, { seq: +r.cells[0], code: String(r.cells[0]), name: r.cells[1], startDate: s.iso, endDate: e.iso, startPrecision: s.prec, endPrecision: e.prec, status: PLAN_STATUS[r.cells[5]] || 'PLANNED', ownerId: S.B.project.programDirectorId, ...(w ? { waveIds: [w] } : {}) }); });
      case 'spAdded': return newItems(before, after).forEach((r) => { const s = parseRefDate(r.cells[3], 'start') || {}, e = parseRefDate(r.cells[4], 'end') || {}; create('subphases', r.id, { phaseId: phaseId(r.cells[1]), code: r.cells[0], name: r.cells[2], startDate: s.iso, endDate: e.iso, startPrecision: s.prec, endPrecision: e.prec, status: PLAN_STATUS[r.cells[5]] || 'PLANNED' }); });
      case 'templates': return onTemplates(before, after);
      case 'tplHistory': return newItems(before, after).filter((h) => /^H\d{10,}$/.test(String(h.id))).forEach((h) => onReportGenerated(h));
      case 'cmts': return changedKeys(before, after).forEach((key) => {
        const a = (after || {})[key] || [], b = (before || {})[key] || [];
        a.slice(b.length).forEach((c) => write('COMMENT ' + key + ' ' + a.indexOf(c), () => ppost('/comments', { ...commentTarget(key), field: key.slice(0, 200), text: c.text }), 0, { noReload: true }));
      });
      default: return undefined;
    }
  }
  const enc = encodeURIComponent;
  const splitKey = (key) => { const i = key.indexOf('/'); return [key.slice(0, i), key.slice(i + 1)]; };
  const isServerRow = (obj, id) => (obj === 'MILESTONE' ? known('milestones', id) : !!findRow(obj, id));
  const onlyFilled = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => String(v == null ? '' : v).trim()).map(([k, v]) => [k, String(v).trim()]));
  const critFromArrays = (arr) => (arr || []).filter((c) => c && String(c[0] || '').trim()).map((c) => ({ name: String(c[0]).trim(), weightPct: Math.max(0, Math.min(100, Math.round(parseFloat(c[1]) || 0))), scoreA: Math.max(0, Math.min(4, +c[2] || 0)), commentA: String(c[3] || ''), scoreB: Math.max(0, Math.min(4, +c[4] || 0)), commentB: String(c[5] || '') }));
  function writeArbitration(id, body) { writePatch('PATCH', '/decisions/' + enc(id) + '/arbitration', body); }
  function create(route, clientId, body) {
    const key = 'POST ' + route + ' ' + clientId;
    if (S.sentCreations.has(key)) return;
    S.sentCreations.add(key);
    write(key, () => ppost('/' + route, clean(body)));
  }
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

  /** `ed` : surcharges champ par champ des objets transactionnels, des jalons et du planning. */
  function onEd(key, b, a) {
    const i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1);
    const ch = {};
    Object.keys(a).forEach((f) => { if (!same(a[f], b[f])) ch[f] = a[f]; });
    if (!Object.keys(ch).length) return;
    const body = {};
    if (kind === 'ms') {
      if (!known('milestones', id)) return;
      ['n', 'iso', 'baselineIso', 'owner', 'phaseId', 'subphaseId', 'wsId'].forEach((f) => { if (f in ch) body[f] = f === 'n' || f === 'iso' || f === 'phaseId' ? ch[f] : date(ch[f]); });
      if ('ws' in ch && !('wsId' in ch)) body.wsId = wsId(ch.ws);
      if (ch.confIso) write('CONFIRM ' + id, () => ppost('/milestones/' + enc(id) + '/confirm'));
      if (Object.keys(body).length) writePatch('PATCH', '/milestones/' + enc(id), body);
      return;
    }
    if (kind === 'rk' || kind === 'is' || kind === 'ac') {
      const list = { rk: 'risks', is: 'issues', ac: 'actions' }[kind];
      if (!known(list, id)) return;
      const F = { rk: ['n', 'p', 'i', 'plan', 'owner', 'dueIso', 'status'], is: ['n', 'sev', 'detail', 'owner', 'targetIso', 'status'], ac: ['n', 'detail', 'owner', 'dueIso', 'status'] }[kind];
      F.forEach((f) => { if (f in ch) body[f] = /Iso$/.test(f) ? date(ch[f]) : f === 'plan' ? (ch[f] || null) : ch[f]; });
      if ('ws' in ch && wsId(ch.ws)) body.wsId = wsId(ch.ws);
      if (kind === 'ac' && 'source' in ch) { const s = sourceOf(ch.source); if (s) { body.sourceType = s.sourceType; body.sourceId = s.sourceId; } }
      if (Object.keys(body).length) writePatch('PATCH', '/' + list + '/' + enc(id), body);
      return;
    }
    if (kind === 'fa' || kind === 'dc') {
      if (!known('decisions', id)) return;
      ['t', 'p', 'decL', 'opt'].forEach((f) => { if (f in ch) body[f] = f === 'opt' ? (ch[f] || null) : ch[f]; });
      if ('ddIso' in ch) body.ddIso = date(ch.ddIso);
      if ('st' in ch && DECISION_STATUS[ch.st]) body.status = DECISION_STATUS[ch.st];
      if ('status' in ch) body.status = ch.status;
      if ('ch' in ch && wsId(ch.ch)) body.wsId = wsId(ch.ch);
      if ('inst' in ch && bodyId(ch.inst)) body.bodyId = bodyId(ch.inst);
      if (Object.keys(body).length) writePatch('PATCH', '/decisions/' + enc(id), body);
      return;
    }
    if (kind === 'pl') {
      const type = planType(id);
      if (!type) return;
      const map = { start: 'startDate', end: 'endDate', reel: 'progressPct', owner: 'ownerId', prevuSet: 'plannedPctOverride', crit: 'critical' };
      Object.keys(ch).forEach((f) => { if (map[f]) body[map[f]] = f === 'reel' ? Math.max(0, Math.min(100, Math.round(+ch[f] || 0))) : f === 'prevuSet' ? (ch[f] === '' || ch[f] == null ? null : +ch[f]) : ch[f]; });
      if (Object.keys(body).length) writePatch('PATCH', '/planning/' + type + '/' + enc(id), body);
    }
  }

  function onSession(id, b, a) {
    if (!known('sessions', id)) return;
    const body = {};
    ['dateIso', 'time', 'place', 'status'].forEach((f) => { if (f in a && a[f] !== b[f]) body[f] = f === 'time' || f === 'place' ? (a[f] ? String(a[f]).trim() || null : null) : a[f]; });
    if (!Object.keys(body).length) return;
    const typing = ('time' in body || 'place' in body) && !('status' in body) && !('dateIso' in body);
    writePatch('PATCH', '/sessions/' + enc(id), body, typing ? TYPING_DEBOUNCE_MS : 0);
  }

  /** `refValues` : ligne complète `cells` d'un tableau du Référentiel → champs de l'API. */
  function onRefValues(key, cells) {
    if (!cells) return;
    const [obj, id] = splitKey(key);
    const row = findRow(obj, id);
    if (!row) return; // ligne créée localement : la création suit son propre chemin
    const old = row.cells, ch = (i) => cells[i] !== undefined && cells[i] !== old[i];
    const body = {};
    const dates = (iS, iE) => {
      if (ch(iS)) { const d = parseRefDate(cells[iS], 'start'); if (d === undefined) throw bad('date de début « ' + cells[iS] + ' » (JJ/MM/AAAA, MM/AAAA ou AAAA attendu)'); body.startDate = d.iso; body.startPrecision = d.prec; }
      if (ch(iE)) { const d = parseRefDate(cells[iE], 'end'); if (d === undefined) throw bad('date de fin « ' + cells[iE] + ' » (JJ/MM/AAAA, MM/AAAA ou AAAA attendu)'); body.endDate = d.iso; body.endPrecision = d.prec; }
    };
    try {
      switch (obj) {
        case 'PROJECT': {
          const f = PROJECT_FIELD[id];
          if (!f || !ch(1)) return;
          let v = cells[1];
          if (f === 'startDate' || f === 'targetEndDate') { const d = parseRefDate(v, f === 'startDate' ? 'start' : 'end'); if (!d || !d.iso) throw bad('date « ' + v + ' »'); v = d.iso; }
          if (f === 'programDirectorId') { v = personId(v); if (!v) throw bad('personne inconnue « ' + cells[1] + ' »'); }
          if (f === 'objective' || f === 'city') v = v || null;
          return writePatch('PATCH', '/project', { [f]: v });
        }
        case 'CLIENT':
          if (ch(0)) body.code = cells[0]; if (ch(1)) body.name = cells[1]; if (ch(2)) body.description = cells[2] || null; if (ch(3)) body.status = CLIENT_STATUS[cells[3]] || 'ACTIVE';
          break;
        case 'WAVE':
          if (ch(0)) body.seq = +cells[0]; if (ch(1)) body.name = String(cells[1]).replace(/^Lot\s*\d+\s*·\s*/, ''); dates(2, 3); if (ch(4) && WAVE_STATUS[cells[4]]) body.status = WAVE_STATUS[cells[4]];
          break;
        case 'PHASE':
          if (ch(0)) body.seq = +cells[0]; if (ch(1)) body.name = cells[1]; dates(3, 4); if (ch(5) && PLAN_STATUS[cells[5]]) body.status = PLAN_STATUS[cells[5]];
          if (ch(2)) { const ids = String(cells[2]).split(/,|\s+et\s+/).map(waveId).filter(Boolean); if (ids.length) writePatch('PUT', '/phases/' + enc(id) + '/waves', { waveIds: ids }); }
          break;
        case 'SUBPHASE':
          if (ch(0)) body.code = cells[0]; if (ch(1) && phaseId(cells[1])) body.phaseId = phaseId(cells[1]); if (ch(2)) body.name = cells[2]; dates(3, 4); if (ch(5) && PLAN_STATUS[cells[5]]) body.status = PLAN_STATUS[cells[5]];
          break;
        case 'WORKSTREAM':
          if (ch(0) && +cells[0]) body.seq = +cells[0]; if (ch(1)) body.name = cells[1]; if (ch(2)) { const p = personId(cells[2]); if (!p) throw bad('personne inconnue « ' + cells[2] + ' »'); body.ownerId = p; }
          if (ch(3) && WS_STATUS[cells[3]]) body.status = WS_STATUS[cells[3]];
          if (ch(4)) { const v = String(cells[4]).trim(); body.dependsOn = v === 'Tous' ? 'ALL' : v === '—' || !v ? [] : v.split(/\s*·\s*|,\s*/).map((c) => (M('WORKSTREAM').find((w) => w.id === c || w.code === c || norm(w.cells[1]) === norm(c)) || {}).id).filter(Boolean); }
          if (ch(5)) body.phaseIds = String(cells[5]).split(/\s+/).map((x) => (M('PHASE').find((p) => p.id === x || norm(p.cells[1]) === norm(x)) || {}).id).filter(Boolean);
          break;
        case 'TEAM':
          if (ch(1) || ch(0)) body.name = ch(1) ? cells[1] : cells[0]; if (ch(2)) body.description = cells[2] || null;
          break;
        case 'ROLE':
          if (ch(0)) body.label = cells[0];
          break;
        case 'PERSON': {
          if (ch(0)) { const [first, ...rest] = String(cells[0]).trim().split(' '); body.firstName = first; body.lastName = rest.join(' '); }
          if (ch(2) || ch(1)) { const t = teamId(ch(2) ? cells[2] : cells[1]); if (t) body.teamId = t; }
          if (ch(3)) body.title = cells[3] || null;
          if (ch(5)) body.wsIds = String(cells[5]).split(/\s*·\s*/).map(wsId).filter(Boolean);
          if (ch(6)) body.email = cells[6];
          if (ch(7)) body.active = /^oui$/i.test(cells[7]);
          if (ch(4)) onPersonRoles(id, old[4], cells[4]);
          break;
        }
        case 'GOVERNANCE_BODY':
          if (ch(0)) body.name = cells[0]; if (ch(1)) body.description = cells[1] || null; if (ch(2) && FREQUENCY[cells[2]]) body.frequency = FREQUENCY[cells[2]];
          break;
        case 'PROJECT_ASSIGNMENT':
          if (ch(2)) { const r = roleId(cells[2]); if (r) body.roleId = r; }
          if (ch(3)) { const d = parseRefDate(cells[3], 'start'); if (!d || !d.iso) throw bad('date « ' + cells[3] + ' »'); body.startDate = d.iso; }
          if (ch(4)) { const d = parseRefDate(cells[4], 'end'); if (d === undefined) throw bad('date « ' + cells[4] + ' »'); body.endDate = d.iso; }
          break;
        case 'DELIVERABLE': {
          if (ch(0)) body.name = cells[0];
          if (ch(1)) { const p = personId(cells[1]); if (p) body.ownerId = p; }
          if (ch(2)) body.teamLabel = cells[2] || null;
          if (ch(4)) { const sp = subphaseByCode(String(cells[4]).split(' ')[0]); if (sp) body.subphaseId = sp.id; }
          if (ch(5)) body.workstreamId = wsId(cells[5]);
          break;
        }
        default: return;
      }
    } catch (e) { return fail(e); }
    if (Object.keys(body).length && ROUTE[obj]) writePatch('PATCH', '/' + ROUTE[obj] + '/' + enc(id), body);
  }
  const bad = (m) => new ApiError(400, { code: 'VALIDATION_ERROR', message: 'Valeur invalide : ' + m });

  /** Colonne « rôle » d'une personne : ajoute ou clôt des affectations (Q6). */
  function onPersonRoles(pid, oldV, newV) {
    const split = (v) => String(v || '').split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean);
    const o = split(oldV), n = split(newV), today = S.B.today;
    const y = new Date(today + 'T12:00:00'); y.setDate(y.getDate() - 1);
    const yesterday = y.getFullYear() + '-' + pad2(y.getMonth() + 1) + '-' + pad2(y.getDate());
    n.filter((l) => !o.includes(l)).forEach((l) => { const r = roleId(l); if (r) write('ASSIGN ' + pid + ' ' + r, () => ppost('/assignments', { personId: pid, roleId: r, startDate: today })); });
    o.filter((l) => !n.includes(l)).forEach((l) => {
      const r = roleId(l);
      M('PROJECT_ASSIGNMENT').filter((a) => a.personId === pid && a.roleId === r && a.cells[5] === 'oui').forEach((a) => {
        const start = parseRefDate(a.cells[3], 'start') || {};
        write('UNASSIGN ' + a.id, () => (start.iso && start.iso < today ? ppatch('/assignments/' + enc(a.id), { endDate: yesterday }) : pdel('/assignments/' + enc(a.id))));
      });
    });
  }

  function baseLots(id) {
    const hydrated = (S.base.phLots || {})[id];
    if (hydrated) return hydrated;
    const r = findRow('PHASE', id); if (!r) return {};
    const m = /Lot\s*(\d+)/.exec(r.cells[2] || ''), w = m && M('WAVE').find((x) => x.cells[0] === m[1]);
    return w ? { [w.id]: { start: r.cells[3], end: r.cells[4] } } : {};
  }
  function onPhLots(id, before, after) {
    if (!isServerRow('PHASE', id) || !after) return;
    const prev = before || baseLots(id);
    const ids = Object.keys(after);
    if (!same(Object.keys(prev).sort(), [...ids].sort())) writePatch('PUT', '/phases/' + enc(id) + '/waves', { waveIds: ids });
    ids.forEach((w) => {
      const a = after[w] || {}, b = prev[w] || {};
      if (a.start === b.start && a.end === b.end && prev[w]) return;
      const s = parseRefDate(a.start, 'start') || { iso: null, prec: 'D' }, e = parseRefDate(a.end, 'end') || { iso: null, prec: 'D' };
      writePatch('PUT', '/phases/' + enc(id) + '/waves/' + enc(w) + '/dates', { startDate: s.iso, endDate: e.iso, startPrecision: s.prec, endPrecision: e.prec });
    });
  }

  function onMine(k, before, after) {
    const keys = mineKeys();
    const field = { mineTitles: 'title', mineDetails: 'detail', mineDue: 'dueIso', mineCta: 'cta' }[k];
    changedKeys(before, after).forEach((i) => {
      const key = keys[+i]; if (!key) return;
      const [type, id] = key.split('/');
      const v = (after || {})[i];
      if (k === 'mineArch') return writePatch('PUT', '/me/tasks/' + type + '/' + enc(id) + '/override', { archived: v !== undefined }, 0);
      if (type === 'TASK') {
        if (!(S.extra.tasks || []).some((t) => t.id === id)) return;
        return writePatch('PATCH', '/tasks/' + enc(id), { [field === 'dueIso' ? 'dueIso' : field]: field === 'dueIso' ? date(v) : v ?? null });
      }
      writePatch('PUT', '/me/tasks/' + type + '/' + enc(id) + '/override', { [field]: field === 'dueIso' ? date(v) : v ?? null });
    });
  }

  function onCreate(t, o) {
    const B = S.B;
    if (t === 'ms') return create('milestones', o.id, { n: o.n, phaseId: o.phaseId, subphaseId: o.subphaseId || null, wsId: o.wsId || null, waveId: o.waveId || null, owner: o.owner || null, iso: o.iso, baselineIso: o.baselineIso || o.iso });
    if (t === 'rk') return create('risks', o.id, { n: o.n, p: +o.p || 3, i: +o.i || 3, plan: o.plan || null, owner: o.owner, wsId: wsId(o.ws) || defaultWs(), dueIso: date(o.dueIso), status: 'OPEN' });
    if (t === 'is') return create('issues', o.id, { n: o.n, sev: +o.sev || 3, owner: o.owner, wsId: wsId(o.ws) || defaultWs(), targetIso: date(o.targetIso), detail: o.detail || '' });
    if (t === 'ac') { const s = sourceOf(o.source) || {}; return create('actions', o.id, { n: o.n, owner: o.owner, wsId: s.wsId || defaultWs(), dueIso: date(o.dueIso), status: o.status || 'OPEN', prio: 'HIGH', sourceType: s.sourceType || null, sourceId: s.sourceId || null }); }
    if (t === 'fa') {
      if (known('decisions', o.id)) return;
      return create('decisions', o.id, { t: o.t, p: +o.p || 3, status: DECISION_STATUS[o.st] || 'DRAFT', crIso: o.crIso || B.today, ddIso: date(o.ddIso), wsId: wsId(o.ch) || defaultWs(), bodyId: bodyId(o.inst) || (M('GOVERNANCE_BODY')[0] || {}).id, decL: o.decL || null });
    }
  }
  function onPlanCreate(t, x) {
    const common = { startDate: x.start, endDate: x.end, progressPct: +x.reel || 0, plannedPctOverride: x.prevuSet == null || x.prevuSet === '' ? null : +x.prevuSet };
    if (t === 'ph') return create('phases', x.id, { seq: +x.code || S.B.phases.length + 1, code: String(x.code), name: x.n, ownerId: x.owner || S.B.project.programDirectorId, ...common });
    if (t === 'sp') return create('subphases', x.id, { phaseId: x.ph, code: x.code, name: x.n, ownerId: x.owner || null, ...common });
    if (t === 'ch') return create('workstreams', x.id, { name: x.n, ownerId: x.owner || S.B.project.programDirectorId, phaseIds: x.phases || [], ...common });
  }
  function onDeliverableCreate(r) {
    const sp = subphaseByCode(String(r.cells[4] || '').split(' ')[0]);
    if (!sp) return toast('Livrable non enregistré : sous-phase introuvable');
    const tr = (comp.state.lvTrack || {})[r.id] || {};
    create('deliverables', r.id, { name: r.cells[0], subphaseId: sp.id, workstreamId: wsId(r.cells[5]), ownerId: personId(r.cells[1]) || r.owner, start: sp.start || null, due: sp.end || sp.start, ...(tr.prog != null ? { prog: tr.prog } : {}), riskOverride: tr.risk ? DELIV_RISK[tr.risk] : null, teamLabel: r.cells[2] || null });
  }

  // ── Comités : templates et journal de génération ──
  function tplBody(t) {
    const comps = (t.comps || []).map((c) => {
      const scope = TPL_SCOPE[c.kind] || 'PROJECT';
      const targetId = c.targetId || (scope === 'WAVE' ? waveId(c.target) : scope === 'PHASE' ? phaseId(c.target) : scope === 'WORKSTREAM' ? wsId(c.target) : null);
      return { id: c.id, scope, ...(scope !== 'PROJECT' ? { targetId } : {}) };
    });
    return { name: t.name, bodyId: t.bodyId || bodyId(t.committee) || null, authorLabel: t.author || null, version: String(t.version || '1.0'), description: t.desc || '', components: comps, active: t.active !== false };
  }
  function onTemplates(before, after) {
    const b = before || [], a = after || [], serverIds = new Set((S.B.templates || []).map((t) => t.id));
    a.forEach((t) => {
      const o = b.find((x) => x.id === t.id);
      if (!o) { if (!serverIds.has(t.id)) create('report-templates', t.id, tplBody(t)); return; }
      if (same(o, t) || !serverIds.has(t.id)) return;
      if (o.active !== t.active && same({ ...o, active: t.active }, t)) return writePatch('PATCH', '/report-templates/' + enc(t.id) + '/active', { active: !!t.active });
      writePatch('PATCH', '/report-templates/' + enc(t.id), tplBody(t));
    });
    b.filter((t) => !a.some((x) => x.id === t.id) && serverIds.has(t.id)).forEach((t) => write('DELETE tpl ' + t.id, () => pdel('/report-templates/' + enc(t.id))));
  }
  function onReportGenerated(h) {
    if (!h.saved) return; // téléchargement seul : aucun objet serveur (limite documentée)
    const tpl = (comp.state.templates || []).find((t) => t.name === h.name && String(t.version) === String(h.version)) || (comp.state.templates || []).find((t) => t.name === h.name);
    const sessionId = h.sessionId || ((comp.sessionList ? comp.sessionList() : []).filter((x) => x.status === 'PLANNED' && x.dateIso >= S.B.today && (!h.bodyId || x.bodyId === h.bodyId)).sort((x, y) => x.dateIso.localeCompare(y.dateIso))[0] || {}).id;
    if (!tpl || !sessionId) return toast('Rapport non enregistré : template ou séance introuvable');
    write('REPORT ' + h.id, () => ppost('/sessions/' + enc(sessionId) + '/reports', { templateId: tpl.id }));
  }

  // ── Baromètre : réconciliation de l'écran fusionné avec la référence ──
  async function reconcileBarometer() {
    const cur = (comp.mergedData() || {}).barometre, base = S.baseBm;
    if (!cur || !base) return null;
    const surveys = ((S.extra.barometer || {}).surveys || []);
    const monthAt = (i) => (surveys[i] ? surveys[i].month : (/^m(\d{4}-\d{2})$/.exec((cur.months[i] || [])[0] || '') || [])[1]);
    const qApi = (q) => ({ label: q.q, score: q.v == null ? null : +q.v, delta: q.delta == null ? null : +q.delta });
    const thApi = (t) => ({ label: t[0], tone: TONE[t[1]] || 'WATCH' });
    const out = [];
    // Mois existants
    for (let i = 0; i < base.months.length; i++) {
      const key = cur.months[i][0], body = {};
      if (cur.ecf.series[i] !== base.ecf.series[i] && cur.ecf.series[i] != null) body.overallScore = +cur.ecf.series[i];
      if (cur.respondents[i] !== base.respondents[i]) body.respondents = Math.round(+cur.respondents[i] || 0);
      if (!same(cur.sentiment[key], base.sentiment[key])) { const s = cur.sentiment[key]; body.sentiment = { negative: s[0], neutral: s[1], positive: s[2] }; }
      if (!same((cur.monthQs || {})[key], (base.monthQs || {})[key]) && (cur.monthQs || {})[key]) body.questions = cur.monthQs[key].map(qApi);
      if (!same((cur.monthTh || {})[key], (base.monthTh || {})[key]) && (cur.monthTh || {})[key]) body.themes = cur.monthTh[key].map(thApi);
      if (Object.keys(body).length && monthAt(i)) out.push(() => ppatch('/barometer/surveys/' + enc(monthAt(i)), body));
    }
    // Questions et thèmes communs
    const g = {};
    if (!same(cur.questions, base.questions)) g.questions = cur.questions.map(qApi);
    if (!same(cur.themes, base.themes)) g.themes = cur.themes.map(thApi);
    if (cur.ecf.label !== base.ecf.label) g.label = cur.ecf.label;
    if (Object.keys(g).length) out.push(() => ppatch('/barometer/global', g));
    // Nouveaux mois
    for (let i = base.months.length; i < cur.months.length; i++) {
      const key = cur.months[i][0], month = monthAt(i), ck = 'SURVEY ' + month;
      if (!month || S.sentCreations.has(ck)) continue;
      S.sentCreations.add(ck);
      const s = cur.sentiment[key] || [0, 100, 0], ds = {};
      base.domains.forEach((d, di) => { const v = (cur.domains[di] || {}).series ? cur.domains[di].series[i] : null; if (v != null && d.id) ds[d.id] = v; });
      out.push(() => ppost('/barometer/surveys', { month, label: cur.months[i][1], overallScore: +cur.ecf.series[i], respondents: Math.round(+cur.respondents[i] || 0), sentiment: { negative: s[0], neutral: s[1], positive: s[2] }, questions: ((cur.monthQs || {})[key] || []).map(qApi), themes: ((cur.monthTh || {})[key] || []).map(thApi), domainScores: ds }));
    }
    // Domaines existants
    base.domains.forEach((d, di) => {
      const c = cur.domains[di]; if (!c || !d.id) return;
      const body = {};
      if (c.n !== d.n) body.n = c.n;
      if (c.resp !== d.resp) body.resp = Math.round(+c.resp || 0);
      const series = {};
      c.series.forEach((v, i) => { if (i < base.months.length && v !== d.series[i] && monthAt(i)) series[monthAt(i)] = v == null ? null : +v; });
      if (Object.keys(series).length) body.series = series;
      if (Object.keys(body).length) out.push(() => ppatch('/barometer/domains/' + enc(d.id), body));
    });
    // Nouveaux domaines
    cur.domains.slice(base.domains.length).forEach((c, j) => {
      const ck = 'DOMAIN ' + (base.domains.length + j) + ' ' + c.n;
      if (S.sentCreations.has(ck)) return;
      S.sentCreations.add(ck);
      const series = {}; c.series.forEach((v, i) => { if (v != null && monthAt(i)) series[monthAt(i)] = +v; });
      out.push(() => ppost('/barometer/domains', { n: c.n, size: +c.size || 0, resp: Math.round(+c.resp || 0), range: c.range || '', series }));
    });
    let last = null;
    for (const f of out) last = await f();
    return last;
  }

  /** Commentaire de cellule : objet reconnu dans le libellé de la ligne (code R01, A-41, D-007, P02, J05), sinon le projet. */
  function commentTarget(key) {
    const label = String(key.split('|')[1] || '');
    const tests = [[/\b(R\d{2,})\b/, 'risks', 'RISK'], [/\b(A-\d+)\b/, 'actions', 'ACTION'], [/\b(D-\d{3})\b/, 'decisions', 'DECISION'], [/\b(P\d{2,})\b/, 'issues', 'ISSUE'], [/\b(J\d{2,})\b/, 'milestones', 'MILESTONE']];
    for (const [re, list, type] of tests) {
      const m = re.exec(label);
      const o = m && (S.B[list] || []).find((x) => x.id === m[1] || x.code === m[1]);
      if (o) return { entityType: type, entityId: o.id };
    }
    return { entityType: 'PROJECT', entityId: S.B.project.id };
  }

  // ── Démarrage ──
  /** Délai entre deux tentatives de chargement quand l'API est injoignable (ms). */
  const RETRY_MS = 15000;
  const start = () => load()
    .then((L) => { hydrate(L); if (S.failed) { S.failed = false; raw({ toast: '' }); } })
    .catch((e) => {
      S.failed = true;
      console.error('[api] bootstrap', e);
      // Repli : l'écran reste vide et le toast existant reste affiché jusqu'au prochain essai.
      clearTimeout(comp._tt);
      raw({ toast: 'Données indisponibles — ' + errorText(e) + ' · nouvel essai dans ' + RETRY_MS / 1000 + ' s' });
      setTimeout(start, RETRY_MS);
    });
  start();

  // ── Notifications de l'utilisateur (cloche) : au démarrage, toutes les 60 s et au retour sur l'onglet ──
  const NT_POLL_MS = 60_000;
  const ntLoad = () => get('/me/notifications').then((r) => raw({ ntItems: r.items, ntUnread: r.unread })).catch((e) => console.warn('[api] notifications', e));
  ntLoad();
  comp._ntTimer = setInterval(ntLoad, NT_POLL_MS);
  const ntVisible = () => { if (!document.hidden) ntLoad(); };
  document.addEventListener('visibilitychange', ntVisible);
  const unmount0 = comp.componentWillUnmount ? comp.componentWillUnmount.bind(comp) : null;
  comp.componentWillUnmount = () => { clearInterval(comp._ntTimer); document.removeEventListener('visibilitychange', ntVisible); if (unmount0) unmount0(); };
  const ntMark = (id) => raw((st) => ({ ntItems: (st.ntItems || []).map((x) => (id === null || x.id === id ? { ...x, read: true } : x)), ntUnread: id === null ? 0 : Math.max(0, (st.ntUnread || 0) - ((st.ntItems || []).some((x) => x.id === id && !x.read) ? 1 : 0)) }));

  // ── Appels directs (remplacent les blocs SIMULÉ) ──
  const api = {
    request, get, post, patch, put, del, projectId, errorText, reload: () => reload(),
    ntLoad,
    ntRead: (id) => { ntMark(id); post('/me/notifications/' + encodeURIComponent(id) + '/read').catch((e) => { console.warn('[api]', e); ntLoad(); }); },
    ntReadAll: () => { ntMark(null); post('/me/notifications/read-all').catch((e) => { console.warn('[api]', e); ntLoad(); }); },
    // Effacer toutes mes notifications (définitif, après le délai d'annulation du tiroir) ; en cas d'échec, la liste est relue.
    ntClearAll: () => { raw({ ntItems: [], ntUnread: 0 }); del('/me/notifications').catch((e) => { console.warn('[api]', e); ntLoad(); }); },
    state: S,

    /**
     * Message d'accueil de « Aujourd'hui » (02/10/2026) : `GET /today/greeting`, rédigé par Jev une fois par jour (ou
     * message par règles du serveur). Lu à l'ouverture de l'écran, puis au changement de jour ; en attendant ou en cas
     * d'échec, l'écran garde son propre message (`todayMsg`).
     */
    greetLoad() {
      if (comp.state.space !== 'today' || comp._greetBusy) return;
      const day = comp.tdIso(), g = comp.state.tdGreet;
      if (g && g.day === day && g.pid === projectId) return;
      if (comp._greetFail && comp._greetFail > Date.now()) return;
      comp._greetBusy = true;
      pget('/today/greeting')
        .then((r) => { comp._greetFail = 0; raw({ tdGreet: { text: r.text, source: r.source, day: r.day || day, pid: projectId } }); })
        .catch((e) => { console.warn('[api] message d’accueil', e); comp._greetFail = Date.now() + 60_000; })
        .finally(() => { comp._greetBusy = false; });
    },

    /** Météo et actualités (proxy serveur ; 503 hors ligne : l'écran affiche son état d'erreur). */
    dbExtLoad() {
      if (comp._dbExtOn || comp.state.space !== 'today') return;
      const D = comp.mergedData(); if (!D || !D.model || !D.model.PROJECT) return;
      comp._dbExtOn = true;
      const OV = comp.state.refValues || {}, getV = (id) => { const r = D.model.PROJECT.rows.find((x) => x.id === id); if (!r) return ''; const ov = OV['PROJECT/' + r.id]; return (ov && ov[1] !== undefined ? ov[1] : r.cells[1]) || ''; };
      const city = getV('city') || 'Paris', country = getV('country') || 'France', up = (p) => comp.setState((s) => ({ dbExt: { ...(s.dbExt || {}), ...p } }));
      up({ city, country });
      const WMO = (c) => (c === 0 ? 'Ciel dégagé' : c <= 2 ? 'Peu nuageux' : c === 3 ? 'Couvert' : c <= 48 ? 'Brouillard' : c <= 57 ? 'Bruine' : c <= 67 ? 'Pluie' : c <= 77 ? 'Neige' : c <= 82 ? 'Averses' : 'Orages');
      // Proxy des cartes API (GET /api/widgets/proxy/{carte}) : la clé, le quota et le cache sont gérés par le serveur ;
      // 503 (carte désactivée ou en erreur) ou 429 (quota) : la tuile affiche son état d'erreur.
      const PX = (card, q, widget) => get('/widgets/proxy/' + enc(card) + '?' + new URLSearchParams(q), { headers: { 'X-RISE-Widget': widget } });
      PX('open-meteo-geocodage', { name: city, count: 1, language: 'fr', format: 'json' }, 'meteo')
        .then((geo) => { const g = geo && geo.results && geo.results[0]; if (!g) throw 0;
          return PX('open-meteo', { latitude: g.latitude, longitude: g.longitude, current: 'temperature_2m,weather_code', daily: 'temperature_2m_max,temperature_2m_min,sunrise,sunset', timezone: 'auto', forecast_days: 1 }, 'meteo')
            .then((f) => ({ temperature: f.current ? f.current.temperature_2m : null, weatherCode: f.current ? f.current.weather_code : null, min: f.daily ? f.daily.temperature_2m_min[0] : null, max: f.daily ? f.daily.temperature_2m_max[0] : null, sunrise: f.daily ? f.daily.sunrise[0] : null, sunset: f.daily ? f.daily.sunset[0] : null, fetchedAt: new Date().toISOString() })); })
        .then((w) => { if (w.temperature == null) throw 0; const now = new Date(w.fetchedAt || Date.now()); up({ wx: { t: Math.round(w.temperature), lbl: WMO(w.weatherCode), max: Math.round(w.max), min: Math.round(w.min), rise: w.sunrise || '', set: w.sunset || '', now: now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) + 'T' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) } }); })
        .catch(() => up({ wxErr: true }));
      // Trafic (30/09/2026) : domicile (ville du profil) et site du projet géocodés par la carte « open-meteo-geocodage »,
      // puis durée avec trafic et retard, aller et retour, par la carte « tomtom-routing » (TomTom Routing). Carte
      // désactivée, en erreur ou sans itinéraire : la tuile affiche « Trafic indisponible », jamais de valeur inventée.
      const home = ((comp.state.dbExt || {}).home ?? comp.state.profCity ?? 'Paris') || 'Paris';
      const geoOf = (name) => PX('open-meteo-geocodage', { name, count: 1, language: 'fr', format: 'json' }, 'trafic').then((r) => { const g = r && r.results && r.results[0]; if (!g) throw 0; return g; });
      const leg = (a, b) => PX('tomtom-routing', { route: a.latitude + ',' + a.longitude + ':' + b.latitude + ',' + b.longitude, traffic: 'true', travelMode: 'car' }, 'trafic')
        .then((r) => { const s = r && r.routes && r.routes[0] && r.routes[0].summary; if (!s || !s.travelTimeInSeconds) throw 0; return { min: Math.max(1, Math.round(s.travelTimeInSeconds / 60)), delay: Math.max(0, Math.round((s.trafficDelayInSeconds || 0) / 60)) }; });
      Promise.all([geoOf(home), geoOf(city)])
        .then(([h, c]) => Promise.all([leg(h, c), leg(c, h)]))
        .then(([go, back]) => up({ tr: { home, go, back }, trErr: false }))
        .catch(() => up({ trErr: true }));
      // Actualités agrégées du registre (GNews, NewsData.io, flux RSS Le Monde, L'Équipe, BBC… : cartes actives) ;
      // la date ISO est remise au format AAAAMMJJTHHMMSS (heure locale) attendu par la tuile.
      get('/widgets/news?limit=6', { headers: { 'X-RISE-Widget': 'news' } })
        .then((r) => ({ articles: (r.items || []).map((i) => { const d = i.date ? new Date(i.date) : null; return { t: i.title, src: i.source, url: i.url || '', iso: i.date || '', d: d ? d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + '00' : '' }; }) }))
        .then((j) => { const A = (j.articles || []).filter((a) => a.t).slice(0, 6).map((a) => { const s = String(a.d || ''); return { t: a.t, url: a.url || '', iso: a.iso || '', src: String(a.src || '').replace(/^www\./, '').split('.')[0], d: s.length >= 12 ? s.slice(9, 11) + ':' + s.slice(11, 13) : '' }; }); if (!A.length) throw 0; up({ news: A }); })
        .catch(() => { up({ newsErr: true }); setTimeout(() => { comp._dbExtOn = false; }, 60000); });
    },

    /** Téléchargement : `GET /documents/{id}/file` (le jeu de démonstration n'a pas de binaire : 404 affiché). */
    async downloadDoc(d) {
      try {
        if (!d.id) throw new ApiError(404, { message: 'Document généré localement, non encore enregistré' });
        const r = await pget('/documents/' + enc(d.id) + '/file', { raw: true });
        const blob = await r.blob(), url = URL.createObjectURL(blob);
        const cd = r.headers.get('Content-Disposition') || '', fn = /filename="([^"]+)"/.exec(cd);
        const a = document.createElement('a'); a.href = url; a.download = fn ? decodeURIComponent(fn[1]) : d.n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast('Téléchargement — ' + d.n + ' · ' + d.v);
      } catch (e) { toast(errorText(e)); }
    },

    /**
     * Dépôt dans la Base de connaissance (30/09/2026) : `POST /documents` (multipart : fichier, nom, type,
     * confidentialité), un fichier après l'autre. Doublon de nom (409 DUPLICATE_NAME) : l'utilisateur choisit
     * Remplacer (`replaceId`) ou Garder les deux (`keepBoth`) ; contenu identique ou fichier refusé : message du serveur.
     * `items` : fichiers (File) ou `{ file, n }` ; le traitement (résumé, index) se poursuit côté serveur.
     */
    async uploadDocuments(items, opts = {}) {
      const list = [...(items || [])].map((x) => (x instanceof File ? { file: x, n: x.name.replace(/\.[^.]+$/, '') } : x));
      if (!list.length) return;
      let ok = 0;
      for (const it of list) {
        const send = (extra = {}) => {
          const fd = new FormData();
          fd.append('file', it.file, it.file.name);
          if (it.n) fd.append('n', it.n);
          if (opts.type) fd.append('type', opts.type);
          if (opts.conf) fd.append('conf', opts.conf);
          for (const [k, v] of Object.entries(extra)) fd.append(k, v);
          return ppost('/documents', fd);
        };
        try {
          await send();
          ok++;
        } catch (e) {
          if (e instanceof ApiError && e.code === 'DUPLICATE_NAME' && e.body && e.body.existing) {
            const choice = await comp.kbAskDuplicate(it.n || it.file.name, e.body.existing);
            if (choice === 'cancel') continue;
            try { await send(choice === 'replace' ? { replaceId: e.body.existing.id } : { keepBoth: 'true' }); ok++; } catch (e2) { toast(errorText(e2)); }
          } else toast((it.n || it.file.name) + ' — ' + errorText(e));
        }
      }
      if (ok) toast(ok === 1 ? 'Document déposé · résumé et indexation en cours' : ok + ' documents déposés · résumé et indexation en cours');
      scheduleReload();
    },

    /** Résumé d'un document (fenêtre « Vue ») : `GET /documents/{id}`. */
    async docDetail(id) {
      try { const d = await pget('/documents/' + enc(id)); comp.setState({ pvDetail: d }); } catch (e) { toast(errorText(e)); comp.setState({ pvDetail: { id, summary: null } }); }
    },

    /** Suppression : `DELETE /documents/{id}` (fichier, résumé et index). */
    async deleteDoc(d) {
      try { await pdel('/documents/' + enc(d.id)); toast('Document supprimé — ' + d.n); scheduleReload(); } catch (e) { toast(errorText(e)); }
    },

    /** Jev : `POST /assistant/messages` ; les propositions arrivent en récapitulatif « À valider ». */
    /**
     * Jev : `POST /assistant/messages` dans la conversation en cours (mémoire, cas 3 : modification en préparation) ;
     * `extra.answer` : réponse à une question à choix. Les choix arrivent en pastilles ; les propositions en
     * récapitulatifs « À valider » (modification principale, puis actions liées à valider après).
     */
    async jevSend(text, J, extra = {}) {
      const context = { space: J.space || comp.state.space, ...(J.tab || comp.state.tab ? { tab: J.tab || comp.state.tab } : {}), ...(J.block ? { block: String(J.block).slice(0, 80) } : {}), ...(J.id ? { rowId: String(J.id).slice(0, 80) } : {}) };
      const fileIds = (comp._jevFileIds || []).splice(0);
      try {
        const r = await ppost('/assistant/messages', { context, text: (!extra.answer && J.row && J.kind === 'ligne' && !/\b(A-\d+|R\d{2,}|P\d{2,}|D-\d{3}|J\d{2,})\b/i.test(text) ? String(J.row).split(' · ')[0] + ' · ' : '') + text, fileIds, ...(comp._jevConv ? { conversationId: comp._jevConv } : {}), ...(extra.answer ? { answer: extra.answer } : {}) });
        comp._jevConv = r.conversationId || comp._jevConv;
        // Sources en étiquettes (jev-format.js, séparateur : saut de ligne) : « Guide · section · p. N » → « section · p. N ».
        const src = (r.sources || []).map((s) => (s.entityType === 'GUIDE' ? String(s.label).replace(/^Guide · /, '') : s.label)).join('\n');
        const msgs = [{ t: 'jev', text: r.reply, src, chips: (r.choices || []).map((c) => ({ label: c.label, answer: c.answer })) }];
        const pc = r.proposedChanges || [];
        for (const group of ['main', 'linked']) {
          const g = pc.filter((c) => (c.group || 'main') === group);
          if (!g.length) continue;
          const items = g.flatMap((c) => [...(g.length > 1 || group === 'linked' ? [[c.title || c.summary, '', '']] : []), ...(c.rows || [[c.entityId || 'Nouveau', '', c.summary]]).map((x) => (Array.isArray(x) ? x : [x.t, x.a || '', x.b]))]);
          const del = g.find((c) => c.confirmCode);
          msgs.push({
            t: 'recap', st: 'proposed', changeIds: g.map((c) => c.id), items, confirmCode: del ? del.confirmCode : null, code: '',
            title: group === 'linked' ? g.length + (g.length > 1 ? ' actions liées proposées' : ' action liée proposée') + ' · à valider après le risque' : g.length > 1 ? g.length + ' modifications proposées' : g[0].title || '1 modification proposée',
          });
        }
        comp.setState((s) => ({ jevMsgs: (s.jevMsgs || []).concat(msgs), jevThink: false }));
      } catch (e) {
        comp.setState((s) => ({ jevMsgs: (s.jevMsgs || []).concat([{ t: 'jev', text: errorText(e), err: true }]), jevThink: false }));
      }
      comp.jevScroll();
    },

    /** Validation ou refus d'une proposition de Jev : `POST /assistant/changes/{id}/confirm|reject`. */
    async jevDecide(m, verb) {
      const ids = (m && m.changeIds) || [];
      try {
        const links = [];
        for (const id of ids) {
          // Suppression : confirmation renforcée, le code retapé par l'utilisateur est vérifié par le serveur.
          const r = await ppost('/assistant/changes/' + enc(id) + '/' + verb, verb === 'confirm' && m.confirmCode ? { confirmCode: m.code || '' } : {});
          if (r && r.link) links.push(r.link);
        }
        if (ids.length && verb === 'confirm') {
          scheduleReload();
          // Lien vers chaque enregistrement créé ou modifié (écran du Pilotage).
          const msgs = links.map((l) => ({ t: 'jev', text: 'Enregistré : ' + l.code + '.', link: l }));
          if (m.confirmCode) msgs.push({ t: 'jev', text: 'Supprimé : ' + m.confirmCode + '.' });
          if (msgs.length) { comp.setState((s) => ({ jevMsgs: (s.jevMsgs || []).concat(msgs) })); comp.jevScroll(); }
        }
        return true;
      } catch (e) { toast(errorText(e)); scheduleReload(); return false; }
    },

    /** Nouvelle conversation (réouverture du panneau, « Effacer tous les messages ») : la mémoire de Jev repart de zéro. */
    jevReset() { comp._jevConv = null; },

    /** Pièce jointe de Jev : `POST /assistant/files` ; la progression suit l'envoi réel. */
    jevAttach(files) {
      const fs = [...(files || [])]; if (!fs.length) return;
      const add = fs.map((x) => ({ id: 'f' + Date.now() + Math.random(), name: x.name, ext: (x.name.split('.').pop() || '').toUpperCase().slice(0, 4), sizeL: x.size > 1048576 ? (x.size / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(x.size / 1024)) + ' Ko', pct: 10 }));
      comp.setState((st) => ({ jevFiles: (st.jevFiles || []).concat(add) }));
      comp._jevFileObjs = { ...(comp._jevFileObjs || {}) };
      fs.forEach((f, i) => {
        comp._jevFileObjs[add[i].name] = f;
        const fd = new FormData(); fd.append('file', f, f.name);
        ppost('/assistant/files', fd)
          .then((r) => { (comp._jevFileIds = comp._jevFileIds || []).push(r.id); comp.setState((st) => ({ jevFiles: (st.jevFiles || []).map((x) => (x.id === add[i].id ? { ...x, pct: 100 } : x)) })); })
          .catch((e) => { toast(errorText(e)); comp.setState((st) => ({ jevFiles: (st.jevFiles || []).filter((x) => x.id !== add[i].id) })); });
      });
    },

    /** « Charger » dans la Base de connaissance : les fichiers joints à Jev sont déposés (`POST /documents`). */
    jevLoadFiles(names) {
      const files = (names || []).map((n) => (comp._jevFileObjs || {})[n]).filter(Boolean);
      if (files.length) api.uploadDocuments(files);
    },
  };
  comp._api = api;
  // Session par cookie : expiration après 30 min d'inactivité (« Toujours là ? » 60 s avant) et déconnexion.
  if (!DEV) Auth.startSessionGuard('app');
  api.logout = () => (DEV ? (ls.set(TOKEN_KEY, null), Auth.logout('app')) : Auth.logout('app'));
  // Mon profil › Sécurité : ancienneté réelle du mot de passe, et « Modifier » → POST /api/auth/password.
  const setPwdAge = (iso) => comp.setState({ pwdAge: Auth.passwordAgeLabel(iso) });
  if (!DEV) Auth.session('app').then((r) => { if (r.body && r.body.user) setPwdAge(r.body.user.passwordChangedAt); });
  api.changePassword = () => Auth.openPasswordDialog({
    send: (b) => post('/auth/password', b).then(
      (r) => { setPwdAge(r.user.passwordChangedAt); return { ok: true }; },
      (e) => ({ message: e instanceof ApiError ? e.message : errorText(e), field: e.fields && e.fields.currentPassword ? 'currentPassword' : null }),
    ),
    onDone: () => toast('Mot de passe modifié · vos autres sessions ont été fermées'),
  });
  // Point d'accès réservé aux tests navigateur (?e2e=1).
  if (typeof window !== 'undefined' && /[?&]e2e=1\b/.test(window.location.search)) window.__riseCockpit = comp;
  return api;
}
