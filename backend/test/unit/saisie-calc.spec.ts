// « Saisir sans Jev » (09/10/2026) : calculs du formulaire, partagés avec l'écran (frontends/saisie-calc.js).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const C = require('../../../frontends/saisie-calc.js');

describe('Saisir sans Jev — calculs purs', () => {
  const A = [{ c: 'Coût total sur 3 ans', w: '40', n: 3 }, { c: 'Délai de mise en œuvre', w: '35', n: 4 }, { c: 'Couverture fonctionnelle', w: '25', n: 1 }];
  const B = [{ c: 'Coût total sur 3 ans', w: '40', n: 2 }, { c: 'Délai de mise en œuvre', w: '35', n: 2 }, { c: 'Couverture fonctionnelle', w: '25', n: 4 }];

  it('score = Σ(poids × note) / Σ(poids), affiché sur 4 avec deux décimales et une virgule', () => {
    expect(C.formatScore(C.optionScore(A))).toBe('2,85');
    expect(C.formatScore(C.optionScore(B))).toBe('2,50');
  });

  it('seuls les critères qui ont un poids et une note comptent ; aucun : 0', () => {
    expect(C.optionScore([{ w: '50', n: 4 }, { w: '50', n: 0 }, { w: '', n: 1 }])).toBe(4);
    expect(C.optionScore([{ w: '', n: 3 }])).toBe(0);
    expect(C.formatScore(0)).toBe('0,00');
  });

  it('total des poids : 100 %, à répartir, en excès', () => {
    expect(C.totalWeight(A)).toBe(100);
    expect(C.weightState(100)).toEqual({ ok: true, warn: false, text: 'Poids répartis · 100 %' });
    expect(C.weightState(75)).toEqual({ ok: false, warn: true, text: '25 % à répartir' });
    expect(C.weightState(110)).toEqual({ ok: false, warn: true, text: '10 % en excès' });
    expect(C.totalWeight([{ w: '4a0' }, { w: null }])).toBe(40);
  });

  it('barre de composition : largeur = poids, remplissage = note, couleur selon la note, reste en pointillés', () => {
    const s = C.composition([{ c: 'Coût', w: '40', n: 3 }, { c: 'Délai', w: '35', n: 0 }]);
    expect(s).toEqual([
      { flex: 40, fillPct: 75, color: '#1f9a8a', rest: false, tip: 'Coût · 40 % · 3/4' },
      { flex: 35, fillPct: 0, color: 'transparent', rest: false, tip: 'Délai · 35 % · non noté' },
      { flex: 25, fillPct: 0, color: 'transparent', rest: true, tip: '25 % à répartir' },
    ]);
    expect(C.NOTE_COLORS).toEqual(['#c2413b', '#b8650f', '#1f9a8a', '#0d5952']);
  });

  it('comparaison : meilleure option, écart, suggestion ; égalité', () => {
    expect(C.compare(2.85, 2.5)).toEqual({ lead: 0, gap: '+0,35', verdict: "L'option A devance de 0,35 point", suggest: 'Le score suggère A' });
    expect(C.compare(1, 3.5)).toMatchObject({ lead: 1, verdict: "L'option B devance de 2,50 points" });
    expect(C.compare(2, 2.001)).toEqual({ lead: -1, gap: '=', verdict: 'Les deux options obtiennent le même score', suggest: 'Scores à égalité' });
  });

  it('criticité d’un risque = probabilité × impact sur 16, et niveau', () => {
    expect(C.criticality(3, 3)).toMatchObject({ value: 9, text: '9 / 16 · Majeure', color: '#e08a1e' });
    expect(C.criticality(4, 3).level).toBe('Critique');
    expect(C.criticality(1, 3).level).toBe('Modérée');
    expect(C.criticality(1, 2).level).toBe('Faible');
  });

  it('dates saisies au clavier : masque jj/mm/aaaa, conversion, dates impossibles refusées', () => {
    expect(C.maskDate('1')).toBe('1');
    expect(C.maskDate('120')).toBe('12/0');
    expect(C.maskDate('12/03/20265')).toBe('12/03/2026');
    expect(C.maskDate('ab12c0320')).toBe('12/03/20');
    expect(C.frToIso('12/03/2026')).toBe('2026-03-12');
    expect(C.frToIso('31/02/2026')).toBe('');
    expect(C.frToIso('29/02/2028')).toBe('2028-02-29');
    expect(C.frToIso('12/03/26')).toBe('');
    expect(C.isoToFr('2026-10-09')).toBe('09/10/2026');
    expect(['', '12/0', '12/03/2026', '00/01/2026'].map(C.dateState)).toEqual(['empty', 'partial', 'valid', 'invalid']);
  });

  it('période : valide, incomplète, inversée ou invalide', () => {
    expect(C.rangeState(['01/10/2026', '31/12/2026'])).toBe('valid');
    expect(C.rangeState(['01/10/2026', ''])).toBe('partial');
    expect(C.rangeState(['', ''])).toBe('empty');
    expect(C.rangeState(['31/12/2026', '01/10/2026'])).toBe('reversed');
    expect(C.rangeState(['32/12/2026', '01/10/2027'])).toBe('invalid');
  });
});
