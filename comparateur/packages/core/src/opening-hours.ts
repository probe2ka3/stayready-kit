import { holidayInfo } from './holidays';
import { addDays, weekdayOf, zurichParts } from './time';

/**
 * Évaluation des horaires au format OpenStreetMap `opening_hours`.
 *
 * Sous-ensemble pris en charge (couvre la très grande majorité des magasins suisses) :
 *   24/7 · Mo-Fr 08:00-19:00 · Mo,We 08:00-12:00,13:30-18:30 · Sa 08:00-17:00
 *   Su off · PH off · Su,PH off · 22:00-02:00 (nuit) · "commentaires" ignorés
 *   « ; » = règle normale (écrase les jours concernés), « , » avant un jour = règle additionnelle.
 *
 * Toute syntaxe non reconnue (mois, semaines, SH, lever du soleil, « 18:00+ »…) rend
 * l'horaire « inconnu » : le magasin n'est jamais exclu à tort, mais signalé.
 */

export type OpenStatus = 'open' | 'closed' | 'unknown';

interface Rule {
  /** jours ISO 1-7 ; vide + ph=false => tous les jours */
  days: Set<number>;
  /** mois 1-12 (sélecteur « Jun-Aug ») ; null = tous les mois */
  months: Set<number> | null;
  /** date annuelle précise (« Dec 24 », « Dec 25-26 ») */
  monthDay: { month: number; from: number; to: number } | null;
  /** période datée (« 2026 Sep 03-2026 Nov 05 closed » : fermeture temporaire) */
  dateRange?: { from: string; to: string } | null;
  ph: boolean;
  allDays: boolean;
  /** intervalles en minutes depuis minuit ; fin possiblement > 1440 (nuit) */
  times: Array<[number, number]> | null;
  mode: 'open' | 'closed' | 'unknown';
  additional: boolean;
}

export interface ParsedOpeningHours {
  ok: boolean;
  raw: string;
  rules: Rule[];
  hasPhRule: boolean;
}

const DAY_CODES: Record<string, number> = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 7 };
const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
const MONTH_TOKEN = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))?$/;
const DAY_OF_MONTH = /^(\d{1,2})(-(\d{1,2}))?$/;
const DATE_RANGE =
  /^(\d{4}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})-(\d{4}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})(?:\s+|$)/;

function isoOf(year: string, month: string, day: string): string {
  return `${year}-${String(MONTHS[month]).padStart(2, '0')}-${day.padStart(2, '0')}`;
}
const DAY_TOKEN = /^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?$/;
const TIME_RANGE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

function parseDaySelector(token: string, rule: Rule): boolean {
  for (const part of token.split(',')) {
    if (part === 'PH') {
      rule.ph = true;
      continue;
    }
    const m = DAY_TOKEN.exec(part);
    if (!m) return false;
    const start = DAY_CODES[m[1] as string] as number;
    const end = m[3] ? (DAY_CODES[m[3]] as number) : start;
    // Plages circulaires possibles (Sa-Mo).
    let d = start;
    for (let guard = 0; guard < 7; guard++) {
      rule.days.add(d);
      if (d === end) break;
      d = d === 7 ? 1 : d + 1;
    }
  }
  return true;
}

function parseTimes(token: string): Array<[number, number]> | null {
  const out: Array<[number, number]> = [];
  for (const part of token.split(',')) {
    const m = TIME_RANGE.exec(part);
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    let end = Number(m[3]) * 60 + Number(m[4]);
    if (start > 24 * 60 || end > 48 * 60 || Number(m[2]) > 59 || Number(m[4]) > 59) return null;
    if (end <= start) end += 24 * 60; // passe minuit
    out.push([start, end]);
  }
  return out;
}

function isDaySelector(token: string): boolean {
  return token.split(',').every((p) => p === 'PH' || DAY_TOKEN.test(p));
}

function startsRule(token: string): boolean {
  return (isDaySelector(token) || MONTH_TOKEN.test(token)) && !TIME_RANGE.test(token);
}

/** Découpe « Mo-Fr 08:00-12:00, Sa 09:00-12:00 » en règles additionnelles. */
function splitAdditional(ruleText: string): string[] {
  const out: string[] = [];
  let current = '';
  const parts = ruleText.split(/,\s+/);
  for (const part of parts) {
    const firstWord = part.trim().split(/\s+/)[0] ?? '';
    if (current && startsRule(firstWord)) {
      out.push(current);
      current = part;
    } else {
      current = current ? `${current},${part}` : part;
    }
  }
  if (current) out.push(current);
  return out;
}

