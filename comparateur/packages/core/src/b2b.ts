import type { CoverageKpis, PriceRecord } from './data-engine';
import { normalizedUnitCents } from './units';
import type { ChainId, Quantity } from './types';

/**
 * Offres professionnelles (docs/BUSINESS_MODEL_V2.md) et contrat de l'API de données agrégées.
 *
 * Règles non négociables :
 * - aucune donnée personnelle : ni identité, ni adresse, ni position précise, ni contenu individuel
 *   de panier, ni habitude individuelle ; les compteurs d'usage sont agrégés et anonymes ;
 * - seules des **observations de prix** (faits publics datés et sourcés) et des agrégats sont servis ;
 * - les prix obtenus sous licence d'un tiers ou sous ODbL suivent leur propre licence (attribution,
 *   partage à l'identique) et ne sont servis que si la licence le permet ;
 * - les offres professionnelles ne modifient jamais le calcul, le classement, la comparaison,
 *   l'itinéraire ni les recommandations du service grand public.
 */

export type B2BPlanId = 'data_api_starter' | 'data_api_pro' | 'intelligence' | 'widget' | 'white_label';

export interface B2BPlan {
  id: B2BPlanId;
  name: string;
  audience: string;
  includes: string[];
  /** Hypothèse de prix mensuel HT (CHF) — non facturé tant que le paiement est inactif. */
  monthlyChfHypothesis: number;
}

export const B2B_PLANS: Record<B2BPlanId, B2BPlan> = {
  data_api_starter: {
    id: 'data_api_starter',
    name: 'API de données — Starter',
    audience: 'médias, associations de consommateurs, recherche',
    includes: ['indices de prix du panier par enseigne (hebdomadaires)', 'actions publiées agrégées', '10 000 requêtes/mois'],
    monthlyChfHypothesis: 149,
  },
  data_api_pro: {
    id: 'data_api_pro',
    name: 'API de données — Pro',
    audience: 'fabricants, distributeurs, cabinets d’études',
    includes: ['observations de prix sourcées (officielles) par article et enseigne', 'historique 24 mois', 'actions futures', '100 000 requêtes/mois'],
    monthlyChfHypothesis: 490,
  },
  intelligence: {
    id: 'intelligence',
    name: 'Tableau de bord Intelligence',
    audience: 'fabricants (marques), catégories managers, enseignes régionales',
    includes: ['positionnement prix par catégorie', 'fréquence et profondeur des actions', 'alertes de variation', 'exports'],
    monthlyChfHypothesis: 990,
  },
  widget: {
    id: 'widget',
    name: 'Widget comparateur',
    audience: 'sites de recettes, médias, communes, associations',
    includes: ['comparateur de panier intégrable (mention TesPrix)', 'coût du panier d’une recette', 'statistiques d’usage agrégées'],
    monthlyChfHypothesis: 99,
  },
  white_label: {
    id: 'white_label',
    name: 'Marque blanche',
    audience: 'assurances, banques, programmes d’entreprise, caisses de pension',
    includes: ['comparateur à leurs couleurs', 'hébergement', 'support'],
    monthlyChfHypothesis: 1_500,
  },
};

/** Champs interdits dans toute sortie B2B (contrôle défensif). */
const FORBIDDEN_KEYS = /^(e_?mail|phone|telephone|address|adresse|lat|lon|lng|latitude|longitude|user|user_?id|account|account_?id|basket|panier|basket_lines|ip|ip_address|device|device_id|session|token|name_of_person)$/i;

export function assertNoPersonalData(value: unknown, path = '$'): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoPersonalData(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.test(k)) throw new Error(`Champ interdit dans une sortie B2B : ${path}.${k}`);
    assertNoPersonalData(v, `${path}.${k}`);
  }
}

/** Observation exposée par l'API (sous-ensemble explicite d'un PriceRecord, en snake_case). */
export interface ApiPriceObservation {
  product_id: string | null;
  retailer: ChainId;
  store_id: string | null;
  region: string | null;
  geographic_scope: 'national' | 'zone' | 'store';
  price: number;
  regular_price: number | null;
  promotional_price: number | null;
  unit_price: number | null;
  unit_price_basis: string | null;
  currency: 'CHF';
  quantity: number;
  unit: string;
  observed_at: string;
  valid_from: string | null;
  valid_until: string | null;
  source_type: string;
  source_url: string | null;
  source_provider: string;
  confidence: number;
  collection_method: string;
  promotion_conditions: string | null;
  loyalty_requirement: string | null;
  license: string | null;
}

