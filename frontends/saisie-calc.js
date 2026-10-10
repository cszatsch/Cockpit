/*
 * « Saisir sans Jev » (maquette « Jev - Saisir sans Jev 5a », 10/10/2026) : calculs purs du formulaire.
 * Score pondéré d'une option d'arbitrage, total des poids, barre de composition, comparaison A / B, criticité d'un
 * risque, dates saisies au clavier (jj/mm/aaaa), fiche d'arbitrage « barème commun » (maquette 11a). Chargé par l'écran (`import('./saisie-calc.js')`,
 * qui l'expose en `globalThis.RiseSaisieCalc`) et par les tests (`require`). Aucune dépendance, aucun effet de bord hors de cet objet.
 */
(function (root) {
  /** Couleur et libellé d'une note de 1 à 4 (1 faible … 4 excellent) — palette de la maquette 5a. */
  const NOTE_COLORS = ['#c2413b', '#b8650f', '#1f9a8a', '#0d5952'];
  const NOTE_LABELS = ['Faible', 'Moyen', 'Bon', 'Excellent'];
  /** Libellés de l'échelle 1–4 de la probabilité et de l'impact d'un risque. */
  const SCALE_LABELS = ['Faible', 'Modérée', 'Forte', 'Très forte'];
  /** Écart en dessous duquel deux scores sont à égalité. */
  const TIE = 0.005;

  /** Poids saisi (« 40 », « », 40) → entier positif ou 0. */
  const weight = (w) => { const n = parseInt(String(w == null ? '' : w).replace(/\D/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : 0; };
  /** Note saisie → entier de 1 à 4, ou 0 (non notée). */
  const note = (n) => { const v = Number(n); return v >= 1 && v <= 4 ? Math.round(v) : 0; };

  /** Total des poids (%) d'une liste de critères. */
  function totalWeight(rows) { return (rows || []).reduce((a, r) => a + weight(r.w), 0); }

  /**
   * Score de l'option = Σ(poids × note) / Σ(poids), sur les seuls critères qui ont à la fois un poids et une note ;
   * 0 si aucun.
   */
  function optionScore(rows) {
    const r = (rows || []).filter((q) => weight(q.w) > 0 && note(q.n) > 0);
    const W = r.reduce((a, q) => a + weight(q.w), 0);
    return W ? r.reduce((a, q) => a + weight(q.w) * note(q.n), 0) / W : 0;
  }

  /** Score affiché sur 4 : deux décimales, virgule (« 3,15 »). */
  function formatScore(v) { return (Number(v) || 0).toFixed(2).replace('.', ','); }

  /** État du total des poids : « 100 % », « X % à répartir » ou « X % en excès » (ces deux cas en orange). */
  function weightState(total) {
    if (total === 100) return { ok: true, warn: false, text: 'Poids répartis · 100 %' };
    if (total < 100) return { ok: false, warn: true, text: (100 - total) + ' % à répartir' };
    return { ok: false, warn: true, text: (total - 100) + ' % en excès' };
  }

  /**
   * Barre de composition : un segment par critère pesé (largeur = poids, remplissage = note, couleur selon la note),
   * puis le poids restant à répartir en pointillés.
   */
  function composition(rows) {
    const segs = (rows || []).filter((r) => weight(r.w) > 0).map((r) => {
      const w = weight(r.w), n = note(r.n);
      return { flex: w, fillPct: n / 4 * 100, color: n ? NOTE_COLORS[n - 1] : 'transparent', rest: false, tip: (r.c || 'Critère') + ' · ' + w + ' % · ' + (n ? n + '/4' : 'non noté') };
    });
    const W = totalWeight(rows);
    if (W < 100) segs.push({ flex: 100 - W, fillPct: 0, color: 'transparent', rest: true, tip: (100 - W) + ' % à répartir' });
    return segs;
  }

  /**
   * Comparaison des deux options : meilleure option (0 = A, 1 = B, -1 = égalité), écart affiché (« +0,35 » ou « = »),
   * phrase d'écart et suggestion de l'option recommandée.
   */
  function compare(sA, sB) {
    const d = Math.abs(sA - sB), lead = d < TIE ? -1 : sA > sB ? 0 : 1, L = ['A', 'B'];
    return {
      lead,
      gap: lead < 0 ? '=' : '+' + formatScore(d),
      verdict: lead < 0 ? 'Les deux options obtiennent le même score' : "L'option " + L[lead] + ' devance de ' + formatScore(d) + ' point' + (d >= 2 ? 's' : ''),
      suggest: lead < 0 ? 'Scores à égalité' : 'Le score suggère ' + L[lead],
    };
  }

  /** Criticité d'un risque = probabilité × impact, sur 16, et son niveau (Critique ≥ 12, Majeure ≥ 6, Modérée ≥ 3). */
  function criticality(p, i) {
    const v = note(p) * note(i);
    const level = v >= 12 ? 'Critique' : v >= 6 ? 'Majeure' : v >= 3 ? 'Modérée' : 'Faible';
    return { value: v, level, text: v + ' / 16 · ' + level, pct: v / 16 * 100, color: v >= 12 ? '#c2413b' : v >= 6 ? '#e08a1e' : '#1f9a8a' };
  }

  /** Masque de saisie d'une date : chiffres seuls, « / » ajoutés au fil de la frappe (« 1203 » → « 12/03 »). */
  function maskDate(s) {
    const d = String(s || '').replace(/\D/g, '').slice(0, 8);
    return d.length > 4 ? d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4) : d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  }

  /** Date saisie « jj/mm/aaaa » → « aaaa-mm-jj », ou '' si incomplète ou impossible (31/02, 00/05…). */
  function frToIso(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || ''));
    if (!m) return '';
    const d = +m[1], mo = +m[2], y = +m[3], t = new Date(Date.UTC(y, mo - 1, d));
    return y >= 1900 && t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }

  /** « aaaa-mm-jj » → « jj/mm/aaaa » ('' sinon). */
  function isoToFr(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }

  /** État d'une date saisie : vide, en cours (incomplète), valide ou invalide (complète mais impossible). */
  function dateState(s) { const v = String(s || ''); return !v ? 'empty' : v.length < 10 ? 'partial' : frToIso(v) ? 'valid' : 'invalid'; }

  /** Période saisie [début, fin] : valide si les deux dates le sont et que la fin n'est pas avant le début. */
  function rangeState(r) {
    const a = (r && r[0]) || '', b = (r && r[1]) || '', A = frToIso(a), B = frToIso(b);
    if (dateState(a) === 'invalid' || dateState(b) === 'invalid') return 'invalid';
    if (A && B) return B < A ? 'reversed' : 'valid';
    return a || b ? 'partial' : 'empty';
  }

  // ── Fiche d'arbitrage « barème commun » (maquette 11a, 10/10/2026) : critères et poids communs aux options A et B,
  // notes (0 à 4) et justifications propres à chaque option. Fiche : { optionA: { intitule }, optionB: { intitule },
  // criteres: [{ nom, poids, noteA, noteB, justificationA, justificationB }] }.

  /** Score d'une option ('A' ou 'B') = Σ(poids × note) / Σ(poids), sur les critères notés pour cette option et de poids > 0. */
  function baremeScore(criteres, side) {
    let W = 0, S = 0;
    (criteres || []).forEach((c) => { const n = note(c['note' + side]), w = weight(c.poids); if (n > 0 && w > 0) { W += w; S += w * n; } });
    return W ? S / W : 0;
  }

  /** Au moins un critère de poids > 0 noté pour A ou pour B. */
  function baremeRated(criteres) { return (criteres || []).some((c) => (note(c.noteA) || note(c.noteB)) && weight(c.poids) > 0); }

  /** Verdict sous l'échelle : aucune note, égalité (écart < 0,005), sinon « A devance B de 0,35 pt ». */
  function baremeVerdict(sA, sB, rated) {
    const d = sA - sB;
    if (!rated) return 'Notez les critères pour comparer';
    if (Math.abs(d) < TIE) return 'Égalité parfaite entre A et B';
    return (d > 0 ? 'A devance B' : 'B devance A') + ' de ' + formatScore(Math.abs(d)) + ' pt';
  }

  /** Total des poids : « 100 % » (vert, coche), « Reste X % à répartir » ou « Excède de X % » (orange). */
  function baremeWeight(criteres) {
    const t = (criteres || []).reduce((a, c) => a + weight(c.poids), 0);
    return { total: t, ok: t === 100, text: t === 100 ? '100 %' : t < 100 ? 'Reste ' + (100 - t) + ' % à répartir' : 'Excède de ' + (t - 100) + ' %' };
  }

  /** Premier problème qui empêche l'enregistrement, dans l'ordre de priorité du brief ; '' si la fiche est complète. */
  function baremeIssue(f) {
    const C = (f && f.criteres) || [];
    if (!String(((f && f.optionA) || {}).intitule || '').trim() || !String(((f && f.optionB) || {}).intitule || '').trim()) return "Renseignez l'intitulé des deux options";
    if (!C.length) return 'Ajoutez au moins un critère';
    if (C.some((c) => !String(c.nom || '').trim())) return 'Nommez chaque critère';
    if (!baremeWeight(C).ok) return 'Les poids doivent totaliser 100 %';
    if (C.some((c) => !note(c.noteA) || !note(c.noteB))) return 'Notez chaque critère pour A et B';
    return '';
  }

  /** Fiche au format du serveur (`PATCH /decisions/:id/arbitration`) : options A / B sans critères propres, critères communs. */
  function baremeToServer(f) {
    return {
      options: [{ code: 'A', label: String(f.optionA.intitule).trim() }, { code: 'B', label: String(f.optionB.intitule).trim() }],
      criteria: (f.criteres || []).map((c) => ({ name: String(c.nom).trim(), weightPct: weight(c.poids), scoreA: note(c.noteA), commentA: String(c.justificationA || '').trim(), scoreB: note(c.noteB), commentB: String(c.justificationB || '').trim() })),
    };
  }

  /** Fiche lue sur le serveur (`arbitration` d'une décision) ; `null` si elle n'a ni intitulés ni critères. */
  function baremeFromServer(a) {
    if (!a) return null;
    const O = a.options || [], lab = (k) => ((O.find((o) => o.code === k) || {}).label || '').trim();
    const C = (a.criteria || []).map((c) => ({ nom: c.name || '', poids: weight(c.weightPct), noteA: note(c.scoreA), noteB: note(c.scoreB), justificationA: c.commentA || '', justificationB: c.commentB || '' }));
    if (!lab('A') && !lab('B') && !C.length) return null;
    return { optionA: { intitule: lab('A') }, optionB: { intitule: lab('B') }, criteres: C };
  }

  const api = { NOTE_COLORS, NOTE_LABELS, SCALE_LABELS, TIE, weight, note, totalWeight, optionScore, formatScore, weightState, composition, compare, criticality, maskDate, frToIso, isoToFr, dateState, rangeState, baremeScore, baremeRated, baremeVerdict, baremeWeight, baremeIssue, baremeToServer, baremeFromServer };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.RiseSaisieCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
