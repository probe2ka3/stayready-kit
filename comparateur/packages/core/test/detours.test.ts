import { describe, expect, it } from 'vitest';
import {
  analyzeDetours,
  computeWaitSignal,
  DEFAULT_TRAVEL,
  estimatedMatrix,
  optimize,
  parseOpeningHours,
  type LatLon,
  type OptimizerInput,
  type OutlookDayDto,
  type TravelSettings,
} from '../src';

const ALWAYS = parseOpeningHours('24/7');
const HOME: LatLon = { lat: 46.8, lon: 7.15 };
const at = (dLatKm: number, dLonKm: number): LatLon => ({
  lat: HOME.lat + dLatKm / 111.32,
  lon: HOME.lon + dLonKm / (111.32 * Math.cos((HOME.lat * Math.PI) / 180)),
});

function input(
  stores: Array<{ p: number; at: LatLon }>,
  costs: Array<Array<number | null>>,
  profileCount: number,
  travel: Partial<TravelSettings> = {},
  extra: Partial<OptimizerInput> = {},
): OptimizerInput {
  const t = { ...DEFAULT_TRAVEL, ...travel };
  return {
    costs,
    profileCount,
    stores: stores.map((s) => ({ profileIndex: s.p, hours: ALWAYS })),
    matrix: estimatedMatrix([HOME, ...stores.map((s) => s.at)], t.mode),
    travel: t,
    schedule: { kind: 'none' },
    maxStores: 1,
    minSavingPerExtraStoreCents: 200,
    ...extra,
  };
}

