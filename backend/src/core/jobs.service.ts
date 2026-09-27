import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import PgBoss from 'pg-boss';
import { config } from './config';

type JobHandler = (data: any) => Promise<void>;

/**
 * File de tâches de fond (brief Console § 4) : pg-boss sur PostgreSQL, avec reprise sur erreur
 * (3 tentatives, délai exponentiel). Quand `JOBS_ENABLED=false` (tests), les tâches s'exécutent
 * immédiatement dans la requête et aucune planification n'est lancée.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private boss: PgBoss | null = null;
  private handlers = new Map<string, JobHandler>();
  private schedules: Array<{ name: string; cron: string; data: object }> = [];

  register(name: string, handler: JobHandler) {
    this.handlers.set(name, handler);
  }

  /** Tâche récurrente (cron, fuseau Europe/Paris). */
  schedule(name: string, cron: string, data: object = {}) {
    this.schedules.push({ name, cron, data });
  }

  get enabled() {
    return config.jobsEnabled;
  }

  async onApplicationBootstrap() {
    if (!this.enabled) return;
    this.boss = new PgBoss({ connectionString: config.databaseUrl, schema: 'pgboss' });
    this.boss.on('error', (e) => console.error('pg-boss :', e));
    await this.boss.start();
    for (const [name, handler] of this.handlers) {
      await this.boss.createQueue(name, { name, retryLimit: 3, retryBackoff: true } as any);
      await this.boss.work(name, async (jobs: any) => {
        for (const j of Array.isArray(jobs) ? jobs : [jobs]) await handler(j.data);
      });
    }
    for (const s of this.schedules) await this.boss.schedule(s.name, s.cron, s.data, { tz: 'Europe/Paris' });
  }

  async onModuleDestroy() {
    await this.boss?.stop({ graceful: false } as any);
  }

  /** Met une tâche en file (ou l'exécute immédiatement si la file est désactivée). */
  async enqueue(name: string, data: object): Promise<void> {
    const h = this.handlers.get(name);
    if (!h) throw new Error(`Tâche inconnue : ${name}`);
    if (this.boss) await this.boss.send(name, data);
    else await h(data);
  }
}
