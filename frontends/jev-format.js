/**
 * Mise en forme des réponses de Jev (panneau étroit, ~420 px) : le Markdown simple du modèle devient une liste de
 * blocs typés, chacun avec ses styles en ligne, rendus par les gabarits du panneau (aucun HTML injecté).
 *
 *   titre (# / ##)          → h1 (le premier) ou étiquette de section (les suivants, ###)
 *   paragraphe              → p (gras, code) ; la question de relance finale, plus discrète
 *   - / 1.                  → liste à puces ou numérotée
 *   **Libellé** : valeur    → paires libellé / valeur alignées (lignes consécutives)
 *   tableau Markdown        → 2 colonnes : paires ; au-delà : fiches (code, nom, statut en pastille, méta)
 *   > citation              → encadré
 *   ```bloc```              → code
 *
 * La dernière phrase, si elle pose une question (relance), est rendue plus discrètement.
 * Les emoji décoratifs des titres sont retirés ; les statuts (🟢 Actif, 🟡 En préparation…) deviennent des pastilles.
 */

const INK = '#10233a', BODY = '#2f4356', MUTED = '#5c7280', FAINT = '#8a9aa6', LINE = '#eef3f2', TEAL = '#1d8f86';
const MO = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Tons des pastilles : fond, texte, point. */
const TONES = {
  ok: ['#e6f3f2', '#146b64', '#1d8f86'],
  warn: ['#fdf3e1', '#8a5a12', '#e39a26'],
  risk: ['#fdecec', '#a8372c', '#d94b4b'],
  info: ['#e6f1f8', '#0b5c8a', '#2f86c0'],
  neutral: ['#eef2f4', '#5c7280', '#9fb0ba'],
};
const EMOJI_TONE = [[/[🟢✅]/u, 'ok'], [/[🟡🟠⚠]/u, 'warn'], [/[🔴❌⛔]/u, 'risk'], [/[🔵]/u, 'info'], [/[🟣⚪⚫🟤]/u, 'neutral']];
const WORD_TONE = [[/\b(retard|critique|bloqu|échec|erreur|en risque|dépass|ko)\b/i, 'risk'], [/\b(clos|close|archiv|termin|suspendu|inactif|désactiv)/i, 'neutral'],
  [/\b(prépar|attente|à venir|vigilance|à surveiller|en pause|invit)/i, 'warn'], [/\b(actif|active|en cours|ok|valid|opérationnel|conforme|à jour)/i, 'ok'], [/\b(planifi|prévu|brouillon)/i, 'info']];
const EMOJI = /(\p{Extended_Pictographic}|\p{Regional_Indicator}|️|‍)/gu;

const stripEmoji = s => s.replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim();
const plain = s => stripEmoji(String(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$|[.,;:!?)])/g, '$1$2')).trim();

/** Texte en ligne → segments : gras, code, texte ; les emoji décoratifs sont gardés dans le texte courant. */
export function runs(s, base = '') {
  const out = [], re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let at = 0, m;
  const push = (t, st) => { if (t) out.push({ t, st: base + st }); };
  while ((m = re.exec(s))) {
    push(s.slice(at, m.index).replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$|[.,;:!?)])/g, '$1$2'), '');
    if (m[1] != null) push(m[1], `font-weight:700;color:${INK};`);
    else push(m[2], `font-family:ui-monospace,Menlo,monospace;font-size:.92em;padding:1px 5px;border-radius:5px;background:#eef3f2;color:${INK};`);
    at = re.lastIndex;
  }
  push(s.slice(at).replace(/(^|\s)[*_](\S[^*_]*?)[*_](?=\s|$|[.,;:!?)])/g, '$1$2'), '');
  return out;
}

