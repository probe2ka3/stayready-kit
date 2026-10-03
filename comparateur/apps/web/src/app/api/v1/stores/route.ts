import { NextResponse } from 'next/server';
import {
  DEFAULT_FRESHNESS,
  DEFAULT_PREFS,
  formatDaySchedule,
  openStatusDuring,
  parseOpeningHours,
  usableNeedsByChain,
  zurichToday,
  type UsableNeeds,
} from '@cabas/core';
import { P1_ESSENTIALS, PRODUCTS } from '@cabas/reference';
import { getAppData } from '@/server/data';
import { jsonError, limitOr429 } from '@/server/http';
import { restrictedChainIds } from '@/server/sources';
import { errorInfo, log } from '@/server/log';
import { issues, storesQuery } from '@/server/validation';

const MAX_STORES_LISTED = 400;

/**
 * GET /api/v1/stores?lat=..&lon=..&radius=10
 * Enseignes présentes dans le rayon et leurs succursales (les plus proches d'abord).
 * Les enseignes absentes sont listées à part : elles ne peuvent pas être visitées.
 * Pour chaque enseigne, `priceData` distingue la présence des magasins de la disponibilité de prix
 * exploitables (officiels, communautaires, aucun) ; le stock en rayon est toujours inconnu.
 */
export async function GET(req: Request) {
  const limited = limitOr429(req, 'stores');
  if (limited) return limited;
  const parsed = storesQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return jsonError(400, 'invalid_query', 'Requête invalide', { issues: issues(parsed.error) });
  const { lat, lon, radius } = parsed.data;
  try {
    const data = getAppData();
    const now = new Date();
    const today = zurichToday(now);
    const [stores, chains, status, mode] = await Promise.all([
      data.storesNear({ lat, lon }, radius),
      data.chains(),
      data.chainStatus(now),
      data.priceMode(now),
    ]);
    const statusByChain = new Map(status.map((st) => [st.chainId, st]));
    // Aliments de base avec un prix réellement utilisable par la comparaison (mêmes règles : fraîcheur,
    // zone tarifaire des succursales du rayon, exigences du besoin) : un relevé trop ancien ou d'une
    // autre zone ne fait pas passer une enseigne pour « couverte ».
    const essentials = P1_ESSENTIALS.map((slug) => PRODUCTS.find((p) => p.slug === slug)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const usable =
      mode === 'live'
        ? usableNeedsByChain(await data.offers([], [], now), stores, essentials, { asOf: now, today, targetDate: today, policy: DEFAULT_FRESHNESS, prefs: DEFAULT_PREFS })
        : new Map<string, UsableNeeds>();
    // Enseignes dont la source officielle est exclue (conditions restrictives, pas d'autorisation).
    // L'exclusion vise la source, pas l'enseigne : les relevés d'une source publiable (Open Prices) pour
    // la même enseigne restent affichés ; les compteurs `status` sont calculés après exclusion.
    const restrictedChains = restrictedChainIds();
    // Présence d'un magasin ≠ disponibilité de prix : chaque enseigne indique ses données de prix.
    const needsTotal = P1_ESSENTIALS.length;
    const priceData = (chainId: string) => {
      const st = statusByChain.get(chainId);
      const officialRestricted = restrictedChains.has(chainId);
      if (mode === 'demo') return { kind: 'demo' as const, lastObservation: null, prices: st?.realPrices ?? 0, officialRestricted: false, needs: 0, needsTotal };
      const u = usable.get(chainId);
      const needs = u?.needs ?? 0;
      if (u && u.official > 0) return { kind: 'official' as const, lastObservation: u.newestOfficial, prices: needs, officialRestricted, needs, needsTotal };
      if (u && needs > 0) return { kind: 'community' as const, lastObservation: u.newest, prices: needs, officialRestricted, needs, needsTotal };
      if (officialRestricted) return { kind: 'restricted' as const, lastObservation: null, prices: 0, officialRestricted, needs: 0, needsTotal };
      return { kind: 'none' as const, lastObservation: st?.lastObservation ?? null, prices: 0, officialRestricted, needs: 0, needsTotal };
    };
    const byChain = new Map<string, { count: number; nearestKm: number }>();
    for (const s of stores) {
      const cur = byChain.get(s.chainId);
      if (!cur) byChain.set(s.chainId, { count: 1, nearestKm: s.crowKm });
      else cur.count++;
    }
    return NextResponse.json({
      radiusKm: radius,
      chains: chains
        .filter((c) => byChain.has(c.id))
        .map((c) => ({ chainId: c.id, name: c.name, badge: c.badge, ...byChain.get(c.id), priceData: priceData(c.id) })),
      absentChains: chains.filter((c) => !byChain.has(c.id)).map((c) => ({ chainId: c.id, name: c.name, badge: c.badge })),
      stores: stores.slice(0, MAX_STORES_LISTED).map((s) => {
        const oh = parseOpeningHours(s.openingHours);
        return {
          id: s.id,
          chainId: s.chainId,
          name: s.name,
          address: [s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
          crowKm: Math.round(s.crowKm * 10) / 10,
          hoursToday: formatDaySchedule(oh, today),
          openNow: openStatusDuring(oh, now, 15),
          accessNotes: s.accessNotes ?? null,
          // Aucune source ne publie le stock par succursale : toujours « inconnu ».
          stock: 'unknown' as const,
        };
      }),
      truncated: stores.length > MAX_STORES_LISTED,
      attribution: '© les contributeurs d’OpenStreetMap (ODbL)',
    });
  } catch (e) {
    log('error', 'stores_failed', errorInfo(e));
    return jsonError(500, 'server_error', 'Erreur interne');
  }
}

