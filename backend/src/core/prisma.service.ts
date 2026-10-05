import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { noteWrite, WRITE_OPERATIONS } from './changes';

/**
 * Client Prisma partagé ; `Tx` désigne indifféremment le client ou une transaction. Chaque écriture réussie est
 * signalée à `noteWrite` (mises à jour en direct des écritures de fond, 05/10/2026).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super();
    const base = this;
    const ext = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const r = await query(args);
            if (WRITE_OPERATIONS.has(operation)) noteWrite(model, r);
            return r;
          },
        },
      },
    });
    // Le client étendu remplace l'instance ; la fermeture de la connexion reste branchée sur l'arrêt du module.
    (ext as unknown as { onModuleDestroy: () => Promise<void> }).onModuleDestroy = () => base.$disconnect();
    return ext as unknown as PrismaService;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

export type Tx = Prisma.TransactionClient | PrismaService;

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
