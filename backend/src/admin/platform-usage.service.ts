import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { JobsService } from '../core/jobs.service';
import { badRequest, forbidden } from '../core/errors';
import { IDLE_MINUTES, SERVER_IDLE_GRACE_MINUTES } from '../core/auth/policy';
import {
  AGGREGATE_FRESH_MS, AGGREGATE_LOOKBACK_HOURS, AGGREGATE_STALE_MS, BREAKDOWN_MAX, COST_ALERT_PCT_DEFAULT, EVENT_MAX_AGE_MINUTES, FEATURE_IDS, FEATURE_OF_FUNCTION,
  Gran, IDLE_MINUTES_DEFAULT, UNUSUAL_FACTOR_DEFAULT, USAGE_EVENTS_RETENTION_DAYS, USAGE_FEATURES, USERS_PAGE_SIZE, eur, evolution, featureName, hours,
  isoAdd, parisDate, parisMidnight, periodOf, Period, pseudonym, unusualFlags,
  AUTOMATED_DEVICE_PATTERN,
} from '../domain/platform-usage';

/** Filtres communs des routes (`gran`, `start`, `scope`, `teams[]`, `users[]`, `feature`, `provider`, `model`, `compare`). */
export interface UsageQuery {
  gran: Gran;
  start: string;
  scope: 'plat' | 'team' | 'user';
  teams: string[];
  /** Projets (identifiants) : temps actif et IA du projet, utilisateurs qui y ont accès (08/10/2026). */
  projects: string[];
  users: string[];
  feature: string | null;
  provider: string | null;
  model: string | null;
  compare: boolean;
}
/** Droits Console de l'administrateur qui consulte (côté serveur). */
export interface UsageRights {
  costs: boolean;
  individual: boolean;
}
interface Acc {
  id: string;
  name: string;
  team: string;
  rank: number;
  /** Projets où le compte a accès (personne du référentiel, rattachement, habilitation). */
  projects: Set<string>;
}
interface Totals {
  activeSec: number;
  connectedSec: number;
  logins: number;
  events: number;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  costEur: number;
}
type Row = Totals & Record<string, unknown>;

/** Compte fictif des appels d'IA sans utilisateur (tâches de fond, appels antérieurs au 08/10/2026). */
export const SYSTEM_ACCOUNT = '';
export const SYSTEM_NAME = 'Tâches automatiques';
/** Appels d'IA des comptes de démonstration (10/10/2026) : une seule ligne, pour que la somme des lignes égale le total. */
export const DEMO_ACCOUNT = '__demo__';
export const DEMO_NAME = 'Tests et démonstration';
export const NO_TEAM = 'Sans équipe';

const ZERO: Totals = { activeSec: 0, connectedSec: 0, logins: 0, events: 0, requests: 0, tokensIn: 0, tokensOut: 0, costEur: 0 };
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
/** Horodatage naïf UTC accepté par une colonne `timestamp(3)` de Prisma. */
const ts = (d: Date) => d.toISOString().replace('T', ' ').replace('Z', '');
const floorHour = (d: Date) => new Date(Math.floor(d.getTime() / 3_600_000) * 3_600_000);
const ceilHour = (d: Date) => new Date(Math.ceil(d.getTime() / 3_600_000) * 3_600_000);

/**
 * Consommation et coûts · Console › Accès (brief du 08/10/2026). Collecte (événements d'usage, sessions, journal des
 * appels d'IA), agrégats horaires et journaliers précalculés, lectures filtrées et droits appliqués côté serveur.
 */
