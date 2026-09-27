import { randomBytes } from 'crypto';

/**
 * Identifiants attribués par le serveur (brief § 4).
 * Les objets à code lisible (R08, A-50, D-011, J10, C9…) reçoivent un code séquentiel par projet ;
 * leur `id` vaut ce code s'il est libre dans toute la base, sinon `<CODEPROJET>-<code>`.
 */

/** Prochain code d'une série : max(numéro) + 1, formaté avec un préfixe et un remplissage. */
export function nextCode(existing: string[], prefix: string, pad: number): string {
  let max = 0;
  const re = new RegExp(`^${prefix.replace(/[-]/g, '\\-')}(\\d+)$`);
  for (const c of existing) {
    const m = re.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}

export async function readableId(code: string, projectCode: string, exists: (id: string) => Promise<boolean>): Promise<string> {
  if (!(await exists(code))) return code;
  const scoped = `${projectCode}-${code}`;
  if (!(await exists(scoped))) return scoped;
  return `${scoped}-${shortId()}`;
}

export function shortId(): string {
  return randomBytes(5).toString('hex');
}

/** Identifiant technique opaque, préfixé par le type. */
export function techId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
}
