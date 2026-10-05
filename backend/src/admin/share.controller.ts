import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { z } from 'zod';
import { Actor, AdminOnly, CurrentActor, Public } from '../core/auth/auth';
import { parse } from '../core/http';
import { ShareEvent, ShareService } from './share.service';

const RequestSchema = z.object({
  data: z.enum(['current', 'demo', 'empty']),
  projects: z.array(z.string()).default([]),
  keys: z.array(z.string()).default([]),
  smtp: z.boolean().default(false),
  files: z.boolean().default(false),
  code: z.boolean().default(true),
  recipient: z.object({ name: z.string().max(120), email: z.string().max(200) }),
  prefill: z.object({ enabled: z.boolean(), profiles: z.array(z.string()).default([]) }).default({ enabled: false, profiles: [] }),
  update: z.enum(['keep', 'replace']).default('keep'),
});

/**
 * Partager Cockpit (spécification `docs/specs/PARTAGE - specification.md`, 05/10/2026) : paquet d'installation
 * Windows pour une personne. Réservé à l'Administrateur ; le fichier se télécharge par un lien signé de 15 minutes.
 */
@ApiTags('console · partager cockpit')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/share')
export class ShareController {
  constructor(private readonly share: ShareService) {}

  /** Version, nouveautés, projets, clés (masques et plafonds), SMTP, fichiers, profils, tailles. */
  @Get('context')
  context() {
    return this.share.context();
  }

  @Post('packages')
  start(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.share.start(actor, parse(RequestSchema, body));
  }

  @Get('packages')
  history() {
    return this.share.history();
  }

  /**
   * Flux SSE de la génération : `{ step, status }` par étape, puis `{ done, size, sha256, fileName, code? }` ou
   * `{ failed, message }`. Le code n'est jamais journalisé.
   */
  @Get('packages/:jobId/events')
  async events(@Param('jobId') id: string, @Req() req: Request, @Res() res: Response) {
    const send = (e: ShareEvent) => { res.write(`data: ${JSON.stringify(e)}\n\n`); };
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
    };
    const buffered: ShareEvent[] = [];
    // Erreurs (404) renvoyées au format habituel avant l'ouverture du flux.
    const off = await this.share.subscribe(id, (e) => { if (started) { send(e); if ('done' in e || 'failed' in e) res.end(); } else buffered.push(e); });
    begin();
    buffered.forEach(send);
    if (!off) { res.end(); return; }
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); off(); });
    res.on('finish', () => { clearInterval(ping); off(); });
  }

  /** URL signée (15 min) vers le ZIP ; 410 si le fichier a été supprimé. */
  @Get('packages/:id/download')
  download(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.share.downloadUrl(actor, id);
  }

  /** Supprime le ZIP du serveur ; la ligne de l'historique reste ; action sensible au journal d'audit. */
  @Delete('packages/:id/file')
  deleteFile(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.share.deleteFile(actor, id);
  }
}

/** Fichier du paquet par lien signé (compte administrateur, 15 min) : utilisable par un simple lien du navigateur. */
@ApiTags('console · partager cockpit')
@Public()
@Controller('api/admin/share/files')
export class ShareFileController {
  constructor(private readonly share: ShareService) {}

  @Get(':id')
  async file(@Param('id') id: string, @Query('a') a: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const f = await this.share.signedFile(id, a, exp, sig);
    res.status(200).set({ 'Content-Type': 'application/zip', 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${f.fileName}"` });
    createReadStream(f.abs).pipe(res);
  }
}
