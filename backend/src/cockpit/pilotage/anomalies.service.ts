import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma.service';
import { ProjectScope } from '../../core/access.service';
import { TodayService } from '../../core/today.service';
import { visibleWorkstreams } from '../../domain/rights';
import { actionLate, confirmedDays, FRESHNESS_ALERT_DAYS, FRESHNESS_WATCH_DAYS, riskScore, RISK_CRITICAL_MIN } from '../../domain/rules';
import { confirmedAtIso } from '../views';
import { frShort } from '../../domain/dates';

export type AnomalyLevel = 'RISK' | 'WATCH';

export interface Anomaly {
  kind: 'CRITICAL_RISK_WITHOUT_PLAN' | 'MILESTONE_UNCONFIRMED' | 'BUDGET_UNKNOWN' | 'CHANGES_SINCE_CAPTURE' | 'ACTION_LATE';
  level: AnomalyLevel;
  entityType: string;
  entityId: string | null;
  wsId: string | null;
  text: string;
  owner: string | null;
  action: string;
  target: { space: string; tab: string };
  days?: number;
}

/**
 * Écarts calculés (brief § 7.13, DECISIONS « Anomalies ») :
 * risque critique sans plan ; jalon à venir non confirmé depuis plus de 7 j (vigilance) ou 14 j (alerte) ;
 * budget non renseigné ; modifications depuis la capture du dernier rapport ; actions échues.
 */
@Injectable()
export class AnomaliesService {
  constructor(private readonly prisma: PrismaService, private readonly todaySvc: TodayService) {}

  async compute(scope: ProjectScope): Promise<Anomaly[]> {
    const P = { projectId: scope.project.id };
    const today = this.todaySvc.today(scope.project.timezone);
    const vis = visibleWorkstreams(scope.access);
    const inWs = (ws: string | null) => !vis || (!!ws && vis.includes(ws));
    const out: Anomaly[] = [];

    for (const r of await this.prisma.risk.findMany({ where: { ...P, status: { not: 'CLOSED' } }, orderBy: { code: 'asc' } })) {
      if (!inWs(r.wsId)) continue;
      const s = riskScore(r.p, r.i);
      if (s >= RISK_CRITICAL_MIN && !r.plan) {
        out.push({ kind: 'CRITICAL_RISK_WITHOUT_PLAN', level: 'RISK', entityType: 'RISK', entityId: r.id, wsId: r.wsId, text: `Risque ${r.code} (critique, ${s}) sans plan de mitigation`, owner: r.ownerId, action: 'Qualifier', target: { space: 'pilotage', tab: 'risques' } });
      }
    }

    const ms = await this.prisma.milestone.findMany({ where: { ...P, iso: { gte: today } }, orderBy: [{ iso: 'asc' }, { code: 'asc' }] });
    for (const m of ms) {
      if (m.wsId && !inWs(m.wsId)) continue;
      const d = confirmedDays(confirmedAtIso(m.confirmedAt), today);
      if (d > FRESHNESS_WATCH_DAYS) {
        out.push({
          kind: 'MILESTONE_UNCONFIRMED',
          level: d > FRESHNESS_ALERT_DAYS ? 'RISK' : 'WATCH',
          entityType: 'MILESTONE',
          entityId: m.id,
          wsId: m.wsId,
          text: `Jalon « ${m.n} » non confirmé depuis ${d} jours`,
          owner: m.ownerId,
          action: 'Confirmer',
          target: { space: 'pilotage', tab: 'jalons' },
          days: d,
        });
      }
    }

    const budget = await this.prisma.programBudget.findUnique({ where: { projectId: scope.project.id } });
    if (budget && !budget.known) {
      out.push({ kind: 'BUDGET_UNKNOWN', level: 'WATCH', entityType: 'PROGRAM_BUDGET', entityId: scope.project.id, wsId: null, text: 'Budget programme non renseigné : la slide « Budget » affichera « non évalué »', owner: scope.project.programDirectorId, action: 'Renseigner', target: { space: 'pilotage', tab: 'budget' } });
    }

    const last = await this.prisma.reportInstance.findFirst({ where: { ...P, captureAt: { not: null } }, orderBy: { captureAt: 'desc' } });
    if (last?.captureAt) {
      const changes = await this.prisma.auditEntry.findMany({
        where: { ...P, at: { gt: last.captureAt }, entityType: { in: ['RISK', 'ISSUE', 'ACTION', 'DECISION', 'MILESTONE', 'DELIVERABLE', 'WORKSTREAM_PROGRESS', 'PHASE', 'SUBPHASE', 'WORKSTREAM', 'BAROMETER_SURVEY'] } },
        select: { entityType: true, entityId: true },
      });
      const objects = new Set(changes.map((c) => `${c.entityType}/${c.entityId}`));
      if (objects.size) {
        const cap = last.captureAt.toISOString().slice(0, 10);
        out.push({ kind: 'CHANGES_SINCE_CAPTURE', level: 'WATCH', entityType: 'REPORT', entityId: last.id, wsId: null, text: `${objects.size} modification${objects.size > 1 ? 's' : ''} du projet depuis la capture du ${frShort(cap)}`, owner: null, action: 'Régénérer', target: { space: 'comites', tab: 'preparation' } });
      }
    }

    for (const a of await this.prisma.action.findMany({ where: { ...P, status: { not: 'DONE' } }, orderBy: { order: 'asc' } })) {
      if (!inWs(a.wsId)) continue;
      if (actionLate(a.status, a.dueIso, today)) {
        out.push({ kind: 'ACTION_LATE', level: 'RISK', entityType: 'ACTION', entityId: a.id, wsId: a.wsId, text: `Action ${a.code} échue le ${frShort(a.dueIso)} : ${a.n}`, owner: a.ownerId, action: 'Relancer', target: { space: 'pilotage', tab: 'actions' } });
      }
    }
    return out;
  }
}
