import { z } from 'zod';

/**
 * Objet « Info projet » du Référentiel (décision du 30/09/2026) : contexte client et périmètre du projet, affichés dans
 * l'onglet Fiche projet. Stocké dans le bloc de contenu `referential` du projet (clés ci-dessous), à côté des données
 * de présentation qui ne relèvent pas de l'objet (réseau, lots, historique du Go-Live…).
 */
export const PROJECT_INFO_BLOCK = 'referential';

/** Rubriques, dans l'ordre de l'objet ; `kv` : lignes libellé + valeur, sinon liste de valeurs (texte unique pour `pitch`). */
export const PROJECT_INFO_RUBRIQUES = [
  { key: 'identity', label: 'Le client', kv: true },
  { key: 'brands', label: 'Marques du groupe', kv: false },
  { key: 'pitch', label: 'Programme en une phrase', kv: false },
  { key: 'stakes', label: 'Enjeux stratégiques', kv: false },
  { key: 'scope', label: 'Périmètre fonctionnel', kv: true },
  { key: 'systems', label: 'Périmètre applicatif', kv: true },
  { key: 'geo', label: 'Périmètre géographique', kv: false },
  { key: 'legal', label: 'Périmètre juridique', kv: false },
] as const;

export const PROJECT_INFO_ITEMS_MAX = 60;
export const PROJECT_INFO_LABEL_MAX = 120;
export const PROJECT_INFO_VALUE_MAX = 2000;

const value = z.string().trim().min(1, 'valeur vide').max(PROJECT_INFO_VALUE_MAX, `${PROJECT_INFO_VALUE_MAX} caractères au plus`);
const pair = z.tuple([z.string().trim().max(PROJECT_INFO_LABEL_MAX, `${PROJECT_INFO_LABEL_MAX} caractères au plus`), value]);
const pairs = z.array(pair).max(PROJECT_INFO_ITEMS_MAX, `${PROJECT_INFO_ITEMS_MAX} lignes au plus`);
const list = z.array(value).max(PROJECT_INFO_ITEMS_MAX, `${PROJECT_INFO_ITEMS_MAX} lignes au plus`);

/** Corps de `PUT /api/projects/:id/project/info` : l'objet complet (les rubriques absentes sont vidées). */
export const ProjectInfoSchema = z
  .object({
    identity: pairs.default([]),
    brands: list.default([]),
    pitch: z.string().trim().max(PROJECT_INFO_VALUE_MAX, `${PROJECT_INFO_VALUE_MAX} caractères au plus`).default(''),
    stakes: list.default([]),
    scope: pairs.default([]),
    systems: pairs.default([]),
    geo: list.default([]),
    legal: list.default([]),
  })
  .strict();

export type ProjectInfo = z.infer<typeof ProjectInfoSchema>;

/** Rubriques de l'objet lues dans le bloc `referential` (valeurs manquantes : vides). */
export function projectInfoOf(block: any): ProjectInfo {
  const b = block && typeof block === 'object' ? block : {};
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  return {
    identity: arr(b.identity).map((p: any) => [String(p?.[0] ?? ''), String(p?.[1] ?? '')] as [string, string]),
    brands: arr(b.brands).map(String),
    pitch: typeof b.pitch === 'string' ? b.pitch : '',
    stakes: arr(b.stakes).map(String),
    scope: arr(b.scope).map((p: any) => [String(p?.[0] ?? ''), String(p?.[1] ?? '')] as [string, string]),
    systems: arr(b.systems).map((p: any) => [String(p?.[0] ?? ''), String(p?.[1] ?? '')] as [string, string]),
    geo: arr(b.geo).map(String),
    legal: arr(b.legal).map(String),
  };
}
