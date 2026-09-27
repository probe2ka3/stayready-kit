import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRAVEL,
  estimatedMatrix,
  optimize,
  parseOpeningHours,
  zurichLocalToInstant,
  type LatLon,
  type OptimizerInput,
  type TravelSettings,
} from '../src';

const ALWAYS = parseOpeningHours('24/7');

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeInput(
  origin: LatLon,
  stores: Array<{ p: number; at: LatLon; hours?: string }>,
  costs: Array<Array<number | null>>,
  profileCount: number,
  travel: Partial<TravelSettings> = {},
  extra: Partial<OptimizerInput> = {},
): OptimizerInput {
  const t = { ...DEFAULT_TRAVEL, ...travel };
  return {
    costs,
    profileCount,
    stores: stores.map((s) => ({ profileIndex: s.p, hours: s.hours ? parseOpeningHours(s.hours) : ALWAYS })),
    matrix: estimatedMatrix([origin, ...stores.map((s) => s.at)], t.mode),
    travel: t,
    schedule: { kind: 'none' },
    maxStores: null,
    minSavingPerExtraStoreCents: 0,
    ...extra,
  };
}

const HOME: LatLon = { lat: 46.8, lon: 7.15 };
const near = (dLatKm: number, dLonKm: number): LatLon => ({
  lat: HOME.lat + dLatKm / 111.32,
  lon: HOME.lon + dLonKm / (111.32 * Math.cos((HOME.lat * Math.PI) / 180)),
});

describe('optimiseur panier + trajet', () => {
  it('répartit les achats quand le détour est rentable, sinon reste dans un magasin', () => {
    // Profil 0 : bon marché sur la ligne 0 ; profil 1 : bon marché sur la ligne 1.
    const costs = [
      [100, 500],
      [500, 100],
    ];
    const stores = [
      { p: 0, at: near(1, 0) },
      { p: 1, at: near(-1, 0) },
    ];
    const res = optimize(makeInput(HOME, stores, costs, 2));
    expect(res.cheapest?.profiles.sort()).toEqual([0, 1]);
    expect(res.cheapest?.purchaseCents).toBe(200);
    expect(res.optimized?.profiles.length).toBe(2);

    // Coût kilométrique très élevé : un seul magasin devient préférable.
    const expensive = optimize(makeInput(HOME, stores, costs, 2, { costPerKmChf: 10 }));
    expect(expensive.optimized?.profiles.length).toBe(1);
    // Le scénario « prix le plus bas » ignore le coût du trajet.
    expect(expensive.cheapest?.profiles.length).toBe(2);
  });

  it('applique le seuil d’économie minimale par magasin supplémentaire', () => {
    const costs = [
      [100, 150],
      [150, 100],
    ];
    const stores = [
      { p: 0, at: near(0.5, 0) },
      { p: 1, at: near(0.5, 0.2) },
    ];
    // économie de 50 ct pour un 2e magasin : acceptée sans seuil…
    const noThreshold = optimize(makeInput(HOME, stores, costs, 2, { costPerKmChf: 0 }));
    expect(noThreshold.optimized?.profiles.length).toBe(2);
    // …refusée avec un seuil de CHF 2.–
    const withThreshold = optimize(makeInput(HOME, stores, costs, 2, { costPerKmChf: 0 }, { minSavingPerExtraStoreCents: 200 }));
    expect(withThreshold.optimized?.profiles.length).toBe(1);
  });

  it('respecte le nombre maximal de magasins', () => {
    const costs = [
      [100, 900, 900],
      [900, 100, 900],
      [900, 900, 100],
    ];
    const stores = [
      { p: 0, at: near(1, 0) },
      { p: 1, at: near(0, 1) },
      { p: 2, at: near(-1, 0) },
    ];
    const res = optimize(makeInput(HOME, stores, costs, 3, { costPerKmChf: 0 }, { maxStores: 2 }));
    expect(res.optimized?.profiles.length).toBe(2);
    expect(res.cheapest?.profiles.length).toBe(2);
    expect(res.optimizedByStoreCount).toHaveLength(2);
  });

  it('privilégie la couverture du panier (articles introuvables ailleurs)', () => {
    const costs = [
      [100, 90],
      [null, 300], // uniquement dans le profil 1
    ];
    const stores = [
      { p: 0, at: near(0.2, 0) },
      { p: 1, at: near(8, 0) },
    ];
    const res = optimize(makeInput(HOME, stores, costs, 2, { costPerKmChf: 5 }, { maxStores: 1 }));
    expect(res.optimized?.profiles).toEqual([1]);
    expect(res.optimized?.coveredLines).toBe(2);
    expect(res.maxCoverage).toBe(2);
  });

  it('exclut un magasin fermé à l’heure d’arrivée et en choisit un autre', () => {
    const costs = [[100]];
    const stores = [
      { p: 0, at: near(0.5, 0), hours: 'Mo-Sa 14:00-18:00' }, // le plus proche, fermé le matin
      { p: 0, at: near(3, 0), hours: 'Mo-Sa 08:00-20:00' },
    ];
    const departure = zurichLocalToInstant('2026-09-28', '09:00'); // lundi
    const res = optimize(makeInput(HOME, stores, costs, 1, {}, { schedule: { kind: 'departure', departure } }));
    expect(res.optimized?.route.stops[0]?.storeIndex).toBe(1);
    expect(res.optimized?.route.stops[0]?.openStatus).toBe('open');

    const sunday = zurichLocalToInstant('2026-09-27', '10:00');
    const closed = optimize(makeInput(HOME, stores, costs, 1, {}, { schedule: { kind: 'departure', departure: sunday } }));
    expect(closed.optimized).toBeNull();
  });

  it('ne visite jamais deux succursales du même profil et revient au départ', () => {
    const costs = [[100, 200]];
    const stores = [
      { p: 0, at: near(1, 0) },
      { p: 0, at: near(2, 0) },
      { p: 1, at: near(0, 1) },
    ];
    const res = optimize(makeInput(HOME, stores, costs, 2));
    expect(res.optimized?.route.stops).toHaveLength(1);
    expect(res.optimized?.route.stops[0]?.storeIndex).toBe(0);
    expect(res.optimized?.route.returnLeg).not.toBeNull();
  });

  it('trouve l’optimum exact (comparaison avec une recherche exhaustive)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const P = 2 + Math.floor(r() * 4); // 2 à 5 profils
      const L = 1 + Math.floor(r() * 6); // 1 à 6 lignes
      const stores: Array<{ p: number; at: LatLon }> = [];
      for (let p = 0; p < P; p++) {
        const n = 1 + Math.floor(r() * 2);
        for (let i = 0; i < n; i++) stores.push({ p, at: near((r() - 0.5) * 16, (r() - 0.5) * 16) });
      }
      const costs = Array.from({ length: L }, () =>
        Array.from({ length: P }, () => (r() < 0.2 ? null : 100 + Math.floor(r() * 900))),
      );
      const maxStores = r() < 0.5 ? null : 1 + Math.floor(r() * 3);
      const lambda = Math.floor(r() * 300);
      const input = makeInput(HOME, stores, costs, P, { costPerKmChf: r() * 0.8 }, { maxStores, minSavingPerExtraStoreCents: lambda });
      const res = optimize(input);
      const brute = bruteForce(input);
      expect(res.optimized?.coveredLines ?? -1, `seed ${seed}`).toBe(brute.best?.covered ?? -1);
      if (brute.best && res.optimized) {
        const score = res.optimized.globalCents + (res.optimized.profiles.length - 1) * lambda;
        expect(Math.abs(score - brute.best.score), `seed ${seed}`).toBeLessThanOrEqual(1);
      }
      if (brute.cheapest && res.cheapest) {
        expect(res.cheapest.coveredLines, `seed ${seed}`).toBe(brute.cheapest.covered);
        expect(res.cheapest.purchaseCents, `seed ${seed}`).toBe(brute.cheapest.purchase);
      }
    }
  });
});

