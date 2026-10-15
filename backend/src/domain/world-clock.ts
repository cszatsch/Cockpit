/**
 * Horloge mondiale du Cockpit (15/10/2026) : villes choisies par chaque utilisateur, gardées dans ses préférences
 * (`UserPreferences.worldClock`). La première ville sert de référence aux décalages.
 */

/** Nombre de villes au plus (tuile de 4 colonnes). */
export const WORLD_CLOCK_MAX_CITIES = 4;
/** Longueur au plus du nom d'une ville. */
export const WORLD_CLOCK_NAME_MAX = 60;

export interface WorldClockCity {
  name: string;
  timeZone: string;
  lat: number;
  lon: number;
}

/** Fuseau horaire IANA reconnu par le moteur (« Europe/Paris », « Asia/Kolkata »…). */
export function isTimeZone(tz: unknown): boolean {
  if (typeof tz !== 'string' || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Doublon : même nom et même fuseau (insensible à la casse). */
export function duplicateCity(cities: readonly WorldClockCity[]): string | null {
  const seen = new Set<string>();
  for (const c of cities) {
    const k = c.name.trim().toLowerCase() + '|' + c.timeZone;
    if (seen.has(k)) return c.name;
    seen.add(k);
  }
  return null;
}
