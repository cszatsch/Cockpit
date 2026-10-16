/**
 * Jours fériés (16/10/2026) : règles par pays et région, reprises du widget « Jours fériés » (maquette « Ephemeride »).
 * Le serveur en tire une table de référence (`public_holidays`), indépendante des projets : la vue `jev_cockpit.jours_feries`
 * et le widget la lisent ; un projet décalé ou un pays changé n'appellent aucune mise à jour, la vue relisant le projet.
 */

/** Première année de la table de référence. */
export const HOLIDAY_FIRST_YEAR = 2020;
/** Années générées au-delà de l'année en cours (la table est complétée au démarrage du serveur). */
export const HOLIDAY_HORIZON_YEARS = 15;

export interface HolidayCountry { n: string; rg?: Array<[string, string]> }

/** Pays et régions du calendrier ('' = calendrier national / fêtes fédérales / métropole). */
export const HOLIDAY_COUNTRIES: Record<string, HolidayCountry> = {
  FR: { n: 'France', rg: [['', 'Métropole'], ['AM', 'Alsace-Moselle']] },
  BE: { n: 'Belgique' },
  LU: { n: 'Luxembourg' },
  CH: { n: 'Suisse', rg: [['', 'Fêtes fédérales'], ['GE', 'Genève'], ['VD', 'Vaud'], ['ZH', 'Zurich']] },
  DE: { n: 'Allemagne', rg: [['', 'Fêtes nationales'], ['BY', 'Bavière'], ['BW', 'Bade-Wurtemberg'], ['BE', 'Berlin'], ['NW', 'Rhénanie-du-Nord-Westphalie']] },
  US: { n: 'États-Unis' },
};

/** Noms de pays du Référentiel (en toutes lettres) reconnus pour chaque code ; comparaison sans casse. */
export const HOLIDAY_COUNTRY_LABELS: Array<[string, string]> = [
  ['FR', 'France'], ['BE', 'Belgique'], ['LU', 'Luxembourg'], ['CH', 'Suisse'], ['DE', 'Allemagne'],
  ['US', 'États-Unis'], ['US', 'Etats-Unis'], ['US', 'Etats Unis'], ['US', 'USA'],
  ['FR', 'FR'], ['BE', 'BE'], ['LU', 'LU'], ['CH', 'CH'], ['DE', 'DE'], ['US', 'US'],
];

/** Code ISO d'un pays du Référentiel, '' s'il n'a pas de calendrier. */
export function holidayCountryIso(name: string | null | undefined): string {
  const k = String(name ?? '').trim().toLowerCase();
  return HOLIDAY_COUNTRY_LABELS.find(([, l]) => l.toLowerCase() === k)?.[0] ?? '';
}

export interface Holiday {
  /** Date AAAA-MM-JJ (jour observé). */
  date: string;
  /** Nom ; deux jours fériés à la même date sont fusionnés : « Fête du Travail · Ascension ». */
  name: string;
  /** Date d'origine quand le jour est observé un autre jour (États-Unis : samedi → vendredi, dimanche → lundi). */
  observedFrom: string | null;
}

const p2 = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const add = (d: Date, k: number) => new Date(d.getTime() + k * 864e5);

/** Dimanche de Pâques (calendrier grégorien). */
export function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114;
  return ymd(y, Math.floor(n / 31), (n % 31) + 1);
}
/** n-ième jour `wd` (0 = dimanche) du mois. */
const nth = (y: number, m: number, wd: number, n: number) => { const f = ymd(y, m, 1); return add(f, ((wd - f.getUTCDay() + 7) % 7) + 7 * (n - 1)); };
/** Dernier jour `wd` du mois. */
const lastWd = (y: number, m: number, wd: number) => { const l = ymd(y, m + 1, 0); return add(l, -((l.getUTCDay() - wd + 7) % 7)); };

