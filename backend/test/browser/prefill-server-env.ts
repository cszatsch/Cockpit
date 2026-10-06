// Environnement du serveur de recette du préremplissage, posé avant tout autre module (base de test, connexion de
// développement, pas de tâches de fond).
import path from 'path';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST || 'postgresql://rise:rise@localhost:5432/rise_test';
process.env.AUTH_DEV = 'true';
process.env.JOBS_ENABLED = 'false';
process.env.JWT_SECRET = 'test-secret';
process.env.SECRETS_KEY = process.env.SECRETS_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.STORAGE_DIR = process.env.STORAGE_DIR_TEST || '/tmp/rise-test-storage';
process.env.FRONTEND_DIR = path.join(__dirname, '../../../frontends');
