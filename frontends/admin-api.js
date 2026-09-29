// admin-api.js — branchement de la Console d'administration RISE sur l'API `/api/admin` (brief Console § 11).
//
// Module ES chargé par `import('./admin-api.js')` depuis les quatre écrans de la console
// (Console Admin, ConsoCouts, ProjetInit, ProjetsBiblio). Il regroupe :
//   1. les appels HTTP (jeton, gestion d'erreur au format `{ code, message, fields?, usages? }`) ;
//   2. les adaptateurs entre les formats de l'API et les structures attendues par les écrans ;
//   3. les fonctions `bindConsole`, `bindConso`, `bindInit`, `bindBiblio`, qui remplacent sur l'instance
//      (monkey-patch) les méthodes et les données de démonstration des écrans, sans toucher au design.
//
// Mode démonstration : `?demo=1` dans l'URL, ou `window.RISE_DEMO = true` avant le chargement de la page.
// Dans ce mode, rien n'est branché : les écrans gardent leurs constantes et leurs simulations d'origine.
//
// Base de l'API : `window.RISE_API_BASE` si elle est définie (ex. 'https://api.exemple.fr'),
// sinon relative à l'origine de la page ('' + '/api/admin/…').
//
// Authentification (auth-api.js) : session par cookie de la Console, ouverte sur /console/connexion ;
// sans session, ou quand elle expire, retour à cet écran. Connexion de développement par jeton
// seulement avec `?as=<accountId>` dans l'URL (serveur en AUTH_DEV) : `POST /api/auth/dev-login`,
// jeton gardé dans `localStorage['rise-admin-token']`.

import * as Auth from './auth-api.js';

const TOKEN_KEY = 'rise-admin-token';
const W = typeof window !== 'undefined' ? window : {};
/** Connexion de développement par jeton (`?as=`) plutôt que session par cookie. */
const DEV = (() => { try { return new URLSearchParams(W.location.search).has('as'); } catch (e) { return false; } })();

/** Base de l'API : `window.RISE_API_BASE`, sinon même origine que la page. */
export const apiBase = () => String(W.RISE_API_BASE || '').replace(/\/+$/, '');

/** Mode démonstration : aucune donnée n'est lue ni écrite sur le serveur. */
export function isDemo() {
  try { return W.RISE_DEMO === true || /[?&]demo=1\b/.test(W.location.search); } catch (e) { return false; }
}

// ───────────────────────────── Appels HTTP ─────────────────────────────

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.message) || 'Erreur ' + status);
    this.status = status;
    this.code = body && body.code;
    this.fields = body && body.fields;
    this.usages = body && body.usages;
    this.body = body;
  }
}

let tokenP = null;
function readToken() { try { return W.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
function writeToken(t) { try { t ? W.localStorage.setItem(TOKEN_KEY, t) : W.localStorage.removeItem(TOKEN_KEY); } catch (e) { /* stockage indisponible */ } }

async function devLogin() {
  let as = 'u1';
  try { as = new URLSearchParams(W.location.search).get('as') || 'u1'; } catch (e) { /* hors navigateur */ }
  const r = await fetch(apiBase() + '/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: as }) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, b);
  writeToken(b.token);
  return b.token;
}

/** Jeton courant : stocké, sinon connexion de développement (une seule à la fois). */
export function token(renew) {
  if (renew) { writeToken(null); tokenP = null; }
  const t = readToken();
  if (t) return Promise.resolve(t);
  if (!tokenP) tokenP = devLogin().finally(() => { tokenP = null; });
  return tokenP;
}

/** Appel brut (chemin absolu `/api/...`). Rejoue une fois après un 401 (jeton expiré ou révoqué). */
async function raw(method, path, body, retry = true) {
  const headers = DEV ? { Authorization: 'Bearer ' + (await token()) } : Auth.sessionHeaders('admin');
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(apiBase() + path, { method, headers, body: payload, credentials: 'same-origin' });
  if (DEV && r.status === 401 && retry) { await token(true); return raw(method, path, body, false); }
  // Session de console absente, expirée ou limitée (mot de passe provisoire) : retour à /console/connexion.
  if (!DEV && (r.status === 401 || r.status === 403)) {
    const b = await r.clone().json().catch(() => null);
    if (r.status === 401 || (b && b.code === 'PASSWORD_CHANGE_REQUIRED')) Auth.toLogin('admin', b && b.code === 'SESSION_EXPIRED' ? 'expiree' : '');
  }
  return r;
}

/** Appel JSON de l'API de la console : `api('GET', '/accounts')` → `/api/admin/accounts`. */
export async function api(method, path, body) {
  return apiAbs(method, '/api/admin' + path, body);
}
/** Appel JSON sur un chemin absolu (`/api/assistant/skills`…). */
async function apiAbs(method, path, body) {
  const r = await raw(method, path, body);
  if (r.status === 204) return null;
  const txt = await r.text();
  let b = null;
  try { b = txt ? JSON.parse(txt) : null; } catch (e) { b = { message: txt }; }
  if (!r.ok) throw new ApiError(r.status, b || {});
  return b;
}
const get = p => api('GET', p), post = (p, b) => api('POST', p, b), patch = (p, b) => api('PATCH', p, b), put = (p, b) => api('PUT', p, b), del = p => api('DELETE', p);

/** Téléchargement d'un export (CSV, JSON) : le serveur trace l'export dans le journal d'audit. */
export async function download(path, fallbackName) {
  const r = await raw('GET', '/api/admin' + path);
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new ApiError(r.status, b); }
  const blob = await r.blob(), cd = r.headers.get('Content-Disposition') || '', m = /filename="?([^";]+)"?/.exec(cd);
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = (m && m[1]) || fallbackName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
  return blob;
}

/** Texte d'une erreur serveur pour le toast : message, champs en erreur, usages (RG12). */
export function errText(e) {
  if (!(e instanceof ApiError)) return 'Serveur injoignable : ' + ((e && e.message) || 'erreur réseau');
  let s = e.message;
  if (e.fields && Object.keys(e.fields).length) s += ' · ' + Object.values(e.fields).join(' · ');
  if (e.usages && e.usages.length) s += ' · ' + e.usages.length + ' usage' + (e.usages.length > 1 ? 's' : '') + ' : ' + e.usages.slice(0, 3).map(u => u.label).join(', ') + (e.usages.length > 3 ? '…' : '');
  return s;
}

// ───────────────────────────── Adaptateurs ─────────────────────────────

const AV = ['#10233a', '#1d8f86', '#43586a', '#0f5f5a', '#5c7280', '#2c4a63'];
export const PROFILE = { ADMIN: 'admin', PMO: 'pmo', RESPONSABLE: 'resp', LECTEUR: 'lec' };
export const STATUS = { ACTIVE: 'actif', INVITED: 'invité', SUSPENDED: 'suspendu' };
export const SEV = { INFO: 'info', SENSITIVE: 'sensible', CRITICAL: 'critique' };
export const PROV_ST = { OK: 'ok', ERROR: 'err', UNTESTED: 'new' };
export const SCOPE = { OFF: 'off', ALL: 'global', PROJECTS: 'projet' };
export const LIB_ST = { ACTIVE: 'actif', PREPARATION: 'prep', CLOSED: 'clos' };
const inv = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const p2 = n => String(n).padStart(2, '0');
const D = v => (v ? new Date(v) : null);
/** Date civile ISO (AAAA-MM-JJ) → Date locale à minuit. */
const dayOf = iso => (iso ? new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) : null);
const isoOf = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
const addDays = (iso, n) => { const d = dayOf(iso); d.setDate(d.getDate() + n); return isoOf(d); };
const daysBetween = (a, b) => Math.round((dayOf(b) - dayOf(a)) / 86400000);

/** Compte API → `{ id, n, e, p, s, ll, inv, pr[], lt, av }` (USERS). */
export function toUser(a, i = 0) {
  const s = STATUS[a.status] || 'actif', last = D(a.lastLoginAt);
  // Jours depuis la dernière connexion, bornés à 0 (la connexion de développement date du jour réel).
  const ll = s === 'invité' || a.lastLoginDays == null ? null : Math.max(0, a.lastLoginDays);
  return { id: a.id, n: a.fullName, e: a.email, p: PROFILE[a.profile] || null, s, ll, inv: s === 'invité' ? Math.max(0, a.invitedDays || 0) : null,
    pr: [...(a.projectCodes || [])], lt: ll === 0 && last ? p2(last.getHours()) + ':' + p2(last.getMinutes()) : '', av: AV[i % AV.length], _v: a.version };
}
/** Administrateur → `{ u, lv:'admin', since }` (un seul niveau, brief § 5). */
export const toAdmin = a => ({ u: a.accountId, lv: 'admin', since: D(a.since) });
/** Entrée d'audit → `{ id, who, a, tg, sev, t }`. */
export const toAudit = a => ({ id: a.id, who: a.who, a: a.action, tg: a.target || [a.entityType, a.entityId].filter(Boolean).join(' · '), sev: SEV[a.severity] || 'info', t: D(a.at) });
/** Fournisseur → `{ id, n, pre, l4, st, lat, t, err }` (jamais de clé en clair). */
export const toProv = p => ({ id: p.id, n: p.name, pre: p.keyPrefix || '', l4: p.keyLast4 || '', st: PROV_ST[p.status] || 'new', lat: p.latencyMs, t: D(p.lastTestedAt) || new Date(), err: p.lastError || '', bad: p.status === 'ERROR', testing: false });
/** Modèle → `{ id, pv, n, d, pin, pout, act }`. */
/** Modèle → `{ id, pv, n, d, c, rel, maxOut, apiId, ctx, dims, dim, unit, pin, pout, per1k, act }` (tarif selon l'unité : € / M tokens ou € / 1 000 requêtes). */
export const toModel = m => { const pr = m.price || { unit: 'TOKENS', in: m.priceIn, out: m.priceOut, per1k: null }; return { id: m.id, pv: m.providerId, n: m.name, d: m.description || '', c: m.category || 'LLM', rel: m.releaseDate || '', maxOut: m.maxOutputTokens || null,
  apiId: m.providerModelId || '', ctx: m.contextTokens || null, dims: m.dimensions || [], dim: m.defaultDimension || null, unit: pr.unit, pin: pr.in, pout: pr.out, per1k: pr.per1k, act: m.active }; };
/** Modèle des écrans IA (`ia-data.js`, catégorie en minuscules) → corps de `POST` / `PATCH /models`. */
export const fromIaModel = im => { const p = im.price || {}, rq = p.unit === 'requests'; return { name: im.n, description: im.d || '', category: String(im.cat || 'llm').toUpperCase(), releaseDate: im.rel || null, maxOutputTokens: im.cat === 'llm' ? im.maxOut || null : null,
  providerModelId: im.apiId || null, contextTokens: im.ctx || null, dimensions: im.cat === 'embedding' ? im.dims || [] : [], defaultDimension: im.cat === 'embedding' ? im.dim || null : null, price: rq ? { unit: 'REQUESTS', per1k: p.per1k } : { unit: 'TOKENS', in: p.in, out: im.cat === 'llm' ? p.out : null } }; };
