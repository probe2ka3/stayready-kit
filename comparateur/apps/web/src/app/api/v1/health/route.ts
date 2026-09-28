import { NextResponse } from 'next/server';
import { getAppData } from '@/server/data';

/** GET /api/v1/health — sonde de disponibilité (pour l'hébergeur / la supervision). */
export async function GET() {
  try {
    const data = getAppData();
    await data.chains();
    const mode = await data.priceMode(new Date());
    return NextResponse.json({
      status: 'ok',
      backend: data.mode,
      // Données de démonstration servies (jamais mélangées aux prix réels).
      demo: mode === 'demo',
      prices: mode,
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: 'degraded' }, { status: 503 });
  }
}
