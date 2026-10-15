import { readFileSync } from 'fs';
import { join } from 'path';
import { isHourMinute, isIsoDay } from '../../src/domain/countdown';

/**
 * Compte à rebours Go-Live du Cockpit (maquette « Widget compte a rebours - Meche », 16/10/2026) : le script du composant
 * `frontends/Compte a rebours.dc.html` est exécuté tel quel (classe Component), avec un DCLogic minimal. Les dates
 * s'entendent dans le fuseau du navigateur : ici Europe/Paris (changement d'heure du 28 mars 2027).
 */
process.env.TZ = 'Europe/Paris';
const src = readFileSync(join(__dirname, '../../../frontends/Compte a rebours.dc.html'), 'utf8');
const code = /<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*?)<\/script>/.exec(src)![1];
class DCLogic {
  props: any = {};
  state: any = {};
  setState(p: any) { this.state = { ...this.state, ...(typeof p === 'function' ? p(this.state) : p) }; }
}
const { Component } = new Function('DCLogic', code + '\nreturn { Component };')(DCLogic);

const BASE = { title: 'Compte à rebours Go-Live', eventLabel: 'Go-Live Lot 1', targetDate: '2027-04-01', targetTime: '08:00', startDate: '2026-04-01' };
/** Valeurs rendues à l'instant local `when` (« AAAA-MM-JJTHH:MM:SS », heure de Paris). */
function at(when: string, props: any = {}) {
  const c = new Component();
  c.props = { ...BASE, ...props };
  const [d, t] = when.split('T'), [y, m, j] = d.split('-').map(Number), [h, mi, s] = t.split(':').map(Number);
  c.state = { now: new Date(y, m - 1, j, h, mi, s || 0).getTime() };
  return c.renderVals();
}

describe('Compte à rebours Go-Live (Mèche)', () => {
  it('décompte en jours calendaires : « J− », chiffre, date longue « 1er avril 2027 », aria-label', () => {
    const v = at('2026-10-16T10:00:00');
    expect([v.isNum, v.pre, v.num, v.unit]).toEqual([true, 'J−', '167', '']);
    expect(v.sub).toBe('Go-Live Lot 1 · 1er avril 2027');
    expect(v.aria).toBe('Compte à rebours Go-Live : J−167, Go-Live Lot 1 · 1er avril 2027');
    expect(parseFloat(v.fuseL)).toBeGreaterThan(50);
  });

  it('décompte à la seconde sous le seuil, heures au-delà de 24, changement d’heure du 28 mars 2027', () => {
    // 27/03 20:00 → 29/03 08:00 : 35 h réelles (une heure de moins au passage à l'heure d'été).
    const v = at('2027-03-27T20:00:00', { targetDate: '2027-03-29' });
    expect([v.isClock, v.clock]).toEqual([true, '35:00:00']);
    expect(v.sub).toBe('Go-Live Lot 1 · 29 mars 2027, 08:00');
    expect(at('2027-03-27T20:00:00', { targetDate: '2027-03-29', secondsThreshold: 24 }).isClock).toBe(false);
    expect(at('2027-03-31T07:00:00', { secondsThreshold: 0 })).toMatchObject({ isNum: true, pre: 'J−', num: '1' });
  });

  it('jour J avant et après l’heure ; passage de minuit', () => {
    expect(at('2027-03-31T23:59:59', { secondsThreshold: 0 })).toMatchObject({ pre: 'J−', num: '1' });
    expect(at('2027-04-01T00:00:01', { secondsThreshold: 0 })).toMatchObject({ num: 'Jour J', sub: 'Go-Live Lot 1 · à 08:00', fuseL: '100.000%' });
    expect(at('2027-04-01T09:00:00')).toMatchObject({ num: 'Jour J', sub: 'Go-Live Lot 1 · bascule aujourd’hui' });
    expect(at('2027-04-01T09:00:00', { dayMessage: 'c’est parti' }).sub).toBe('Go-Live Lot 1 · c’est parti');
  });

  it('après la bascule : « J+ » et « depuis la bascule », mèche consumée', () => {
    expect(at('2027-04-11T10:00:00')).toMatchObject({ pre: 'J+', num: '10', unit: 'depuis la bascule', fuseL: '100.000%' });
  });

  it('jours ouvrés : lundi à vendredi strictement entre aujourd’hui et la cible', () => {
    // Samedi 27/03 → mercredi 31/03 : lundi 29 et mardi 30.
    expect(at('2027-03-27T10:00:00', { targetDate: '2027-03-31', unit: 'business', secondsThreshold: 0 })).toMatchObject({ pre: '', num: '2', unit: 'jours ouvrés' });
    // Vendredi 26/03 → lundi 29/03 : aucun jour ouvré entre les deux.
    expect(at('2027-03-26T10:00:00', { targetDate: '2027-03-29', unit: 'business', secondsThreshold: 0 }).num).toBe('0');
  });

  it('date absente ou invalide : trait, message sans date, mèche éteinte', () => {
    for (const targetDate of [undefined, '', '2027-02-31', '01/04/2027']) {
      const v = at('2026-10-16T10:00:00', { targetDate, emptyMessage: 'Go-Live · date non définie' });
      expect([v.isNone, v.hasT, v.sub]).toEqual([true, false, 'Go-Live · date non définie']);
    }
  });

  it('mèche : début invalide ou postérieur à la cible → consumée ; à mi-parcours → 50 %', () => {
    expect(at('2026-10-16T10:00:00', { startDate: '2027-09-01' }).fuseL).toBe('100.000%');
    expect(at('2026-10-16T10:00:00', { startDate: 'x' }).fuseL).toBe('100.000%');
    expect(parseFloat(at('2027-01-01T04:00:00', { startDate: '2026-10-01', targetDate: '2027-04-02', targetTime: '08:00' }).fuseL)).toBeCloseTo(50, 0);
  });

  it('thèmes : sombre par défaut, clair avec accent blanc remplacé par l’encre ; lueur de la flamme', () => {
    const d = at('2026-10-16T10:00:00');
    expect([d.ink, d.ttl, d.acc, d.glow]).toEqual(['#ffffff', '#9fdcd4', '#f7a41c', '0 0 10px 2px #f7a41c88']);
    const l = at('2026-10-16T10:00:00', { theme: 'light', accent: '#ffffff' });
    expect([l.bg, l.ttl, l.acc, l.faint]).toEqual(['#ffffff', '#1d8f86', '#10233a', 'rgba(16,35,58,.12)']);
  });

  it('J−1000 : quatre chiffres', () => {
    expect(at('2026-10-16T10:00:00', { targetDate: '2029-07-12' }).num).toBe('1000');
  });
});

describe('Compte à rebours : validation des réglages', () => {
  it('dates et heures', () => {
    expect([isIsoDay('2027-04-01'), isIsoDay('2027-02-31'), isIsoDay('2027-4-1'), isIsoDay(null)]).toEqual([true, false, false, false]);
    expect([isHourMinute('08:00'), isHourMinute('23:59'), isHourMinute('24:00'), isHourMinute('8:00')]).toEqual([true, true, false, false]);
  });
});
