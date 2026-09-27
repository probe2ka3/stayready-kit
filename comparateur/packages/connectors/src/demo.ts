/**
 * Connecteur de DÉMONSTRATION.
 *
 * Génère des articles, prix et promotions **fictifs**, clairement identifiés
 * (`isDemo = true`, source `demo`), pour faire fonctionner la plateforme tant
 * qu'aucune source autorisée n'est disponible. Les prix ne reflètent pas les prix
 * réels des enseignes.
 *
 * Ce qui est réaliste (et sert à tester la logique) :
 * - les calendriers promotionnels (jour de début, durée, délai de publication)
 *   issus de l'audit du 27.09.2026 ;
 * - la distinction publication / validité : une promotion n'est produite que si
 *   sa date de publication est passée ;
 * - la couverture différente des assortiments selon l'enseigne ;
 * - des conditionnements différents, des prix régionaux Migros, quelques prix
 *   anciens ou périmés, des promotions réservées à une application.
 */

import {
  addDays,
  formatQuantity,
  previousOrSameWeekday,
  roundTo5Rappen,
  zurichLocalToInstant,
  zurichToday,
  type Chain,
  type PriceObservation,
  type ProductMatch,
  type Promotion,
  type PromotionType,
  type Quantity,
  type RetailerProduct,
} from '@cabas/core';
import { CHAINS, PRODUCTS, type ProductSeed } from '@cabas/reference';
import { hash32, pick, seededRandom } from './rng';
import { emptyReport, type ConnectorBatch, type ConnectorContext, type PriceConnector } from './types';

export const DEMO_CONNECTOR_ID = 'demo';

type Coverage = { default: number } & Record<string, number>;

/** Probabilité qu'une enseigne propose un article de la catégorie (assortiment fictif). */
const COVERAGE: Record<string, Coverage> = {
  migros: { default: 0.97 },
  coop: { default: 0.97 },
  denner: { default: 0.85, fruits: 0.6, legumes: 0.6, 'viande-poisson': 0.6, pain: 0.7 },
  aldi: { default: 0.86 },
  lidl: { default: 0.86 },
  ottos: {
    default: 0,
    'pates-riz-cereales': 0.6,
    'farine-sucre-sel': 0.5,
    'huiles-condiments': 0.6,
    conserves: 0.7,
    'petit-dejeuner': 0.7,
    boissons: 0.6,
    entretien: 0.8,
    hygiene: 0.85,
    papier: 0.9,
    maison: 0.8,
  },
  action: { default: 0, 'petit-dejeuner': 0.35, boissons: 0.3, entretien: 0.8, hygiene: 0.85, papier: 0.85, maison: 0.9 },
  aligro: { default: 0.8, hygiene: 0.6, maison: 0.3 },
};

const ORGANIC_COVERAGE: Record<string, number> = {
  migros: 0.95,
  coop: 0.95,
  aldi: 0.6,
  lidl: 0.6,
  denner: 0.4,
  aligro: 0.3,
  ottos: 0.2,
  action: 0,
};

/** Niveau de prix fictif relatif de chaque enseigne. */
const PRICE_LEVEL: Record<string, number> = {
  migros: 1,
  coop: 1.04,
  denner: 0.94,
  aldi: 0.86,
  lidl: 0.87,
  ottos: 0.9,
  action: 0.78,
  aligro: 0.93,
};

/** Enseignes dont les actions sont « jusqu'à épuisement du stock ». */
const WHILE_STOCKS_LAST = new Set(['aldi', 'lidl', 'ottos', 'action']);

/** Majoration régionale fictive Migros sur le frais (illustre les zones tarifaires). */
const MIGROS_ZONE_SURCHARGE: Record<string, number> = { 'migros-zurich': 1.06, 'migros-geneve': 1.04 };
const FRESH_CATEGORIES = new Set(['fruits', 'legumes', 'pain', 'viande-poisson']);

