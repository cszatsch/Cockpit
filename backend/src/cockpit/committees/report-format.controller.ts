import { Body, Controller, Delete, Get, HttpCode, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessService, ProjectScope } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { AuditService } from '../../core/audit.service';
import { PrismaService } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { ApiError, badRequest, forbidden, inUse, notFound } from '../../core/errors';
import { techId } from '../../core/ids';
import { parse } from '../../core/http';
import { analyzeFormatFile } from '../../core/report-format-read';
import { canWriteTools } from '../../domain/rights';
import { FORMAT_MAX_BYTES, FORMAT_TOO_BIG, FormatReadError, PAGE_KINDS, SHAPE_ROLES, ShapeRole } from '../../domain/report-format';
import type { UploadedBlob } from '../../import/import.controller';
import { ReportFormatService } from './report-format.service';
import { ReportTemplateService } from './report-template.service';
import { COMPONENTS, configErrors, KPI_MAX, PERIODS } from '../../domain/report-components';

/** Taille maximale d'un brouillon de template (caractères JSON) : fichiers analysés compris. */
export const DRAFT_MAX_CHARS = 3_000_000;

const Role = z.enum(SHAPE_ROLES.map((r) => r.id) as [ShapeRole, ...ShapeRole[]]);
const Ref = z.object({ fileId: z.string().min(1), slide: z.number().int().min(1), roles: z.record(z.string(), Role).optional(), verified: z.boolean().optional() }).strict();
export const FormatSelectionSchema = z.object(Object.fromEntries(PAGE_KINDS.map((k) => [k, Ref.nullable().optional()])) as Record<(typeof PAGE_KINDS)[number], z.ZodOptional<z.ZodNullable<typeof Ref>>>).strict();

/** Brouillon de template pour l'aperçu (mêmes champs que la création). */
const PreviewSchema = z.object({
  name: z.string().trim().min(1).max(200),
  version: z.string().trim().min(1).max(20).default('1.0'),
  bodyId: z.string().nullable().optional(),
  components: z.array(z.object({ id: z.enum(['synthese', 'planning', 'jalons', 'risques', 'actions', 'decisions', 'barometre', 'dashboard', 'budget']), scope: z.enum(['PROJECT', 'WAVE', 'PHASE', 'WORKSTREAM']), targetId: z.string().nullable().optional(), period: z.enum(['all', 'month', 'quarter', 'last3', 'last6', 'next30', 'next90']).optional(), indicators: z.array(z.string()).max(10).optional(), newSection: z.boolean().optional(), sectionTitle: z.string().max(120).nullable().optional() }).strict()).min(1, 'au moins un composant'),
  format: FormatSelectionSchema.nullable().optional(),
}).strict();

