import { blamesAccess, EMPTY_RESULT_RETRIES, emptyRetryPrompt, NO_ACCESS_SPECULATION, NO_MATCH_TEXT } from '../../src/domain/notification-results';

/** Incident du 19/10/2026 : résultat vide d'une notification attribué à tort aux droits du destinataire. */
describe('Notifications — résultat vide et explication inventée', () => {
  it('le texte reçu le 19/10/2026 est reconnu comme une mise en cause des droits', () => {
    for (const s of [
      'Le projet PMS n’affiche aucune donnée accessible : vérifiez votre habilitation PMO et que le projet_id est correct dans le Référentiel.',
      'Restriction d’accès possible',
      'Filtre applicatif masquant les données',
      'Vérifier l’habilitation PMO sur le projet PMS dans le Référentiel',
      "Vos droits d'accès ne permettent pas de lire ces risques.",
      'Accès restreint aux données de ce chantier.',
      'Vérifiez vos droits sur le projet.',
    ]) expect([s, blamesAccess(s)]).toEqual([s, true]);
  });

  it('un compte rendu ordinaire n’est pas confondu avec une mise en cause des droits', () => {
    for (const s of [
      '4 risques ouverts, dont 1 transverse ; aucune décision en cours.',
      '## À surveiller\n- **R03** sans plan de mitigation, échéance dépassée',
      'Aucun risque ne correspond à la demande.',
      'Décision D12 à arbitrer au prochain COPIL.',
      NO_MATCH_TEXT,
    ]) expect([s, blamesAccess(s)]).toEqual([s, false]);
  });

  it('la consigne de nouvelle requête cite la requête vide et demande des jointures facultatives', () => {
    const p = emptyRetryPrompt('Analyse les risques et les décisions.', 'SELECT * FROM risques r JOIN decisions d ON d.chantier_id = r.chantier_id');
    expect(p.startsWith('Analyse les risques et les décisions.')).toBe(true);
    expect(p).toContain('JOIN decisions d ON d.chantier_id = r.chantier_id');
    expect(p).toMatch(/LEFT JOIN/);
    expect(p).toMatch(/ne filtre ni sur le projet ni sur les droits/);
    expect(p).toMatch(/```sql```/);
  });

  it('une seule nouvelle requête ; la consigne interdit toute cause liée aux droits', () => {
    expect(EMPTY_RESULT_RETRIES).toBe(1);
    expect(NO_ACCESS_SPECULATION).toMatch(/habilitation/);
    expect(NO_ACCESS_SPECULATION).toMatch(/déjà appliqués/);
  });
});
