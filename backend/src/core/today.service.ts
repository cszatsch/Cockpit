import { Injectable } from '@nestjs/common';
import { config } from './config';
import { isoInTimezone } from '../domain/dates';

/**
 * Date du jour du projet (brief § 7.1) : `DEMO_TODAY` si défini, sinon la date civile
 * dans le fuseau du projet. Toutes les règles métier passent par ce service.
 */
@Injectable()
export class TodayService {
  today(timezone = 'Europe/Paris'): string {
    return config.demoToday || isoInTimezone(new Date(), timezone);
  }

  /** Instant courant : réel, ou `DEMO_NOW` pour rejouer la démonstration de la console. */
  now(): Date {
    return config.demoNow ? new Date(config.demoNow) : new Date();
  }
}
