import { coverageForApi } from '@cabas/core';
import { authenticate, unauthorized } from '@/server/b2b';
import { dataQualityView } from '@/server/data-quality';

export const dynamic = 'force-dynamic';

/** GET /api/b2b/v1/coverage — couverture du catalogue par enseigne (agrégats uniquement). */
export async function GET(req: Request) {
  if (!authenticate(req)) return unauthorized();
  const { coverage } = await dataQualityView();
  return Response.json(coverageForApi(coverage));
}
