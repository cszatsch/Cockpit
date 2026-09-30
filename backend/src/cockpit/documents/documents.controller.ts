import { Body, Controller, Get, OnModuleInit, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AccessService, ProjectScope } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { AuditService } from '../../core/audit.service';
import { PrismaService } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { TodayService } from '../../core/today.service';
import { JobsService } from '../../core/jobs.service';
import { LlmService } from '../../core/llm.service';
import { badRequest, forbidden, notFound } from '../../core/errors';
import { techId } from '../../core/ids';
import { parse } from '../../core/http';
import { canWriteTools } from '../../domain/rights';
import type { UploadedBlob } from '../../import/import.controller';

/** Formats acceptés à l'import de documents (brief § 9.8). */
export const DOCUMENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.msg': 'application/vnd.ms-outlook',
  '.eml': 'message/rfc822',
};
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
/** Documents RESTRICTED : réservés aux profils globaux (règle prudente, le brief ne la précise pas). */
export const RESTRICTED_VISIBLE_TO_GLOBAL_ONLY = true;

const LinkSchema = z.object({ entityType: z.enum(['RISK', 'ISSUE', 'ACTION', 'DECISION', 'MILESTONE', 'DELIVERABLE', 'SESSION', 'REPORT', 'PROJECT', 'WORKSTREAM']), entityId: z.string().min(1) });
const Meta = z
  .object({ n: z.string().trim().min(1).max(300), type: z.string().trim().min(1).max(80), dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), v: z.string().max(20), conf: z.enum(['INTERNAL', 'RESTRICTED']) })
  .partial()
  .strict();

/** Base de connaissance (brief § 9.8). */
@ApiTags('cockpit · documents')
@ApiBearerAuth()
@Controller('api/projects/:projectId/documents')
export class DocumentsController implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly today: TodayService,
    private readonly jobs: JobsService,
    private readonly llm: LlmService,
  ) {}

  onModuleInit() {
    this.jobs.register('document.extract', (d) => this.extract(d.documentId));
  }

  view(d: any) {
    return { id: d.id, n: d.n, type: d.type, dateIso: d.dateIso, v: d.v, conf: d.conf, src: d.src, ext: d.ext, mime: d.mime, pages: d.pages, sizeBytes: d.sizeBytes, hasFile: !!d.fileKey, linkedLabel: d.linkedLabel, links: (d.links ?? []).map((l: any) => ({ entityType: l.entityType, entityId: l.entityId })), createdAt: d.createdAt, version: d.version };
  }

  private visible(scope: ProjectScope, d: { conf: string }) {
    return !(RESTRICTED_VISIBLE_TO_GLOBAL_ONLY && d.conf === 'RESTRICTED' && !(scope.access.pmo || scope.access.admin));
  }

  @Get()
  async list(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Query('type') type?: string, @Query('q') q?: string) {
    const scope = await this.access.scope(actor, p);
    const rows = await this.prisma.document.findMany({
      where: { projectId: scope.project.id, ...(type ? { type } : {}), ...(q ? { n: { contains: q, mode: 'insensitive' } } : {}) },
      include: { links: true },
      orderBy: { dateIso: 'desc' },
    });
    return rows.filter((d) => this.visible(scope, d)).map((d) => this.view(d));
  }

  /** Dépôt (multipart) : extraction asynchrone, statut PENDING (§ 9.8). */
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES } }))
  async upload(@CurrentActor() actor: Actor, @Param('projectId') p: string, @UploadedFile() file: UploadedBlob | undefined, @Body() body: Record<string, string>) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteTools(scope.access)) throw forbidden('Dépôt de documents : profil non Lecteur (PMO, Responsable)');
    if (!file) throw badRequest('Fichier manquant', { file: 'obligatoire' });
    const ext = (/\.[a-z0-9]+$/i.exec(file.originalname)?.[0] ?? '').toLowerCase();
    if (!DOCUMENT_TYPES[ext]) throw badRequest('Format non accepté', { file: `formats acceptés : ${Object.keys(DOCUMENT_TYPES).join(' ')}` });
    const meta = parse(Meta, { n: body.n || file.originalname.replace(/\.[^.]+$/, ''), type: body.type || 'Livrable', conf: body.conf || 'INTERNAL', ...(body.v ? { v: body.v } : {}), ...(body.dateIso ? { dateIso: body.dateIso } : {}) });
    const key = await this.storage.put(`documents/${scope.project.id}`, file.buffer, ext);
    const doc = await this.prisma.$transaction(async (db) => {
      const d = await db.document.create({
        data: { id: techId('doc'), projectId: scope.project.id, n: meta.n!, type: meta.type!, conf: meta.conf ?? 'INTERNAL', v: meta.v ?? 'v1', dateIso: meta.dateIso ?? this.today.today(scope.project.timezone), src: 'UPLOADED', ext: 'PENDING', mime: DOCUMENT_TYPES[ext], fileKey: key, sizeBytes: file.size },
        include: { links: true },
      });
      await this.audit.record(db, { actor, projectId: scope.project.id, profileUsed: scope.access.pmo ? 'PMO' : 'RESPONSABLE' }, { entityType: 'DOCUMENT', entityId: d.id, before: null, after: this.view(d), target: d.n });
      return d;
    });
    await this.jobs.enqueue('document.extract', { documentId: doc.id });
    return this.view(doc);
  }

  /** Extraction (bouchon) : pages comptées pour les PDF, analyse par la chaîne Documents (vectorisation → reclassement → synthèse). */
  async extract(documentId: string) {
    const d = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!d || !d.fileKey) return;
    const buf = await this.storage.get(d.fileKey);
    let ext: 'SUCCEEDED' | 'PARTIAL' | 'UNSUPPORTED' = 'SUCCEEDED';
    let pages: number | null = null;
    if (d.mime === 'application/pdf' && buf) pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length || null;
    if (d.mime === 'message/rfc822' || d.mime === 'application/vnd.ms-outlook') ext = 'PARTIAL';
    try {
      await this.llm.analyzeDocument({ prompt: `Extrais décisions, actions et risques du document « ${d.n} » (${d.type}).`, text: buf ? buf.toString('utf8').slice(0, 200_000) : d.n, projectId: d.projectId, source: 'COCKPIT' });
    } catch {
      ext = 'UNSUPPORTED';
    }
    await this.prisma.document.update({ where: { id: d.id }, data: { ext, pages, version: { increment: 1 } } });
  }

  @Get(':id/file')
  async file(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Param('id') id: string, @Res() res: any) {
    const scope = await this.access.scope(actor, p);
    const d = await this.prisma.document.findFirst({ where: { id, projectId: scope.project.id } });
    if (!d || !this.visible(scope, d)) throw notFound();
    const buf = d.fileKey ? await this.storage.get(d.fileKey) : null;
    if (!buf) throw notFound('Fichier non disponible (document de démonstration sans contenu)');
    res.setHeader('Content-Type', d.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(d.n)}${Object.entries(DOCUMENT_TYPES).find(([, m]) => m === d.mime)?.[0] ?? ''}"`);
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
