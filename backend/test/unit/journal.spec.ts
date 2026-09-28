import { csvFile, csvNum, decodeCursor, encodeCursor, splitCost, stepsOf } from '../../src/domain/journal';

describe('Journal des appels : règles', () => {
  it('Documents regroupe ses trois étapes', () => {
    expect(stepsOf('docs')).toEqual(['doc_vec', 'doc_rrk', 'doc_syn']);
    expect(stepsOf('guidage')).toEqual(['guidage']);
  });

  it('coût entrée / sortie : tarif figé, somme égale au coût enregistré', () => {
    const r = { tokensIn: 12000, tokensOut: 1600, requests: 0, costEur: (12000 * 2.8 + 1600 * 14) / 1e6, priceIn: 2.8, priceOut: 14, pricePer1k: null };
    const c = splitCost(r);
    expect(c.costIn).toBeCloseTo(0.0336, 10);
    expect(c.costOut).toBeCloseTo(0.0224, 10);
    expect(c.costIn + c.costOut).toBeCloseTo(r.costEur, 12);
  });

  it('appel ancien (tarif non enregistré) : estimation au tarif du catalogue, bornée ; sinon au prorata', () => {
    const r = { tokensIn: 1000, tokensOut: 1000, requests: 0, costEur: 0.01, priceIn: null, priceOut: null, pricePer1k: null };
    expect(splitCost(r, 2)).toEqual({ costIn: 0.002, costOut: 0.008 });
    expect(splitCost(r, 50).costIn).toBe(0.01);
    expect(splitCost(r).costIn).toBeCloseTo(0.005, 12);
  });

  it('facturation à la requête (Reranking) : tout en entrée', () => {
    expect(splitCost({ tokensIn: 0, tokensOut: 0, requests: 1, costEur: 0.002, priceIn: null, priceOut: null, pricePer1k: 2 })).toEqual({ costIn: 0.002, costOut: 0 });
  });

  it('curseur : aller-retour, valeur invalide refusée', () => {
    const at = new Date('2026-09-26T10:24:05.123Z');
    expect(decodeCursor(encodeCursor(at, 'req_abc'))).toEqual({ at, id: 'req_abc' });
    expect(decodeCursor('pas-un-curseur')).toBeNull();
  });

  it('CSV : BOM, séparateur « ; », virgule décimale, guillemets si besoin', () => {
    expect(csvNum(0.0621234, 6)).toBe('0,062123');
    expect(csvNum(2.8)).toBe('2,8');
    expect(csvNum(null)).toBe('');
    expect(csvFile(['A', 'B'], [['x;y', 'dit "oui"']])).toBe('﻿A;B\r\n"x;y";"dit ""oui"""\r\n');
  });
});
