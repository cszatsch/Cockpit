import { execFile } from 'child_process';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { createReadStream, existsSync, promises as fs, readdirSync } from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { hashRaw } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { config } from '../core/config';
import { decryptSecret } from '../core/crypto';
import { SHARE_KDF, ShareDataMode, ShareUpdate } from '../domain/share';

/**
 * Construction du paquet d'installation Windows (Partager Cockpit, 05/10/2026) : application assemblée (win-x64 :
 * application compilée, dépendances de production, Node.js et PostgreSQL embarqués), copie de la base selon le mode,
 * secrets rechiffrés pour le paquet (clé dérivée du code par Argon2id, ou clé incluse sans code), archive ZIP.
 * Utilisée par la Console (`ShareService`) et par `npm run livraison`. Windows seulement (tar.exe, PostgreSQL).
 */

const run = promisify(execFile);
export interface ShareBuildOptions {
  id: string;
  version: string;
  build: string;
  data: ShareDataMode;
  projects: string[];
  /** Fournisseurs d'IA et cartes API dont la clé est incluse (identifiants). */
  keys: string[];
  smtp: boolean;
  files: boolean;
  code: string | null;
  recipient: { name: string; email: string };
  prefill: { name: string; email: string; profiles: string[] } | null;
  update: ShareUpdate;
  /** Compte de l'auteur, retiré de la copie. */
  authorAccountId: string | null;
  fileName: string;
}
export interface ShareBuildResult { file: string; size: number; sha256: string }
export type StepFn = (step: number) => Promise<void> | void;

/** Tables de configuration reprises de la base actuelle dans le jeu de démonstration et le Cockpit vide. */
const CONFIG_TABLES = ['Provider', 'AiModel', 'ModelAssignment', 'BudgetThreshold', 'smtp_settings', 'api_cards', 'Skill', 'Persona', 'PersonaVersion', 'jev_rag_settings', 'guide_versions', 'guide_chunks'];
/** Tables liées aux fichiers déposés (Base de connaissance, guide) : vidées sans fichiers. Les formats et templates de rapport
 * restent toujours (décision du 05/10/2026 : quelques Mo, et sans eux « Générer un rapport » serait vide). */
const FILE_TABLES = ['kb_chunks', 'document_events', 'Document', 'guide_chunks', 'guide_versions', 'guide_uploads', 'guide_downloads'];
/** Export du jeu de démonstration livré dans l'application (relatif à `app/backend`). */
export const DEMO_DUMP = path.join('demo', 'demo.dump');
/** Dossiers du stockage par catégorie de fichiers ; ceux marqués projet sont filtrés par projet. */
const FILE_DIRS: Record<'kb' | 'guide' | 'formats', string[]> = { kb: ['base-connaissance'], guide: ['guide'], formats: ['report-formats', 'report-templates'] };
const PROJECT_DIRS = ['base-connaissance', 'report-formats', 'report-templates', 'snapshots', 'assistant', 'reports'];
/** Dépendances inutiles à l'exécution (en plus des dépendances de développement du verrou npm). */
const NODE_MODULES_SKIP = new Set(['prisma', 'typescript', 'effect', '.cache', '@types', 'ts-node', 'ts-node-dev', 'jest', 'playwright', 'playwright-core', '@babel']);
const ENGINE_SKIP = /\.tmp\d*$/;

export class ShareBuilder {
  readonly backendDir = process.cwd();

  /** Racines : dépôt de développement (…/backend/..) ou installation (…/app/backend/../..). */
  paths() {
    const root = path.resolve(this.backendDir, '..');
    const installed = path.basename(root) === 'app';
    const top = installed ? path.resolve(root, '..') : root;
    const modele = installed ? path.join(top, 'installation') : path.join(top, 'outils', 'livraison', 'modele', 'installation');
    const icon = [path.join(top, 'outils', 'cockpit.ico'), path.join(top, 'cockpit.ico'), path.join(modele, 'cockpit.ico')].find((p) => existsSync(p)) ?? null;
    return { top, installed, modele, icon, pgBin: this.pgBin(top) };
  }

