import { cardStatus, daysLeft, endpointError, expiryLevel, failureNote, isPrivateAddress, latency24h, redactKey } from '../../src/domain/api-cards';

describe('Registre des cartes API : règles (spécification REGISTRE API)', () => {
  it('SSRF : https obligatoire, adresses privées et locales refusées', () => {
    expect(endpointError('https://api.openweathermap.org/data/3.0/onecall')).toBeNull();
    expect(endpointError('https://api.exemple.fr/v1?appid={key}')).toBeNull();
    expect(endpointError('http://api.exemple.fr')).toMatch(/https/);
    for (const u of ['https://localhost/x', 'https://127.0.0.1/', 'https://10.0.0.5/', 'https://172.16.0.1/', 'https://172.31.255.255/', 'https://192.168.1.10/', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/', 'https://db.internal/']) {
      expect(endpointError(u)).toMatch(/privée|locale/);
    }
    expect(endpointError('https://172.32.0.1/')).toBeNull();
    expect(endpointError('https://user:pass@api.exemple.fr/')).toMatch(/Identifiants/);
    expect(isPrivateAddress('::ffff:10.1.2.3')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });

  it('état : désactivée → erreur → clé expirée → échéance ≤ 30 j → quota ≥ 85 % → opérationnelle', () => {
    const base = { enabled: true, checkError: null, keyExpiresAt: '2027-06-01', quotaUsed: 10, quotaLimit: 100 };
    const today = '2026-09-26';
    expect(cardStatus({ ...base, enabled: false, checkError: 'Clé refusée · 401' }, today).note).toBe('Désactivée');
    expect(cardStatus({ ...base, checkError: 'Clé refusée · 401', keyExpiresAt: '2026-01-01' }, today)).toEqual({ status: 'err', note: 'Clé refusée · 401' });
    expect(cardStatus({ ...base, keyExpiresAt: '2026-09-25' }, today)).toEqual({ status: 'err', note: 'Clé expirée' });
    expect(cardStatus({ ...base, keyExpiresAt: '2026-10-26', quotaUsed: 99 }, today)).toEqual({ status: 'warn', note: 'Clé expire dans 30 j' });
    expect(cardStatus({ ...base, quotaUsed: 85 }, today)).toEqual({ status: 'warn', note: 'Quota à 85 %' });
    expect(cardStatus(base, today)).toEqual({ status: 'ok' });
  });

  it('échéance : jours restants et paliers J-30, J-7, J-1', () => {
    expect(daysLeft('2026-10-03', '2026-09-26')).toBe(7);
    expect([45, 30, 12, 7, 2, 1, 0, -1].map(expiryLevel)).toEqual([null, '30', '30', '7', '7', '1', '1', 'expired']);
    expect(failureNote(401)).toBe('Clé refusée · 401');
    expect(failureNote(0, 'timeout')).toBe('Délai dépassé');
    expect(failureNote(301)).toBe('Redirection 301 (adresse déplacée)');
  });

  it('latence 24 h : moyenne horaire des appels réussis, null pour une heure en échec ; clé masquée dans les réponses', () => {
    const now = new Date('2026-09-26T12:00:00Z'), h = (n: number) => new Date(now.getTime() - n * 3_600_000 + 60_000);
    const l = latency24h([{ at: h(1), code: 200, ms: 100 }, { at: h(1), code: 200, ms: 200 }, { at: h(2), code: 401, ms: 30 }], now);
    expect(l).toHaveLength(24);
    expect(l[23]).toBe(150);
    expect(l[22]).toBeNull();
    expect(redactKey('{"url":"https://x?appid=SECRET-123456"}', 'SECRET-123456')).toBe('{"url":"https://x?appid=••••3456"}');
  });
});
