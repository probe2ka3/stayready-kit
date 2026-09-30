import { apiObservations } from '@cabas/core';
import { authenticate, b2bRecords, unauthorized } from '@/server/b2b';

export const dynamic = 'force-dynamic';

/**
 * GET /api/b2b/v1/observations?retailer=lidl&product=penne-500g&limit=500
 * Observations de prix officielles (first-party) rapprochées du catalogue, avec provenance.
 */
export async function GET(req: Request) {
  if (!authenticate(req)) return unauthorized();
  const url = new URL(req.url);
  const retailer = url.searchParams.get('retailer');
  const product = url.searchParams.get('product');
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 500) || 500));
  const records = (await b2bRecords()).filter((r) => (!retailer || r.retailer === retailer) && (!product || r.canonicalIds.includes(product)));
  const data = apiObservations(records).slice(0, limit);
  return Response.json({ data, count: data.length, license: 'Données TesPrix ; sources indiquées par observation' });
}
