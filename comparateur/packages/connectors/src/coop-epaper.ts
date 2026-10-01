import { createHash } from 'node:crypto';
import { VARIABLE_WEIGHT_LABEL, zurichToday, type Promotion, type Quantity, type RetailerProduct } from '@cabas/core';
import { PRODUCTS } from '@cabas/reference';
import { requireFetcher } from './http/fetcher';
import { labelsFromName } from './lidl';
import { matchesFor } from './matching';
import { parsePackText } from './pack';
import { emptyReport, type ConnectorBatch, type ConnectorContext, type ConnectorStatus, type PriceConnector } from './types';

/**
 * Coop — « Magazine des actions » du journal numérique officiel (Coopération, e-paper public).
 *
 * `epaper.cooperation.ch` (robots.txt : `Allow: /`, accès sans compte) publie chaque semaine le
 * journal et ses encarts, page par page en PDF avec couche de texte. Le collecteur lit l'encart
 * « Magazine des actions » de l'édition régionale choisie : actions seulement (jamais des prix
 * permanents), avec les dates imprimées sur le prospectus (« Du jeudi au mercredi 1.10 - 7.10.2026 »)
 * et la région de l'édition (pied de page). Un prix n'est retenu que s'il est rattaché sans ambiguïté
 * à sa désignation : le prix unitaire imprimé (« 100 g = –.20 ») doit concorder.
 *
 * Volume : une édition par semaine ; chaque page n'est téléchargée qu'une fois (texte mis en cache).
 * Conditions : celles de coop.ch ne sont pas consultables par un robot (DataDome) ; usage privé
 * jusqu'à vérification ou accord (docs/COLLECTE_QUOTIDIENNE.md).
 */

export const COOP_EPAPER_ORIGIN = 'https://epaper.cooperation.ch';
export const COOP_EPAPER_CONNECTOR_ID = 'coop-epaper';
/** Édition Coopération par défaut : Suisse romande hors Jura bernois (encart d'actions commun). */
export const COOP_EPAPER_DEFAULT_EDITION = 1167;
export const COOP_EPAPER_ZONE = 'coop-romandie';

export interface PdfTextRun {
  x: number;
  /** Ordonnée depuis le haut de la page. */
  y: number;
  /** Hauteur du corps (pt). */
  h: number;
  w: number;
  str: string;
}

export interface CoopEpaperPage {
  pageNumber: number;
  url: string;
  runs: PdfTextRun[];
  /** Hauteur de la page (pt) : les doubles pages d'une même rubrique ont le même format. */
  height?: number;
  extractedAt: string;
}

export interface CoopEpaperInput {
  edition: { defId: number; publicationDate: string; edId: number | null; name: string };
  pages: CoopEpaperPage[];
}

/* ------------------------------------------------------------------ */
/* Lecture du PDF                                                      */
/* ------------------------------------------------------------------ */

/** Texte positionné d'une page PDF (pdf.js, sans service externe). */
export async function pdfTextRuns(bytes: Uint8Array): Promise<PdfTextRun[]> {
  return (await pdfPageText(bytes)).runs;
}

export async function pdfPageText(bytes: Uint8Array): Promise<{ height: number; runs: PdfTextRun[] }> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as {
    getDocument: (o: { data: Uint8Array; verbosity: number; isEvalSupported: boolean; useSystemFonts: boolean }) => {
      promise: Promise<{ getPage: (n: number) => Promise<PdfPage> }>;
      destroy: () => Promise<void>;
    };
  };
  type PdfPage = {
    getViewport: (o: { scale: number }) => { height: number };
    getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[]; width?: number }> }>;
  };
  const task = pdfjs.getDocument({ data: bytes, verbosity: 0, isEvalSupported: false, useSystemFonts: false });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const height = page.getViewport({ scale: 1 }).height;
    const content = await page.getTextContent();
    const runs: PdfTextRun[] = [];
    for (const it of content.items) {
      if (!it.str?.trim() || !it.transform) continue;
      const [, , c, d, e, f] = it.transform as [number, number, number, number, number, number];
      runs.push({ x: round(e), y: round(height - f), h: round(Math.hypot(c, d)), w: round(it.width ?? 0), str: it.str });
    }
    return { height: round(height), runs };
  } finally {
    await task.destroy();
  }
}

const round = (n: number) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ */
/* Mise en page : lignes, désignations, prix                            */
/* ------------------------------------------------------------------ */

interface Line {
  x: number;
  y: number;
  h: number;
  right: number;
  text: string;
}

