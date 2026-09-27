import { INestApplication } from '@nestjs/common';
import path from 'path';
import { CredentialsService } from './credentials.service';
import { SessionService } from './session.service';

/** Fichiers servis par chaque adresse (dossier des frontends). */
export const PAGES = {
  appLogin: 'Connexion.dc.html',
  adminLogin: 'Connexion Console.dc.html',
  cockpit: 'RISE Cockpit.dc.html',
  console: 'Console Admin.dc.html',
} as const;

const HEADERS = {
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

/** Adresse de retour après connexion : chemin local uniquement (pas de redirection ouverte). */
function returnTo(url: string, home: string): string | null {
  return url && url !== home && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

/**
 * Adresses des écrans (spécification AUTH § URLs) :
 * - `/connexion` et `/console/connexion` : écrans de connexion de l'application et de la Console ;
 * - `/mot-de-passe/reinitialiser?token=…` : lien reçu par e-mail, avec l'habillage de la surface d'origine ;
 * - `/` (Cockpit) et `/console/*` (Console) : exigent une session de la surface, sinon renvoi vers
 *   l'écran de connexion correspondant ; une session limitée (mot de passe provisoire) y est renvoyée aussi.
 */
export function registerPages(app: INestApplication, dir: string): void {
  const http = app.getHttpAdapter().getInstance();
  const sessions = app.get(SessionService);
  const creds = app.get(CredentialsService);
  const send = (res: any, file: string) => {
    res.set(HEADERS);
    res.sendFile(path.join(dir, file));
  };
  const guarded = (fn: (req: any, res: any) => Promise<void>) => (req: any, res: any, next: any) => fn(req, res).catch(next);

  http.get('/connexion', (_req: any, res: any) => send(res, PAGES.appLogin));
  http.get('/console/connexion', (_req: any, res: any) => send(res, PAGES.adminLogin));
  http.get(
    '/mot-de-passe/reinitialiser',
    guarded(async (req, res) => {
      const surface = await creds.tokenSurface(String(req.query.token ?? ''));
      send(res, surface === 'ADMIN' ? PAGES.adminLogin : PAGES.appLogin);
    }),
  );
  http.get(
    '/',
    guarded(async (req, res) => {
      const s = await sessions.fromCookies(req, 'APP');
      if (s && !s.session.restricted) return send(res, PAGES.cockpit);
      const back = returnTo(req.originalUrl, '/');
      res.redirect(302, '/connexion' + (back ? '?suite=' + encodeURIComponent(back) : ''));
    }),
  );
  http.get(
    /^\/console(\/.*)?$/,
    guarded(async (req, res) => {
      const s = await sessions.fromCookies(req, 'ADMIN');
      if (!s || s.session.restricted || !s.isAdmin) return res.redirect(302, '/console/connexion');
      if (req.path !== '/console') return res.redirect(302, '/console');
      send(res, PAGES.console);
    }),
  );
}
