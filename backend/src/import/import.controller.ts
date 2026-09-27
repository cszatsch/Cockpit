import { Controller, HttpCode, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AccessService } from '../core/access.service';
import { Actor, CurrentActor } from '../core/auth/auth';
import { badRequest, forbidden } from '../core/errors';
import { canWriteReferential } from '../domain/rights';
import { ImportService } from './import.service';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

/** Fichier reçu par multer (mémoire). */
export interface UploadedBlob {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('cockpit · référentiel · import Excel')
@ApiBearerAuth()
@Controller('api/projects/:projectId/referential')
export class ReferentialImportController {
  constructor(private readonly imports: ImportService, private readonly access: AccessService) {}

  /** Import du fichier d'initialisation (brief § 10) : `?dryRun=true` n'écrit rien. */
  @Post('import')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }))
  async import(@CurrentActor() actor: Actor, @Param('projectId') p: string, @UploadedFile() file: UploadedBlob | undefined, @Query('dryRun') dryRun?: string) {
    const scope = await this.access.scope(actor, p);
    if (!canWriteReferential(scope.access)) throw forbidden('Import du Référentiel : PMO uniquement');
    if (!file) throw badRequest('Fichier manquant', { file: 'fichier .xlsx attendu (champ « file »)' });
    return this.imports.importIntoProject(file.buffer, scope.project, dryRun === 'true', { actor, projectId: scope.project.id, profileUsed: 'PMO' });
  }
}