/** Jours fériés d'un pays et d'une région pour une année, triés et fusionnés par date. */
export function holidaysOf(cc: string, rg: string, y: number): Holiday[] {
  const E = easter(y), F = (m: number, d: number) => ymd(y, m, d), R = (k: number) => add(E, k), L: Array<{ d: Date; n: string; o: Date | null }> = [];
  const a = (d: Date, n: string, o: Date | null = null) => L.push({ d, n, o });
  const NY = () => a(F(1, 1), "Jour de l'an"), EM = () => a(R(1), 'Lundi de Pâques'), GF = () => a(R(-2), 'Vendredi saint'), LB = () => a(F(5, 1), 'Fête du Travail');
  const AS = () => a(R(39), 'Ascension'), PM = () => a(R(50), 'Lundi de Pentecôte'), AQ = () => a(F(8, 15), 'Assomption'), TS = () => a(F(11, 1), 'Toussaint');
  const XM = () => a(F(12, 25), 'Noël'), SE = () => a(F(12, 26), 'Saint-Étienne'), FD = () => a(R(60), 'Fête-Dieu'), EP = () => a(F(1, 6), 'Épiphanie'), SB = () => a(F(1, 2), 'Saint-Berchtold');
  if (cc === 'FR') { NY(); EM(); LB(); a(F(5, 8), 'Victoire 1945'); AS(); PM(); a(F(7, 14), 'Fête nationale'); AQ(); TS(); a(F(11, 11), 'Armistice 1918'); XM(); if (rg === 'AM') { GF(); SE(); } }
  if (cc === 'BE') { NY(); EM(); LB(); AS(); PM(); a(F(7, 21), 'Fête nationale'); AQ(); TS(); a(F(11, 11), 'Armistice'); XM(); }
  if (cc === 'LU') { NY(); EM(); LB(); a(F(5, 9), "Journée de l'Europe"); AS(); PM(); a(F(6, 23), 'Fête nationale'); AQ(); TS(); XM(); SE(); }
  if (cc === 'CH') {
    NY(); AS(); a(F(8, 1), 'Fête nationale'); XM();
    if (rg === 'GE') { GF(); EM(); PM(); a(add(nth(y, 9, 0, 1), 4), 'Jeûne genevois'); a(F(12, 31), 'Restauration de la République'); }
    if (rg === 'VD') { SB(); GF(); EM(); PM(); a(add(nth(y, 9, 0, 3), 1), 'Lundi du Jeûne fédéral'); }
    if (rg === 'ZH') { SB(); GF(); EM(); LB(); PM(); SE(); }
  }
  if (cc === 'DE') {
    NY(); GF(); EM(); LB(); AS(); PM(); a(F(10, 3), "Jour de l'Unité allemande"); XM(); SE();
    if (rg === 'BY') { EP(); FD(); AQ(); TS(); } if (rg === 'BW') { EP(); FD(); TS(); } if (rg === 'BE') a(F(3, 8), 'Journée internationale des femmes'); if (rg === 'NW') { FD(); TS(); }
  }
  if (cc === 'US') {
    const ob = (d: Date, n: string) => { const w = d.getUTCDay(); a(w === 6 ? add(d, -1) : w === 0 ? add(d, 1) : d, n, w === 6 || w === 0 ? d : null); };
    ob(F(1, 1), "Jour de l'an"); a(nth(y, 1, 1, 3), 'Martin Luther King Jr. Day'); a(nth(y, 2, 1, 3), "Presidents' Day"); a(lastWd(y, 5, 1), 'Memorial Day');
    ob(F(6, 19), 'Juneteenth'); ob(F(7, 4), "Fête de l'Indépendance"); a(nth(y, 9, 1, 1), 'Labor Day'); a(nth(y, 10, 1, 2), 'Columbus Day');
    ob(F(11, 11), 'Veterans Day'); a(nth(y, 11, 4, 4), 'Thanksgiving'); ob(F(12, 25), 'Noël');
  }
  const by = new Map<string, Holiday>();
  for (const h of L) {
    const k = iso(h.d), cur = by.get(k);
    if (cur) cur.name += ' · ' + h.n; else by.set(k, { date: k, name: h.n, observedFrom: h.o ? iso(h.o) : null });
  }
  return [...by.values()].sort((x, z) => x.date.localeCompare(z.date));
}

/** Toutes les lignes de la table de référence pour les années [y0, y1] : pays × régions ('' compris). */
export function holidayRows(y0: number, y1: number): Array<Holiday & { country: string; region: string }> {
  const out: Array<Holiday & { country: string; region: string }> = [];
  for (const [cc, c] of Object.entries(HOLIDAY_COUNTRIES)) for (const [rg] of c.rg ?? [['', '']]) for (let y = y0; y <= y1; y++) for (const h of holidaysOf(cc, rg, y)) out.push({ ...h, country: cc, region: rg });
  return out;
}
