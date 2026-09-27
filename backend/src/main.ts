import 'reflect-metadata';
import { createApp } from './app.factory';
import { config } from './core/config';

async function bootstrap() {
  const app = await createApp();
  await app.listen(config.port);
  console.log(`RISE API prête sur http://localhost:${config.port} — documentation : /api/docs`);
}
bootstrap();
