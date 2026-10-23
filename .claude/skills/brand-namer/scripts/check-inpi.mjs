#!/usr/bin/env node
// Vérification INPI des noms candidats (étape 04d) : marques françaises (FR),
// de l'Union européenne (EU) et internationales désignant la France (WO),
// en une seule recherche par nom sur l'API de diffusion de l'INPI.
//
// Usage :
//   node scripts/check-inpi.mjs [--classes 9,35,42] "Nom 1" "Nom 2" ...
//   node scripts/check-inpi.mjs --json ...   (sortie JSON au lieu du tableau)
//
// Identifiants : compte technique gratuit de data.inpi.fr, lu dans les variables
// INPI_USERNAME et INPI_PASSWORD (jamais dans un fichier). INPI_BASE_URL change
// la passerelle (tests).
//
// Contrat : un nom n'est jamais déclaré « aucune marque identique » si l'appel
// a échoué ; il est alors « inconnu ». Codes de sortie : 0 terminé (même avec des
// noms inconnus), 2 usage, 3 identifiants absents, 4 connexion refusée.

const BASE = (process.env.INPI_BASE_URL || 'https://api-gateway.inpi.fr').replace(/\/$/, '');
const SEARCH = '/services/apidiffusion/api/marques/search';
const COLLECTIONS = ['FR', 'EU', 'WO'];
const FIELDS = ['ApplicationNumber', 'Mark', 'MarkCurrentStatusCode', 'ClassNumber', 'DEPOSANT', 'ukey'];
const MAX_SHOWN = 5;
const TIMEOUT_MS = 20000;

function usage(message) {
  if (message) console.error(message);
  console.error('Usage : node check-inpi.mjs [--classes 9,35,42] [--json] "Nom 1" "Nom 2" ...');
  process.exit(2);
}

function parseArgs(argv) {
  const names = [];
  let classes = [];
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--classes') {
      const v = argv[++i];
      if (!v) usage('--classes attend une liste, par exemple 9,42.');
      classes = v.split(',').map((c) => c.trim()).filter(Boolean);
      if (classes.some((c) => !/^\d{1,2}$/.test(c) || +c < 1 || +c > 45)) usage('Classes de Nice : nombres de 1 à 45.');
    } else if (a.startsWith('--')) usage(`Option inconnue : ${a}`);
    else if (a.trim()) names.push(a.trim());
  }
  if (!names.length) usage('Aucun nom à vérifier.');
  return { names, classes, json };
}

// Requête dans la syntaxe de l'INPI (clauses entre crochets, opérateurs ET / OU) :
// expression exacte de la marque, classes de Nice en option. Les guillemets
// imposent tous les mots d'un nom composé (sinon OU entre les mots).
function buildQuery(name, classes = []) {
  const clean = name.replace(/["\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  let q = `[Mark_Exp="${clean}"]`;
  if (classes.length) q += ` ET [ClassNumber=(${classes.join(' OU ')})]`;
  return q;
}

// Bocal à cookies minimal : le jeton XSRF change à chaque réponse.
class Jar {
  constructor() { this.cookies = new Map(); }
  take(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of list) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  get xsrf() { return this.cookies.get('XSRF-TOKEN'); }
}

async function call(jar, path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (jar.xsrf) headers['X-XSRF-TOKEN'] = decodeURIComponent(jar.xsrf);
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual',
  });
  jar.take(res);
  return res;
}

async function login(jar, username, password) {
  // Le 401 de /authenticate est attendu : il sert à poser le premier cookie XSRF.
  await call(jar, '/services/uaa/api/authenticate');
  const res = await call(jar, '/auth/login', { method: 'POST', body: { username, password, rememberMe: true } });
  if (!res.ok) throw new Error(`connexion refusée (HTTP ${res.status})`);
}

// Les champs d'un résultat arrivent en liste { name, value, values }.
function readFields(result) {
  const out = {};
  for (const f of result.fields || []) {
    const v = f.values && f.values.length ? f.values.join(', ') : f.value;
    if (v !== undefined && v !== null && v !== '') out[f.name] = String(v);
  }
  return out;
}

