import { NextResponse } from 'next/server';
import { formatDaySchedule, openStatusDuring, parseOpeningHours, zurichToday } from '@cabas/core';
import { getAppData } from '@/server/data';
import { jsonError, limitOr429 } from '@/server/http';
import { errorInfo, log } from '@/server/log';
import { issues, storesQuery } from '@/server/validation';

const MAX_STORES_LISTED = 400;

/**
 * GET /api/v1/stores?lat=..&lon=..&radius=10
 * Enseignes présentes dans le rayon et leurs succursales (les plus proches d'abord).
 * Les enseignes absentes sont listées à part : elles ne peuvent pas être visitées.
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
    const [stores, chains] = await Promise.all([data.storesNear({ lat, lon }, radius), data.chains()]);
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
        .map((c) => ({ chainId: c.id, name: c.name, badge: c.badge, ...byChain.get(c.id) })),
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