/** Volumes 30 jours par fonction (`GET /functions`) → `{ fnId: { tin, tout, req } }` en tokens et requêtes. */
export const toVol = r => Object.fromEntries(r.functions.map(f => [f.id, { tin: f.volume30d.tokensIn, tout: f.volume30d.tokensOut, req: f.volume30d.requests }]));
/** Affectations → `{ insights:{p,f}, crud:{p,f}, docs:{p,f} }`. */
// Embedding : `d` = dimension des vecteurs du principal (chaîne, comme la valeur d'un <select>).
export const toAsg = list => Object.fromEntries(list.map(a => [a.functionId, a.dimension ? { p: a.primary || '', f: a.fallback || '', d: String(a.dimension) } : { p: a.primary || '', f: a.fallback || '' }]));
/** Affectation → corps de `PUT /assignments` ; une fonction sans modèle principal n'est pas envoyée (aucun LLM choisi). */
export const fromAsg = asg => Object.fromEntries(Object.entries(asg).filter(([, v]) => v.p).map(([k, v]) => [k, v.d ? { primary: v.p, fallback: v.f || null, dimension: +v.d } : { primary: v.p, fallback: v.f || null }]));
/** Détail jour × fonction × modèle → lignes `{ d, fn, m, pv, tin, tout, c }` de `genUsage()` (d = 0…89, 89 = aujourd'hui). */
export const toUsageRows = (detail, from) => (detail || []).map(r => ({ d: daysBetween(from, r.day), fn: r.functionId, m: r.modelId, pv: r.providerId, tin: r.tokensIn, tout: r.tokensOut, c: r.costEur, fb: r.fallbackUsed }));
/** Plafonds → `th[]` de la console `{ id, n, lim, warn, on }` (seulement ceux qui ont un plafond). */
export const toTh = list => list.filter(t => t.limitEur != null).map(t => ({ id: t.id, n: t.name, lim: t.limitEur, warn: t.warnPct, on: t.enabled }));
/** Rafraîchissement des notifications de l'administrateur (spécification NOTIFICATIONS § 5). */
const NT_REFRESH_MS = 60_000;
/** Date relative d'une notification : « à l'instant », « il y a 12 min », « il y a 1 h », « hier, 17:20 », « il y a 2 j ». */
export const relWhen = (iso, now = Date.now()) => {
  const d = new Date(iso), m = Math.max(0, Math.round((now - d.getTime()) / 60_000));
  if (m < 1) return 'à l’instant';
  if (m < 60) return 'il y a ' + m + ' min';
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (d >= today) return 'il y a ' + Math.round(m / 60) + ' h';
  if (d >= new Date(today.getTime() - 86_400_000)) return 'hier, ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return 'il y a ' + Math.max(2, Math.round((today - d) / 86_400_000) + 1) + ' j';
};
/** Notification du serveur → élément du tiroir (`Notifications.dc.html`) ; `pending` : demande encore à traiter. */
export const toNotif = n => ({ id: n.id, type: n.type, title: n.title, text: n.text, note: n.note, when: relWhen(n.createdAt), unread: n.unread, actLabel: n.actLabel, meta: n.meta, target: n.target, pending: n.pending });
/** Snapshot du serveur (`{ id, date, type, libelle, auteur, compteurs }`) → `{ id, t, k, lab, by, ix, cnt }`. */
export const toSnap = (s, ix) => ({ id: s.id, t: D(s.date), k: s.type, lab: s.libelle || '', by: s.auteur || '', ix, cnt: s.compteurs });
/** Planification d'un projet → `sched` `{ on, fq, day, hour, keep }`. */
export const toSched = s => ({ on: !!s.enabled, fq: s.frequency, day: s.day, hour: s.hour, keep: s.retention });
export const fromSched = s => ({ enabled: !!s.on, frequency: s.fq, day: s.day, hour: s.hour, retention: s.keep });
/** Registre des cartes API v3c : carte du serveur → modèle `Card` (§ 5). Jamais la clé, seulement ses 4 derniers caractères. */
const HTTP_TXT = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect', 400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden', 404: 'Not Found', 408: 'Request Timeout', 410: 'Gone', 422: 'Unprocessable Entity', 429: 'Too Many Requests', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout' };
export const toDdmmyy = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(2, 4) : null);
export const fromDdmmyy = k => { const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(k || ''); return m ? '20' + m[3] + '-' + m[2] + '-' + m[1] : null; };
/** Dernier test → `resp` ; serveur injoignable (code 0) : 504 si le délai est dépassé, sinon 502 (réponse d'une passerelle). */
export const toResp = (t, note) => {
  if (!t) return null;
  const code = t.code || (/Délai/.test(note || '') ? 504 : 502), lines = String(t.body || '').split('\n');
  return { code, txt: HTTP_TXT[code] || (t.code ? 'HTTP ' + code : note || 'Injoignable'), ms: t.ms ?? 0, when: relWhen(t.at), body: lines.length > 40 ? [...lines.slice(0, 40), '…'] : lines };
};
export const toCard = v => ({ id: v.id, n: v.name, tag: v.category, ep: v.endpoint.replace(/^https:\/\//, ''), lat: v.latencyMedian24h ?? null, series: v.latency24h || null,
  q: v.quotaLimit ? Math.round(((v.quotaUsed || 0) / v.quotaLimit) * 100) : null, hasKey: !!v.keyLast4, key: toDdmmyy(v.keyExpiresAt), last4: v.keyLast4 || null,
  w: [...(v.widgets || [])], fmt: v.feed ? 'xml' : 'json', resp: toResp(v.lastTest, v.statusNote), off: !v.enabled });
/** « dernière vérification … » : le test le plus récent des cartes. */
export const lastCheck = cards => { const t = cards.map(v => v.lastTest && v.lastTest.at).filter(Boolean).sort().pop(); return t ? relWhen(t) : 'à venir'; };
/** Module → `{ id, n, d, sc, pj:{CODE:Date}, g }`. */
export const toMod = m => ({ id: m.id, n: m.name, d: m.description || '', sc: SCOPE[m.scope] || 'off', pj: Object.fromEntries(Object.entries(m.since || {}).map(([k, v]) => [k, D(v)])), g: D(m.globalSince) });
const MOD_ORDER = ['bud', 'ben'];
const sortMods = l => [...l].sort((a, b) => (MOD_ORDER.indexOf(a.id) + 1 || 99) - (MOD_ORDER.indexOf(b.id) + 1 || 99));
/** Demande d'activation → `{ id, m, who, p, t }`. */
export const toReq = r => ({ id: r.id, m: r.moduleId, who: r.requestedBy, p: r.projectCode || r.projectId, t: D(r.at) });
/** Profil de l'administrateur → `prof`. */
export const toProf = me => { const p = me.profile || {}; return { first: me.firstName || '', last: me.lastName || '', pos: p.position || '', soc: p.company || '', team: p.team || '', mail: me.email, tel: p.phone || '', city: p.city || '', country: p.country || 'France', lang: p.language || 'Français', tz: p.timezone || 'Europe/Paris (UTC+2)' }; };
export const fromProf = d => ({ firstName: d.first.trim(), lastName: d.last.trim(), email: d.mail.trim(), position: d.pos || '', company: d.soc || '', team: d.team || '', phone: d.tel || '', city: d.city || '', country: d.country || '', language: d.lang || '', timezone: d.tz || '' });

// Horloge de référence : l'instant du serveur (`DEMO_NOW` en démonstration) + temps écoulé.
let clock = { server: Date.now(), local: Date.now() };
const now = () => new Date(clock.server + (Date.now() - clock.local));
function ago(d) {
  const m = Math.max(0, Math.round((now() - d) / 60000)); if (m < 1) return 'à l’instant'; if (m < 60) return 'il y a ' + m + ' min';
  const h = Math.round(m / 60); if (h < 24) return 'il y a ' + h + ' h'; return 'il y a ' + Math.round(h / 24) + ' j';
}
/** Session → `{ id, d, l, t, cur }`. */
export const toSess = s => ({ id: s.id, d: s.device || 'Appareil inconnu', l: s.location || '—', t: s.current ? 'Session actuelle' : 'Active ' + ago(D(s.lastSeenAt)), cur: !!s.current });

// ───────────────────────────── Console Admin ─────────────────────────────

// Styles des pastilles de la console (copie de `TONE`, `pill`, `dot` de Console Admin.dc.html).
const TH_TONE = { ok: ['#e6f3f2', '#0f5f5a', '#1d8f86'], warn: ['#fff3dc', '#8a5a12', '#e39a26'], err: ['#fdecec', '#a8372c', '#d94b4b'], neu: ['#eef3f2', '#43586a', '#8a9aa6'] };
const TH_PILL = t => `display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;background:${TH_TONE[t][0]};color:${TH_TONE[t][1]}`;
const TH_DOT = t => `width:6px;height:6px;border-radius:50%;flex:none;background:${TH_TONE[t][2]}`;

/**
 * Branche l'instance de la console : chargement initial par `GET`, rechargement de la section
 * à l'ouverture de chaque menu, et méthodes d'écriture appelant l'API.
 */
export function bindConsole(c) {
  if (isDemo() || c.__api) return;
  c.__api = true;
  // Session par cookie : expiration après 15 min d'inactivité (« Toujours là ? » 60 s avant) ; déconnexion du profil.
  if (!DEV) Auth.startSessionGuard('admin');
  c._logout = () => { if (DEV) writeToken(null); return Auth.logout('admin'); };
  const set0 = c.setState.bind(c), orig = {};
  ['go', 'setUser', 'saveUser', 'removeUser', 'saveAdmin', 'removeAdmin', 'testKey', 'testAll', 'saveKey', 'saveProv', 'toggleModel', 'saveModel', 'saveFiche', 'saveAsg', 'setTh', 'doCapture',
    'setMod', 'approve', 'reject', 'saveMe', 'revoke', 'revokeAll', 'onPhoto', 'exportAudit', 'exportCsv', 'jevReply', 'mtd', 'thVals', 'renderVals', 'skSave', 'skToggle', 'skCreate', 'skDelete', 'psSave', 'psUpload', 'ntToggle', 'ntAct', 'ntUndo', 'ntReadAll', 'apTest', 'apCreate', 'apSave', 'apToggle', 'apDelete', 'apRestore', 'apWidgetsSet'].forEach(k => { orig[k] = c[k].bind(c); });
  const toast = (m, t, u) => c.toast(m, t, u), fail = e => { console.warn('[admin-api]', e); toast(errText(e), 'err'); };
  let meId = 'u1';
  const PROJ = () => Object.keys(c.state.snaps || {});

  // Le serveur écrit le journal d'audit : l'écriture locale est neutralisée, le journal est relu.
  c.log = () => {};
  c.applyScenario = () => {};
  let tAudit;
  const touch = () => { clearTimeout(tAudit); tAudit = setTimeout(() => load(['audit']).catch(() => {}), 350); };

  // ── Chargements (GET) ──
  const apPend = {}; // suppressions de cartes API en attente (identifiant → minuterie)
  const L = {
    accounts: async () => { const r = await get('/accounts'); return { users: r.items.map(toUser) }; },
    admins: async () => ({ admins: (await get('/admins')).map(toAdmin) }),
    audit: async () => ({ audit: (await get('/audit')).map(toAudit) }),
    providers: async () => ({ provs: (await get('/providers')).map(toProv) }),
    models: async () => ({ models: (await get('/models')).map(toModel) }),
    // Volume et sortie requise (Génération de rapports : plus long rendu mesuré sur 30 jours) par fonction.
    // Volume, sortie requise et historique (vol non nul : l'estimation d'une fonction nouvelle n'est plus utilisée).
    fns: async () => { const r = await get('/functions'); return { aiVol: toVol(r), aiNeed: Object.fromEntries(r.functions.filter(f => f.needOut).map(f => [f.id, f.needOut])), aiHist: Object.fromEntries(r.functions.map(f => [f.id, f.vol !== null])) }; },
    asg: async () => { const asg = toAsg(await get('/assignments')), S = c.state, clean = !S.draft || JSON.stringify(S.asg) === JSON.stringify(S.draft); return clean ? { asg, draft: JSON.parse(JSON.stringify(asg)) } : { asg }; },
    usage: async () => {
      const m = await get('/usage/month'), from = addDays(m.today, -89), u = await get('/usage?from=' + from + '&to=' + m.today + '&groupBy=day');
      return { apiMonth: m, usage: toUsageRows(u.detail, from), th: toTh(m.thresholds) };
    },
    month: async () => { const m = await get('/usage/month'); return { apiMonth: m, th: toTh(m.thresholds) }; },
    // Vue d'ensemble du serveur : dernier snapshot (tous projets) et prochaine capture de son projet ; points à traiter
    // que la Console ne calcule pas elle-même (échecs d'envoi de notifications, demandes d'invitation du PMO).
    ov: async () => {
      const ov = await get('/overview'), sn = (ov.vitals || []).find(v => v.id === 'snapshot'), code = sn && sn.value ? String(sn.detail || '').split(' · ')[0] : null;
      const sc = code ? await get('/projects/' + encodeURIComponent(code) + '/snapshot-schedule').catch(() => null) : null;
      const fails = (ov.attention || []).filter(a => a.kind === 'DELIVERY_FAILED'), invReq = (ov.attention || []).filter(a => a.kind === 'INVITATION_REQUEST'), extra = [];
      if (fails.length) extra.push({ tone: 'err', t: fails.length + ' échec' + (fails.length > 1 ? 's' : '') + ' d’envoi de notification sur 7 jours', d: fails.map(f => f.detail).slice(0, 2).join(' · ') + (fails.length > 2 ? '…' : '.'), cta: 'Voir l’historique', go: () => c.go('notifs') });
      invReq.forEach(r => extra.push({ tone: 'info', t: 'Demande d’invitation du PMO', d: r.detail + '.', cta: 'Examiner', go: () => c.go('users') }));
      return { ovExtra: extra, ovSnap: { t: sn && sn.value ? D(sn.value) : null, p: code, next: sc && sc.prochaineCapture ? D(sc.prochaineCapture) : null } };
    },
    snaps: async () => {
      const codes = PROJ(), lists = await Promise.all(codes.map(p => get('/projects/' + p + '/snapshots')));
      const snaps = {}; codes.forEach((p, i) => { snaps[p] = lists[i].map(toSnap); });
      return { snaps };
    },
    sched: async () => ({ sched: toSched(await get('/projects/' + c.state.sPj + '/snapshot-schedule')) }),
    // Notifications et alertes : format Rule / History de la vue (NOTIFICATIONS ET ALERTES - specification.md § 2).
    nrRules: async () => ({ nrRules: await get('/notifications/rules') }),
    nrHist: async () => ({ nrHist: await get('/notifications/history?limit=200') }),
    nrCounts: async () => ({ nrCounts: await get('/notifications/counts') }),
    nrSchedule: async () => ({ nrSchedule: await get('/notifications/schedule') }),
    // Serveur d’envoi SMTP : réglages sans mot de passe (`hasPassword`).
    smtp: async () => ({ smSettings: await get('/settings/smtp') }),
    mods: async () => ({ mods: sortMods((await get('/modules')).map(toMod)) }),
    reqs: async () => ({ reqs: (await get('/module-requests?status=PENDING')).map(toReq) }),
    prof: async () => { const me = await get('/me/profile'); meId = me.id; return { prof: toProf(me), pn: { crit: true, budget: true, req: true, hebdo: true, fail: false, ...(me.notifications || {}) }, photo: me.photoUrl || null }; },
    sess: async () => ({ sess: (await get('/me/sessions')).map(toSess) }),
    projects: async () => ({ apiCodes: (await get('/projects')).map(p => p.code) }),
    // Au-delà de SKILLS_REMOTE_THRESHOLD skills, l'écran passe en mode serveur (recherche, filtre, pagination).
    skills: async () => {
      const head = await apiAbs('GET', SK + '?page=1&par_page=' + SKILLS_PER_PAGE);
      if (head.toutes > SKILLS_REMOTE_THRESHOLD) return { skills: [], skRemote: true };
      return { skills: toSkills(await apiAbs('GET', SK)), skRemote: false };
    },
    persona: async () => ({ persona: toPersona(await apiAbs('GET', PS)) }),
    notifs: async () => ({ nt: (await get('/notifications')).items.map(toNotif) }),
    // Registre des cartes API v3c : cartes au format Card (§ 5) et catalogue des widgets ; une suppression en attente
    // (délai d'annulation de 5 s) reste masquée.
    apis: async () => { const [cards, widgets] = await Promise.all([get('/api-cards'), get('/widgets')]);
      return { apiCards: cards, apCards: cards.filter(v => !apPend[v.id]).map(toCard), apWidgets: widgets, apChecked: lastCheck(cards) }; },
  };
  const SECTION = {
    overview: ['accounts', 'providers', 'month', 'audit', 'reqs', 'snaps', 'sched', 'ov', 'models', 'asg', 'fns'], users: ['accounts'], admins: ['admins', 'audit', 'accounts'], providers: ['providers', 'models', 'asg', 'fns'],
    assign: ['asg', 'models', 'providers', 'usage', 'fns'], conso: ['month', 'providers'], snaps: [], notifs: ['nrRules', 'nrHist', 'nrCounts', 'nrSchedule', 'models', 'providers', 'projects'], modules: ['mods', 'reqs'],
    smtp: ['smtp'], init: ['projects'], library: ['projects'], profil: ['prof', 'sess', 'audit'], skills: ['skills'], persona: ['persona'], apis: ['apis'],
  };
  async function load(keys) {
    const parts = await Promise.all(keys.map(k => L[k]()));
    const patch = Object.assign({}, ...parts);
    set0(patch);
    return patch;
  }

  // ── Démarrage : squelette de chargement jusqu'à la réception des données du serveur ──
  set0({ apiBoot: true, loading: true, nt: [], nrApi: true, apApi: true, smApi: true });
  (async () => {
    try {
      const ov = await get('/overview');
      clock = { server: new Date(ov.date).getTime(), local: Date.now() };
      // L'horloge de la Console (« aujourd'hui », « il y a… », mois en cours) suit celle du serveur.
      if (typeof c.apiClock === 'function') c.apiClock(clock.server);
      // Échéances des clés API : même date du jour que le serveur (DEMO_TODAY compris).
      set0({ apiNow: String(ov.date).slice(0, 10) + 'T12:00:00' });
      await load(['ov', 'prof', 'accounts', 'admins', 'audit', 'providers', 'models', 'asg', 'usage', 'snaps', 'sched', 'nrRules', 'nrHist', 'nrCounts', 'nrSchedule', 'smtp', 'mods', 'reqs', 'sess', 'projects', 'skills', 'persona', 'notifs', 'apis', 'fns']);
      set0({ apiBoot: false, loading: false });
    } catch (e) {
      fail(e);
      if (e instanceof ApiError && e.status === 403) return; // Réservé à l'Admin : masquage complet (squelette seul).
      set0({ apiBoot: 'error' });
    }
  })();
  // Plafonds modifiés dans « Consommation et coûts » : une seule source (brief § 12).
  const onTh = () => load(['month']).catch(() => {});
  W.addEventListener && W.addEventListener('rise-admin:thresholds', onTh);
  const unmount0 = c.componentWillUnmount.bind(c);
  c.componentWillUnmount = () => { W.removeEventListener && W.removeEventListener('rise-admin:thresholds', onTh); unmount0(); };

  // ── Skills de Jev (/api/assistant/skills, écran en tuiles) ──
  // L'écran attend chaque appel (promesse) : succès, il garde son état (la liste n'est pas relue, ce qui remettrait sa
  // sélection et sa page à zéro) ; échec, il revient à l'état précédent et affiche le motif. Une skill créée reçoit
  // l'id du serveur ; un appel lancé avant (id provisoire `new-…`) attend cette création.
  const SK = '/api/assistant/skills', skAlias = {}, skPend = {};
  const SKILLS_REMOTE_THRESHOLD = 200, SKILLS_PER_PAGE = 9, SK_FILTER = { all: 'toutes', on: 'actives', off: 'desactivees' };
  const toPersona = r => ({ identity: { name: r.identity.name, creature: r.identity.creature, style: r.identity.style, emoji: r.identity.emoji, avatar: r.identity.avatar, photo: r.identity.photo }, soul: r.soul });
  const toSkill = s => ({ id: s.id, n: s.n, t: s.t, on: s.on });
  const toSkills = list => list.map(toSkill);
  const skId = async id => skPend[id] ? await skPend[id] : (skAlias[id] || id);
  const skErr = e => new Error(errText(e));
  c.skCreate = sk => {
    const p = apiAbs('POST', SK, { n: sk.n, t: sk.t, on: false }).then(r => { skAlias[sk.id] = r.id; delete skPend[sk.id]; touch(); return toSkill(r); });
    skPend[sk.id] = p.then(r => r.id);
    return p.catch(e => { delete skPend[sk.id]; throw skErr(e); });
  };
  c.skSave = sk => skId(sk.id).then(id => apiAbs('PUT', SK + '/' + id, { n: sk.n, t: sk.t })).then(r => { touch(); return toSkill(r); }, e => { throw skErr(e); });
  c.skToggle = (id0, on) => skId(id0).then(id => apiAbs('PATCH', SK + '/' + id + '/active', { on })).then(r => { touch(); return toSkill(r); }, e => { throw skErr(e); });
  c.skDelete = id0 => skId(id0).then(id => apiAbs('DELETE', SK + '/' + id)).then(() => { touch(); }, e => { throw skErr(e); });
  const skQuery = ({ q, f, page, per }) => apiAbs('GET', SK + '?q=' + encodeURIComponent(q || '') + '&filtre=' + (SK_FILTER[f] || 'toutes') + '&page=' + (page + 1) + '&par_page=' + per)
    .then(r => ({ items: toSkills(r.items), filtered: r.total, toutes: r.toutes, actives: r.actives }), e => { throw skErr(e); });

  // ── Persona de Jev (/api/assistant/persona, PERSONA - specification.md § 5) ──
  // L'image importée est envoyée dès son choix ; le composant la garde en aperçu (data URL) dans son brouillon :
  // à l'enregistrement, cet aperçu est remplacé par l'URL renvoyée par le serveur.
  const PS = '/api/assistant/persona';
  let psUp = null;
  // Écran en tuiles : l'écran attend les promesses (URL de l'image, Persona enregistré) et affiche lui-même les
  // confirmations et les refus (notification sombre) ; en cas d'échec, sa modification reste en attente.
  const psErr = e => new Error(errText(e));
  c.psUpload = file => { const fd = new FormData(); fd.append('file', file); psUp = apiAbs('POST', PS + '/avatar', fd).then(r => r.url); return psUp.catch(e => { psUp = null; throw psErr(e); }); };
  c.psSave = async p => {
    const body = JSON.parse(JSON.stringify(p)), prev = (c.state.persona || {}).identity || {};
    if (body.identity.photo && body.identity.photo.startsWith('data:')) {
      const url = psUp ? await psUp.catch(() => null) : null;
      body.identity.photo = url || prev.photo || null; // image refusée : le reste est enregistré avec l'image précédente
    }
    try { const r = await apiAbs('PUT', PS, body); psUp = null; const v = toPersona(r); set0({ persona: v }); touch(); return v; }
    catch (e) { throw psErr(e); }
  };

  // ── Notifications de l'administrateur (/api/admin/notifications, NOTIFICATIONS - specification.md § 5) ──
  // Rafraîchies à l'ouverture du tiroir et toutes les 60 s ; une décision est exécutée par le serveur après 10 s,
  // d'où un rechargement des pages concernées (comptes, modules) juste après ce délai.
  const refreshNt = () => load(['notifs']).catch(() => {});
  const ntTimer = setInterval(refreshNt, NT_REFRESH_MS);
  const unmountNt = c.componentWillUnmount.bind(c);
  c.componentWillUnmount = () => { clearInterval(ntTimer); unmountNt(); };
  c.ntToggle = () => { const open = !c.state.ntOpen; set0({ ntOpen: open }); if (open) refreshNt(); };
  c.ntAct = async (id, a) => {
    const n = (c.state.nt || []).find(x => x.id === id);
    if (a === 'fix' || a === 'open') { set0({ ntOpen: false }); if (n && n.target) c.go(n.target); post('/notifications/' + id + '/read').then(refreshNt).catch(() => {}); return; }
    try {
      await post('/notifications/' + id + '/decision', { decision: a });
      refreshNt(); touch();
      setTimeout(() => { load(['notifs', 'accounts', 'reqs', 'mods']).catch(() => {}); touch(); }, 10_000 + 1_500);
    } catch (e) { fail(e); refreshNt(); }
  };
  c.ntUndo = id => post('/notifications/' + id + '/undo').then(() => { toast('Décision annulée'); refreshNt(); touch(); }).catch(e => { fail(e); refreshNt(); });
  c.ntReadAll = () => post('/notifications/read-all').then(refreshNt).catch(fail);

  // ── Serveur d’envoi SMTP (Serveur SMTP.dc.html, SMTP - specification.md § 6) ──
  // Test et envoi s'exécutent côté serveur ; le mot de passe n'est envoyé que s'il a été saisi (vide : conservé).
  const smBody = d => ({ host: d.host.trim(), port: Number(d.port), enc: d.enc, auth: !!d.auth, user: d.user.trim(), from: d.from.trim(), ...(d.pass && d.pass.trim() ? { password: d.pass } : {}) });
  c.smSave = d => put('/settings/smtp', smBody(d)).then(st => { set0({ smSettings: st }); touch(); return st; }).catch(e => { fail(e); return null; });
  c.smTest = d => post('/settings/smtp/test', smBody(d)).then(r => { touch(); load(['smtp']).catch(() => {}); return r; }).catch(e => { fail(e); return null; });
  c.smTestEmail = (to, d) => post('/settings/smtp/test-email', { to, settings: smBody(d) }).then(r => { touch(); return r; }).catch(e => { fail(e); return null; });

  // ── Registre des cartes API v3c (Registre des cartes API.dc.html, REGISTRE API - specification.md § 6) ──
  // Le composant met sa liste à jour lui-même et confirme par ses propres messages ; les écritures partent l'une
  // après l'autre, puis la liste du serveur est relue (elle rétablit l'état réel en cas de refus, message d'erreur
  // à l'appui). La clé n'est envoyée que si elle a été saisie ; le serveur n'en renvoie que les 4 derniers caractères.
  let apQ = Promise.resolve();
  const AC = id => '/api-cards/' + encodeURIComponent(id);
  const apReload = () => { refreshNt(); return load(['apis']).catch(() => {}); };
  const apRun = call => (apQ = apQ.then(call).then(r => { touch(); return apReload().then(() => r); }).catch(e => { fail(e); apReload(); return null; }));
  const expIso = card => (card.hasKey ? fromDdmmyy(card.key) : null);
  c.apCreate = (card, key) => apRun(() => post('/api-cards', { name: card.n, category: card.tag, endpoint: 'https://' + card.ep, key: key || null, keyExpiresAt: expIso(card) })).then(r => r && r.id);
  c.apSave = (id, card, key) => {
    const before = (c.state.apiCards || []).find(x => x.id === id) || {}, body = { name: card.n, category: card.tag, endpoint: 'https://' + card.ep, keyExpiresAt: expIso(card) };
    if (key) body.key = key; else if (!card.hasKey && before.keyLast4) body.key = null;
    return apRun(() => patch(AC(id), body));
  };
  c.apToggle = (id, off) => apRun(() => patch(AC(id), { enabled: !off }));
  c.apWidgetsSet = (id, ids) => apRun(() => put(AC(id) + '/widgets', { ids }));
  // Suppression : envoyée au serveur à la fin des 5 s pendant lesquelles le message propose « Annuler ».
  c.apDelete = id => { clearTimeout(apPend[id]); apPend[id] = setTimeout(() => apRun(() => del(AC(id))).then(() => { delete apPend[id]; }), 5000); };
  c.apRestore = id => { clearTimeout(apPend[id]); delete apPend[id]; };
  c.apTest = id => post(AC(id) + '/test').then(r => { touch(); apReload(); return { resp: toResp({ code: r.code, ms: r.ms, at: new Date().toISOString(), body: r.body }, r.code ? '' : 'Injoignable'), lat: null }; }).catch(e => { fail(e); return null; });

  // Ouverture d'un menu : rechargement de la section en arrière-plan.
  c.go = (sec, then) => { orig.go(sec, then); if (!c.state.apiBoot && SECTION[sec]) load(SECTION[sec]).catch(fail); };

  // Observateur d'état : planification des snapshots (par projet, Q10), préférences de notification.
  c.setState = (u, cb) => {
    const prev = c.state; set0(u, cb); const next = c.state;
    if (next.apiBoot) return;
    if (next.sPj !== prev.sPj) load(['sched']).catch(fail);
    else if (next.sched !== prev.sched && prev.sched) put('/projects/' + next.sPj + '/snapshot-schedule', fromSched(next.sched)).then(s => { set0({ sched: toSched(s) }); touch(); }).catch(e => { fail(e); load(['sched']).catch(() => {}); });
    if (next.pn !== prev.pn && prev.pn) patch('/me/notifications', next.pn).then(pn => set0({ pn: { ...next.pn, ...pn } })).catch(e => { fail(e); load(['prof']).catch(() => {}); });
  };

  /** Confirmation (`ask`) dont le bouton « Confirmer » appelle d'abord l'API, puis applique l'effet local d'origine. */
  function gateAsk(name, action) {
    const o0 = orig[name] || c[name].bind(c);
    return (...args) => {
      const ask0 = c.ask;
      c.ask = o => ask0.call(c, o && o.ok ? { ...o, ok: async () => { try { const after = await action(...args); o.ok(); after && after(); touch(); } catch (e) { fail(e); } } } : o);
      try { return o0(...args); } finally { c.ask = ask0; }
    };
  }
  const repl = (key, id, obj, idKey = 'id') => set0(s => ({ [key]: s[key].map(x => (x[idKey] === id ? obj : x)) }));

  // ── Utilisateurs ──
  const userFrom = a => { const i = c.state.users.findIndex(u => u.id === a.id); return toUser(a, i < 0 ? c.state.users.length : i); };
  // Statut et invitation : `setUser` sert aux boutons, au panneau latéral et aux actions de Jev.
  c.setUser = (id, p) => {
    const u = c.uById(id); orig.setUser(id, p);
    if (!u) return;
    const call = p.s === 'suspendu' && u.s !== 'suspendu' ? '/suspend' : p.s === 'actif' && u.s === 'suspendu' ? '/reactivate' : p.inv === 0 && u.s === 'invité' ? '/resend-invite' : null;
    if (call) post('/accounts/' + id + call).then(a => { repl('users', id, userFrom(a)); touch(); }).catch(e => { fail(e); load(['accounts']).catch(() => {}); });
  };
  c.saveUser = async () => {
    const S = c.state, f = S.form, fe = {}, id = S.dlg.id, PN = { admin: 'Admin', pmo: 'PMO', resp: 'Responsable', lec: 'Lecteur' };
    if (!f.n || f.n.trim().length < 2) fe.n = 'Indiquez le nom complet.';
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test((f.e || '').trim())) fe.e = 'Adresse e-mail invalide.';
    else if (S.users.some(u => u.e.toLowerCase() === f.e.trim().toLowerCase() && u.id !== id)) fe.e = 'Cette adresse est déjà utilisée par un autre compte.';
    if (!f.pr.length) fe.pr = 'Rattachez au moins un projet.';
    if (Object.keys(fe).length) return c.setState({ fe });
    // Erreur serveur : la fenêtre de saisie reste (ou redevient) ouverte, avec le message du serveur.
    const onErr = e => { set0({ dlg: { type: 'user', id }, form: f }); if (e instanceof ApiError && e.code === 'DUPLICATE') set0({ fe: { e: e.message } }); else fail(e); };
    if (!id) {
      try {
        const a = await post('/accounts', { fullName: f.n.trim(), email: f.e.trim(), profile: f.p, projectCodes: f.pr });
        const nu = toUser(a, S.users.length);
        set0(s => ({ users: [nu, ...s.users], dlg: null, form: {} })); toast('Invitation envoyée à ' + nu.e); touch();
      } catch (e) { onErr(e); }
      return;
    }
    const u = c.uById(id), profCh = u.p !== f.p, prCh = [...f.pr].sort().join() !== [...u.pr].sort().join();
    const apply = async () => {
      const body = {};
      if (f.n.trim() !== u.n) body.fullName = f.n.trim();
      if (f.e.trim().toLowerCase() !== u.e.toLowerCase()) body.email = f.e.trim();
      if (profCh) body.profile = f.p;
      if (prCh) body.projectCodes = f.pr;
      try {
        const a = Object.keys(body).length ? await patch('/accounts/' + id, body) : null;
        if (a) repl('users', id, userFrom(a));
        set0({ dlg: null, form: {} }); toast('Modifications enregistrées pour ' + f.n.trim()); touch();
        if (profCh) load(['admins']).catch(() => {});
      } catch (e) { onErr(e); }
    };
    if (profCh || prCh) c.ask({ keepPrev: true, tone: 'warn', title: 'Modifier les habilitations de ' + u.n + ' ?', body: 'Ses droits sur les projets sont recalculés à partir du profil. Les droits définis individuellement sont conservés.', items: [profCh && { l: 'Profil', a: PN[u.p], b: PN[f.p] }, prCh && { l: 'Projets', a: u.pr.join(', '), b: f.pr.join(', ') }].filter(Boolean), cta: 'Confirmer la modification', ok: apply });
    else apply();
  };
  c.removeUser = gateAsk('removeUser', u => del('/accounts/' + u.id));

  // ── Administrateurs et audit ──
  c.saveAdmin = async () => {
    const f = c.state.form; if (!f.u) return c.setState({ fe: { u: 'Choisissez un utilisateur.' } });
    const u = c.uById(f.u);
    try { const list = await post('/admins', { accountId: f.u }); set0({ admins: list.map(toAdmin), dlg: null, form: {} }); toast(u.n + ' est désormais administrateur'); touch(); load(['accounts']).catch(() => {}); } catch (e) { fail(e); }
  };
  c.removeAdmin = gateAsk('removeAdmin', a => del('/admins/' + a.u).then(() => () => load(['accounts']).catch(() => {})));
  c.exportAudit = async () => {
    const S = c.state, q = new URLSearchParams();
    if (S.aSev && S.aSev !== 'tous') q.set('severity', S.aSev);
    if (S.aq && S.aq.trim()) q.set('q', S.aq.trim());
    try { await download('/audit/export.csv' + (q.toString() ? '?' + q : ''), 'journal-audit.csv'); toast('Journal d’audit exporté'); touch(); } catch (e) { fail(e); }
  };

  // ── Fournisseurs et modèles : la clé saisie part au serveur et n'est jamais conservée dans l'état ──
  const provTested = (p, silent) => { const x = toProv(p); repl('provs', x.id, x); if (!silent) toast(x.st === 'ok' ? x.n + ' répond en ' + x.lat + ' ms' : /^\d{3} /.test(x.err) ? x.n + ' refuse la clé (' + x.err.slice(0, 3) + ')' : x.n + ' : ' + (x.err || 'test impossible'), x.st === 'ok' ? 'ok' : 'err'); return x; };
  c.testKey = async (id, silent) => {
    c.setProv(id, { testing: true });
    try { const p = await post('/providers/' + id + '/test'); provTested(p, silent); touch(); } catch (e) { c.setProv(id, { testing: false }); fail(e); }
  };
  c.testAll = async () => {
    const n = c.state.provs.length; set0(s => ({ provs: s.provs.map(p => ({ ...p, testing: true })) }));
    try {
      const ps = (await post('/providers/test-all')).map(toProv); set0({ provs: ps });
      const ok = ps.filter(p => p.st === 'ok').length; toast(ok + ' clé' + (ok > 1 ? 's' : '') + ' valide' + (ok > 1 ? 's' : '') + ' sur ' + n, ok === n ? 'ok' : 'err'); touch();
    } catch (e) { set0(s => ({ provs: s.provs.map(p => ({ ...p, testing: false })) })); fail(e); }
  };
  c.saveKey = async () => {
    const S = c.state, k = (S.form.k || '').trim(), id = S.dlg.id;
    if (k.length < 20) return c.setState({ fe: { k: 'La clé semble incomplète (20 caractères minimum).' } });
    const p = S.provs.find(x => x.id === id);
    set0({ dlg: null, form: {} }); // la saisie est effacée immédiatement
    c.setProv(id, { testing: true }); toast('Nouvelle clé ' + p.n + ' enregistrée · test en cours');
    try { provTested(await put('/providers/' + id + '/key', { apiKey: k }), false); touch(); load(['asg']).catch(() => {}); } catch (e) { c.setProv(id, { testing: false }); fail(e); }
  };
  c.saveProv = async () => {
    const f = c.state.form, fe = {};
    if (!f.n || f.n.trim().length < 2) fe.n = 'Indiquez le nom du fournisseur.';
    if ((f.k || '').trim().length < 20) fe.k = 'La clé semble incomplète (20 caractères minimum).';
    if (Object.keys(fe).length) return c.setState({ fe });
    const name = f.n.trim(), k = f.k.trim(); set0({ dlg: null, form: {} });
    try { const r = await post('/providers', { name, apiKey: k }); set0(s => ({ provs: [...s.provs, toProv(r)] })); provTested(r, false); touch(); }
    catch (e) { if (e instanceof ApiError && e.code === 'DUPLICATE') set0({ dlg: { type: 'prov' }, form: { n: name, k: '' }, fe: { n: e.message } }); else fail(e); }
  };
  const modelSaved = m => { const x = toModel(m); repl('models', x.id, x); return x; };
  const toggleOff = gateAsk('toggleModel', m => patch('/models/' + m.id, { active: false }).then(r => () => { modelSaved(r); load(['asg']).catch(() => {}); }));
  c.toggleModel = m => {
    if (m.act) return toggleOff(m);
    patch('/models/' + m.id, { active: true }).then(r => { modelSaved(r); toast(m.n + ' est disponible pour l’affectation'); touch(); }).catch(fail);
  };
  const num = v => parseFloat(String(v).replace(',', '.'));
  // Création (POST /models) ou modification (PATCH /models/{id}), catégorie comprise.
  c.saveModel = async () => {
    const S = c.state, f = S.form, fe = {}, isNew = !S.dlg.id;
    if (isNew && !f.pv) fe.pv = 'Choisissez un fournisseur.';
    if (!f.n || !f.n.trim()) fe.n = 'Nom requis.'; if (!(num(f.pin) >= 0)) fe.pin = 'Montant invalide.'; if (!(num(f.pout) >= 0)) fe.pout = 'Montant invalide.';
    if (Object.keys(fe).length) return c.setState({ fe });
    const body = { name: f.n.trim(), description: f.d || '', category: f.c || 'LLM', priceIn: num(f.pin), priceOut: num(f.pout) };
    try {
      if (isNew) { const m = toModel(await post('/models', { providerId: f.pv, ...body })); set0(st => ({ models: [...st.models, m], dlg: null, form: {} })); toast(m.n + ' ajouté'); }
      else { modelSaved(await patch('/models/' + S.dlg.id, body)); set0({ dlg: null, form: {} }); toast('Modèle mis à jour'); }
      touch();
    } catch (e) { fail(e); }
  };
  // Suppression après la confirmation de l'écran ; refusée par le serveur si le modèle a servi (409 IN_USE).
  // Fiche modèle (Fiche modele.dc.html) : POST /models (ajout) ou PATCH /models/{id} ; la fiche reste ouverte en cas de refus.
  c.saveIaModel = async im => {
    const body = fromIaModel(im);
    try {
      if (!im.id) { const m = toModel(await post('/models', { providerId: im.pv, ...body })); set0(st => ({ models: [...st.models, m], fm: null })); toast(m.n + ' ajouté'); }
      else { const m = toModel(await patch('/models/' + im.id, body)); repl('models', m.id, m); set0({ fm: null }); toast('Modèle mis à jour'); }
      touch(); load(['asg', 'fns']).catch(() => {});
      return true;
    } catch (e) { fail(e); return false; }
  };
  c.delModel = gateAsk('delModel', id => del('/models/' + id).then(() => () => load(['models', 'asg']).catch(() => {})));
  c.saveFiche = async () => {
    const S = c.state, f = S.fF, fe = {};
    if (!f.n || !f.n.trim()) fe.n = 'Nom requis.'; if (!(num(f.pin) >= 0)) fe.pin = 'Montant invalide.'; if (!(num(f.pout) >= 0)) fe.pout = 'Montant invalide.';
    if (Object.keys(fe).length) return c.setState({ fFe: fe });
    try { modelSaved(await patch('/models/' + S.fiche.id, { name: f.n.trim(), description: f.d || '', category: f.c || 'LLM', priceIn: num(f.pin), priceOut: num(f.pout) })); set0({ fFe: {} }); toast('Modèle enregistré'); touch(); } catch (e) { fail(e); }
  };

  // ── Affectation ──
  c.saveAsg = gateAsk('saveAsg', () => put('/assignments', fromAsg(c.state.draft)).then(list => () => { const asg = toAsg(list); set0({ asg, draft: JSON.parse(JSON.stringify(asg)) }); }));

  // ── Consommation : dépense et projection du serveur (une seule source) ──
  c.mtd = () => {
    const m = c.state.apiMonth; if (!m) return orig.mtd();
    const r = { all: m.spent }; m.byFunction.forEach(f => { r[f.functionId] = f.spent; }); return r;
  };
  c.thVals = () => {
    const m = c.state.apiMonth, out = orig.thVals(); if (!m) return out;
    const eur = v => { const a = Math.abs(v || 0); if (!a) return '0 €'; if (a < 0.005) return '< 0,01 €'; const dec = a < 100 && Math.abs(a - Math.round(a)) >= 0.005 ? 2 : 0; return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' €'; };
    return out.map(t => {
      const s = m.thresholds.find(x => x.id === t.id); if (!s) return t;
      const pr = s.projection, x = { ...t, proj: pr, projL: eur(pr), over: pr > t.lim, projMark: `position:absolute;top:0;bottom:0;border-radius:4px;left:0;width:${Math.min(100, pr / t.lim * 100)}%;background:repeating-linear-gradient(135deg,rgba(16,35,58,.13) 0 4px,transparent 4px 8px)` };
      // Statut calculé sur le pourcentage exact (comme le serveur), et non sur le pourcentage arrondi : 79,6 % reste sous le seuil de 80 %.
      const exact = t.sp / t.lim * 100, tone = !t.on ? 'neu' : exact >= 100 ? 'err' : exact >= t.warn ? 'warn' : 'ok';
      if (tone === t.tone) return x;
      const pct = tone === 'ok' ? Math.min(Math.round(exact), t.warn - 1) : Math.round(exact);
      return { ...x, pct, tone, pill: TH_PILL(tone), dot: TH_DOT(tone), stL: !t.on ? 'Alerte désactivée' : pct >= 100 ? 'Dépassé' : pct >= t.warn ? 'Seuil d’alerte atteint' : 'Sous le seuil',
        bar: `position:absolute;left:0;top:0;bottom:0;border-radius:4px;width:${Math.min(100, pct)}%;background:${TH_TONE[tone][2]};transition:width .6s cubic-bezier(.2,.7,.2,1)` };
    });
  };
  c.setTh = (id, p, logIt) => {
    orig.setTh(id, p, logIt);
    if (!logIt) return;
    const t = c.state.th.find(x => x.id === id);
    put('/budget-thresholds/' + id, { limitEur: t.lim, warnPct: t.warn, enabled: t.on }).then(() => { load(['month']).catch(() => {}); touch(); W.dispatchEvent && W.dispatchEvent(new CustomEvent('rise-admin:thresholds-console')); }).catch(e => { fail(e); load(['month']).catch(() => {}); });
  };
  c.exportCsv = async () => {
    const m = c.state.apiMonth, to = (m && m.today) || isoOf(now()), from = addDays(to, -(c.state.cPer - 1));
    try { const b = await download('/usage/export.csv?from=' + from + '&to=' + to, 'consommation-ia-' + c.state.cPer + 'j.csv'); const n = (await b.text()).split('\n').length - 1; toast('Export CSV téléchargé · ' + n + ' lignes'); touch(); } catch (e) { fail(e); }
  };

  // ── Notifications et alertes (Notifications et alertes.dc.html, NOTIFICATIONS ET ALERTES - specification.md § 4) ──
  // Le composant met sa liste à jour lui-même (optimiste) et crée une règle sous son propre identifiant, repris par
  // le serveur. Les écritures partent l'une après l'autre (une création est enregistrée avant la modification qui la
  // suit) ; si le serveur en refuse une, la liste est relue et la vue remontée sur l'état réel.
  let nrQ = Promise.resolve();
  const NR = id => '/notifications/rules/' + encodeURIComponent(id);
  const nrResync = () => load(['nrRules', 'nrHist']).catch(() => {}).then(() => { set0({ nrRemount: true }); setTimeout(() => set0({ nrRemount: false }), 60); });
  const nrRun = (call, after, resync = true) => (nrQ = nrQ.then(call).then(r => { touch(); return after(r); }).catch(e => { fail(e); if (resync) nrResync(); }));
  const nrReload = keys => () => load(keys).catch(() => {});
  c.nrCreate = r => nrRun(() => post('/notifications/rules', r), nrReload(['nrRules']));
  c.nrSave = r => nrRun(() => put(NR(r.id), r), nrReload(['nrRules']));
  c.nrToggle = (id, on) => nrRun(() => patch(NR(id), { on }), nrReload(['nrRules']));
  c.nrDelete = id => nrRun(() => del(NR(id)), nrReload(['nrRules', 'nrHist']));
  // Test : le brouillon affiché est envoyé à l'administrateur connecté ; un refus ne touche pas au brouillon.
  c.nrTest = r => nrRun(() => post(NR(r.id) + '/test', r), out => {
    const ko = (out || []).filter(h => !h.ok);
    if (ko.length) toast('Échec de l’envoi de test : ' + (ko[0].error || 'erreur'), 'err');
    return load(['nrHist']).catch(() => {});
  }, false);

  // ── Modules : `setMod` (portée, projets) est le point de passage de setScope, togProj et Jev ──
  c.setMod = (id, p) => {
    orig.setMod(id, p);
    const m = c.state.mods.find(x => x.id === id), body = { scope: inv(SCOPE)[m.sc] };
    if (m.sc === 'projet') body.projectIds = Object.keys(m.pj); else if (m.sc === 'off') body.projectIds = [];
    patch('/modules/' + id, body).then(r => { repl('mods', id, toMod(r)); touch(); }).catch(e => { fail(e); load(['mods']).catch(() => {}); });
  };
  c.approve = async q => {
    const m = c.state.mods.find(x => x.id === q.m);
    try { const mods = await post('/module-requests/' + q.id + '/approve'); set0(s => ({ mods: sortMods(mods.map(toMod)), reqs: s.reqs.filter(r => r.id !== q.id) })); toast(m.n + ' activé sur ' + q.p + ' · ' + q.who + ' est prévenu'); touch(); } catch (e) { fail(e); }
  };
  c.reject = async q => {
    try { await post('/module-requests/' + q.id + '/reject'); set0(s => ({ reqs: s.reqs.filter(r => r.id !== q.id) })); toast('Demande refusée · ' + q.who + ' est prévenu'); touch(); } catch (e) { fail(e); }
  };

  // ── Mon profil ──
  c.saveMe = () => {
    const S = c.state, d = S.pd; if (!d) return;
    if (!d.first.trim() || !d.last.trim()) return toast('Le prénom et le nom sont requis', 'err');
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(d.mail)) return toast('Adresse e-mail invalide', 'err');
    const commit = async () => { try { const me = await patch('/me/profile', fromProf(d)); set0({ prof: toProf(me), pd: null }); toast('Profil enregistré'); touch(); } catch (e) { fail(e); } };
    if (d.mail !== S.prof.mail) c.ask({ tone: 'warn', title: 'Changer votre adresse e-mail de connexion ?', body: 'Un lien de vérification est envoyé à la nouvelle adresse. L’ancienne reste active jusqu’à la validation.', items: [{ l: 'E-mail', a: S.prof.mail, b: d.mail }], cta: 'Envoyer le lien', ok: commit });
    else commit();
  };
  c.revoke = gateAsk('revoke', s => del('/me/sessions/' + s.id).then(() => () => load(['sess']).catch(() => {})));
  c.revokeAll = gateAsk('revokeAll', () => del('/accounts/' + meId + '/sessions').then(() => () => load(['sess']).catch(() => {})));
  c.onPhoto = e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    if (!/^image\//.test(f.type)) return toast('Choisissez une image', 'err');
    const rd = new FileReader();
    rd.onload = () => patch('/me/profile', { photoUrl: String(rd.result) }).then(me => { set0({ photo: me.photoUrl }); toast('Photo mise à jour'); touch(); }).catch(fail);
    rd.readAsDataURL(f);
  };
  // Mon profil › Sécurité : « Modifier » → fenêtre de changement (auth-api.js), POST /api/auth/password ;
  // ancienneté réelle du mot de passe (GET /api/auth/session). Le serveur ferme les autres sessions.
  const setPwdAge = iso => set0({ pwdAge: Auth.passwordAgeLabel(iso) });
  if (!DEV) Auth.session('admin').then(r => { if (r.body && r.body.user) setPwdAge(r.body.user.passwordChangedAt); });
  const pwd = () => Auth.openPasswordDialog({
    send: async b => {
      const r = await raw('POST', '/api/auth/password', b);
      const body = await r.json().catch(() => null);
      if (r.ok) { setPwdAge(body.user.passwordChangedAt); load(['sess']).catch(() => {}); return { ok: true }; }
      return { message: (body && body.message) || 'Erreur ' + r.status, field: body && body.fields && body.fields.currentPassword ? 'currentPassword' : null };
    },
    onDone: () => { toast('Mot de passe modifié · vos autres sessions ont été fermées'); touch(); },
  });

  // ── Jev : chaque question part au serveur, qui répond par les modèles de la fonction guidage (Identité, Soul,
  // skill « Guidage console », page ouverte). Aucun moteur de mots-clés : la réponse du modèle est affichée telle quelle. ──
  // Vue consultée → libellé des sources affiché sous la réponse (« modeles_ia » → « modèles IA »).
  const srcLabel = v => v.replace(/_/g, ' ').replace(/\bia\b/, 'IA').replace(/\bapi\b/, 'API').replace(/\bmodeles\b/, 'modèles').replace(/\bregles\b/, 'règles');
  c.jevReply = text => {
    Promise.resolve().then(() => c.setState({ jThink: true }));
    post('/assistant/messages', { context: { section: c.state.sec }, text })
      .then(r => { c.setState({ jThink: false }); c.jPush({ t: 'jev', text: r.reply, err: !r.ai, src: (r.sources || []).map(srcLabel).join(', ') || undefined }); })
      .catch(e => { c.setState({ jThink: false }); c.jPush({ t: 'jev', text: 'Jev n’a pas pu répondre : ' + ((e && e.message) || 'erreur du serveur') + '.', err: true }); });
    return [];
  };

  // ── Rendu : squelette au démarrage, actions en ligne ──
  c.renderVals = () => {
    const S = c.state, v = orig.renderVals();
    if (S.apiBoot) {
      Object.assign(v, { loading: true, ready: false, isOv: false, isUsers: false, isAdmins: false, isRights: false, isProv: false, isAsg: false, isConso: false, isInit: false, isLib: false, isSnaps: false, isNotifs: false, isMods: false, isProfil: false });
      return v;
    }
    v.libImported = []; // la bibliothèque lit la liste du serveur
    v.skQuery = S.skRemote ? skQuery : undefined; // Skills : mode serveur au-delà de SKILLS_REMOTE_THRESHOLD
    if (S.apiCodes) v.libCodes = S.apiCodes;
    v.onImported = p => { load(['projects']).catch(() => {}); toast(p.code + ' créé'); touch(); };
    if (v.pf) v.pf.pwd = pwd;
    return v;
  };
  c.forceUpdate();
}

