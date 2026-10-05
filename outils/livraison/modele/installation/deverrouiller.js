/*
 * Installation de RISE Cockpit : secrets du paquet (Partager Cockpit, 05/10/2026). Lit donnees\paquet.json.
 *   node deverrouiller.js cle            → affiche la clé des secrets (64 caractères hexadécimaux) :
 *       - paquet protégé par code : clé dérivée du code (variable RISE_CODE, jamais écrite sur le disque) par Argon2id
 *         avec le sel du paquet, puis vérifiée ; code faux : sortie 2 ;
 *       - paquet sans code : clé incluse dans le paquet ; paquet sans secret : clé neuve.
 *   node deverrouiller.js sans-secrets   → efface les clés d'IA, les clés des cartes API et le SMTP de la base installée
 *       (installation sans code valide) ; DATABASE_URL lue dans l'environnement.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const backend = path.join(__dirname, '..', 'app', 'backend');

const paquet = JSON.parse(fs.readFileSync(process.env.RISE_PAQUET_JSON, 'utf8'));
const s = paquet.securite || { mode: 'aucun' };

function ouvrir(key, sealed) {
  const [iv, tag, data] = sealed.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

(async () => {
  const action = process.argv[2];
  if (action === 'cle') {
    if (s.mode === 'cle') { process.stdout.write(s.cle); return; }
    if (s.mode !== 'code') { process.stdout.write(crypto.randomBytes(32).toString('hex')); return; }
    const code = String(process.env.RISE_CODE || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})(.{4})$/, '$1-$2-$3');
    const { hashRaw } = require(path.join(backend, 'node_modules', '@node-rs', 'argon2'));
    const key = Buffer.from(await hashRaw(code, { salt: Buffer.from(s.kdf.salt, 'hex'), memoryCost: s.kdf.memoryCost, timeCost: s.kdf.timeCost, parallelism: s.kdf.parallelism, outputLen: s.kdf.outputLen, algorithm: 2 }));
    try { if (ouvrir(key, s.verification) !== 'RISE-COCKPIT') throw new Error(); } catch { process.exit(2); }
    process.stdout.write(key.toString('hex'));
    return;
  }
  if (action === 'sans-secrets') {
    const { PrismaClient } = require(path.join(backend, 'node_modules', '@prisma', 'client'));
    const db = new PrismaClient();
    try {
      await db.provider.updateMany({ data: { keyCipher: null, keyPrefix: null, keyLast4: null, status: 'UNTESTED' } });
      await db.apiCard.updateMany({ data: { keyEncrypted: null } });
      await db.smtpSettings.deleteMany({});
    } finally { await db.$disconnect(); }
    return;
  }
  process.exit(1);
})().catch((e) => { console.error(e.message); process.exit(1); });
