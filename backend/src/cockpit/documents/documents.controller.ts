import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessService, ProjectScope } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { AuditService } from '../../core/audit.service';
import { PrismaService } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { badRequest, forbidden, notFound } from '../../core/errors';
import { parse } from '../../core/http';
import { canWriteTools } from '../../domain/rights';
import type { UploadedBlob } from '../../import/import.controller';
import { KB_FORMATS, KB_MAX_BYTES, readSummary } from '../../domain/kb-documents';
import { KbService } from './kb.service';

/** Taille maximale : règle de la Base de connaissance (`domain/kb-documents.ts`, décision du 30/09/2026). */
export const MAX_DOCUMENT_BYTES = KB_MAX_BYTES;

const LinkSchema = z.object({ entityType: z.enum(['RISK', 'ISSUE', 'ACTION', 'DECISION', 'MILESTONE', 'DELIVERABLE', 'SESSION', 'REPORT', 'PROJECT', 'WORKSTREAM']), entityId: z.string().min(1) });
const Meta = z
  .object({ n: z.string().trim().min(1).max(300), type: z.string().trim().min(1).max(80), dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), v: z.string().max(20), conf: z.enum(['INTERNAL', 'RESTRICTED']) })
  .partial()
  .strict();

/** Base de connaissance (brief § 9.8). */
@ApiTags('cockpit · documents')
@ApiBearerAuth()
@Controller('api/projects/:projectId/documents')
export class DocumentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly kb: KbService,
  ) {}

  view(d: any) {
    return {
      id: d.id, n: d.n, type: d.type, dateIso: d.dateIso, v: d.v, conf: d.conf, src: d.src, ext: d.ext, mime: d.mime, pages: d.pages, sizeBytes: d.sizeBytes, hasFile: !!d.fileKey, linkedLabel: d.linkedLabel,
      links: (d.links ?? []).map((l: any) => ({ entityType: l.entityType, entityId: l.entityId })), createdAt: d.createdAt, version: d.version,
      format: d.format ?? null, fileName: d.fileName ?? null, uploadedBy: d.uploadedBy ?? null, uploadedAt: d.uploadedAt ?? null, error: d.error ?? null, extNote: d.extNote ?? null, progress: d.progress ?? null, stepLabel: d.stepLabel ?? null, chunkCount: d.chunkCount ?? null,
    };
  }

  @Get()
  async list(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Query('type') type?: string, @Query('q') q?: string) {
    const scope = await this.access.scope(actor, p);
    const rows = await this.prisma.document.findMany({
      where: { projectId: scope.project.id, ...(type ? { type } : {}), ...(q ? { n: { contains: q, mode: 'insensitive' } } : {}) },
      include: { links: true },
      orderBy: { dateIso: 'desc' },
    });
    return rows.filter((d) => this.kb.visible(scope, actor, d)).map((d) => ({ ...this.view(d), canDelete: this.kb.canDelete(scope, actor, d) }));
  }

  /**
   * Dépôt (multipart, champ `file` ; `n`, `type`, `conf`, `dateIso` facultatifs) : contrôles et extraction immédiats,
   * puis résumé et vectorisation en tâche de fond (statut PENDING). Doublon de nom : 409 `DUPLICATE_NAME`, à renvoyer
   * avec `replaceId` (remplacer) ou `keepBoth=true` (garder les deux) ; contenu identique : 409 `DUPLICATE_CONTENT`.
   */
  @Post()
  @ApiConsumes('multipart/form-data')
  // Limite de multer au double : au-delà de 25 Mo, le refus vient du contrôle du serveur, avec un message clair.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES * 2 } }))
  async upload(@CurrentActor() actor: Actor, @Param('projectId') p: string, @UploadedFile() file: UploadedBlob | undefined, @Body() body: Record<string, string>) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Dépôt de documents : profil PMO ou Responsable');
    if (!file) throw badRequest('Fichier manquant', { file: 'obligatoire' });
    const meta = parse(Meta, { ...(body.n ? { n: body.n } : {}), ...(body.type ? { type: body.type } : {}), ...(body.conf ? { conf: body.conf } : {}), ...(body.dateIso ? { dateIso: body.dateIso } : {}) });
    const doc = await this.kb.submit(scope, actor, file, meta as any, { replaceId: body.replaceId || undefined, keepBoth: body.keepBoth === 'true' });
    return this.view(doc);
  }

  /** Historique de la Base de connaissance (dépôts, refus, remplacements, indexations, échecs, suppressions) : PMO. */
  @Get('history')
  async history(@CurrentActor() actor: Actor, @Param('projectId') p: string) {
    const scope = await this.access.scope(actor, p);
    if (!(scope.access.pmo || scope.access.admin)) throw forbidden('Historique de la Base de connaissance : PMO');
    return this.kb.history(scope);
  }

  /** Recherche sémantique dans les documents visibles (extraits, document, repère, similarité). */
  @Get('search')
  async search(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Query('q') q?: string, @Query('k') k?: string) {
    const scope = await this.access.scope(actor, p);
    if (!q || !q.trim()) throw badRequest('Question manquante', { q: 'obligatoire' });
    return this.kb.search(scope, actor, q.trim().slice(0, 1000), k ? Number(k) || 8 : 8);
  }

  /** Fiche d'un document : métadonnées, résumé, description, index. */
  @Get(':id')
  async one(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    const d = await this.prisma.document.findFirst({ where: { id, projectId: scope.project.id }, include: { links: true } });
    if (!d || !this.kb.visible(scope, actor, d)) throw notFound();
    // Résumé structuré (lecture tolérante : ancien format ou réponse coupée réparés, jamais de JSON brut).
    const summary = readSummary(d.summary);
    return { ...this.view(d), summary, description: summary?.description || d.description, embeddingModel: d.embeddingName, embeddingDims: d.embeddingDims, canDelete: this.kb.canDelete(scope, actor, d) };
  }

  /** Nouveau traitement (résumé et vecteurs refaits à partir du fichier) : PMO, ou auteur du dépôt. */
  @Post(':id/reprocess')
  @HttpCode(202)
  async reprocess(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    return this.view(await this.kb.reprocess(scope, actor, id));
  }

  /** Suppression : fichier, résumé et tous les vecteurs (PMO, ou auteur du dépôt). */
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string) {
    const scope = await this.access.scope(actor, p);
    await this.kb.remove(scope, actor, id);
  }

  @Get(':id/file')
  async file(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Res() res: any) {
    const scope = await this.access.scope(actor, p);
    const d = await this.prisma.document.findFirst({ where: { id, projectId: scope.project.id } });
    if (!d || !this.kb.visible(scope, actor, d)) throw notFound();
    const buf = d.fileKey ? await this.storage.get(d.fileKey) : null;
    if (!buf) throw notFound('Fichier non disponible (document de démonstration sans contenu)');
    res.setHeader('Content-Type', d.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(d.n)}${Object.entries(KB_FORMATS).find(([, f]) => f.mime === d.mime)?.[0] ?? ''}"`);
    res.end(buf);
  }

  @Put(':id/links')
  async links(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden();
    const { links } = parse(z.object({ links: z.array(LinkSchema) }).strict(), body);
    return this.prisma.$transaction(async (db) => {
      const d = await db.document.findFirst({ where: { id, projectId: scope.project.id }, include: { links: true } });
      if (!d) throw notFound();
      await db.documentLink.deleteMany({ where: { documentId: id } });
      const uniq = [...new Map(links.map((l) => [`${l.entityType}|${l.entityId}`, l])).values()];
      await db.documentLink.createMany({ data: uniq.map((l) => ({ documentId: id, ...l })) });
      const after = await db.document.update({ where: { id }, data: { linkedLabel: null, version: { increment: 1 } }, include: { links: true } });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'DOCUMENT', entityId: id, before: { links: this.view(d).links }, after: { links: this.view(after).links }, target: d.n });
      return this.view(after);
    });
  }

  @Patch(':id')
  async patch(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Body() body: unknown) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden();
    const input = parse(Meta, body);
    return this.prisma.$transaction(async (db) => {
      const d = await db.document.findFirst({ where: { id, projectId: scope.project.id }, include: { links: true } });
      if (!d) throw notFound();
      const after = await db.document.update({ where: { id }, data: { ...input, version: { increment: 1 } }, include: { links: true } });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'DOCUMENT', entityId: id, before: this.view(d), after: this.view(after), target: d.n });
      return this.view(after);
    });
  }
}