// ───────────────────────────── Consommation et coûts ─────────────────────────────

const LOGO = { anthropic: './assets/logos/lh-anthropic.svg', openrouter: './assets/logos/lh-openrouter.webp', google: './assets/logos/lh-gemini-color.svg', openai: './assets/logos/lh-openai.svg', mistral: './assets/logos/lh-mistral-color.svg' };
/** Part du coût d'une journée payée au modèle de secours au-delà de laquelle la journée est « sur secours ». */
export const FALLBACK_DAY_SHARE = 0.5;

/**
 * `ConsoCouts` : `data()` lit `GET /usage/month` et `GET /usage?from&to&groupBy=day` (détail jour × fonction × modèle) ;
 * les plafonds viennent de `/budget-thresholds` (une seule source, brief § 12).
 */
export function bindConso(c) {
  if (isDemo() || c.__api) return;
  c.__api = true;
  const set0 = c.setState.bind(c), rv0 = c.renderVals.bind(c), data0 = c.data.bind(c);
  // Lignes budgétaires, dans l'ordre de l'écran (serveur : AI_BUDGET_LINES ; Documents = « docs », pour ses trois étapes).
  const FN = ['insights', 'rapports', 'guidage', 'docs', 'crud'], zero = () => Object.fromEntries(FN.map(k => [k, 0]));
  let cache = null, thSrv = [];
  const fail = e => { console.warn('[admin-api]', e); c.toast(errText(e)); };

  async function load() {
    const [m, list, asg, models, provs] = await Promise.all([get('/usage/month'), get('/budget-thresholds'), get('/assignments'), get('/models'), get('/providers')]);
    const from = addDays(m.today, -89), u = await get('/usage?from=' + from + '&to=' + m.today + '&groupBy=day');
    const byDay = {};
    for (const r of u.detail) {
      const d = (byDay[r.day] = byDay[r.day] || { ...zero(), fbc: 0, m: {}, pv: {}, tok: zero(), mt: {}, pt: {} });
      if (!FN.includes(r.functionId)) continue;
      const t = r.tokensIn + r.tokensOut;
      d[r.functionId] += r.costEur; d.tok[r.functionId] += t; if (r.fallbackUsed) d.fbc += r.costEur;
      d.m[r.modelId] = (d.m[r.modelId] || 0) + r.costEur; d.mt[r.modelId] = (d.mt[r.modelId] || 0) + t;
      d.pv[r.providerId] = (d.pv[r.providerId] || 0) + r.costEur; d.pt[r.providerId] = (d.pt[r.providerId] || 0) + t;
    }
    // Projection des jours restants : rythme des 7 derniers jours, par fonction (même règle que le serveur, § 7.4).
    const last7 = Array.from({ length: 7 }, (_, i) => byDay[addDays(m.today, -i)]).filter(Boolean), rate = {};
    FN.forEach(k => { rate[k] = last7.reduce((a, d) => a + d[k], 0) / 7; });
    const days = [];
    for (let iso = from; iso <= m.monthEnd; iso = addDays(iso, 1)) {
      const fut = iso > m.today, d = byDay[iso], x = { dt: dayOf(iso), fut };
      FN.forEach(k => { x[k] = fut ? rate[k] : d ? d[k] : 0; });
      x.t = FN.reduce((a, k) => a + x[k], 0);
      x.fb = !fut && !!d && x.t > 0 && d.fbc / x.t > FALLBACK_DAY_SHARE;
      x._d = d || null;
      days.push(x);
    }
    cache = { days, g: null, r: null, m, asg, models, provs };
    thSrv = list;
    const th = {}; ['all', ...FN].forEach(k => { const t = list.find(x => x.id === k); th[k] = { lim: t && t.limitEur != null ? t.limitEur : '', warn: t ? t.warnPct : 80 }; });
    set0({ th, th0: JSON.parse(JSON.stringify(th)), apiTick: Date.now() });
    c.count();
  }
  load().catch(fail);
  const onTh = () => load().catch(() => {});
  W.addEventListener && W.addEventListener('rise-admin:thresholds-console', onTh);
  const um0 = c.componentWillUnmount.bind(c);
  c.componentWillUnmount = () => { W.removeEventListener && W.removeEventListener('rise-admin:thresholds-console', onTh); um0(); };

  // Données de démonstration remplacées ; tant que la réponse n'est pas arrivée, série nulle.
  c.data = () => {
    if (cache) return cache;
    if (!c._zero) { const z = data0(); c._zero = { ...z, days: z.days.map(d => ({ ...d, ...Object.fromEntries(FN.map(k => [k, 1e-6])), t: FN.length * 1e-6, fb: false })) }; }
    return c._zero;
  };

  const thSave = async () => {
    const S = c.state, ch = Object.keys(S.th).filter(k => JSON.stringify(S.th[k]) !== JSON.stringify((S.th0 || {})[k]));
    try {
      for (const k of ch) {
        const t = S.th[k], lim = +t.lim || null, cur = thSrv.find(x => x.id === k);
        await put('/budget-thresholds/' + k, { limitEur: lim, warnPct: t.warn, enabled: lim ? (cur && cur.limitEur != null ? cur.enabled : true) : false });
      }
      set0({ th0: JSON.parse(JSON.stringify(S.th)) }); c.toast('Seuils enregistrés');
      W.dispatchEvent && W.dispatchEvent(new CustomEvent('rise-admin:thresholds'));
      load().catch(() => {});
    } catch (e) { fail(e); }
  };

  // Même précision que l'écran : centimes sous 100 €, « < 1 % » pour une part non nulle.
  const eur = v => { const a = Math.abs(v || 0); if (!a) return '0 €'; if (a < 0.005) return '< 0,01 €'; const dec = a < 100 && Math.abs(a - Math.round(a)) >= 0.005 ? 2 : 0; return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' €'; }, pc = x => (x > 0 && x < 0.005 ? '< 1' : String(Math.round(x * 100))), mtok = t => Math.max(1, Math.round(t / 1e6));
  c.renderVals = () => {
    const v = rv0(); if (!cache) return v;
    const S = c.state, { days, asg, models, provs } = cache, allPast = days.filter(d => !d.fut), past = allPast.filter(d => d.dt.getMonth() === days[days.length - 1].dt.getMonth());
    const last = S.per === '7' ? allPast.slice(-7) : S.per === '90' ? allPast.slice(-90) : past;
    const sumOf = (arr, pick) => arr.reduce((a, d) => a + (d._d ? pick(d._d) : 0), 0);
    // Modèle réellement servi par fonction (principal, ou secours si le principal est indisponible).
    const M = id => models.find(m => m.id === id) || { name: id, providerId: '' };
    const served = k => { const a = asg.find(x => x.functionId === (k === 'docs' ? 'doc_syn' : k)) || {}; const fb = a.state === 'FALLBACK'; return { m: M(fb ? a.fallback : a.primary), fb }; };
    const FNI = FN;
    (v.fns || []).forEach((f, i) => { const s = served(FNI[i]); f.model = s.m.name + (s.fb ? ' · secours' : ''); f.logo = 'width:16px;height:16px;flex:none;background:url("' + (LOGO[s.m.providerId] || '') + '") center/contain no-repeat'; });
    (v.rows || []).forEach((r, i) => { if (!i) return; const s = served(['all', ...FN][i]); r.sub = (s.fb ? 'Secours · ' : '') + s.m.name; r.logo = 'width:14px;height:14px;flex:none;background:url("' + (LOGO[s.m.providerId] || '') + '") center/contain no-repeat'; });
    // Tokens réels.
    if (S.per === 'mois' && v.kpi && v.kpi.facts[2]) { v.kpi.facts[2].v = mtok(sumOf(past, d => (S.fn ? d.tok[S.fn] : FN.reduce((a, k) => a + d.tok[k], 0)))) + ' M'; v.kpi.factL = v.kpi.facts.map(f => f.l + ' ' + f.v).join(' · '); }
    // Répartition par modèle et par fournisseur : mesurée, et non plus déduite de l'affectation.
    if (v.rep) {
      const FNN = { insights: ['Insights', '#1d8f86'], rapports: ['Rapports', '#8e5bd0'], guidage: ['Guidage console', '#d0578a'], docs: ['Documents', '#e39a2d'], crud: ['Gestion des données', '#3b7dd8'] };
      const src = S.dim === 'fn' ? FNI.map(k => ({ id: k, n: FNN[k][0], logo: null, col: FNN[k][1], v: last.reduce((a, d) => a + d[k], 0), tok: sumOf(last, d => d.tok[k]) }))
        : S.dim === 'm' ? models.map(m => ({ id: m.id, n: m.name, logo: m.providerId, v: sumOf(last, d => d.m[m.id] || 0), tok: sumOf(last, d => d.mt[m.id] || 0) })).filter(r => r.v > 0)
          : provs.map(p => ({ id: p.id, n: p.name, logo: p.id, v: sumOf(last, d => d.pv[p.id] || 0), tok: sumOf(last, d => d.pt[p.id] || 0) }));
      const rs = src.sort((a, b) => b.v - a.v), mx = (rs[0] && rs[0].v) || 1, tt = rs.reduce((a, r) => a + r.v, 0) || 1;
      v.rep.sub = (S.per === 'mois' ? (m => m.charAt(0).toUpperCase() + m.slice(1))(dayOf(cache.m.monthStart).toLocaleDateString('fr-FR', { month: 'long' })) : S.per === '7' ? '7 derniers jours' : '90 derniers jours') + ' · ' + eur(tt);
      v.rep.rows = rs.map((r, i) => ({ n: r.n, v: eur(r.v), sh: pc(r.v / tt) + ' %', tok: r.v ? '≈ ' + mtok(r.tok) + ' M tokens' : 'non utilisé',
        ic: r.logo ? 'width:28px;height:28px;border-radius:8px;background:#fff url("' + (LOGO[r.logo] || '') + '") center/16px no-repeat;box-shadow:0 0 0 1px #e1e9e7' + (r.v ? '' : ';opacity:.45') : 'width:28px;height:28px;border-radius:8px;background:' + r.col + '1f;box-shadow:inset 0 0 0 1.5px ' + r.col,
        bar: 'height:100%;border-radius:3px;transform-origin:left;animation:grow .8s ' + (i * .07) + 's cubic-bezier(.2,.7,.2,1) both;background:' + (r.col || (r.logo === 'google' ? '#8e75b2' : '#1d8f86')) + ';width:' + (r.v / mx * 100).toFixed(1) + '%', key: S.anim }));
    }
    v.thSave = thSave;
    v.exportCsv = async () => {
      const to = cache.m.today, from = S.per === 'mois' ? cache.m.monthStart : addDays(to, -(last.length - 1));
      try { await download('/usage/export.csv?from=' + from + '&to=' + to, 'consommation-ia.csv'); c.toast('Export CSV préparé · ' + last.length + ' jours'); } catch (e) { fail(e); }
    };
    return v;
  };
  c.forceUpdate();
}