/** Statut repéré dans une cellule (emoji ou mot) → pastille ; `null` si ce n'est pas un statut. */
export function statusOf(cell, byHeader = false) {
  const raw = String(cell || ''), label = plain(raw);
  let tone = null;
  for (const [re, t] of EMOJI_TONE) if (re.test(raw)) { tone = t; break; }
  if (!tone && (byHeader || label.length <= 22)) for (const [re, t] of WORD_TONE) if (re.test(label)) { tone = t; break; }
  if (!tone || !label) return null;
  const [bg, fg, dot] = TONES[tone];
  return { label, tone, st: `flex:none;display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 9px 0 8px;border-radius:999px;background:${bg};color:${fg};font-size:11.5px;font-weight:650;white-space:nowrap`,
    dot: `width:6px;height:6px;border-radius:50%;background:${dot}` };
}

/** « 03/02/2025 » ou « 2025-02-03 » → « 3 févr. 2025 » ; sinon le texte tel quel. */
export function frDate(s) {
  const t = plain(s);
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t), d, mo, y;
  if (m) [d, mo, y] = [m[1], m[2], m[3]];
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t))) [y, mo, d] = [m[1], m[2], m[3]];
  else return t;
  const n = Number(d), k = Number(mo) - 1;
  return k >= 0 && k < 12 ? (n === 1 ? '1er' : String(n)) + ' ' + MO[k] + ' ' + y : t;
}

const splitRow = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const isSep = l => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l.trim());

/** Rôles des colonnes d'un tableau : code, nom, statut, début / fin, autres (méta). */
function roles(head, rows) {
  const h = head.map(x => plain(x).toLowerCase()), col = i => rows.map(r => r[i] || '');
  const find = re => h.findIndex(x => re.test(x));
  let code = find(/^(code|id|réf|ref|clé|identifiant)/);
  if (code < 0 && col(0).every(v => /^[A-Z0-9][A-Z0-9_.-]{1,11}$/.test(plain(v)))) code = 0;
  let name = find(/^(nom|libellé|titre|intitulé|projet|compte|modèle|skill|utilisateur|fournisseur|carte)/);
  if (name < 0 || name === code) name = h.findIndex((_, i) => i !== code);
  let status = find(/(statut|état|santé|status|niveau)/);
  if (status < 0) status = h.findIndex((_, i) => i !== code && i !== name && col(i).length && col(i).every(v => !v || statusOf(v)));
  const start = find(/^(début|date de début|démarrage|start|du)$/), end = find(/^(fin|fin visée|fin cible|échéance|date de fin|end|au)$/);
  return { code, name, status, start, end };
}

/** Tableau → paires (2 colonnes) ou fiches. */
function table(head, rows) {
  if (head.length === 2) return { type: 'kv', items: rows.map(r => ({ k: plain(r[0]), v: runs(r[1] || '') })) };
  const R = roles(head, rows), used = new Set([R.code, R.name, R.status, R.start, R.end].filter(i => i >= 0));
  return {
    type: 'rec',
    items: rows.map(r => {
      const meta = [];
      if (R.start >= 0 || R.end >= 0) {
        const a = R.start >= 0 ? frDate(r[R.start] || '') : '', b = R.end >= 0 ? frDate(r[R.end] || '') : '';
        meta.push(a && b ? a + ' → ' + b : a || (b ? plain(head[R.end]) + ' ' + b : ''));
      }
      head.forEach((x, i) => { if (!used.has(i) && plain(r[i] || '')) meta.push(plain(x) + ' ' + frDate(r[i])); });
      const st = R.status >= 0 ? statusOf(r[R.status], true) : null;
      return { code: R.code >= 0 ? plain(r[R.code]) : '', name: R.name >= 0 ? plain(r[R.name]) : '', st, meta: meta.filter(Boolean).join(' · ') };
    }),
  };
}

