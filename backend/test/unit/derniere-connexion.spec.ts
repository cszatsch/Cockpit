import { calendarDaysSince } from '../../src/domain/dates';

/** Console › Utilisateurs, « Dernière connexion » (21/10/2026) : jours du calendrier à Paris, et non périodes de 24 h. */
describe('Jours du calendrier depuis une connexion', () => {
  const TZ = 'Europe/Paris';
  const now = new Date('2026-10-21T08:30:00Z'); // 21/10, 10:30 à Paris

  it('une connexion d’hier après-midi, moins de 24 h plus tôt, compte pour la veille (cas de la capture)', () => {
    expect(calendarDaysSince(new Date('2026-10-20T13:11:00Z'), now, TZ)).toBe(1); // 20/10, 15:11
    expect(calendarDaysSince(new Date('2026-10-20T08:38:00Z'), now, TZ)).toBe(1); // 20/10, 10:38
  });

  it('le même jour à Paris : 0, y compris juste après minuit', () => {
    expect(calendarDaysSince(new Date('2026-10-21T07:24:00Z'), now, TZ)).toBe(0); // 21/10, 09:24
    expect(calendarDaysSince(new Date('2026-10-20T22:05:00Z'), now, TZ)).toBe(0); // 21/10, 00:05 (encore le 20 en UTC)
  });

  it('plusieurs jours, et à travers le passage à l’heure d’hiver', () => {
    expect(calendarDaysSince(new Date('2026-10-17T09:00:00Z'), now, TZ)).toBe(4);
    expect(calendarDaysSince(new Date('2026-10-24T22:30:00Z'), new Date('2026-10-25T23:30:00Z'), TZ)).toBe(1); // 25/10 00:30 → 26/10 00:30
  });
});
