import { execSync } from 'child_process';

/** Applique les migrations sur la base de test avant la suite. */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST || 'postgresql://rise:rise@localhost:5432/rise_test';
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
}
