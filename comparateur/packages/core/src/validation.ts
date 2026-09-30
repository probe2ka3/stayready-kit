import { usablePrices, type DataSet } from './data-engine';
import type { ChainId, FreshnessPolicy, Unit } from './types';
import { normalizedUnitCents } from './units';

/**
 * Jeu de validation (`data/validation/essentials.json`) : ~50 besoins essentiels × 5 enseignes,
 * avec les articles attendus et des bornes de plausibilité. Sert de test de non-régression de la
 * collecte : disparition d'un catalogue, changement de structure, prix manquants, quantité mal lue,
 * action lue comme prix normal, prix d'un lot attribué à une unité.
 */

export type ValidationChainStatus =
  | 'covered' // articles officiels attendus
  | 'community_only' // seuls des relevés communautaires existent
  | 'not_listed' // l'enseigne ne publie pas cet article (ou sans contenance)
  | 'no_source'; // aucune source first-party exploitable pour l'enseigne

export interface ValidationEntry {
  slug: string;
  name: string;
  /** Requêtes de recherche (benchmark fournisseur tiers). */
  query: { de: string; fr: string };
  unit: Unit;
  /** Contenance admise pour un article correspondant (bornes incluses). */
  amount: { min: number; max: number };
  /** Prix normalisé plausible (centimes par kg, litre ou pièce). */
  unitCents: { min: number; max: number };
  chains: Partial<Record<ChainId, { status: ValidationChainStatus; retailerProductIds?: string[]; note?: string }>>;
}

export interface ValidationDataset {
  description: string;
  version: string;
  calibratedAt: string;
  chains: ChainId[];
  entries: ValidationEntry[];
}

export type ValidationFailureKind =
  | 'product_disappeared' // article attendu absent de la dernière collecte
  | 'missing_price' // article présent sans prix utilisable
  | 'quantity_out_of_range' // contenance hors bornes (quantité mal lue)
  | 'unit_price_out_of_range' // prix au kilo hors bornes (lot attribué à une unité, erreur de lecture)
  | 'promo_as_regular' // prix normal égal à un prix d'action en cours
  | 'catalog_empty'; // aucun article de l'enseigne : collecte ou structure en panne

export interface ValidationFailure {
  kind: ValidationFailureKind;
  slug: string;
  chainId: ChainId;
  retailerProductId?: string;
  message: string;
}

export interface ValidationResult {
  at: string;
  checked: number;
  passed: number;
  failures: ValidationFailure[];
  /** Paires (référence, enseigne) couvertes et valides, par enseigne. */
  byChain: Record<string, { expected: number; ok: number }>;
}

export function validateAgainstDataset(dataset: ValidationDataset, data: DataSet, now: Date, policy: FreshnessPolicy): ValidationResult {
  const products = new Map(data.products.map((p) => [p.id, p]));
  const usable = usablePrices(data, now, policy);
  const failures: ValidationFailure[] = [];
  const byChain: ValidationResult['byChain'] = {};
  let checked = 0;
  let passed = 0;

  const chainsWithProducts = new Set(data.products.map((p) => p.chainId));
  for (const chainId of dataset.chains) {
    const expected = dataset.entries.some((e) => e.chains[chainId]?.status === 'covered');
    if (expected && !chainsWithProducts.has(chainId)) {
      failures.push({ kind: 'catalog_empty', slug: '*', chainId, message: `Aucun article ${chainId} dans la dernière collecte` });
    }
  }

  for (const e of dataset.entries) {
    for (const [chainId, c] of Object.entries(e.chains)) {
      if (!c || c.status !== 'covered' || !c.retailerProductIds?.length) continue;
      const stat = (byChain[chainId] ??= { expected: 0, ok: 0 });
      stat.expected++;
      checked++;
      const found = c.retailerProductIds.map((id) => products.get(id)).filter((p) => p !== undefined);
      if (found.length === 0) {
        failures.push({ kind: 'product_disappeared', slug: e.slug, chainId, message: `Aucun des articles attendus (${c.retailerProductIds.join(', ')}) n'est présent` });
        continue;
      }
      let ok = false;
      const local: ValidationFailure[] = [];
      for (const p of found) {
        if (p.quantity.unit !== e.unit || p.quantity.amount < e.amount.min || p.quantity.amount > e.amount.max) {
          local.push({ kind: 'quantity_out_of_range', slug: e.slug, chainId, retailerProductId: p.id, message: `Contenance ${p.quantity.amount} ${p.quantity.unit} hors bornes (${e.amount.min}–${e.amount.max} ${e.unit})` });
          continue;
        }
        const u = usable.get(p.id);
        if (!u?.length) {
          local.push({ kind: 'missing_price', slug: e.slug, chainId, retailerProductId: p.id, message: 'Aucun prix utilisable (ni prix normal récent, ni action en cours)' });
          continue;
        }
        const best = u.reduce((a, b) => (a.cents <= b.cents ? a : b));
        const unit = normalizedUnitCents(best.cents, p.quantity) ?? 0;
        if (unit < e.unitCents.min || unit > e.unitCents.max) {
          local.push({
            kind: 'unit_price_out_of_range',
            slug: e.slug,
            chainId,
            retailerProductId: p.id,
            message: `Prix normalisé ${(unit / 100).toFixed(2)} CHF hors bornes (${(e.unitCents.min / 100).toFixed(2)}–${(e.unitCents.max / 100).toFixed(2)})`,
          });
          continue;
        }
        const promoHit = data.promotions.some(
          (pr) =>
            pr.retailerProductId === p.id &&
            pr.referencePriceCents &&
            u.some((x) => x.kind === 'regular' && x.cents === pr.promoPriceCents && x.cents < (pr.referencePriceCents ?? 0)),
        );
        if (promoHit) {
          local.push({ kind: 'promo_as_regular', slug: e.slug, chainId, retailerProductId: p.id, message: "Prix normal égal au prix d'une action en cours" });
          continue;
        }
        ok = true;
      }
      if (ok) {
        passed++;
        stat.ok++;
      } else failures.push(...local);
    }
  }
  return { at: now.toISOString(), checked, passed, failures, byChain };
}

/**
 * Restreint le jeu de validation aux enseignes données. Sert quand les instantanés d'une source à
 * usage privé (Aldi, Denner) ne sont pas présents sur la machine (clone neuf, serveur d'intégration) :
 * leur absence n'est alors pas une panne de collecte.
 */
export function scopeValidationDataset(dataset: ValidationDataset, chainIds: Iterable<ChainId>): ValidationDataset {
  const keep = new Set(chainIds);
  return {
    ...dataset,
    chains: dataset.chains.filter((c) => keep.has(c)),
    entries: dataset.entries.map((e) => ({ ...e, chains: Object.fromEntries(Object.entries(e.chains).filter(([c]) => keep.has(c))) })),
  };
}