function collectionOf(fields, documentId = '') {
  const key = fields.ukey || documentId;
  if (/^CTMARK/i.test(key)) return 'UE';
  if (/^TMINT/i.test(key)) return 'OMPI';
  if (/^FMARK/i.test(key)) return 'FR';
  return '?';
}

async function search(jar, creds, name, classes) {
  const body = { collections: COLLECTIONS, query: buildQuery(name, classes), fields: FIELDS, position: 0, size: 20 };
  let res = await call(jar, SEARCH, { method: 'POST', body });
  if (res.status === 401 || res.status === 403) {
    // Jeton d'accès expiré (300 s) ou XSRF périmé : une seule reconnexion.
    await login(jar, creds.username, creds.password);
    res = await call(jar, SEARCH, { method: 'POST', body });
  }
  if (!res.ok) throw new Error(`recherche refusée (HTTP ${res.status})`);
  const data = await res.json();
  if (!data || !Array.isArray(data.results)) throw new Error('réponse inattendue');
  const marks = data.results.map((r) => {
    const f = readFields(r);
    return {
      office: collectionOf(f, r.documentId),
      mark: f.Mark || '',
      number: f.ApplicationNumber || r.documentId || '',
      status: f.MarkCurrentStatusCode || '',
      classes: f.ClassNumber || '',
      owner: f.DEPOSANT || '',
    };
  });
  const count = Number(data.metadata?.count ?? marks.length);
  return { name, status: count ? 'marques trouvées' : 'aucune marque identique', count, marks };
}

function table(rows, classes) {
  const lines = [];
  lines.push(`Recherche INPI (FR, UE, OMPI) — expression exacte${classes.length ? `, classes ${classes.join(', ')}` : ', toutes classes'}`);
  lines.push('');
  lines.push('| Nom | Résultat | Marques (office · n° · statut · classes · déposant) |');
  lines.push('|---|---|---|');
  for (const r of rows) {
    const shown = (r.marks || []).slice(0, MAX_SHOWN)
      .map((m) => `${m.mark || '?'} (${[m.office, m.number, m.status, m.classes && `cl. ${m.classes}`, m.owner].filter(Boolean).join(' · ')})`);
    if (r.count > MAX_SHOWN) shown.push(`… ${r.count - MAX_SHOWN} de plus`);
    const label = r.status === 'marques trouvées' ? `${r.count} marque(s)` : r.status;
    lines.push(`| ${r.name} | ${label} | ${(r.error ? r.error : shown.join('<br>')) || '—'} |`);
  }
  lines.push('');
  lines.push('Expression exacte seulement : cherchez aussi les variantes phonétiques. Premier tri, pas un avis juridique.');
  return lines.join('\n');
}

async function main() {
  const { names, classes, json } = parseArgs(process.argv.slice(2));
  const creds = { username: process.env.INPI_USERNAME, password: process.env.INPI_PASSWORD };
  if (!creds.username || !creds.password) {
    console.error('INPI_USERNAME et INPI_PASSWORD absents : créez un compte gratuit sur https://data.inpi.fr (accès à l\'API de diffusion), puis exportez-les dans le terminal.');
    console.error('Sans compte : recherche manuelle sur https://data.inpi.fr, onglet Marques, pour chacun de ces noms : ' + names.join(', '));
    process.exit(3);
  }
  const jar = new Jar();
  try {
    await login(jar, creds.username, creds.password);
  } catch (e) {
    console.error(`INPI : ${e.message}. Aucun nom n'a été vérifié.`);
    process.exit(4);
  }
  const rows = [];
  for (const name of names) {
    try {
      rows.push(await search(jar, creds, name, classes));
    } catch (e) {
      rows.push({ name, status: 'inconnu', count: 0, marks: [], error: e.message });
    }
  }
  console.log(json ? JSON.stringify({ classes, rows }, null, 2) : table(rows, classes));
}

main();
