import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminOnly } from '../core/auth/auth';
import { badRequest } from '../core/errors';
import { isLatencyPeriod, LatencyPeriod } from '../domain/latency';
import { LatencyService } from './latency.service';

/**
 * Analyse des temps de traitement (spécification TEMPS § 3) : écran IA › « Analyse des temps de traitement » de la
 * Console. Chemin de la spécification (`/api/ai/latency`) ; réservé aux administrateurs de la Console (403 sinon).
 */
@ApiTags('console · temps de traitement')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/ai/latency')
export class LatencyController {
  constructor(private readonly latency: LatencyService) {}

  private query(q: Record<string, string>): { period: LatencyPeriod; day: string | null } {
    if (!isLatencyPeriod(q.period)) throw badRequest('Période invalide', { period: 'd, 7, 1m, 3m ou 6m' });
    // `day` ne vaut que pour la période Jour (spécification § 3) ; ignoré pour les autres.
    return { period: q.period, day: q.period === 'd' && q.day ? q.day : null };
  }

  /** LatencyReport de la période, avec le nom et le fournisseur des modèles cités (`models`). */
  @Get()
  report(@Query() q: Record<string, string>) {
    const { period, day } = this.query(q);
    return this.latency.report(period, day);
  }

  /** Courbe d'évolution d'une catégorie (`axis=cat`) ou d'un modèle (`axis=mod`). */
  @Get('series')
  series(@Query() q: Record<string, string>) {
    const { period, day } = this.query(q);
    if (q.axis !== 'cat' && q.axis !== 'mod') throw badRequest('Axe invalide', { axis: 'cat ou mod' });
    if (!q.id || q.id.length > 100) throw badRequest('Identifiant attendu', { id: 'catégorie ou modèle' });
    return this.latency.series(period, day, q.axis, q.id);
  }
}
