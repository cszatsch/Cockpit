import { Injectable, OnModuleInit } from '@nestjs/common';
import { NotificationRule } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { LlmService } from '../core/llm.service';
import { MailerService } from '../core/mailer.service';
import { EventBus } from '../core/events';
import { JobsService } from '../core/jobs.service';
import { TodayService } from '../core/today.service';
import { ProfilesService } from './profiles.service';
import { UsageService } from './usage.service';
import { riskScore, RISK_CRITICAL_MIN } from '../domain/rules';
import { confirmedAtIso } from '../cockpit/views';
import { frShort } from '../domain/dates';
import { blockingErrors, DEFAULT_HOUR, DEFAULT_WEEK_DAY, NOTIFICATION_TIMEZONE, sendSlot } from '../domain/notification-rules';

/** Variables utilisables dans le prompt et le message (brief Console § 6.5). */
/** Variables proposées dans la vue : projet, date (et reponse_llm dans le message) ; semaine reste lue pour les synthèses. */
export const RULE_VARIABLES = ['projet', 'date', 'semaine'] as const;
export const LLM_RESPONSE_VARIABLE = 'reponse_llm';

export interface RuleContext {
  projet?: string;
  jalon?: string;
  date?: string;
  risque?: string;
  seuil?: string;
  semaine?: string;
  document?: string;
}

export function fill(template: string, ctx: Record<string, string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (ctx[k] !== undefined ? String(ctx[k]) : m));
}

