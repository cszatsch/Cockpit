import { Controller, Get, Injectable, Logger, OnApplicationBootstrap, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../../core/prisma.service';
import { parse } from '../../core/http';
import { HOLIDAY_COUNTRIES, HOLIDAY_COUNTRY_LABELS, HOLIDAY_FIRST_YEAR, HOLIDAY_HORIZON_YEARS, holidayRows } from '../../domain/jours-feries';

/**
 * Jours fériés (16/10/2026) : complète au démarrage la table de référence (`PublicHoliday`, de HOLIDAY_FIRST_YEAR à
 * l'année en cours + HOLIDAY_HORIZON_YEARS) et les noms de pays (`PublicHolidayCountry`). Idempotent : seules les lignes
 * absentes sont ajoutées ; les années à venir s'ajoutent d'elles-mêmes au fil des redémarrages.
 */
@Injectable()
export class HolidaysService implements OnApplicationBootstrap {
  private readonly log = new Logger('Jours fériés');
  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try { await this.ensure(); } catch (e) { this.log.warn('Table des jours fériés non complétée : ' + (e as Error).message); }
  }

  async ensure(now = new Date()): Promise<number> {
    const y1 = now.getFullYear() + HOLIDAY_HORIZON_YEARS;
    await this.prisma.publicHolidayCountry.createMany({ data: HOLIDAY_COUNTRY_LABELS.map(([iso, label]) => ({ label, iso })), skipDuplicates: true });
    const rows = holidayRows(HOLIDAY_FIRST_YEAR, y1);
    const have = await this.prisma.publicHoliday.count();
    if (have >= rows.length) return 0;
    const r = await this.prisma.publicHoliday.createMany({ data: rows, skipDuplicates: true });
    return r.count;
  }
}

const Q = z.object({
  country: z.string().regex(/^[A-Z]{2}$/, 'code pays à 2 lettres'),
  region: z.string().max(4).optional().default(''),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date AAAA-MM-JJ'),
});

/** Jours fériés d'un pays (et d'une région) sur une période : source du widget « Jours fériés ». */
@ApiTags('cockpit · jours fériés')
@ApiBearerAuth()
@Controller('api')
export class HolidaysController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('holidays')
  async list(@Query() query: unknown) {
    const { country, region, from, to } = parse(Q, query);
    const known = !!HOLIDAY_COUNTRIES[country] && (!region || (HOLIDAY_COUNTRIES[country].rg ?? []).some(([r]) => r === region));
    if (!known) return { country, region, available: false, items: [] };
    const items = await this.prisma.publicHoliday.findMany({ where: { country, region, date: { gte: from, lte: to } }, orderBy: { date: 'asc' }, select: { date: true, name: true, observedFrom: true } });
    return { country, region, available: true, items };
  }
}
