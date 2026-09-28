import { normalizeQuantity, type Quantity } from '@cabas/core';

/**
 * Lecture des conditionnements publiés par les enseignes (« les 185g », « 2 x 150 g »,
 * « 6 x 1,5 l », « Le kg », « La pièce », « 100 g · Env. 200-300 g »).
 */
export interface ParsedPack {
  quantity: Quantity;
  /** Article vendu au poids : le prix est donné pour `quantity` (ex. 100 g ou 1 kg). */
  variableWeight: boolean;
  /** Plusieurs contenances possibles (« 180 g / 200 g », « diverses sortes ») : correspondance à revoir. */
  ambiguous: boolean;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const MASS_VOL = String.raw`(kg|g|mg|ml|cl|dl|l)`;

function num(s: string): number {
  return Number(s.replace(',', '.'));
}

export function parsePackText(raw: string): ParsedPack | null {
  try {
    return parsePack(raw);
  } catch {
    // Contenance nulle ou unité inconnue (« 0 g ») : illisible plutôt qu'une erreur de collecte.
    return null;
  }
}

function parsePack(raw: string): ParsedPack | null {
  const text = raw
    .toLowerCase()
    .replace(/&nbsp;| /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Le prix de base (« 100g = 2,16 CHF ») n'est pas le conditionnement.
  const segments = text
    .split(/[|·]/)
    .map((s) => s.trim())
    .filter((s) => s && !s.includes('='));
  const main = segments.join(' ; ');
  const ambiguous =
    /\d\s*(?:g|ml|l|kg|cl)?\s*[/,+]\s*\d/.test(main.replace(/(\d),(\d)/g, '$1.$2')) ||
    /diverses sortes|verschiedene sorten/.test(main);
  const variableWeight = /\benv\.?\s*\d|\bca\.?\s*\d/.test(main);

  const multi = new RegExp(String.raw`(\d+)\s*[x×]\s*${NUM}\s*${MASS_VOL}\b`).exec(main);
  if (multi) {
    const q = normalizeQuantity(Number(multi[1]) * num(multi[2] as string), multi[3] as string);
    return { quantity: q, variableWeight: false, ambiguous };
  }
  if (/\b(le|les|par|au|pro)\s*kg\b/.test(main) || /^kg$/.test(main)) {
    return { quantity: { amount: 1000, unit: 'g' }, variableWeight: true, ambiguous };
  }
  const single = new RegExp(String.raw`${NUM}\s*${MASS_VOL}\b`).exec(main);
  if (single) {
    const q = normalizeQuantity(num(single[1] as string), single[2] as string);
    return { quantity: q, variableWeight, ambiguous };
  }
  // « 24 x 80 feuilles » : 24 rouleaux (le nombre de feuilles n'est pas l'unité de comparaison).
  const rolls = /(\d+)\s*[x×]\s*\d+\s*(feuilles|blatt)/.exec(main);
  if (rolls) return { quantity: { amount: Number(rolls[1]), unit: 'piece' }, variableWeight: false, ambiguous };
  const pieces = /(\d+)\s*(pièces?|pieces?|pces?|pc|stück|stk\.?|rouleaux|sachets?|capsules|œufs|oeufs|tablettes|lavages|paires?)(?=[\s.;,|]|$)/.exec(main);
  if (pieces) return { quantity: { amount: Number(pieces[1]), unit: 'piece' }, variableWeight: false, ambiguous };
  if (/\b(la|le|par)\s*(pièce|botte|barquette|filet|bouquet|pot|sachet|set|paquet|lot)\b/.test(main)) {
    return { quantity: { amount: 1, unit: 'piece' }, variableWeight: false, ambiguous };
  }
  return null;
}

/**
 * Contrôle de cohérence avec le prix de base publié (« 100g = 2,16 CHF », « 1 kg = 1.90 »).
 * Renvoie l'écart relatif, ou null si le texte ne contient pas de prix de base lisible.
 */
export function unitPriceDeviation(raw: string, priceCents: number, quantity: Quantity): number | null {
  const m = new RegExp(String.raw`${NUM}\s*${MASS_VOL}\s*=\s*(?:chf\s*)?(\d+[.,]\d{2})`, 'i').exec(raw);
  if (!m) return null;
  let basis: Quantity;
  try {
    basis = normalizeQuantity(num(m[1] as string), m[2] as string);
  } catch {
    return null;
  }
  if (basis.unit !== quantity.unit || quantity.amount <= 0) return null;
  const published = num(m[3] as string) * 100;
  const computed = (priceCents / quantity.amount) * basis.amount;
  return published > 0 ? Math.abs(computed - published) / published : null;
}
