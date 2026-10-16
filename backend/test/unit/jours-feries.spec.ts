import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Jours fériés du Cockpit (maquette « Widget jours feries - Ephemeride », 16/10/2026) : le script du composant
 * `frontends/Jours feries.dc.html` est exécuté tel quel (classe Component), avec un DCLogic minimal.
 */
process.env.TZ = 'Europe/Paris';
const src = readFileSync(join(__dirname, '../../../frontends/Jours feries.dc.html'), 'utf8');
const code = /<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/.exec(src)![1];
class DCLogic {
  props: any = {};
  state: any = {};
  setState(p: any) { this.state = { ...this.state, ...(typeof p === 'function' ? p(this.state) : p) }; }
}
const { Component } = new Function('DCLogic', code + '\nreturn { Component };')(DCLogic);

function view(props: any = {}, state: any = {}) {
  const c = new Component();
  c.props = { paysProjet: 'FR', paysNom: 'France', aujourdhui: '2026-10-16', ...props };
  c.state = { ...c.state, ...state };
  return c.renderVals().t;
}

describe('Jours fériés (Éphéméride)', () => {
  it('France : prochain jour férié, effet, liste, aria-label, « 1er »', () => {
    const t = view({ finProjet: '2027-06-30' });
    expect([t.nx.name, t.nx.day, t.nx.er, t.nx.rem]).toEqual(['Toussaint', 1, true, 'dans 16 jours']);
    expect(t.nx.effL).toBe('Tombe un dimanche, sans effet sur le planning');
    expect(t.rest[0]).toMatchObject({ name: 'Armistice 1918', dS: '11 nov.', remS: '26 j', k: 'lost' });
    expect(t.rest[0].aria).toBe('Armistice 1918, mercredi 11 novembre 2026, dans 26 jours. 1 jour ouvré perdu.');
    expect(t.pLabel).toBe('Jusqu’au 30 juin 2027'.replace('’', "'"));
    expect(t.rest.every((h: any) => h.d <= new Date(2027, 5, 30))).toBe(true);
  });

  it('pont possible le mardi ou le jeudi (Ascension 2027, jeudi 6 mai) ; synthèse', () => {
    const t = view({ finProjet: '2027-06-30' });
    const asc = t.rest.find((h: any) => h.name === 'Ascension');
    expect([asc.k, asc.effS]).toEqual(['pont', 'Pont possible le vendredi']);
    expect(t.sy.lost).toBe(t.rest.concat([t.nx]).filter((h: any) => h.k !== 'we').length);
    expect(t.sy.hasP).toBe(true);
  });

  it('États-Unis : jour férié du samedi observé le vendredi (4 juillet 2026 → vendredi 3)', () => {
    const t = view({ paysProjet: 'US', aujourdhui: '2026-06-01' });
    const ind = [t.nx].concat(t.rest).find((h: any) => /Indépendance/.test(h.name));
    expect(ind.dLong).toBe('vendredi 3 juillet 2026');
    expect(ind.effL).toBe('1 jour ouvré perdu, reporté du samedi');
  });

  it('jours fériés à la même date fusionnés (1er mai 2008 : Fête du Travail · Ascension)', () => {
    const t = view({ aujourdhui: '2008-04-01', finProjet: '2008-05-31' });
    expect([t.nx].concat(t.rest).some((h: any) => h.name === 'Fête du Travail · Ascension')).toBe(true);
  });

  it('libellés de période : 12 prochains mois, années consécutives ou non ; aucune année → durée du projet', () => {
    expect(view({}, { mode: 'next12' }).pLabel).toBe('12 prochains mois');
    expect(view({}, { mode: 'years', years: [2026, 2027] }).pLabel).toBe('2026–2027');
    expect(view({}, { mode: 'years', years: [2026, 2028] }).pLabel).toBe('2026 · 2028');
    expect(view({}).pLabel).toBe('12 prochains mois'); // sans date de fin : 12 mois
  });

  it('états : pays indisponible, pays inconnu du référentiel, projet terminé, aucun jour férié', () => {
    expect(view({ paysProjet: 'MA' }).msg.title).toBe('Calendrier indisponible pour le Maroc');
    expect(view({ paysProjet: '', paysNom: 'Espagne' }).msg.title).toBe('Calendrier indisponible pour Espagne');
    const end = view({ finProjet: '2026-09-30' });
    expect([end.msg.title, end.msg.sub, end.msg.act]).toEqual(['Projet terminé le 30 septembre 2026', 'Plus aucun jour férié ne touche le planning.', 'Voir les 12 prochains mois']);
    expect(view({ finProjet: '2026-10-20' }).msg.title).toBe('Aucun jour férié sur la période');
  });

  it('pays différent du projet : pastille et retour ; changer de pays remet la région à zéro', () => {
    const c = new Component();
    c.props = { paysProjet: 'FR', paysNom: 'France', aujourdhui: '2026-10-16' };
    c.state = { ...c.state, rg: 'AM' };
    let t = c.renderVals().t;
    t.ctry.find((o: any) => o.n === 'Allemagne').tap();
    t = c.renderVals().t;
    expect([t.moved, t.cLabel, c.state.rg, t.resetL]).toEqual([true, 'Allemagne', '', 'Revenir au pays du projet : France']);
  });

  it('thème sombre : couleurs de la maquette', () => {
    const c = new Component();
    c.props = { paysProjet: 'FR', aujourdhui: '2026-10-16', theme: 'sombre' };
    const t = c.renderVals().t;
    expect([t.bg, t.ink, t.acc, t.warn, t.warnDot, t.ring]).toEqual(['#0f2136', '#eef3f6', '#41c2b3', '#f0b453', '#e7a73d', '#6f8599']);
  });
});
