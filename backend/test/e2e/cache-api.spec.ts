import { setup, TestCtx, Client, WHO } from '../helpers';

/**
 * Réponses de l'API jamais servies depuis le cache du navigateur (10/10/2026). L'ETag de verrouillage optimiste (`W/"version"`)
 * servait aussi de validateur de cache : un navigateur qui renvoyait `If-None-Match` recevait 304 et gardait un ancien corps,
 * tant que la version de l'objet ne changeait pas — ainsi `/api/admin/me/profile` restait sans `superAdmin` après la mise à jour.
 */
describe('API — pas de cache navigateur', () => {
  let t: TestCtx;
  let sup: Client;
  beforeAll(async () => {
    t = await setup();
    sup = await t.as(WHO.admin);
  });
  afterAll(() => t.close());

  it('If-None-Match égal à l’ETag : 200 avec le corps à jour, jamais 304 ; Cache-Control no-store', async () => {
    const first = await sup.get('/api/admin/me/profile').expect(200);
    expect(first.headers.etag).toBeDefined();
    const again = await sup.get('/api/admin/me/profile').set('If-None-Match', first.headers.etag);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ superAdmin: true, admin: true });
    expect(first.headers['cache-control']).toBe('no-store');
  });

  it('If-Modified-Since ignoré aussi', async () => {
    const r = await sup.get('/api/admin/me/profile').set('If-Modified-Since', new Date(Date.now() + 86_400_000).toUTCString()).expect(200);
    expect(r.body.superAdmin).toBe(true);
  });

  it('les fichiers statiques des écrans gardent leur revalidation', async () => {
    const r = await t.http().get('/support.js');
    if (r.status === 200) expect(r.headers['cache-control']).not.toBe('no-store');
  });
});