export function parseOpeningHours(raw: string | null | undefined): ParsedOpeningHours {
  const fail = (r: string): ParsedOpeningHours => ({ ok: false, raw: r, rules: [], hasPhRule: false });
  if (!raw || !raw.trim()) return fail(raw ?? '');
  const text = raw
    .replace(/"[^"]*"/g, '')
    .replace(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g, '$1-$2')
    .replace(/\s+/g, ' ')
    .trim();
  if (text === '24/7') {
    return {
      ok: true,
      raw,
      hasPhRule: false,
      rules: [
        {
          days: new Set(),
          months: null,
          monthDay: null,
          ph: false,
          allDays: true,
          times: [[0, 1440]],
          mode: 'open',
          additional: false,
        },
      ],
    };
  }
  const rules: Rule[] = [];
  const normalRules = text
    .split(/\s*(?:;|\|\|)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const normal of normalRules) {
    const pieces = splitAdditional(normal);
    for (let i = 0; i < pieces.length; i++) {
      let pieceText = (pieces[i] as string).trim();
      let dateRange: Rule['dateRange'] = null;
      const dr = DATE_RANGE.exec(pieceText);
      if (dr) {
        dateRange = { from: isoOf(dr[1]!, dr[2]!, dr[3]!), to: isoOf(dr[4]!, dr[5]!, dr[6]!) };
        pieceText = pieceText.slice(dr[0].length);
      }
      const tokens = pieceText.split(/\s+/).filter(Boolean);
      const rule: Rule = {
        days: new Set(),
        months: null,
        monthDay: null,
        dateRange,
        ph: false,
        allDays: false,
        times: null,
        mode: 'open',
        additional: i > 0,
      };
      let idx = 0;
      const monthMatch = tokens[idx] ? MONTH_TOKEN.exec(tokens[idx] as string) : null;
      if (monthMatch) {
        const m1 = MONTHS[monthMatch[1] as string] as number;
        const dom = tokens[idx + 1] ? DAY_OF_MONTH.exec(tokens[idx + 1] as string) : null;
        if (dom && !monthMatch[3]) {
          const from = Number(dom[1]);
          const to = dom[3] ? Number(dom[3]) : from;
          if (from < 1 || to > 31 || to < from) return fail(raw);
          rule.monthDay = { month: m1, from, to };
          idx += 2;
        } else {
          const m2 = monthMatch[3] ? (MONTHS[monthMatch[3]] as number) : m1;
          rule.months = new Set();
          for (let m = m1, guard = 0; guard < 12; guard++) {
            rule.months.add(m);
            if (m === m2) break;
            m = m === 12 ? 1 : m + 1;
          }
          idx += 1;
        }
      }
      if (tokens[idx] && isDaySelector(tokens[idx] as string) && !TIME_RANGE.test(tokens[idx] as string)) {
        if (!parseDaySelector(tokens[idx] as string, rule)) return fail(raw);
        idx++;
      } else {
        rule.allDays = true;
      }
      if (tokens[idx] && /^\d/.test(tokens[idx] as string)) {
        const times = parseTimes(tokens[idx] as string);
        if (!times) return fail(raw);
        rule.times = times;
        idx++;
      }
      if (tokens[idx]) {
        const mod = (tokens[idx] as string).toLowerCase();
        if (mod === 'off' || mod === 'closed') rule.mode = 'closed';
        else if (mod === 'open') rule.mode = 'open';
        else if (mod === 'unknown') rule.mode = 'unknown';
        else return fail(raw);
        idx++;
      }
      if (idx < tokens.length) return fail(raw);
      if (rule.mode === 'open' && !rule.times) {
        // « Mo-Fr open » : ouvert toute la journée
        rule.times = [[0, 1440]];
      }
      rules.push(rule);
    }
  }
  if (rules.length === 0) return fail(raw);
  return { ok: true, raw, rules, hasPhRule: rules.some((r) => r.ph) };
}

export type DaySchedule =
  | { kind: 'intervals'; intervals: Array<[number, number]> }
  | { kind: 'unknown'; reason: 'unparsed' | 'possible_holiday' | 'rule_unknown' };

