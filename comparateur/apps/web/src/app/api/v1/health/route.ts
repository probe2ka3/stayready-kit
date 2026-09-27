import { NextResponse } from 'next/server';
import { getAppData } from '@/server/data';

/** GET /api/v1/health — sonde de disponibilité (pour l'hébergeur / la supervision). */
export async function GET() {
  try {
    const data = getAppData();
    await data.chains();
    const realPrices = await data.hasRealPrices(new Date());
    return NextResponse.json({
      status: 'ok',
      backend: data.mode,
      // Mode démonstration tant qu'aucun prix réel n'est disponible.
      demo: !realPrices,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: 'degraded' }, { status: 503 });
  }
}
