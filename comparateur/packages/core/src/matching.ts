import { significantTokens } from './text';
import type { CanonicalProduct, MatchKind, RetailerProduct } from './types';

/**
 * Suggestions de correspondance entre un article d'enseigne et les références
 * normalisées. Ces suggestions ont le statut « suggested » : elles ne sont
 * utilisées par le comparateur qu'après validation humaine dans l'administration
 * (sauf correspondance GTIN exacte avec une référence qui déclare ce GTIN).
 */

export interface MatchSuggestion {
  canonicalId: string;
  kind: MatchKind;
  confidence: number;
  reasons: string[];
  /** true si la suggestion peut être validée automatiquement (GTIN identique). */
  autoValidate: boolean;
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function suggestMatches(product: RetailerProduct, catalog: CanonicalProduct[], limit = 3): MatchSuggestion[] {
  const out: MatchSuggestion[] = [];
  const pTokens = significantTokens(`${product.name} ${product.brand ?? ''}`);
  for (const c of catalog) {
    const reasons: string[] = [];
    if (product.gtin && c.gtins?.includes(product.gtin)) {
      out.push({ canonicalId: c.id, kind: 'gtin', confidence: 1, reasons: ['GTIN identique'], autoValidate: true });
      continue;
    }
    if (c.quantity.unit !== product.quantity.unit) continue;
    // Caractéristiques essentielles : jamais d'équivalence si elles diffèrent.
    if (Boolean(c.attributes.organic) !== Boolean(product.attributes.organic)) continue;
    if (c.attributes.swissOrigin && !product.attributes.swissOrigin) continue;
    if ((c.attributes.labels ?? []).some((l) => !(product.attributes.labels ?? []).includes(l))) continue;
    if (c.brandRequired && (product.brand ?? '').toLowerCase() !== c.brandRequired.toLowerCase()) continue;

    const cTokens = significantTokens(`${c.name} ${(c.keywords ?? []).join(' ')}`);
    const nameSim = jaccard(pTokens, cTokens);
    if (nameSim < 0.2) continue;
    const ratio = product.quantity.amount / c.quantity.amount;
    if (ratio < 0.25 || ratio > 4) continue;
    const sameSize = ratio >= 0.9 && ratio <= 1.1;
    const sizeScore = sameSize ? 1 : Math.max(0, 1 - Math.abs(Math.log(ratio)) / Math.log(4));
    const confidence = Math.round((0.7 * nameSim + 0.3 * sizeScore) * 100) / 100;
    reasons.push(`Similarité du nom ${(nameSim * 100).toFixed(0)} %`);
    reasons.push(sameSize ? 'Conditionnement équivalent (±10 %)' : `Conditionnement différent (×${ratio.toFixed(2)})`);
    out.push({
      canonicalId: c.id,
      kind: sameSize ? 'equivalent' : 'similar',
      confidence,
      reasons,
      autoValidate: false,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
}
