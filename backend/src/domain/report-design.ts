/**
 * Système de design des rapports générés (03/10/2026) : couleurs par rôle (encre, texte secondaire, filets, surface,
 * accent, états), échelle typographique, grille et espacements, déduits de la charte des pages modèles. Tous les
 * éléments posés par le générateur (indicateurs, tableaux, Gantt, baromètre, synthèse) s'appuient sur ces jetons :
 * une même hiérarchie partout, aucune valeur arbitraire.
 *
 * Principes (exigence du commanditaire, 03/10/2026) : lecture immédiate, une information par élément, aucune
 * surcharge ; finesse des détails (filets fins, alignements, chiffres alignés à droite, capitales espacées pour les
 * libellés) ; la couleur porte un sens (accent = ce qui compte maintenant ; vert / ambre / rouge = état).
 */

export interface DesignTokens {
  /** Couleur de marque dominante (ce qui compte maintenant : phase en cours, valeur clé). */
  accent: string;
  /** Seconde couleur de marque (repère « aujourd'hui », séries secondaires). */
  accent2: string;
  /** Texte principal. */
  ink: string;
  /** Texte secondaire (libellés, axes). */
  muted: string;
  /** Texte tertiaire (mentions, graduations). */
  subtle: string;
  /** Filets (séparateurs, grilles). */
  hairline: string;
  /** Surface très claire (pistes, bandeaux de mise en avant). */
  surface: string;
  /** Teinte claire de l'accent (piste de la phase en cours). */
  accentSoft: string;
  ok: string;
  watch: string;
  risk: string;
  /** Police du texte et des titres d'éléments. */
  font: string;
  head: string;
  /** Corps de référence (pt) : tout le reste en découle. */
  base: number;
}

export const STATUS_COLORS = { ok: '1F9D6B', watch: 'E39A2D', risk: 'D64545' };

const hexRgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (v: number[]) => v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
export const mixHex = (a: string, b: string, k: number) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => v * (1 - k) + y[i] * k)); };
export const luminance = (h: string) => { const [r, g, b] = hexRgb(h).map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

/** Jetons de design à partir de la charte : accent et texte des pages modèles, police du corps. */
export function designTokens(input: { primary: string; secondary: string; text: string; font: string; head?: string | null; size: number }): DesignTokens {
  // Encre : texte du modèle s'il est sombre, sinon un quasi-noir neutre (lisibilité avant tout).
  // Noir pur adouci (contraste un peu moins dur, rendu plus fin).
  const ink = luminance(input.text) < 0.35 ? (input.text === '000000' ? '1E2124' : input.text) : '1E2124';
  // Accent : couleur de marque assez soutenue pour porter du texte sur fond blanc.
  const accent = luminance(input.primary) > 0.75 ? mixHex(input.primary, '000000', 0.35) : input.primary;
  return {
    accent, accent2: input.secondary === accent ? mixHex(accent, 'FFFFFF', 0.35) : input.secondary,
    ink, muted: mixHex(ink, 'FFFFFF', 0.38), subtle: mixHex(ink, 'FFFFFF', 0.58), hairline: mixHex(ink, 'FFFFFF', 0.86),
    surface: mixHex(ink, 'FFFFFF', 0.955), accentSoft: mixHex(accent, 'FFFFFF', 0.86),
    ...STATUS_COLORS, font: input.font, head: input.head || input.font, base: Math.min(12, Math.max(9.5, input.size)),
  };
}

/** Échelle typographique (pt) dérivée du corps de référence. */
export const typeScale = (t: DesignTokens) => ({ label: Math.max(7.5, t.base - 3), small: Math.max(8.5, t.base - 1.5), body: t.base, lead: t.base + 2, stat: t.base * 2.6, hero: t.base * 4.2 });

/** Ton d'un statut affiché (pastille de couleur) : terminé / clos → vert, bloqué → rouge, à arbitrer / ouvert → ambre. */
export function statusTone(label: string): 'ok' | 'watch' | 'risk' | 'accent' | 'muted' {
  const s = label.toLowerCase();
  if (/^(terminé|termine|clos|arbitrée|livré|validée)/.test(s)) return 'ok';
  if (/^(bloqu|annul|en retard)/.test(s)) return 'risk';
  if (/^(à arbitrer|ouvert|en traitement|en revue)/.test(s)) return 'watch';
  if (/^(en cours|actif)/.test(s)) return 'accent';
  return 'muted';
}
export const toneColor = (t: DesignTokens, tone: ReturnType<typeof statusTone>) => (tone === 'accent' ? t.accent : tone === 'muted' ? t.subtle : t[tone]);
/** Criticité d'un risque (probabilité × impact) : critique à partir de 20, élevée à partir de 12. */
export const scoreTone = (v: number): 'risk' | 'watch' | 'ok' => (v >= 20 ? 'risk' : v >= 12 ? 'watch' : 'ok');

// ───────────── Frise de temps (Gantt) ─────────────

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Graduation d'une frise : bornes arrondies au mois, pas choisi pour 6 à 14 graduations (mois, trimestre, semestre,
 * année), libellés courts (« janv. », « T3 », « 2027 ») et repères d'année.
 */
export function timeScale(start: string, end: string): { start: string; end: string; ticks: Array<{ iso: string; label: string; year?: string }>; unit: 'month' | 'quarter' | 'half' | 'year' } {
  const s = new Date(ms(start)), e = new Date(ms(end));
  const t0 = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1));
  const t1 = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 1));
  const months = (t1.getUTCFullYear() - t0.getUTCFullYear()) * 12 + t1.getUTCMonth() - t0.getUTCMonth();
  const unit = months <= 14 ? 'month' : months <= 42 ? 'quarter' : months <= 84 ? 'half' : 'year';
  const step = { month: 1, quarter: 3, half: 6, year: 12 }[unit];
  const first = new Date(Date.UTC(t0.getUTCFullYear(), Math.floor(t0.getUTCMonth() / step) * step, 1));
  const ticks: Array<{ iso: string; label: string; year?: string }> = [];
  for (let d = first; d <= t1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1))) {
    const m = d.getUTCMonth(), y = String(d.getUTCFullYear());
    const label = unit === 'month' ? MONTHS[m] : unit === 'quarter' ? `T${m / 3 + 1}` : unit === 'half' ? `S${m / 6 + 1}` : y;
    ticks.push({ iso: isoOf(d), label, ...(unit !== 'year' && (m === 0 || ticks.length === 0) ? { year: y } : {}) });
  }
  return { start: isoOf(first), end: isoOf(t1), ticks, unit };
}
/** Position relative (0 à 1) d'une date sur la frise. */
export const timeRatio = (iso: string, sc: { start: string; end: string }) => Math.max(0, Math.min(1, (ms(iso) - ms(sc.start)) / Math.max(1, ms(sc.end) - ms(sc.start))));
/** Nombre au format français (une décimale au plus) : 5,9 ; 48. */
export const frNum = (v: number, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');
export const frShortDate = (iso: string) => { const d = new Date(ms(iso)); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