const PERCENTS = [15, 20, 20, 25, 25, 30, 33, 40, 50] as const;

function packFactor(r: () => number, chain: Chain, product: ProductSeed): number {
  if (product.brandRequired) return 1;
  if (chain.id === 'aligro' && r() < 0.35) return pick(r, [2, 3]);
  if (r() >= 0.12) return 1;
  if (product.quantity.unit === 'piece') return product.quantity.amount >= 4 ? pick(r, [0.5, 2]) : 2;
  return pick(r, [0.5, 1.5, 2]);
}

function demoName(product: ProductSeed, q: Quantity): string {
  return `${product.name} ${formatQuantity(q)} (article fictif)`;
}

export interface DemoGeneration {
  batch: ConnectorBatch;
  /** Date (Zurich) pour laquelle la génération a été faite. */
  generatedFor: string;
}

export function generateDemoData(now: Date): DemoGeneration {
  const today = zurichToday(now);
  const products: RetailerProduct[] = [];
  const matches: ProductMatch[] = [];
  const prices: PriceObservation[] = [];
  const promotions: Promotion[] = [];
  const nowMs = now.getTime();
  const source = { connectorId: DEMO_CONNECTOR_ID, kind: 'demo' as const, ref: 'Données fictives générées' };

  for (const chain of CHAINS) {
    const coverage = COVERAGE[chain.id] ?? { default: 0 };
    const carried: Array<{ rp: RetailerProduct; regularCents: number }> = [];

    for (const product of PRODUCTS) {
      const r = seededRandom(`${chain.id}:${product.id}`);
      const p = product.attributes.organic
        ? Math.min(coverage[product.categoryId] ?? coverage.default, ORGANIC_COVERAGE[chain.id] ?? 0)
        : (coverage[product.categoryId] ?? coverage.default);
      if (r() >= p) continue;

      const factor = packFactor(r, chain, product);
      const quantity: Quantity = {
        unit: product.quantity.unit,
        amount: Math.max(1, Math.round(product.quantity.amount * factor)),
      };
      const id = `demo:${chain.id}:${product.id}`;
      const swiss = Boolean(product.attributes.swissOrigin || (product.demo.swissTypical && r() < 0.8));
      const rp: RetailerProduct = {
        id,
        chainId: chain.id,
        connectorId: DEMO_CONNECTOR_ID,
        sku: product.id,
        gtin: null,
        name: demoName(product, quantity),
        brand: product.brandRequired ?? null,
        quantity,
        attributes: {
          organic: Boolean(product.attributes.organic),
          swissOrigin: swiss,
          labels: product.attributes.labels ?? [],
        },
        url: null,
        isDemo: true,
      };
      products.push(rp);
      matches.push({
        canonicalId: product.id,
        retailerProductId: id,
        kind: factor === 1 ? 'equivalent' : 'similar',
        status: 'validated',
        confidence: 1,
      });

      const noise = 1 + (r() - 0.5) * 0.24;
      const level = PRICE_LEVEL[chain.id] ?? 1;
      const regularCents = Math.max(5, roundTo5Rappen(product.demo.chf * Math.pow(factor, 0.9) * level * noise * 100));

      // Âge de la dernière vérification : majoritairement récente, parfois ancienne ou périmée.
      const ageRoll = r();
      const ageDays = ageRoll < 0.015 ? 35 + r() * 10 : ageRoll < 0.055 ? 9 + r() * 12 : r() * 4;
      const observedAt = new Date(nowMs - ageDays * 86400000).toISOString();
      prices.push({
        id: `${id}:national`,
        retailerProductId: id,
        zoneId: null,
        storeId: null,
        priceCents: regularCents,
        observedAt,
        source,
        isDemo: true,
      });
      if (chain.id === 'migros' && FRESH_CATEGORIES.has(product.categoryId)) {
        for (const [zoneId, surcharge] of Object.entries(MIGROS_ZONE_SURCHARGE)) {
          prices.push({
            id: `${id}:${zoneId}`,
            retailerProductId: id,
            zoneId,
            storeId: null,
            priceCents: roundTo5Rappen(regularCents * surcharge),
            observedAt,
            source,
            isDemo: true,
          });
        }
      }
      carried.push({ rp, regularCents });
    }

    // Promotions selon le calendrier réel de l'enseigne (semaine passée → 3 semaines).
    for (const wave of chain.promoCalendar.waves) {
      const firstStart = previousOrSameWeekday(today, wave.startWeekday);
      const isWeekend = /week-end/i.test(wave.label);
      for (let w = -1; w <= 3; w++) {
        const validFrom = addDays(firstStart, 7 * w);
        const duration = wave.durationDays ?? 7;
        const validTo = addDays(validFrom, duration - 1);
        const publishedAt = zurichLocalToInstant(addDays(validFrom, -wave.publishLeadDays), '06:00');
        if (publishedAt.getTime() > nowMs) continue; // pas encore publiée : inconnue à cette date
        if (validTo < addDays(today, -7)) continue;
        for (const { rp, regularCents } of carried) {
          const r = seededRandom(hash32(`${rp.id}:${validFrom}:${wave.label}`));
          if (r() >= (isWeekend ? 0.03 : 0.1)) continue;
          const roll = r();
          let type: PromotionType = 'percent';
          let percent: number | null = null;
          let promoPriceCents: number | null = null;
          let buyQty: number | null = null;
          let payQty: number | null = null;
          let minQty: number | null = null;
          if (roll < 0.65) {
            type = 'percent';
            percent = pick(r, PERCENTS);
          } else if (roll < 0.85) {
            type = 'price';
            promoPriceCents = Math.max(5, roundTo5Rappen(regularCents * (0.6 + r() * 0.25)));
          } else if (roll < 0.95) {
            type = 'multibuy';
            buyQty = 3;
            payQty = 2;
          } else {
            type = 'min_qty_percent';
            minQty = 2;
            percent = 25;
          }
          const loyalty = chain.id === 'lidl' && r() < 0.2 ? 'lidl-plus' : null;
          promotions.push({
            id: `${rp.id}:${validFrom}:${hash32(wave.label).toString(36)}`,
            retailerProductId: rp.id,
            chainId: chain.id,
            zoneId: null,
            storeId: null,
            type,
            promoPriceCents,
            percent,
            buyQty,
            payQty,
            minQty,
            referencePriceCents: regularCents,
            loyaltyProgram: loyalty,
            whileStocksLast: WHILE_STOCKS_LAST.has(chain.id),
            endIsPresumed: wave.durationDays === null,
            label: wave.label,
            publishedAt: publishedAt.toISOString(),
            validFrom,
            validTo,
            source,
            verifiedAt: publishedAt.toISOString(),
            isDemo: true,
          });
        }
      }
    }
  }

  const report = emptyReport();
  report.accepted = {
    products: products.length,
    prices: prices.length,
    promotions: promotions.length,
    matches: matches.length,
  };
  return {
    generatedFor: today,
    batch: { connectorId: DEMO_CONNECTOR_ID, retailerProducts: products, matches, prices, promotions, report },
  };
}

export class DemoPriceConnector implements PriceConnector {
  readonly id = DEMO_CONNECTOR_ID;
  readonly label = 'Données de démonstration (fictives)';
  readonly chainIds = CHAINS.map((c) => c.id);
  readonly sourceKind = 'demo' as const;

  async status() {
    return { state: 'ready' as const, message: 'Génère des données fictives clairement identifiées.' };
  }

  async run(ctx: ConnectorContext): Promise<ConnectorBatch> {
    const { batch } = generateDemoData(ctx.now);
    ctx.log.info('Données de démonstration générées', { ...batch.report.accepted });
    return batch;
  }
}
