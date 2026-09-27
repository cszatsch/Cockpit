import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './prisma.service';
import { AuthGuard } from './auth/auth';
import { AuthController } from './auth/auth.controller';
import { AccessService } from './access.service';
import { AuditService } from './audit.service';
import { TodayService } from './today.service';
import { config } from './config';
import { StorageService } from './storage.service';
import { EventBus } from './events';
import { LlmService } from './llm.service';
import { JobsService } from './jobs.service';
import { MailerService } from './mailer.service';
import { SessionService } from './auth/session.service';
import { CredentialsService } from './auth/credentials.service';

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
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, AccessService, AuditService, TodayService, StorageService, EventBus, LlmService, JobsService, MailerService, SessionService, CredentialsService],
  exports: [AccessService, AuditService, TodayService, StorageService, EventBus, LlmService, JobsService, MailerService, SessionService, CredentialsService],
})
export class CoreModule {}