/** Recherche exhaustive : tous les ensembles, toutes les succursales, tous les ordres. */
function bruteForce(input: OptimizerInput) {
  const P = input.profileCount;
  const K = Math.min(input.maxStores ?? 5, 5, P);
  const byProfile: number[][] = Array.from({ length: P }, () => []);
  input.stores.forEach((s, i) => byProfile[s.profileIndex]?.push(i));
  const t = input.travel;
  const leg = (a: number, b: number) =>
    (input.matrix.distKm[a] as number[])[b]! * t.costPerKmChf * 100 +
    ((input.matrix.durMin[a] as number[])[b]! / 60) * t.valueOfTimeChfPerHour * 100;
  let best: { covered: number; score: number } | null = null;
  let cheapest: { covered: number; purchase: number } | null = null;

  const permutations = <T,>(arr: T[]): T[][] =>
    arr.length <= 1 ? [arr] : arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));

  for (let mask = 1; mask < 1 << P; mask++) {
    const subset = Array.from({ length: P }, (_, p) => p).filter((p) => mask & (1 << p));
    if (subset.length > K) continue;
    let covered = 0;
    let purchase = 0;
    for (const row of input.costs) {
      const vals = subset.map((p) => row[p]).filter((v): v is number => v != null);
      if (vals.length) {
        covered++;
        purchase += Math.min(...vals);
      }
    }
    // meilleur trajet sur toutes les combinaisons de succursales et tous les ordres
    let bestTravel = Number.POSITIVE_INFINITY;
    const choose = (i: number, picked: number[]) => {
      if (i === subset.length) {
        for (const order of permutations(picked)) {
          let c = 0;
          let from = 0;
          for (const s of order) {
            c += leg(from, s + 1);
            from = s + 1;
          }
          if (t.returnToOrigin) c += leg(from, 0);
          bestTravel = Math.min(bestTravel, c);
        }
        return;
      }
      for (const s of byProfile[subset[i] as number] ?? []) choose(i + 1, [...picked, s]);
    };
    choose(0, []);
    if (!Number.isFinite(bestTravel)) continue;
    const score = purchase + Math.round(bestTravel) + (subset.length - 1) * input.minSavingPerExtraStoreCents;
    if (!best || covered > best.covered || (covered === best.covered && score < best.score)) best = { covered, score };
    if (!cheapest || covered > cheapest.covered || (covered === cheapest.covered && purchase < cheapest.purchase)) {
      cheapest = { covered, purchase };
    }
  }
  return { best, cheapest };
}
