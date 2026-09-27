/**
 * Gestion des dates et heures dans le fuseau Europe/Zurich, sans dépendance externe.
 *
 * - Une « date » est une chaîne `YYYY-MM-DD` (calendrier local suisse).
 * - Un « instant » est un objet Date (UTC).
 * Les passages à l'heure d'été / d'hiver sont gérés via Intl (données IANA du runtime).
 */

export const ZURICH_TZ = 'Europe/Zurich';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZURICH_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface ZurichParts {
  date: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 1 = lundi … 7 = dimanche */
  weekday: number;
  /** minutes depuis minuit (heure locale) */
  minutesOfDay: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isTimeOfDay(value: string): boolean {
  return TIME_RE.test(value);
}

export function zurichParts(instant: Date): ZurichParts {
  const map: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(instant)) map[p.type] = p.value;
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);
  const date = `${map.year}-${map.month}-${map.day}`;
  return {
    date,
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: weekdayOf(date),
    minutesOfDay: hour * 60 + minute,
  };
}

/** Date du jour à Zurich. */
export function zurichToday(now: Date = new Date()): string {
  return zurichParts(now).date;
}

/** Décalage (minutes) entre l'heure de Zurich et UTC à un instant donné. */
export function zurichOffsetMinutes(instant: Date): number {
  const p = zurichParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60000);
}

/**
 * Convertit une date + heure locales de Zurich en instant UTC.
 * Pour une heure inexistante (passage à l'heure d'été), renvoie l'instant décalé
 * d'une heure ; pour une heure ambiguë (passage à l'heure d'hiver), la première occurrence.
 */
export function zurichLocalToInstant(date: string, time = '00:00'): Date {
  const dm = DATE_RE.exec(date);
  const tm = TIME_RE.exec(time);
  if (!dm || !tm) throw new RangeError(`Date/heure invalide : ${date} ${time}`);
  const wall = Date.UTC(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2]));
  // Deux itérations suffisent pour converger autour des changements d'heure.
  const off1 = zurichOffsetMinutes(new Date(wall - 60 * 60000));
  let guess = wall - off1 * 60000;
  const off2 = zurichOffsetMinutes(new Date(guess));
  guess = wall - off2 * 60000;
  return new Date(guess);
}

export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Date invalide : ${date}`);
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return dt.toISOString().slice(0, 10);
}

/** Jour ISO de la semaine (1 = lundi … 7 = dimanche) d'une date calendaire. */
export function weekdayOf(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Date invalide : ${date}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Nombre de jours de `a` à `b` (positif si b est après a). */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / 86400000);
}

/** Vrai si `date` est dans l'intervalle [from, to] (bornes incluses). */
export function dateInRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/** Âge en jours (décimal) d'un instant ISO par rapport à `now`. */
export function ageInDays(isoInstant: string, now: Date): number {
  return (now.getTime() - Date.parse(isoInstant)) / 86400000;
}

/** Date du dernier `weekday` (1-7) inférieure ou égale à `date`. */
export function previousOrSameWeekday(date: string, weekday: number): string {
  const diff = (weekdayOf(date) - weekday + 7) % 7;
  return addDays(date, -diff);
}

const longDateFormatters = new Map<string, Intl.DateTimeFormat>();

/** « jeudi 1 octobre 2026 » */
export function formatLongDate(date: string, locale = 'fr-CH'): string {
  let f = longDateFormatters.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    longDateFormatters.set(locale, f);
  }
  return f.format(new Date(`${date}T12:00:00Z`));
}

/** « jeu. 1 oct. » */
export function formatShortDate(date: string, locale = 'fr-CH'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}

/** « 14:35 » heure de Zurich. */
export function formatZurichTime(instant: Date, locale = 'fr-CH'): string {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: ZURICH_TZ,
  }).format(instant);
}
