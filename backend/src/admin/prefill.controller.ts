import { Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Actor, AdminOnly, CurrentActor } from '../core/auth/auth';
import { ApiError } from '../core/errors';
import { PREFILL_FORMAT_MESSAGE } from '../core/prefill-text';
import { PREFILL_MAX_BYTES } from '../domain/prefill';
import { PrefillEvent, PrefillService } from './prefill.service';

/**
 * Initialisation d'un projet, étape « Préremplir » (07/10/2026, maquette « Initialisation projet v2 ») : la proposition
 * commerciale préremplit les 14 onglets du fichier d'initialisation. Réservé, comme l'import, à l'Administrateur.
 * Routes de la proposition du brief adaptées aux conventions de la Console (`/api/admin/projects/…`).
 */
@ApiTags('console · initialisation · préremplissage')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/projects/prefill')
export class PrefillController {
  constructor(private readonly prefill: PrefillService) {}

  /** Les 14 onglets et leur nombre de champs attendus. */
  @Get('tabs')
  tabs() {
    return this.prefill.tabs();
  }

  /** Dépôt : extension, taille, signature et lisibilité contrôlées ; 422 `FORMAT` ou `LECTURE` sinon. */
  @Post('proposals')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  // Limite de multer au-dessus du plafond : un fichier trop gros reçoit l'erreur FORMAT du contrôle, pas un 413.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PREFILL_MAX_BYTES + 1024 * 1024 } }))
  upload(@CurrentActor() actor: Actor, @UploadedFile() file: { originalname: string; size: number; buffer: Buffer } | undefined) {
    if (!file) throw new ApiError(422, 'FORMAT', PREFILL_FORMAT_MESSAGE);
    return this.prefill.upload(actor, file);
  }

  /** Exemple ORION fourni avec l'application. */
  @Post('proposals/example')
  @HttpCode(201)
  example(@CurrentActor() actor: Actor) {
    return this.prefill.example(actor);
  }

  /** Lance l'analyse asynchrone → `{ tacheId }`. */
  @Post('proposals/:id/analysis')
  @HttpCode(202)
  analyse(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.prefill.analyse(actor, id);
  }

  /**
   * Flux SSE : `progression`, `onglet_termine`, puis `termine` ou `erreur` (ou `annule`) ; onglets déjà traités rejoués
   * à la connexion. Chaque message : `event: <type>` et `data: <JSON>`.
   */
  @Get('tasks/:id/events')
  async events(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const send = (e: PrefillEvent) => { const { type, ...data } = e; res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); };
    const final = (e: PrefillEvent) => e.type === 'termine' || e.type === 'erreur' || e.type === 'annule';
    let started = false;
    const buffered: PrefillEvent[] = [];
    const off = await this.prefill.subscribe(id, (e) => { if (started) { send(e); if (final(e)) res.end(); } else buffered.push(e); });
    started = true;
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    buffered.forEach(send);
    if (!off || buffered.some(final)) { off?.(); res.end(); return; }
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); off(); });
    res.on('finish', () => { clearInterval(ping); off(); });
  }

  /** Reprise à partir de l'onglet en échec. */
  @Post('tasks/:id/resume')
  @HttpCode(202)
  resume(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.prefill.resume(actor, id);
  }

  /** Annulation : la tâche s'arrête côté serveur ; document et texte supprimés. */
  @Delete('tasks/:id')
  @HttpCode(204)
  cancel(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.prefill.cancel(actor, id);
  }

  /** `[{ ongletIndex, onglet, champ, valeur, type, confiance, motif, page }]`. */
  @Get('tasks/:id/checks')
  checks(@Param('id') id: string) {
    return this.prefill.checks(id);
  }

  @Get('tasks/:id/excel')
  async excel(@CurrentActor() actor: Actor, @Param('id') id: string, @Res() res: Response) {
    const { buffer, fileName } = await this.prefill.excel(actor, id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="prefill.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'no-store',
    });
    res.send(buffer);
  }
}
