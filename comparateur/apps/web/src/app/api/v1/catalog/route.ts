import { NextResponse } from 'next/server';
import { getAppData } from '@/server/data';
import { jsonError } from '@/server/http';
import { errorInfo, log } from '@/server/log';

/** GET /api/v1/catalog — enseignes et catégories (données de référence). */
export async function GET() {
  try {
    const data = getAppData();
    const [chains, categories] = await Promise.all([data.chains(), data.categories()]);
    return NextResponse.json({
      chains: chains.map((c) => ({
        id: c.id,
        name: c.name,
        badge: c.badge,
        website: c.website,
        loyaltyPrograms: c.loyaltyPrograms,
        promoCalendar: c.promoCalendar,
      })),
      categories,
    });
  } catch (e) {
    log('error', 'catalog_failed', errorInfo(e));
    return jsonError(500, 'server_error', 'Erreur interne');
  }
}
