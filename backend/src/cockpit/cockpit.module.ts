import { JevCockpitDocsService } from './assistant/jev-cockpit-docs.service';
import { JevCockpitWriteService } from './assistant/jev-cockpit-write.service';
import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MyNotificationsController } from './my-notifications.controller';
import { ReferentialService } from './referential/referential.service';
import { UsagesService } from './referential/usages.service';
import { REFERENTIAL_CONTROLLERS } from './referential/referential.controllers';
import { ProjectController } from './project/project.controller';
import { TransactionalService } from './pilotage/transactional';
import { TX_CONTROLLERS } from './pilotage/transactional.controllers';
import { PilotageController } from './pilotage/pilotage.controller';
import { AnomaliesService } from './pilotage/anomalies.service';
import { TodayController } from './today/today.controller';
import { TodayGreetingService } from './today/today-greeting.service';
import { CommitteesController } from './committees/committees.controller';
import { BootstrapController } from './bootstrap/bootstrap.controller';
import { BootstrapService } from './bootstrap/bootstrap.service';
import { DocumentsController } from './documents/documents.controller';
import { KbService } from './documents/kb.service';
import { ReportFormatController } from './committees/report-format.controller';
import { ReportFormatService } from './committees/report-format.service';
import { ReportTemplateService } from './committees/report-template.service';
import { CollabController } from './collab/collab.controller';
import { AssistantController } from './assistant/assistant.controller';
import { AdminModule } from '../admin/admin.module';

/** API du Cockpit : `/api/me`, `/api/projects/{projectId}/…`. */
@Module({
  imports: [AdminModule],
  // Ordre significatif : les routes fixes (ex. deliverables/tracking) avant les routes paramétrées (deliverables/:id).
  controllers: [MeController, MyNotificationsController, ProjectController, BootstrapController, PilotageController, TodayController, CommitteesController, ReportFormatController, DocumentsController, CollabController, AssistantController, ...REFERENTIAL_CONTROLLERS, ...TX_CONTROLLERS],
  providers: [ReferentialService, UsagesService, TransactionalService, AnomaliesService, BootstrapService, KbService, ReportFormatService, ReportTemplateService, JevCockpitDocsService, JevCockpitWriteService, TodayGreetingService],
  exports: [ReferentialService, UsagesService, TransactionalService, AnomaliesService],
})
export class CockpitModule {}