// ───────────────────────────── Initialisation d'un projet ─────────────────────────────

/** Chaîne AAAA-MM-JJ → date locale (l'écran compare des `Date` pour l'affichage et le planning). */
const isoDay = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? dayOf(v) : v);

/**
 * Contrôle du fichier par le serveur (`POST /projects/import/validate`, multipart) : la réponse est déjà au format
 * lu par l'écran (`{ project, sheets, issues, missing }` et les 5 contrôles) ; les dates deviennent des `Date`.
 * Rien n'est créé à cette étape ; le fichier reste côté serveur jusqu'à la création ou à la réinitialisation.
 */
export async function validateXlsx(file) {
  const fd = new FormData(); fd.append('file', file, file.name);
  const r = await api('POST', '/projects/import/validate', fd);
  const sheets = {};
  for (const [k, s] of Object.entries(r.sheets || {})) sheets[k] = { heads: s.heads, rows: s.rows.map(row => row.map(isoDay)) };
  return { file: r.file, size: r.size, project: (r.project || []).map(p => ({ ...p, v: isoDay(p.v) })), sheets, issues: r.issues || [], missing: r.missing || [], importId: r.jobId, checks: r.checks, ok: r.ok };
}

/** Pas de progression affichée pendant la création : 2 % toutes les 60 ms, comme la simulation d'origine. */
const INIT_STEP = 2, INIT_TICK = 60, INIT_POLL = 250;