/** Texte du modèle → blocs (sans styles). */
export function parse(text) {
  const L = String(text || '').replace(/\r\n?/g, '\n').split('\n'), out = [];
  let i = 0;
  const kvRe = /^(?:[-*]\s+)?\*\*([^*]{1,60}?)\*\*\s*[:：]\s*(.+)$/;
  while (i < L.length) {
    const l = L[i], t = l.trim();
    if (!t || /^(-{3,}|\*{3,}|_{3,})$/.test(t)) { i++; continue; }
    if (t.startsWith('```')) { const code = []; i++; while (i < L.length && !L[i].trim().startsWith('```')) code.push(L[i++]); i++; out.push({ type: 'code', t: code.join('\n') }); continue; }
    let m = /^(#{1,6})\s+(.*)$/.exec(t);
    if (m) { const h = stripEmoji(plain(m[2])); if (h) out.push({ type: 'h', level: m[1].length, t: h }); i++; continue; }
    if (t.startsWith('|') && i + 1 < L.length && isSep(L[i + 1])) {
      const head = splitRow(t), rows = []; i += 2;
      while (i < L.length && L[i].trim().startsWith('|')) rows.push(splitRow(L[i++]));
      out.push(table(head, rows)); continue;
    }
    if (kvRe.test(t)) { const items = []; while (i < L.length && kvRe.test(L[i].trim())) { const [, k, v] = kvRe.exec(L[i].trim()); items.push({ k: stripEmoji(k), v: runs(v) }); i++; } out.push({ type: 'kv', items }); continue; }
    if (/^[-*•]\s+/.test(t)) { const items = []; while (i < L.length && /^\s*[-*•]\s+/.test(L[i])) items.push(runs(L[i++].trim().replace(/^[-*•]\s+/, ''))); out.push({ type: 'ul', items }); continue; }
    if (/^\d+[.)]\s+/.test(t)) { const items = []; while (i < L.length && /^\s*\d+[.)]\s+/.test(L[i])) items.push(runs(L[i++].trim().replace(/^\d+[.)]\s+/, ''))); out.push({ type: 'ol', items }); continue; }
    if (t.startsWith('>')) { const q = []; while (i < L.length && L[i].trim().startsWith('>')) q.push(L[i++].trim().replace(/^>\s?/, '')); out.push({ type: 'quote', runs: runs(q.join(' ')) }); continue; }
    out.push({ type: 'p', raw: t, runs: runs(t) }); i++;
  }
  return out;
}

const F = { isH1: false, isH2: false, isP: false, isUl: false, isOl: false, isKv: false, isRec: false, isQuote: false, isCode: false };

/**
 * Blocs prêts pour les gabarits du panneau (drapeaux `isH1`… et styles en ligne). Un titre en tête de réponse devient
 * son titre ; les autres, des étiquettes de section. Une question finale (« … ? ») est rendue en relance discrète.
 */
