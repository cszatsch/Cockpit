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
  // Ajoutés le 16/10/2026 (demande du commanditaire).
  GB: { n: 'Royaume-Uni', rg: [['', 'Angleterre et pays de Galles'], ['SCT', 'Écosse'], ['NIR', 'Irlande du Nord']] },
  IT: { n: 'Italie' },
  ES: { n: 'Espagne', rg: [['', 'Fêtes nationales'], ['MD', 'Madrid'], ['CT', 'Catalogne']] },
  PT: { n: 'Portugal' },
  NL: { n: 'Pays-Bas' },
};

/** Noms de pays du Référentiel (en toutes lettres) reconnus pour chaque code ; comparaison sans casse. */
export const HOLIDAY_COUNTRY_LABELS: Array<[string, string]> = [
  ['FR', 'France'], ['BE', 'Belgique'], ['LU', 'Luxembourg'], ['CH', 'Suisse'], ['DE', 'Allemagne'],
  ['US', 'États-Unis'], ['US', 'Etats-Unis'], ['US', 'Etats Unis'], ['US', 'USA'],
  ['GB', 'Royaume-Uni'], ['GB', 'UK'], ['GB', 'Angleterre'], ['GB', 'Grande-Bretagne'], ['IT', 'Italie'], ['ES', 'Espagne'],
  ['PT', 'Portugal'], ['NL', 'Pays-Bas'], ['NL', 'Hollande'],
  ['FR', 'FR'], ['BE', 'BE'], ['LU', 'LU'], ['CH', 'CH'], ['DE', 'DE'], ['US', 'US'], ['GB', 'GB'], ['IT', 'IT'], ['ES', 'ES'], ['PT', 'PT'], ['NL', 'NL'],
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
  if (cc === 'GB') {
    // Jours fériés (bank holidays) : un jour fixe tombant un week-end est remplacé par le jour ouvré suivant non férié
    // (Noël un samedi → lundi 27, lendemain → mardi 28). Jours exceptionnels (couronnement, jubilé) non compris.
    const taken = new Set<string>(), sub = (d: Date, n: string) => { let x = d; if (x.getUTCDay() === 6 || x.getUTCDay() === 0) { do { x = add(x, 1); } while (x.getUTCDay() === 6 || x.getUTCDay() === 0 || taken.has(iso(x))); } taken.add(iso(x)); a(x, n, x.getTime() !== d.getTime() ? d : null); };
    sub(F(1, 1), "Jour de l'an"); if (rg === 'SCT') sub(F(1, 2), '2 janvier'); if (rg === 'NIR') sub(F(3, 17), 'Saint-Patrick');
    GF(); if (rg !== 'SCT') EM(); a(nth(y, 5, 1, 1), 'Jour férié de début mai'); a(lastWd(y, 5, 1), 'Jour férié de printemps');
    if (rg === 'NIR') sub(F(7, 12), 'Bataille de la Boyne'); a(rg === 'SCT' ? nth(y, 8, 1, 1) : lastWd(y, 8, 1), "Jour férié d'été");
    if (rg === 'SCT') sub(F(11, 30), 'Saint-André'); sub(F(12, 25), 'Noël'); sub(F(12, 26), 'Boxing Day');
  }
  if (cc === 'IT') {
    NY(); EP(); EM(); a(F(4, 25), 'Fête de la Libération'); LB(); a(F(6, 2), 'Fête de la République'); AQ(); TS();
    // Saint-François d'Assise (4 octobre) : de nouveau férié à partir de 2026 (loi italienne de 2025).
    if (y >= 2026) a(F(10, 4), "Saint-François d'Assise");
    a(F(12, 8), 'Immaculée Conception'); XM(); SE();
  }
  if (cc === 'ES') {
    // Fêtes nationales communes ; les communautés autonomes en ajoutent ou en déplacent (Madrid, Catalogne ci-dessous).
    NY(); EP(); GF(); LB(); AQ(); a(F(10, 12), 'Fête nationale'); TS(); a(F(12, 6), 'Jour de la Constitution'); a(F(12, 8), 'Immaculée Conception'); XM();
    if (rg === 'MD') { a(R(-3), 'Jeudi saint'); a(F(5, 2), 'Fête de la Communauté de Madrid'); }
    if (rg === 'CT') { EM(); a(F(6, 24), 'Saint-Jean'); a(F(9, 11), 'Fête nationale de Catalogne'); SE(); }
  }
  if (cc === 'PT') {
    NY(); GF(); a(E, 'Pâques'); a(F(4, 25), 'Jour de la Liberté'); LB(); FD(); a(F(6, 10), 'Jour du Portugal'); AQ();
    a(F(10, 5), 'Proclamation de la République'); TS(); a(F(12, 1), "Restauration de l'indépendance"); a(F(12, 8), 'Immaculée Conception'); XM();
  }
  if (cc === 'NL') {
    // Jour du Roi : le 27 avril, avancé au 26 s'il tombe un dimanche. Vendredi saint et 5 mai : fériés officiels,
    // souvent travaillés (selon la convention collective).
    NY(); GF(); a(E, 'Pâques'); EM(); const kd = F(4, 27); a(kd.getUTCDay() === 0 ? F(4, 26) : kd, 'Jour du Roi', kd.getUTCDay() === 0 ? kd : null);
    a(F(5, 5), 'Jour de la Libération'); AS(); a(R(49), 'Pentecôte'); PM(); XM(); a(F(12, 26), 'Lendemain de Noël');
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
