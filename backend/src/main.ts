import 'reflect-metadata';
import { createApp } from './app.factory';
import { config } from './core/config';
import { PrismaService } from './core/prisma.service';
import { createInitialAdmin, INITIAL_ADMIN } from './core/auth/initial-admin';

async function bootstrap() {
  const app = await createApp();
  // Premier démarrage : compte initial créé si RISE_INITIAL_ADMIN_PASSWORD est défini et que le compte n'existe pas.
  if ((await createInitialAdmin(app.get(PrismaService))) === 'created') {
    console.log(`Compte initial créé : ${INITIAL_ADMIN.email} (changement du mot de passe exigé à la première connexion)`);
  }
  await app.listen(config.port);
  console.log(`RISE API prête sur http://localhost:${config.port} — documentation : /api/docs`);
}
bootstrap();
