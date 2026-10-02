import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Actor } from '../../core/auth/auth';
import { ProjectScope } from '../../core/access.service';
import { JevPromptService } from '../../core/jev-prompt.service';
import { JobsService } from '../../core/jobs.service';
import { LlmService } from '../../core/llm.service';
import { PrismaService } from '../../core/prisma.service';
import { TodayService } from '../../core/today.service';
import { addDays, daysBetween, frShort } from '../../domain/dates';
import { visibleWorkstreams } from '../../domain/rights';
import { RISK_CRITICAL_MIN } from '../../domain/rules';
import {
  checkGreeting, shortTitle, GREETING_MAX_WORDS, WELCOME_BODY_SHORT_NAME, GREETING_MODULE_ID, GREETING_PROMPT_VERSION, GREETING_PURGE_DAYS, GreetingFacts, greetingPrompt, momentOf, ruleGreeting,
} from '../../domain/today-greeting';

/** Délai laissé au modèle pour rédiger le message. */
export const GREETING_TIMEOUT_MS = 20_000;

export type Greeting = { text: string; source: 'jev' | 'regles'; reason: string | null; day: string };

/**
 * Message d'accueil de l'écran Aujourd'hui (02/10/2026, `docs/DECISIONS.md`) : faits du jour filtrés par les droits,
 * message calculé par règles, et message de Jev (fonction `insights`, ton du Soul), généré une seule fois par compte,
 * projet et jour, contrôlé avant d'être gardé. Module « jev_accueil » désactivé : message par règles.
 */
