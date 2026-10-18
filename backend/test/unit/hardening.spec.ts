import { EXAMPLE_SECRETS_KEY, isLoopback, productionConfigErrors, proxyContentRefused, relayClientIp } from '../../src/domain/hardening';

/** Durcissements de la configuration et de l'exposition (audit de sécurité du 18/10/2026, lot 7). */
describe('Durcissements (lot 7)', () => {
  it('clé maître d’exemple : refusée en production seulement, et seulement elle', () => {
    expect(productionConfigErrors({ NODE_ENV: 'production', SECRETS_KEY: EXAMPLE_SECRETS_KEY })).toHaveLength(1);
    expect(productionConfigErrors({ NODE_ENV: 'production', SECRETS_KEY: EXAMPLE_SECRETS_KEY.toUpperCase() })).toHaveLength(1);
    expect(productionConfigErrors({ NODE_ENV: 'production', SECRETS_KEY: 'ab'.repeat(32) })).toEqual([]);
    expect(productionConfigErrors({ NODE_ENV: 'test', SECRETS_KEY: EXAMPLE_SECRETS_KEY })).toEqual([]);
    expect(productionConfigErrors({ SECRETS_KEY: EXAMPLE_SECRETS_KEY })).toEqual([]);
  });

  it('boucle locale', () => {
    for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.1.2.3']) expect(isLoopback(a)).toBe(true);
    for (const a of ['10.0.0.5', '192.168.1.2', '::ffff:10.0.0.5', 'fe80::1', '', null, undefined, 'localhost']) expect(isLoopback(a)).toBe(false);
  });

  it('proxy : HTML, XHTML, SVG et scripts refusés ; JSON, XML et texte acceptés', () => {
    for (const t of ['text/html', 'text/html; charset=utf-8', 'TEXT/HTML', 'application/xhtml+xml', 'image/svg+xml', 'application/javascript', 'text/javascript', 'text/x-html'])
      expect(proxyContentRefused(t)).toBe(true);
    for (const t of ['application/json', 'application/json; charset=utf-8', 'application/rss+xml', 'application/atom+xml', 'text/xml', 'text/plain', 'application/geo+json', '', null])
      expect(proxyContentRefused(t)).toBe(false);
  });

  it('relais : adresse transmise lue seulement avec le secret partagé', () => {
    const h = { 'x-rise-relais': 's3cret-relais', 'x-rise-client-ip': '198.51.100.9, 203.0.113.5' };
    expect(relayClientIp(h, 's3cret-relais')).toBe('203.0.113.5');
    expect(relayClientIp(h, '')).toBeNull();
    expect(relayClientIp(h, 'autre-secret')).toBeNull();
    expect(relayClientIp({ ...h, 'x-rise-relais': 'faux' }, 's3cret-relais')).toBeNull();
    expect(relayClientIp({ ...h, 'x-rise-client-ip': 'pas-une-adresse' }, 's3cret-relais')).toBeNull();
  });
});
