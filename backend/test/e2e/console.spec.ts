import request from 'supertest';
import { setup, TestCtx, WHO } from '../helpers';
import { buildWorkbook, validAtlas } from '../fixtures/excel';
import { StorageService } from '../../src/core/storage.service';

const A = '/api/admin';

describe('Console Admin — critères d’acceptation (brief Console § 13)', () => {
  let t: TestCtx;
  beforeAll(async () => {
    t = await setup();
  });
  afterAll(() => t.close());

  describe('1. Accès', () => {
    it('un PMO sans profil Admin reçoit 403, un Admin 200', async () => {
      const r = await (await t.as(WHO.pmo)).get(`${A}/overview`).expect(403);
      expect(r.body.code).toBe('FORBIDDEN');
      const ok = await (await t.as(WHO.admin)).get(`${A}/overview`).expect(200);
      expect(ok.body.attention[0]).toMatchObject({ level: 'error', kind: 'PROVIDER_ERROR' });
      expect(ok.body.attention[0].detail).toMatch(/Documents · Synthèse tourne sur son modèle de secours/);
    });
    it('vue d’ensemble : échecs d’envoi et demandes d’invitation du PMO décrits en clair (règle, canal, personne)', async () => {
      const rule = await t.db.notificationRule.findFirstOrThrow();
      const person = await t.db.person.findFirstOrThrow({ where: { projectId: 'RISE' } });
      const d = await t.db.delivery.create({ data: { ruleId: rule.id, channel: 'EMAIL', recipientsCount: 1, status: 'ERROR', error: '535 authentification refusée', at: new Date('2026-09-25T08:00:00Z') } });
      const r = await t.db.invitationRequest.create({ data: { projectId: 'RISE', personId: person.id, requestedById: 'p01' } });
      const ov = (await (await t.as(WHO.admin)).get(`${A}/overview`).expect(200)).body;
      expect(ov.attention).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'DELIVERY_FAILED', detail: `${rule.name} · E-mail · 535 authentification refusée` }),
        expect.objectContaining({ kind: 'INVITATION_REQUEST', detail: `${person.firstName} ${person.lastName} · RISE` }),
      ]));
      await t.db.delivery.delete({ where: { id: d.id } });
      await t.db.invitationRequest.delete({ where: { id: r.id } });
    });
    it('toute écriture crée une entrée d’audit avec profileUsed = ADMIN', async () => {
      const c = await t.as(WHO.admin);
      await c.post(`${A}/accounts/u31/resend-invite`).expect(200);
      const a = await t.db.auditEntry.findFirst({ where: { entityType: 'Account', entityId: 'u31' }, orderBy: { at: 'desc' } });
      expect(a).toMatchObject({ profileUsed: 'ADMIN', accountId: 'u1', action: 'Relance d’une invitation' });
    });
  });

  describe('2. Comptes', () => {
    it('inviter un e-mail déjà utilisé → 409 ; invitation valable 14 jours', async () => {
      const c = await t.as(WHO.admin);
      await c.post(`${A}/accounts`, { fullName: 'Robin', email: 'robin.lefevre@example.com', profile: 'pmo', projectCodes: ['RISE'] }).expect(409);
      await c.post(`${A}/accounts`, { fullName: 'X', email: 'x@example.com', profile: 'pmo', projectCodes: ['RISE'] }).expect(400);
      const r = await c.post(`${A}/accounts`, { fullName: 'Nadia Colin', email: 'nadia.colin@example.com', profile: 'pmo', projectCodes: ['HORIZON'] }).expect(201);
      expect(r.body).toMatchObject({ status: 'INVITED', profile: 'PMO', projectCodes: ['HORIZON'] });
      expect(new Date(r.body.inviteExpiresAt).getTime() - new Date(r.body.invitedAt).getTime()).toBe(14 * 86_400_000);
      // Responsable d'une personne du référentiel : attribué par le PMO (Q3).
      await c.patch(`${A}/accounts/u15`, { profile: 'resp' }).expect(422);
    });
    it('suspendre ferme les sessions actives', async () => {
      const token = await t.token({ personId: 'p07' });
      await request(t.app.getHttpServer()).get('/api/me').set('Authorization', `Bearer ${token}`).expect(200);
      await (await t.as(WHO.admin)).post(`${A}/accounts/u7/suspend`).expect(200);
      await request(t.app.getHttpServer()).get('/api/me').set('Authorization', `Bearer ${token}`).expect(401);
      expect(await t.db.authSession.count({ where: { accountId: 'u7', revokedAt: null } })).toBe(0);
      await (await t.as(WHO.admin)).post(`${A}/accounts/u1/suspend`).expect(409);
    });
    it('supprimer un compte lié → 409 + usages', async () => {
      const r = await (await t.as(WHO.admin)).del(`${A}/accounts/u3`).expect(409);
      expect(r.body.usages.length).toBeGreaterThan(0);
      expect(r.body.usages.map((u: any) => u.entityType)).toContain('GOVERNANCE_BODY');
    });
    it('filtrer par profil Responsable : compteurs de statut cohérents avec ce filtre', async () => {
      const r = await (await t.as(WHO.admin)).get(`${A}/accounts?profile=resp`).expect(200);
      const items = r.body.items;
      expect(items.every((a: any) => a.profile === 'RESPONSABLE')).toBe(true);
      expect(r.body.counts.byStatus.total).toBe(items.length);
      expect(r.body.counts.byStatus.ACTIVE + r.body.counts.byStatus.INVITED + r.body.counts.byStatus.SUSPENDED).toBe(items.length);
      const byStatus = await (await t.as(WHO.admin)).get(`${A}/accounts?status=suspendu`).expect(200);
      expect(Object.values(byStatus.body.counts.byProfile).slice(1).reduce((a: number, b: any) => a + b, 0)).toBe(byStatus.body.items.length);
    });
    it('modifier les projets d’un Responsable du référentiel ne réattribue pas son profil (branchement de la console)', async () => {
      const c = await t.as(WHO.admin);
      const r = await c.patch(`${A}/accounts/u8`, { projectCodes: ['RISE', 'ATLAS'] }).expect(200);
      expect(r.body).toMatchObject({ profile: 'RESPONSABLE', projectCodes: expect.arrayContaining(['RISE', 'ATLAS']) });
    });
  });

  describe('3. Administrateurs', () => {
    it('retirer le dernier administrateur → 409 ; un administrateur ne peut pas se retirer lui-même', async () => {
      const c = await t.as(WHO.admin);
      await c.del(`${A}/admins/u1`).expect(409);
      await c.post(`${A}/admins`, { accountId: 'u13' }).expect(201);
      const other = await t.as({ accountId: 'u13' });
      await other.del(`${A}/admins/u13`).expect(409);
      await other.del(`${A}/admins/u1`).expect(204);
      await other.del(`${A}/admins/u13`).expect(409);
      await other.post(`${A}/admins`, { accountId: 'u1' }).expect(201);
    });
  });

  describe('4. Clés', () => {
    it('une clé révoquée passe en ERROR et Documents passe « Sur secours » ; jamais de clé en clair', async () => {
      const c = await t.as(WHO.admin);
      const all = await c.post(`${A}/providers/test-all`).expect(200);
      expect(JSON.stringify(all.body)).not.toMatch(/sk-ant-demo|AIza-demo|keyCipher/);
      expect(all.body.find((p: any) => p.id === 'google')).toMatchObject({ status: 'ERROR', functionsOnFallback: ['doc_syn'] });
      const asg = await c.get(`${A}/assignments`).expect(200);
      expect(asg.body.find((x: any) => x.functionId === 'doc_syn').state).toBe('FALLBACK');
      expect(asg.body.find((x: any) => x.functionId === 'insights').state).toBe('NOMINAL');
    });
    it('remplacer la clé la reteste et trace une action critique', async () => {
      const c = await t.as(WHO.admin);
      const r = await c.put(`${A}/providers/google/key`, { apiKey: 'AIzaSyNEWKEY-000000000000000000000Zz9' }).expect(200);
      expect(r.body).toMatchObject({ status: 'OK', keyPrefix: 'AIza', keyLast4: '0Zz9' });
      expect(JSON.stringify(r.body)).not.toContain('NEWKEY');
      const a = await t.db.auditEntry.findFirst({ where: { action: 'Rotation de clé API', target: 'Google' }, orderBy: { at: 'desc' } });
      expect(a).toMatchObject({ severity: 'CRITICAL', profileUsed: 'ADMIN' });
      expect((await c.get(`${A}/assignments`).expect(200)).body.find((x: any) => x.functionId === 'doc_syn').state).toBe('NOMINAL');
    });
  });

  describe('5. Consommation', () => {
    it('la dépense du mois est la somme des UsageRecord ; projection cohérente avec le rythme de 7 jours', async () => {
      const m = (await (await t.as(WHO.admin)).get(`${A}/usage/month`).expect(200)).body;
      const sum = await t.db.usageRecord.aggregate({ where: { at: { gte: new Date('2026-08-31T22:00:00Z'), lt: new Date('2026-09-26T22:00:00Z') } }, _sum: { costEur: true } });
      expect(m.spent).toBeCloseTo(sum._sum.costEur!, 1);
      expect(m.projection).toBeCloseTo(m.spent + m.rate7d * 4, 0);
      if (m.crossDate) expect(m.crossDate >= '2026-09-26').toBe(true);
      const all = m.thresholds.find((x: any) => x.id === 'all');
      expect(all.status).toBe(all.projection > 1200 ? 'EXCEEDED' : all.spent >= 960 ? 'ALERT' : 'UNDER');
    });
    it('franchir 80 % déclenche la règle budgétaire une seule fois', async () => {
      const c = await t.as(WHO.admin);
      await c.put(`${A}/budget-thresholds/crud`, { limitEur: 1, warnPct: 80, enabled: true }).expect(200);
      // Un appel LLM (Jev) déclenche le contrôle.
      await (await t.as(WHO.pmo)).post('/api/projects/RISE/assistant/messages', { context: { space: 'today' }, text: 'Bonjour' }).expect(200);
      await (await t.as(WHO.pmo)).post('/api/projects/RISE/assistant/messages', { context: { space: 'today' }, text: 'Encore' }).expect(200);
      const fired = await t.db.budgetAlertFired.findMany({ where: { thresholdId: 'crud' } });
      expect(fired).toHaveLength(1);
      const sent = await t.db.delivery.findMany({ where: { ruleId: 'n3', eventKey: { contains: '|crud|' } } });
      expect(sent.length).toBe(1);
    });
    it('une ligne par ligne budgétaire, même sans plafond enregistré (Rapports, Guidage console)', async () => {
      const c = await t.as(WHO.admin);
      await t.db.budgetThreshold.deleteMany({ where: { id: { in: ['rapports', 'guidage'] } } });
      const list = (await c.get(`${A}/budget-thresholds`).expect(200)).body;
      expect(list.map((x: any) => x.id)).toEqual(['all', 'insights', 'crud', 'rapports', 'guidage', 'docs']);
      expect(list.find((x: any) => x.id === 'guidage')).toMatchObject({ name: 'Guider l’utilisateur sur la console', limitEur: null, warnPct: 80, enabled: false, status: 'NO_LIMIT', version: 0 });
      const month = (await c.get(`${A}/usage/month`).expect(200)).body;
      expect(month.thresholds.map((x: any) => x.id)).toEqual(list.map((x: any) => x.id));
    });
    it('plafond d’une ligne budgétaire : Guidage console et Documents modifiables, identifiant inconnu refusé', async () => {
      const c = await t.as(WHO.admin);
      expect((await c.put(`${A}/budget-thresholds/guidage`, { limitEur: 20, warnPct: 75, enabled: true }).expect(200)).body).toMatchObject({ id: 'guidage', limitEur: 20, warnPct: 75, enabled: true, version: 1 });
      expect((await c.put(`${A}/budget-thresholds/docs`, { limitEur: 450, warnPct: 80, enabled: true }).expect(200)).body).toMatchObject({ id: 'docs', limitEur: 450 });
      await c.put(`${A}/budget-thresholds/doc_syn`, { limitEur: 10, warnPct: 80, enabled: true }).expect(404);
    });
  });

  describe('6. Snapshots (vue Snapshots.dc.html)', () => {
    /** Capture `{ libelle }` : 202 et un job, suivi jusqu'à la fin ; renvoie le snapshot créé. */
    const capture = async (c: any, libelle: string) => {
      const r = await c.post(`${A}/projects/RISE/snapshots`, { libelle }).expect(202);
      expect(r.body).toMatchObject({ jobId: expect.any(String), statut: 'en_cours', progression: 0 });
      for (let i = 0; i < 100; i++) {
        const j = await c.get(`${A}/snapshot-jobs/${r.body.jobId}`).expect(200);
        expect(j.body.progression).toBeGreaterThanOrEqual(0);
        if (j.body.statut === 'termine') {
          expect(j.body.progression).toBe(100);
          return j.body.snapshot;
        }
        expect(j.body.statut).toBe('en_cours');
        await new Promise((ok) => setTimeout(ok, 20));
      }
      throw new Error('capture non terminée');
    };

    it('liste : date ISO, type auto | man, libellé, auteur, compteurs (démonstration : effectifs de chaque état)', async () => {
      const c = await t.as(WHO.admin);
      const l = await c.get(`${A}/projects/RISE/snapshots`).expect(200);
      expect(l.body[0]).toEqual({ id: 'r1', date: expect.stringMatching(/^2026-07-17T02:00:00/), type: 'auto', libelle: '', auteur: '', compteurs: { taches: 138, jalons: 12, risques: 17, livrables: 34 } });
      expect(l.body.find((s: any) => s.id === 'r9')).toMatchObject({ type: 'man', libelle: 'Avant le 19e COPIL', auteur: 'Julien Morel', compteurs: { taches: 140, jalons: 12, risques: 19, livrables: 35 } });
      expect((await c.get(`${A}/projects/NOVA/snapshots`).expect(200)).body).toEqual([]);
    });

    it('capture : libellé obligatoire (400), job suivi jusqu’à 100 %, trace dans l’audit', async () => {
      const c = await t.as(WHO.admin);
      await c.post(`${A}/projects/RISE/snapshots`, {}).expect(400);
      await c.post(`${A}/projects/RISE/snapshots`, { label: 'Ancien format' }).expect(400);
      const s = await capture(c, 'Avant import');
      expect(s).toMatchObject({ type: 'man', libelle: 'Avant import', auteur: expect.any(String), compteurs: { taches: expect.any(Number), risques: expect.any(Number) } });
      const a = await t.db.auditEntry.findFirst({ where: { entityType: 'Snapshot', entityId: s.id } });
      expect(a).toMatchObject({ action: 'Création d’un snapshot manuel', profileUsed: 'ADMIN', accountId: 'u1', projectId: 'RISE' });
      await c.get(`${A}/snapshot-jobs/inconnu`).expect(404);
    });

    it('diff : champs et valeurs en clair ; démonstration consolidée (première valeur → dernière valeur)', async () => {
      const c = await t.as(WHO.admin);
      const s = await capture(c, 'Avant diff');
      await (await t.as(WHO.pmo)).patch('/api/projects/RISE/risks/R07', { p: 4 }).expect(200);
      await (await t.as(WHO.pmo)).patch('/api/projects/RISE/risks/R07', { p: 5 }).expect(200);
      await (await t.as(WHO.pmo)).post('/api/projects/RISE/risks', { n: 'Nouveau', p: 1, i: 1, owner: 'p01', wsId: 'C8' }).expect(201);
      const s2 = await capture(c, 'Après diff');
      const d = await c.get(`${A}/snapshots/${s2.id}/diff/${s.id}`).expect(200); // ordre indifférent : A est le plus ancien
      expect(d.body).toEqual(expect.arrayContaining([{ type: 'mod', entite: 'Risque', nom: expect.stringMatching(/^R07 · /), champ: 'Probabilité', avant: '3', apres: '5' }, { type: 'add', entite: 'Risque', nom: expect.stringMatching(/Nouveau$/) }]));
      expect(d.body.filter((x: any) => x.type === 'mod' && x.entite === 'Risque')).toHaveLength(1);

      const demo = (await c.get(`${A}/snapshots/r1/diff/r10`).expect(200)).body;
      expect(demo.filter((x: any) => x.nom === 'Migration du référentiel fournisseurs' && x.champ === 'Avancement')).toEqual([{ type: 'mod', entite: 'Action', nom: 'Migration du référentiel fournisseurs', champ: 'Avancement', avant: '20 %', apres: '65 %' }]);
      // Ajouté puis modifié : reste un ajout.
      expect(demo.filter((x: any) => x.nom === 'Dossier d’architecture v2')).toEqual([{ type: 'add', entite: 'Livrable', nom: 'Dossier d’architecture v2' }]);
      expect({ add: demo.filter((x: any) => x.type === 'add').length, mod: demo.filter((x: any) => x.type === 'mod').length, del: demo.filter((x: any) => x.type === 'del').length }).toEqual({ add: 8, mod: 10, del: 3 });
      await c.get(`${A}/snapshots/r1/diff/a1`).expect(404); // projets différents
      const mixed = await c.get(`${A}/snapshots/r10/diff/${s.id}`).expect(409); // démonstration face à une vraie capture
      expect(mixed.body.message).toMatch(/snapshot de démonstration/);
    });

    it('restauration : sauvegarde de sécurité d’abord, état rétabli (liaisons comprises), audit critique ; démonstration refusée', async () => {
      const c = await t.as(WHO.admin);
      await (await t.as(WHO.pmo)).post(`${A}/snapshots/r9/restore`).expect(403);
      const demo = await c.post(`${A}/snapshots/r9/restore`).expect(409);
      expect(demo.body).toMatchObject({ code: 'SNAPSHOT_SANS_CONTENU', message: 'Ce snapshot de démonstration ne contient pas de données : restauration impossible' });
      await c.post(`${A}/snapshots/inconnu/restore`).expect(404);

      const links = () => t.db.workstreamPhase.count({ where: { ws: { projectId: 'RISE' } } });
      const before = { risks: await t.db.risk.count({ where: { projectId: 'RISE' } }), p: (await t.db.risk.findUniqueOrThrow({ where: { id: 'R07' } })).p, links: await links() };
      const s = await capture(c, 'Point de restauration');
      await (await t.as(WHO.pmo)).patch('/api/projects/RISE/risks/R07', { p: 1 }).expect(200);
      await (await t.as(WHO.pmo)).post('/api/projects/RISE/risks', { n: 'À effacer', p: 1, i: 1, owner: 'p01', wsId: 'C8' }).expect(201);

      const r = await c.post(`${A}/snapshots/${s.id}/restore`).expect(200);
      expect(r.body.restaure).toMatchObject({ id: s.id });
      expect(r.body.securite).toMatchObject({ type: 'man', libelle: 'Sécurité avant restauration', auteur: 'Système' });
      expect({ risks: await t.db.risk.count({ where: { projectId: 'RISE' } }), p: (await t.db.risk.findUniqueOrThrow({ where: { id: 'R07' } })).p, links: await links() }).toEqual(before);
      // La sauvegarde contient l'état d'avant la restauration : on peut revenir en arrière.
      const back = (await c.get(`${A}/snapshots/${s.id}/diff/${r.body.securite.id}`).expect(200)).body;
      expect(back).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'add', entite: 'Risque', nom: expect.stringMatching(/À effacer$/) }), expect.objectContaining({ type: 'mod', champ: 'Probabilité', apres: '1' })]));
      const a = await t.db.auditEntry.findFirst({ where: { action: 'Restauration d’un snapshot' }, orderBy: { at: 'desc' } });
      expect(a).toMatchObject({ severity: 'CRITICAL', profileUsed: 'ADMIN', accountId: 'u1', projectId: 'RISE', entityId: s.id });
      expect(a!.newValue).toMatchObject({ projet: 'RISE', snapshot: s.id, securite: r.body.securite.id });
    });

    it('planification : prochaine capture calculée par le serveur, chaque modification tracée (avant, après)', async () => {
      const c = await t.as(WHO.admin);
      // Maintenant : samedi 26 sept. 2026, 10 h 24 à Paris.
      const w = await c.put(`${A}/projects/ATLAS/snapshot-schedule`, { enabled: true, frequency: 'Hebdomadaire', day: 'Vendredi', hour: '04:00' }).expect(200);
      expect(w.body).toMatchObject({ projectId: 'ATLAS', day: 'vendredi', prochaineCapture: '2026-10-02T02:00:00.000Z', maintenant: '2026-09-26T08:24:00.000Z' });
      const m = await c.put(`${A}/projects/ATLAS/snapshot-schedule`, { frequency: 'Mensuelle', hour: '02:00', retention: '6 mois' }).expect(200);
      expect(m.body).toMatchObject({ frequency: 'Mensuelle', hour: '02:00', retention: '6 mois', prochaineCapture: '2026-10-01T00:00:00.000Z' });
      const q = await c.put(`${A}/projects/ATLAS/snapshot-schedule`, { frequency: 'Quotidienne', hour: '22:00' }).expect(200);
      expect(q.body.prochaineCapture).toBe('2026-09-26T20:00:00.000Z');
      const off = await c.put(`${A}/projects/ATLAS/snapshot-schedule`, { enabled: false }).expect(200);
      expect(off.body.prochaineCapture).toBeNull();
      expect((await c.get(`${A}/projects/ATLAS/snapshot-schedule`).expect(200)).body).toMatchObject({ enabled: false, frequency: 'Quotidienne', prochaineCapture: null });
      await c.put(`${A}/projects/ATLAS/snapshot-schedule`, { frequency: 'Annuelle' }).expect(400);
      await c.put(`${A}/projects/ATLAS/snapshot-schedule`, { day: 'jeudredi' }).expect(400);
      const audit = await t.db.auditEntry.findMany({ where: { entityType: 'SnapshotSchedule', entityId: 'ATLAS' }, orderBy: { at: 'asc' } });
      expect(audit.slice(-4).map((x) => x.action)).toEqual(['Modification de la planification des snapshots', 'Modification de la planification des snapshots', 'Modification de la planification des snapshots', 'Désactivation des snapshots planifiés']);
      expect(audit[audit.length - 1]).toMatchObject({ profileUsed: 'ADMIN', accountId: 'u1', projectId: 'ATLAS', newValue: { projet: 'ATLAS', avant: { enabled: true, frequency: 'Quotidienne', hour: '22:00' }, apres: { enabled: false } } });
    });
  });

  describe('7. Notifications', () => {
    it('enregistrer sans prompt → 400 ; modèle inactif → 400', async () => {
      const c = await t.as(WHO.admin);
      const r = await c.patch(`${A}/notification-rules/n4`, { prompt: '' }).expect(400);
      expect(r.body.fields.prompt).toBeDefined();
      const m = await c.patch(`${A}/notification-rules/n4`, { modelId: 'gflash' }).expect(400);
      expect(m.body.fields.modelId).toBe('modèle inactif');
      await c.patch(`${A}/notification-rules/n4`, { prompt: 'Réponds {reponse_llm}' }).expect(400);
    });
    it('preview remplace {reponse_llm} ; un envoi consomme des jetons visibles dans la consommation', async () => {
      const c = await t.as(WHO.admin);
      await c.patch(`${A}/notification-rules/n4`, { body: 'Synthèse : {reponse_llm}' }).expect(200);
      const p = await c.post(`${A}/notification-rules/n4/preview`, { sampleContext: { semaine: 'semaine 40' } }).expect(200);
      expect(p.body.body).toMatch(/^Synthèse : Synthèse \(réf\./);
      expect(p.body.body).not.toContain('{reponse_llm}');
      expect(p.body.tokens).toBeGreaterThan(0);
      const before = await t.db.usageRecord.count({ where: { source: 'NOTIFICATION' } });
      const sent = await c.post(`${A}/notification-rules/n4/test`).expect(200);
      expect(sent.body[0]).toMatchObject({ status: 'OK', recipientsCount: 1 });
      expect(await t.db.usageRecord.count({ where: { source: 'NOTIFICATION' } })).toBe(before + 1);
    });
    it('un risque qui devient critique déclenche l’alerte n2 (une seule fois)', async () => {
      await (await t.as(WHO.pmo)).patch('/api/projects/RISE/risks/R07', { i: 5 }).expect(200);
      const d = await t.db.delivery.findMany({ where: { ruleId: 'n2', eventKey: { contains: 'R07' } } });
      // Un texte par profil destinataire (Responsable, PMO), chacun sur les deux canaux (APP + EMAIL).
      expect(d.length).toBe(4);
      expect(new Set(d.map((x) => x.profile))).toEqual(new Set(['pmo', 'resp']));
    });
    it('{date} vaut la date du jour dans l’aperçu et l’envoi de test (et non une date d’exemple figée)', async () => {
      const c = await t.as(WHO.admin);
      await c.patch(`${A}/notification-rules/n4`, { subject: '{projet} · {date}' }).expect(200);
      const p = await c.post(`${A}/notification-rules/n4/preview`, {}).expect(200);
      expect(p.body.subject).toBe('RISE · 26 sept. 2026'); // DEMO_TODAY des tests
      const sent = await c.post(`${A}/notification-rules/n4/test`).expect(200);
      expect(sent.body[0].subject).toBe('RISE · 26 sept. 2026');
    });
    it('supprimer une règle : 204, retirée de la liste, historique des envois conservé, trace d’audit ; réservé à l’Admin', async () => {
      const c = await t.as(WHO.admin);
      const sent = await t.db.delivery.count({ where: { ruleId: 'n4' } });
      expect(sent).toBeGreaterThan(0);
      await (await t.as(WHO.pmo)).del(`${A}/notification-rules/n4`).expect(403);
      await c.del(`${A}/notification-rules/n4`).expect(204);
      expect((await c.get(`${A}/notification-rules`).expect(200)).body.map((r: any) => r.id)).not.toContain('n4');
      expect(await t.db.delivery.count({ where: { ruleId: 'n4' } })).toBe(sent);
      expect(await t.db.auditEntry.findFirst({ where: { entityType: 'NotificationRule', entityId: 'n4', action: 'Suppression d’une règle de notification' } })).toMatchObject({ severity: 'SENSITIVE' });
      await c.del(`${A}/notification-rules/n4`).expect(404);
    });
  });

  describe('7 bis. Notifications et alertes : vue (NOTIFICATIONS ET ALERTES - specification.md § 2 à § 4)', () => {
    const blank = { id: 'r1727600000000', type: 'notification', title: 'Nouvelle règle', evt: '', profils: [], projets: ['*'], canaux: ['app'], freq: 'imm', at: '', on: false, model: null, prompt: '', subject: '', body: '' };

    it('liste les règles au format Rule, les destinataires actifs par profil et l’historique ; réservé à l’Admin', async () => {
      const c = await t.as(WHO.admin);
      await (await t.as(WHO.pmo)).get(`${A}/notifications/rules`).expect(403);
      const rules = (await c.get(`${A}/notifications/rules`).expect(200)).body;
      expect(rules.find((r: any) => r.id === 'n1')).toEqual({
        id: 'n1', type: 'alerte', title: 'Jalon en retard', evt: 'un jalon est en retard', profils: ['PMO', 'Responsable'], projets: ['RISE', 'ATLAS'], canaux: ['app', 'mail'],
        freq: 'imm', at: '', on: true, model: 'haiku', prompt: expect.stringContaining('Un jalon a dépassé'), subject: 'Jalon en retard · {projet}', body: expect.stringContaining('{date}'),
      });
      expect(rules.find((r: any) => r.id === 'n3')).toMatchObject({ projets: ['*'], evt: 'le seuil budgétaire IA est atteint' });
      expect(rules.find((r: any) => r.id === 'n5')).toMatchObject({ freq: 'day', at: '18:00', on: false });
      const counts = (await c.get(`${A}/notifications/counts`).expect(200)).body;
      expect(Object.keys(counts)).toEqual(['Admin', 'PMO', 'Responsable', 'Lecteur']);
      expect(counts.Admin).toBeGreaterThan(0);
      expect(counts.PMO).toBeGreaterThan(0);
      const all = (await c.get(`${A}/notifications/history`).expect(200)).body;
      expect(all.some((h: any) => h.rid === 'n2' && h.ok === false && h.c === 'E-mail')).toBe(true);
      expect(all[0]).toEqual(expect.objectContaining({ rid: expect.any(String), w: expect.any(String), c: expect.any(String), d: expect.stringMatching(/destinataire/), ok: expect.any(Boolean) }));
      const one = (await c.get(`${A}/notifications/history?rule=n1`).expect(200)).body;
      expect(one.length).toBeGreaterThan(0);
      expect(one.every((h: any) => h.rid === 'n1')).toBe(true);
    });

    it('création sous l’identifiant de la vue, brouillon incomplet accepté, enregistrement, activation, test, suppression', async () => {
      const c = await t.as(WHO.admin);
      const created = await c.post(`${A}/notifications/rules`, blank).expect(201);
      expect(created.body).toMatchObject({ id: blank.id, title: 'Nouvelle règle', profils: [], model: null, projets: ['*'], evt: 'l’heure d’envoi arrive' });
      await c.post(`${A}/notifications/rules`, blank).expect(409);
      // Fréquence « Personnalisée » retirée ; heure par pas de 30 minutes ; variables {jalon}, {risque}, {seuil}, {document} retirées.
      await c.put(`${A}/notifications/rules/${blank.id}`, { ...blank, freq: 'custom' }).expect(400);
      expect((await c.put(`${A}/notifications/rules/${blank.id}`, { ...blank, freq: 'day', at: '07:15' }).expect(400)).body.fields.at).toBeDefined();
      expect((await c.put(`${A}/notifications/rules/${blank.id}`, { ...blank, subject: 'Retard · {jalon}', body: '{risque}' }).expect(400)).body.fields).toMatchObject({ subject: 'variable retirée : {jalon}', body: 'variable retirée : {risque}' });
      expect((await c.put(`${A}/notifications/rules/${blank.id}`, { ...blank, freq: 'day', at: '' }).expect(200)).body).toMatchObject({ freq: 'day', at: '07:00' });
      expect((await c.put(`${A}/notifications/rules/${blank.id}`, { ...blank, freq: 'week', at: '' }).expect(200)).body).toMatchObject({ freq: 'week', at: 'lundi 07:00' });
      expect((await c.get(`${A}/notifications/schedule`).expect(200)).body).toMatchObject({ timezone: 'Europe/Paris', stepMinutes: 30, defaultHour: '07:00', defaultDay: 'lundi' });
      // Activer une règle bloquée est permis ; l'envoi de test, non (cas bloquants du § 3).
      expect((await c.patch(`${A}/notifications/rules/${blank.id}`, { on: true }).expect(200)).body.on).toBe(true);
      const blocked = await c.post(`${A}/notifications/rules/${blank.id}/test`, {}).expect(422);
      expect(blocked.body.message).toMatch(/Aucun modèle choisi.*Aucun destinataire/);
      // Contrôles d'enregistrement.
      expect((await c.put(`${A}/notifications/rules/${blank.id}`, { ...blank, prompt: 'Réponds {reponse_llm}' }).expect(400)).body.fields.prompt).toBeDefined();
      expect((await c.put(`${A}/notifications/rules/${blank.id}`, { ...blank, model: 'gflash' }).expect(400)).body.fields.model).toBeDefined();
      expect((await c.put(`${A}/notifications/rules/${blank.id}`, { ...blank, canaux: [] }).expect(400)).body.fields.canaux).toBeDefined();
      expect((await c.put(`${A}/notifications/rules/${blank.id}`, { ...blank, projets: ['ZZZ'] }).expect(400)).body.fields.projets).toBeDefined();
      const saved = await c.put(`${A}/notifications/rules/${blank.id}`, { ...blank, title: 'Synthèse du vendredi', profils: ['Admin'], projets: ['RISE'], canaux: ['app', 'mail'], freq: 'week', at: 'vendredi 17:30', model: 'haiku', prompt: 'Résume {projet}.', subject: '{projet} · {date}', body: '{reponse_llm}' }).expect(200);
      expect(saved.body).toMatchObject({ title: 'Synthèse du vendredi', freq: 'week', at: 'vendredi 17:30', model: 'haiku', on: false });
      expect(await t.db.notificationRule.findUnique({ where: { id: blank.id } })).toMatchObject({ frequency: 'WEEKLY', day: 'vendredi', hour: '17:30', platform: false, projectIds: ['RISE'], targetProfiles: ['admin'], channels: ['APP', 'EMAIL'] });
      // Test avec le brouillon affiché (non enregistré) : un envoi par canal, à l'administrateur seul.
      const sent = await c.post(`${A}/notifications/rules/${blank.id}/test`, { ...saved.body, canaux: ['mail'] }).expect(200);
      expect(sent.body).toEqual([expect.objectContaining({ rid: blank.id, c: 'E-mail', d: '1 destinataire', ok: true, w: 'à l’instant' })]);
      expect((await c.get(`${A}/notifications/history?rule=${blank.id}`).expect(200)).body).toHaveLength(1);
      await c.del(`${A}/notifications/rules/${blank.id}`).expect(204);
      await c.put(`${A}/notifications/rules/${blank.id}`, blank).expect(404);
      expect(await t.db.auditEntry.count({ where: { entityType: 'NotificationRule', entityId: blank.id } })).toBe(6);
    });

    it('une règle active mais sans destinataire n’envoie rien quand l’événement survient', async () => {
      const c = await t.as(WHO.admin);
      const n2 = (await c.get(`${A}/notifications/rules`).expect(200)).body.find((r: any) => r.id === 'n2');
      await c.put(`${A}/notifications/rules/n2`, { ...n2, profils: [] }).expect(200);
      const rise = await t.db.project.findFirst({ where: { code: 'RISE' } });
      const risk = await t.db.risk.findFirst({ where: { projectId: rise!.id, status: { not: 'CLOSED' }, code: { not: 'R07' } }, orderBy: { code: 'asc' } });
      await (await t.as(WHO.pmo)).patch(`/api/projects/RISE/risks/${risk!.code}`, { p: 5, i: 5 }).expect(200);
      expect(await t.db.delivery.count({ where: { ruleId: 'n2', eventKey: { contains: risk!.id } } })).toBe(0);
      await c.put(`${A}/notifications/rules/n2`, n2).expect(200);
    });
  });

  describe('8. Modules', () => {
    it('approuver une demande active le module sur le seul projet demandé', async () => {
      const c = await t.as(WHO.admin);
      const r = await c.post(`${A}/module-requests/q1/approve`).expect(200);
      const ben = r.body.find((m: any) => m.id === 'ben');
      expect(ben).toMatchObject({ scope: 'PROJECTS', projectIds: ['RISE'] });
      const mods = await (await t.as(WHO.pmo)).get('/api/projects/RISE/modules').expect(200);
      expect(mods.body.find((m: any) => m.id === 'ben').active).toBe(true);
      expect((await (await t.as(WHO.pmo)).get('/api/projects/ATLAS/modules').expect(200)).body.find((m: any) => m.id === 'ben').active).toBe(false);
    });
  });

  describe('9. Import d’un projet (Initialisation projet § 5)', () => {
    let adminToken = '';
    beforeAll(async () => {
      adminToken = await t.token(WHO.admin);
    });
    const upload = (buf: Buffer, name = 'init.xlsx') => request(t.app.getHttpServer()).post(`${A}/projects/import/validate`).set('Authorization', `Bearer ${adminToken}`).attach('file', buf, name);
    /** Attend la fin de la création ; renvoie les états successifs lus (phase, pourcentage). */
    const follow = async (jobId: string) => {
      const c = await t.as(WHO.admin), seen: any[] = [];
      for (let k = 0; k < 200; k++) {
        const j = (await c.get(`${A}/projects/import/${jobId}`).expect(200)).body;
        seen.push(j);
        if (j.status !== 'running') return seen;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error('création trop longue');
    };

    it('réservé à l’Admin ; format .xlsx ; onglet manquant → non conforme, 422 au commit ; code existant → contrôle « Fiche projet » en erreur', async () => {
      const pmo = await t.token(WHO.pmo);
      await request(t.app.getHttpServer()).post(`${A}/projects/import/validate`).set('Authorization', `Bearer ${pmo}`).attach('file', await buildWorkbook(validAtlas('ORION')), 'init.xlsx').expect(403);
      expect((await upload(Buffer.from('texte'), 'notes.csv').expect(400)).body.message).toBe('Format attendu : .xlsx');
      const r = await upload(await buildWorkbook({ dropSheets: ['03 Personnes'] })).expect(200);
      expect(r.body).toMatchObject({ ok: false, missing: ['03 Personnes'] });
      expect(r.body.checks.map((c: any) => [c.id, c.status])).toEqual([['structure', 'err'], ['project', expect.any(String)], ['required', expect.any(String)], ['consistency', expect.any(String)], ['warnings', expect.any(String)]]);
      await (await t.as(WHO.admin)).post(`${A}/projects/import/commit`, { jobId: r.body.jobId }).expect(422);
      const dup = await upload(await buildWorkbook(validAtlas('RISE'))).expect(200);
      expect(dup.body.ok).toBe(false);
      expect(dup.body.checks[1]).toMatchObject({ id: 'project', status: 'err', detail: 'Code RISE · déjà utilisé dans la bibliothèque' });
      await (await t.as(WHO.admin)).post(`${A}/projects/import/commit`, { jobId: dup.body.jobId }).expect(409);
    });

    it('fichier conforme : vue de l’écran, 5 contrôles ; création en 5 phases, projet PREPARATION, audit ; fichier temporaire supprimé', async () => {
      const r = await upload(await buildWorkbook(validAtlas('ORION'))).expect(200);
      expect(r.body).toMatchObject({ ok: true, file: 'init.xlsx', missing: [] });
      expect(r.body.checks.map((c: any) => c.status)).toEqual(['ok', 'ok', 'ok', 'ok', expect.stringMatching(/ok|warn/)]);
      expect(r.body.project.find((p: any) => p.l === 'Code projet')).toEqual({ l: 'Code projet', v: 'ORION', r: true });
      expect(r.body.sheets['Phases'].rows).toHaveLength(2);
      expect(r.body.sheets['Phases'].rows[0][3]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const row = await t.db.projectImport.findUniqueOrThrow({ where: { id: r.body.jobId } });
      const c = await t.as(WHO.admin);
      const start = await c.post(`${A}/projects/import/commit`, { jobId: r.body.jobId }).expect(202);
      expect(start.body).toMatchObject({ jobId: r.body.jobId, status: 'running' });
      const seen = await follow(r.body.jobId);
      const last = seen[seen.length - 1];
      expect(last).toMatchObject({ status: 'done', phase: 5, percent: 100, result: { projectId: 'ORION', code: 'ORION' } });
      // Phases dans l'ordre, pourcentages croissants.
      const phases = seen.map((x) => x.phase), pct = seen.map((x) => x.percent);
      expect([...phases].sort((a, b) => a - b)).toEqual(phases);
      expect([...pct].sort((a, b) => a - b)).toEqual(pct);
      const lib = await c.get(`${A}/projects`).expect(200);
      expect(lib.body[0]).toMatchObject({ code: 'ORION', status: 'PREPARATION', isNew: true, counts: { waves: 1, phases: 2, workstreams: 1, persons: 3 } });
      const audit = await t.db.auditEntry.findFirst({ where: { action: 'Initialisation d’un projet' } });
      expect(audit).toMatchObject({ severity: 'SENSITIVE', target: 'ORION · init.xlsx', profileUsed: 'ADMIN' });
      expect(await t.app.get(StorageService).get(row.fileKey)).toBeNull();
      await c.post(`${A}/projects/import/commit`, { jobId: r.body.jobId }).expect(409);
    });

    it('une erreur pendant la création annule tout ; « Réinitialiser la session » oublie le fichier côté serveur', async () => {
      const r = await upload(await buildWorkbook(validAtlas('VEGA'))).expect(200);
      // Collision provoquée : une équipe au même identifiant technique existe déjà.
      await t.db.client.upsert({ where: { code: 'AMC Corp' }, create: { id: 'c1', code: 'AMC Corp', name: 'AMC Corp' }, update: {} });
      await t.db.project.create({ data: { id: 'TMP', clientId: 'c1', code: 'TMP', name: 'tmp', startDate: '2026-01-01', targetEndDate: '2026-12-31' } });
      await t.db.team.create({ data: { id: 'VEGA-t-2', projectId: 'TMP', name: 'x' } });
      await (await t.as(WHO.admin)).post(`${A}/projects/import/commit`, { jobId: r.body.jobId }).expect(202);
      const seen = await follow(r.body.jobId);
      expect(seen[seen.length - 1]).toMatchObject({ status: 'failed' });
      expect(await t.db.project.findUnique({ where: { code: 'VEGA' } })).toBeNull();
      expect(await t.db.person.count({ where: { projectId: 'VEGA' } })).toBe(0);
      // Session oubliée : fichier temporaire supprimé, import effacé.
      const again = await upload(await buildWorkbook(validAtlas('LYRA'))).expect(200);
      const key = (await t.db.projectImport.findUniqueOrThrow({ where: { id: again.body.jobId } })).fileKey;
      expect(await t.app.get(StorageService).get(key)).not.toBeNull();
      await (await t.as(WHO.admin)).del(`${A}/projects/import/${again.body.jobId}`).expect(204);
      expect(await t.app.get(StorageService).get(key)).toBeNull();
      expect(await t.db.projectImport.findUnique({ where: { id: again.body.jobId } })).toBeNull();
      await (await t.as(WHO.admin)).post(`${A}/projects/import/commit`, { jobId: again.body.jobId }).expect(404);
    });
  });
});
