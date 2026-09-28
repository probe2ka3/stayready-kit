import { NextResponse } from 'next/server';
import { z } from 'zod';
import { addToWaitlist } from '@cabas/db';
import { getPostgresData } from '@/server/data';
import { serverEnv } from '@/server/env';
import { jsonError, limitOr429, readJson, sameOrigin } from '@/server/http';

const schema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
    canton: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
    consent: z.literal(true),
  })
  .strict();

/**
 * POST /api/v1/waitlist — inscription volontaire à la liste d'attente.
 * Fermée tant que SIGNUP_ENABLED n'est pas activé (aucune adresse n'est alors collectée).
 */
export async function POST(req: Request) {
  if (!serverEnv.signupEnabled) return jsonError(503, 'signup_closed', 'Les inscriptions ne sont pas encore ouvertes.');
  const pg = getPostgresData();
  if (!pg) return jsonError(503, 'signup_unavailable', 'Inscriptions indisponibles.');
  const limited = limitOr429(req, 'login');
  if (limited) return limited;
  if (!sameOrigin(req)) return jsonError(403, 'forbidden_origin', 'Origine non autorisée');
  let body: unknown;
  try {
    body = await readJson(req, 2_000);
  } catch {
    return jsonError(400, 'invalid_json', 'Corps de requête invalide');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError(400, 'invalid_request', 'Adresse ou consentement manquant.');
  await addToWaitlist(pg.handle, parsed.data.email, 'fr', parsed.data.canton ?? null, new Date());
  // Réponse identique que l'adresse soit nouvelle ou non (pas d'énumération).
  return NextResponse.json({ ok: true });
}