/**
 * `ProjetInit` : contrôle et création par le serveur (spécification Initialisation projet § 5). La création suit
 * l'avancement réel (`GET /projects/import/{jobId}`) sans jamais le devancer ; chaque phase reste visible.
 * « Réinitialiser la session » (et le retour à l'étape 1) oublie aussi le fichier côté serveur.
 * « Charger l'exemple » (ORION) garde la simulation d'origine (arbitrage du 29/09/2026).
 */
export function bindInit(c) {
  if (isDemo() || c.__api) return;
  c.__api = true;
  const rv0 = c.renderVals.bind(c), set0 = c.setState.bind(c), restart0 = c.restart.bind(c);
  const forget = d => { if (d && d.importId) api('DELETE', '/projects/import/' + encodeURIComponent(d.importId)).catch(e => console.warn('[admin-api]', e)); };
  c.restart = () => { forget(c.state.data); restart0(); };
  c.file = async f => {
    if (!f) return; if (!/\.xlsx$/i.test(f.name)) return set0({ upErr: 'Format attendu : .xlsx' });
    set0({ upErr: '', busyRead: true });
    try {
      const prev = c.state.data, d = await validateXlsx(f);
      forget(prev); // « Importer le fichier corrigé » : l'ancien fichier est oublié côté serveur
      set0({ busyRead: false }); c.load(d);
    } catch (e) { set0({ upErr: 'Lecture impossible : ' + errText(e), busyRead: false }); }
  };
  c.renderVals = () => {
    const v = rv0(), d = c.state.data;
    if (!d || !d.importId) return v; // exemple de démonstration : création simulée d'origine
    v.doImport = async () => {
      const pv = l => (d.project.find(p => p.l === l) || {}).v, cnt = k => ((d.sheets[k] || {}).rows || []).length;
      let target = 0, done = null;
      set0({ step: 'done', prog: 0 }); clearInterval(c._pv);
      c._pv = setInterval(() => {
        const p = c.state.prog;
        if (p < target) set0({ prog: Math.min(target, p + INIT_STEP) });
        else if (done && p >= 100) { clearInterval(c._pv); const r = done; done = null; r(); }
      }, INIT_TICK);
      try {
        await api('POST', '/projects/import/commit', { jobId: d.importId });
        for (;;) {
          const j = await api('GET', '/projects/import/' + encodeURIComponent(d.importId));
          target = Math.max(target, j.percent || 0);
          if (j.status === 'done') { target = 100; break; }
          if (j.status === 'failed') throw new ApiError(500, { message: j.error || 'Création impossible : rien n’a été créé' });
          await new Promise(r => setTimeout(r, INIT_POLL));
        }
        const code = String(pv('Code projet') || '').trim();
        done = () => c.props.onImported && c.props.onImported({ code, name: pv('Nom du projet') || code, client: pv('Nom du client') || '', start: pv('Date de démarrage'), end: pv('Date de fin cible'), dir: pv('Directeur de programme') || '',
          counts: { lots: cnt('Lots'), phases: cnt('Phases'), chantiers: cnt('Chantiers'), jalons: cnt('Jalons'), personnes: cnt('Personnes') }, file: d.file });
      } catch (e) {
        clearInterval(c._pv);
        // Refus du serveur (409 code déjà pris, 422 fichier plus conforme, échec de la transaction) : retour au contrôle.
        set0({ step: 'chk', prog: 0, t: 999, data: { ...d, issues: [{ lvl: 'err', sheet: 'Projet', row: '', msg: errText(e) }, ...d.issues] } });
      }
    };
    return v;
  };
  c.forceUpdate();
}

