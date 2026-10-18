import { Injectable } from '@nestjs/common';
import { ApiError } from './errors';
import { PrismaService } from './prisma.service';
import { TodayService } from './today.service';
import { JEV_DAILY_QUESTIONS_MAX, jevQuotaMessage } from '../domain/hardening';

/**
 * Quota de questions à Jev (audit de sécurité du 18/10/2026) : chaque question du Cockpit ou de la Console coûte des
 * appels payants ; au plus `JEV_DAILY_QUESTIONS_MAX` par compte et par jour civil (Paris), puis 429 `JEV_QUOTA`.
 * Compteur incrémenté en une requête (deux questions simultanées ne passent pas toutes deux au-delà de la limite).
 */
@Injectable()
export class JevQuotaService {
  constructor(private readonly prisma: PrismaService, private readonly today: TodayService) {}

  async consume(accountId: string, max = JEV_DAILY_QUESTIONS_MAX): Promise<number> {
    const day = this.today.today();
    const [row] = await this.prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO jev_quotas (account_id, day, count) VALUES (${accountId}, ${day}, 1)
      ON CONFLICT (account_id, day) DO UPDATE SET count = jev_quotas.count + 1
      RETURNING count`;
    if (Number(row.count) > max) throw new ApiError(429, 'JEV_QUOTA', jevQuotaMessage(max));
    return Number(row.count);
  }

  /** Purge des jours passés (tâche de purge de Jev). */
  purgeBefore(day: string) {
    return this.prisma.jevQuota.deleteMany({ where: { day: { lt: day } } });
  }
}
