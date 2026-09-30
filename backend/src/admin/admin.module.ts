import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AiController } from './ai.controller';
import { RulesController } from './rules.controller';
import { SmtpController } from './smtp.controller';
import { NotificationWriterService } from './notification-writer.service';
import { DataController } from './data.controller';
import { ConsoleController } from './console.controller';
import { SkillsController } from './skills.controller';
import { PersonaController } from './persona.controller';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { ApiCardsController, WidgetCatalogueController, WidgetFeedsController, WidgetNewsController, WidgetProxyController } from './api-cards.controller';
import { ApiCardsService } from './api-cards.service';
import { ProfilesService } from './profiles.service';
import { UsageService } from './usage.service';
import { JevSqlService } from './jev-sql.service';
import { GuideController } from './guide.controller';
import { GuideIndexService } from './guide-index.service';
import { JevRouterService } from './jev-router.service';
import { JevAssistantService } from './jev-assistant.service';
import { GuideSearchService } from './guide-search.service';
import { GuideAnswerService } from './guide-answer.service';
import { JevMemoryService } from './jev-memory.service';
import { NotificationsService } from './notifications.service';
import { SnapshotsService } from './snapshots.service';

/** API de la Console Admin : `/api/admin/…`, réservée au profil ADMIN (RG1, RG7, RG16). */
@Module({
  controllers: [ConsoleController, GuideController, AccountsController, AiController, RulesController, SmtpController, DataController, SkillsController, PersonaController, InboxController, ApiCardsController, WidgetCatalogueController, WidgetProxyController, WidgetFeedsController, WidgetNewsController],
  // AccountsController et DataController servent aussi de fournisseurs : les décisions du tiroir de notifications
  // reprennent exactement le traitement des pages Utilisateurs et Modules.
  providers: [GuideIndexService, JevRouterService, JevAssistantService, GuideSearchService, GuideAnswerService, ProfilesService, UsageService, JevSqlService, JevMemoryService, NotificationWriterService, NotificationsService, SnapshotsService, InboxService, ApiCardsService, AccountsController, DataController],
  // Jev du Cockpit : aiguillage et réponses à partir du guide du Cockpit (décision du 30/09/2026).
  exports: [JevRouterService, GuideAnswerService],
})
export class AdminModule {}