// ───────────────────────────── Snapshots (Snapshots.dc.html) ─────────────────────────────

const SN_MO = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « 22 sept. · 16:40 » (même format que la vue). */
const snDT = t => (t.getDate() === 1 ? '1er' : t.getDate()) + ' ' + SN_MO[t.getMonth()] + ' · ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
/** Snapshot du serveur → modèle de la vue ; `ix` porte l'identifiant, lu par `counts()` pour trouver les compteurs. */
const toViewSnap = s => ({ id: s.id, t: new Date(s.date), k: s.type, lab: s.libelle || '', by: s.auteur || '', ix: s.id, cnt: s.compteurs || {} });
/** Planification du serveur → `sched` de la vue, avec la prochaine capture calculée par le serveur. */
const toViewSched = r => ({ on: !!r.enabled, fq: r.frequency, day: r.day, hour: r.hour, keep: r.retention, next: r.prochaineCapture ? new Date(r.prochaineCapture) : null });
const SCHED_KEYS = { Fréquence: ['fq', 'frequency'], Jour: ['day', 'day'], Heure: ['hour', 'hour'], Conservation: ['keep', 'retention'] };
/** Progression affichée de la capture : pas de la simulation d'origine (8 à 22 points toutes les 170 ms), sans devancer le serveur. */
const SN_TICK = 170, SN_POLL = 250, SN_SLOW = 500;