  pgBin(top: string): string {
    if (process.env.PG_BIN && existsSync(process.env.PG_BIN)) return process.env.PG_BIN;
    const embedded = path.join(top, 'runtime', 'pgsql', 'bin');
    if (existsSync(path.join(embedded, 'pg_dump.exe'))) return embedded;
    const base = 'C:\\Program Files\\PostgreSQL';
    const dirs = existsSync(base) ? readdirSync(base).filter((d) => existsSync(path.join(base, d, 'lib', 'vector.dll'))).sort((a, b) => parseInt(b, 10) - parseInt(a, 10)) : [];
    if (!dirs.length) throw new Error('PostgreSQL avec pgvector introuvable (C:\\Program Files\\PostgreSQL) : variable PG_BIN à renseigner.');
    return path.join(base, dirs[0], 'bin');
  }

  private db() {
    const u = new URL(config.databaseUrl.replace(/^postgres(ql)?:/, 'http:'));
    return { host: u.hostname || 'localhost', port: u.port || '5432', user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), name: u.pathname.replace(/^\//, '') };
  }
  private env(): NodeJS.ProcessEnv {
    const d = this.db();
    return { ...process.env, PGHOST: d.host, PGPORT: d.port, PGUSER: d.user, ...(d.password ? { PGPASSWORD: d.password } : {}) };
  }
  private async pg(bin: string, tool: string, args: string[]) {
    await run(path.join(bin, `${tool}.exe`), args, { env: this.env(), maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  }
  private client(dbName: string) {
    const d = this.db();
    const url = `postgresql://${encodeURIComponent(d.user)}${d.password ? ':' + encodeURIComponent(d.password) : ''}@${d.host}:${d.port}/${dbName}`;
    return new PrismaClient({ datasources: { db: { url } } });
  }

  async build(o: ShareBuildOptions, step: StepFn): Promise<ShareBuildResult> {
    const P = this.paths();
    const work = path.resolve(config.storageDir, 'share-work', o.id);
    const stage = path.join(work, 'RISE Cockpit');
    const temp = `share_${o.id.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;
    await fs.rm(work, { recursive: true, force: true });
    await fs.mkdir(path.join(stage, 'donnees'), { recursive: true });
    try {
      // ───── 1. Application (win-x64) ─────
      await step(0);
      await this.assemble(stage, P);
      // ───── 2. Base ─────
      await step(1);
      await this.copyDatabase(o, P.pgBin, temp);
      // ───── 3. Secrets ─────
      await step(2);
      const securite = await this.encryptSecrets(o, temp);
      // ───── 4. Archive ─────
      await step(3);
      await this.pg(P.pgBin, 'pg_dump', ['-Fc', '-f', path.join(stage, 'donnees', 'rise.dump'), temp]);
      await this.copyFiles(o, path.join(stage, 'donnees', 'fichiers'));
      await fs.writeFile(path.join(stage, 'donnees', 'paquet.json'), JSON.stringify({ version: o.version, build: o.build, createdAt: new Date().toISOString(), recipient: o.recipient, prefill: o.prefill, update: o.update, data: o.data, securite }, null, 2));
      await fs.cp(P.modele, path.join(stage, 'installation'), { recursive: true });
      if (P.icon) await fs.copyFile(P.icon, path.join(stage, 'installation', 'cockpit.ico'));
      for (const f of ['installer_cockpit.cmd', 'LISEZMOI.txt']) {
        const src = path.join(stage, 'installation', f);
        if (existsSync(src)) await fs.copyFile(src, path.join(stage, f));
      }
      const outDir = path.resolve(config.storageDir, 'share', o.id);
      await fs.mkdir(outDir, { recursive: true });
      const file = path.join(outDir, o.fileName);
      await fs.rm(file, { force: true });
      await run(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', file, 'RISE Cockpit'], { cwd: work, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      const size = (await fs.stat(file)).size;
      return { file, size, sha256: await sha256(file) };
    } finally {
      await this.pg(P.pgBin, 'dropdb', ['--if-exists', temp]).catch(() => {});
      await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Application compilée, dépendances de production, interfaces, Node.js et PostgreSQL (avec pgvector). */
  async assemble(stage: string, P: ReturnType<ShareBuilder['paths']>) {
    const B = path.join(stage, 'app', 'backend');
    await fs.mkdir(B, { recursive: true });
    await mirror(path.join(this.backendDir, 'dist'), path.join(B, 'dist'));
    // Migrations SQL : appliquées par l'installateur quand les données du poste sont conservées.
    await mirror(path.join(this.backendDir, 'prisma', 'migrations'), path.join(B, 'prisma', 'migrations'));
    for (const f of ['package.json', 'package-lock.json']) if (existsSync(path.join(this.backendDir, f))) await fs.copyFile(path.join(this.backendDir, f), path.join(B, f));
    // Jeu de démonstration livré avec l'application : les paquets générés depuis cette installation pourront le proposer.
    await fs.mkdir(path.dirname(path.join(B, DEMO_DUMP)), { recursive: true });
    await fs.copyFile(await this.demoDump(P.pgBin), path.join(B, DEMO_DUMP));
    // Dépendances de production : un dossier par paquet de premier niveau (copie robocopy, rapide sous Windows),
    // sans les paquets de développement du verrou npm, les outils de construction ni les copies temporaires du moteur Prisma.
    const dev = this.devPackages();
    const nm = path.join(this.backendDir, 'node_modules');
    const tops: string[] = [];
    for (const e of readdirSync(nm, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === '.bin') continue;
      if (e.name.startsWith('@')) for (const s of readdirSync(path.join(nm, e.name))) tops.push(`${e.name}/${s}`);
      else tops.push(e.name);
    }
    const keep = tops.filter((t) => !NODE_MODULES_SKIP.has(t) && !NODE_MODULES_SKIP.has(t.split('/')[0]) && !dev.has(t) && t !== '@prisma/engines');
    for (let i = 0; i < keep.length; i += 8) {
      await Promise.all(keep.slice(i, i + 8).map((t) => mirror(path.join(nm, t), path.join(B, 'node_modules', t), t === '.prisma' ? ['/XF', '*.tmp*'] : [])));
    }
    await mirror(path.resolve(this.backendDir, config.frontendDir || '../frontends'), path.join(stage, 'app', 'frontends'));
    await fs.mkdir(path.join(stage, 'runtime', 'node'), { recursive: true });
    await fs.copyFile(process.execPath, path.join(stage, 'runtime', 'node', 'node.exe'));
    const pg = path.dirname(P.pgBin);
    for (const d of ['bin', 'lib', 'share']) await mirror(path.join(pg, d), path.join(stage, 'runtime', 'pgsql', d));
    for (const dll of ['vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll']) {
      const s = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', dll), t = path.join(stage, 'runtime', 'pgsql', 'bin', dll);
      if (existsSync(s) && !existsSync(t)) await fs.copyFile(s, t);
    }
  }

  /** Paquets de développement d'après le verrou npm (racines `node_modules/<nom>` marquées `dev`). */
  devPackages(): Set<string> {
    const out = new Set<string>();
    try {
      const lock = JSON.parse(require('fs').readFileSync(path.join(this.backendDir, 'package-lock.json'), 'utf8'));
      for (const [k, v] of Object.entries<any>(lock.packages ?? {})) {
        const m = /^node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(k);
        if (m && v.dev) out.add(m[1]);
      }
    } catch { /* installation : verrou absent, dépendances déjà réduites */ }
    return out;
  }

  /** Base temporaire : copie filtrée (base actuelle, Cockpit vide) ou jeu de démonstration, puis nettoyage commun. */
  async copyDatabase(o: ShareBuildOptions, bin: string, temp: string) {
    const main = this.db().name;
    await this.pg(bin, 'dropdb', ['--if-exists', temp]);
    await this.pg(bin, 'createdb', [temp]);
    const dump = path.resolve(config.storageDir, 'share-work', o.id, 'source.dump');
    if (o.data === 'demo') {
      // Jeu de démonstration embarqué (décision du 05/10/2026) : fabriqué une fois par version sur le poste de
      // développement, livré dans chaque paquet (`app/backend/demo/demo.dump`), donc disponible aussi sur une installation.
      await this.pg(bin, 'pg_restore', ['--no-owner', '-d', temp, await this.demoDump(bin)]).catch((e) => { if (!/warning|avertissement/i.test(String(e.stderr ?? ''))) throw e; });
      // Configuration de la plateforme reprise de la base actuelle (IA, SMTP, cartes API, skills, persona, guide).
      await this.sql(temp, CONFIG_TABLES.map((t) => `DELETE FROM "${t}";`).join(' '));
      await this.pg(bin, 'pg_dump', ['-Fc', '-a', ...CONFIG_TABLES.flatMap((t) => ['-t', `public."${t}"`]), '-f', dump, main]);
      await this.pg(bin, 'pg_restore', ['-a', '--disable-triggers', '-d', temp, dump]);
    } else {
      await this.pg(bin, 'pg_dump', ['-Fc', '-f', dump, main]);
      await this.pg(bin, 'pg_restore', ['--no-owner', '-d', temp, dump]).catch((e) => { if (!/warning|avertissement/i.test(String(e.stderr ?? ''))) throw e; });
      const keep = o.data === 'current' ? o.projects : [];
      const list = keep.length ? keep.map((p) => `'${p.replace(/'/g, "''")}'`).join(',') : `''`;
      // Projets non retenus : lignes de chaque table portant un projet, puis lignes devenues orphelines (clés étrangères).
      await this.sql(temp, `
        DO $$ DECLARE r record; BEGIN
          FOR r IN SELECT table_name, column_name FROM information_schema.columns
                   WHERE table_schema = 'public' AND column_name IN ('projectId', 'project_id') LOOP
            EXECUTE format('DELETE FROM %I WHERE %I IS NOT NULL AND %I NOT IN (${list.replace(/'/g, "''")})', r.table_name, r.column_name, r.column_name);
          END LOOP;
          DELETE FROM "Project" WHERE id NOT IN (${list});
        END $$;`);
      await this.sql(temp, ORPHANS_SQL);
      await this.sql(temp, ORPHANS_SQL);
      if (o.data === 'empty') await this.sql(temp, 'DELETE FROM "Habilitation"; DELETE FROM "AdminGrant"; DELETE FROM "UserPreferences"; DELETE FROM "Account"; DELETE FROM "Client" WHERE NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."clientId" = "Client".id);');
    }
    // Commun : auteur, sessions et liens retirés ; clés non retenues effacées ; SMTP et fichiers selon les choix.
    const author = [o.authorAccountId, 'u-initial'].filter(Boolean).map((x) => `'${String(x).replace(/'/g, "''")}'`).join(',');
    const list = (ids: string[]) => (ids.length ? ids.map((k) => `'${k.replace(/'/g, "''")}'`).join(',') : `''`);
    const keyList = list(o.keys.filter((k) => !k.startsWith('card:')));
    const cardList = list(o.keys.filter((k) => k.startsWith('card:')).map((k) => k.slice(5)));
    await this.sql(temp, `
      DELETE FROM "Habilitation" WHERE "accountId" IN (${author});
      DELETE FROM "AdminGrant" WHERE "accountId" IN (${author});
      DELETE FROM "UserPreferences" WHERE "accountId" IN (${author});
      DELETE FROM user_notifications WHERE account_id IN (${author});
      DELETE FROM today_greetings WHERE "accountId" IN (${author});
      DELETE FROM report_template_drafts;
      DELETE FROM "Account" WHERE id IN (${author});
      DELETE FROM "AuthSession"; DELETE FROM "PasswordToken"; DELETE FROM "LoginThrottle";
      UPDATE "Provider" SET "keyCipher" = NULL, "keyPrefix" = NULL, "keyLast4" = NULL, status = 'UNTESTED' WHERE id NOT IN (${keyList});
      UPDATE api_cards SET key_encrypted = NULL, key_last4 = NULL WHERE id NOT IN (${cardList});
      ${o.smtp ? '' : 'DELETE FROM smtp_settings;'}
      ${o.files ? '' : FILE_TABLES.map((t) => `DELETE FROM "${t}";`).join(' ')}
    `);
  }

