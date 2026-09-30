import { describe, expect, it } from 'vitest';
import { activePlacements, ALL_FEATURES, assertNoPersonalData, B2B_PLANS, can, isValidMetric, linesBucket, PLANS, summarizeUsage, visitBucket, type SponsoredPlacement } from '../src';

describe('offre grand public gratuite', () => {
  it('inclut toutes les fonctions, alertes de base comprises, sans limite de comparaisons', () => {
    for (const f of ALL_FEATURES) expect(can('free', f)).toBe(true);
    expect(can('free', 'price_alerts')).toBe(true);
    expect(PLANS.free.limits.comparesPerDay).toBeNull();
    expect(Object.keys(PLANS)).toEqual(['free']);
  });
});

describe('offres professionnelles', () => {
  it('ne servent jamais de données personnelles', () => {
    expect(() => assertNoPersonalData({ retailer: 'lidl', price: 1.2, source_url: 'https://x' })).not.toThrow();
    expect(() => assertNoPersonalData([{ retailer: 'lidl', basket: [1] }])).toThrow(/basket/);
    expect(() => assertNoPersonalData({ a: { latitude: 46.9 } })).toThrow(/latitude/);
    expect(Object.values(B2B_PLANS).every((p) => p.monthlyChfHypothesis > 0)).toBe(true);
  });
});

describe('emplacements commerciaux', () => {
  const base: SponsoredPlacement = {
    id: 'a',
    slot: 'results_footer',
    disclosure: 'partenaire',
    title: 't',
    body: 'b',
    url: 'https://exemple.ch',
    startsAt: '2026-09-01T00:00:00Z',
    endsAt: '2026-10-01T00:00:00Z',
    campaign: 'c',
  };
  it('ne sert que les emplacements actifs, en https, du bon créneau', () => {
    const now = new Date('2026-09-28T10:00:00Z');
    const list = [
      base,
      { ...base, id: 'b', url: 'http://exemple.ch' },
      { ...base, id: 'c', slot: 'home' as const },
      { ...base, id: 'd', endsAt: '2026-09-02T00:00:00Z' },
    ];
    expect(activePlacements(list, 'results_footer', now).map((p) => p.id)).toEqual(['a']);
  });
});

describe('indicateurs anonymes', () => {
  it('n’accepte que la liste fermée d’indicateurs', () => {
    expect(isValidMetric('compare', 'plan')).toBe(true);
    expect(isValidMetric('compare', 'zurich')).toBe(false);
    expect(isValidMetric('email', 'x')).toBe(false);
  });
  it('calcule les tranches localement', () => {
    expect(visitBucket(null, '2026-09-28')).toBe('new');
    expect(visitBucket('2026-09-27', '2026-09-28')).toBe('within_1d');
    expect(visitBucket('2026-09-22', '2026-09-28')).toBe('within_7d');
    expect(visitBucket('2026-06-01', '2026-09-28')).toBe('older');
    expect(linesBucket(12)).toBe('11-20');
  });
  it('résume les compteurs sans identifiant', () => {
    const k = summarizeUsage([
      { day: '2026-09-27', metric: 'visit', dimension: 'new', count: 6 },
      { day: '2026-09-28', metric: 'visit', dimension: 'within_1d', count: 4 },
      { day: '2026-09-28', metric: 'compare', dimension: 'plan', count: 5 },
      { day: '2026-09-28', metric: 'compare', dimension: 'now', count: 5 },
    ]);
    expect(k).toMatchObject({ visits: 10, newVisitors: 6, returningVisits: 4, compares: 10, planShare: 0.5, returnRate7d: 0.4 });
    expect(k.byDay).toEqual([
      { day: '2026-09-27', visits: 6, compares: 0 },
      { day: '2026-09-28', visits: 4, compares: 10 },
    ]);
  });
});