/**
 * Génération et envoi des notifications (brief Console § 7.6, § 10.5) : prompt construit avec les données,
 * appel au modèle de la règle (source NOTIFICATION), réponse insérée à la place de {reponse_llm},
 * envoi par canal aux comptes actifs ciblés, trace dans `Delivery` (un seul envoi par événement).
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly mailer: MailerService,
    private readonly events: EventBus,
    private readonly jobs: JobsService,
    private readonly profiles: ProfilesService,
    private readonly usage: UsageService,
    private readonly today: TodayService,
  ) {}

  onModuleInit() {
    this.events.on(async (e) => {
      if (e.type === 'usage.recorded') await this.checkBudget();
      if (e.type === 'risk.critical') await this.fireTrigger('RISK_CRITICAL', e.projectId, e.riskId);
      if (e.type === 'document.analyzed') await this.fireTrigger('DOCUMENT_ANALYZED', e.projectId, e.documentId);
    });
    this.jobs.register('notifications.tick', () => this.tick());
    this.jobs.register('budget.check', () => this.checkBudget());
    // Toutes les 30 minutes : les heures d'envoi se choisissent par pas de 30 minutes.
    this.jobs.schedule('notifications.tick', '0,30 * * * *');
    this.jobs.schedule('budget.check', '5 * * * *');
  }

  /** Génère sujet et message (appel LLM réel, consommation tracée). */
  async generate(rule: Pick<NotificationRule, 'modelId' | 'prompt' | 'subject' | 'body'>, ctx0: RuleContext, projectId: string | null) {
    // {date} : la date de l'événement quand il en a une (date prévue d'un jalon…), sinon la date du jour.
    const ctx: RuleContext = { ...ctx0, date: ctx0.date || frShort(this.today.today(), 0) };
    const prompt = fill(rule.prompt, ctx as Record<string, string>);
    const res = await this.llm.completeWithModel(rule.modelId, { functionId: 'insights', prompt, projectId, source: 'NOTIFICATION' });
    const vars = { ...ctx, [LLM_RESPONSE_VARIABLE]: res.text } as Record<string, string>;
    return { subject: fill(rule.subject, vars), body: fill(rule.body, vars), llmResponse: res.text, tokens: res.tokensIn + res.tokensOut, costEur: res.costEur, ms: res.ms };
  }

  /**
   * Envoie une règle pour un projet (ou pour la plateforme). En cas de modèle inactif ou de clé invalide,
   * l'échec est tracé dans l'historique (visible dans « À traiter »).
   */
  async deliver(rule: NotificationRule, projectId: string | null, ctx: RuleContext, eventKey: string | null, only?: { accountIds: string[] }) {
    if (eventKey && (await this.prisma.delivery.findFirst({ where: { ruleId: rule.id, eventKey } }))) return [];
    const recipients = only ? await this.prisma.account.findMany({ where: { id: { in: only.accountIds } } }) : await this.profiles.recipients(rule.targetProfiles, projectId);
    let gen: Awaited<ReturnType<NotificationsService['generate']>> | null = null;
    let error: string | null = null;
    try {
      gen = await this.generate(rule, ctx, projectId);
    } catch (e: any) {
      error = e?.message ?? 'Génération impossible';
    }
    const out = [];
    for (const channel of rule.channels) {
      let status: 'OK' | 'ERROR' = gen ? 'OK' : 'ERROR';
      let err = error;
      if (gen && channel === 'EMAIL') {
        try {
          await this.mailer.send({ to: recipients.map((r) => r.email), subject: gen.subject, text: gen.body });
        } catch (e: any) {
          status = 'ERROR';
          err = `Envoi e-mail : ${e?.message ?? 'échec'}`;
        }
      }
      out.push(
        await this.prisma.delivery.create({
          data: { ruleId: rule.id, channel, recipientsCount: recipients.length, status, error: err, costEur: channel === rule.channels[0] ? gen?.costEur ?? 0 : 0, tokens: channel === rule.channels[0] ? gen?.tokens ?? 0 : 0, projectId, subject: gen?.subject ?? null, body: gen?.body ?? null, eventKey, recipients: recipients.map((r) => r.id) },
        }),
      );
    }
    return out;
  }

  /** Déclenchement par un événement du Cockpit (alerte : jamais regroupée, envoi immédiat). */
  async fireTrigger(trigger: 'RISK_CRITICAL' | 'DOCUMENT_ANALYZED' | 'MILESTONE_LATE', projectId: string, entityId: string) {
    const rules = await this.prisma.notificationRule.findMany({ where: { trigger, enabled: true } });
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return;
    for (const rule of rules) {
      if (blockingErrors(rule).length) continue;
      if (!rule.platform && !rule.projectIds.includes(project.code) && !rule.projectIds.includes(project.id)) continue;
      const ctx: RuleContext = { projet: project.code };
      if (trigger === 'RISK_CRITICAL') {
        const r = await this.prisma.risk.findUnique({ where: { id: entityId } });
        if (!r) continue;
        ctx.risque = r.n;
      } else if (trigger === 'DOCUMENT_ANALYZED') {
        const d = await this.prisma.document.findUnique({ where: { id: entityId } });
        if (!d) continue;
        ctx.document = d.n;
      } else {
        const m = await this.prisma.milestone.findUnique({ where: { id: entityId } });
        if (!m) continue;
        ctx.jalon = `${m.code} · ${m.n}`;
        ctx.date = frShort(m.iso, 0);
      }
      // Une alerte part immédiatement ; une notification suit sa fréquence (traitée par `tick`).
      if (rule.frequency === 'IMMEDIATE' || rule.kind === 'ALERT') await this.deliver(rule, project.id, ctx, `${rule.id}|${project.id}|${entityId}`);
    }
  }

  /**
   * Tâche horaire : jalons en retard (iso < aujourd'hui et non confirmés, § 9.11 Cockpit), risques critiques,
   * notifications planifiées (quotidiennes, hebdomadaires, personnalisées) à l'heure prévue.
   */
  async tick() {
    const now = this.today.now();
    // Heure et jour dans le fuseau de l'organisation, affiché dans la vue ; créneau de 30 minutes.
    const slot = sendSlot(new Intl.DateTimeFormat('fr-FR', { timeZone: NOTIFICATION_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now));
    const weekday = new Intl.DateTimeFormat('fr-FR', { timeZone: NOTIFICATION_TIMEZONE, weekday: 'long' }).format(now).toLowerCase();
    const projects = await this.prisma.project.findMany({ where: { status: { not: 'CLOSED' } } });
    for (const p of projects) {
      const today = this.today.today(p.timezone);
      for (const m of await this.prisma.milestone.findMany({ where: { projectId: p.id, iso: { lt: today } } })) {
        // Jalon passé et non confirmé depuis sa date prévue : considéré en retard.
        if (m.confirmedAt && confirmedAtIso(m.confirmedAt)! >= m.iso) continue;
        await this.fireTrigger('MILESTONE_LATE', p.id, m.id);
      }
      for (const r of await this.prisma.risk.findMany({ where: { projectId: p.id, status: { not: 'CLOSED' } } })) {
        if (riskScore(r.p, r.i) >= RISK_CRITICAL_MIN) await this.fireTrigger('RISK_CRITICAL', p.id, r.id);
      }
    }
    const scheduled = await this.prisma.notificationRule.findMany({ where: { enabled: true, trigger: 'SCHEDULE', frequency: { in: ['DAILY', 'WEEKLY'] } } });
    const dayKey = this.today.today(NOTIFICATION_TIMEZONE);
    for (const rule of scheduled) {
      // Cas bloquants (aucun modèle, aucun destinataire) : la règle reste active mais n'envoie rien.
      if (blockingErrors(rule).length) continue;
      if (sendSlot(rule.hour ?? DEFAULT_HOUR) !== slot) continue;
      if (rule.frequency === 'WEEKLY' && (rule.day ?? DEFAULT_WEEK_DAY).toLowerCase() !== weekday) continue;
      // « Tous les projets » (règle de plateforme) : chaque projet ouvert.
      const targets = rule.platform ? projects : rule.projectIds.map((code) => projects.find((x) => x.code === code || x.id === code));
      for (const p of targets) {
        if (!p) continue;
        const week = `semaine ${isoWeek(new Date(`${dayKey}T12:00:00Z`))}`;
        await this.deliver(rule, p.id, { projet: p.code, semaine: week }, `${rule.id}|${p.id}|${dayKey}`);
      }
    }
  }

  /** § 7.4 / § 10.3 : franchir `warnPct` déclenche la règle budgétaire une seule fois par seuil et par mois. */
  async checkBudget() {
    const rule = await this.prisma.notificationRule.findFirst({ where: { trigger: 'BUDGET_THRESHOLD', enabled: true } });
    const month = this.usage.todayIso().slice(0, 7);
    const thresholds = await this.usage.thresholds();
    for (const t of thresholds) {
      if (!t.enabled || !t.limitEur) continue;
      if (t.spent < (t.limitEur * t.warnPct) / 100) continue;
      const already = await this.prisma.budgetAlertFired.findUnique({ where: { thresholdId_month: { thresholdId: t.id, month } } });
      if (already) continue;
      await this.prisma.budgetAlertFired.create({ data: { thresholdId: t.id, month } });
      if (rule && !blockingErrors(rule).length) await this.deliver(rule, null, { seuil: `${t.warnPct} %` }, `${rule.id}|${t.id}|${month}`);
    }
  }
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y.getTime()) / 86_400_000 + 1) / 7);
}
