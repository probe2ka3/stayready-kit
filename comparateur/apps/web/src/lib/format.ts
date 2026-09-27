import { formatChf, formatLongDate, formatShortDate, UNIT_BASIS_LABEL, type UnitPriceBasis } from '@cabas/core';

export const money = (cents: number) => formatChf(cents, 'fr-CH');

export function signedMoney(cents: number): string {
  if (cents === 0) return money(0);
  return `${cents > 0 ? '−' : '+'}${money(Math.abs(cents))}`;
}

export function km(value: number): string {
  if (value < 1) return `${Math.round(value * 1000)} m`;
  return `${new Intl.NumberFormat('fr-CH', { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} km`;
}

export function duration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}

export function unitPriceLabel(u: { basis: UnitPriceBasis; cents: number }): string {
  return `${money(u.cents)} / ${UNIT_BASIS_LABEL[u.basis]}`;
}

export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Zurich',
  }).format(new Date(iso));
}

export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', timeZone: 'Europe/Zurich' }).format(new Date(iso));
}

export function time(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }).format(new Date(iso));
}

export { formatLongDate as longDate, formatShortDate as shortCalendarDate };
