import { gapCount, gaps, gapText, proposal } from '../../src/domain/habilitation-proposals';

describe('Habilitations proposées par le référentiel', () => {
  it('proposition : Responsable des chantiers dont la personne est responsable, Lecteur des autres chantiers de rattachement', () => {
    expect(proposal(['C4', 'C1'], ['C2', 'C1', 'C3'])).toEqual({ responsable: ['C1', 'C4'], lecteur: ['C2', 'C3'] });
    expect(proposal([], [])).toEqual({ responsable: [], lecteur: [] });
  });

  it('écarts : Responsable manquant ou en trop, lecture manquante ; PMO et lecture en plus ne sont pas des écarts', () => {
    const p = proposal(['C1'], ['C2', 'C3']);
    expect(gaps(p, { pmo: false, responsable: ['C1'], lecteur: ['C2', 'C3', 'C8'] })).toEqual({ responsableManquant: [], responsableEnTrop: [], lectureManquante: [], accesARetirer: [] });
    const g = gaps(p, { pmo: false, responsable: ['C6'], lecteur: ['C2'] });
    expect(g).toEqual({ responsableManquant: ['C1'], responsableEnTrop: ['C6'], lectureManquante: ['C3'], accesARetirer: [] });
    expect(gapCount(g)).toBe(3);
    expect(gapText('RISE', g)).toBe('RISE : Responsable de C1 non attribué ; Responsable de C6 sans en être responsable ; lecture de C3 manquante');
    // Un Responsable a accès en lecture : pas de lecture manquante.
    expect(gaps(proposal([], ['C2']), { pmo: false, responsable: ['C2'], lecteur: [] }).lectureManquante).toEqual([]);
    expect(gapCount(gaps(p, { pmo: true, responsable: [], lecteur: [] }))).toBe(0);
    expect(gaps(p, undefined)).toEqual({ responsableManquant: ['C1'], responsableEnTrop: [], lectureManquante: ['C2', 'C3'], accesARetirer: [] });
  });

  it('personne désactivée : tout accès restant (PMO compris) est à retirer ; sans accès, rien à signaler', () => {
    const none = proposal([], []);
    const g = gaps(none, { pmo: false, responsable: ['C6', 'C5'], lecteur: ['C2'] }, true);
    expect(g.accesARetirer).toEqual(['Responsable de C5, C6', 'Lecteur de C2']);
    expect(gapText('RISE', g)).toBe('RISE : désactivé dans le référentiel, accès encore ouvert (Responsable de C5, C6 · Lecteur de C2)');
    expect(gaps(none, { pmo: true, responsable: [], lecteur: [] }, true).accesARetirer).toEqual(['PMO']);
    expect(gapCount(gaps(none, undefined, true))).toBe(0);
  });
});
