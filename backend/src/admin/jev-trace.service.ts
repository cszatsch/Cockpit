import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { formatTrace, TraceResult, traceSinks } from '../core/trace';

/** Conservation des traces de Jev (jours). */
export const JEV_TRACE_RETENTION_DAYS = 30;

/**
 * Traces de Jev (01/10/2026) : chaque trace terminée est écrite dans le journal du serveur (arborescence lisible, hors
 * essais automatiques) et enregistrée dans `jev_traces` (lecture : `npm run jev:traces`). L'enregistrement ne retarde
 * jamais la réponse et une erreur d'écriture ne la fait jamais échouer.
 */
@Injectable()
export class JevTraceService implements OnModuleInit, OnModuleDestroy {
  private readonly sink = (t: TraceResult) => {
    if (process.env.NODE_ENV !== 'test') console.log(formatTrace(t));
    void this.prisma.jevTrace
      .create({ data: { id: t.id, at: t.at, label: t.label, totalMs: t.totalMs, meta: t.meta as Prisma.InputJsonValue, spans: t.spans as unknown as Prisma.InputJsonValue } })
      .catch((e) => console.warn('[jev:trace] non enregistrée :', e instanceof Error ? e.message : e));
  };

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    traceSinks.push(this.sink);
  }

  onModuleDestroy() {
    const i = traceSinks.indexOf(this.sink);
    if (i >= 0) traceSinks.splice(i, 1);
  }

  /** Traces de plus de `JEV_TRACE_RETENTION_DAYS` jours supprimées (tâche jev.purge). */
  purge(now: Date) {
    return this.prisma.jevTrace.deleteMany({ where: { at: { lt: new Date(now.getTime() - JEV_TRACE_RETENTION_DAYS * 86_400_000) } } });
  }
}
