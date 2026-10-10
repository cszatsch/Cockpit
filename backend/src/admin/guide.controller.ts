import { Body, Controller, Get, HttpCode, Param, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor, SuperAdminOnly } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import { TodayService } from '../core/today.service';
import { badRequest, notFound } from '../core/errors';
import { parse } from '../core/http';
import { GUIDE_APP_LABELS, GUIDE_APPS, GUIDE_UNKNOWN_APP, GUIDE_UPLOAD_HARD_LIMIT, GuideApp, guideFileName, isGuideApp } from '../domain/guide';
import { fromScreenSettings, RAG_DEFAULTS, RAG_LIMITS, screenSettingsErrors, toScreenSettings } from '../domain/jev-rag';
import type { UploadedBlob } from '../import/import.controller';
import { GuideIndexService } from './guide-index.service';
import { GuideSearchService } from './guide-search.service';
import { adminCtx } from './profiles.service';

/** Rôle inscrit dans la trace d'un téléchargement (la Console est réservée aux administrateurs). */
const CONSOLE_ROLE = 'Administrateur';

const appOf = (x: string): GuideApp => {
  if (!isGuideApp(x)) throw notFound(GUIDE_UNKNOWN_APP);
  return x;
};

/**
 * Guide utilisateur de chaque application, Console et Cockpit (décisions du 30/09/2026, maquette « Guide utilisateur
 * Console Cockpit ») : un seul guide en vigueur par application, dépôt contrôlé puis indexé, téléchargement tracé
 * (trace enregistrée avant l'envoi du fichier), réglages de la recherche de Jev. Aucune donnée partagée.
 */
@ApiTags('console · guide utilisateur')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/guides')
export class GuideController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly today: TodayService,
    private readonly audit: AuditService,
    private readonly index: GuideIndexService,
    private readonly search: GuideSearchService,
  ) {}

  private async view(app: GuideApp) {
    return { ...(await this.index.data(app)), settings: toScreenSettings(await this.search.settings(app)) };
  }

  /** Les deux applications (props `guides` de l'écran : `{ console, cockpit }`). */
  @Get()
  async all() {
    return Object.fromEntries(await Promise.all(GUIDE_APPS.map(async (a) => [a, await this.view(a)] as const)));
  }

  /** Données d'une application : versions (la première en vigueur), téléchargements, index, réglages de Jev. */
  @Get(':app')
  async one(@Param('app') a: string) {
    return { ...(await this.view(appOf(a))), defaults: toScreenSettings(RAG_DEFAULTS), limits: RAG_LIMITS };
  }

  /** Téléchargement : la trace (qui, quand selon le serveur, quelle application, quelle version) est enregistrée PUIS le PDF est envoyé. */
  @Get(':app/file')
  async file(@CurrentActor() actor: Actor, @Param('app') a: string, @Res() res: Response) {
    const app = appOf(a);
    const cur = await this.index.current(app);
    if (!cur) throw notFound(`Aucun guide ${GUIDE_APP_LABELS[app].of} publié`);
    const buf = cur.storageKey ? await this.storage.get(cur.storageKey) : null;
    if (!buf) throw notFound('Fichier du guide introuvable');
    await this.prisma.guideDownload.create({ data: { app, accountId: actor.accountId, user: actor.fullName, role: CONSOLE_ROLE, at: this.today.now(), version: cur.v } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${guideFileName(cur.v, app)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buf);
  }

  /**
   * Dépôt ou remplacement : contrôles immédiats (422, message clair, refus tracé), 409 si une indexation de la même
   * application est en cours ; sinon 202 : la version suivante est en vigueur, l'indexation part en tâche de fond.
   */
  @Post(':app')
  @HttpCode(202)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: GUIDE_UPLOAD_HARD_LIMIT } }))
  async replace(@CurrentActor() actor: Actor, @Param('app') a: string, @UploadedFile() file: UploadedBlob | undefined) {
    const app = appOf(a);
    if (!file) throw badRequest('Fichier manquant', { file: 'PDF attendu (champ « file »)' });
    return this.index.submit(app, actor, file);
  }

  /** Réglages de la recherche de Jev dans le guide de l'application (format de l'écran : délais en secondes), revalidés. */
  @SuperAdminOnly()
  @Put(':app/settings')
  async settings(@CurrentActor() actor: Actor, @Param('app') a: string, @Body() body: unknown) {
    const app = appOf(a);
    const n = z.number();
    const input = parse(z.object({ k: n, keep: n, thr: n, tv: n, tr: n, tw: n }).strict(), body);
    const errs = screenSettingsErrors(input);
    if (Object.keys(errs).length) throw badRequest('Réglages invalides', errs);
    const before = toScreenSettings(await this.search.settings(app));
    const s = fromScreenSettings(input);
    await this.prisma.$transaction(async (db) => {
      await db.jevRagSettings.upsert({ where: { id: app }, create: { id: app, ...s, updatedBy: actor.fullName }, update: { ...s, updatedBy: actor.fullName } });
      await this.audit.action(db, adminCtx(actor), { action: 'Modification des réglages de recherche de Jev', target: `Recherche dans le guide utilisateur ${GUIDE_APP_LABELS[app].of}`, severity: 'SENSITIVE', entityType: 'JevRagSettings', entityId: app, details: { app, avant: before, apres: input } });
    });
    return this.one(app);
  }
}
