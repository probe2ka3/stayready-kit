import type { Quantity, Unit } from './types';

/**
 * Normalise une quantité exprimée dans une unité courante vers g / ml / pièce.
 * Accepte : g, kg, mg, ml, cl, dl, l, piece/pc/pce/stk/st/x.
 */
export function normalizeQuantity(amount: number, rawUnit: string): Quantity {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError(`Quantité invalide : ${amount}`);
  }
  const unit = rawUnit.trim().toLowerCase().replace(/\.$/, '');
  switch (unit) {
    case 'g':
    case 'gr':
      return { amount, unit: 'g' };
    case 'kg':
      return { amount: amount * 1000, unit: 'g' };
    case 'mg':
      return { amount: amount / 1000, unit: 'g' };
    case 'ml':
      return { amount, unit: 'ml' };
    case 'cl':
      return { amount: amount * 10, unit: 'ml' };
    case 'dl':
      return { amount: amount * 100, unit: 'ml' };
    case 'l':
    case 'lt':
      return { amount: amount * 1000, unit: 'ml' };
    case 'piece':
    case 'pièce':
    case 'pièces':
    case 'pieces':
    case 'pc':
    case 'pcs':
    case 'pce':
    case 'pces':
    case 'stk':
    case 'st':
    case 'x':
    case 'rouleaux':
    case 'rouleau':
    case 'lavages':
    case 'doses':
      return { amount, unit: 'piece' };
    default:
      throw new RangeError(`Unité inconnue : ${rawUnit}`);
  }
}

export function sameDimension(a: Quantity, b: Quantity): boolean {
  return a.unit === b.unit;
}

/** Libellé lisible : 1 kg, 500 g, 1,5 l, 2,5 dl, 6 pièces. */
export function formatQuantity(q: Quantity, locale = 'fr-CH'): string {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  if (q.unit === 'g') {
    return q.amount >= 1000 ? `${nf.format(q.amount / 1000)} kg` : `${nf.format(q.amount)} g`;
  }
  if (q.unit === 'ml') {
    if (q.amount >= 1000) return `${nf.format(q.amount / 1000)} l`;
    if (q.amount >= 100 && q.amount % 100 === 0) return `${nf.format(q.amount / 100)} dl`;
    return `${nf.format(q.amount)} ml`;
  }
  return `${nf.format(q.amount)} ${q.amount > 1 ? 'pièces' : 'pièce'}`;
}

export type UnitPriceBasis = 'kg' | 'l' | 'piece' | '100g' | '100ml';

/**
 * Prix unitaire pour comparaison (OIP art. 5) : par kg, par litre ou par pièce.
 * Pour les petits conditionnements (< 250 g / 250 ml), on affiche aussi par 100 g / 100 ml.
 */
export function unitPrice(priceCents: number, q: Quantity): { basis: UnitPriceBasis; cents: number } {
  if (q.unit === 'g') {
    if (q.amount < 250) return { basis: '100g', cents: Math.round((priceCents * 100) / q.amount) };
    return { basis: 'kg', cents: Math.round((priceCents * 1000) / q.amount) };
  }
  if (q.unit === 'ml') {
    if (q.amount < 250) return { basis: '100ml', cents: Math.round((priceCents * 100) / q.amount) };
    return { basis: 'l', cents: Math.round((priceCents * 1000) / q.amount) };
  }
  return { basis: 'piece', cents: Math.round(priceCents / q.amount) };
}

export const UNIT_BASIS_LABEL: Record<UnitPriceBasis, string> = {
  kg: 'kg',
  l: 'l',
  piece: 'pièce',
  '100g': '100 g',
  '100ml': '100 ml',
};

/**
 * Tolérance de conditionnement : un paquet dont la taille est à ±10 % de la référence
 * compte pour une unité (900 g ou 1,1 kg pour « 1 kg »).
 */
export const PACK_TOLERANCE = 0.1;

/**
 * Nombre de paquets à acheter pour `qty` unités d'une référence de taille `unitAmount`
 * lorsque l'enseigne vend des paquets de `packSize` (même dimension).
 *
 * - Taille équivalente (±10 %) : un paquet par unité demandée.
 * - Taille différente : nombre minimal de paquets couvrant la quantité totale,
 *   avec une tolérance de 10 % d'un paquet (évite d'acheter un paquet de plus
 *   pour quelques grammes).
 */
export function packsNeeded(
  qty: number,
  unitAmount: number,
  packSize: number,
  tolerance = PACK_TOLERANCE,
): number {
  if (packSize <= 0 || unitAmount <= 0) throw new RangeError('Taille de conditionnement invalide');
  if (!Number.isInteger(qty) || qty < 1) throw new RangeError(`Quantité invalide : ${qty}`);
  const ratio = packSize / unitAmount;
  if (ratio >= 1 - tolerance && ratio <= 1 + tolerance) return qty;
  const needed = qty * unitAmount;
  return Math.max(1, Math.ceil(needed / packSize - tolerance - 1e-9));
}

export function isUnit(value: string): value is Unit {
  return value === 'g' || value === 'ml' || value === 'piece';
}
