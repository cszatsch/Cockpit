import { createDecipheriv } from 'crypto';
import { hashRaw } from '@node-rs/argon2';
import { CODE_ALPHABET, CODE_PATTERN, dataLabel, estimateSize, keyMask, packageFileName, possibleSpend, secretCount, SHARE_KDF, shareRequestErrors, unlockCode } from '../../src/domain/share';
import { seal } from '../../src/admin/share-builder';

describe('Partager Cockpit — règles (spécification PARTAGE § 1-4)', () => {
  it('code : 12 caractères en 3 groupes, sans caractères ambigus, différent à chaque tirage', () => {
    const codes = new Set(Array.from({ length: 200 }, unlockCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(CODE_PATTERN);
    expect(CODE_ALPHABET).not.toMatch(/[01OIL]/);
  });
  it('dépense IA : somme des plafonds, « Illimitée » (null) si une clé sans plafond, 0 sans clé', () => {
    expect(possibleSpend([100, 50])).toBe(150);
    expect(possibleSpend([100, null])).toBeNull();
    expect(possibleSpend([])).toBe(0);
  });
  it('secrets = clés + 1 si SMTP ; taille = application + données + fichiers', () => {
    expect(secretCount(2, true)).toBe(3);
    expect(secretCount(0, false)).toBe(0);
    expect(estimateSize(286, 14, 466)).toBe(766);
  });
  it('nom du fichier : cockpit-<version>-<initiale><nom>.zip, sans accents', () => {
    expect(packageFileName('2.4.0', 'Antoine Mercier')).toBe('cockpit-2.4.0-amercier.zip');
    expect(packageFileName('2.4.0', 'Élodie  de Saint-Exupéry')).toBe('cockpit-2.4.0-esaintexupery.zip');
    expect(packageFileName('2.4.0', '')).toBe('cockpit-2.4.0-paquet.zip');
  });
  it('libellés et masque', () => {
    expect(dataLabel('current', ['RISE', 'Horizon'], true)).toBe('Base actuelle · RISE, Horizon · fichiers');
    expect(dataLabel('demo', [], false)).toBe('Démonstration');
    expect(dataLabel('empty', [], false)).toBe('Cockpit vide');
    expect(keyMask('sk-ant-', '4f2a')).toBe('sk-ant-…4f2a');
  });
  it('demande : destinataire requis, e-mail valide, au moins un projet en base actuelle', () => {
    expect(shareRequestErrors({ data: 'current', projects: [], recipient: { name: '', email: 'x' } })).toEqual({
      'recipient.name': 'Nom du destinataire requis.', 'recipient.email': 'Adresse e-mail invalide.', projects: 'Choisissez au moins un projet.',
    });
    expect(shareRequestErrors({ data: 'demo', projects: [], recipient: { name: 'A B', email: 'a@b.fr' } })).toEqual({});
  });
  it('chiffrement du paquet : clé Argon2id dérivée du code, AES-256-GCM relisible avec le même code seulement', async () => {
    const salt = Buffer.alloc(16, 7);
    const derive = async (code: string) => Buffer.from(await hashRaw(code, { salt, memoryCost: SHARE_KDF.memoryCost, timeCost: SHARE_KDF.timeCost, parallelism: SHARE_KDF.parallelism, outputLen: SHARE_KDF.outputLen, algorithm: 2 }));
    const key = await derive('ABCD-EFGH-JKMN');
    const sealed = seal(key, 'sk-ant-secret');
    const open = (k: Buffer) => {
      const [iv, tag, data] = sealed.split('.').map((x) => Buffer.from(x, 'base64'));
      const d = createDecipheriv('aes-256-gcm', k, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(data), d.final()]).toString('utf8');
    };
    expect(open(key)).toBe('sk-ant-secret');
    const wrong = await derive('ABCD-EFGH-JKMP');
    expect(() => open(wrong)).toThrow();
  });
});
