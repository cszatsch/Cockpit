import { DictionarySyncService } from './dictionary-sync';
import { Global, Module } from '@nestjs/common';
import { JevPromptService } from './jev-prompt.service';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ChangesController, ChangesInterceptor, ChangesService } from './changes';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './prisma.service';
import { AuthGuard } from './auth/auth';
import { AuthController } from './auth/auth.controller';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';
import { TodayService } from './today.service';
import { config } from './config';
import { StorageService } from './storage.service';
import { LlmService } from './llm.service';
import { JobsService } from './jobs.service';
import { MailerService } from './mailer.service';
import { SmtpService } from './smtp.service';
import { SessionService } from './auth/session.service';
import { CredentialsService } from './auth/credentials.service';
import { ProviderKeyTester } from './provider-key-tester';
import { LlmClient } from './llm-client';

/** Socle commun au Cockpit et à la Console : base, authentification, droits, audit, date du jour. */
@Global()
@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({ secret: config.jwtSecret, signOptions: { expiresIn: config.jwtTtl as any } }),
    }),
  ],
  controllers: [AuthController, ChangesController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, ChangesService, { provide: APP_INTERCEPTOR, useClass: ChangesInterceptor }, AccessService, AuditService, TodayService, StorageService, LlmService, JevPromptService, JobsService, MailerService, SmtpService, SessionService, CredentialsService, ProviderKeyTester, LlmClient, DictionarySyncService],
  exports: [ChangesService, AccessService, AuditService, TodayService, StorageService, LlmService, JevPromptService, JobsService, MailerService, SmtpService, SessionService, CredentialsService, ProviderKeyTester, LlmClient, DictionarySyncService],
})
export class CoreModule {}
