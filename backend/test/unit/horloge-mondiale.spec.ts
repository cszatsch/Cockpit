import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Horloge mondiale du Cockpit (maquette « Widget horloge mondiale - Quatre ciels », 15/10/2026) : le script du composant
 * `frontends/Horloge mondiale.dc.html` est exécuté tel quel (classe Component), avec un DCLogic minimal.
 */
const src = readFileSync(join(__dirname, '../../../frontends/Horloge mondiale.dc.html'), 'utf8');
const code = /<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/.exec(src)![1];
class DCLogic {
  props: any = {};
  state: any = {};
  setState(p: any) { this.state = { ...this.state, ...(typeof p === 'function' ? p(this.state) : p) }; }
}
const { Component } = new Function('DCLogic', code + '\nreturn { Component };')(DCLogic);

const C = (name: string, timeZone: string, lat: number, lon: number) => ({ name, timeZone, lat, lon });
const PARIS = C('Paris', 'Europe/Paris', 48.857, 2.352), NY = C('New York', 'America/New_York', 40.713, -74.006);
const TOKYO = C('Tokyo', 'Asia/Tokyo', 35.68, 139.69), SYDNEY = C('Sydney', 'Australia/Sydney', -33.87, 151.21);
const KOLKATA = C('Calcutta', 'Asia/Kolkata', 22.57, 88.36);

/** Colonnes rendues à l'instant `iso` (UTC). */
function at(iso: string, props: any = {}) {
  const c = new Component();
  c.props = props;
  c.state = { now: Date.parse(iso) };
  return c.renderVals().cols as any[];
}

