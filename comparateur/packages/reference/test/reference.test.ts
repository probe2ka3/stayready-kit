import { describe, expect, it } from 'vitest';
import { CATEGORIES, CHAINS, PRICE_ZONES, PRODUCTS, zoneForStore } from '../src';

describe('données de référence', () => {
  it('contient les 8 enseignes prioritaires', () => {
    expect(CHAINS.map((c) => c.id).sort()).toEqual(['action', 'aldi', 'aligro', 'coop', 'denner', 'lidl', 'migros', 'ottos']);
    expect(CHAINS.find((c) => c.id === 'aligro')?.consumerPricesOnly).toBe(true);
  });

  it('propose entre 150 et 300 références normalisées cohérentes', () => {
    expect(PRODUCTS.length).toBeGreaterThanOrEqual(150);
    expect(PRODUCTS.length).toBeLessThanOrEqual(300);
    const ids = new Set(PRODUCTS.map((p) => p.id));
    expect(ids.size).toBe(PRODUCTS.length);
    const categories = new Set(CATEGORIES.map((c) => c.id));
    for (const p of PRODUCTS) {
      expect(categories.has(p.categoryId), p.id).toBe(true);
      expect(p.quantity.amount, p.id).toBeGreaterThan(0);
      expect(p.demo.chf, p.id).toBeGreaterThan(0);
    }
    // chaque catégorie contient au moins un produit
    for (const c of CATEGORIES) expect(PRODUCTS.some((p) => p.categoryId === c.id), c.id).toBe(true);
  });

  it('associe les cantons aux coopératives Migros', () => {
    expect(zoneForStore('migros', 'FR')).toBe('migros-nf');
    expect(zoneForStore('migros', 'ZH')).toBe('migros-zurich');
    expect(zoneForStore('coop', 'ZH')).toBeNull();
    for (const chain of ['migros', 'lidl']) {
      const cantons = PRICE_ZONES.filter((z) => z.chainId === chain).flatMap((z) => z.cantons);
      expect(cantons.length, chain).toBe(26);
      expect(new Set(cantons).size, chain).toBe(26);
    }
  });

  it('attribue les régions Lidl selon la langue de la localité', () => {
    expect(zoneForStore('lidl', 'TI')).toBe('lidl-ticino');
    expect(zoneForStore('lidl', 'FR')).toBe('lidl-romandie');
    // Morat (FR) est germanophone : la langue prime sur le canton.
    expect(zoneForStore('lidl', 'FR', 'de')).toBe('lidl-deutschschweiz');
    expect(zoneForStore('lidl', 'BE', 'fr')).toBe('lidl-romandie');
    // La langue n'affecte pas les enseignes à zones cantonales.
    expect(zoneForStore('migros', 'FR', 'de')).toBe('migros-nf');
  });
});
