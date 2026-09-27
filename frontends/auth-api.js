// auth-api.js — authentification des écrans RISE (spécification AUTH, docs/specs/AUTH - specification.md).
//
// Module ES partagé par :
//   1. les écrans de connexion (Authentification.dc.html) : connexion, mot de passe oublié,
//      réinitialisation, première connexion, déconnexion ;
//   2. le Cockpit (api.js) et la Console (admin-api.js) : session par cookie, jeton anti-CSRF,
//      expiration après inactivité avec l'avertissement « Toujours là ? », déconnexion.
//
// La session est un cookie HttpOnly posé par le serveur (un par surface : `app` pour le Cockpit,
// `admin` pour la Console). Toute écriture renvoie le jeton anti-CSRF (cookie lisible `rise_csrf` /
// `rise_admin_csrf`) dans l'en-tête `X-CSRF-Token`. Le serveur refait tous les contrôles et fait foi.

const W = typeof window !== 'undefined' ? window : {};

/** Écran de connexion et page d'arrivée de chaque surface. */
export const LOGIN_URL = { app: '/connexion', admin: '/console/connexion' };
export const HOME_URL = { app: '/', admin: '/console' };
/** Inactivité tolérée (minutes) et avertissement (secondes), repris du serveur (policy.ts). */
export const IDLE_MINUTES = { app: 30, admin: 15 };
export const WARNING_SECONDS = 60;

const CSRF_COOKIE = { app: 'rise_csrf', admin: 'rise_admin_csrf' };

function readCookie(name) {
  try {
    const m = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
  } catch (e) { return ''; }
}

/** En-têtes d'une requête authentifiée par cookie : surface et jeton anti-CSRF. */
export function sessionHeaders(surface) {
  const h = { 'X-Rise-Surface': surface };
  const csrf = readCookie(CSRF_COOKIE[surface]);
  if (csrf) h['X-CSRF-Token'] = csrf;
  return h;
}

/** Appel de `/api/auth/…` : renvoie `{ status, body }` ; `status` 0 si le serveur est injoignable. */
async function call(method, path, body, surface) {
  const headers = sessionHeaders(surface || 'app');
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    const r = await fetch('/api/auth' + path, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) };
  } catch (e) {
    return { status: 0, body: null };
  }
}

export const login = (email, password, surface) => call('POST', '/login', { email, password, surface }, surface);
export const session = (surface) => call('GET', '/session?surface=' + surface, undefined, surface);
export const forgot = (email, surface) => call('POST', '/forgot', { email, surface }, surface);
export const verifyReset = (token) => call('GET', '/reset/verify?token=' + encodeURIComponent(token));
export const resetPassword = (token, password) => call('POST', '/reset', { token, password });
export const changePassword = (password, surface) => call('POST', '/password', { password }, surface);
export const keepalive = (surface) => call('POST', '/keepalive', undefined, surface);

/** Adresse de retour après connexion : chemin local uniquement (jamais une autre origine). */
export function safeReturn(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') ? url : '';
}

/** Écran de connexion de la surface, avec un motif (`expiree`, `deconnecte`) et l'adresse de retour. */
export function loginUrl(surface, reason, back) {
  const q = new URLSearchParams();
  if (reason) q.set('raison', reason);
  const b = safeReturn(back);
  if (b && b !== HOME_URL[surface]) q.set('suite', b);
  const s = q.toString();
  return LOGIN_URL[surface] + (s ? '?' + s : '');
}

/** Déconnexion : ferme la session côté serveur puis affiche l'écran de connexion (« Vous êtes déconnecté »). */
export async function logout(surface, reason = 'deconnecte') {
  if (guard) guard.stop();
  await call('POST', '/logout', undefined, surface);
  W.location.replace(loginUrl(surface, reason));
}

/** Session perdue (expirée, fermée ailleurs) : retour à l'écran de connexion avec l'adresse courante. */
export function toLogin(surface, reason) {
  if (guard) guard.stop();
  W.location.replace(loginUrl(surface, reason, W.location.pathname + W.location.search));
}

// ───────────────────── Expiration après inactivité ─────────────────────

let guard = null;

/**
 * Surveille l'activité (souris, clavier, toucher, défilement), partagée entre les onglets.
 * 60 s avant l'expiration, affiche « Toujours là ? » (role="alertdialog", Échap = rester connecté) ;
 * « Rester connecté » renouvelle la session (`POST /keepalive`). À l'expiration : déconnexion et
 * écran de connexion « Session expirée ». L'activité est aussi signalée au serveur (au plus une fois
 * par minute) pour que sa propre limite d'inactivité suive celle du navigateur.
 */
