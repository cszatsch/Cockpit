import { requestScopeMiddleware } from './core/changes';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import path from 'path';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './core/errors';
import { EtagInterceptor } from './core/http';
import { TechRecoveryInterceptor } from './core/tech-errors';
import { config } from './core/config';
import { registerPages } from './core/auth/pages';

/** Construit l'application (partagé par `main.ts`, les tests e2e et l'export OpenAPI). */
export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: opts.logger === false ? false : undefined });
  app.enableCors({ origin: true, exposedHeaders: ['ETag'] });
  // Réponses de l'API jamais servies depuis le cache du navigateur (10/10/2026) : l'ETag `W/"version"` sert au verrouillage
  // optimiste (`If-Match`), pas au cache ; sans cela, Express répondait 304 à `If-None-Match` et le navigateur gardait un ancien
  // corps tant que la version ne changeait pas (profil sans `superAdmin` après une mise à jour). Les routes qui fixent leur
  // propre `Cache-Control` (images, aperçus) le remplacent ensuite.
  app.use('/api', apiNoCache);
  // Contexte de chaque requête : distingue les écritures de fond à annoncer (mises à jour en direct, 05/10/2026).
  app.use(requestScopeMiddleware);
  // Adresse IP réelle derrière un mandataire inverse (compteur d'échecs de connexion par IP).
  if (process.env.TRUST_PROXY) app.getHttpAdapter().getInstance().set('trust proxy', process.env.TRUST_PROXY);
  app.use(express.json({ limit: '10mb' }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new EtagInterceptor(), new TechRecoveryInterceptor());
  const doc = SwaggerModule.createDocument(app, openApiConfig());
  SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs/openapi.json' });
  if (config.frontendDir) {
    registerPages(app, path.resolve(config.frontendDir));
    app.use('/', express.static(path.resolve(config.frontendDir), { index: false }));
  }
  return app;
}

/** Requêtes de l'API : validateurs conditionnels du navigateur ignorés, réponse non mise en cache par défaut. */
export function apiNoCache(req: express.Request, res: express.Response, next: express.NextFunction) {
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function openApiConfig() {
  return new DocumentBuilder()
    .setTitle('RISE — API Cockpit et Console Admin')
    .setDescription(
      'API du Cockpit (`/api`, `/api/projects/{projectId}/…`) et de la Console Admin (`/api/admin/…`). ' +
        'Erreurs : `{ code, message, fields?, usages? }`. Verrouillage optimiste : `If-Match` / `ETag`.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
}
