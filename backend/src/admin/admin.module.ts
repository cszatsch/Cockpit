import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AiController } from './ai.controller';
import { RulesController } from './rules.controller';
import { DataController } from './data.controller';
import { ConsoleController } from './console.controller';
import { SkillsController } from './skills.controller';
import { ProfilesService } from './profiles.service';
import { UsageService } from './usage.service';
import { NotificationsService } from './notifications.service';
import { SnapshotsService } from './snapshots.service';

/** API de la Console Admin : `/api/admin/…`, réservée au profil ADMIN (RG1, RG7, RG16). */
@Module({
  // Ordre significatif : routes fixes (`snapshots/compare`) avant routes paramétrées (`snapshots/:id`).
  controllers: [ConsoleController, AccountsController, AiController, RulesController, DataController, SkillsController],
  providers: [ProfilesService, UsageService, NotificationsService, SnapshotsService],
})
export class AdminModule {}
