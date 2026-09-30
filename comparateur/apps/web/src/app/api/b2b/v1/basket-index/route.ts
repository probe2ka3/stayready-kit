import { basketIndex, type ChainId } from '@cabas/core';
import { PRODUCTS } from '@cabas/reference';
import { authenticate, b2bRecords, unauthorized } from '@/server/b2b';

export const dynamic = 'force-dynamic';

/**
 * GET /api/b2b/v1/basket-index?retailers=lidl,aldi&priority=P1
 * Indice du panier commun (références couvertes par toutes les enseignes demandées), base 100 =
 * enseigne la moins chère ; prix officiels uniquement.
 */
export async function GET(req: Request) {
  if (!authenticate(req)) return unauthorized();
  const url = new URL(req.url);
  const retailers = (url.searchParams.get('retailers') ?? 'lidl,aldi').split(',').filter(Boolean) as ChainId[];
  const priority = url.searchParams.get('priority');
  const refs = new Map(PRODUCTS.filter((p) => !priority || p.priority === priority).map((p) => [p.id, p.quantity]));
  const res = basketIndex(await b2bRecords(), retailers, (id) => refs.get(id) ?? null);
  return Response.json({ at: new Date().toISOString(), retailers, priority, ...res });
}