@Injectable()
export class TodayGreetingService implements OnModuleInit {
  /** Générations en cours (deux ouvertures simultanées de l'écran : un seul appel au modèle). */
  private readonly running = new Map<string, Promise<Greeting>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly jevPrompt: JevPromptService,
    private readonly todaySvc: TodayService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.register('today-greeting.purge', () => this.purge(this.todaySvc.now()).then(() => undefined));
    this.jobs.schedule('today-greeting.purge', '50 3 * * *');
  }

  async purge(now: Date): Promise<number> {
    const r = await this.prisma.todayGreeting.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - GREETING_PURGE_DAYS * 864e5) } } });
    return r.count;
  }

  /** Faits du jour de la personne sur le projet, limités à ses chantiers visibles. */
  async facts(actor: Actor, scope: ProjectScope): Promise<GreetingFacts & { day: string }> {
    const P = { projectId: scope.project.id }, tz = scope.project.timezone;
    const today = this.todaySvc.today(tz), week = addDays(today, 6), yesterday = addDays(today, -1), now = this.todaySvc.now();
    const me = scope.access.personId, vis = visibleWorkstreams(scope.access);
    const wsIn = vis ? { wsId: { in: vis } } : {};
    const mine = me ? { ownerId: me } : { ownerId: '__aucun__' };
    const body = (await this.prisma.governanceBody.findFirst({ where: { ...P, shortName: WELCOME_BODY_SHORT_NAME } })) ?? (await this.prisma.governanceBody.findFirst({ where: { ...P, level: 'STRATEGIC' }, orderBy: { order: 'asc' } }));
    const [next, decisions, late, due, risks, milestones, done, prefs, person] = await Promise.all([
      body ? this.prisma.session.findFirst({ where: { ...P, bodyId: body.id, status: 'PLANNED', dateIso: { gte: today } }, orderBy: [{ dateIso: 'asc' }, { time: 'asc' }] }) : null,
      me ? this.prisma.decision.findMany({ where: { ...P, makerId: me, status: 'TO_ARBITRATE' }, orderBy: { code: 'asc' }, select: { t: true } }) : [],
      this.prisma.action.findMany({ where: { ...P, ...mine, status: { not: 'DONE' }, dueIso: { lt: today } }, orderBy: { dueIso: 'asc' }, select: { n: true } }),
      this.prisma.action.findMany({ where: { ...P, ...mine, status: { not: 'DONE' }, dueIso: { gte: today, lte: week } }, orderBy: { dueIso: 'asc' }, select: { n: true } }),
      this.prisma.risk.findMany({ where: { ...P, ...wsIn, status: { not: 'CLOSED' } }, select: { n: true, p: true, i: true, updatedAt: true } }),
      this.prisma.milestone.findMany({ where: { ...P, ...(vis ? { wsId: { in: vis } } : {}), iso: { gte: today, lte: week } }, orderBy: { iso: 'asc' }, select: { n: true } }),
      this.prisma.action.count({ where: { ...P, ...mine, status: 'DONE', closedAt: yesterday } }),
      this.prisma.userPreferences.findUnique({ where: { accountId: actor.accountId } }),
      me ? this.prisma.person.findUnique({ where: { id: me } }) : null,
    ]);
    const critical = risks.filter((r) => r.p * r.i >= RISK_CRITICAL_MIN).sort((a, b) => b.p * b.i - a.p * a.i);
    const recent = critical.filter((r) => r.updatedAt.getTime() >= now.getTime() - 864e5);
    const hour = Number(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now));
    const year = +today.slice(0, 4);
    const cnt = (xs: Array<{ n?: string; t?: string }>) => ({ count: xs.length, first: xs[0] ? shortTitle(xs[0].n ?? xs[0].t ?? null) : null });
    return {
      day: today,
      firstName: prefs?.firstName ?? person?.firstName ?? actor.fullName.split(' ')[0],
      weekday: new Date(`${today}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' }),
      dateLabel: frShort(today, year),
      moment: momentOf(hour),
      committee: next && body ? { name: body.shortName, dateLabel: frShort(next.dateIso, year), inDays: daysBetween(today, next.dateIso) } : null,
      decisions: cnt(decisions),
      lateActions: cnt(late),
      dueThisWeek: cnt(due),
      criticalRisks: { ...cnt(recent.length ? recent : critical), count: critical.length, recent: recent.length },
      milestonesThisWeek: cnt(milestones),
      doneYesterday: done,
    };
  }

  /** Le module « Message d'accueil de Jev » est-il actif sur ce projet ? (absent : inactif) */
  async enabled(projectId: string): Promise<boolean> {
    const m = await this.prisma.module.findUnique({ where: { id: GREETING_MODULE_ID }, include: { projects: true } });
    return !!m && (m.scope === 'ALL' || (m.scope === 'PROJECTS' && m.projects.some((x) => x.projectId === projectId)));
  }

  /** Message du jour : celui de Jev s'il a été gardé, sinon le message par règles (une seule génération par jour). */
  async greeting(actor: Actor, scope: ProjectScope): Promise<Greeting> {
    const f = await this.facts(actor, scope), rule = ruleGreeting(f), day = f.day, projectId = scope.project.id;
    const fallback = (reason: string | null): Greeting => ({ text: rule, source: 'regles', reason, day });
    if (!(await this.enabled(projectId))) return fallback('module désactivé');
    const key = { accountId: actor.accountId, projectId, day };
    const kept = await this.prisma.todayGreeting.findUnique({ where: { accountId_projectId_day: key } });
    // Consignes modifiées depuis (nouvelle version) : le message du jour est réécrit une fois avec les nouvelles.
    if (kept && kept.promptVersion !== GREETING_PROMPT_VERSION) await this.prisma.todayGreeting.delete({ where: { id: kept.id } });
    else if (kept) return kept.status === 'JEV' && kept.text ? { text: kept.text, source: 'jev', reason: null, day } : fallback(kept.reason);
    // Hors ligne (ou fonction sur le bouchon) : jamais de texte de bouchon à l'écran, rien n'est enregistré.
    if (!this.llm.isLive('insights')) return fallback('génération réelle indisponible');
    const k = `${actor.accountId}|${projectId}|${day}`;
    let run = this.running.get(k);
    if (!run) {
      run = this.generate(f, key, scope).then((g) => g ?? fallback(null)).finally(() => this.running.delete(k));
      this.running.set(k, run);
    }
    const g = await run;
    return g.source === 'jev' ? g : fallback(g.reason);
  }

  private async generate(f: GreetingFacts, key: { accountId: string; projectId: string; day: string }, scope: ProjectScope): Promise<Greeting> {
    let row: { status: string; text: string | null; reason: string | null; modelId: string | null };
    try {
      const r = await this.llm.complete({ functionId: 'insights', prompt: greetingPrompt(f), system: await this.jevPrompt.greetingSystem(), projectId: scope.project.id, source: 'COCKPIT', maxWords: GREETING_MAX_WORDS, timeoutMs: GREETING_TIMEOUT_MS });
      const c = checkGreeting(r.text, f);
      row = c.ok ? { status: 'JEV', text: c.text, reason: null, modelId: r.modelId } : { status: 'REFUSE', text: r.text.slice(0, 2000), reason: c.reason, modelId: r.modelId };
    } catch (e) {
      row = { status: 'ECHEC', text: null, reason: (e as { message?: string }).message?.slice(0, 300) ?? 'erreur', modelId: null };
    }
    try {
      await this.prisma.todayGreeting.create({ data: { ...key, ...row, promptVersion: GREETING_PROMPT_VERSION } });
    } catch (e) {
      // Une autre instance a gardé le message du jour entre-temps : c'est lui qui fait foi.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      const other = await this.prisma.todayGreeting.findUniqueOrThrow({ where: { accountId_projectId_day: key } });
      row = other;
    }
    return row.status === 'JEV' && row.text ? { text: row.text, source: 'jev', reason: null, day: key.day } : { text: '', source: 'regles', reason: row.reason, day: key.day };
  }
}
