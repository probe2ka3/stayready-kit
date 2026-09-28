import { NextResponse } from 'next/server';
import { CompareError, linesBucket } from '@cabas/core';
import { runComparison } from '@/server/compare-service';
import { jsonError, limitOr429, readJson, sameOrigin } from '@/server/http';
import { errorInfo, log } from '@/server/log';
import { recordMetric } from '@/server/metrics';
import { compareSchema, issues } from '@/server/validation';

/**
 * POST /api/v1/compare — compare un panier (voir docs/API.md).
 * Aucune donnée de la requête (position, panier) n'est enregistrée.
 */
export async function POST(req: Request) {
  const limited = limitOr429(req, 'compare');
  if (limited) return limited;
  if (!sameOrigin(req)) return jsonError(403, 'forbidden_origin', 'Origine non autorisée');
  let body: unknown;
  try {
    body = await readJson(req);
  } catch {
    return jsonError(400, 'invalid_json', 'Corps de requête invalide');
  }
  const parsed = compareSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'invalid_request', 'Requête invalide', { issues: issues(parsed.error) });
  const started = Date.now();
  try {
    const result = await runComparison(parsed.data);
    log('info', 'compare', {
      lines: parsed.data.lines.length,
      radiusKm: parsed.data.radiusKm,
      mode: parsed.data.when.mode,
      stores: result.meta.storesConsidered,
      ms: Date.now() - started,
    });
    // Compteurs anonymes (aucune donnée de la requête n'est conservée).
    recordMetric('compare', parsed.data.when.mode);
    recordMetric('compare_lines', linesBucket(parsed.data.lines.length));
    recordMetric('compare_stores', String(result.scenarios.find((s) => s.kind === 'optimized_total')?.storeCount ?? 0));
    recordMetric('compare_data', result.meta.dataMode);
    if (result.scenarios.some((s) => s.detours.length > 0)) recordMetric('detour', 'shown');
    if (result.waitSignal) recordMetric('wait_signal', 'shown');
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof CompareError) return jsonError(422, e.code, e.message);
    log('error', 'compare_failed', { ...errorInfo(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 6).join(' | ') : undefined });
    return jsonError(500, 'server_error', 'Erreur interne');
  }
}