export function startSessionGuard(surface) {
  if (guard) return guard;
  const idleMs = IDLE_MINUTES[surface] * 60e3, warnMs = WARNING_SECONDS * 1e3;
  const KEY = 'rise-activity-' + surface;
  let last = Date.now(), lastShare = 0, lastPing = Date.now(), dialog = null, stopped = false;
  const share = () => { try { W.localStorage.setItem(KEY, String(last)); } catch (e) { /* stockage indisponible */ } };
  const ping = () => { lastPing = Date.now(); keepalive(surface).then((r) => { if (r.status === 401) expire(); }); };

  const onActivity = () => {
    if (dialog || stopped) return;
    const now = Date.now();
    last = now;
    if (now - lastShare > 5e3) { lastShare = now; share(); }
    if (now - lastPing > 60e3) ping();
  };
  const onStorage = (e) => {
    if (e.key !== KEY || !e.newValue) return;
    last = Math.max(last, Number(e.newValue) || 0);
    if (dialog && Date.now() - last < idleMs - warnMs) closeDialog();
  };
  const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'];
  EVENTS.forEach((ev) => W.addEventListener(ev, onActivity, { passive: true, capture: true }));
  W.addEventListener('storage', onStorage);

  async function expire() {
    if (stopped) return;
    stop();
    await call('POST', '/logout', undefined, surface);
    W.location.replace(loginUrl(surface, 'expiree', W.location.pathname + W.location.search));
  }
  async function stay() {
    const r = await keepalive(surface);
    if (r.status !== 200) return expire();
    last = Date.now(); lastPing = last; share(); closeDialog();
  }
  function tick() {
    if (stopped) return;
    const left = idleMs - (Date.now() - last);
    if (left <= 0) return expire();
    if (left <= warnMs) { if (!dialog) openDialog(); dialog.update(left); }
  }
  const timer = setInterval(tick, 1000);
  function stop() {
    stopped = true;
    clearInterval(timer);
    EVENTS.forEach((ev) => W.removeEventListener(ev, onActivity, { capture: true }));
    W.removeEventListener('storage', onStorage);
    closeDialog();
  }
  function openDialog() { dialog = renderDialog(surface, { stay, leave: () => logout(surface) }); }
  function closeDialog() { if (dialog) { dialog.remove(); dialog = null; } }

  guard = { stop, stay };
  return guard;
}

/** « Toujours là ? » : même dessin que l'état « Session sur le point d'expirer » d'Authentification.dc.html. */
function renderDialog(surface, { stay, leave }) {
  const admin = surface === 'admin';
  const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
  const cta = admin
    ? 'background:#10233a;color:#fff;box-shadow:0 10px 24px -14px rgba(16,35,58,.9);'
    : 'background:linear-gradient(90deg,#f7a41c,#f0752b);color:#1a1200;box-shadow:0 10px 24px -12px rgba(240,120,40,.75);';
  const root = document.createElement('div');
  root.setAttribute('data-rise-session-dialog', '');
  root.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:20px;font-family:'Plus Jakarta Sans',sans-serif;color:#10233a;-webkit-font-smoothing:antialiased";
  root.innerHTML =
    '<div style="position:absolute;inset:0;background:rgba(10,23,39,.62);backdrop-filter:blur(10px)"></div>' +
    '<div role="alertdialog" aria-modal="true" aria-labelledby="rise-exp-t" aria-describedby="rise-exp-d" style="position:relative;width:100%;max-width:400px;background:#fff;border-radius:22px;padding:32px 30px 26px;box-shadow:0 40px 80px -30px rgba(0,0,0,.6);display:flex;flex-direction:column;align-items:center;text-align:center;box-sizing:border-box">' +
      '<div style="position:relative;width:104px;height:104px">' +
        '<svg width="104" height="104" viewBox="0 0 104 104" style="transform:rotate(-90deg)" aria-hidden="true"><circle cx="52" cy="52" r="46" fill="none" stroke="#eef3f2" stroke-width="4"></circle><circle data-arc cx="52" cy="52" r="46" fill="none" stroke="#f7a41c" stroke-width="4" stroke-linecap="round" stroke-dasharray="289.03" stroke-dashoffset="0" style="transition:stroke-dashoffset 1s linear"></circle></svg>' +
        '<span role="timer" data-left style="position:absolute;inset:0;display:grid;place-items:center;font-size:24px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums">1:00</span>' +
      '</div>' +
      '<h2 id="rise-exp-t" style="margin:22px 0 0;font-size:24px;font-weight:800;font-style:italic;letter-spacing:-.03em">Toujours là ?</h2>' +
      '<p id="rise-exp-d" style="margin:10px 0 0;font-size:13.5px;line-height:1.5;color:#43586a">Sans activité depuis ' + IDLE_MINUTES[surface] + ' minutes, votre session va être fermée pour protéger vos données.</p>' +
      '<button type="button" data-stay style="margin-top:28px;height:50px;width:100%;border:0;border-radius:12px;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;' + cta + '">Rester connecté</button>' +
      '<button type="button" data-leave style="margin-top:12px;border:0;background:none;padding:6px;font:inherit;font-size:13px;font-weight:600;color:#43586a;cursor:pointer">Se déconnecter</button>' +
    '</div>';
  const before = document.activeElement;
  const bStay = root.querySelector('[data-stay]'), bLeave = root.querySelector('[data-leave]');
  bStay.addEventListener('click', stay);
  bLeave.addEventListener('click', leave);
  // Échap = rester connecté ; Tab reste dans la fenêtre.
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stay(); }
    if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === bStay ? bLeave : bStay).focus(); }
  });
  document.body.appendChild(root);
  bStay.focus();
  const arc = root.querySelector('[data-arc]'), txt = root.querySelector('[data-left]');
  return {
    update(ms) { txt.textContent = mmss(ms); arc.setAttribute('stroke-dashoffset', (289.03 * (1 - ms / (WARNING_SECONDS * 1e3))).toFixed(2)); },
    remove() { root.remove(); if (before && before.focus) try { before.focus(); } catch (e) { /* élément retiré */ } },
  };
}
