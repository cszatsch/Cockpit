import { readFileSync } from 'fs';
import { join } from 'path';
import { latencyMedian } from '../../src/domain/api-cards';
import { WIDGET_CATALOGUE, widgetId, widgetName } from '../../src/domain/widgets';

describe('Catalogue des widgets (registre des cartes API v3c)', () => {
  it('reste identique au catalogue du Cockpit : identifiants, noms et catégories', () => {
    const src = readFileSync(join(__dirname, '../../../frontends/RISE Cockpit.dc.html'), 'utf8');
    const cockpit = [...src.matchAll(/\{ id: '([a-z]+)', name: ('([^']*)'|'([^']*)' \+ [^,]+), cat: '([^']*)'/g)].map((m) => ({ id: m[1], n: m[3] ?? m[4], cat: m[5] }));
    expect(cockpit).toHaveLength(22);
    expect(WIDGET_CATALOGUE).toHaveLength(22);
    for (const w of cockpit) {
      const c = WIDGET_CATALOGUE.find((x) => x.id === w.id);
      expect(c).toBeDefined();
      expect(c!.cat).toBe(w.cat);
      // Météo et Trafic : « Météo · » + ville du projet dans le Cockpit.
      if (w.n.endsWith(' · ')) expect(c!.n.startsWith(w.n)).toBe(true);
      else expect(c!.n).toBe(w.n);
    }
  });

  it('identifiants : anciens libellés du Cockpit convertis, inconnus ignorés ; noms affichables', () => {
    expect(widgetId('meteo')).toBe('meteo');
    expect(widgetId('Météo · ville')).toBe('meteo');
    expect(widgetId('Actualités')).toBe('news');
    expect(widgetId('Météo du site')).toBeNull();
    expect(widgetId(null)).toBeNull();
    expect(widgetName('ai')).toBe('L’essentiel, par Jev');
    expect(widgetName('xyz')).toBe('xyz');
  });

  it('latence médiane des appels réussis', () => {
    expect(latencyMedian([])).toBeNull();
    expect(latencyMedian([{ code: 500, ms: 10 }, { code: 0, ms: null }])).toBeNull();
    expect(latencyMedian([{ code: 200, ms: 300 }, { code: 200, ms: 100 }, { code: 503, ms: 9000 }, { code: 200, ms: 200 }])).toBe(200);
    expect(latencyMedian([{ code: 200, ms: 100 }, { code: 204, ms: 301 }])).toBe(201);
  });
});
