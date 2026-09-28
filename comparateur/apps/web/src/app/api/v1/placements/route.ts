import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { activePlacements, type SponsoredPlacement } from '@cabas/core';
import { serverEnv } from '@/server/env';

const SLOTS = ['results_footer', 'home', 'list_footer'] as const;

/**
 * GET /api/v1/placements?slot=… — emplacements commerciaux actifs (signalés comme tels).
 * Ils sont servis séparément des résultats : le moteur de comparaison n'en a pas connaissance.
 */
export async function GET(req: Request) {
  const slot = new URL(req.url).searchParams.get('slot');
  if (!slot || !(SLOTS as readonly string[]).includes(slot)) {
    return NextResponse.json({ error: { code: 'invalid_request', message: 'Emplacement inconnu' } }, { status: 400 });
  }
  let list: SponsoredPlacement[] = [];
  try {
    const file = JSON.parse(await readFile(join(serverEnv.dataDir, 'commercial', 'placements.json'), 'utf8')) as { placements?: SponsoredPlacement[] };
    list = file.placements ?? [];
  } catch {
    list = [];
  }
  return NextResponse.json(
    { placements: activePlacements(list, slot as (typeof SLOTS)[number], new Date()) },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
}
