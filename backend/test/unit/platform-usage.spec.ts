import { activeMs, csvOf, featureOfPath, isAutomatedDevice, isoWeek, parisMidnight, periodOf, pseudonym, unusualFlags } from '../../src/domain/platform-usage';

const min = 60_000;

describe('Consommation et coûts · Accès : règles', () => {
  it('temps actif : chaque événement compte jusqu’au suivant, au plus le délai d’inactivité (5 min)', () => {
    const t0 = Date.parse('2026-09-10T09:00:00Z');
    // 9:00 → 9:02 (2 min) ; 9:02 → 9:10 (8 min, plafonné à 5) ; 9:10 → 9:30 (5) ; 9:30 → fin de session 9:31 (1).
    expect(activeMs([t0, t0 + 2 * min, t0 + 10 * min, t0 + 30 * min], 5 * min, t0 + 31 * min)).toBe(13 * min);
    // Sans fin connue : le dernier événement compte le délai entier.
    expect(activeMs([t0], 5 * min)).toBe(5 * min);
    // Deux onglets : une seule suite d'événements, pas de double compte.
    expect(activeMs([t0, t0 + 30_000, t0 + 30_000, t0 + 60_000], 5 * min, t0 + 61_000)).toBe(61_000);
  });

  it('périodes : mois, semaine ISO, jour de Paris (23 ou 25 heures au changement d’heure), période précédente', () => {
    const m = periodOf('mois', '2026-09-17');
    expect(m).toMatchObject({ start: '2026-09-01', from: '2026-09-01', to: '2026-09-30', label: 'Septembre 2026', prevStart: '2026-08-01', vsLabel: 'août 2026' });
    expect(m.buckets).toHaveLength(30);
    expect(m.buckets.filter((b) => b.working)).toHaveLength(22);
    const w = periodOf('semaine', '2026-09-17');
    expect(w).toMatchObject({ start: '2026-09-14', to: '2026-09-20', label: 'Semaine 38 · 14 – 20 sept.', prevStart: '2026-09-07', vsLabel: 'la semaine 37' });
    expect(isoWeek('2026-01-01')).toBe(1);
    const d = periodOf('jour', '2026-09-17');
    expect(d).toMatchObject({ label: 'Jeudi 17 septembre 2026', prevStart: '2026-09-16', vsLabel: 'mercredi 16' });
    expect(d.buckets).toHaveLength(24);
    expect(d.buckets[0].key).toBe('2026-09-16T22:00:00.000Z');
    expect(periodOf('jour', '2026-10-25').buckets).toHaveLength(25);
    expect(periodOf('jour', '2027-03-28').buckets).toHaveLength(23);
    expect(parisMidnight('2026-12-01').toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });

  it('hausses inhabituelles : valeur > 1,6 × moyenne des jours ouvrés de la période', () => {
    const v = [10, 10, 10, 10, 30, 1, 1];
    const work = [true, true, true, true, true, false, false];
    // Moyenne des jours ouvrés : 14 ; seuil 22,4.
    expect(unusualFlags(v, work, 1.6)).toEqual([false, false, false, false, true, false, false]);
    expect(unusualFlags(v, work, 2.2)).toEqual(v.map(() => false));
    expect(unusualFlags([0, 0, 5], [true, true, false], 1.6)).toEqual([false, false, false]);
  });

  it('fonctionnalité d’une requête, pseudonymes, CSV (BOM, « ; », virgule décimale)', () => {
    expect(featureOfPath('/api/admin/assistant/messages')).toBe('jev');
    expect(featureOfPath('/api/projects/RISE/documents/search')).toBe('documents');
    expect(featureOfPath('/api/projects/RISE/report-templates/T1/generations')).toBe('rapports');
    expect(featureOfPath('/api/projects/RISE/today/greeting')).toBe('insights');
    expect(featureOfPath('/api/admin/providers')).toBe('console');
    expect(featureOfPath('/api/projects/RISE/planning/phase/P1')).toBe('projets');
    expect(pseudonym(0)).toBe('Utilisateur 01');
    expect(csvOf([['Nom', 'Coût (€)'], ['Dupont; Jean', 12.5]])).toBe('﻿Nom;Coût (€)\r\n"Dupont; Jean";12,5\r\n');
  });

  it('sessions d’outils automatiques (recettes navigateur, scripts) reconnues à leur agent utilisateur', () => {
    expect(isAutomatedDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36')).toBe(true);
    expect(isAutomatedDevice('node')).toBe(true);
    expect(isAutomatedDevice('curl/8.19.0')).toBe(true);
    expect(isAutomatedDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36')).toBe(false);
    expect(isAutomatedDevice(null)).toBe(false);
  });
});
