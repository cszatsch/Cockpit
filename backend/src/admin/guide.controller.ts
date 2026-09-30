import { Controller, Get, HttpCode, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import { TodayService } from '../core/today.service';
import { badRequest, notFound } from '../core/errors';
import { GUIDE_UPLOAD_HARD_LIMIT, guideFileName } from '../domain/guide';
import type { UploadedBlob } from '../import/import.controller';
import { GuideIndexService } from './guide-index.service';

/** Rôle inscrit dans la trace d'un téléchargement (la Console est réservée aux administrateurs). */
const CONSOLE_ROLE = 'Administrateur';

/**
 * Guide utilisateur de la Console (décisions du 30/09/2026) : un seul guide en vigueur, dépôt contrôlé puis indexé
 * (extraits vectorisés pour la recherche sémantique), historique des dépôts, téléchargement tracé.
 */
@ApiTags('console · guide utilisateur')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/guide')
export class GuideController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly today: TodayService,
    private readonly index: GuideIndexService,
  ) {}

  private latest() {
    return this.prisma.guideVersion.findFirst({ orderBy: { seq: 'desc' } });
  }

  /** Versions publiées, de la plus récente à la plus ancienne (la première est en vigueur), avec le modèle de vectorisation. */
  @Get('versions')
  async versions() {
    const rows = await this.prisma.guideVersion.findMany({ orderBy: { seq: 'desc' } });
    const ups = await this.prisma.guideUpload.findMany({ where: { id: { in: rows.map((r) => r.uploadId).filter((x): x is string => !!x) } } });
    return rows.map((r) => { const u = ups.find((x) => x.id === r.uploadId); return { v: r.v, at: r.at, by: r.by, size: r.size, fileName: r.fileName, pages: r.pages, chunks: r.chunks, model: u?.embeddingName ?? null, dims: u?.embeddingDims ?? null }; });
  }

  /** Journal complet des téléchargements, du plus récent au plus ancien. */
  @Get('downloads')
  async downloads() {
    const rows = await this.prisma.guideDownload.findMany({ orderBy: { at: 'desc' } });
    return rows.map((r) => ({ user: r.user, role: r.role, at: r.at, version: r.version }));
  }

  /** État : guide en vigueur et son index, dépôt en cours d'indexation (étape, avancement), dernier échec. */
  @Get('status')
  status() {
    return this.index.status();
  }

  /** Historique des dépôts (réussis ou non) : fichier, taille, pages, extraits, modèle de vectorisation, statut, motif. */
  @Get('uploads')
  uploads() {
    return this.index.uploads();
  }

  /** Téléchargement : la trace (qui, quand selon le serveur, quelle version) est enregistrée PUIS le PDF est envoyé. */
  @Get('file')
  async file(@CurrentActor() actor: Actor, @Res() res: Response) {
    const cur = await this.latest();
    if (!cur) throw notFound('Aucun guide publié');
    const buf = cur.storageKey ? await this.storage.get(cur.storageKey) : null;
    if (!buf) throw notFound('Fichier du guide introuvable');
    await this.prisma.guideDownload.create({ data: { accountId: actor.accountId, user: actor.fullName, role: CONSOLE_ROLE, at: this.today.now(), version: cur.v } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${guideFileName(cur.v)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  }

  /**
   * Dépôt : contrôles immédiats (422 avec un message clair, refus tracé), 409 si une indexation est en cours ; sinon
   * 202 et indexation en tâche de fond (suivi par `GET status`). Le guide en vigueur reste servi jusqu'à la bascule.
   */
  @Post()
  @HttpCode(202)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: GUIDE_UPLOAD_HARD_LIMIT } }))
  async replace(@CurrentActor() actor: Actor, @UploadedFile() file: UploadedBlob | undefined) {
    if (!file) throw badRequest('Fichier manquant', { file: 'PDF attendu (champ « file »)' });
    return this.index.submit(actor, file);
  }
}
