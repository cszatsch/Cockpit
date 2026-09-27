import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import path from 'path';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './core/errors';
import { EtagInterceptor } from './core/http';
import { config } from './core/config';

/** Construit l'application (partagé par `main.ts`, les tests e2e et l'export OpenAPI). */
export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: opts.logger === false ? false : undefined });
  app.enableCors({ origin: true, exposedHeaders: ['ETag'] });
  app.use(express.json({ limit: '10mb' }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new EtagInterceptor());
  const doc = SwaggerModule.createDocument(app, openApiConfig());
  SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs/openapi.json' });
  if (config.frontendDir) {
    app.use('/', express.static(path.resolve(config.frontendDir), { index: false }));
  }
  return app;
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