describe('Horloge mondiale (Quatre ciels)', () => {
  it('liste par défaut : Paris en référence, New York, Tokyo, Sydney ; heure HH:MM, décalages', () => {
    const [p, n, t, s] = at('2026-10-15T08:14:00Z');
    expect([p.name, n.name, t.name, s.name]).toEqual(['Paris', 'New York', 'Tokyo', 'Sydney']);
    expect([p.time, n.time, t.time, s.time]).toEqual(['10:14', '04:14', '17:14', '19:14']);
    expect([p.off, n.off, t.off, s.off]).toEqual(['Réf.', '−6 h', '+7 h', '+9 h']);
    expect(p.sec).toBe('');
  });

  it('secondes avec showSeconds, villes des props dans leur ordre', () => {
    const [k, p] = at('2026-10-15T08:14:09Z', { cities: [KOLKATA, PARIS], showSeconds: true });
    expect([k.off, p.off]).toEqual(['Réf.', '−3 h 30']);
    expect([k.time, k.sec]).toEqual(['13:44', ':09']);
  });

  it('changements d’heure : Europe le 25 octobre, États-Unis le 1er novembre, Sydney en avril', () => {
    const off = (iso: string) => at(iso).map((c) => c.off);
    expect(off('2026-10-20T12:00:00Z')).toEqual(['Réf.', '−6 h', '+7 h', '+9 h']);
    expect(off('2026-10-27T12:00:00Z')).toEqual(['Réf.', '−5 h', '+8 h', '+10 h']); // Paris à l'heure d'hiver, pas encore New York
    expect(off('2026-11-02T12:00:00Z')).toEqual(['Réf.', '−6 h', '+8 h', '+10 h']);
    expect(off('2026-04-01T12:00:00Z')[3]).toBe('+9 h'); // Sydney à l'heure d'été (UTC+11), Paris UTC+2
    expect(off('2026-04-10T12:00:00Z')[3]).toBe('+8 h'); // Sydney revenu à UTC+10 le 5 avril
    // Juste avant et juste après le passage de Paris à l'heure d'hiver (25/10, 01:00 UTC).
    expect(at('2026-10-25T00:59:00Z')[0].time).toBe('02:59');
    expect(at('2026-10-25T01:00:00Z')[0].time).toBe('02:00');
  });

  it('fuseau à demi-heure (Asia/Kolkata), signe moins « − » et ±0 h', () => {
    const [, k, l] = at('2026-12-01T10:00:00Z', { cities: [PARIS, KOLKATA, C('Londres', 'Europe/London', 51.507, -0.128)] });
    expect(k.off).toBe('+4 h 30');
    expect(l.off).toBe('−1 h');
    expect(at('2026-12-01T10:00:00Z', { cities: [PARIS, C('Berlin', 'Europe/Berlin', 52.52, 13.4)] })[1].off).toBe('±0 h');
  });

  it('passage de minuit : (J+1) et (J−1) par rapport à la référence', () => {
    const [p, n, t, s] = at('2026-10-15T14:30:00Z');
    expect([p.sub, n.sub, t.sub, s.sub]).toEqual(['jeu. 15 · au bureau', 'jeu. 15 · au bureau', 'jeu. 15', 'ven. 16 (J+1)']); // 16:30, 10:30, 23:30, 01:30
    const [t2, n2] = at('2026-10-15T16:00:00Z', { cities: [TOKYO, NY] });
    expect([t2.sub, n2.sub]).toEqual(['ven. 16', 'jeu. 15 (J−1) · au bureau']);
  });

  it('bureau : du lundi au vendredi, de 9 h à 18 h en heure locale ; rien le week-end', () => {
    const sub = (iso: string) => at(iso, { cities: [PARIS] })[0].sub;
    expect(sub('2026-10-15T06:59:00Z')).toBe('jeu. 15'); // 08:59
    expect(sub('2026-10-15T07:00:00Z')).toBe('jeu. 15 · au bureau'); // 09:00
    expect(sub('2026-10-15T15:59:00Z')).toBe('jeu. 15 · au bureau'); // 17:59
    expect(sub('2026-10-15T16:00:00Z')).toBe('jeu. 15'); // 18:00
    expect(sub('2026-10-17T08:00:00Z')).toBe('sam. 17'); // samedi 10:00
    expect(sub('2026-10-18T08:00:00Z')).toBe('dim. 18');
  });

  it('soleil : hémisphère sud de jour, nuit à Paris ; disque au-dessus de l’horizon, cercle creux dessous', () => {
    const [p, , , s] = at('2026-10-15T02:00:00Z'); // 04:00 à Paris, 13:00 à Sydney
    expect(s.e).toBeGreaterThan(50);
    expect(p.e).toBeLessThan(-18);
    expect(s.sun).toContain('width:11px');
    expect(s.sun).toContain('background:#ffe2a6');
    expect(p.sun).toContain('width:9px');
    expect(p.sun).toContain('top:87.0px'); // 78 + 9 (au plus bas)
    expect(s.sun).toContain('left:53.33%'); // 10 % + 13/24 × 80 %
    // Sydney en hiver austral (juin) : soleil de midi plus bas qu'en octobre.
    expect(at('2026-06-21T02:00:00Z')[3].e).toBeLessThan(s.e - 20);
  });

  it('contraste : texte blanc sur ciel sombre, navy sur ciel clair ; horizon assorti', () => {
    const [p, , , s] = at('2026-10-15T02:00:00Z');
    expect([p.ink, p.mut, p.hz]).toEqual(['#fff', 'rgba(255,255,255,.66)', 'rgba(255,255,255,.22)']);
    expect([s.ink, s.mut, s.hz]).toEqual(['#10233a', 'rgba(16,35,58,.66)', 'rgba(16,35,58,.2)']);
    expect(p.bg).toMatch(/^linear-gradient\(180deg,rgb\(\d+,\d+,\d+\) 0%,rgb\(\d+,\d+,\d+\) 100%\)$/);
  });

  it('accessibilité : libellé de chaque colonne, sans les secondes', () => {
    const cols = at('2026-10-15T13:14:00Z', { showSeconds: true });
    expect(cols[2].aria).toBe('Tokyo : 22:14, jeu. 15');
    expect(cols[0].aria).toBe('Paris : 15:14, jeu. 15, au bureau');
  });

  it('un seul minuteur par instance, arrêté au démontage ; un formateur par fuseau', () => {
    jest.useFakeTimers();
    try {
      const c = new Component();
      c.props = {};
      c.componentDidMount();
      expect(jest.getTimerCount()).toBe(1);
      const t0 = c.state.now;
      jest.advanceTimersByTime(1000);
      expect(c.state.now).toBeGreaterThanOrEqual(t0);
      c.renderVals();
      c.renderVals();
      expect(Object.keys(c.f).sort()).toEqual(['America/New_York', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/Paris']);
      c.componentWillUnmount();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
