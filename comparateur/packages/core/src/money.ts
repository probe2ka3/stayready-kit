/** Montants en centimes (Rappen). */

export function chfToCents(chf: number): number {
  if (!Number.isFinite(chf)) throw new RangeError(`Montant invalide : ${chf}`);
  return Math.round(chf * 100);
}

export function centsToChf(cents: number): number {
  return cents / 100;
}

/**
 * Arrondi commercial suisse aux 5 centimes les plus proches, utilisé pour les
 * rabais en pourcentage (les enseignes affichent des prix multiples de 5 ct).
 */
export function roundTo5Rappen(cents: number): number {
  return Math.round(cents / 5) * 5;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatChf(cents: number, locale = 'fr-CH'): string {
  let f = formatters.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'CHF',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatters.set(locale, f);
  }
  return f.format(cents / 100);
}
