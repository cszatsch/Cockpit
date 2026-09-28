import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AiController } from './ai.controller';
import { RulesController } from './rules.controller';
import { DataController } from './data.controller';
import { ConsoleController } from './console.controller';
import { SkillsController } from './skills.controller';
import { PersonaController } from './persona.controller';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { ApiCardsController, WidgetFeedsController, WidgetNewsController, WidgetProxyController } from './api-cards.controller';
import { ApiCardsService } from './api-cards.service';
import { ProfilesService } from './profiles.service';
import { UsageService } from './usage.service';
import { NotificationsService } from './notifications.service';
import { SnapshotsService } from './snapshots.service';

/** API de la Console Admin : `/api/admin/…`, réservée au profil ADMIN (RG1, RG7, RG16). */
@Module({
  // Ordre significatif : routes fixes (`snapshots/compare`) avant routes paramétrées (`snapshots/:id`).
  controllers: [ConsoleController, AccountsController, AiController, RulesController, DataController, SkillsController, PersonaController, InboxController, ApiCardsController, WidgetProxyController, WidgetFeedsController, WidgetNewsController],
  // AccountsController et DataController servent aussi de fournisseurs : les décisions du tiroir de notifications
  // reprennent exactement le traitement des pages Utilisateurs et Modules.
  providers: [ProfilesService, UsageService, NotificationsService, SnapshotsService, InboxService, ApiCardsService, AccountsController, DataController],
})
export class AdminModule {}