@Injectable()
export class PlatformUsageService implements OnModuleInit {
  private running: Promise<void> | null = null;
  private freshAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register('usage.aggregate', () => this.aggregate());
    this.jobs.schedule('usage.aggregate', '*/5 * * * *');
    this.jobs.register('usage.purge', () => this.purge());
    this.jobs.schedule('usage.purge', '35 3 * * *');
  }

  // ───────────── Réglages ─────────────

  async settings() {
    const s = (await this.prisma.usageSettings.findUnique({ where: { id: 'default' } })) ?? (await this.prisma.usageSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} }));
    return { idleMinutes: s.idleMinutes ?? IDLE_MINUTES_DEFAULT, unusualFactor: s.unusualFactor ?? UNUSUAL_FACTOR_DEFAULT, costAlertPct: s.costAlertPct ?? COST_ALERT_PCT_DEFAULT, aggregatedUntil: s.aggregatedUntil };
  }

  /** Modifie les réglages ; un nouveau délai d'inactivité recalcule tout l'historique (événements conservés). */
  async saveSettings(input: { idleMinutes?: number; unusualFactor?: number; costAlertPct?: number }) {
    const cur = await this.settings();
    await this.prisma.usageSettings.update({ where: { id: 'default' }, data: { ...input, ...(input.idleMinutes !== undefined && input.idleMinutes !== cur.idleMinutes ? { aggregatedUntil: null } : {}) } });
    this.freshAt = 0;
    await this.aggregate();
    return this.settings();
  }

  // ───────────── Collecte ─────────────

  /** Événements d'usage envoyés par un écran (interactions de l'utilisateur). Fonctionnalité inconnue ou date hors délai : ignoré. */
  async record(actor: { accountId: string; sessionId: string }, events: Array<{ at: string; feature: string; kind: string }>, project?: string | null) {
    const now = Date.now();
    // Projet ouvert dans le Cockpit (code ou identifiant) ; inconnu : événements sans projet.
    const pr = project ? await this.prisma.project.findFirst({ where: { OR: [{ id: project }, { code: project }] }, select: { id: true } }) : null;
    const rows = events
      .map((e) => ({ at: new Date(e.at), feature: e.feature, kind: String(e.kind || 'interaction').slice(0, 20) }))
      .filter((e) => !Number.isNaN(e.at.getTime()) && FEATURE_IDS.includes(e.feature) && e.at.getTime() <= now + 60_000 && e.at.getTime() >= now - EVENT_MAX_AGE_MINUTES * 60_000)
      .map((e) => ({ ...e, at: new Date(Math.min(e.at.getTime(), now)), accountId: actor.accountId, sessionId: actor.sessionId, projectId: pr?.id ?? null }));
    if (rows.length) await this.prisma.usageEvent.createMany({ data: rows });
    return { recorded: rows.length };
  }

  async purge() {
    await this.prisma.usageEvent.deleteMany({ where: { at: { lt: new Date(Date.now() - USAGE_EVENTS_RETENTION_DAYS * 86_400_000) } } });
  }

  // ───────────── Agrégats ─────────────

  /**
   * Agrégats à jour avant une lecture : moins de `AGGREGATE_FRESH_MS`, rien ; moins de `AGGREGATE_STALE_MS` (cadence
   * de la tâche de fond), relecture lancée sans faire attendre la réponse ; au-delà (tâches arrêtées), la réponse attend.
   */
  async ensureFresh() {
    const age = Date.now() - this.freshAt;
    if (age < AGGREGATE_FRESH_MS) return;
    if (age < AGGREGATE_STALE_MS) { this.aggregate().catch(() => {}); return; }
    await this.aggregate();
  }

  /** Recalcul incrémental : heures depuis le dernier passage (moins une marge), puis jours touchés. Un seul calcul à la fois. */
  aggregate(): Promise<void> {
    if (!this.running) this.running = this.doAggregate().finally(() => { this.running = null; });
    return this.running;
  }

  private async doAggregate() {
    const st = await this.settings();
    const now = new Date();
    let from: Date;
    if (st.aggregatedUntil) from = floorHour(new Date(Math.min(st.aggregatedUntil.getTime(), now.getTime()) - AGGREGATE_LOOKBACK_HOURS * 3_600_000));
    else {
      // Premier calcul (ou délai d'inactivité modifié) : depuis la plus ancienne donnée conservée.
      const [m] = await this.prisma.$queryRawUnsafe<Array<{ m: Date | null }>>(
        `SELECT LEAST((SELECT MIN(at) FROM usage_events), (SELECT MIN("createdAt") FROM "AuthSession"), (SELECT MIN(at) FROM "UsageRecord")) AS m`,
      );
      from = floorHour(m?.m ? new Date(m.m) : now);
    }
    const to = ceilHour(new Date(now.getTime() + 1));
    await this.aggregateRange(from, to, now, st.idleMinutes);
    await this.prisma.usageSettings.update({ where: { id: 'default' }, data: { aggregatedUntil: now } });
    this.freshAt = Date.now();
  }

  /** Recalcule les heures [from, to) et les jours de Paris qu'elles touchent, dans une transaction (lecture jamais partielle). */
  async aggregateRange(from: Date, to: Date, now: Date, idleMinutes: number) {
    const idle = idleMinutes * 60;
    const fnCase = 'CASE "functionId" ' + Object.entries(FEATURE_OF_FUNCTION).map(([f, v]) => `WHEN '${f}' THEN '${v}'`).join(' ') + " ELSE 'projets' END";
    const appIdle = IDLE_MINUTES.APP + SERVER_IDLE_GRACE_MINUTES, adminIdle = IDLE_MINUTES.ADMIN + SERVER_IDLE_GRACE_MINUTES;
    const d0 = parisDate(from), d1 = parisDate(new Date(to.getTime() - 1));
    const p = [ts(from), ts(to), idle, ts(now)];
    await this.prisma.$transaction(async (tx) => {
      // Un seul calcul à la fois, tous processus confondus.
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(73157)`);
      await tx.$executeRawUnsafe(`DELETE FROM usage_agg_hour WHERE bucket >= $1::timestamp AND bucket < $2::timestamp`, p[0], p[1]);
      await tx.$executeRawUnsafe(
        `
WITH demo_acc AS (SELECT id FROM "Account" WHERE demo),
-- Temps, connexions, événements : usage réel seulement (10/10/2026), ni comptes de démonstration, ni sessions d'outils automatiques.
-- Coûts d'IA : tous les appels réels, comme Consommation et coûts › IA (source de vérité), sans les appels simulés.
real_s AS (
  SELECT * FROM "AuthSession"
  WHERE "accountId" NOT IN (SELECT id FROM demo_acc) AND COALESCE(device, '') !~ '${AUTOMATED_DEVICE_PATTERN}'
),
se AS (
  SELECT id, COALESCE("revokedAt", LEAST($4::timestamp, "lastSeenAt" + (CASE surface WHEN 'ADMIN' THEN ${adminIdle} ELSE ${appIdle} END) * interval '1 minute')) AS en
  FROM real_s
),
ev AS (
  SELECT e.at, e."accountId", e.feature, e."projectId", se.en,
         LEAD(e.at) OVER (PARTITION BY e."accountId" ORDER BY e.at) AS nx
  FROM usage_events e LEFT JOIN se ON se.id = e."sessionId"
  WHERE e.at >= $1::timestamp AND e.at < $2::timestamp + make_interval(secs => $3)
    AND e."accountId" NOT IN (SELECT id FROM demo_acc)
    AND (e."sessionId" IS NULL OR e."sessionId" NOT IN (SELECT id FROM "AuthSession" WHERE COALESCE(device, '') ~ '${AUTOMATED_DEVICE_PATTERN}'))
),
act AS (
  SELECT date_trunc('hour', at) AS bucket, "accountId" AS acc, feature, '' AS provider, '' AS model,
         GREATEST(0, LEAST($3::float8, EXTRACT(EPOCH FROM (COALESCE(nx, $4::timestamp) - at)), COALESCE(EXTRACT(EPOCH FROM (en - at)), $3::float8))) AS a,
         0::float8 AS c, 0 AS l, 1 AS e, 0 AS r, 0::bigint AS ti, 0::bigint AS tou, 0::float8 AS cost, COALESCE("projectId", '') AS project
  FROM ev WHERE at >= $1::timestamp AND at < $2::timestamp
),
s0 AS (
  SELECT s."accountId" AS acc, GREATEST(s."createdAt", $1::timestamp) AS st, LEAST(GREATEST(s."createdAt", se.en), $2::timestamp) AS en
  FROM real_s s JOIN se ON se.id = s.id
  WHERE s."createdAt" < $2::timestamp AND se.en > $1::timestamp
),
s1 AS (SELECT * FROM s0 WHERE en > st),
s2 AS (SELECT *, MAX(en) OVER (PARTITION BY acc ORDER BY st, en ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS pe FROM s1),
s3 AS (SELECT *, SUM(CASE WHEN pe IS NULL OR st > pe THEN 1 ELSE 0 END) OVER (PARTITION BY acc ORDER BY st, en) AS grp FROM s2),
isl AS (SELECT acc, MIN(st) AS st, MAX(en) AS en FROM s3 GROUP BY acc, grp),
con AS (
  SELECT h AS bucket, acc, '' AS feature, '' AS provider, '' AS model, 0::float8 AS a,
         EXTRACT(EPOCH FROM (LEAST(en, h + interval '1 hour') - GREATEST(st, h)))::float8 AS c, 0 AS l, 0 AS e, 0 AS r, 0::bigint AS ti, 0::bigint AS tou, 0::float8 AS cost, '' AS project
  FROM isl, generate_series(date_trunc('hour', st), en - interval '1 millisecond', interval '1 hour') AS h
),
lg AS (
  SELECT date_trunc('hour', "createdAt") AS bucket, "accountId" AS acc, '' AS feature, '' AS provider, '' AS model, 0::float8 AS a, 0::float8 AS c, 1 AS l, 0 AS e, 0 AS r, 0::bigint AS ti, 0::bigint AS tou, 0::float8 AS cost, '' AS project
  FROM real_s WHERE "createdAt" >= $1::timestamp AND "createdAt" < $2::timestamp
),
ai AS (
  SELECT date_trunc('hour', at) AS bucket, CASE WHEN "accountId" IN (SELECT id FROM demo_acc) THEN '${DEMO_ACCOUNT}' ELSE COALESCE("accountId", '') END AS acc, COALESCE(feature, ${fnCase}) AS feature, "providerId" AS provider, "modelId" AS model,
         0::float8 AS a, 0::float8 AS c, 0 AS l, 0 AS e, 1 AS r, "tokensIn"::bigint AS ti, "tokensOut"::bigint AS tou, "costEur"::float8 AS cost, COALESCE("projectId", '') AS project
  FROM "UsageRecord" WHERE at >= $1::timestamp AND at < $2::timestamp
    AND NOT simulated
)
INSERT INTO usage_agg_hour (bucket, "accountId", feature, provider, model, project, "activeSec", "connectedSec", logins, events, requests, "tokensIn", "tokensOut", "costEur")
SELECT bucket, acc, feature, provider, model, project, SUM(a), SUM(c), SUM(l), SUM(e), SUM(r), SUM(ti), SUM(tou), SUM(cost)
FROM (SELECT * FROM act UNION ALL SELECT * FROM con UNION ALL SELECT * FROM lg UNION ALL SELECT * FROM ai) x
WHERE bucket >= $1::timestamp AND bucket < $2::timestamp
GROUP BY bucket, acc, feature, provider, model, project`,
        ...p,
      );
      // Jours de Paris touchés, recalculés depuis leurs heures.
      const mid = (d: string) => `((DATE '${d}')::timestamp AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'UTC'`;
      await tx.$executeRawUnsafe(`DELETE FROM usage_agg_day WHERE bucket >= $1::date AND bucket <= $2::date`, d0, d1);
      await tx.$executeRawUnsafe(
        `INSERT INTO usage_agg_day (bucket, "accountId", feature, provider, model, project, "activeSec", "connectedSec", logins, events, requests, "tokensIn", "tokensOut", "costEur")
         SELECT ((bucket AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris')::date, "accountId", feature, provider, model, project,
                SUM("activeSec"), SUM("connectedSec"), SUM(logins), SUM(events), SUM(requests), SUM("tokensIn"), SUM("tokensOut"), SUM("costEur")
         FROM usage_agg_hour WHERE bucket >= ${mid(d0)} AND bucket < ${mid(isoAdd(d1, 1))}
         GROUP BY 1, 2, 3, 4, 5, 6`,
      );
    }, { timeout: 600_000, maxWait: 60_000 });
  }

  // ───────────── Comptes, équipes, droits ─────────────

  async rightsOf(accountId: string): Promise<UsageRights> {
    const g = await this.prisma.adminGrant.findUnique({ where: { accountId } });
    return { costs: g?.seeCosts ?? false, individual: g?.seeIndividual ?? false };
  }

  /** Comptes avec leur équipe (celle de leur personne du référentiel) et leur rang stable (pseudonyme). */
  private accCache: { at: number; map: Map<string, Acc> } | null = null;
  /** Comptes (mis en cache 30 s : chaque écran fait plusieurs lectures à la suite). */
  private async accounts(): Promise<Map<string, Acc>> {
    if (this.accCache && Date.now() - this.accCache.at < 30_000) return this.accCache.map;
    const map = await this.loadAccounts();
    this.accCache = { at: Date.now(), map };
    return map;
  }

  private async loadAccounts(): Promise<Map<string, Acc>> {
    // Comptes du jeu de démonstration exclus (usage réel seulement, 10/10/2026).
    const accounts = await this.prisma.account.findMany({ where: { demo: false }, select: { id: true, fullName: true, email: true, personId: true, createdAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const persons = await this.prisma.person.findMany({ where: { OR: [{ id: { in: accounts.map((a) => a.personId).filter((x): x is string => !!x) } }, { email: { in: accounts.map((a) => a.email), mode: 'insensitive' } }] }, select: { id: true, email: true, teamId: true, projectId: true, project: { select: { createdAt: true } } } });
    const links = await this.prisma.accountProject.findMany({ select: { accountId: true, projectId: true } });
    const habs = await this.prisma.habilitation.findMany({ select: { accountId: true, personId: true, projectId: true } });
    const teams = new Map((await this.prisma.team.findMany({ select: { id: true, name: true } })).map((t) => [t.id, t.name]));
    const out = new Map<string, Acc>();
    accounts.forEach((a, i) => {
      const own = persons.filter((p) => p.id === a.personId || p.email.toLowerCase() === a.email.toLowerCase()).sort((x, y) => (x.id === a.personId ? -1 : y.id === a.personId ? 1 : x.project.createdAt.getTime() - y.project.createdAt.getTime()));
      const team = own.map((p) => (p.teamId ? teams.get(p.teamId) : null)).find(Boolean) ?? NO_TEAM;
      const pids = new Set<string>([...own.map((p) => p.projectId), ...links.filter((l) => l.accountId === a.id).map((l) => l.projectId), ...habs.filter((h) => h.accountId === a.id || (h.personId && own.some((p) => p.id === h.personId))).map((h) => h.projectId)]);
      out.set(a.id, { id: a.id, name: a.fullName, team, rank: i, projects: pids });
    });
    out.set(SYSTEM_ACCOUNT, { id: SYSTEM_ACCOUNT, name: SYSTEM_NAME, team: SYSTEM_NAME, rank: -1, projects: new Set() });
    out.set(DEMO_ACCOUNT, { id: DEMO_ACCOUNT, name: DEMO_NAME, team: DEMO_NAME, rank: -2, projects: new Set() });
    return out;
  }

  private nameOf(a: Acc, rights: UsageRights) {
    return rights.individual || a.id === SYSTEM_ACCOUNT || a.id === DEMO_ACCOUNT ? a.name : pseudonym(a.rank);
  }

  /** Comptes retenus par les filtres (null : tous, y compris les appels sans utilisateur). */
  private selection(q: UsageQuery, accs: Map<string, Acc>): string[] | null {
    if (!q.teams.length && !q.users.length && !q.projects.length) return null;
    const ids = [...accs.values()].filter((a) => a.id !== SYSTEM_ACCOUNT && a.id !== DEMO_ACCOUNT && (!q.teams.length || q.teams.includes(a.team)) && (!q.users.length || q.users.includes(a.id)) && (!q.projects.length || q.projects.some((p) => a.projects.has(p)))).map((a) => a.id);
    // Projet seul : les appels d'IA sans utilisateur faits pour ce projet comptent aussi.
    return !q.teams.length && !q.users.length ? ids.concat([SYSTEM_ACCOUNT, DEMO_ACCOUNT]) : ids;
  }

  /** Contrôle des filtres selon les droits ; niveau Équipe sans équipe choisie : l'équipe au plus fort temps actif. */
  private async check(q: UsageQuery, rights: UsageRights): Promise<UsageQuery> {
    if (!rights.individual && (q.scope === 'user' || q.users.length)) throw forbidden('Données individuelles : droit « Voir les données individuelles » requis');
    if (q.feature && !FEATURE_IDS.includes(q.feature)) throw badRequest('Fonctionnalité inconnue', { feature: q.feature });
    return q;
  }

  // ───────────── Lectures ─────────────

  private range(per: Period, prev = false) {
    const p = prev ? periodOf(per.gran, per.prevStart) : per;
    if (p.gran === 'jour') return { table: 'usage_agg_hour', from: ts(parisMidnight(p.from)), to: ts(parisMidnight(isoAdd(p.to, 1))), cast: 'timestamp', inclusive: false, period: p };
    return { table: 'usage_agg_day', from: p.from, to: p.to, cast: 'date', inclusive: true, period: p };
  }

  /** Somme des mesures, regroupées par `group` (colonnes SQL) ; filtres de la page appliqués (fournisseur et modèle : IA seule). */
  private async sums(q: UsageQuery, sel: string[] | null, r: ReturnType<PlatformUsageService['range']>, group: string[], extra = '', where = ''): Promise<Row[]> {
    const params: unknown[] = [r.from, r.to, q.feature, q.provider, q.model, sel, q.projects.length ? q.projects : null];
    const time = `provider = '' AND feature <> '' AND ($3::text IS NULL OR feature = $3) AND ($7::text[] IS NULL OR project = ANY($7::text[]))`;
    const ses = `provider = '' AND feature = ''`;
    const ai = `provider <> '' AND ($3::text IS NULL OR feature = $3) AND ($4::text IS NULL OR provider = $4) AND ($5::text IS NULL OR model = $5) AND ($7::text[] IS NULL OR project = ANY($7::text[]))`;
    const g = group.length ? group.map((c, i) => `${c} AS g${i}`).join(', ') + ',' : '';
    const sql = `SELECT ${g}
      SUM("activeSec") FILTER (WHERE ${time}) AS "activeSec", SUM(events) FILTER (WHERE ${time}) AS events,
      SUM("connectedSec") FILTER (WHERE ${ses}) AS "connectedSec", SUM(logins) FILTER (WHERE ${ses}) AS logins,
      SUM(requests) FILTER (WHERE ${ai}) AS requests, SUM("tokensIn") FILTER (WHERE ${ai}) AS "tokensIn", SUM("tokensOut") FILTER (WHERE ${ai}) AS "tokensOut", SUM("costEur") FILTER (WHERE ${ai}) AS "costEur"
      ${extra}
      FROM ${r.table} WHERE bucket >= $1::${r.cast} AND bucket ${r.inclusive ? '<=' : '<'} $2::${r.cast} AND ($6::text[] IS NULL OR "accountId" = ANY($6::text[])) ${where}
      ${group.length ? 'GROUP BY ' + group.map((_, i) => `g${i}`).join(', ') : ''}`;
    const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);
    return rows.map((x) => ({ ...x, activeSec: num(x.activeSec), events: num(x.events), connectedSec: num(x.connectedSec), logins: num(x.logins), requests: num(x.requests), tokensIn: num(x.tokensIn), tokensOut: num(x.tokensOut), costEur: num(x.costEur) }));
  }

  private async context(q0: UsageQuery, rights: UsageRights) {
    const q = await this.check(q0, rights);
    await this.ensureFresh();
    const [accs, st] = await Promise.all([this.accounts(), this.settings()]);
    const per = periodOf(q.gran, q.start);
    return { q, accs, per, sel: this.selection(q, accs), st };
  }

  private totals(t: Totals, rights: UsageRights, extra: { activeUsers: number; providers: number; mainModel: string | null }) {
    const out: Record<string, unknown> = {
      activeH: hours(t.activeSec), connectedH: hours(t.connectedSec), activityRate: t.connectedSec > 0 ? Math.round((t.activeSec / t.connectedSec) * 1000) / 1000 : null,
      sessions: t.logins, avgSessionMin: t.logins > 0 ? Math.round(t.activeSec / 60 / t.logins) : null, activeUsers: extra.activeUsers, events: t.events,
      requests: t.requests, tokensIn: t.tokensIn, tokensOut: t.tokensOut, providers: extra.providers, mainModel: extra.mainModel,
    };
    if (rights.costs) Object.assign(out, { costEur: eur(t.costEur), costPerActiveH: t.activeSec > 0 ? eur(t.costEur / (t.activeSec / 3600)) : null });
    return out;
  }

  private async extras(q: UsageQuery, sel: string[] | null, r: ReturnType<PlatformUsageService['range']>, rights: UsageRights) {
    const [[u], models] = await Promise.all([this.sums(q, sel, r, [], `, COUNT(DISTINCT "accountId") FILTER (WHERE provider = '' AND feature <> '' AND ($3::text IS NULL OR feature = $3) AND ($7::text[] IS NULL OR project = ANY($7::text[])) AND "activeSec" > 0 AND "accountId" <> '') AS users,
      COUNT(DISTINCT provider) FILTER (WHERE provider <> '' AND ($3::text IS NULL OR feature = $3) AND ($4::text IS NULL OR provider = $4) AND ($5::text IS NULL OR model = $5) AND ($7::text[] IS NULL OR project = ANY($7::text[]))) AS provs`), this.sums(q, sel, r, ['model'], '', `AND provider <> ''`)]);
    const top = models.filter((m) => m.g0 && m.requests > 0).sort((a, b) => (rights.costs ? b.costEur - a.costEur : 0) || b.requests - a.requests)[0];
    const name = top ? (await this.prisma.aiModel.findUnique({ where: { id: String(top.g0) }, select: { name: true } }))?.name ?? String(top.g0) : null;
    return { totals: u ?? { ...ZERO }, activeUsers: num(u?.users), providers: num(u?.provs), mainModel: name };
  }

  /** `GET …/summary` : totaux de la période et de la période précédente. */
  async summary(q0: UsageQuery, rights: UsageRights) {
    const { q, per, sel, st } = await this.context(q0, rights);
    const [cur, prev] = await Promise.all([this.extras(q, sel, this.range(per), rights), this.extras(q, sel, this.range(per, true), rights)]);
    return {
      period: this.periodView(per), rights, settings: { unusualFactor: st.unusualFactor, costAlertPct: st.costAlertPct, idleMinutes: st.idleMinutes },
      current: this.totals(cur.totals as Totals, rights, cur),
      previous: this.totals(prev.totals as Totals, rights, prev),
    };
  }

  private periodView(per: Period) {
    return { gran: per.gran, start: per.start, from: per.from, to: per.to, label: per.label, prevStart: per.prevStart, vsLabel: per.vsLabel, nextStart: periodOf(per.gran, per.gran === 'jour' ? isoAdd(per.start, 1) : per.gran === 'semaine' ? isoAdd(per.start, 7) : isoAdd(per.to, 1)).start };
  }

  private byBucket(rows: Row[], per: Period) {
    const m = new Map(rows.map((x) => [this.bucketKey(x.g0, per), x]));
    return per.buckets.map((b) => m.get(b.key) ?? { ...ZERO });
  }

  private bucketKey(v: unknown, per: Period) {
    const d = v instanceof Date ? v : new Date(String(v));
    return per.gran === 'jour' ? new Date(d.getTime()).toISOString() : d.toISOString().slice(0, 10);
  }

  /** `GET …/series` : un point par jour (Semaine, Mois) ou par heure (Jour), repères N-1 et hausses inhabituelles. */
  async series(q0: UsageQuery, rights: UsageRights) {
    const { q, per, sel, st } = await this.context(q0, rights);
    const r = this.range(per), rp = this.range(per, true);
    const [c0, p0] = await Promise.all([this.sums(q, sel, r, ['bucket']), this.sums(q, sel, rp, ['bucket'])]);
    const cur = this.byBucket(c0, per), prev = this.byBucket(p0, rp.period);
    const flags = rights.costs ? unusualFlags(cur.map((x) => x.costEur), per.buckets.map((b) => b.working), st.unusualFactor) : cur.map(() => false);
    return {
      period: this.periodView(per),
      points: per.buckets.map((b, i) => {
        const x = cur[i], p = prev[i];
        const o: Record<string, unknown> = { t: b.key, label: b.full, working: b.working, activeH: hours(x.activeSec), connectedH: hours(x.connectedSec), unusual: flags[i] };
        if (rights.costs) o.costEur = eur(x.costEur);
        if (q.compare) {
          o.prevActiveH = p ? hours(p.activeSec) : null;
          if (rights.costs) o.prevCostEur = p ? eur(p.costEur) : null;
        }
        return o;
      }),
    };
  }

  /** `GET …/breakdown?by=feature|team|user` : temps actif et coût par entité, période précédente. */
  async breakdown(q0: UsageQuery, rights: UsageRights, by: 'feature' | 'team' | 'user') {
    const { q, accs, per, sel } = await this.context(q0, rights);
    const grp = by === 'feature' ? ['feature'] : ['"accountId"'];
    const [cur, prev] = await Promise.all([this.sums(q, sel, this.range(per), grp), this.sums(q, sel, this.range(per, true), grp)]);
    const keyOf = (x: Row) => (by === 'feature' ? String(x.g0) : by === 'team' ? accs.get(String(x.g0))?.team ?? NO_TEAM : String(x.g0));
    const fold = (rows: Row[]) => { const m = new Map<string, Totals>(); for (const x of rows) { const k = keyOf(x); if (by === 'feature' && !k) continue; const t = m.get(k) ?? { ...ZERO }; for (const f of Object.keys(ZERO) as Array<keyof Totals>) t[f] += x[f] as number; m.set(k, t); } return m; };
    const C = fold(cur), P = fold(prev);
    const nameOf = (k: string) => (by === 'feature' ? featureName(k) : by === 'team' ? k : this.nameOf(accs.get(k) ?? { id: k, name: k, team: NO_TEAM, rank: 0, projects: new Set<string>() }, rights));
    const keys = by === 'feature' ? USAGE_FEATURES.map((f) => f.id as string).filter((k) => C.has(k) || P.has(k)) : [...C.keys()];
    const all = [...C.values()].reduce((a, t) => ({ s: a.s + t.activeSec, c: a.c + t.costEur }), { s: 0, c: 0 });
    const rows = keys
      .map((k) => {
        const c = C.get(k) ?? { ...ZERO }, p = P.get(k) ?? { ...ZERO };
        const o: Record<string, unknown> = { id: k, name: nameOf(k), activeH: hours(c.activeSec), prevActiveH: hours(p.activeSec) };
        if (rights.costs) Object.assign(o, { costEur: eur(c.costEur), prevCostEur: eur(p.costEur), costPerActiveH: c.activeSec > 0 ? eur(c.costEur / (c.activeSec / 3600)) : null });
        return o;
      })
      .filter((o) => (o.activeH as number) > 0 || ((o.costEur as number) ?? 0) > 0 || (o.prevActiveH as number) > 0)
      .sort((a, b) => (b.activeH as number) - (a.activeH as number))
      .slice(0, by === 'feature' ? undefined : BREAKDOWN_MAX);
    return { by, rows, ...(rights.costs ? { avgCostPerActiveH: all.s > 0 ? eur(all.c / (all.s / 3600)) : null } : {}) };
  }

  /** Lignes du tableau (toutes, triées, filtrées) ; `users()` et l'export en prennent une page ou tout. */
  private async userRows(q0: UsageQuery, rights: UsageRights, sort: string, dir: 'asc' | 'desc', text: string) {
    const { q, accs, per, sel, st } = await this.context(q0, rights);
    const [cur, prev] = await Promise.all([this.sums(q, sel, this.range(per), ['"accountId"']), this.sums(q, sel, this.range(per, true), ['"accountId"'])]);
    const P = new Map(prev.map((x) => [String(x.g0), x]));
    const th = st.costAlertPct / 100;
    let rows = cur
      .filter((x) => x.activeSec > 0 || x.connectedSec > 0 || x.requests > 0)
      .map((x) => {
        const a = accs.get(String(x.g0)) ?? { id: String(x.g0), name: String(x.g0), team: NO_TEAM, rank: 0, projects: new Set<string>() };
        const p = P.get(a.id), ev = evolution(x.costEur, p?.costEur ?? 0);
        const o: Record<string, unknown> = {
          id: rights.individual && a.id !== SYSTEM_ACCOUNT && a.id !== DEMO_ACCOUNT ? a.id : null, key: a.id, name: this.nameOf(a, rights), team: a.id === SYSTEM_ACCOUNT || a.id === DEMO_ACCOUNT ? '—' : a.team,
          activeH: hours(x.activeSec), connectedH: hours(x.connectedSec), sessions: x.logins, avgSessionMin: x.logins > 0 ? Math.round(x.activeSec / 60 / x.logins) : null,
          requests: x.requests, tokensIn: x.tokensIn, tokensOut: x.tokensOut,
        };
        if (rights.costs) Object.assign(o, { costEur: eur(x.costEur), prevCostEur: eur(p?.costEur ?? 0), costEvolution: ev === null ? null : Math.round(ev * 1000) / 1000, flag: ev !== null && ev >= th });
        else o.flag = false;
        return o;
      });
    const t = text.trim().toLowerCase();
    if (t) rows = rows.filter((r) => (String(r.name) + ' ' + String(r.team)).toLowerCase().includes(t));
    const key: Record<string, string> = { name: 'name', active: 'activeH', sessions: 'sessions', avgSession: 'avgSessionMin', requests: 'requests', tokens: 'tokensIn', cost: 'costEur', costEvolution: 'costEvolution' };
    let k = key[sort] ?? 'activeH';
    if (!rights.costs && (k === 'costEur' || k === 'costEvolution')) k = 'activeH';
    const sg = dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const x = a[k], y = b[k];
      if (typeof x === 'string' || typeof y === 'string') return String(x ?? '').localeCompare(String(y ?? ''), 'fr') * sg;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return ((x as number) - (y as number)) * sg || String(a.name).localeCompare(String(b.name), 'fr');
    });
    return { q, per, sel, rows, sortKey: k };
  }

  /** `GET …/users?sort=&dir=&q=&page=` : tableau détaillé, paginé côté serveur, avec tendance par ligne. */
  async users(q0: UsageQuery, rights: UsageRights, sort: string, dir: 'asc' | 'desc', text: string, page: number) {
    const { q, per, rows } = await this.userRows(q0, rights, sort, dir, text);
    const pages = Math.max(1, Math.ceil(rows.length / USERS_PAGE_SIZE));
    const pg = Math.min(Math.max(1, page), pages);
    const slice = rows.slice((pg - 1) * USERS_PAGE_SIZE, pg * USERS_PAGE_SIZE);
    // Tendance : coût par point de la période (temps actif si les coûts sont masqués).
    const ids = slice.map((r) => String(r.key));
    const trend = ids.length ? await this.sums(q, ids, this.range(per), ['"accountId"', 'bucket']) : [];
    const T = new Map<string, Map<string, Row>>();
    for (const x of trend) { const k = String(x.g0); if (!T.has(k)) T.set(k, new Map()); T.get(k)!.set(this.bucketKey(x.g1, per), x); }
    return {
      total: rows.length, page: pg, pages, pageSize: USERS_PAGE_SIZE,
      rows: slice.map(({ key, ...r }) => ({ ...r, trend: per.buckets.map((b) => { const x = T.get(String(key))?.get(b.key); return x ? (rights.costs ? eur(x.costEur) : hours(x.activeSec)) : 0; }) })),
    };
  }

  /** `GET …/export.csv` : la sélection exacte (filtres, filtre texte, tri), toutes les lignes, mêmes droits. */
  async exportRows(q0: UsageQuery, rights: UsageRights, sort: string, dir: 'asc' | 'desc', text: string) {
    const { per, rows } = await this.userRows(q0, rights, sort, dir, text);
    const head = ['Utilisateur', 'Équipe', 'Temps actif (h)', 'Temps connecté (h)', 'Sessions', 'Durée moyenne (min)', 'Requêtes', 'Tokens entrée', 'Tokens sortie', ...(rights.costs ? ['Coût (€)', 'Évolution du coût (%)'] : [])];
    const body = rows.map((r) => [r.name, r.team, r.activeH, r.connectedH, r.sessions, r.avgSessionMin, r.requests, r.tokensIn, r.tokensOut, ...(rights.costs ? [r.costEur, r.costEvolution === null ? null : Math.round((r.costEvolution as number) * 1000) / 10] : [])]);
    return { per, head, body };
  }

  /**
   * Projets du filtre : ceux de la plateforme, puis les projets supprimés dont l'usage reste dans les agrégats (la suppression
   * d'un projet ne touche pas la consommation) ; code et nom lus dans le journal d'audit, libellé « (supprimé) ».
   */
  private async projectOptions() {
    const live = await this.prisma.project.findMany({ select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } });
    const known = new Set(live.map((p) => p.id));
    const used = await this.prisma.$queryRawUnsafe<Array<{ project: string }>>(`SELECT DISTINCT project FROM usage_agg_day WHERE project <> ''`);
    const gone = used.map((u) => u.project).filter((id) => !known.has(id));
    const deleted = gone.length ? await this.prisma.auditEntry.findMany({ where: { action: 'Suppression d’un projet', entityId: { in: gone } }, select: { entityId: true, target: true }, orderBy: { at: 'desc' } }) : [];
    const label = (id: string) => {
      const [code, ...name] = (deleted.find((d) => d.entityId === id)?.target ?? id).split(' · ');
      return { id, code, name: `${name.join(' · ') || code} (supprimé)` };
    };
    return [...live.map((p) => ({ id: p.id, code: p.code, name: p.name })), ...gone.map(label).sort((x, y) => x.code.localeCompare(y.code, 'fr'))];
  }

  /** Listes des filtres : équipes, utilisateurs (droit « données individuelles »), fonctionnalités, fournisseurs et modèles. */
  async options(rights: UsageRights) {
    const accs = await this.accounts();
    const list = [...accs.values()].filter((a) => a.id !== SYSTEM_ACCOUNT && a.id !== DEMO_ACCOUNT);
    const providers = await this.prisma.provider.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
    const models = await this.prisma.aiModel.findMany({ select: { id: true, name: true, providerId: true }, orderBy: { name: 'asc' } });
    return {
      teams: [...new Set(list.map((a) => a.team))].sort((a, b) => (a === NO_TEAM ? 1 : b === NO_TEAM ? -1 : a.localeCompare(b, 'fr'))),
      users: rights.individual ? list.map((a) => ({ id: a.id, name: a.name, team: a.team })).sort((a, b) => a.name.localeCompare(b.name, 'fr')) : [],
      features: USAGE_FEATURES.map((f) => ({ id: f.id, name: f.name })),
      projects: await this.projectOptions(),
      providers: providers.map((p) => ({ id: p.id, name: p.name })),
      models: models.map((m) => ({ id: m.id, name: m.name, providerId: m.providerId })),
      rights,
    };
  }
}