export function formatJev(text) {
  const bl = parse(text);
  let titled = false;
  return bl.map((b, i) => {
    const top = i === 0 ? 0 : b.type === 'h' ? 8 : 0;
    if (b.type === 'h') {
      if (!titled && i === 0 && b.level <= 2) { titled = true; return { ...F, isH1: true, t: b.t, st: `margin:${top}px 0 2px;font-size:15px;line-height:1.3;font-weight:800;letter-spacing:-.015em;color:${INK};text-wrap:balance` }; }
      return { ...F, isH2: true, t: b.t, st: `margin-top:${top}px;font-size:10.5px;line-height:1.4;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${TEAL}` };
    }
    if (b.type === 'p') {
      const follow = i === bl.length - 1 && bl.length > 2 && /\?/.test(b.raw) && b.raw.length <= 220; // relance finale
      return { ...F, isP: true, runs: b.runs, st: follow ? `margin:4px 0 0;padding-top:12px;border-top:1px solid ${LINE};font-size:12.5px;line-height:1.55;color:${MUTED};text-wrap:pretty`
        : `margin:0;font-size:13px;line-height:1.6;color:${BODY};text-wrap:pretty` };
    }
    if (b.type === 'ul' || b.type === 'ol') return { ...(b.type === 'ul' ? { ...F, isUl: true } : { ...F, isOl: true }), items: b.items.map((r, k) => ({ runs: r, n: (k + 1) + '.',
      mk: b.type === 'ul' ? `flex:none;width:5px;height:5px;margin-top:8px;border-radius:50%;background:${TEAL}` : `flex:none;min-width:16px;font-size:12px;line-height:1.6;font-weight:700;color:${TEAL};font-variant-numeric:tabular-nums` })),
      st: 'display:flex;flex-direction:column;gap:6px', li: `display:flex;gap:10px;font-size:13px;line-height:1.6;color:${BODY};text-wrap:pretty` };
    if (b.type === 'kv') return { ...F, isKv: true, st: `display:flex;flex-direction:column;border-top:1px solid ${LINE}`,
      items: b.items.map(x => { const v = x.v, flat = v.map(r => r.t).join(''), p = /^([^()]*?)\s*\(([^)]+)\)\s*\.?$/.exec(flat);
        return { k: x.k, v: p ? [{ t: p[1].replace(/[.,;]\s*$/, ''), st: `font-weight:700;color:${INK}` }] : v.map(r => ({ t: r.t.replace(/\.\s*$/, ''), st: r.st || `color:${INK};font-weight:600` })), sub: p ? p[2] : '', hasSub: !!p,
          row: `display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:12px;align-items:baseline;padding:8px 0;border-bottom:1px solid ${LINE}`,
          kSt: `font-size:12px;line-height:1.45;color:${MUTED}`, vSt: 'display:flex;flex-direction:column;gap:1px;font-size:12.5px;line-height:1.45;text-align:right', subSt: `font-size:11.5px;color:${FAINT};font-variant-numeric:tabular-nums` }; }) };
    // Fiches : colonne des codes à largeur fixe (le plus long code du tableau), pour aligner les noms et la méta.
    if (b.type === 'rec') { const cw = Math.round(Math.min(92, Math.max(34, Math.max(0, ...b.items.map(r => r.code.length)) * 7.6 + 4)));
    return { ...F, isRec: true, st: 'display:flex;flex-direction:column',
      items: b.items.map((r, k) => ({ ...r, hasCode: !!r.code, hasSt: !!r.st, hasMeta: !!r.meta, stL: r.st ? r.st.label : '', pill: r.st ? r.st.st : '', dot: r.st ? r.st.dot : '',
        row: `display:grid;grid-template-columns:${r.code ? cw + 'px ' : ''}minmax(0,1fr) auto;column-gap:10px;row-gap:3px;align-items:center;padding:10px 0;${k ? `border-top:1px solid ${LINE}` : ''}`,
        codeSt: `font-size:10.5px;font-weight:800;letter-spacing:.06em;color:${INK};font-variant-numeric:tabular-nums;min-width:0`,
        nameSt: `min-width:0;font-size:13px;line-height:1.35;font-weight:650;color:${INK};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere`, // deux lignes au plus
        metaSt: `grid-column:${r.code ? '2 / 4' : '1 / 3'};font-size:11.5px;color:${MUTED};font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis` })) }; }
    if (b.type === 'quote') return { ...F, isQuote: true, runs: b.runs, st: `margin:0;padding:10px 12px;border-radius:10px;background:#f3f8f7;border-left:2px solid ${TEAL};font-size:12.5px;line-height:1.55;color:${BODY}` };
    return { ...F, isCode: true, t: b.t, st: `margin:0;padding:10px 12px;border-radius:10px;background:#f3f6f8;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;line-height:1.55;color:${INK};white-space:pre-wrap;overflow-wrap:anywhere` };
  });
}

/** Sources de la réponse (« projets, audit ») → étiquettes. */
export const sourceChips = s => String(s || '').split(/\s*[,;·]\s*/).map(x => x.trim()).filter(Boolean);
