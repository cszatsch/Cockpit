import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { ReferentialService } from './referential/referential.service';
import { UsagesService } from './referential/usages.service';
import { REFERENTIAL_CONTROLLERS } from './referential/referential.controllers';
import { ProjectController } from './project/project.controller';

/** API du Cockpit : `/api/me`, `/api/projects/{projectId}/…`. */
@Module({
  controllers: [MeController, ProjectController, ...REFERENTIAL_CONTROLLERS],
  providers: [ReferentialService, UsagesService],
  exports: [ReferentialService, UsagesService],
})
export class CockpitModule {}
