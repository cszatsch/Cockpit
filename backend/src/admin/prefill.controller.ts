import { Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Actor, AdminOnly, CurrentActor } from '../core/auth/auth';
import { ApiError } from '../core/errors';
import { PREFILL_FORMAT_MESSAGE } from '../core/prefill-text';
import { PREFILL_MAX_BYTES, PREFILL_MAX_FILES } from '../domain/prefill';
import { PrefillEvent, PrefillService } from './prefill.service';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Initialisation d'un projet, point d'entrée unique (maquette v3 du 07/10/2026) : un seul dépôt, le format du fichier
 * décide du traitement — proposition commerciale (PDF, DOCX, PPTX) : préremplissage par IA des 14 onglets ; Excel
 * d'initialisation rempli (XLSX) : contrôle de conformité onglet par onglet. Réservé, comme l'import, à
 * l'Administrateur. Routes de la proposition du brief adaptées aux conventions de la Console (`/api/admin/projects/…`).
 */
@ApiTags('console · initialisation d’un projet')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/admin/projects/init')
export class PrefillController {
  constructor(private readonly prefill: PrefillService) {}

  /** Les 14 onglets et leur nombre de champs attendus. */
  @Get('tabs')
  tabs() {
    return this.prefill.tabs();
  }

  /** Modèle Excel vierge, au nom de l'utilisateur et du jour. */
  @Get('template')
  async template(@CurrentActor() actor: Actor, @Res() res: Response) {
    send(res, await this.prefill.blankTemplate(actor));
  }

  /**
   * Dépôt (champ `files`, ou `file`) : extension, taille (25 Mo), signature et lisibilité contrôlées ; 422 `FORMAT` ou
   * `LECTURE` sinon (`fields.fichier` : le fichier refusé). → `{ id, nom, taille, type: proposition | excel, pages? }`.
   * Une proposition peut venir avec ses annexes (lues comme un seul document) ; un Excel se dépose seul.
   */
  @Post('files')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  // Limites de multer au-dessus des plafonds : un fichier trop gros ou en trop reçoit l'erreur FORMAT du contrôle.
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: PREFILL_MAX_BYTES + 1024 * 1024, files: PREFILL_MAX_FILES + 1 } }))
  upload(@CurrentActor() actor: Actor, @UploadedFiles() files: Array<{ fieldname: string; originalname: string; size: number; buffer: Buffer }> | undefined) {
    const list = (files ?? []).filter((f) => f.fieldname === 'files' || f.fieldname === 'file');
    if (!list.length) throw new ApiError(422, 'FORMAT', PREFILL_FORMAT_MESSAGE);
    return this.prefill.upload(actor, list);
  }

  /** Exemple ORION fourni avec l'application (proposition). */
  @Post('files/example')
  @HttpCode(201)
  example(@CurrentActor() actor: Actor) {
    return this.prefill.example(actor);
  }

  /** Réinitialisation : traitement arrêté ; fichiers, texte, résultats, Excel prérempli et import gardé supprimés aussitôt. */
  @Delete('files/:id')
  @HttpCode(204)
  forget(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.prefill.forget(actor, id);
  }

  /** Lance l'analyse (proposition) ou le contrôle (Excel), asynchrone → `{ tacheId }`. */
  @Post('files/:id/processing')
  @HttpCode(202)
  process(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.prefill.process(actor, id);
  }

  /**
   * Flux SSE : `progression`, `onglet_termine`, puis `termine` ou `erreur` (ou `annule`) ; onglets déjà traités rejoués
   * à la connexion. Chaque message : `event: <type>` et `data: <JSON>`.
   */
  @Get('tasks/:id/events')
  async events(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const write = (e: PrefillEvent) => { const { type, ...data } = e; res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); };
    const final = (e: PrefillEvent) => e.type === 'termine' || e.type === 'erreur' || e.type === 'annule';
    let started = false;
    const buffered: PrefillEvent[] = [];
    const off = await this.prefill.subscribe(id, (e) => { if (started) { write(e); if (final(e)) res.end(); } else buffered.push(e); });
    started = true;
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    buffered.forEach(write);
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

  /** Voie proposition : `[{ ongletIndex, onglet, champ, valeur, type, confiance, motif, page }]`. */
  @Get('tasks/:id/checks')
  checks(@Param('id') id: string) {
    return this.prefill.checks(id);
  }

  /** Voie Excel : `[{ ongletIndex, onglet, champ, valeur, motif, gravite: bloquant | avertissement, cellule }]`. */
  @Get('tasks/:id/anomalies')
  anomalies(@Param('id') id: string) {
    return this.prefill.anomalies(id);
  }

  /** Voie Excel, fichier conforme : vue de l'étape « Prévisualiser » ; 409 si le fichier n'est pas conforme. */
  @Get('tasks/:id/preview')
  preview(@Param('id') id: string) {
    return this.prefill.preview(id);
  }

  /** Voie proposition : Excel prérempli. */
  @Get('tasks/:id/excel')
  async excel(@CurrentActor() actor: Actor, @Param('id') id: string, @Res() res: Response) {
    send(res, await this.prefill.excel(actor, id));
  }

  /** Voie Excel : rapport de contrôle (.xlsx). */
  @Get('tasks/:id/report')
  async report(@CurrentActor() actor: Actor, @Param('id') id: string, @Res() res: Response) {
    send(res, await this.prefill.report(actor, id));
  }
}

/** Classeur téléchargé sous son nom (UTF-8). */
function send(res: Response, { buffer, fileName }: { buffer: Buffer; fileName: string }) {
  res.set({ 'Content-Type': XLSX_TYPE, 'Content-Disposition': `attachment; filename="initialisation.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`, 'Cache-Control': 'no-store' });
  res.send(buffer);
}
