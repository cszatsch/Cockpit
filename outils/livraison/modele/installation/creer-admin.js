/*
 * Installation de RISE Cockpit : compte de la personne qui installe (Administrateur de la plateforme et PMO de chaque
 * projet), avec le nom, l'e-mail et le mot de passe saisis par l'installateur (variables RISE_ADMIN_NOM,
 * RISE_ADMIN_EMAIL, RISE_INITIAL_ADMIN_PASSWORD ; le mot de passe n'est jamais écrit sur le disque).
 * Codes de sortie : 0 créé, 3 e-mail déjà utilisé, 4 mot de passe trop faible, 1 autre erreur.
 */
const path = require('path');
const backend = path.join(__dirname, '..', 'app', 'backend');
const { PrismaClient } = require(path.join(backend, 'node_modules', '@prisma', 'client'));
const { createInitialAdmin } = require(path.join(backend, 'dist', 'core', 'auth', 'initial-admin'));
const { passwordRules } = require(path.join(backend, 'dist', 'core', 'auth', 'policy'));

(async () => {
  const fullName = (process.env.RISE_ADMIN_NOM || '').trim(), email = (process.env.RISE_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.RISE_INITIAL_ADMIN_PASSWORD || '';
  const faibles = passwordRules(password).filter((r) => !r.ok).map((r) => r.label);
  if (faibles.length) { console.error(`Mot de passe refusé : ${faibles.join(', ')}.`); process.exit(4); }
  const db = new PrismaClient();
  try {
    const id = 'u-' + email.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const r = await createInitialAdmin(db, password, { id, email, fullName }, { mustChangePassword: false });
    if (r === 'exists') { console.error(`Un compte existe déjà pour ${email}.`); process.exit(3); }
    if (r !== 'created') { console.error(`Compte non créé (${r}).`); process.exit(1); }
    console.log(`Compte créé : ${fullName} <${email}> — Administrateur de la plateforme et PMO de chaque projet.`);
  } finally {
    await db.$disconnect();
  }
})().catch((e) => { console.error(`Création du compte impossible : ${e.message}`); process.exit(1); });
