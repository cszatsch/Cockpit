import { cockpitCaseParts, COCKPIT_LINK_RULE, COCKPIT_REGISTER_RULE, stripMarkdownLinks } from '../../src/domain/jev-prompt';
import { guideAnswerRules } from '../../src/domain/jev-rag';

describe('Jev du Cockpit : vouvoiement et liens (01/10/2026)', () => {
  it('le prompt stable impose le vouvoiement, même contre une Persona qui tutoie, et interdit les liens', () => {
    const p = cockpitCaseParts('Base', { identity: { name: 'Jev', creature: '', style: '', emoji: '' }, soul: '## Comment j’écris\n- Je tutoie.' } as any, [], null, 'Pilotage');
    expect(p.stable).toContain(COCKPIT_REGISTER_RULE);
    expect(COCKPIT_REGISTER_RULE).toMatch(/même si ta Persona indique le tutoiement/);
    expect(p.stable).toContain(COCKPIT_LINK_RULE);
  });

  it('réponse depuis le guide : vouvoiement dans le Cockpit, registre de l’utilisateur dans la Console', () => {
    expect(guideAnswerRules('cockpit')).toContain('en vouvoyant l’utilisateur');
    expect(guideAnswerRules('cockpit')).not.toContain('au registre de l’utilisateur');
    expect(guideAnswerRules('console')).toContain('au registre de l’utilisateur');
  });

  it('un lien Markdown devient son libellé en gras', () => {
    expect(stripMarkdownLinks('Voir [Info projet › Dispositif](cockpit://info-projet/dispositif).')).toBe('Voir **Info projet › Dispositif**.');
    expect(stripMarkdownLinks('[**Risques**](https://x.fr/r) et [Actions](/a)')).toBe('**Risques** et **Actions**');
    expect(stripMarkdownLinks('Rien à changer [ici] (p. 3).')).toBe('Rien à changer [ici] (p. 3).');
  });
});
