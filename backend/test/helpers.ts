import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import { runSeed } from '../prisma/seed';
import { seedDemoAi, seedDemoDeliveries, seedDemoLibrary, seedDemoSnapshots } from '../prisma/seed/admin';
import { seedDemoDocuments, seedDemoReports } from '../prisma/seed/rise';
import { ProviderKeyTester } from '../src/core/provider-key-tester';

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
  // Projets de démonstration ATLAS, HORIZON, NOVA et ORBIT (retirés de l'amorçage le 29/09/2026).
  await seedDemoLibrary(db);
  // Snapshots factices r1-r10 de RISE (retirés de l'amorçage le 29/09/2026).
  await seedDemoSnapshots(db);
  // Jeu d'essai des modèles d'IA (l'amorçage n'en crée plus depuis le 28/09/2026).
  await seedDemoAi(db);
  // Historique des envois de démonstration (l'amorçage n'en crée plus depuis le 29/09/2026).
  await seedDemoDeliveries(db);
  // Documents factices de la Base de connaissance (retirés de l'amorçage le 30/09/2026).
  await seedDemoDocuments(db);
  // Templates, journal de génération et rapports de démonstration (retirés de l'amorçage le 03/10/2026).
  await seedDemoReports(db);
  const app = await createApp({ logger: false });
  await app.init();
  // Les tests ne sortent jamais sur Internet : les fournisseurs d'IA sont simulés.
  app.get(ProviderKeyTester).fetchImpl = fakeProviderFetch;
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

/**
 * Double des API des fournisseurs pour le test des clés : une clé qui contient « revoked » ou compte
 * moins de 20 caractères est refusée (401), les autres sont acceptées (200, liste de modèles vide).
 */
export const fakeProviderFetch: typeof fetch = async (_url, init) => {
  const h = (init?.headers ?? {}) as Record<string, string>;
  const key = h['x-api-key'] ?? h['x-goog-api-key'] ?? String(h.Authorization ?? '').replace(/^Bearer /, '');
  const refused = /revoked/i.test(key) || key.length < 20;
  const body = refused ? { error: { message: 'Invalid API key' } } : { data: [] };
  return new Response(JSON.stringify(body), { status: refused ? 401 : 200, headers: { 'Content-Type': 'application/json' } });
};
