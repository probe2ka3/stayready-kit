import { NextResponse } from 'next/server';
import { z } from 'zod';
import { METRICS } from '@cabas/core';
import { jsonError, limitOr429, readJson, sameOrigin } from '@/server/http';
import { recordMetric } from '@/server/metrics';

const metricNames = Object.keys(METRICS) as [keyof typeof METRICS, ...Array<keyof typeof METRICS>];
const schema = z.object({ metric: z.enum(metricNames), dimension: z.string().max(20) }).strict();

/**
 * POST /api/v1/metrics — compteur anonyme (aucun identifiant, aucune adresse IP enregistrée).
 * Seules les paires indicateur/dimension de la liste fermée sont acceptées.
 */
export async function POST(req: Request) {
  const limited = limitOr429(req, 'search');
  if (limited) return limited;
  if (!sameOrigin(req)) return jsonError(403, 'forbidden_origin', 'Origine non autorisée');
  let body: unknown;
  try {
    body = await readJson(req, 512);
  } catch {
    return jsonError(400, 'invalid_json', 'Corps de requête invalide');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'invalid_request', 'Requête invalide');
  recordMetric(parsed.data.metric, parsed.data.dimension);
  return new NextResponse(null, { status: 204 });
}
