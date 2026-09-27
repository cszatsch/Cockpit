// Environnement des tests : base dédiée, date de démonstration, pas d'appels sortants ni de tâches de fond.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST || 'postgresql://rise:rise@localhost:5432/rise_test';
process.env.AUTH_DEV = 'true';
process.env.DEMO_TODAY = '2026-09-26';
process.env.DEMO_NOW = '2026-09-26T08:24:00Z';
process.env.OFFLINE = 'true';
process.env.JOBS_ENABLED = 'false';
process.env.JWT_SECRET = 'test-secret';
process.env.SECRETS_KEY = process.env.SECRETS_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.STORAGE_DIR = process.env.STORAGE_DIR_TEST || '/tmp/rise-test-storage';
process.env.FRONTEND_DIR = '';
