import { firstNameOf, invitationEmail, longFrDate } from '../../src/domain/invitation-email';

/** E-mail d'invitation (texte du commanditaire et mise en page, 11/10/2026). */
describe('E-mail d’invitation à Cockpit', () => {
  const base = { fullName: 'William Schmitz', email: 'william@exemple.fr', link: 'https://cockpit.exemple/mot-de-passe/reinitialiser?token=abc&x=1', validityDays: 14, expiresIso: '2026-10-25' };

  it('objet, prénom, contenu du commanditaire, date limite, adresse de connexion', () => {
    const m = invitationEmail(base);
    expect(m.subject).toBe('Votre invitation à rejoindre l’application Cockpit');
    expect(m.text).toMatch(/^Bonjour William,/);
    for (const t of ['Vous avez été invité(e) à rejoindre Cockpit, votre espace de gestion de pilotage projet en ligne.', 'Ce lien est personnel et ne peut être utilisé qu’une seule fois.', 'Il reste valable pendant 14 jours, soit jusqu’au 25 octobre 2026.', 'aucun compte ne sera activé sans votre action', 'L’équipe Cockpit']) expect(m.text).toContain(t);
    expect(m.html).toContain('>Activer mon compte');
    expect(m.html).toContain('25 octobre 2026');
    expect(m.html).toContain('william@exemple.fr');
    expect(m.html).toContain('href="https://cockpit.exemple/mot-de-passe/reinitialiser?token=abc&amp;x=1"'); // lien échappé
    expect(m.html).not.toMatch(/<img|https?:\/\/fonts\./); // ni image ni police distante
  });

  it('relance : objet distinct ; nom à échapper ; dates et prénoms', () => {
    expect(invitationEmail({ ...base, again: true }).subject).toContain('nouveau lien');
    expect(invitationEmail({ ...base, fullName: '<b>Zoé</b> Martin' }).html).toContain('Bonjour &lt;b&gt;Zoé&lt;/b&gt;,');
    expect(longFrDate('2026-11-01')).toBe('1er novembre 2026');
    expect(firstNameOf('  Anne-Sophie Durand ')).toBe('Anne-Sophie');
  });
});