/**
 * `Snapshots.dc.html` : données, capture, comparaison, restauration et planification par le serveur (routes
 * `/projects/{code}/snapshots`, `/snapshot-jobs/{id}`, `/snapshots/{a}/diff/{b}`, `/snapshots/{id}/restore`,
 * `/projects/{code}/snapshot-schedule`). Onglets : projets de la plateforme. Chargements lents et erreurs :
 * notification sombre de la vue. Le design, les textes et la confirmation de restauration restent ceux de la vue.
 */
export function bindSnapshots(c) {
  if (isDemo() || c.__api) return;
  c.__api = true;
  const set0 = c.setState.bind(c), rv0 = c.renderVals.bind(c), restore0 = c.restore.bind(c);
  const enc = encodeURIComponent, sleep = ms => new Promise(r => setTimeout(r, ms));
  const diffs = {}, scheds = {};
  let offset = 0, loading = true;
  const say = m => c.toast(m), fail = (pre, e) => c.toast(pre + errText(e));
  /** Notification « … en cours » seulement si l'attente dure (au-delà de `SN_SLOW`). */
  const slow = (m, p) => { const tm = setTimeout(() => say(m), SN_SLOW); return p.finally(() => { clearTimeout(tm); if (c.state.toast && c.state.toast.msg === m) set0({ toast: null }); }); };

  c.projects = [];
  c.now = () => new Date(Date.now() + offset);
  set0({ snaps: {}, sel: [] });
  const loadList = async p => { const l = await api('GET', '/projects/' + enc(p) + '/snapshots'); set0(s => ({ snaps: { ...s.snaps, [p]: l.map(toViewSnap) } })); };
  const keepSched = (p, r) => { scheds[p] = r; offset = new Date(r.maintenant).getTime() - Date.now(); if (c.state.pj === p) set0({ sched: toViewSched(r) }); };
  const loadSched = async p => keepSched(p, await api('GET', '/projects/' + enc(p) + '/snapshot-schedule'));

  c.counts = (p, id) => { const s = (c.state.snaps[p] || []).find(x => x.id === id), k = (s && s.cnt) || {}; return { Action: k.taches || 0, Jalon: k.jalons || 0, Risque: k.risques || 0, Livrable: k.livrables || 0 }; };
  c.nextCap = () => { const S = c.state.sched; return S && S.on && S.next ? S.next : null; };
  // Comparaison : lue une fois par paire A → B (les snapshots ne changent pas), le temps de la réponse sans « Aucune différence ».
  c.diff = (a, b) => {
    const key = a.id + '|' + b.id;
    if (!(key in diffs)) {
      diffs[key] = 'pending';
      slow('Comparaison en cours…', api('GET', '/snapshots/' + enc(a.id) + '/diff/' + enc(b.id)))
        .then(r => { diffs[key] = r.map(x => ({ k: x.type, e: x.entite, n: x.nom, f: x.champ || '', a: x.avant || '', b: x.apres || '' })); c.forceUpdate(); })
        .catch(e => { diffs[key] = 'err'; fail('Comparaison impossible : ', e); c.forceUpdate(); });
    }
    return Array.isArray(diffs[key]) ? diffs[key] : [];
  };
  c.pickPj = p => {
    set0({ pj: p, filt: 'tous', sel: [], ...(scheds[p] ? { sched: toViewSched(scheds[p]) } : {}) });
    Promise.all([loadList(p), loadSched(p)]).then(() => { if (c.state.pj === p) set0({ sel: c.lastTwo() }); }).catch(e => fail('Chargement impossible : ', e));
  };
  c.capture = async lab => {
    const p = c.state.pj;
    clearInterval(c._ci);
    set0({ dlg: null, lab: '', cap: { p, pct: 0, lab } });
    let target = 0;
    c._ci = setInterval(() => { const cp = c.state.cap; if (!cp) return clearInterval(c._ci); if (cp.pct < target) set0({ cap: { ...cp, pct: Math.min(target, cp.pct + 8 + Math.random() * 14) } }); }, SN_TICK);
    try {
      const { jobId } = await api('POST', '/projects/' + enc(p) + '/snapshots', { libelle: lab });
      let j;
      for (;;) {
        j = await api('GET', '/snapshot-jobs/' + enc(jobId));
        target = Math.max(target, j.progression || 0);
        if (j.statut === 'termine') break;
        if (j.statut === 'echec') throw new ApiError(500, { message: j.erreur || 'La capture a échoué' });
        await sleep(SN_POLL);
      }
      while (c.state.cap && c.state.cap.pct < 100) await sleep(SN_TICK / 2); // la barre finit sa course avant l'ajout
      clearInterval(c._ci);
      await loadList(p);
      const asc = [...(c.state.snaps[p] || [])].sort((a, b) => a.t - b.t), i = asc.findIndex(s => s.id === j.snapshot.id), prev = i > 0 ? asc[i - 1] : null;
      set0(s => ({ cap: null, sel: s.pj === p ? (prev ? [prev.id, j.snapshot.id] : [j.snapshot.id]) : s.sel, filt: 'tous' }));
      say('Snapshot « ' + lab + ' » créé sur ' + p);
    } catch (e) { clearInterval(c._ci); set0({ cap: null }); fail('Capture impossible : ', e); }
  };
  // Restauration : la confirmation de la vue est gardée telle quelle ; seul son bouton « Restaurer » appelle le serveur.
  const doRestore = async s => {
    const p = c.state.pj;
    set0({ dlg: null });
    try {
      const r = await slow('Restauration en cours…', api('POST', '/snapshots/' + enc(s.id) + '/restore'));
      await loadList(p);
      const id = r.securite.id;
      c.toast(p + ' restauré à l’état du ' + snDT(s.t), () => set0({ sel: [id], toast: null }), 'Voir la sauvegarde');
    } catch (e) { c.toast(e instanceof ApiError && e.status === 409 ? errText(e) : 'Restauration impossible : ' + errText(e)); }
  };
  c.restore = s => {
    const own = Object.prototype.hasOwnProperty.call(c, 'setState'), prevSet = c.setState;
    c.setState = (u, cb) => set0(u && u.dlg && u.dlg.type === 'restore' ? { ...u, dlg: { ...u.dlg, ok: () => doRestore(s) } } : u, cb);
    try { restore0(s); } finally { if (own) c.setState = prevSet; else delete c.setState; }
  };
  // Planification : enregistrée à chaque changement ; la prochaine capture et son repère viennent de la réponse.
  const saveSched = (patch, local, okMsg) => {
    const p = c.state.pj, prev = c.state.sched;
    set0({ sched: { ...prev, ...local } });
    api('PUT', '/projects/' + enc(p) + '/snapshot-schedule', patch)
      .then(r => { keepSched(p, r); say(okMsg); })
      .catch(e => { if (c.state.pj === p) set0({ sched: prev }); fail('Planification non enregistrée : ', e); });
  };
  c.renderVals = () => {
    const v = rv0(), S = c.state;
    v.sch.toggle = () => { const on = !S.sched.on; saveSched({ enabled: on }, { on }, on ? 'Planification activée' : 'Planification suspendue'); };
    v.sch.sel = v.sch.sel.map(x => { const [k, f] = SCHED_KEYS[x.aria] || []; return k ? { ...x, set: e => { const val = e.target.value; saveSched({ [f]: val }, { [k]: val }, 'Planification mise à jour'); } } : x; });
    if (loading) Object.assign(v, { empty: false, n: '' });
    if (v.sel2) {
      const list = S.snaps[S.pj] || [], sel = S.sel.map(id => list.find(s => s.id === id)).filter(Boolean).sort((a, b) => a.t - b.t), d = sel.length === 2 && diffs[sel[0].id + '|' + sel[1].id];
      if (!Array.isArray(d)) Object.assign(v, { dEmpty: false, fEmpty: false, dSome: false }); // réponse attendue (ou en erreur)
    }
    return v;
  };

  slow('Chargement des snapshots…', (async () => {
    // Onglets : du plus ancien projet au plus récent (la bibliothèque les donne à l'inverse), projets clos en dernier.
    const ps = (await api('GET', '/projects')).slice().reverse();
    c.projects = [...ps.filter(x => x.status !== 'CLOSED'), ...ps.filter(x => x.status === 'CLOSED')].map(x => x.code);
    const pj = c.projects.includes(c.state.pj) ? c.state.pj : c.projects[0];
    await Promise.all([...c.projects.map(loadList), pj ? loadSched(pj) : null]);
    loading = false;
    set0({ pj, filt: 'tous', ...(pj && scheds[pj] ? { sched: toViewSched(scheds[pj]) } : {}) });
    set0({ sel: c.lastTwo() });
  })()).catch(e => { loading = false; fail('Chargement impossible : ', e); c.forceUpdate(); });
  c.forceUpdate();
}

