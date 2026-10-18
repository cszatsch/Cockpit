import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Adresse de retour après connexion (`?suite=`, audit de sécurité du 18/10/2026) : `safeReturn` de `frontends/auth-api.js`,
 * extraite du module (qui importe d'autres scripts d'écran) et évaluée telle quelle.
 */
const src = readFileSync(join(__dirname, '../../../frontends/auth-api.js'), 'utf8');
const start = src.indexOf('export function safeReturn');
const end = start + /\r?\n\}\r?\n/.exec(src.slice(start))!.index + 3;
const safeReturn = new Function(src.slice(start, end).replace('export ', '') + '\nreturn safeReturn;')() as (u: unknown) => string;

describe('safeReturn : pas de redirection ouverte', () => {
  it.each([
    '//evil.example/x',
    '/\\evil.example',
    '/\t/evil.example/phish',
    '/\n/evil.example',
    '/\r\n//evil.example',
    '/\t\\evil.example',
    '/a\\b',
    'https://evil.example/',
    'evil.example',
    '',
  ])('refuse %j', (u) => {
    expect(safeReturn(u)).toBe('');
  });

  it('refuse ce qui n’est pas une chaîne', () => {
    expect(safeReturn(null)).toBe('');
    expect(safeReturn(42)).toBe('');
  });

  it('garde un chemin local, sa requête et son ancre', () => {
    expect(safeReturn('/')).toBe('/');
    expect(safeReturn('/console/projets?x=1#a')).toBe('/console/projets?x=1#a');
    expect(safeReturn('/?project=RISE')).toBe('/?project=RISE');
  });
});
