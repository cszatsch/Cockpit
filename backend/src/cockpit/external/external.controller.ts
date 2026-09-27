import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessService } from '../../core/access.service';
import { Actor, CurrentActor } from '../../core/auth/auth';
import { ApiError, badRequest } from '../../core/errors';
import { config } from '../../core/config';

/** Durée de cache des appels externes (brief § 9.7). */
export const EXTERNAL_CACHE_MS = 30 * 60 * 1000;

const cache = new Map<string, { at: number; data: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < EXTERNAL_CACHE_MS) return hit.data as T;
  if (config.offline) throw new ApiError(503, 'EXTERNAL_UNAVAILABLE', 'Service externe indisponible (mode hors ligne)');
  try {
    const data = await load();
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    if (hit) return hit.data as T; // valeur périmée plutôt que rien
    throw new ApiError(503, 'EXTERNAL_UNAVAILABLE', 'Service externe indisponible');
  }
}

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'RISE-Cockpit/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Proxy météo (Open-Meteo) et actualités (GDELT), remplaçant les appels directs du navigateur. */
@ApiTags('cockpit · services externes')
@ApiBearerAuth()
@Controller('api/projects/:projectId/external')
export class ExternalController {
  constructor(private readonly access: AccessService) {}

  @Get('weather')
  async weather(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Query('city') city?: string) {
    const scope = await this.access.scope(actor, p);
    const name = (city || scope.project.city || 'Paris').trim();
    if (name.length > 100) throw badRequest('Ville invalide', { city: '100 caractères maximum' });
    return cached(`w:${name.toLowerCase()}`, async () => {
      const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=fr&format=json`);
      const g = geo?.results?.[0];
      if (!g) throw new Error('ville inconnue');
      const f = await getJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=1`,
      );
      return {
        city: g.name,
        country: g.country,
        temperature: f.current?.temperature_2m ?? null,
        weatherCode: f.current?.weather_code ?? null,
        min: f.daily?.temperature_2m_min?.[0] ?? null,
        max: f.daily?.temperature_2m_max?.[0] ?? null,
        sunrise: f.daily?.sunrise?.[0] ?? null,
        sunset: f.daily?.sunset?.[0] ?? null,
        fetchedAt: new Date().toISOString(),
      };
    });
  }

  @Get('news')
  async news(@CurrentActor() actor: Actor, @Param('projectId') p: string, @Query('country') country?: string) {
    const scope = await this.access.scope(actor, p);
    const c = (country || scope.project.country || 'France').trim();
    if (c.length > 60) throw badRequest('Pays invalide', { country: '60 caractères maximum' });
    return cached(`n:${c.toLowerCase()}`, async () => {
      const q = encodeURIComponent(`"${c}" sourcelang:french`);
      const j = await getJson(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=8&timespan=1d&format=json`);
      return { country: c, articles: (j?.articles ?? []).slice(0, 5).map((a: any) => ({ t: a.title, src: a.domain, d: a.seendate, url: a.url })), fetchedAt: new Date().toISOString() };
    });
  }
}
