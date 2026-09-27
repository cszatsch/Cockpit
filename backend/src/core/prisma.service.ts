import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Client Prisma partagé ; `Tx` désigne indifféremment le client ou une transaction. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

export type Tx = Prisma.TransactionClient | PrismaService;

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