/** Format du rapport (étape B de « Créer un template », 02/10/2026) : pages modèles, contrôles, aperçus, PowerPoint. */
@ApiTags('cockpit · comités')
@ApiBearerAuth()
@Controller('api/projects/:projectId')
export class ReportFormatController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly formats: ReportFormatService,
    private readonly reports: ReportTemplateService,
  ) {}

  /**
   * Chargement d'une page modèle (multipart, champ `file`) : .pptx (recommandé), .pdf, .png ou .jpg. Le fichier est
   * analysé immédiatement ; illisible, protégé ou non pris en charge : 400 `FORMAT_INVALID` avec un message clair.
   */
  @Post('report-formats')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: FORMAT_MAX_BYTES * 2 } }))
  async upload(@CurrentActor() actor: Actor, @Param('projectId') p: string, @UploadedFile() file: UploadedBlob | undefined) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Format du rapport : profil PMO ou Responsable');
    if (!file) throw badRequest('Fichier manquant', { file: 'obligatoire' });
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[\\/]/g, '_').slice(0, 200);
    if (file.size > FORMAT_MAX_BYTES) throw new ApiError(400, 'FORMAT_INVALID', FORMAT_TOO_BIG, { file: FORMAT_TOO_BIG });
    let analysis;
    try {
      analysis = await analyzeFormatFile(file.buffer, fileName);
    } catch (e) {
      const msg = e instanceof FormatReadError ? e.message : 'Fichier illisible : enregistrez-le de nouveau puis réessayez.';
      throw new ApiError(400, 'FORMAT_INVALID', msg, { file: msg });
    }
    const ext = analysis.kind === 'PPTX' ? '.pptx' : analysis.kind === 'PDF' ? '.pdf' : file.buffer[0] === 0x89 ? '.png' : '.jpg';
    const key = await this.storage.put(`report-formats/${scope.project.id}`, file.buffer, ext);
    const row = await this.prisma.reportFormatFile.create({
      data: { id: techId('RF'), projectId: scope.project.id, fileName, kind: analysis.kind, sizeBytes: file.size, fileKey: key, analysis: analysis as any, uploadedBy: scope.access.personId ?? actor.accountId },
    });
    await this.audit.record(this.prisma as any, { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'REPORT_FORMAT_FILE', entityId: row.id, before: null, after: { fileName, kind: analysis.kind, slides: analysis.slides.length } as any, target: fileName });
    return this.formats.fileView(row as any);
  }

  @Get('report-formats/:id')
  async get(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    return this.formats.fileView(await this.formats.file(scope, id));
  }

  /** Aperçu SVG d'une diapositive : éléments fixes à leur position et zones de contenu en pointillés. */
  @Get('report-formats/:id/slides/:n/preview')
  async preview(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Param('n') n: string, @Res() res: any) {
    const scope = await this.access.scope(actor, p);
    const svg = await this.formats.preview(scope, id, Number(n) || 0);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(svg);
  }

  /**
   * Rôles des formes d'une diapositive pour un type de page (étape B, 03/10/2026) : proposition de l'IA (règles à
   * défaut), à valider par l'utilisateur ; renvoie les formes (texte, position relative) et les libellés des rôles.
   */
  @Post('report-formats/:id/slides/:n/roles')
  @HttpCode(200)
  async roles(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Param('n') n: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Format du rapport : profil PMO ou Responsable');
    const { kind } = parse(z.object({ kind: z.enum(PAGE_KINDS) }).strict(), body);
    return this.formats.roles(scope, id, Number(n) || 0, kind);
  }

  /** Aperçu d'une diapositive avec les rôles en cours de validation (exemple voilé, zones de texte encadrées). */
  @Post('report-formats/:id/slides/:n/preview')
  @HttpCode(200)
  async previewRoles(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Param('n') n: string, @Body() body: unknown, @Res() res: any) {
    const scope = await this.access.scope(actor, p);
    const { roles } = parse(z.object({ roles: z.record(z.string(), Role) }).strict(), body);
    const svg = await this.formats.preview(scope, id, Number(n) || 0, roles);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.end(svg);
  }

  /** Suppression d'un fichier chargé : refusée s'il sert au format d'un template enregistré. */
  @Delete('report-formats/:id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden();
    const f = await this.formats.file(scope, id);
    const users = (await this.prisma.reportTemplate.findMany({ where: { projectId: scope.project.id } })).filter((t) => PAGE_KINDS.some((k) => (t.format as any)?.pages?.[k]?.fileId === id));
    if (users.length) throw inUse(users.map((t) => ({ entityType: 'REPORT_TEMPLATE', id: t.id, label: t.name })));
    await this.prisma.reportFormatFile.delete({ where: { id } });
    await this.storage.remove(f.fileKey).catch(() => undefined);
  }

  /** Contrôle du format complet (bouton « Suivant ») : erreurs bloquantes par page, alertes et résumé de l'extraction. */
  @Post('report-formats/check')
  @HttpCode(200)
  async check(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    const sel = parse(FormatSelectionSchema, body);
    const { rows: _rows, ...out } = await this.formats.check(scope, sel);
    return out;
  }

  /**
   * Anomalies avant publication (données manquantes ou incohérentes, template endommagé), sur la version en vigueur.
   * Un template antérieur aux versions est publié (version 1) à sa première utilisation.
   */
  @Get('report-templates/:id/check')
  async templateCheck(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    return this.reports.check(scope, await this.template(scope, id), scope.access.personId ?? actor.accountId);
  }

  /**
   * Publication d'un rapport : le PowerPoint de la version en vigueur, valeurs remplacées par celles du jour.
   * Anomalie bloquante : 422 `REPORT_DATA_INVALID` (ou `TEMPLATE_DAMAGED`) avec `issues`.
   */
  @Get('report-templates/:id/pptx')
  async pptx(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Res() res: any) {
    const scope = await this.access.scope(actor, p);
    const t = await this.template(scope, id);
    const out = await this.reports.generate(scope, t, scope.access.personId ?? actor.accountId);
    await this.reports.markFirstReport(t.id);
    this.send(res, out.buf, `${t.name} v${out.version.label}`);
  }

  /**
   * Génération suivie (04/10/2026) : lancement (202), avancement par phases, puis fichier remis une fois. Anomalie
   * bloquante : la tâche se termine en erreur (`REPORT_DATA_INVALID`, `TEMPLATE_DAMAGED`) avec les anomalies.
   */
  @Post('report-templates/:id/generations')
  @HttpCode(202)
  async generationStart(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    return this.reports.startGeneration(scope, await this.template(scope, id), scope.access.personId ?? actor.accountId);
  }

  @Get('report-generations/:id')
  async generationJob(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    return this.reports.generationJob(scope, id);
  }

  @Get('report-generations/:id/file')
  async generationFile(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Res() res: any) {
    const scope = await this.access.scope(actor, p);
    const f = await this.reports.generationFile(scope, id);
    this.send(res, f.buf, f.name);
  }

  /** Versions publiées du template (la plus récente en premier). */
  @Get('report-templates/:id/versions')
  async versions(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    await this.template(scope, id);
    return (await this.prisma.reportTemplateVersion.findMany({ where: { templateId: id }, orderBy: { seq: 'desc' } })).map((v) => this.reports.versionView(v));
  }

  /** PowerPoint de référence d'une version, tel que publié. */
  @Get('report-templates/:id/versions/:seq/file')
  async versionFile(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Param('seq') seq: string, @Res() res: any) {
    const scope = await this.access.scope(actor, p);
    const t = await this.template(scope, id);
    const v = await this.prisma.reportTemplateVersion.findUnique({ where: { templateId_seq: { templateId: id, seq: Number(seq) || 0 } } });
    const buf = v ? await this.storage.get(v.fileKey) : null;
    if (!v || !buf) throw notFound('Version introuvable');
    this.send(res, buf, `${t.name} v${v.label} (template)`);
  }

  /** Catalogue des composants (nature, indicateurs proposés, période par défaut) et des périodes (étapes 3 et 4). */
  @Get('report-components')
  async components(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    await this.access.scope(actor, p);
    return { components: Object.values(COMPONENTS).map((c) => ({ id: c.id, label: c.label, nature: c.nature, parts: c.parts, indicators: c.indicators, defaults: c.defaults, periodic: c.periodic, defaultPeriod: c.defaultPeriod, periods: c.periodic ? c.periods ?? PERIODS.map((x) => x.id) : [], kpiMax: c.parts.includes('kpi') ? KPI_MAX : null })), periods: PERIODS };
  }

  // ───── Brouillon de « Créer un template » (04/10/2026) : enregistré à chaque modification, un par compte ─────

  @Get('report-template-draft')
  async draft(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    const d = await this.prisma.reportTemplateDraft.findUnique({ where: { projectId_accountId: { projectId: scope.project.id, accountId: actor.accountId } } });
    return d ? { data: d.data, updatedAt: d.updatedAt } : { data: null, updatedAt: null };
  }

  @Post('report-template-draft')
  @HttpCode(200)
  async saveDraft(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Templates : profil non Lecteur (PMO, Responsable)');
    const { data } = parse(z.object({ data: z.record(z.string(), z.unknown()) }).strict(), body);
    if (JSON.stringify(data).length > DRAFT_MAX_CHARS) throw badRequest('Brouillon trop volumineux', { data: `${DRAFT_MAX_CHARS} caractères au plus` });
    const key = { projectId: scope.project.id, accountId: actor.accountId };
    const d = await this.prisma.reportTemplateDraft.upsert({ where: { projectId_accountId: key }, create: { id: techId('TD'), ...key, data: data as any }, update: { data: data as any } });
    return { updatedAt: d.updatedAt };
  }

  @Delete('report-template-draft')
  @HttpCode(204)
  async dropDraft(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    await this.prisma.reportTemplateDraft.deleteMany({ where: { projectId: scope.project.id, accountId: actor.accountId } });
  }

  /** Aperçu du rapport complet (étape Prévisualisation) : construit en mémoire, diapositives servies une à une. */
  @Post('report-templates/preview')
  @HttpCode(200)
  async templatePreview(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Templates : profil non Lecteur (PMO, Responsable)');
    const d = parse(PreviewSchema, body);
    const cfg = { ...configErrors(d.components as any), ...(await this.reports.moduleErrors(scope.project.id, d.components as any)) };
    if (Object.keys(cfg).length) throw badRequest('Composants invalides', cfg);
    const format = d.format ? await this.prisma.$transaction((db) => this.formats.formatForTemplate(scope, d.format!, db)) : null;
    return this.reports.preview(scope, { name: d.name, version: d.version, bodyId: d.bodyId ?? null, components: d.components as any, format });
  }

  /** Aperçu par étapes (étape E) : plan des pages et structure immédiatement, avancement relu par `GET …/:id`. */
  @Post('report-templates/preview-jobs')
  @HttpCode(202)
  async previewJobStart(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Templates : profil non Lecteur (PMO, Responsable)');
    const d = parse(PreviewSchema, body);
    const cfg = { ...configErrors(d.components as any), ...(await this.reports.moduleErrors(scope.project.id, d.components as any)) };
    if (Object.keys(cfg).length) throw badRequest('Composants invalides', cfg);
    const format = d.format ? await this.prisma.$transaction((db) => this.formats.formatForTemplate(scope, d.format!, db)) : null;
    return this.reports.startPreview(scope, { name: d.name, version: d.version, bodyId: d.bodyId ?? null, components: d.components as any, format });
  }

  @Get('report-templates/preview-jobs/:id')
  async previewJob(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    return this.reports.previewJob(scope, id);
  }

  @Get('report-previews/:id/slides/:n')
  async previewSlide(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Param('n') n: string, @Res() res: any) {
    const scope = await this.access.scope(actor, p);
    const svg = await this.reports.previewSlide(scope, id, Number(n) || 0);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=900');
    res.end(svg);
  }

  private async template(scope: ProjectScope, id: string) {
    const t = await this.prisma.reportTemplate.findFirst({ where: { id, projectId: scope.project.id } });
    if (!t) throw notFound('Template introuvable');
    return t as any;
  }

  private send(res: any, buf: Buffer, base: string) {
    const name = base.replace(/[^\p{L}\p{N} ()._-]+/gu, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}.pptx"; filename*=UTF-8''${encodeURIComponent(name)}.pptx`);
    res.end(buf);
  }
}