  /** Export du jeu de démonstration de cette version : celui livré avec l'installation, sinon fabriqué (et gardé en cache). */
  async demoDump(bin: string): Promise<string> {
    const shipped = path.join(this.backendDir, DEMO_DUMP);
    const prismaCli = path.join(this.backendDir, 'node_modules', 'prisma', 'build', 'index.js');
    const tsNode = path.join(this.backendDir, 'node_modules', 'ts-node', 'dist', 'bin.js');
    const dev = existsSync(prismaCli) && existsSync(tsNode) && existsSync(path.join(this.backendDir, 'prisma', 'seed', 'index.ts'));
    if (!dev) {
      if (existsSync(shipped)) return shipped;
      throw new Error('Jeu de démonstration absent de cette installation (paquet antérieur au 05/10/2026) : choisissez « Base actuelle » ou « Cockpit vide ».');
    }
    // Empreinte des sources du jeu : migrations, amorçage et données des écrans ; nouvel export si l'une change.
    const h = createHash('sha256');
    const feed = (dir: string) => { if (!existsSync(dir)) return; for (const e of readdirSync(dir, { withFileTypes: true }).sort((x, y) => x.name.localeCompare(y.name))) { const f = path.join(dir, e.name); if (e.isDirectory()) feed(f); else h.update(e.name).update(require('fs').readFileSync(f)); } };
    feed(path.join(this.backendDir, 'prisma', 'migrations'));
    feed(path.join(this.backendDir, 'prisma', 'seed'));
    for (const f of ['rise-data.js', 'planning-data.js']) { const x = path.resolve(this.backendDir, config.frontendDir || '../frontends', f); if (existsSync(x)) h.update(require('fs').readFileSync(x)); }
    const cache = path.resolve(config.storageDir, 'share-cache', `demo-${h.digest('hex').slice(0, 16)}.dump`);
    if (existsSync(cache)) return cache;
    const temp = `share_demo_${Date.now()}`;
    const d = this.db();
    const env = { ...process.env, DATABASE_URL: `postgresql://${encodeURIComponent(d.user)}${d.password ? ':' + encodeURIComponent(d.password) : ''}@${d.host}:${d.port}/${temp}` };
    await this.pg(bin, 'createdb', [temp]);
    try {
      await run(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: this.backendDir, env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      await run(process.execPath, [tsNode, '--transpile-only', 'prisma/seed/index.ts'], { cwd: this.backendDir, env, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
      await fs.rm(path.dirname(cache), { recursive: true, force: true });
      await fs.mkdir(path.dirname(cache), { recursive: true });
      await this.pg(bin, 'pg_dump', ['-Fc', '-f', cache, temp]);
    } finally {
      await this.pg(bin, 'dropdb', ['--if-exists', temp]).catch(() => {});
    }
    return cache;
  }

  /** Rechiffrement des secrets pour le paquet : clé dérivée du code (Argon2id) ou clé incluse ; jamais la clé du serveur. */
  async encryptSecrets(o: ShareBuildOptions, temp: string) {
    const db = this.client(temp);
    try {
      const providers = await db.provider.findMany({ where: { keyCipher: { not: null } }, select: { id: true, keyCipher: true } });
      const cards = await db.apiCard.findMany({ where: { keyEncrypted: { not: null } }, select: { id: true, keyEncrypted: true } });
      const smtp = await db.smtpSettings.findMany({ where: { passwordEncrypted: { not: null } }, select: { id: true, passwordEncrypted: true } });
      if (!providers.length && !cards.length && !smtp.length) return { mode: 'aucun' as const };
      let key: Buffer;
      let securite: Record<string, unknown>;
      if (o.code) {
        const salt = randomBytes(16);
        key = Buffer.from(await hashRaw(o.code, { salt, memoryCost: SHARE_KDF.memoryCost, timeCost: SHARE_KDF.timeCost, parallelism: SHARE_KDF.parallelism, outputLen: SHARE_KDF.outputLen, algorithm: 2 }));
        securite = { mode: 'code', kdf: { ...SHARE_KDF, salt: salt.toString('hex') }, verification: seal(key, 'RISE-COCKPIT') };
      } else {
        key = randomBytes(32);
        securite = { mode: 'cle', cle: key.toString('hex') };
      }
      for (const p of providers) await db.provider.update({ where: { id: p.id }, data: { keyCipher: seal(key, decryptSecret(p.keyCipher!)) } });
      for (const c of cards) await db.apiCard.update({ where: { id: c.id }, data: { keyEncrypted: seal(key, decryptSecret(c.keyEncrypted!)) } });
      for (const s of smtp) await db.smtpSettings.update({ where: { id: s.id }, data: { passwordEncrypted: seal(key, decryptSecret(s.passwordEncrypted!)) } });
      key.fill(0);
      return securite;
    } finally {
      await db.$disconnect();
    }
  }

  /** Fichiers déposés : persona toujours ; Base de connaissance, guide et formats si inclus ; dossiers de projet filtrés. */
  async copyFiles(o: ShareBuildOptions, dest: string) {
    const root = path.resolve(config.storageDir);
    if (!existsSync(root)) return;
    const allowed = new Set<string>(['persona', 'snapshots', 'assistant', 'reports', ...FILE_DIRS.formats, ...(o.files ? [...FILE_DIRS.kb, ...FILE_DIRS.guide] : [])]);
    const projects = new Set(o.data === 'current' ? o.projects : []);
    for (const dir of readdirSync(root)) {
      if (!allowed.has(dir)) continue;
      const src = path.join(root, dir);
      if (PROJECT_DIRS.includes(dir)) {
        for (const p of readdirSync(src)) if (projects.has(p)) await fs.cp(path.join(src, p), path.join(dest, dir, p), { recursive: true });
      } else await fs.cp(src, path.join(dest, dir), { recursive: true });
    }
  }

  private async sql(dbName: string, sql: string) {
    const bin = this.paths().pgBin;
    await run(path.join(bin, 'psql.exe'), ['-q', '-v', 'ON_ERROR_STOP=1', '-d', dbName, '-c', `SET session_replication_role = replica; SET rise.allow_audit_purge = 'on'; ${sql}`], { env: this.env(), windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  }
}

/** Lignes orphelines : enfants dont le parent (clé étrangère à une colonne) n'existe plus. */
const ORPHANS_SQL = `
  DO $$ DECLARE r record; BEGIN
    FOR r IN SELECT c.conrelid::regclass AS child, a.attname AS col, c.confrelid::regclass AS parent, af.attname AS pcol
             FROM pg_constraint c
             JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
             JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
             WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1 AND c.connamespace = 'public'::regnamespace LOOP
      EXECUTE format('DELETE FROM %s x WHERE x.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %s p WHERE p.%I = x.%I)', r.child, r.col, r.parent, r.pcol, r.col);
    END LOOP;
  END $$;`;

/** Copie d'un dossier par robocopy (codes de sortie 0 à 7 = succès). */
function mirror(src: string, dst: string, extra: string[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('robocopy', [src, dst, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1', ...extra], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err) => {
      const code = err ? (typeof (err as any).code === 'number' ? (err as any).code : 99) : 0;
      if (code >= 8) reject(new Error(`Copie impossible : ${src} (robocopy ${code})`));
      else resolve();
    });
  });
}

/** Chiffrement AES-256-GCM au format de `core/crypto.ts` : base64(iv).base64(tag).base64(chiffré). */
export function seal(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}
