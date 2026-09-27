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
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, AccessService, AuditService, TodayService],
  exports: [AccessService, AuditService, TodayService],
})
export class CoreModule {}
