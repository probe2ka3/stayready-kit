import type { LatLon } from './types';

const EARTH_RADIUS_KM = 6371.0088;

/** Distance orthodromique (vol d'oiseau) en km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Rectangle englobant un cercle (pré-filtrage rapide avant le calcul exact). */
export function boundingBox(center: LatLon, radiusKm: number) {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLon: center.lon - dLon,
    maxLon: center.lon + dLon,
  };
}

/** Emprise approximative de la Suisse (validation des coordonnées reçues). */
export const SWITZERLAND_BBOX = { minLat: 45.7, maxLat: 47.9, minLon: 5.8, maxLon: 10.6 };

export function isInSwitzerlandBBox(p: LatLon): boolean {
  return (
    p.lat >= SWITZERLAND_BBOX.minLat &&
    p.lat <= SWITZERLAND_BBOX.maxLat &&
    p.lon >= SWITZERLAND_BBOX.minLon &&
    p.lon <= SWITZERLAND_BBOX.maxLon
  );
}

/** Arrondit une position (≈ 1 km à 2 décimales) pour les journaux et le cache. */
export function coarsen(p: LatLon, decimals = 2): LatLon {
  const f = 10 ** decimals;
  return { lat: Math.round(p.lat * f) / f, lon: Math.round(p.lon * f) / f };
}
