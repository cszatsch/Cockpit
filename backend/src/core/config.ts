/** Configuration lue dans l'environnement (voir `.env.example`). */
export const config = {
  get databaseUrl() {
    return process.env.DATABASE_URL ?? '';
  },
  get jwtSecret() {
    return process.env.JWT_SECRET ?? 'dev-secret-change-me';
  },
  get jwtTtl() {
    return process.env.JWT_TTL ?? '12h';
  },
  /** Active `POST /api/auth/dev-login` (jamais en production). */
  get authDev() {
    return process.env.AUTH_DEV === 'true';
  },
  /** Date du jour de démonstration (brief § 7.1) ; vide = horloge réelle. */
  get demoToday() {
    return process.env.DEMO_TODAY || '';
  },
  /** Heure de démonstration de la console (26/09/2026 10:24, fuseau Europe/Paris). */
  get demoNow() {
    return process.env.DEMO_NOW || '';
  },
  /** Clé AES-256-GCM (64 caractères hexadécimaux) pour chiffrer les clés API. */
  get secretsKey() {
    return process.env.SECRETS_KEY ?? '';
  },
  get storageDir() {
    return process.env.STORAGE_DIR ?? './storage';
  },
  get port() {
    return Number(process.env.PORT ?? 3000);
  },
  /**
   * Adresse d'écoute (audit du 18/10/2026) : vide = toutes les interfaces (conteneur Docker de la VM) ; le lanceur
   * `start_cockpit` passe `127.0.0.1` (ce poste seulement), ou `0.0.0.0` avec son option -Reseau.
   */
  get listenHost() {
    return process.env.LISTEN_HOST || '';
  },
  /** Secret partagé avec le relais Cloud Run : seul un relais qui l'envoie fait foi pour l'adresse du client. */
  get relaySecret() {
    return process.env.RELAIS_SECRET || '';
  },
  /** Dossier des frontends servis en statique (vide = non servis). */
  get frontendDir() {
    return process.env.FRONTEND_DIR ?? '';
  },
  /** Désactive les appels réseau sortants (météo, actualités) : tests. */
  get offline() {
    return process.env.OFFLINE === 'true';
  },
  /** Désactive la file de tâches de fond (tests). */
  get jobsEnabled() {
    return process.env.JOBS_ENABLED !== 'false';
  },
  get smtpUrl() {
    return process.env.SMTP_URL ?? '';
  },
  get mailFrom() {
    return process.env.MAIL_FROM ?? 'Cockpit <no-reply@cockpit.local>';
  },
  /** Attribut `Secure` des cookies de session (les navigateurs l'acceptent aussi sur http://localhost). */
  get cookieSecure() {
    return process.env.COOKIE_SECURE !== 'false';
  },
  /** Adresse publique de l'application, pour les liens envoyés par e-mail. */
  get appUrl() {
    return (process.env.APP_URL || `http://localhost:${this.port}`).replace(/\/+$/, '');
  },
};
