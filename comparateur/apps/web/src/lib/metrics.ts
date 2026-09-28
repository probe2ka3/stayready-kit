'use client';

import { visitBucket, zurichToday, type MetricName } from '@cabas/core';

/**
 * Compteurs anonymes côté navigateur : aucune donnée personnelle n'est transmise.
 * La date de la dernière visite reste dans le navigateur ; seule une tranche est envoyée.
 * Respect de « Do Not Track » et « Global Privacy Control ».
 */
const LAST_VISIT_KEY = 'tesprix-derniere-visite';

function optedOut(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string | null };
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}

export function track(metric: MetricName, dimension: string): void {
  if (typeof window === 'undefined' || optedOut()) return;
  void fetch('/api/v1/metrics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ metric, dimension }),
    keepalive: true,
  }).catch(() => {});
}

/** Une fois par jour et par navigateur au plus. */
export function trackVisit(): void {
  if (typeof window === 'undefined' || optedOut()) return;
  try {
    const today = zurichToday(new Date());
    const last = localStorage.getItem(LAST_VISIT_KEY);
    if (last === today) return;
    localStorage.setItem(LAST_VISIT_KEY, today);
    track('visit', visitBucket(last, today));
  } catch {
    // Stockage local indisponible : pas de comptage.
  }
}