/**
 * Projection d'un enregistrement vers l'API. Par défaut, seules les observations officielles
 * (first-party) sont servies : les données sous licence tierce ou communautaires suivent leur
 * licence propre et sont exclues sauf option explicite.
 */
export function toApiObservation(r: PriceRecord): ApiPriceObservation {
  return {
    product_id: r.productId,
    retailer: r.retailer,
    store_id: r.storeId,
    region: r.region,
    geographic_scope: r.geographicScope,
    price: r.price / 100,
    regular_price: r.regularPrice === null ? null : r.regularPrice / 100,
    promotional_price: r.promotionalPrice === null ? null : r.promotionalPrice / 100,
    unit_price: r.unitPrice ? r.unitPrice.cents / 100 : null,
    unit_price_basis: r.unitPrice?.basis ?? null,
    currency: 'CHF',
    quantity: r.quantity,
    unit: r.unit,
    observed_at: r.observedAt,
    valid_from: r.validFrom,
    valid_until: r.validUntil,
    source_type: r.sourceType,
    source_url: r.sourceUrl,
    source_provider: r.sourceProvider,
    confidence: r.confidence,
    collection_method: r.collectionMethod,
    promotion_conditions: r.promotionConditions,
    loyalty_requirement: r.loyaltyRequirement,
    license: r.license,
  };
}

export function apiObservations(records: PriceRecord[], opts: { includeNonFirstParty?: boolean } = {}): ApiPriceObservation[] {
  const out = records
    .filter((r) => !r.isDemo && r.productId && (opts.includeNonFirstParty || r.sourceType === 'first_party'))
    .map(toApiObservation);
  assertNoPersonalData(out);
  return out;
}

/**
 * Indice de prix d'un panier par enseigne : somme des meilleurs prix normalisés des références
 * couvertes par **toutes** les enseignes comparées (panier commun), base 100 = enseigne la moins chère.
 */
export function basketIndex(
  records: PriceRecord[],
  chainIds: ChainId[],
  refQuantity: (productId: string) => Quantity | null,
): { basketSize: number; byChain: Array<{ chainId: ChainId; totalCents: number; index: number }> } {
  const best = new Map<string, Map<ChainId, number>>();
  for (const r of records) {
    if (r.isDemo || !r.productId || r.sourceType !== 'first_party' || !chainIds.includes(r.retailer)) continue;
    const n = normalizedUnitCents(r.price, { amount: r.quantity, unit: r.unit });
    if (!n) continue;
    const m = best.get(r.productId) ?? best.set(r.productId, new Map()).get(r.productId)!;
    m.set(r.retailer, Math.min(m.get(r.retailer) ?? Infinity, n));
  }
  const common = [...best].filter(([pid, m]) => refQuantity(pid) && chainIds.every((c) => m.has(c)));
  const totals = chainIds.map((chainId) => {
    let total = 0;
    for (const [pid, m] of common) {
      const q = refQuantity(pid) as Quantity;
      // Prix normalisé (par kg, litre ou pièce) ramené à la contenance de la référence.
      total += Math.round(((m.get(chainId) as number) * q.amount) / (q.unit === 'g' || q.unit === 'ml' ? 1000 : 1));
    }
    return { chainId, totalCents: total };
  });
  const positive = totals.map((t) => t.totalCents).filter((t) => t > 0);
  const min = positive.length ? Math.min(...positive) : 0;
  return {
    basketSize: common.length,
    byChain: totals.map((t) => ({ ...t, index: min > 0 ? Math.round((t.totalCents / min) * 1000) / 10 : 0 })),
  };
}

/** Résumé public de couverture (servi tel quel par l'API : aucune donnée personnelle). */
export function coverageForApi(k: CoverageKpis) {
  return {
    at: k.at,
    catalog_size: k.catalogSize,
    comparable_in_at_least: k.comparable,
    chains: k.chains.map((c) => ({ retailer: c.chainId, references: c.references, first_party_references: c.referencesFirstParty })),
  };
}
