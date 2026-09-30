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

/** Jalon en retard : date prévue passée et non confirmé depuis. */
const isLate = (m: { iso: string; confirmedAt: Date | null }, today: string) => m.iso < today && !(m.confirmedAt && confirmedAtIso(m.confirmedAt)! >= m.iso);
import { AUDIENCE_PRIORITY, AudienceProfile, blockingErrors, CATCH_UP_SAME_DAY, DAILY_CHECK_CRON, nextSendAt, parisDay, scheduleKey } from '../domain/notification-rules';
import { Audience, NotificationWriterService } from './notification-writer.service';

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
    private readonly writer: NotificationWriterService,
  ) {}

  onModuleInit() {
    this.events.on(async (e) => {
      if (e.type === 'usage.recorded') await this.checkBudget();
      if (e.type === 'risk.critical') await this.fireTrigger('RISK_CRITICAL', e.projectId, e.riskId);
      if (e.type === 'document.analyzed') await this.fireTrigger('DOCUMENT_ANALYZED', e.projectId, e.documentId);
    });
    this.jobs.register('notifications.due', () => this.runDue());
    this.jobs.register('notifications.daily', () => this.dailyCheck());
    this.jobs.register('budget.check', () => this.checkBudget());
    // Chaque minute : les règles dont le prochain envoi est passé (une requête sur l'index) ; au démarrage, le
    // premier passage rattrape un envoi manqué le jour même.
    this.jobs.schedule('notifications.due', '* * * * *');
    this.jobs.schedule('notifications.daily', DAILY_CHECK_CRON);
    this.jobs.schedule('budget.check', '5 * * * *');
  }

  /**
   * Génère sujet et message pour un profil destinataire : le modèle de la règle lit les données du projet sur le
   * périmètre du profil (Text-to-SQL, `NotificationWriterService`) et rédige {reponse_llm} ; consommation tracée.
   */
  async generate(rule: Pick<NotificationRule, 'modelId' | 'prompt' | 'subject' | 'body' | 'kind'>, ctx0: RuleContext, projectId: string | null, audience: Audience = { profile: 'pmo', chantiers: '*' }) {
    // {date} : la date de l'événement quand il en a une (date prévue d'un jalon…), sinon la date du jour.
    const ctx: RuleContext = { ...ctx0, date: ctx0.date || frShort(this.today.today(), 0) };
    const prompt = fill(rule.prompt, ctx as Record<string, string>);
    const project = projectId ? await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, code: true } }) : null;
    const t0 = Date.now();
    const res = await this.writer.write(rule, prompt, project, audience);
    const vars = { ...ctx, [LLM_RESPONSE_VARIABLE]: res.text } as Record<string, string>;
    return { subject: fill(rule.subject, vars), body: fill(rule.body, vars), llmResponse: res.text, tokens: res.tokens, costEur: res.costEur, ms: Date.now() - t0, sources: res.sources };
  }

  /**
   * Envoie une règle pour un projet (ou pour la plateforme) : un texte par profil destinataire (arbitrage du
   * 29/09/2026), rédigé sur les données que tous les membres du profil peuvent lire. Canal « Dans l'application » :
   * une notification par destinataire dans le Cockpit (cloche) ; canal E-mail : serveur SMTP de la Console.
   * En cas de modèle inactif ou de clé invalide, l'échec est tracé dans l'historique (visible dans « À traiter »).
   * `only` (« M'envoyer un test ») : le texte du premier profil destinataire, envoyé aux seuls comptes indiqués.
   */
  async deliver(rule: NotificationRule, projectId: string | null, ctx: RuleContext, eventKey: string | null, only?: { accountIds: string[] }) {
    if (eventKey && (await this.prisma.delivery.findFirst({ where: { ruleId: rule.id, eventKey } }))) return [];
    let groups = await this.profiles.audiences(rule.targetProfiles, projectId);
    if (only) {
      const first = groups[0] ?? { profile: (AUDIENCE_PRIORITY.find((p) => rule.targetProfiles.includes(p)) ?? 'pmo') as AudienceProfile, chantiers: '*' as const };
      groups = [{ ...first, accounts: await this.prisma.account.findMany({ where: { id: { in: only.accountIds } } }) }];
    }
    const out = [];
    for (const g of groups) {
      const recipients = g.accounts;
      let gen: Awaited<ReturnType<NotificationsService['generate']>> | null = null;
      let error: string | null = null;
      try {
        gen = await this.generate(rule, ctx, projectId, { profile: g.profile, chantiers: g.chantiers });
      } catch (e: any) {
        error = e?.message ?? 'Génération impossible';
      }
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
        const first = channel === rule.channels[0];
        const d = await this.prisma.delivery.create({
          data: { ruleId: rule.id, channel, recipientsCount: recipients.length, status, error: err, costEur: first ? gen?.costEur ?? 0 : 0, tokens: first ? gen?.tokens ?? 0 : 0, projectId, subject: gen?.subject ?? null, body: gen?.body ?? null, eventKey, recipients: recipients.map((r) => r.id), profile: g.profile },
        });
        // Canal « Dans l'application » : notifications des destinataires dans le Cockpit (cloche, non lues).
        if (gen && channel === 'APP' && recipients.length) {
          await this.prisma.userNotification.createMany({ data: recipients.map((r) => ({ accountId: r.id, ruleId: rule.id, deliveryId: d.id, projectId, kind: rule.kind, title: gen!.subject, body: gen!.body })) });
        }
        out.push(d);
      }
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
  /**
   * Prochain envoi des règles planifiées (décision du 30/09/2026) : recalculé quand la fréquence, le jour, l'heure ou
   * l'activation changent (`scheduleKey`). Écrit sans toucher à la date de modification ni à la version de la règle.
   */
  async syncSchedules(ids?: string[]) {
    const now = this.today.now();
    for (const r of await this.prisma.notificationRule.findMany({ where: ids ? { id: { in: ids } } : {} })) {
      const key = scheduleKey(r);
      if (key === r.scheduleKey) continue;
      await this.setNextRun(r, nextSendAt(r, now), key);
    }
  }

  /** Date de modification gardée : le calcul du prochain envoi n'est pas une modification de la règle. */
  private setNextRun(r: { id: string; updatedAt: Date }, at: Date | null, key?: string) {
    return this.prisma.notificationRule.update({ where: { id: r.id }, data: { nextRunAt: at, ...(key === undefined ? {} : { scheduleKey: key }), updatedAt: r.updatedAt } });
  }

  /**
   * Vérification de chaque minute : une seule requête sur l'index (règles actives dont le prochain envoi est passé).
   * Rattrapage : un envoi manqué pendant un arrêt de la plateforme part au redémarrage le jour même
   * (`CATCH_UP_SAME_DAY`) ; au-delà, il est abandonné et tracé en échec (« À traiter »). Un envoi par règle, projet
   * et jour au plus (`eventKey`).
   */
  async runDue() {
    await this.syncSchedules();
    const now = this.today.now();
    const due = await this.prisma.notificationRule.findMany({ where: { enabled: true, nextRunAt: { lte: now } } });
    if (!due.length) return;
    const projects = await this.prisma.project.findMany({ where: { status: { not: 'CLOSED' } } });
    for (const rule of due) {
      const at = rule.nextRunAt!, day = parisDay(at);
      // Prochain envoi posé avant l'envoi : une vérification qui se chevauche ne renvoie pas la même échéance.
      await this.setNextRun(rule, nextSendAt(rule, now));
      // Cas bloquants (aucun modèle, aucun destinataire) : la règle reste active mais n'envoie rien.
      if (blockingErrors(rule).length) continue;
      if (CATCH_UP_SAME_DAY && day !== parisDay(now)) {
        const eventKey = `${rule.id}|manque|${day}`;
        if (!(await this.prisma.delivery.findFirst({ where: { ruleId: rule.id, eventKey } }))) {
          await this.prisma.delivery.create({ data: { ruleId: rule.id, at: now, channel: rule.channels[0] ?? 'APP', recipientsCount: 0, status: 'ERROR', eventKey, error: `Non envoyé : la plateforme était arrêtée à l’heure prévue (${frShort(day, 0)} ${rule.hour ?? ''}) et n’a redémarré qu’un autre jour` } });
        }
        continue;
      }
      // « Tous les projets » (règle de plateforme) : chaque projet ouvert.
      const targets = rule.platform ? projects : rule.projectIds.map((code) => projects.find((x) => x.code === code || x.id === code));
      for (const p of targets) {
        if (!p) continue;
        await this.deliver(rule, p.id, { projet: p.code, semaine: `semaine ${isoWeek(new Date(`${day}T12:00:00Z`))}` }, `${rule.id}|${p.id}|${day}`);
      }
    }
  }

  /**
   * Vérification quotidienne (`DAILY_CHECK_CRON`, 7 h) : un jalon ne devient en retard qu'au changement de date (le
   * modifier vaut confirmation, § 7.2 : une modification ne le met jamais en retard) ; un
   * risque critique est déjà signalé à son enregistrement (événement), ce passage n'est qu'un filet de sécurité.
   * Un événement déjà notifié ne l'est pas deux fois.
   */
  async dailyCheck() {
    for (const p of await this.prisma.project.findMany({ where: { status: { not: 'CLOSED' } } })) {
      const today = this.today.today(p.timezone);
      for (const m of await this.prisma.milestone.findMany({ where: { projectId: p.id, iso: { lt: today } } })) {
        if (!isLate(m, today)) continue;
        await this.fireTrigger('MILESTONE_LATE', p.id, m.id);
      }
      for (const r of await this.prisma.risk.findMany({ where: { projectId: p.id, status: { not: 'CLOSED' } } })) {
        if (riskScore(r.p, r.i) >= RISK_CRITICAL_MIN) await this.fireTrigger('RISK_CRITICAL', p.id, r.id);
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
