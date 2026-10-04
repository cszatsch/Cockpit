/*
 * Paquet d'installation (04/10/2026) : préparation de la copie de la base livrée.
 *   - retire le compte de l'auteur du paquet (compte initial « u-initial ») et ses lignes liées ;
 *   - ferme toutes les sessions et invalide tous les liens de mot de passe ;
 *   - rechiffre les secrets (clés des fournisseurs d'IA, clés des cartes API, mot de passe SMTP) : déchiffrés avec la
 *     clé de l'environnement de développement (SOURCE_SECRETS_KEY), chiffrés avec la clé propre au paquet
 *     (PAQUET_SECRETS_KEY) — même format que src/core/crypto.ts : base64(iv).base64(tag).base64(chiffré), AES-256-GCM.
 * Exécuté par construire.ps1 sur une base temporaire (DATABASE_URL) ; aucune valeur secrète n'est affichée.
 */
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require(path.join(process.env.BACKEND_DIR, 'node_modules', '@prisma', 'client'));

const key = (name) => {
  const hex = process.env[name] || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${name} : 64 caractères hexadécimaux attendus`);
  return Buffer.from(hex, 'hex');
};
const SRC = key('SOURCE_SECRETS_KEY'), DST = key('PAQUET_SECRETS_KEY');
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
  const db = new PrismaClient();
  const out = {};
  try {
    // Compte de l'auteur du paquet et lignes sans clé étrangère qui le désignent.
    const AUTEUR = 'u-initial';
    out.habilitations = (await db.habilitation.deleteMany({ where: { accountId: AUTEUR } })).count;
    out.droitsAdmin = (await db.adminGrant.deleteMany({ where: { accountId: AUTEUR } })).count;
    out.preferences = (await db.userPreferences.deleteMany({ where: { accountId: AUTEUR } })).count;
    out.notifications = (await db.userNotification.deleteMany({ where: { accountId: AUTEUR } })).count;
    out.accueils = (await db.todayGreeting.deleteMany({ where: { accountId: AUTEUR } })).count;
    out.brouillons = (await db.reportTemplateDraft.deleteMany({})).count;
    out.compte = (await db.account.deleteMany({ where: { id: AUTEUR } })).count;
    // Sessions et liens de mot de passe : aucun ne voyage.
    out.sessions = (await db.authSession.deleteMany({})).count;
    out.liens = (await db.passwordToken.deleteMany({})).count;
    // Secrets rechiffrés avec la clé du paquet.
    let n = 0;
    for (const p of await db.provider.findMany({ where: { keyCipher: { not: null } }, select: { id: true, keyCipher: true } })) {
      await db.provider.update({ where: { id: p.id }, data: { keyCipher: encrypt(decrypt(p.keyCipher)) } }); n++;
    }
    for (const c of await db.apiCard.findMany({ where: { keyEncrypted: { not: null } }, select: { id: true, keyEncrypted: true } })) {
      await db.apiCard.update({ where: { id: c.id }, data: { keyEncrypted: encrypt(decrypt(c.keyEncrypted)) } }); n++;
    }
    for (const s of await db.smtpSettings.findMany({ where: { passwordEncrypted: { not: null } }, select: { id: true, passwordEncrypted: true } })) {
      await db.smtpSettings.update({ where: { id: s.id }, data: { passwordEncrypted: encrypt(decrypt(s.passwordEncrypted)) } }); n++;
    }
    out.secretsRechiffres = n;
    console.log(JSON.stringify(out));
  } finally {
    await db.$disconnect();
  }
})().catch((e) => { console.error(`Préparation de la base impossible : ${e.message}`); process.exit(1); });