/** Intervalles d'ouverture d'une date (minutes depuis minuit, fin éventuellement > 1440). */
export function scheduleForDate(parsed: ParsedOpeningHours, date: string): DaySchedule {
  if (!parsed.ok) return { kind: 'unknown', reason: 'unparsed' };
  const weekday = weekdayOf(date);
  const month = Number(date.slice(5, 7));
  const dayOfMonth = Number(date.slice(8, 10));
  const holiday = holidayInfo(date);
  if (holiday.status === 'possible') {
    // Jour férié cantonal possible : inconnu, sauf si l'horaire prévoit explicitement cette date.
    const explicit = parsed.rules.some(
      (r) =>
        (r.monthDay && r.monthDay.month === month && dayOfMonth >= r.monthDay.from && dayOfMonth <= r.monthDay.to) ||
        (r.dateRange && date >= r.dateRange.from && date <= r.dateRange.to),
    );
    if (!explicit) return { kind: 'unknown', reason: 'possible_holiday' };
  }
  const isPh = holiday.status === 'certain';
  let intervals: Array<[number, number]> = [];
  let unknown = false;
  for (const rule of parsed.rules) {
    if (rule.dateRange && (date < rule.dateRange.from || date > rule.dateRange.to)) continue;
    if (rule.months && !rule.months.has(month)) continue;
    if (rule.monthDay && (rule.monthDay.month !== month || dayOfMonth < rule.monthDay.from || dayOfMonth > rule.monthDay.to)) {
      continue;
    }
    const matches = rule.allDays || rule.days.has(weekday) || (rule.ph && isPh);
    if (!matches) continue;
    if (!rule.additional) {
      intervals = [];
      unknown = false;
    }
    if (rule.mode === 'closed') {
      // Une règle normale a déjà vidé la journée (sémantique OSM : elle l'écrase) ;
      // une règle additionnelle « 12:00-13:00 off » retire seulement la plage.
      intervals = rule.times ? subtract(intervals, rule.times) : [];
    } else if (rule.mode === 'unknown') {
      unknown = true;
    } else if (rule.times) {
      intervals = intervals.concat(rule.times);
    }
  }
  if (unknown) return { kind: 'unknown', reason: 'rule_unknown' };
  return { kind: 'intervals', intervals: merge(intervals) };
}

function merge(list: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...list].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

function subtract(list: Array<[number, number]>, remove: Array<[number, number]>): Array<[number, number]> {
  let current = merge(list);
  for (const [rs, re] of remove) {
    const next: Array<[number, number]> = [];
    for (const [s, e] of current) {
      if (re <= s || rs >= e) next.push([s, e]);
      else {
        if (rs > s) next.push([s, rs]);
        if (re < e) next.push([re, e]);
      }
    }
    current = next;
  }
  return current;
}

/**
 * Le magasin est-il ouvert pendant toute la fenêtre [start, start + durationMin] ?
 * La fenêtre complète est exigée : arriver 5 minutes avant la fermeture pour
 * 15 minutes de courses n'est pas réaliste.
 */
export function openStatusDuring(parsed: ParsedOpeningHours, start: Date, durationMin: number): OpenStatus {
  const p = zurichParts(start);
  const today = scheduleForDate(parsed, p.date);
  const yesterday = scheduleForDate(parsed, addDays(p.date, -1));
  if (today.kind === 'unknown') return 'unknown';
  const windows: Array<[number, number]> = [...today.intervals];
  if (yesterday.kind === 'intervals') {
    for (const [s, e] of yesterday.intervals) if (e > 1440) windows.push([Math.max(0, s - 1440), e - 1440]);
  } else if (p.minutesOfDay < 360) {
    // Tôt le matin, les horaires de la veille (nuit) sont inconnus.
    return 'unknown';
  }
  const from = p.minutesOfDay;
  const to = from + durationMin;
  return windows.some(([s, e]) => s <= from && to <= e) ? 'open' : 'closed';
}

/** Ouverture sur la journée (mode « planifier » sans heure précise). */
export function openStatusOnDate(parsed: ParsedOpeningHours, date: string): OpenStatus {
  const s = scheduleForDate(parsed, date);
  if (s.kind === 'unknown') return 'unknown';
  return s.intervals.length > 0 ? 'open' : 'closed';
}

function hhmm(minutes: number): string {
  const m = minutes % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** « 08:00–12:00, 13:30–18:30 », « Fermé » ou null si inconnu. */
export function formatDaySchedule(parsed: ParsedOpeningHours, date: string): string | null {
  const s = scheduleForDate(parsed, date);
  if (s.kind === 'unknown') return null;
  if (s.intervals.length === 0) return 'Fermé';
  if (s.intervals.length === 1 && s.intervals[0]?.[0] === 0 && s.intervals[0]?.[1] === 1440) return '24 h/24';
  return s.intervals.map(([a, b]) => `${hhmm(a)}–${b === 1440 ? '24:00' : hhmm(b)}`).join(', ');
}

/**
 * Horaires présumés (pratique usuelle des supermarchés suisses), appliqués aux
 * succursales sans horaires connus. Hors de ces plages, la succursale est
 * considérée comme fermée (on n'envoie personne vers un magasin probablement
 * fermé) ; dans ces plages, son état reste « non vérifié ».
 */
export const PRESUMED_HOURS_TEXT = 'Mo-Fr 08:00-18:30; Sa 08:00-17:00; Su off; PH off';
export const PRESUMED_HOURS: ParsedOpeningHours = parseOpeningHours(PRESUMED_HOURS_TEXT);