describe('analyse des détours', () => {
  // Profil 0 : magasin proche, le moins cher au total ; profil 1 (à 2 km) : moins cher sur 3 articles.
  const costs = [
    [500, 300],
    [800, 500],
    [400, 250],
    [200, 900],
  ];
  const stores = [
    { p: 0, at: at(0.5, 0) },
    { p: 1, at: at(2, 0) },
  ];

  it('propose un détour rentable avec le détail des articles, des km et de l’économie nette', () => {
    const inp = input(stores, costs, 2);
    const base = optimize(inp).optimized!;
    expect(base.profiles).toEqual([0]);
    const { options } = analyzeDetours(inp, base, { minNetSavingCents: 200 });
    const o = options[0]!;
    expect(o.profileIndex).toBe(1);
    expect(o.items.map((it) => it.line)).toEqual([1, 0, 2]);
    expect(o.grossSavingsCents).toBe(650);
    // Le plan recalculé peut remplacer le magasin de départ (réoptimisation conjointe).
    expect(o.grossSavingsCents).toBe(base.purchaseCents - o.plan.purchaseCents);
    // Même couverture : l'économie nette est la baisse du coût global.
    expect(o.netSavingsCents).toBe(base.globalCents - o.plan.globalCents);
    expect(o.netSavingsCents).toBe(o.grossSavingsCents - o.extraTravelCostCents);
    expect(o.addedItemsCents).toBe(0);
    expect(o.items.length).toBeGreaterThan(0);
    expect(o.items.every((it) => it.savingCents >= 0)).toBe(true);
    expect(o.extraDistanceKm).toBeGreaterThanOrEqual(0);
    expect(o.worthwhile).toBe(o.netSavingsCents >= 200);
  });

  it('écarte un détour non rentable quand le coût au km augmente', () => {
    const cheap = input(stores, costs, 2, { costPerKmChf: 0.1 });
    const dear = input(stores, costs, 2, { costPerKmChf: 3 });
    const net = (inp: OptimizerInput) => {
      const base = optimize(inp).optimized!;
      return analyzeDetours(inp, base, { minNetSavingCents: 200 }).options.find((o) => o.reason !== 'adds_items');
    };
    const a = net(cheap);
    const b = net(dear);
    expect(a?.worthwhile).toBe(true);
    // Avec 3 CHF/km, l'économie sur les achats ne couvre plus le trajet.
    expect(b === undefined || !b.worthwhile).toBe(true);
    if (b) expect(b.netSavingsCents).toBeLessThan(a!.netSavingsCents);
  });

  it('respecte le seuil d’économie nette choisi par l’utilisateur', () => {
    const inp = input(stores, costs, 2, { costPerKmChf: 0.1 });
    const base = optimize(inp).optimized!;
    const lax = analyzeDetours(inp, base, { minNetSavingCents: 50 }).options[0]!;
    const strict = analyzeDetours(inp, base, { minNetSavingCents: 100_000 }).options[0]!;
    expect(lax.worthwhile).toBe(true);
    expect(strict.worthwhile).toBe(false);
    expect(strict.reason).toBe('below_threshold');
  });

  it('ne rend un détour intéressant que grâce à la combinaison de plusieurs articles', () => {
    // Chaque article seul fait économiser 0,80 CHF ; le trajet supplémentaire coûte davantage :
    // il faut les trois. Le dernier article n'existe qu'au magasin proche (référence).
    const combo = [
      [300, 220],
      [300, 220],
      [300, 220],
      [150, null],
    ];
    const far = [
      { p: 0, at: at(0.2, 0) },
      { p: 1, at: at(2, 0) },
    ];
    const three = input(far, combo, 2, { costPerKmChf: 0.35 });
    const one = input(far, [combo[0]!, combo[3]!], 2, { costPerKmChf: 0.35 });
    const opt3 = analyzeDetours(three, optimize(three).optimized!, { minNetSavingCents: 0 }).options[0];
    const opt1 = analyzeDetours(one, optimize(one).optimized!, { minNetSavingCents: 0 }).options[0];
    expect(opt3?.grossSavingsCents).toBe(240);
    expect(opt1?.grossSavingsCents).toBe(80);
    expect(opt3!.netSavingsCents).toBeGreaterThan(0);
    expect(opt1!.netSavingsCents).toBeLessThan(0);
    expect(opt1!.reason).toBe('no_net_saving');
  });

  it('signale un magasin qui apporte un article introuvable ailleurs', () => {
    const inp = input(stores, [
      [100, 100],
      [null, 300],
    ], 2);
    // Référence volontairement incomplète : magasin 0 seul.
    const base = optimize({ ...inp, allowedProfiles: [0] }).optimized!;
    expect(base.coveredLines).toBe(1);
    const o = analyzeDetours(inp, base, { minNetSavingCents: 200 }).options[0]!;
    expect(o.reason).toBe('adds_items');
    expect(o.extraCoveredLines).toBe(1);
    // Le prix de l'article ajouté n'est pas compté comme une « perte ».
    expect(o.addedItemsCents).toBe(300);
    expect(o.grossSavingsCents).toBe(0);
  });

  it('impose un magasin accepté par l’utilisateur (profil requis)', () => {
    const inp = input(stores, costs, 2, { costPerKmChf: 5 }, { maxStores: 2, minSavingPerExtraStoreCents: 0 });
    const free = optimize(inp).optimized!;
    const forced = optimize({ ...inp, requiredProfiles: [1] }).optimized!;
    expect(forced.profiles).toContain(1);
    expect(forced.globalCents).toBeGreaterThanOrEqual(free.globalCents);
  });
});

describe('signal « attendre serait moins cher »', () => {
  const day = (date: string, purchaseCents: number, promoLines = 0, coveredLines = 5): OutlookDayDto => ({
    date,
    purchaseCents,
    coveredLines,
    promoLines,
  });

  it('indique le jour où des promotions annoncées font baisser le panier', () => {
    const s = computeWaitSignal(
      [day('2026-09-28', 5000), day('2026-09-29', 5000), day('2026-10-01', 4200, 2), day('2026-10-02', 4100, 3)],
      '2026-09-28',
    );
    expect(s).toMatchObject({ date: '2026-10-02', daysLater: 4, savingsCents: 900, promoLines: 3 });
  });

  it('ignore les écarts négligeables, les pertes d’articles et les jours sans promotion', () => {
    expect(computeWaitSignal([day('2026-09-28', 5000), day('2026-09-29', 4950, 1)], '2026-09-28')).toBeNull();
    expect(computeWaitSignal([day('2026-09-28', 5000), day('2026-09-30', 3000, 1, 4)], '2026-09-28')).toBeNull();
    expect(computeWaitSignal([day('2026-09-28', 5000), day('2026-09-30', 3000, 0)], '2026-09-28')).toBeNull();
    expect(computeWaitSignal([day('2026-09-28', 5000), day('2026-10-10', 3000, 2)], '2026-09-28')).toBeNull();
  });
});
