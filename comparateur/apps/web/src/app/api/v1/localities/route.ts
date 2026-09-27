import { NextResponse } from 'next/server';
import { getAppData } from '@/server/data';
import { jsonError, limitOr429 } from '@/server/http';
import { errorInfo, log } from '@/server/log';
import { issues, localityQuery } from '@/server/validation';

/** GET /api/v1/localities?q=1630 — recherche de localités (NPA ou nom). */
export async function GET(req: Request) {
  const limited = limitOr429(req, 'search');
  if (limited) return limited;
  const parsed = localityQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return jsonError(400, 'invalid_query', 'Requête invalide', { issues: issues(parsed.error) });
  try {
    const hits = await getAppData().searchLocalities(parsed.data.q, parsed.data.limit);
    return NextResponse.json({
      localities: hits.map((l) => ({ label: l.label, zip: l.zip, name: l.name, canton: l.canton, lat: l.lat, lon: l.lon })),
      attribution: 'Source : Office fédéral de topographie swisstopo',
    });
  } catch (e) {
    log('error', 'localities_failed', errorInfo(e));
    return jsonError(500, 'server_error', 'Erreur interne');
  }
}
