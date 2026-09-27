import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import { runSeed } from '../prisma/seed';
import { seedDemoAi } from '../prisma/seed/admin';

/** Application de test sur une base amorçée avec le jeu de démonstration. */
export interface TestCtx {
  app: INestApplication;
  db: PrismaClient;
  http: () => request.Agent;
  /** Jeton d'un compte existant (par personne du référentiel ou par id de compte). */
  token: (who: { personId?: string; accountId?: string }) => Promise<string>;
  as: (who: { personId?: string; accountId?: string }) => Promise<Client>;
  close: () => Promise<void>;
}

export interface Client {
  get: (url: string) => request.Test;
  post: (url: string, body?: unknown) => request.Test;
  patch: (url: string, body?: unknown) => request.Test;
  put: (url: string, body?: unknown) => request.Test;
  del: (url: string) => request.Test;
}

export async function setup(): Promise<TestCtx> {
  const db = new PrismaClient();
  await runSeed(db);
  // Jeu d'essai des modèles d'IA (l'amorçage n'en crée plus depuis le 28/09/2026).
  await seedDemoAi(db);
  const app = await createApp({ logger: false });
  await app.init();
  const server = app.getHttpServer();
  const tokens: Record<string, string> = {};
  const token = async (who: { personId?: string; accountId?: string }) => {
    const key = JSON.stringify(who);
    if (!tokens[key]) {
      const r = await request(server).post('/api/auth/dev-login').send(who).expect(200);
      tokens[key] = r.body.token;
    }
    return tokens[key];
  };
  const as = async (who: { personId?: string; accountId?: string }): Promise<Client> => {
    const t = await token(who);
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${t}`);
    return {
      get: (u) => auth(request(server).get(u)),
      post: (u, b) => auth(request(server).post(u)).send(b as any),
      patch: (u, b) => auth(request(server).patch(u)).send(b as any),
      put: (u, b) => auth(request(server).put(u)).send(b as any),
      del: (u) => auth(request(server).delete(u)),
    };
  };
  return {
    app,
    db,
    http: () => request.agent(server),
    token,
    as,
    close: async () => {
      await app.close();
      await db.$disconnect();
    },
  };
}

/** Personnes de référence du jeu (brief § 13.7). */
export const WHO = {
  pmo: { personId: 'p01' },
  admin: { accountId: 'u1' },
  director: { personId: 'p03' },
  respC5: { personId: 'p06' },
  respC1: { personId: 'p07' },
  lecteurC3: { personId: 'p04' },
  lecteurC8: { personId: 'p05' },
};
