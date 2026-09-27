import 'server-only';
import {
  EstimatedMatrixProvider,
  type LatLon,
  type TravelMatrix,
  type TravelMatrixProvider,
  type TravelMode,
} from '@cabas/core';
import { serverEnv } from './env';

const OSRM_PROFILE: Partial<Record<TravelMode, string>> = { car: 'driving', bike: 'cycling', foot: 'walking' };

/**
 * Matrice de distances/durées routières via un serveur OSRM compatible
 * (à auto-héberger en production : le serveur de démonstration public
 * n'autorise pas un usage applicatif). Repli automatique sur l'estimation.
 */
export class OsrmMatrixProvider implements TravelMatrixProvider {
  readonly id = 'osrm';
  private readonly fallback = new EstimatedMatrixProvider();

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 4000,
  ) {}

  async compute(points: LatLon[], mode: TravelMode): Promise<TravelMatrix> {
    const profile = OSRM_PROFILE[mode];
    if (!profile || points.length > 100) return this.fallback.compute(points, mode);
    const coords = points.map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const url = `${this.baseUrl.replace(/\/$/, '')}/table/v1/${profile}/${coords}?annotations=distance,duration`;
    const res = await fetch(url, { signal: AbortSignal.timeout(this.timeoutMs), cache: 'no-store' });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const json = (await res.json()) as { code: string; distances?: Array<Array<number | null>>; durations?: Array<Array<number | null>> };
    if (json.code !== 'Ok' || !json.distances || !json.durations) throw new Error(`OSRM ${json.code}`);
    const estimate = await this.fallback.compute(points, mode);
    // Les paires sans itinéraire (null) sont complétées par l'estimation.
    const distKm = json.distances.map((row, i) => row.map((d, j) => (d == null ? (estimate.distKm[i]?.[j] ?? 0) : d / 1000)));
    const durMin = json.durations.map((row, i) => row.map((d, j) => (d == null ? (estimate.durMin[i]?.[j] ?? 0) : d / 60)));
    return { distKm, durMin, estimated: false, provider: 'osrm' };
  }
}

let provider: TravelMatrixProvider | null = null;

export function getMatrixProvider(): TravelMatrixProvider {
  if (!provider) provider = serverEnv.osrmUrl ? new OsrmMatrixProvider(serverEnv.osrmUrl) : new EstimatedMatrixProvider();
  return provider;
}
