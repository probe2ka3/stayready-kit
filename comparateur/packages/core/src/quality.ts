import { ageInDays, daysBetween, weekdayOf } from './time';
import type { Chain, FreshnessPolicy, PriceObservation, Promotion } from './types';

/**
 * Contrôles de qualité des données (fonctions pures). Les anomalies détectées sont
 * enregistrées par le job `quality` et traitées dans l'administration.
 */

export type AnomalySeverity = 'info' | 'warning' | 'error';

export type AnomalyKind =
  | 'price_jump'
  | 'promo_not_lower'
  | 'promo_invalid_dates'
  | 'promo_published_after_end'
  | 'promo_too_long'
  | 'promo_calendar_mismatch'
  | 'stale_price'
  | 'future_observation'
  | 'unit_price_outlier'
  | 'missing_source';

export interface Anomaly {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  entityType: 'price' | 'promotion' | 'retailer_product';
  entityId: string;
  message: string;
  details?: Record<string, unknown>;
}

/** Variation de prix suspecte entre deux observations successives (même portée). */
export function checkPriceJump(prev: PriceObservation, next: PriceObservation, threshold = 0.5): Anomaly | null {
  if (prev.priceCents <= 0) return null;
  const change = (next.priceCents - prev.priceCents) / prev.priceCents;
  if (Math.abs(change) < threshold) return null;
  return {
    kind: 'price_jump',
    severity: 'warning',
    entityType: 'price',
    entityId: next.id,
    message: `Variation de ${(change * 100).toFixed(0)} % par rapport à l'observation précédente`,
    details: { previousCents: prev.priceCents, newCents: next.priceCents, previousObservedAt: prev.observedAt },
  };
}

export function checkObservation(o: PriceObservation, now: Date, policy: FreshnessPolicy): Anomaly[] {
  const out: Anomaly[] = [];
  if (Date.parse(o.observedAt) > now.getTime() + 3600_000) {
    out.push({
      kind: 'future_observation',
      severity: 'error',
      entityType: 'price',
      entityId: o.id,
      message: 'Date de vérification dans le futur',
      details: { observedAt: o.observedAt },
    });
  }
  if (ageInDays(o.observedAt, now) > policy.staleAfterDays) {
    out.push({
      kind: 'stale_price',
      severity: 'info',
      entityType: 'price',
      entityId: o.id,
      message: `Prix non vérifié depuis plus de ${policy.staleAfterDays} jours`,
      details: { observedAt: o.observedAt },
    });
  }
  if (!o.source.connectorId || !o.source.kind) {
    out.push({
      kind: 'missing_source',
      severity: 'error',
      entityType: 'price',
      entityId: o.id,
      message: 'Prix sans source',
    });
  }
  return out;
}

export function checkPromotion(p: Promotion, regularCents: number | null, chain?: Chain): Anomaly[] {
  const out: Anomaly[] = [];
  if (p.validTo < p.validFrom) {
    out.push({
      kind: 'promo_invalid_dates',
      severity: 'error',
      entityType: 'promotion',
      entityId: p.id,
      message: 'Fin de validité antérieure au début',
      details: { validFrom: p.validFrom, validTo: p.validTo },
    });
  }
  if (p.publishedAt.slice(0, 10) > p.validTo) {
    out.push({
      kind: 'promo_published_after_end',
      severity: 'error',
      entityType: 'promotion',
      entityId: p.id,
      message: 'Publication postérieure à la fin de validité',
    });
  }
  if (daysBetween(p.validFrom, p.validTo) > 62) {
    out.push({
      kind: 'promo_too_long',
      severity: 'warning',
      entityType: 'promotion',
      entityId: p.id,
      message: 'Promotion de plus de deux mois : vérifier qu’il ne s’agit pas d’un prix permanent',
    });
  }
  if (regularCents != null) {
    const promoUnit =
      p.type === 'price' || p.type === 'min_qty_price'
        ? p.promoPriceCents
        : p.type === 'percent' || p.type === 'min_qty_percent'
          ? Math.round(regularCents * (1 - (p.percent ?? 0) / 100))
          : null;
    if (promoUnit != null && promoUnit >= regularCents) {
      out.push({
        kind: 'promo_not_lower',
        severity: 'error',
        entityType: 'promotion',
        entityId: p.id,
        message: 'Prix promotionnel supérieur ou égal au prix normal',
        details: { promoCents: promoUnit, regularCents },
      });
    }
  }
  if (chain && chain.promoCalendar.waves.length > 0) {
    const wd = weekdayOf(p.validFrom);
    if (!chain.promoCalendar.waves.some((w) => w.startWeekday === wd)) {
      out.push({
        kind: 'promo_calendar_mismatch',
        severity: 'info',
        entityType: 'promotion',
        entityId: p.id,
        message: `Début un jour inhabituel pour ${chain.name} : vérifier la source (le calendrier a peut-être changé)`,
        details: { validFrom: p.validFrom, weekday: wd },
      });
    }
  }
  return out;
}

/** Prix unitaire aberrant par rapport à la médiane des autres enseignes (×3 ou ÷3). */
export function checkUnitPriceOutlier(
  entityId: string,
  unitPriceCents: number,
  peerUnitPricesCents: number[],
  factor = 3,
): Anomaly | null {
  if (peerUnitPricesCents.length < 3) return null;
  const sorted = [...peerUnitPricesCents].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  if (median <= 0) return null;
  if (unitPriceCents > median * factor || unitPriceCents < median / factor) {
    return {
      kind: 'unit_price_outlier',
      severity: 'warning',
      entityType: 'retailer_product',
      entityId,
      message: 'Prix unitaire très éloigné de la médiane des autres enseignes',
      details: { unitPriceCents, medianCents: Math.round(median) },
    };
  }
  return null;
}