// ───────────────────────────── Bibliothèque des projets ─────────────────────────────

const MO = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** Projet de la bibliothèque → carte `{ code, name, client, st, phase, start, end, k[], snap, health, isNew }`. */
export function toLib(p, today) {
  const st = LIB_ST[p.status] || 'actif', ls = D(p.lastSnapshot && p.lastSnapshot.takenAt), c = p.counts || {};
  let snap = 'aucun snapshot';
  if (st === 'clos') snap = 'archivé';
  else if (p.isNew) snap = 'importé depuis ' + (p.importedFrom || 'Excel');
  else if (ls) {
    const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()), dd = Math.round((new Date(ls.getFullYear(), ls.getMonth(), ls.getDate()) - d0) / 86400000), hm = p2(ls.getHours()) + ':' + p2(ls.getMinutes());
    snap = dd >= 0 ? 'snapshot aujourd’hui ' + hm : dd === -1 ? 'snapshot hier ' + hm : 'snapshot du ' + (ls.getDate() === 1 ? '1er' : ls.getDate()) + ' ' + MO[ls.getMonth()];
  }
  return { code: p.code, name: p.name, client: p.client, st, phase: p.phase || '', start: dayOf(p.startDate), end: dayOf(p.endDate), k: [c.waves || 0, c.phases || 0, c.workstreams || 0, c.persons || 0], snap, health: p.health || 'neu', isNew: !!p.isNew };
}

/** `ProjetsBiblio` : liste depuis `GET /projects` (dans `state.api`, lu par `renderVals`). */
export function bindBiblio(c) {
  if (isDemo() || c.__api) return;
  c.__api = true;
  (async () => {
    try {
      const ov = await get('/overview'), today = new Date(ov.date);
      // Ordre de la bibliothèque : nouveaux projets en tête, puis actifs, en préparation, clos ; par date de début.
      const R = { actif: 0, prep: 1, clos: 2 };
      const list = (await get('/projects')).map(p => toLib(p, today)).sort((a, b) => Number(b.isNew) - Number(a.isNew) || R[a.st] - R[b.st] || (a.start || 0) - (b.start || 0));
      // Avancement des cartes : à la date du serveur (date réelle), pas à la date de démonstration.
      c.setState({ api: list, apiToday: today });
    } catch (e) { console.warn('[admin-api]', e); }
  })();
}

// ───────────────────────────── Journal des appels ─────────────────────────────

/**
 * Journal des appels (spécification JOURNAL § 4) : routes lues par `Journal des appels.dc.html`.
 * Les dates d'un appel sont en UTC (`at`) ; le composant les affiche dans le fuseau du navigateur (celui de la plateforme).
 */
export const journalApi = {
  /** Un point par jour du mois en cours (jours vides inclus), pour une ligne budgétaire. */
  daily: fn => get('/usage/daily' + (fn ? '?fn=' + encodeURIComponent(fn) : '')),
  /** Page du journal, du plus récent au plus ancien ; `cursor` : `nextCursor` de la page précédente. */
  calls: ({ fn, cursor, limit } = {}) => get('/usage/calls?' + [fn && 'fn=' + encodeURIComponent(fn), cursor && 'cursor=' + encodeURIComponent(cursor), 'limit=' + (limit || 10)].filter(Boolean).join('&')),
  /** Export CSV du filtre courant (UTF-8 avec BOM, « ; », virgule décimale). */
  csv: fn => download('/usage/calls.csv' + (fn ? '?fn=' + encodeURIComponent(fn) : ''), 'journal-appels.csv'),
};
