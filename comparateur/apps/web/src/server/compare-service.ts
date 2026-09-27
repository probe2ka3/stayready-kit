import 'server-only';
import {
  compareBasket,
  DEFAULT_COST_PER_KM,
  DEFAULT_PREFS,
  DEFAULT_TRAVEL,
  type CompareRequest,
  type CompareResultDto,
  type TravelSettings,
} from '@cabas/core';
import { getAppData } from './data';
import { getMatrixProvider } from './routing';
import type { CompareInput } from './validation';

/** Traduit une requête validée en appel du moteur de comparaison. */
export async function runComparison(input: CompareInput, now = new Date()): Promise<CompareResultDto> {
  const data = getAppData();
  const origin = { lat: input.origin.lat, lon: input.origin.lon };
  const [nearby, productList, chainList] = await Promise.all([
    data.storesNear(origin, input.radiusKm, input.chains?.length ? input.chains : null),
    data.products(),
    data.chains(),
  ]);
  const excluded = new Set(input.excludedStores ?? []);
  const stores = nearby.filter((s) => !excluded.has(s.id));
  const chainIds = [...new Set(stores.map((s) => s.chainId))];
  const index = await data.offers(
    input.lines.map((l) => l.productId),
    chainIds,
    now,
  );
  const mode = input.travel?.mode ?? DEFAULT_TRAVEL.mode;
  const travel: TravelSettings = {
    ...DEFAULT_TRAVEL,
    costPerKmChf: DEFAULT_COST_PER_KM[mode],
    ...input.travel,
    mode,
  };
  const req: CompareRequest = {
    origin: { ...origin, label: input.origin.label ?? null },
    lines: input.lines,
    prefs: { ...DEFAULT_PREFS, ...input.prefs },
    when: input.when.mode === 'now' ? { mode: 'now' } : { mode: 'plan', date: input.when.date, time: input.when.time ?? null },
    maxStores: input.maxStores,
    travel,
    minSavingPerExtraStoreCents: Math.round((input.minSavingPerExtraStoreChf ?? 2) * 100),
    referenceChainId: input.referenceChainId ?? null,
  };
  return compareBasket(req, {
    now,
    products: new Map(productList.map((p) => [p.id, p])),
    chains: new Map(chainList.map((c) => [c.id, c])),
    index,
    stores,
    matrixProvider: getMatrixProvider(),
  });
}
