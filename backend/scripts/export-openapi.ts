import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { SwaggerModule } from '@nestjs/swagger';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { openApiConfig } from '../src/app.factory';

/** Génère `openapi.json` (OpenAPI 3) à partir du code, sans base de données. */
async function main() {
  process.env.JOBS_ENABLED = 'false';
  const app = await NestFactory.create(AppModule, { logger: false });
  const doc = SwaggerModule.createDocument(app, openApiConfig());
  const out = path.join(__dirname, '../openapi.json');
  fs.writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`openapi.json : ${Object.keys(doc.paths).length} chemins → ${out}`);
  await app.close();
}
main();
