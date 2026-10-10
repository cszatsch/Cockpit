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
// Aucune infobulle dans le Cockpit ni dans la Console (10/10/2026) : module chargé ici, commun à tous les écrans.
import './sans-infobulles.js';

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

// ───────────────────── Changement de mot de passe (Mon profil › Sécurité) ─────────────────────

/** « Modifié aujourd'hui / il y a 3 jours / il y a 2 mois » ; null si le mot de passe n'a jamais été changé. */
export function passwordAgeLabel(iso) {
  if (!iso) return 'Mot de passe provisoire ou défini par lien';
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400e3);
  if (days < 1) return 'Modifié aujourd’hui';
  if (days < 2) return 'Modifié hier';
  if (days < 31) return 'Modifié il y a ' + days + ' jours';
  const months = Math.floor(days / 30.4);
  if (months < 12) return 'Modifié il y a ' + months + ' mois';
  const years = Math.floor(months / 12);
  return 'Modifié il y a ' + years + (years > 1 ? ' ans' : ' an');
}

/** Règles affichées, identiques à celles des écrans de connexion (le serveur refait le contrôle). */
function pwdRules(p) {
  return [
    ['12 caractères minimum', p.length >= 12],
    ['Majuscule et minuscule', /[a-z]/.test(p) && /[A-Z]/.test(p)],
    ['Au moins un chiffre', /\d/.test(p)],
    ['Un caractère spécial', /[^A-Za-z0-9]/.test(p)],
  ];
}

/**
 * Fenêtre « Modifier le mot de passe » : mot de passe actuel, nouveau mot de passe et confirmation,
 * règles et jauge des écrans de connexion. `send(body)` appelle `POST /api/auth/password` et renvoie
 * `{ ok }` ou `{ message, field }` ; le serveur ferme les autres sessions du compte.
 * `onDone()` est appelé après le changement (message de confirmation de l'écran).
 */
