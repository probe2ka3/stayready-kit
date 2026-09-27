import { haversineKm } from './geo';
import type { LatLon } from './types';

export type TravelMode = 'car' | 'bike' | 'foot' | 'transit';

export interface TravelSettings {
  mode: TravelMode;
  /** Coût par kilomètre parcouru (CHF), paramétrable par l'utilisateur. */
  costPerKmChf: number;
  /** Valeur du temps de trajet (CHF/heure). 0 = le temps est affiché mais non monétisé. */
  valueOfTimeChfPerHour: number;
  /** Monétiser aussi le temps passé en magasin (choix explicite de l'utilisateur). */
  valueInStoreTime: boolean;
  /** Temps estimé passé dans chaque magasin (minutes). */
  minutesPerStore: number;
  returnToOrigin: boolean;
}

export const DEFAULT_COST_PER_KM: Record<TravelMode, number> = {
  // Coût variable d'une voiture (carburant, usure, entretien), hors coûts fixes.
  car: 0.35,
  bike: 0,
  foot: 0,
  // Estimation moyenne d'un billet à la distance ; 0 pour les abonnés (AG, abonnement local).
  transit: 0.25,
};

export const DEFAULT_TRAVEL: TravelSettings = {
  mode: 'car',
  costPerKmChf: DEFAULT_COST_PER_KM.car,
  valueOfTimeChfPerHour: 0,
  valueInStoreTime: false,
  minutesPerStore: 15,
  returnToOrigin: true,
};

/** Matrice de déplacement entre points (index 0 = point de départ). */
export interface TravelMatrix {
  distKm: number[][];
  durMin: number[][];
  /** Vrai si les valeurs sont des estimations (pas un calcul d'itinéraire réel). */
  estimated: boolean;
  provider: string;
}

export interface TravelMatrixProvider {
  readonly id: string;
  compute(points: LatLon[], mode: TravelMode): Promise<TravelMatrix>;
}

/**
 * Paramètres d'estimation sans calcul d'itinéraire :
 * distance réelle ≈ vol d'oiseau × facteur de détour ; durée = accès fixe + distance / vitesse.
 * Les facteurs de détour (1,2 – 1,4) sont des ordres de grandeur usuels pour un réseau
 * routier dense ; ils sont documentés comme estimations dans l'interface.
 */
export const ESTIMATE_PARAMS: Record<TravelMode, { detour: number; speedKmh: number; overheadMin: number }> = {
  car: { detour: 1.3, speedKmh: 38, overheadMin: 3 },
  bike: { detour: 1.25, speedKmh: 15, overheadMin: 1 },
  foot: { detour: 1.2, speedKmh: 4.5, overheadMin: 0 },
  transit: { detour: 1.4, speedKmh: 20, overheadMin: 8 },
};

export function estimateLeg(a: LatLon, b: LatLon, mode: TravelMode): { distKm: number; durMin: number } {
  const crow = haversineKm(a, b);
  if (crow < 1e-6) return { distKm: 0, durMin: 0 };
  const p = ESTIMATE_PARAMS[mode];
  const distKm = crow * p.detour;
  return { distKm, durMin: p.overheadMin + (distKm / p.speedKmh) * 60 };
}

export class EstimatedMatrixProvider implements TravelMatrixProvider {
  readonly id = 'estimation';
  async compute(points: LatLon[], mode: TravelMode): Promise<TravelMatrix> {
    return estimatedMatrix(points, mode);
  }
}

export function estimatedMatrix(points: LatLon[], mode: TravelMode): TravelMatrix {
  const n = points.length;
  const distKm = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const durMin = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const leg = estimateLeg(points[i] as LatLon, points[j] as LatLon, mode);
      (distKm[i] as number[])[j] = leg.distKm;
      (distKm[j] as number[])[i] = leg.distKm;
      (durMin[i] as number[])[j] = leg.durMin;
      (durMin[j] as number[])[i] = leg.durMin;
    }
  }
  return { distKm, durMin, estimated: true, provider: 'estimation' };
}

/** Coût monétaire (centimes) d'un trajet selon les réglages. */
export function legCostCents(distKm: number, durMin: number, s: TravelSettings): number {
  return Math.round(distKm * s.costPerKmChf * 100 + (durMin / 60) * s.valueOfTimeChfPerHour * 100);
}

export function inStoreCostCents(stores: number, s: TravelSettings): number {
  if (!s.valueInStoreTime || s.valueOfTimeChfPerHour <= 0) return 0;
  return Math.round(((stores * s.minutesPerStore) / 60) * s.valueOfTimeChfPerHour * 100);
}
