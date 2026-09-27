import { describe, expect, it } from 'vitest';
import {
  formatDaySchedule,
  openStatusDuring,
  openStatusOnDate,
  parseOpeningHours,
  scheduleForDate,
  zurichLocalToInstant,
} from '../src';

const at = (date: string, time: string) => zurichLocalToInstant(date, time);

describe('horaires OpenStreetMap', () => {
  it('lit un horaire de supermarché courant', () => {
    const oh = parseOpeningHours('Mo-Fr 08:00-19:00; Sa 08:00-17:00; Su off; PH off');
    expect(oh.ok).toBe(true);
    // lundi 28.09.2026
    expect(scheduleForDate(oh, '2026-09-28')).toEqual({ kind: 'intervals', intervals: [[480, 1140]] });
    expect(formatDaySchedule(oh, '2026-09-26')).toBe('08:00–17:00'); // samedi
    expect(formatDaySchedule(oh, '2026-09-27')).toBe('Fermé'); // dimanche
    expect(openStatusDuring(oh, at('2026-09-28', '10:00'), 15)).toBe('open');
    expect(openStatusDuring(oh, at('2026-09-28', '18:50'), 15)).toBe('closed'); // ferme avant la fin de la visite
    expect(openStatusDuring(oh, at('2026-09-27', '10:00'), 15)).toBe('closed');
  });

  it('applique PH off le 1er août (jour férié certain)', () => {
    const oh = parseOpeningHours('Mo-Sa 08:00-20:00; PH off');
    expect(openStatusOnDate(oh, '2026-08-01')).toBe('closed'); // samedi 1er août
    expect(openStatusOnDate(oh, '2026-08-03')).toBe('open');
  });

  it('rend l’état inconnu les jours fériés cantonaux', () => {
    const oh = parseOpeningHours('Mo-Sa 08:00-20:00; PH off');
    expect(openStatusOnDate(oh, '2026-04-03')).toBe('unknown'); // Vendredi saint
  });

  it('gère les pauses de midi et les règles additionnelles', () => {
    const oh = parseOpeningHours('Mo-Fr 08:00-12:00,13:30-18:30, Sa 08:00-16:00');
    expect(oh.ok).toBe(true);
    expect(formatDaySchedule(oh, '2026-09-29')).toBe('08:00–12:00, 13:30–18:30');
    expect(formatDaySchedule(oh, '2026-09-26')).toBe('08:00–16:00');
    expect(openStatusDuring(oh, at('2026-09-29', '12:10'), 15)).toBe('closed');
    const add = parseOpeningHours('Mo-Fr 08:00-12:00, We 14:00-18:00');
    expect(formatDaySchedule(add, '2026-09-30')).toBe('08:00–12:00, 14:00–18:00');
  });

  it('distingue règle normale (écrase) et additionnelle', () => {
    const normal = parseOpeningHours('Mo-Fr 08:00-12:00; We 14:00-18:00');
    expect(formatDaySchedule(normal, '2026-09-30')).toBe('14:00–18:00');
  });

  it('gère 24/7 et les horaires de nuit', () => {
    expect(openStatusDuring(parseOpeningHours('24/7'), at('2026-09-27', '03:00'), 15)).toBe('open');
    const night = parseOpeningHours('Mo-Su 06:00-02:00');
    expect(openStatusDuring(night, at('2026-09-29', '01:00'), 15)).toBe('open');
    expect(openStatusDuring(night, at('2026-09-29', '03:00'), 15)).toBe('closed');
  });

  it('ne rejette pas un horaire non reconnu : état inconnu', () => {
    const oh = parseOpeningHours('week 39-50 Sa 08:00-17:30');
    expect(oh.ok).toBe(false);
    expect(openStatusDuring(oh, at('2026-09-28', '10:00'), 15)).toBe('unknown');
    expect(parseOpeningHours(null).ok).toBe(false);
    expect(parseOpeningHours('Mo-Fr 18:00+').ok).toBe(false);
  });

  it('gère les dates particulières et les fermetures temporaires', () => {
    const special = parseOpeningHours('Mo-Sa 07:30-20:00; PH off; Dec 24 07:30-16:00; Dec 25-26 off');
    expect(formatDaySchedule(special, '2026-12-24')).toBe('07:30–16:00');
    expect(formatDaySchedule(special, '2026-12-26')).toBe('Fermé');
    expect(formatDaySchedule(special, '2026-12-23')).toBe('07:30–20:00');
    const seasonal = parseOpeningHours('Mo-Fr 08:00-12:00, 13:30-18:30; Sa 08:00-16:00; Jun-Aug Su 09:00-11:00');
    expect(formatDaySchedule(seasonal, '2026-07-05')).toBe('09:00–11:00');
    expect(formatDaySchedule(seasonal, '2026-09-27')).toBe('Fermé');
    const works = parseOpeningHours('Mo-Su 06:00-22:00; 2026 Sep 03-2026 Nov 05 closed');
    expect(openStatusOnDate(works, '2026-09-28')).toBe('closed');
    expect(openStatusOnDate(works, '2026-11-06')).toBe('open');
    expect(parseOpeningHours('Mo-Fr 07:30-19:00; Sa 07:30 - 18:00').ok).toBe(true);
  });

  it('ignore les commentaires entre guillemets', () => {
    const oh = parseOpeningHours('Mo-Sa 08:00-19:00 "horaires d’été"; Su off');
    expect(oh.ok).toBe(true);
  });
});
