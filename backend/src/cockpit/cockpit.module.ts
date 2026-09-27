import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { ReferentialService } from './referential/referential.service';
import { UsagesService } from './referential/usages.service';
import { REFERENTIAL_CONTROLLERS } from './referential/referential.controllers';
import { ProjectController } from './project/project.controller';
import { TransactionalService } from './pilotage/transactional';
import { TX_CONTROLLERS } from './pilotage/transactional.controllers';
import { PilotageController } from './pilotage/pilotage.controller';
import { AnomaliesService } from './pilotage/anomalies.service';
import { TodayController } from './today/today.controller';
import { CommitteesController } from './committees/committees.controller';

/** API du Cockpit : `/api/me`, `/api/projects/{projectId}/…`. */
@Module({
  // Ordre significatif : les routes fixes (ex. deliverables/tracking) avant les routes paramétrées (deliverables/:id).
  controllers: [MeController, ProjectController, PilotageController, TodayController, CommitteesController, ...REFERENTIAL_CONTROLLERS, ...TX_CONTROLLERS],
  providers: [ReferentialService, UsagesService, TransactionalService, AnomaliesService],
  exports: [ReferentialService, UsagesService, TransactionalService, AnomaliesService],
})
export class CockpitModule {}
