import { Controller, Get, HttpCode, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import { TodayService } from '../core/today.service';
import { badRequest, businessRule, notFound } from '../core/errors';
import { adminCtx } from './profiles.service';
import { GUIDE_MAX_BYTES, GUIDE_PDF_ONLY, guideFileName, isPdf, nextGuideVersion } from '../domain/guide';
import type { UploadedBlob } from '../import/import.controller';

/** Rôle inscrit dans la trace d'un téléchargement (la Console est réservée aux administrateurs). */
const CONSOLE_ROLE = 'Administrateur';

/**
 * Guide utilisateur de la Console (décision du 30/09/2026) : versions du PDF, dépôt (remplacement) et téléchargement
 * tracé. Seule la version la plus récente est servie ; chaque téléchargement est enregistré par le serveur, avec son
 * horodatage, avant l'envoi du fichier (journal en ajout seul).
 */
@ApiTags('console · guide utilisateur')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/guide')
export class GuideController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly today: TodayService,
  ) {}

  private latest() {
    return this.prisma.guideVersion.findFirst({ orderBy: { seq: 'desc' } });
  }

  /** Toutes les versions publiées, de la plus récente à la plus ancienne (la première est en vigueur). */
  @Get('versions')
  async versions() {
    const rows = await this.prisma.guideVersion.findMany({ orderBy: { seq: 'desc' } });
    return rows.map((r) => ({ v: r.v, at: r.at, by: r.by, size: r.size, fileName: r.fileName }));
  }

  /** Journal complet des téléchargements, du plus récent au plus ancien. */
  @Get('downloads')
  async downloads() {
    const rows = await this.prisma.guideDownload.findMany({ orderBy: { at: 'desc' } });
    return rows.map((r) => ({ user: r.user, role: r.role, at: r.at, version: r.version }));
  }

  /** Téléchargement : la trace (qui, quand selon le serveur, quelle version) est enregistrée PUIS le PDF est envoyé. */
  @Get('file')
  async file(@CurrentActor() actor: Actor, @Res() res: Response) {
    const cur = await this.latest();
    if (!cur) throw notFound('Aucun guide publié');
    const buf = await this.storage.get(cur.storageKey);
    if (!buf) throw notFound('Fichier du guide introuvable');
    await this.prisma.guideDownload.create({ data: { accountId: actor.accountId, user: actor.fullName, role: CONSOLE_ROLE, at: this.today.now(), version: cur.v } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${guideFileName(cur.v)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  }

  /** Remplacement : PDF seulement (signature du fichier), version suivante calculée ici, en vigueur aussitôt. */
  @Post()
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: GUIDE_MAX_BYTES + 1 } }))
  async replace(@CurrentActor() actor: Actor, @UploadedFile() file: UploadedBlob | undefined) {
    if (!file) throw badRequest('Fichier manquant', { file: 'PDF attendu (champ « file »)' });
    if (!isPdf(file.buffer)) throw businessRule(GUIDE_PDF_ONLY, { file: GUIDE_PDF_ONLY });
    if (file.size > GUIDE_MAX_BYTES) throw businessRule(`Fichier trop lourd (${GUIDE_MAX_BYTES / 1024 / 1024} Mo maximum)`, { file: `${GUIDE_MAX_BYTES / 1024 / 1024} Mo maximum` });
    const key = await this.storage.put('guide', file.buffer, '.pdf');
    const created = await this.prisma.$transaction(async (db) => {
      const prev = await db.guideVersion.findFirst({ orderBy: { seq: 'desc' } });
      const v = nextGuideVersion(prev?.v);
      const row = await db.guideVersion.create({ data: { v, at: this.today.now(), accountId: actor.accountId, by: actor.fullName, size: file.size, fileName: file.originalname || guideFileName(v), storageKey: key } });
      await this.audit.action(db, adminCtx(actor), { action: 'Publication du guide utilisateur', target: `Guide utilisateur v${v}${prev ? ` · remplace la v${prev.v}` : ''}`, severity: 'SENSITIVE', entityType: 'GuideVersion', entityId: row.id, details: { v, size: file.size, fileName: row.fileName } });
      return row;
    });
    return { v: created.v, at: created.at, by: created.by, size: created.size, fileName: created.fileName };
  }
}
