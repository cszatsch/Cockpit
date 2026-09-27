import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessService } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { BootstrapService } from './bootstrap.service';

@ApiTags('cockpit · chargement initial')
@ApiBearerAuth()
@Controller('api/projects/:projectId')
export class BootstrapController {
  constructor(private readonly svc: BootstrapService, private readonly access: AccessService) {}

  /** Chargement initial de compatibilité : forme de `rise-data.js` + `planning-data.js` (brief § 9.3). */
  @Get('bootstrap')
  async bootstrap(@CurrentActor() actor: Actor, @Param('projectId') projectId: string) {
    return this.svc.build(actor, await this.access.scope(actor, projectId));
  }
}
