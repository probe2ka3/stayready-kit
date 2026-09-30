import { suggestMatches, type CanonicalProduct, type MatchKind, type ProductMatch, type RetailerProduct } from '@cabas/core';

/**
 * Correspondances revues par l'équipe données (fichier versionné `data/matching/reviewed.json`).
 * Une décision revue prime toujours sur les suggestions automatiques : validation
 * (`canonicalSlug` renseigné) ou refus explicite (`canonicalSlug: null`).
 */
export interface ReviewedMatch {
  retailerProductId: string;
  canonicalSlug: string | null;
  kind?: MatchKind;
  reviewer: string;
  reviewedAt: string;
  note?: string;
}

export interface ReviewedMatchesFile {
  description: string;
  matches: ReviewedMatch[];
}

function kindFor(product: RetailerProduct, canonical: CanonicalProduct): MatchKind {
  if (product.gtin && canonical.gtins?.includes(product.gtin)) return 'gtin';
  const ratio = product.quantity.amount / canonical.quantity.amount;
  return ratio >= 0.9 && ratio <= 1.1 ? 'equivalent' : 'similar';
}

/**
 * Correspondances d'un lot : décisions revues (validées), sinon suggestions
 * (« suggested », non utilisées par le comparateur avant validation), sauf GTIN identique.
 */
export function matchesFor(
  products: RetailerProduct[],
  catalog: CanonicalProduct[],
  reviewed: ReviewedMatch[] = [],
): { matches: ProductMatch[]; reviewedCount: number } {
  const bySlug = new Map(catalog.map((c) => [c.slug, c]));
  const decisions = new Map<string, ReviewedMatch[]>();
  for (const r of reviewed) {
    const list = decisions.get(r.retailerProductId) ?? [];
    list.push(r);
    decisions.set(r.retailerProductId, list);
  }
  const matches: ProductMatch[] = [];
  let reviewedCount = 0;
  for (const p of products) {
    const own = decisions.get(p.id);
    if (own) {
      reviewedCount++;
      for (const d of own) {
        const c = d.canonicalSlug ? bySlug.get(d.canonicalSlug) : undefined;
        if (!c || c.quantity.unit !== p.quantity.unit) continue;
        matches.push({ canonicalId: c.id, retailerProductId: p.id, kind: d.kind ?? kindFor(p, c), status: 'validated', confidence: 1 });
      }
      continue;
    }
    // Besoin déclaré par la source (relevé, catégorie) : pris tel quel, jamais complété par une suggestion.
    if (p.declaredSlug) {
      const c = bySlug.get(p.declaredSlug);
      if (c && c.quantity.unit === p.quantity.unit) {
        matches.push({ canonicalId: c.id, retailerProductId: p.id, kind: kindFor(p, c), status: 'validated', confidence: 1 });
      }
      continue;
    }
    for (const s of suggestMatches(p, catalog)) {
      matches.push({
        canonicalId: s.canonicalId,
        retailerProductId: p.id,
        kind: s.kind,
        status: s.autoValidate ? 'validated' : 'suggested',
        confidence: s.confidence,
      });
    }
  }
  return { matches, reviewedCount };
}