/** Fusionne les fragments d'une même ligne (même hauteur de ligne, contigus). */
export function pageLines(runs: PdfTextRun[]): Line[] {
  const sorted = [...runs].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];
  for (const r of sorted) {
    const last = lines.find((l) => Math.abs(l.y - r.y) <= 1.5 && Math.abs(l.h - r.h) <= 1.5 && r.x - l.right <= 15 && r.x >= l.x);
    if (last) {
      last.text = `${last.text}${r.x - last.right > 1 ? ' ' : ''}${r.str}`.replace(/\s+/g, ' ');
      last.right = Math.max(last.right, r.x + r.w);
    } else lines.push({ x: r.x, y: r.y, h: r.h, right: r.x + r.w, text: r.str.trim() });
  }
  return lines;
}

const PRICE = /^(\d+|–|-)\.(\d{2}|–|-)$/;
/** Désignation d'article : contenance, poids variable ou vente à la pièce. */
const HAS_PACK = /\d\s*(g|kg|ml|cl|l|litres?|pièces?|rouleaux)\b|\ble kg\b|la pièce|\benv\./i;
/** Prix de référence imprimé sous le prix d'action (« au lieu de 4.95 », « Prix normal 1.20 »). */
const REFERENCE = /^(au lieu de|prix normal)\s*/i;
/** Prix unitaire imprimé à la fin d'une désignation (« (100 g = –.20) », « (1 pièce = –.04) »). */
const UNIT_HINT = /\(\s*[\d,.]+\s*(g|kg|ml|cl|litres?|l|pièces?)\s*=/;
const isSmall = (l: Line) => l.h >= 7.5 && l.h <= 10.5;

export function priceCents(text: string): number | null {
  const m = PRICE.exec(text.trim());
  if (!m) return null;
  const chf = /^\d+$/.test(m[1] as string) ? Number(m[1]) : 0;
  const ct = /^\d{2}$/.test(m[2] as string) ? Number(m[2]) : 0;
  const v = chf * 100 + ct;
  return v > 0 ? v : null;
}

interface PriceTag {
  x: number;
  y: number;
  cents: number;
  referenceCents: number | null;
  discount: string | null;
  qualifier: string | null;
  superPrix: boolean;
}

interface Description {
  x: number;
  y: number;
  right: number;
  text: string;
}

/** Désignations (petits caractères, plusieurs lignes alignées) et étiquettes de prix (gros chiffres). */
export function pageLayout(runs: PdfTextRun[]): { descriptions: Description[]; tags: PriceTag[]; text: string } {
  const lines = pageLines(runs);
  const tags: PriceTag[] = [];
  const attached = new Set<Line>();
  for (const l of lines) {
    if (l.h < 18) continue;
    const cents = priceCents(l.text);
    if (cents === null) continue;
    const near = (o: Line, dxMax: number) => Math.abs(o.x - l.x) <= dxMax;
    const ref = lines.find((o) => o.h >= 7.5 && o.h <= 14 && near(o, 14) && o.y > l.y && o.y - l.y <= 18 && REFERENCE.test(o.text));
    const qual = lines.filter((o) => o.h >= 7.5 && o.h <= 14 && near(o, 16) && o.y < l.y && l.y - o.y <= 36 && !REFERENCE.test(o.text) && o.text.length <= 30 && !o.text.includes(','));
    const disc = lines.find((o) => o.h >= 18 && /^\d{1,2}%$/.test(o.text) && Math.abs(o.x - l.x) <= 25 && o.y < l.y && l.y - o.y <= 60);
    const superPrix = lines.some((o) => /^super-?$/i.test(o.text) && Math.abs(o.x - l.x) <= 25 && o.y < l.y && l.y - o.y <= 70);
    if (ref) attached.add(ref);
    for (const q of qual) attached.add(q);
    tags.push({
      x: l.x,
      y: l.y,
      cents,
      referenceCents: ref ? priceCents(ref.text.replace(REFERENCE, '')) : null,
      discount: disc?.text ?? null,
      qualifier: qual.map((q) => q.text).join(' ') || null,
      superPrix,
    });
  }
  // Désignations : lignes en petits caractères alignées à gauche et consécutives.
  const small = lines.filter((l) => isSmall(l) && !attached.has(l)).sort((a, b) => a.y - b.y || a.x - b.x);
  const blocks: Array<Line[]> = [];
  for (const l of small) {
    const b = blocks.find((blk) => {
      const last = blk[blk.length - 1] as Line;
      return Math.abs(last.x - l.x) <= 2.5 && l.y > last.y && l.y - last.y <= 1.5 * l.h + 1;
    });
    if (b) b.push(l);
    else blocks.push([l]);
  }
  const descriptions = blocks
    .map((b) => ({ x: (b[0] as Line).x, y: (b[0] as Line).y, right: Math.max(...b.map((l) => l.right)), text: b.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim() }))
    // Le prix unitaire peut être imprimé à droite de la dernière ligne (« (100 g = 1.57) »).
    .filter((d) => !new RegExp(`^${UNIT_HINT.source}`).test(d.text));
  for (const d of descriptions) {
    const hint = lines.find((l) => isSmall(l) && !attached.has(l) && new RegExp(`^${UNIT_HINT.source}`).test(l.text) && l.x > d.x && l.x - d.right <= 20 && l.y >= d.y && l.y <= d.y + 40);
    if (hint && !d.text.includes(hint.text)) d.text = `${d.text} ${hint.text}`;
  }
  return { descriptions, tags, text: lines.map((l) => l.text).join('\n') };
}

/**
 * Rattache chaque étiquette de prix à la désignation la plus proche située en dessous (même case),
 * un pour un, de la plus proche à la plus éloignée.
 */
export function pairOffers(descriptions: Description[], tags: PriceTag[]): Array<{ description: Description; tag: PriceTag }> {
  const pairs: Array<{ d: Description; t: PriceTag; dist: number }> = [];
  for (const d of descriptions) {
    // En-têtes et mentions (« Offres sur les nouveautés valables… ») : pas de contenance, pas de prix.
    if (!HAS_PACK.test(d.text)) continue;
    const parsed = parseCoopDescription(d.text);
    for (const t of tags) {
      const dy = d.y - t.y;
      if (dy <= 0 || dy > 260) continue;
      const dx = t.x < d.x ? d.x - t.x : t.x > d.right ? t.x - d.right : 0;
      if (dx > 200) continue;
      // Prix unitaire imprimé : seul un prix concordant peut appartenir à cette désignation.
      if (parsed.unitHint && parsed.quantity && !unitHintMatches(t.cents, parsed.quantity, parsed.unitHint)) continue;
      pairs.push({ d, t, dist: dy + 0.5 * dx });
    }
  }
  pairs.sort((a, b) => a.dist - b.dist);
  const usedD = new Set<Description>();
  const usedT = new Set<PriceTag>();
  const out: Array<{ description: Description; tag: PriceTag }> = [];
  for (const p of pairs) {
    if (usedD.has(p.d) || usedT.has(p.t)) continue;
    usedD.add(p.d);
    usedT.add(p.t);
    out.push({ description: p.d, tag: p.t });
  }
  // Mise en avant (grand prix en haut de page, désignation en bas) : seulement s'il reste exactement une
  // étiquette d'action et une désignation avec contenance, l'une au-dessus de l'autre.
  const leftT = tags.filter((t) => !usedT.has(t) && (t.referenceCents !== null || t.discount !== null));
  const leftD = descriptions.filter((d) => !usedD.has(d) && HAS_PACK.test(d.text));
  if (leftT.length === 1 && leftD.length === 1 && (leftD[0] as Description).y > (leftT[0] as PriceTag).y) {
    out.push({ description: leftD[0] as Description, tag: leftT[0] as PriceTag });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Désignation : nom, origine, conditionnement, prix unitaire           */
/* ------------------------------------------------------------------ */

const COUNTRY =
  /^(Suisse|Espagne|Italie|France|Allemagne|Autriche|Pays-Bas|Belgique|Turquie|Maroc|Portugal|Grèce|Pologne|Hongrie|Irlande|Danemark|Norvège|Royaume-Uni|Afrique du Sud|Égypte|Israël|Kenya|Chili|Pérou|Brésil|Argentine|Équateur|Colombie|Costa Rica|Mexique|USA|Canada|Nouvelle-Zélande|Australie|Inde|Chine|Vietnam|Thaïlande|UE|Union européenne)(\s*\/\s*(Suisse|Espagne|Italie|France|Allemagne|Autriche|Pays-Bas|Belgique|Turquie|Maroc|Portugal|Grèce|Pologne|Hongrie|Irlande|Danemark|Norvège|Royaume-Uni|Afrique du Sud|Égypte|Israël|Kenya|Chili|Pérou|Brésil|Argentine|Équateur|Colombie|Costa Rica|Mexique|USA|Canada|Nouvelle-Zélande|Australie|Inde|Chine|Vietnam|Thaïlande|UE))*$/i;

export interface CoopDescription {
  name: string;
  origin: string | null;
  packText: string | null;
  quantity: Quantity | null;
  variableWeight: boolean;
  multipack: boolean;
  unitHint: { amount: number; unit: 'g' | 'ml' | 'piece'; cents: number } | null;
}

function hintOf(text: string): CoopDescription['unitHint'] {
  const m = /\(\s*([\d,.]+)\s*(g|kg|ml|cl|litres?|l|pièces?)\s*=\s*((?:\d+|–|-)\.(?:\d{2}|–|-))\s*\)/.exec(text);
  if (!m) return null;
  const n = Number((m[1] as string).replace(',', '.'));
  const unit = m[2] as string;
  const cents = priceCents(m[3] as string);
  if (!cents || !n) return null;
  if (/^pièce/.test(unit)) return { amount: n, unit: 'piece', cents };
  const amount = unit === 'kg' || unit === 'l' || /^litre/.test(unit) ? n * 1000 : unit === 'cl' ? n * 10 : n;
  return { amount, unit: unit === 'g' || unit === 'kg' ? 'g' : 'ml', cents };
}

/** Découpe « Pommes Gala (sauf bio), IP-Suisse, Suisse, la barquette de 750 g (100 g = –.20) ». */
export function parseCoopDescription(text: string): CoopDescription {
  const unitHint = hintOf(text);
  const clean = text
    .replace(/\s*En vente en quantité.*$/i, '')
    .replace(/\(\s*[\d,.]+\s*(g|kg|ml|cl|litres?|l|pièces?)\s*=[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Virgules hors parenthèses.
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  // Virgule décimale (« 1,5 kg ») : jamais suivie d'une espace.
  for (const [i, ch] of [...clean].entries()) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0 && !/\d/.test(clean[i + 1] ?? '')) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  let origin: string | null = null;
  let packText: string | null = null;
  let variableWeight = false;
  const nameParts: string[] = [];
  for (const p of parts) {
    if (!origin && COUNTRY.test(p)) {
      origin = p;
      continue;
    }
    if (/\ble kg\b/i.test(p) && !/\d/.test(p.replace(/\ble kg\b/i, ''))) {
      packText = '1 kg';
      variableWeight = true;
      continue;
    }
    if (/^(la|le|l')\s*pièce$/i.test(p) || /^la pièce\b/i.test(p)) {
      packText = '1 pièce';
      continue;
    }
    const q = /(?:^|\b(?:la|le|les|l')\s*(?:barquette|filet|sachet|paquet|bouteille|boîte|pot|cabas|carton|bocal|botte|bouquet|tube|brique|pack|lot)\s+de\s+)?((?:\d+\s*[×x]\s*){0,2}(?:env\.\s*)?\d+(?:[.,]\d+)?\s*(?:×|x)?\s*(?:\d+(?:[.,]\d+)?\s*)?(?:g|kg|ml|cl|l|litres?|pièces?|rouleaux)\b.*)$/i.exec(p);
    if (q && /\d/.test(p) && !packText) {
      packText = (q[1] as string).replace(/×/g, 'x').trim();
      if (/^env\./i.test(packText)) variableWeight = true;
      continue;
    }
    if (/^(en vrac|en libre-service|duo|trio|au choix)$/i.test(p)) continue;
    nameParts.push(p);
  }
  let quantity: Quantity | null = null;
  let multipack = false;
  if (packText === '1 kg') quantity = { amount: 1000, unit: 'g' };
  else if (packText === '1 pièce') quantity = { amount: 1, unit: 'piece' };
  else if (packText) {
    const pieces = /^(?:(\d+)\s*x\s*)?(\d+)\s*(?:pièces?|rouleaux)\b/i.exec(packText);
    const nested = /^(\d+)\s*x\s*(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|cl|l)\b/i.exec(packText);
    if (nested) {
      const inner = parsePackText(`${nested[3]} ${nested[4]}`);
      if (inner) {
        quantity = { amount: Number(nested[1]) * Number(nested[2]) * inner.quantity.amount, unit: inner.quantity.unit };
        multipack = true;
      }
    } else if (pieces) {
      quantity = { amount: Number(pieces[1] ?? 1) * Number(pieces[2]), unit: 'piece' };
      multipack = Boolean(pieces[1]);
    } else {
      const pack = parsePackText(packText.replace(/^env\.\s*/i, ''));
      if (pack && !pack.ambiguous) {
        quantity = pack.quantity;
        multipack = /\dx\s*\d|\d\s*x\s*\d/i.test(packText);
      }
    }
  }
  return { name: nameParts.join(', ').trim(), origin, packText, quantity, variableWeight, multipack, unitHint };
}

/** Prix unitaire imprimé concordant avec le prix et la contenance (à 1 centime ou 1 % près). */
export function unitHintMatches(cents: number, quantity: Quantity, hint: NonNullable<CoopDescription['unitHint']>): boolean {
  if (quantity.unit !== hint.unit || quantity.amount <= 0) return false;
  const expected = (cents * hint.amount) / quantity.amount;
  return Math.abs(expected - hint.cents) <= Math.max(1, hint.cents * 0.01);
}

const WEEKDAY = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/**
 * « 1.10 - 7.10.2026 », « Du jeudi 1.10 au mercredi 7.10.2026 » ; année de début déduite
 * (décembre → janvier). Fin seule (« valables jusqu’au mercredi 14 octobre 2026 ») : `from` null.
 */
export function parseCoopPeriod(text: string): { from: string | null; to: string } | null {
  const m = new RegExp(`(\\d{1,2})\\.(\\d{1,2})\\.?(\\d{4})?\\s*(?:[-–]|au\\s+(?:${WEEKDAY}\\s+)?)\\s*(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})`, 'i').exec(text);
  if (!m) {
    const u = new RegExp(`jusqu[’']au\\s+(?:${WEEKDAY}\\s+)?(\\d{1,2})(?:er)?\\s+(${MONTHS.join('|')})\\s+(\\d{4})`, 'i').exec(text);
    if (!u) return null;
    const month = MONTHS.indexOf((u[2] as string).toLowerCase()) + 1;
    return { from: null, to: `${u[3]}-${String(month).padStart(2, '0')}-${String(Number(u[1])).padStart(2, '0')}` };
  }
  const [d1, m1, y1, d2, m2, y2] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((v) => (v ? Number(v) : null)) as Array<number | null>;
  const toYear = y2 as number;
  const fromYear = y1 ?? ((m1 as number) > (m2 as number) ? toYear - 1 : toYear);
  const iso = (y: number, mo: number, d: number) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { from: iso(fromYear, m1 as number, d1 as number), to: iso(toYear, m2 as number, d2 as number) };
}

/** Code régional imprimé en pied de page (« SR », « BE f ») : l'édition lue, jamais toute la Suisse. */
export function regionCode(runs: PdfTextRun[]): string | null {
  const r = runs.find((x) => x.h <= 7.5 && /^[A-Z]{2}(?:\/[A-Z]{2})*(?:\s+[dfi])?$/.test(x.str.trim()));
  return r ? r.str.trim() : null;
}

/** Page d'actions réservées à certains magasins (« Les actions hypermarché », liste de succursales). */
export function storeRestricted(text: string): boolean {
  return /hypermarch|uniquement dans les (?:magasins|succursales)|dans les magasins suivants/i.test(text);
}

/* ------------------------------------------------------------------ */
/* Lot                                                                 */
/* ------------------------------------------------------------------ */

export type CoopOffer =
  | { skip: string; text?: string }
  | { product: RetailerProduct; promoCents: number; referenceCents: number | null; label: string | null; perHundredGrams: boolean };

export function coopOffer(description: Description, tag: PriceTag, pageUrl: string): CoopOffer {
  const text = description.text;
  if (/^p\.\s*ex\./i.test(text) || /\bau choix\b|\bsur tous\b|\bassortiment\b/i.test(text)) return { skip: 'offre sur un assortiment', text };
  if (tag.qualifier && /à partir de|dès \d|\bpar \d/i.test(tag.qualifier)) return { skip: 'offre conditionnelle', text };
  if (tag.qualifier && /cabas/i.test(tag.qualifier)) return { skip: 'assortiment au choix', text };
  if (/coop ne vend pas|sous réserve/i.test(text)) return { skip: 'mention légale', text };
  if (/\d+\s*ans? de garantie|\d+\s*W\b|appareil|four à raclette|dentifrice|lingettes|papier hygiénique|essuie-tout|lessive|shampooing|caquelon|poêle|théière|pichet/i.test(text)) {
    return { skip: 'non alimentaire', text };
  }
  if (!tag.referenceCents && !tag.discount && !tag.superPrix) return { skip: 'prix sans mention d’action', text };
  const d = parseCoopDescription(text);
  if (!d.name) return { skip: 'désignation illisible', text };
  const perHundredGrams = Boolean(tag.qualifier && /les 100 g/i.test(tag.qualifier));
  let quantity = d.quantity;
  if (perHundredGrams) quantity = { amount: 100, unit: 'g' };
  if (!quantity) return { skip: 'contenance inconnue', text };
  // Pièce de poids variable (« env. 550 g ») : prix aux 100 g attendu ; sans cette mention, rien n'est deviné.
  if (!perHundredGrams && /\benv\./i.test(d.packText ?? '') && !d.unitHint) return { skip: 'poids variable sans prix aux 100 g', text };
  if (!perHundredGrams) {
    if (d.unitHint) {
      if (!unitHintMatches(tag.cents, quantity, d.unitHint)) return { skip: 'prix non apparié (prix unitaire discordant)', text };
    } else if (!d.variableWeight && quantity.unit !== 'piece' && quantity.amount !== 1000) {
      // 1 kg ou 1 litre : le prix est lui-même le prix unitaire, aucun prix unitaire n'est imprimé.
      return { skip: 'contrôle impossible (prix unitaire non imprimé)', text };
    }
  }
  if (tag.referenceCents !== null && tag.referenceCents <= tag.cents) return { skip: 'prix « au lieu de » incohérent', text };
  const name = d.origin ? `${d.name}, ${d.origin}` : d.name;
  const key = `${d.name.toLowerCase()}|${(d.packText ?? '').toLowerCase()}|${perHundredGrams ? '100g' : ''}`;
  const sku = `ep-${createHash('sha1').update(key).digest('hex').slice(0, 12)}`;
  // Appellations d'origine protégées suisses : origine suisse par définition légale.
  const swissAop = /gruy[èe]re|emmentaler|sbrinz|t[êe]te de moine|vacherin fribourgeois|raclette du valais/i.test(d.name) && /\bAOP\b/.test(d.name);
  const swissOrigin = (d.origin !== null && /^suisse$/i.test(d.origin)) || /\bIP-Suisse\b|Suisse Garantie/i.test(d.name) || swissAop;
  const organic = /\bbio\b|naturaplan/i.test(d.name.replace(/\(sauf[^)]*\)/gi, ''));
  const labels = [...labelsFromName(d.name, false), ...(d.variableWeight || perHundredGrams ? [VARIABLE_WEIGHT_LABEL] : [])];
  return {
    product: {
      id: `coop:${sku}`,
      chainId: 'coop',
      connectorId: COOP_EPAPER_CONNECTOR_ID,
      sku,
      gtin: null,
      name: `${name}${d.packText && !perHundredGrams ? ` (${d.packText})` : ''}`,
      brand: /\bCoop\b/.test(d.name) ? 'Coop' : null,
      quantity,
      attributes: { organic, swissOrigin, labels },
      url: pageUrl,
      isDemo: false,
    },
    promoCents: tag.cents,
    referenceCents: tag.referenceCents,
      label: [tag.superPrix ? 'Super-prix' : null, tag.qualifier && /lancement/i.test(tag.qualifier) ? 'Prix de lancement' : null, tag.discount].filter(Boolean).join(' ') || null,
    perHundredGrams,
  };
}

export function buildCoopEpaperBatch(input: CoopEpaperInput, ctx: Pick<ConnectorContext, 'now' | 'catalog' | 'reviewedMatches'>, zoneId = COOP_EPAPER_ZONE): ConnectorBatch {
  const report = emptyReport();
  const today = zurichToday(ctx.now);
  const products = new Map<string, RetailerProduct>();
  const promotions = new Map<string, Promotion>();
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);
  // Période du prospectus : couverture (ou première page qui la mentionne en entier) ; une page peut
  // avoir la sienne (nouveautés « valables jusqu’au … », week-end).
  let brochurePeriod: { from: string; to: string } | null = null;
  const layouts = input.pages.map((p) => ({ page: p, layout: pageLayout(p.runs), region: regionCode(p.runs) }));
  for (const { layout } of layouts) {
    const p = parseCoopPeriod(layout.text);
    if (!brochurePeriod && p?.from) brochurePeriod = { from: p.from, to: p.to };
  }
  const region = layouts.find((l) => l.region)?.region ?? null;
  const restricted = new Set(layouts.filter((l) => storeRestricted(l.layout.text)).map((l) => l.page.pageNumber));
  for (const l of layouts) {
    const twin = layouts.find((o) => restricted.has(o.page.pageNumber) && Math.abs(o.page.pageNumber - l.page.pageNumber) === 1);
    if (twin && l.page.height && twin.page.height && Math.abs(l.page.height - twin.page.height) < 5) restricted.add(l.page.pageNumber);
  }
  const whileStocks = layouts.some((l) => /limite des stocks/i.test(l.layout.text));
  let pairsTotal = 0;
  for (const { page, layout } of layouts) {
    const own = parseCoopPeriod(layout.text);
    const from = own?.from ?? brochurePeriod?.from ?? null;
    const to = own?.to ?? brochurePeriod?.to ?? null;
    if (!from || !to) {
      skip('page sans dates de validité');
      continue;
    }
    const period = { from, to };
    if (restricted.has(page.pageNumber)) {
      skip('pages d’actions réservées à certains magasins');
      continue;
    }
    if (period.to < today) {
      skip('action expirée');
      continue;
    }
    const pairs = pairOffers(layout.descriptions, layout.tags);
    pairsTotal += pairs.length;
    skipped['étiquettes sans désignation'] = (skipped['étiquettes sans désignation'] ?? 0) + (layout.tags.length - pairs.length);
    for (const { description, tag } of pairs) {
      const o = coopOffer(description, tag, page.url);
      if ('skip' in o) {
        skip(o.skip);
        continue;
      }
      const p = o.product;
      if (!products.has(p.id)) products.set(p.id, p);
      promotions.set(`${p.id}:${period.from}`, {
        id: `${COOP_EPAPER_CONNECTOR_ID}:${p.sku}:${period.from}`,
        retailerProductId: p.id,
        chainId: 'coop',
        zoneId,
        storeId: null,
        type: 'price',
        promoPriceCents: o.promoCents,
        referencePriceCents: o.referenceCents,
        loyaltyProgram: null,
        whileStocksLast: whileStocks,
        endIsPresumed: false,
        label: o.label,
        regionNote: `Coopération, édition ${input.edition.defId}${region ? ` (${region})` : ''}`,
        sourceUrl: `${COOP_EPAPER_ORIGIN}/editions/${input.edition.defId}/${input.edition.publicationDate}?page=${page.pageNumber}`,
        publishedAt: `${input.edition.publicationDate}T00:00:00.000Z`,
        validFrom: period.from,
        validTo: period.to,
        source: { connectorId: COOP_EPAPER_CONNECTOR_ID, kind: 'retailer_site', ref: page.url },
        verifiedAt: page.extractedAt,
        isDemo: false,
      });
    }
  }
  const retailerProducts = [...products.values()];
  const { matches, reviewedCount } = matchesFor(retailerProducts, ctx.catalog ?? PRODUCTS, ctx.reviewedMatches);
  report.accepted = { products: retailerProducts.length, prices: 0, promotions: promotions.size, matches: matches.length };
  report.metrics = {
    pages: input.pages.length,
    pairs: pairsTotal,
    edition: input.edition.defId,
    region: region ?? 'inconnue',
    periodFrom: brochurePeriod?.from ?? 'inconnue',
    periodTo: brochurePeriod?.to ?? 'inconnue',
    reviewedProducts: reviewedCount,
    ...Object.fromEntries(Object.entries(skipped).filter(([, v]) => v > 0).map(([k, v]) => [`skipped: ${k}`, v])),
  };
  return { connectorId: COOP_EPAPER_CONNECTOR_ID, retailerProducts, matches, prices: [], promotions: [...promotions.values()], report };
}

/* ------------------------------------------------------------------ */
/* Connecteur                                                          */
/* ------------------------------------------------------------------ */

interface EpaperEditionList {
  data?: Array<{ pages?: Array<{ edId?: number; publicationDate?: string }>; inlays?: Array<{ editionDefId: number; name: string; publicationDate: string; pages?: Array<{ edId?: number }> }> }>;
}
interface EpaperPages {
  data?: { pages?: Array<{ pmPageNumber: number; pageDocUrl?: { HIGHRES?: { url?: string; type?: string } } }> };
}

const PAGE_CACHE_MS = 21 * 86_400_000;

export class CoopEpaperConnector implements PriceConnector {
  readonly id = COOP_EPAPER_CONNECTOR_ID;
  readonly label = 'Coop — magazine des actions du journal numérique officiel (Coopération), usage privé';
  readonly chainIds = ['coop'];
  readonly sourceKind = 'retailer_site' as const;

  async status(ctx: Pick<ConnectorContext, 'env'>): Promise<ConnectorStatus> {
    if (ctx.env?.COOP_EPAPER === 'off') return { state: 'disabled', message: 'Désactivé (COOP_EPAPER=off)' };
    return { state: 'ready', message: 'Journal numérique public (actions de la semaine, édition romande)' };
  }

  async run(ctx: ConnectorContext): Promise<ConnectorBatch> {
    const fetcher = requireFetcher(ctx);
    const defId = Number(ctx.env?.COOP_EPAPER_EDITION ?? COOP_EPAPER_DEFAULT_EDITION);
    const today = zurichToday(ctx.now);
    // Session anonyme ouverte par la page d'accueil (connexion automatique du journal, sans compte) :
    // sans elle, les encarts ne sont pas servis.
    await fetcher.get(`${COOP_EPAPER_ORIGIN}/`);
    const list = JSON.parse(
      (await fetcher.post(`${COOP_EPAPER_ORIGIN}/epaper/1.0/findEditionsFromDateWithInlays`, JSON.stringify({ editions: [{ publicationDate: today, defId }], startDate: today, maxHits: 1 }))).body,
    ) as EpaperEditionList;
    const latest = list.data?.[0];
    const inlay = latest?.inlays?.find((i) => /actions/i.test(i.name));
    if (!latest || !inlay) throw new Error(`Aucun magazine des actions dans l'édition ${defId} au ${today} (structure modifiée ?)`);
    const edId = inlay.pages?.[0]?.edId ?? null;
    const edition = { defId: inlay.editionDefId, publicationDate: inlay.publicationDate, edId, name: inlay.name };
    const key = (n: number | string) => `${COOP_EPAPER_CONNECTOR_ID}:${edition.defId}:${edition.publicationDate}:${edId ?? ''}:${n}`;

    const pages: CoopEpaperPage[] = [];
    let pageCount = await fetcher.cacheRead<number>(key('pages'), PAGE_CACHE_MS);
    const cached = new Map<number, CoopEpaperPage>();
    if (pageCount) {
      for (let n = 1; n <= pageCount; n++) {
        const p = await fetcher.cacheRead<CoopEpaperPage>(key(n), PAGE_CACHE_MS);
        if (p) cached.set(n, p);
      }
    }
    const failures: string[] = [];
    let downloaded = 0;
    if (!pageCount || cached.size < pageCount) {
      const meta = JSON.parse(
        (await fetcher.post(`${COOP_EPAPER_ORIGIN}/epaper/1.0/getPages`, JSON.stringify({ editions: [{ defId: edition.defId, publicationDate: edition.publicationDate }] }))).body,
      ) as EpaperPages;
      const list = (meta.data?.pages ?? []).filter((p) => p.pageDocUrl?.HIGHRES?.url && p.pageDocUrl.HIGHRES.type === 'pdf');
      if (!list.length) throw new Error('Pages du magazine des actions introuvables (structure modifiée ?)');
      pageCount = list.length;
      await fetcher.cacheWrite(key('pages'), pageCount);
      for (const p of list) {
        if (cached.has(p.pmPageNumber)) continue;
        try {
          // Page servie par l'hébergeur de fichiers du journal (adresse signée fournie par l'éditeur).
          const r = await fetcher.getBinary(p.pageDocUrl?.HIGHRES?.url as string, 'application/pdf', COOP_EPAPER_ORIGIN);
          const text = await pdfPageText(r.bytes as Uint8Array);
          const page: CoopEpaperPage = { pageNumber: p.pmPageNumber, url: `${COOP_EPAPER_ORIGIN}/editions/${edition.defId}/${edition.publicationDate}?page=${p.pmPageNumber}`, runs: text.runs, height: text.height, extractedAt: r.fetchedAt.toISOString() };
          await fetcher.cacheWrite(key(p.pmPageNumber), page);
          cached.set(p.pmPageNumber, page);
          downloaded++;
        } catch (e) {
          failures.push(`page ${p.pmPageNumber} : ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    pages.push(...[...cached.values()].sort((a, b) => a.pageNumber - b.pageNumber));
    if (!pages.length) throw new Error(`Aucune page lisible (${failures.join(' ; ')})`);
    const batch = buildCoopEpaperBatch({ edition, pages }, ctx);
    for (const f of failures) batch.report.warnings.push({ message: f });
    batch.report.metrics = { ...batch.report.metrics, pageFailures: failures.length, pagesDownloaded: downloaded, pagesFromCache: pages.length - downloaded };
    ctx.log.info('Coop (journal numérique) : collecte terminée', batch.report.metrics);
    return batch;
  }
}
