import { Injectable } from '@nestjs/common';
import { Tx } from '../../core/prisma.service';
import { Usage } from '../../core/errors';

/**
 * Usages qui interdisent une suppression (brief § 7.7, RG11-12) : union des règles de `refUsage()`
 * du frontend et du brief, en suivant les clés étrangères réelles (décision « le plus prudent »).
 */
@Injectable()
export class UsagesService {
  async usages(db: Tx, projectId: string, entityType: string, id: string): Promise<Usage[]> {
    const out: Usage[] = [];
    const push = <T>(type: string, rows: T[], idOf: (r: T) => string, labelOf: (r: T) => string) => {
      for (const r of rows) out.push({ entityType: type, id: idOf(r), label: labelOf(r) });
    };
    const P = { projectId };
    switch (entityType) {
      case 'CLIENT': {
        push('PROJECT', await db.project.findMany({ where: { clientId: id } }), (r) => r.id, (r) => r.name);
        break;
      }
      case 'WAVE': {
        push('PHASE', await db.phase.findMany({ where: { ...P, waves: { some: { waveId: id } } } }), (r) => r.id, (r) => `${r.code} · ${r.name}`);
        push('WORKSTREAM', await db.workstream.findMany({ where: { ...P, waves: { some: { waveId: id } } } }), (r) => r.id, (r) => r.name);
        push('MILESTONE', await db.milestone.findMany({ where: { ...P, waveId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('REPORT_TEMPLATE', (await db.reportTemplate.findMany({ where: P })).filter((t) => targets(t.components, 'WAVE', id)), (r) => r.id, (r) => r.name);
        break;
      }
      case 'PHASE': {
        push('SUBPHASE', await db.subphase.findMany({ where: { ...P, phaseId: id } }), (r) => r.id, (r) => `${r.code} · ${r.name}`);
        push('MILESTONE', await db.milestone.findMany({ where: { ...P, phaseId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('DELIVERABLE', await db.deliverable.findMany({ where: { ...P, subphase: { phaseId: id } } }), (r) => r.id, (r) => r.name);
        push('WORKSTREAM', await db.workstream.findMany({ where: { ...P, phases: { some: { phaseId: id } } } }), (r) => r.id, (r) => r.name);
        push('REPORT_TEMPLATE', (await db.reportTemplate.findMany({ where: P })).filter((t) => targets(t.components, 'PHASE', id)), (r) => r.id, (r) => r.name);
        break;
      }
      case 'SUBPHASE': {
        push('DELIVERABLE', await db.deliverable.findMany({ where: { ...P, subphaseId: id } }), (r) => r.id, (r) => r.name);
        push('MILESTONE', await db.milestone.findMany({ where: { ...P, subphaseId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        break;
      }
      case 'WORKSTREAM': {
        push('RISK', await db.risk.findMany({ where: { ...P, wsIds: { has: id } } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('ISSUE', await db.issue.findMany({ where: { ...P, wsId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('ACTION', await db.action.findMany({ where: { ...P, OR: [{ wsId: id }, { wsIds: { has: id } }] } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('DECISION', await db.decision.findMany({ where: { ...P, wsId: id } }), (r) => r.id, (r) => `${r.code} · ${r.t}`);
        push('MILESTONE', await db.milestone.findMany({ where: { ...P, wsId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('DELIVERABLE', await db.deliverable.findMany({ where: { ...P, workstreamId: id } }), (r) => r.id, (r) => r.name);
        push('WORKSTREAM_PROGRESS', await db.workstreamProgress.findMany({ where: { ...P, wsId: id } }), (r) => r.id, (r) => r.label);
        push('WORKSTREAM', await db.workstream.findMany({ where: { ...P, dependencies: { some: { dependsOnId: id } } } }), (r) => r.id, (r) => `${r.name} (dépendance)`);
        push('HABILITATION', await db.habilitation.findMany({ where: { ...P, wsId: id } }), (r) => r.id, (r) => `${r.profile} · ${r.personId ?? r.accountId}`);
        push('REPORT_TEMPLATE', (await db.reportTemplate.findMany({ where: P })).filter((t) => targets(t.components, 'WORKSTREAM', id)), (r) => r.id, (r) => r.name);
        break;
      }
      case 'TEAM': {
        push('PERSON', await db.person.findMany({ where: { ...P, teamId: id } }), (r) => r.id, (r) => `${r.firstName} ${r.lastName}`);
        const pr = await db.project.findMany({ where: { OR: [{ editorTeamId: id }, { integratorTeamId: id }] } });
        push('PROJECT', pr, (r) => r.id, (r) => `${r.name} (éditeur / intégrateur)`);
        break;
      }
      case 'ROLE': {
        push('ASSIGNMENT', await db.assignment.findMany({ where: { ...P, roleId: id } }), (r) => r.id, (r) => `${r.personId} · ${r.startDate}`);
        break;
      }
      case 'PERSON':
        await this.personUsages(db, projectId, id, push);
        break;
      case 'GOVERNANCE_BODY': {
        push('SESSION', await db.session.findMany({ where: { ...P, bodyId: id } }), (r) => r.id, (r) => `n°${r.number} · ${r.dateIso}`);
        push('DECISION', await db.decision.findMany({ where: { ...P, bodyId: id } }), (r) => r.id, (r) => `${r.code} · ${r.t}`);
        push('REPORT_TEMPLATE', await db.reportTemplate.findMany({ where: { ...P, bodyId: id } }), (r) => r.id, (r) => r.name);
        break;
      }
      case 'MILESTONE': {
        push('ACTION', await db.action.findMany({ where: { ...P, sourceType: 'MILESTONE', sourceId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('DOCUMENT', await db.document.findMany({ where: { ...P, links: { some: { entityType: 'MILESTONE', entityId: id } } } }), (r) => r.id, (r) => r.n);
        break;
      }
      case 'RISK': {
        push('ISSUE', await db.issue.findMany({ where: { ...P, originRiskId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('ACTION', await db.action.findMany({ where: { ...P, sourceType: 'RISK', sourceId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('DOCUMENT', await db.document.findMany({ where: { ...P, links: { some: { entityType: 'RISK', entityId: id } } } }), (r) => r.id, (r) => r.n);
        break;
      }
      case 'ISSUE': {
        push('ACTION', await db.action.findMany({ where: { ...P, sourceType: 'ISSUE', sourceId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('DOCUMENT', await db.document.findMany({ where: { ...P, links: { some: { entityType: 'ISSUE', entityId: id } } } }), (r) => r.id, (r) => r.n);
        break;
      }
      case 'DECISION': {
        push('DECISION', await db.decision.findMany({ where: { ...P, supersedesId: id } }), (r) => r.id, (r) => `${r.code} · ${r.t}`);
        push('ACTION', await db.action.findMany({ where: { ...P, sourceType: 'DECISION', sourceId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('DOCUMENT', await db.document.findMany({ where: { ...P, links: { some: { entityType: 'DECISION', entityId: id } } } }), (r) => r.id, (r) => r.n);
        break;
      }
      case 'SESSION': {
        push('REPORT', await db.reportInstance.findMany({ where: { ...P, sessionId: id } }), (r) => r.id, (r) => r.name);
        push('ISSUE', await db.issue.findMany({ where: { ...P, targetSessionId: id } }), (r) => r.id, (r) => `${r.code} · ${r.n}`);
        push('DECISION', await db.decision.findMany({ where: { ...P, expectedSessionId: id } }), (r) => r.id, (r) => `${r.code} · ${r.t}`);
        break;
      }
      case 'REPORT_TEMPLATE': {
        push('REPORT', await db.reportInstance.findMany({ where: { ...P, templateId: id } }), (r) => r.id, (r) => r.name);
        break;
      }
      default:
        break;
    }
    return out;
  }

  private async personUsages(db: Tx, projectId: string, id: string, push: (t: string, rows: any[], i: (r: any) => string, l: (r: any) => string) => void) {
    const P = { projectId };
    const code = (r: any) => `${r.code} · ${r.n ?? r.t ?? r.name}`;
    push('ACTION', await db.action.findMany({ where: { ...P, ownerId: id } }), (r) => r.id, code);
    push('RISK', await db.risk.findMany({ where: { ...P, ownerId: id } }), (r) => r.id, code);
    push('ISSUE', await db.issue.findMany({ where: { ...P, ownerId: id } }), (r) => r.id, code);
    push('MILESTONE', await db.milestone.findMany({ where: { ...P, ownerId: id } }), (r) => r.id, code);
    push('DELIVERABLE', await db.deliverable.findMany({ where: { ...P, ownerId: id } }), (r) => r.id, (r) => r.name);
    push('WORKSTREAM', await db.workstream.findMany({ where: { ...P, ownerId: id } }), (r) => r.id, (r) => r.name);
    push('WORKSTREAM_PROGRESS', await db.workstreamProgress.findMany({ where: { ...P, ownerId: id } }), (r) => r.id, (r) => r.label);
    push('PHASE', await db.phase.findMany({ where: { ...P, ownerId: id } }), (r) => r.id, (r) => `${r.code} · ${r.name}`);
    push('SUBPHASE', await db.subphase.findMany({ where: { ...P, ownerId: id } }), (r) => r.id, (r) => `${r.code} · ${r.name}`);
    push('WAVE', await db.wave.findMany({ where: { ...P, ownerId: id } }), (r) => r.id, (r) => `Lot ${r.seq}`);
    push('DECISION', await db.decision.findMany({ where: { ...P, makerId: id } }), (r) => r.id, code);
    push('GOVERNANCE_BODY', await db.governanceBody.findMany({ where: { ...P, members: { some: { personId: id } } } }), (r) => r.id, (r) => `${r.shortName} (membre)`);
    push('SESSION', await db.session.findMany({ where: { ...P, participants: { has: id } } }), (r) => r.id, (r) => `Séance n°${r.number} du ${r.dateIso} (participant)`);
    push('ASSIGNMENT', await db.assignment.findMany({ where: { ...P, personId: id } }), (r) => r.id, (r) => `Affectation depuis le ${r.startDate}`);
    push('HABILITATION', await db.habilitation.findMany({ where: { ...P, personId: id } }), (r) => r.id, (r) => `${r.profile}${r.wsId ? ' · ' + r.wsId : ''}`);
    push('PROJECT', await db.project.findMany({ where: { OR: [{ programDirectorId: id }, { sponsorId: id }] } }), (r) => r.id, (r) => `${r.name} (direction / sponsor)`);
    push('REPORT', await db.reportInstance.findMany({ where: { ...P, OR: [{ reviewerId: id }, { validatorId: id }] } }), (r) => r.id, (r) => `${r.name} (relecture / validation)`);
    push('REPORT_TEMPLATE', await db.reportTemplate.findMany({ where: { ...P, authorId: id } }), (r) => r.id, (r) => `${r.name} (auteur)`);
    push('TASK', await db.task.findMany({ where: { ...P, authorId: id } }), (r) => r.id, (r) => r.title);
    push('ACCOUNT', await db.account.findMany({ where: { personId: id } }), (r) => r.id, (r) => `Compte ${r.email}`);
  }
}

function targets(components: unknown, scope: string, id: string): boolean {
  return Array.isArray(components) && components.some((c: any) => c?.scope === scope && c?.targetId === id);
}
