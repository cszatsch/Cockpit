import { netErrorCode, SMTP_ENC_PORT, smtpErrors, smtpFailStep, smtpFromEnv } from '../../src/domain/smtp';
import { parseReply } from '../../src/core/smtp-probe';

describe('Serveur d’envoi SMTP : règles', () => {
  const ok = { host: 'smtp.gmail.com', port: 587, enc: 'starttls' as const, auth: true, user: 'envoi@exemple.fr', from: 'envoi@exemple.fr' };

  it('port proposé par chiffrement', () => {
    expect(SMTP_ENC_PORT).toEqual({ starttls: 587, ssl: 465, none: 25 });
  });

  it('validation : hôte, port, identifiant et mot de passe si authentification, From', () => {
    expect(smtpErrors(ok, 'secret', false)).toEqual({});
    expect(smtpErrors(ok, '', true)).toEqual({}); // mot de passe déjà enregistré : conservé
    expect(Object.keys(smtpErrors({ ...ok, host: 'smtp', port: 70000, user: '', from: 'x' }, '', false)).sort()).toEqual(['from', 'host', 'password', 'port', 'user']);
    expect(smtpErrors({ ...ok, auth: false, user: '' }, '', false)).toEqual({});
  });

  it('étape en échec d’après la réponse du serveur', () => {
    expect(smtpFailStep('auth', '535 5.7.8 Username and Password not accepted.')).toBe('auth');
    expect(smtpFailStep('auth', '530 5.7.0 Must issue a STARTTLS command first.')).toBe('tls');
    expect(smtpFailStep('from', '530 5.7.0 Authentication Required.')).toBe('auth');
    expect(smtpFailStep('from', '553 5.1.2 The sender address is not valid')).toBe('from');
    expect(netErrorCode({ message: 'getaddrinfo ENOTFOUND smtp.introuvable.fr' })).toBe('getaddrinfo ENOTFOUND smtp.introuvable.fr');
    expect(netErrorCode({ message: 'C0:error:0A00010B:SSL routines:ssl3_get_record:wrong version number' })).toBe('SSL routines: wrong version number');
  });

  it('valeurs initiales depuis l’environnement (aucun identifiant dans le code)', () => {
    expect(smtpFromEnv({})).toEqual({ host: 'smtp.gmail.com', port: 587, enc: 'starttls', auth: true, user: '', from: '' });
    expect(smtpFromEnv({ SMTP_USER: 'moi@exemple.fr' })).toMatchObject({ user: 'moi@exemple.fr', from: 'moi@exemple.fr' });
    expect(smtpFromEnv({ SMTP_URL: 'smtps://a%40b.fr:x@mail.b.fr:465', MAIL_FROM: 'RISE <no-reply@b.fr>' })).toEqual({ host: 'mail.b.fr', port: 465, enc: 'ssl', auth: true, user: 'a@b.fr', from: 'no-reply@b.fr' });
    expect(smtpFromEnv({ SMTP_HOST: 'relais.local.fr', SMTP_PORT: '25', SMTP_ENC: 'none', SMTP_AUTH: 'false', SMTP_FROM: 'rise@local.fr' })).toEqual({ host: 'relais.local.fr', port: 25, enc: 'none', auth: false, user: '', from: 'rise@local.fr' });
  });

  it('lecture d’une réponse SMTP sur plusieurs lignes', () => {
    expect(parseReply('250-smtp.gmail.com\r\n250-STARTTLS\r\n')).toBeNull();
    const r = parseReply('250-smtp.gmail.com\r\n250-STARTTLS\r\n250 SMTPUTF8\r\n220 suite')!;
    expect(r).toMatchObject({ code: 250, first: '250-smtp.gmail.com', lines: ['250-smtp.gmail.com', '250-STARTTLS', '250 SMTPUTF8'] });
  });
});