export function openPasswordDialog({ send, onDone }) {
  if (document.querySelector('[data-rise-pwd-dialog]')) return;
  const inp = 'width:100%;height:44px;padding:0 44px 0 12px;border-radius:10px;border:1px solid #d3dedb;background:#fff;font:inherit;font-size:14px;color:#10233a;outline:none;box-sizing:border-box';
  const eye = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12c0-1.5 3.5-7 9-7s9 5.5 9 7-3.5 7-9 7-9-5.5-9-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const field = (id, label, auto, extra) =>
    '<div style="display:flex;flex-direction:column;gap:6px">' +
      '<label for="' + id + '" style="font-size:12px;font-weight:600;color:#43586a">' + label + '</label>' +
      '<div style="position:relative"><input id="' + id + '" type="password" autocomplete="' + auto + '" style="' + inp + '"' + (extra || '') + '>' +
      '<button type="button" data-eye="' + id + '" aria-label="Afficher le mot de passe" aria-pressed="false" aria-controls="' + id + '" style="position:absolute;right:4px;top:3px;width:38px;height:38px;border:0;border-radius:9px;background:transparent;color:#5c7280;display:grid;place-items:center;cursor:pointer">' + eye + '</button></div>' +
    '</div>';
  const root = document.createElement('div');
  root.setAttribute('data-rise-pwd-dialog', '');
  root.style.cssText = "position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;padding:16px;font-family:'Plus Jakarta Sans',sans-serif;color:#10233a;-webkit-font-smoothing:antialiased";
  root.innerHTML =
    '<div data-scrim style="position:absolute;inset:0;background:rgba(10,23,39,.5)"></div>' +
    '<form role="dialog" aria-modal="true" aria-labelledby="rise-pwd-t" novalidate style="position:relative;width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:18px;padding:26px 24px 22px;box-shadow:0 40px 80px -30px rgba(0,0,0,.55);display:flex;flex-direction:column;gap:16px;box-sizing:border-box">' +
      '<div><div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:#1d8f86">Sécurité</div>' +
      '<h2 id="rise-pwd-t" style="margin:8px 0 0;font-size:22px;font-weight:800;font-style:italic;letter-spacing:-.03em">Modifier le mot de passe</h2>' +
      '<p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:#43586a">Vos autres sessions seront fermées ; celle-ci reste ouverte.</p></div>' +
      field('rise-pwd-cur', 'Mot de passe actuel', 'current-password', ' aria-describedby="rise-pwd-cur-msg"') +
      '<span id="rise-pwd-cur-msg" data-cur-msg role="alert" style="display:none;margin-top:-10px;font-size:12px;font-weight:500;color:#c2412d"></span>' +
      field('rise-pwd-new', 'Nouveau mot de passe', 'new-password', ' aria-describedby="rise-pwd-rules"') +
      '<div aria-hidden="true" data-meter style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin-top:-8px"><span></span><span></span><span></span><span></span></div>' +
      '<ul id="rise-pwd-rules" aria-label="Règles du mot de passe" style="list-style:none;margin:-6px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px 14px"></ul>' +
      field('rise-pwd-conf', 'Confirmation', 'new-password', ' aria-describedby="rise-pwd-conf-msg"') +
      '<span id="rise-pwd-conf-msg" data-conf-msg style="display:none;margin-top:-10px;font-size:12px;font-weight:500;color:#c2412d">Les deux saisies ne correspondent pas.</span>' +
      '<div data-err role="alert" style="display:none;padding:11px 13px;border-radius:10px;background:#fdf1ee;color:#8f2c1d;font-size:13px"></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:4px">' +
        '<button type="button" data-cancel style="height:40px;padding:0 16px;border-radius:9px;border:1px solid #dfe7e5;background:#fff;font:inherit;font-size:13px;font-weight:600;color:#43586a;cursor:pointer">Annuler</button>' +
        '<button type="submit" data-save style="height:40px;padding:0 18px;border-radius:9px;border:0;background:#1d8f86;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer">Enregistrer</button>' +
      '</div>' +
    '</form>';
  const $ = (q) => root.querySelector(q);
  const cur = $('#rise-pwd-cur'), np = $('#rise-pwd-new'), conf = $('#rise-pwd-conf'), save = $('[data-save]'), form = $('form');
  const err = $('[data-err]'), curMsg = $('[data-cur-msg]'), confMsg = $('[data-conf-msg]');
  const before = document.activeElement;
  let busy = false;
  const red = (el, on) => { el.style.borderColor = on ? '#c2412d' : '#d3dedb'; el.setAttribute('aria-invalid', on ? 'true' : 'false'); };
  function render() {
    const rules = pwdRules(np.value), score = rules.filter((r) => r[1]).length;
    const col = ['#e3ebe9', '#e0673f', '#f0a02b', '#7bbf9e', '#1d8f86'][score];
    [...$('[data-meter]').children].forEach((b, i) => { b.style.cssText = 'height:4px;border-radius:2px;background:' + (i < score ? col : '#e3ebe9'); });
    $('#rise-pwd-rules').innerHTML = rules.map(([l, ok]) =>
      '<li style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:' + (ok ? 600 : 500) + ';color:' + (ok ? '#10233a' : '#6b7f8c') + '">' +
      '<span style="flex:none;width:14px;height:14px;border-radius:50%;' + (ok ? 'background:#1d8f86' : 'background:#fff;box-shadow:inset 0 0 0 1.5px #c6d3d0') + '"></span>' + l +
      '<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">' + (ok ? ' : respectée' : ' : non respectée') + '</span></li>').join('');
    const mismatch = conf.value.length > 0 && conf.value !== np.value.slice(0, conf.value.length) || (conf.value.length >= np.value.length && conf.value.length > 0 && conf.value !== np.value);
    confMsg.style.display = mismatch ? 'block' : 'none'; red(conf, mismatch);
    const ready = !busy && cur.value && score === 4 && conf.value === np.value;
    save.disabled = !ready; save.style.opacity = ready || busy ? '1' : '.4'; save.style.cursor = ready ? 'pointer' : 'not-allowed';
    save.textContent = busy ? 'Enregistrement…' : 'Enregistrer';
  }
  const showErr = (m) => { err.textContent = m || ''; err.style.display = m ? 'block' : 'none'; };
  function close() { root.remove(); document.removeEventListener('keydown', onKey, true); if (before && before.focus) try { before.focus(); } catch (e) { /* retiré */ } }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) close(); }
    if (e.key === 'Tab') {
      const f = [...root.querySelectorAll('input,button:not([disabled])')];
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }
  [cur, np, conf].forEach((el) => el.addEventListener('input', () => { showErr(''); if (el === cur) { curMsg.style.display = 'none'; red(cur, false); } render(); }));
  root.querySelectorAll('[data-eye]').forEach((b) => b.addEventListener('click', () => {
    const el = $('#' + b.getAttribute('data-eye')), show = el.type === 'password';
    el.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  }));
  $('[data-cancel]').addEventListener('click', () => { if (!busy) close(); });
  $('[data-scrim]').addEventListener('click', () => { if (!busy) close(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (save.disabled) return;
    busy = true; render(); showErr('');
    const r = await send({ currentPassword: cur.value, password: np.value });
    busy = false;
    if (r.ok) { close(); if (onDone) onDone(); return; }
    if (r.field === 'currentPassword') { curMsg.textContent = r.message; curMsg.style.display = 'block'; red(cur, true); cur.focus(); }
    else showErr(r.message || 'Service indisponible. Réessayez dans un instant.');
    render();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(root);
  render();
  cur.focus();
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
