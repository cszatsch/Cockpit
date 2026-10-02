import { Body, Controller, Delete, Get, HttpCode, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessService } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { AuditService } from '../../core/audit.service';
import { PrismaService } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { ApiError, badRequest, forbidden, inUse, notFound } from '../../core/errors';
import { techId } from '../../core/ids';
import { parse } from '../../core/http';
import { analyzeFormatFile } from '../../core/report-format-read';
import { canWriteTools } from '../../domain/rights';
import { FORMAT_MAX_BYTES, FORMAT_TOO_BIG, FormatReadError, PAGE_KINDS } from '../../domain/report-format';
import type { UploadedBlob } from '../../import/import.controller';
import { ReportFormatService } from './report-format.service';

const Ref = z.object({ fileId: z.string().min(1), slide: z.number().int().min(1) }).strict();
export const FormatSelectionSchema = z.object(Object.fromEntries(PAGE_KINDS.map((k) => [k, Ref.nullable().optional()])) as Record<(typeof PAGE_KINDS)[number], z.ZodOptional<z.ZodNullable<typeof Ref>>>).strict();

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

  /** PowerPoint du template avec les données du jour (format du template, ou présentation par défaut). */
  @Get('report-templates/:id/pptx')
  async pptx(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Res() res: any) {
    const scope = await this.access.scope(actor, p);
    const t = await this.prisma.reportTemplate.findFirst({ where: { id, projectId: scope.project.id } });
    if (!t) throw notFound('Template introuvable');
    const buf = await this.formats.generate(scope, t);
    const name = `${t.name} v${t.version}`.replace(/[^\p{L}\p{N} ._-]+/gu, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}.pptx"; filename*=UTF-8''${encodeURIComponent(name)}.pptx`);
    res.end(buf);
  }
}
