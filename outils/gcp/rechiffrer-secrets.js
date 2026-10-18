/*
 * Changement de la clé maître SECRETS_KEY (audit de sécurité du 18/10/2026) : rechiffre les secrets en base
 * (clés des fournisseurs d'IA, clés des cartes API, mot de passe SMTP), déchiffrés avec l'ancienne clé
 * (SOURCE_SECRETS_KEY), chiffrés avec la nouvelle (CIBLE_SECRETS_KEY) — format de backend/src/core/crypto.ts :
 * base64(iv).base64(tag).base64(chiffré), AES-256-GCM.
 * Tout ou rien : chaque secret est d'abord déchiffré ; un seul illisible et rien n'est écrit. Écriture en une
 * transaction. Aucune valeur secrète n'est affichée.
 * Lancé par outils/gcp/changer-cle-secrets.sh dans le conteneur de l'API (node - , dossier /app).
 */
const crypto = require('crypto');
const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [process.cwd()] }));

const key = (name) => {
  const hex = process.env[name] || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${name} : 64 caractères hexadécimaux attendus`);
  return Buffer.from(hex, 'hex');
};
let SRC, DST;

const decrypt = (stored) => {
  const [iv, tag, data] = stored.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', SRC, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
};
const encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', DST, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
};

(async () => {
  SRC = key('SOURCE_SECRETS_KEY');
  DST = key('CIBLE_SECRETS_KEY');
  if (SRC.equals(DST)) throw new Error('La nouvelle clé est identique à l’ancienne');
  const db = new PrismaClient();
  try {
    const plan = [];
    const lire = (table, id, stored) => {
      try {
        plan.push({ table, id, value: encrypt(decrypt(stored)) });
      } catch {
        throw new Error(`Secret illisible avec l’ancienne clé (${table} ${id}) : rien n’a été modifié`);
      }
    };
    for (const p of await db.provider.findMany({ where: { keyCipher: { not: null } }, select: { id: true, keyCipher: true } })) lire('provider', p.id, p.keyCipher);
    for (const c of await db.apiCard.findMany({ where: { keyEncrypted: { not: null } }, select: { id: true, keyEncrypted: true } })) lire('apiCard', c.id, c.keyEncrypted);
    for (const s of await db.smtpSettings.findMany({ where: { passwordEncrypted: { not: null } }, select: { id: true, passwordEncrypted: true } })) lire('smtpSettings', s.id, s.passwordEncrypted);
    const field = { provider: 'keyCipher', apiCard: 'keyEncrypted', smtpSettings: 'passwordEncrypted' };
    await db.$transaction(plan.map((x) => db[x.table].update({ where: { id: x.id }, data: { [field[x.table]]: x.value } })));
    const n = (t) => plan.filter((x) => x.table === t).length;
    console.log(`Secrets rechiffrés : ${plan.length} (fournisseurs d’IA ${n('provider')}, cartes API ${n('apiCard')}, SMTP ${n('smtpSettings')})`);
  } finally {
    await db.$disconnect();
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
