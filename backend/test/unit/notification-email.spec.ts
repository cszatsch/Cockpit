import { emailBlocks, notificationHtml } from '../../src/domain/notification-email';

/** E-mail des notifications (04/10/2026) : lecture en blocs et mise en page HTML. */
describe('E-mail des notifications', () => {
  const md = "Bonjour,\nVeuillez trouver, ci-dessous, une analyse des risques du projet.\n\nTrois risques critiques sans couverture menacent le Go-Live : arbitrage urgent.\n- 25 criticité de R01\n- 79 / 40 user stories CRM\n- 27 / 61 objets traités\n- 5 interfaces en dérive\n## À surveiller\n- **R01** replanification sans décision\n- **R02** périmètre à arbitrer\n## À faire\n1. Arbitrer D-009 (79 US sur 40)\n2. Valider les plans de R01 et R02 avant 14/10\n\nCordialement";
  const ctx = { rule: 'Analyse des risques', project: 'RISE', date: '4 oct. 2026', profile: 'PMO', appUrl: 'http://localhost:3000', from: 'cockpitbyone@gmail.com' };

  it('blocs : salutations en introduction, essentiel en titre, chiffres clés (avec dénominateur), à surveiller, à faire ; formule finale omise', () => {
    const b = emailBlocks(md);
    expect(b.map((x) => x.k)).toEqual(['intro', 'lead', 'kpi', 'watch', 'todo']);
    expect(b[2]).toEqual({ k: 'kpi', items: [{ value: '25', of: null, label: 'criticité de R01' }, { value: '79', of: '40', label: 'user stories CRM' }, { value: '27', of: '61', label: 'objets traités' }, { value: '5', of: null, label: 'interfaces en dérive' }] });
    expect(b[3]).toMatchObject({ k: 'watch', title: 'À surveiller', items: [{ code: 'R01', text: 'replanification sans décision' }, { code: 'R02', text: 'périmètre à arbitrer' }] });
    expect(b[4]).toMatchObject({ k: 'todo', items: ['Arbitrer D-009 (79 US sur 40)', 'Valider les plans de R01 et R02 avant 14/10'] });
    // Ancien envoi en tableau : lignes « code · texte ».
    expect(emailBlocks('Essentiel.\n| Code | Risque |\n|---|---|\n| R03 | CRM incomplet |')[1]).toMatchObject({ k: 'watch', items: [{ code: 'R03', text: 'CRM incomplet' }] });
  });

  it('HTML : rubrique colorée selon la gravité, titre, chiffres en grand (rouge si critique ou dépassé), barre de progression, échéance en relief, pied', () => {
    const html = notificationHtml(md, ctx);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('>Analyse des risques</td>');
    expect(html).toContain('Trois risques critiques sans couverture menacent le Go-Live&nbsp;: arbitrage urgent.'); // espace insécable
    expect(html).toMatch(/color:#B5382B[^>]*>25</); // criticité ≥ 20 en rouge
    expect(html).toMatch(/color:#B5382B[^>]*>79<span/); // 79 sur 40 : dépassement en rouge
    expect(html).toContain('width="44%"'); // 27 / 61 : barre de progression
    expect(html).toContain('>avant 14/10</span>');
    expect(html).toContain('(79 US sur 40)');
    expect(html).toContain('Vous recevez cette notification en tant que PMO du projet RISE.');
    expect(html).toContain('href="http://localhost:3000"');
    expect(html).not.toContain('Cordialement');
    expect(html).not.toContain('**');
    // Texte seul : titre seul, sans chiffres ni rubriques.
    const short = notificationHtml('Quatre actions arrivent à échéance d’ici vendredi.', { ...ctx, rule: 'Actions' });
    expect(short).toContain('>Quatre actions arrivent à échéance d’ici vendredi.</td>');
    expect(short).not.toContain('À FAIRE');
  });
});
