import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  easterSunday,
  formatChf,
  formatQuantity,
  haversineKm,
  holidayInfo,
  isIsoDate,
  normalizeQuantity,
  normalizeText,
  packsNeeded,
  roundTo5Rappen,
  search,
  unitPrice,
  weekdayOf,
  zurichLocalToInstant,
  zurichOffsetMinutes,
  zurichParts,
  zurichToday,
} from '../src';

describe('montants', () => {
  it('arrondit aux 5 centimes', () => {
    expect(roundTo5Rappen(236)).toBe(235);
    expect(roundTo5Rappen(238)).toBe(240);
    expect(roundTo5Rappen(237.5)).toBe(240);
    expect(roundTo5Rappen(100)).toBe(100);
  });
  it('formate en francs suisses', () => {
    expect(formatChf(1234)).toMatch(/CHF\s?12\.34|12\.34\s?CHF/);
  });
});

describe('unités et conditionnements', () => {
  it('normalise les unités', () => {
    expect(normalizeQuantity(1, 'kg')).toEqual({ amount: 1000, unit: 'g' });
    expect(normalizeQuantity(2.5, 'dl')).toEqual({ amount: 250, unit: 'ml' });
    expect(normalizeQuantity(75, 'cl')).toEqual({ amount: 750, unit: 'ml' });
    expect(normalizeQuantity(6, 'pce')).toEqual({ amount: 6, unit: 'piece' });
    expect(() => normalizeQuantity(1, 'boîte')).toThrow();
    expect(() => normalizeQuantity(0, 'g')).toThrow();
  });

  it('calcule le nombre de paquets', () => {
    // taille équivalente (±10 %) : un paquet par unité
    expect(packsNeeded(1, 1000, 900)).toBe(1);
    expect(packsNeeded(3, 1000, 1000)).toBe(3);
    expect(packsNeeded(10, 1, 1)).toBe(10);
    expect(packsNeeded(2, 1000, 1100)).toBe(2);
    // conditionnements différents
    expect(packsNeeded(1, 1000, 500)).toBe(2);
    expect(packsNeeded(1, 1000, 750)).toBe(2);
    expect(packsNeeded(1, 1000, 1500)).toBe(1);
    expect(packsNeeded(3, 1000, 500)).toBe(6);
    expect(packsNeeded(1, 6, 10)).toBe(1);
    expect(packsNeeded(2, 6, 10)).toBe(2);
    expect(() => packsNeeded(0, 1000, 500)).toThrow();
  });

  it('calcule le prix unitaire (OIP art. 5)', () => {
    expect(unitPrice(250, { amount: 500, unit: 'g' })).toEqual({ basis: 'kg', cents: 500 });
    expect(unitPrice(180, { amount: 1500, unit: 'ml' })).toEqual({ basis: 'l', cents: 120 });
    expect(unitPrice(120, { amount: 100, unit: 'g' })).toEqual({ basis: '100g', cents: 120 });
    expect(unitPrice(390, { amount: 6, unit: 'piece' })).toEqual({ basis: 'piece', cents: 65 });
  });

  it('formate les quantités', () => {
    expect(formatQuantity({ amount: 1000, unit: 'g' })).toBe('1 kg');
    expect(formatQuantity({ amount: 250, unit: 'ml' })).toBe('250 ml');
    expect(formatQuantity({ amount: 500, unit: 'ml' })).toBe('5 dl');
    expect(formatQuantity({ amount: 1500, unit: 'ml' })).toBe('1,5 l');
    expect(formatQuantity({ amount: 6, unit: 'piece' })).toBe('6 pièces');
  });
});

describe('dates Europe/Zurich', () => {
  it('connaît le jour de la semaine', () => {
    expect(weekdayOf('2026-09-27')).toBe(7); // dimanche
    expect(weekdayOf('2026-10-01')).toBe(4); // jeudi
    expect(weekdayOf('2026-02-05')).toBe(4); // passage Migros/Denner au jeudi
  });

  it('gère les heures d’été et d’hiver', () => {
    expect(zurichOffsetMinutes(new Date('2026-07-01T12:00:00Z'))).toBe(120);
    expect(zurichOffsetMinutes(new Date('2026-12-01T12:00:00Z'))).toBe(60);
    expect(zurichLocalToInstant('2026-07-01', '10:00').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(zurichLocalToInstant('2026-12-01', '10:00').toISOString()).toBe('2026-12-01T09:00:00.000Z');
    // jours de changement d'heure (29 mars et 25 octobre 2026)
    expect(zurichLocalToInstant('2026-03-29', '12:00').toISOString()).toBe('2026-03-29T10:00:00.000Z');
    expect(zurichLocalToInstant('2026-10-25', '12:00').toISOString()).toBe('2026-10-25T11:00:00.000Z');
    expect(zurichLocalToInstant('2026-03-29', '01:30').toISOString()).toBe('2026-03-29T00:30:00.000Z');
  });

  it('donne la date locale même tard le soir en UTC', () => {
    // 23:30 UTC le 30 septembre = 01:30 le 1er octobre à Zurich
    const p = zurichParts(new Date('2026-09-30T23:30:00Z'));
    expect(p.date).toBe('2026-10-01');
    expect(p.hour).toBe(1);
    expect(zurichToday(new Date('2026-09-30T23:30:00Z'))).toBe('2026-10-01');
  });

  it('fait de l’arithmétique de dates', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-09-27', '2026-10-01')).toBe(4);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
  });
});

describe('jours fériés', () => {
  it('calcule Pâques', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });
  it('distingue jours fériés certains et cantonaux', () => {
    expect(holidayInfo('2026-08-01').status).toBe('certain');
    expect(holidayInfo('2026-05-14').status).toBe('certain'); // Ascension 2026
    expect(holidayInfo('2026-04-03').status).toBe('possible'); // Vendredi saint
    expect(holidayInfo('2026-09-21').status).toBe('possible'); // Lundi du Jeûne (VD)
    expect(holidayInfo('2026-09-28').status).toBe('none');
  });
});

describe('géographie', () => {
  it('calcule la distance Lausanne – Genève (~51 km)', () => {
    const d = haversineKm({ lat: 46.5197, lon: 6.6323 }, { lat: 46.2044, lon: 6.1432 });
    expect(d).toBeGreaterThan(49);
    expect(d).toBeLessThan(53);
  });
});

describe('recherche', () => {
  const items = [
    { id: '1', name: 'Farine blanche', extra: 'farine-sucre-sel' },
    { id: '2', name: 'Œufs d’élevage au sol', extra: 'oeufs' },
    { id: '3', name: 'Papier hygiénique 3 plis', extra: 'wc toilette' },
  ];
  it('ignore accents et casse', () => {
    expect(normalizeText('Œufs d’Élevage')).toBe('oeufs d elevage');
    expect(search('oeuf', items).map((i) => i.id)).toEqual(['2']);
    expect(search('FARINE', items).map((i) => i.id)).toEqual(['1']);
    expect(search('toilette', items).map((i) => i.id)).toEqual(['3']);
    expect(search('farines', items).map((i) => i.id)).toEqual(['1']);
    expect(search('chocolat', items)).toEqual([]);
  });
});
