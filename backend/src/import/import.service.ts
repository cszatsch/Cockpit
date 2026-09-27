import { Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';
import { AuditService, WriteCtx } from '../core/audit.service';
import { ApiErrorWithBody, conflict } from '../core/errors';
import { readWorkbook } from './excel-reader';
import { checkWorkbook, CheckResult, commitPlan, ImportIssue } from './referential-import';

/** Rapport d'import au format du brief Cockpit § 10. */
export interface ImportReport {
  dryRun: boolean;
  imported: boolean;
  created: Record<string, number>;
  errors: Array<{ sheet: string; row: number | null; column: string | null; message: string }>;
  warnings: Array<{ sheet: string; row: number | null; column: string | null; message: string; source: string }>;
}

const toErr = (i: ImportIssue) => ({ sheet: i.sheet, row: i.row, column: i.column ?? null, message: i.message });
const toWarn = (i: ImportIssue) => ({ ...toErr(i), source: i.source });

/** Moteur d'import partagé par le Cockpit (`/referential/import`) et la Console (`/project-imports`). */
@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async check(buffer: Buffer): Promise<CheckResult> {
    try {
      return checkWorkbook(await readWorkbook(buffer));
    } catch {
      return { issues: [{ level: 'ERROR', sheet: 'Fichier', row: null, column: null, message: 'Fichier illisible : un classeur .xlsx est attendu', source: 'SERVER' }], plan: null, counts: {}, checks: [] };
    }
  }

  /**
   * Import dans un projet existant (Cockpit, PMO) : simulation (`dryRun`) puis mode réel, tout ou rien.
   * Par prudence, le référentiel du projet doit être vide (sinon 409 REFERENTIAL_NOT_EMPTY).
   */
  async importIntoProject(buffer: Buffer, project: { id: string; code: string }, dryRun: boolean, ctx: WriteCtx): Promise<ImportReport> {
    const res = await this.check(buffer);
    const issues = [...res.issues];
    if (res.plan && res.plan.project.code && res.plan.project.code !== project.code) {
      issues.push({ level: 'ERROR', sheet: '05 Projet', row: null, column: 'D', message: `Le code projet du fichier (${res.plan.project.code}) ne correspond pas au projet ${project.code}`, source: 'SERVER' });
    }
    const errors = issues.filter((i) => i.level === 'ERROR');
    const report: ImportReport = { dryRun, imported: false, created: {}, errors: errors.map(toErr), warnings: issues.filter((i) => i.level === 'WARNING').map(toWarn) };
    const count = await this.prisma.person.count({ where: { projectId: project.id } }) + (await this.prisma.phase.count({ where: { projectId: project.id } }));
    if (count > 0) throw conflict('REFERENTIAL_NOT_EMPTY', 'Le référentiel du projet contient déjà des données : l’import d’initialisation est réservé à un référentiel vide');
    if (dryRun) return { ...report, created: errors.length ? {} : res.counts };
    if (errors.length || !res.plan) throw new ApiErrorWithBody(422, { code: 'IMPORT_REJECTED', message: 'Import refusé : rien n’a été créé', ...report });
    const plan = res.plan;
    const created = await this.prisma.$transaction(
      async (tx) => {
        const created = await commitPlan(tx, plan, { projectId: project.id, createProject: false, idPrefix: project.code }, this.audit, ctx);
        await tx.project.update({
          where: { id: project.id },
          data: { name: plan.project.name, objective: plan.project.objective, startDate: plan.project.startDate, targetEndDate: plan.project.targetEndDate, timezone: plan.project.timezone, country: plan.project.country, version: { increment: 1 } },
        });
        return created;
      },
      { timeout: 60_000 },
    );
    return { ...report, imported: true, created };
  }
}
