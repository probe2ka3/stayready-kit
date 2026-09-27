import { addDays } from './time';

/**
 * Jours fériés suisses.
 *
 * Les jours fériés sont majoritairement cantonaux. Plutôt que d'encoder une liste
 * cantonale que nous ne pouvons pas garantir, on distingue :
 * - `certain` : jours fériés dans tous les cantons (Nouvel An, Ascension, Fête
 *   nationale, Noël) → les règles `PH` des horaires s'appliquent ;
 * - `possible` : jours fériés dans une partie des cantons → l'état d'ouverture
 *   des magasins devient « inconnu » et l'utilisateur est invité à vérifier.
 */

export type HolidayStatus = 'certain' | 'possible' | 'none';

export interface HolidayInfo {
  status: HolidayStatus;
  name?: string;
}

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher, calendrier grégorien). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Lundi du Jeûne fédéral : lundi suivant le 3e dimanche de septembre (VD). */
function jeuneFederalMonday(year: number): string {
  const sept1 = new Date(Date.UTC(year, 8, 1)).getUTCDay(); // 0 = dimanche
  const firstSunday = sept1 === 0 ? 1 : 8 - sept1;
  const thirdSunday = firstSunday + 14;
  return `${year}-09-${String(thirdSunday + 1).padStart(2, '0')}`;
}

const cache = new Map<number, Map<string, HolidayInfo>>();

function holidaysOfYear(year: number): Map<string, HolidayInfo> {
  const cached = cache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const y = String(year);
  const m = new Map<string, HolidayInfo>();
  const certain = (date: string, name: string) => m.set(date, { status: 'certain', name });
  const possible = (date: string, name: string) => {
    if (!m.has(date)) m.set(date, { status: 'possible', name });
  };
  certain(`${y}-01-01`, 'Nouvel An');
  certain(addDays(easter, 39), 'Ascension');
  certain(`${y}-08-01`, 'Fête nationale');
  certain(`${y}-12-25`, 'Noël');
  possible(`${y}-01-02`, 'Saint-Berchtold');
  possible(`${y}-03-01`, 'Instauration de la République (NE)');
  possible(addDays(easter, -2), 'Vendredi saint');
  possible(addDays(easter, 1), 'Lundi de Pâques');
  possible(`${y}-05-01`, 'Fête du travail');
  possible(addDays(easter, 50), 'Lundi de Pentecôte');
  possible(addDays(easter, 60), 'Fête-Dieu');
  possible(`${y}-06-23`, 'Commémoration du plébiscite (JU)');
  possible(`${y}-08-15`, 'Assomption');
  possible(jeuneFederalMonday(year), 'Lundi du Jeûne fédéral');
  possible(`${y}-11-01`, 'Toussaint');
  possible(`${y}-12-08`, 'Immaculée Conception');
  possible(`${y}-12-26`, 'Saint-Étienne');
  possible(`${y}-12-31`, 'Restauration de la République (GE)');
  cache.set(year, m);
  return m;
}

export function holidayInfo(date: string): HolidayInfo {
  const year = Number(date.slice(0, 4));
  return holidaysOfYear(year).get(date) ?? { status: 'none' };
}
