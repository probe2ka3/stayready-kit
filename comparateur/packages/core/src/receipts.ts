import type { ChainId, PriceObservation } from './types';

/**
 * « Scanner mon ticket » (docs/TICKETS.md) : lecture d'un ticket de caisse, suppression des
 * informations personnelles et transformation en relevés de prix anonymes.
 *
 * Principes :
 * - le texte est extrait sur l'appareil (reconnaissance de caractères locale) ; la photo ne quitte
 *   pas le téléphone et n'est jamais conservée ;
 * - seules les lignes d'articles (désignation, quantité, prix), l'enseigne, la succursale et la date
 *   sont retenues ; carte bancaire, carte de fidélité, caissier, heure, numéros de transaction,
 *   courriel et téléphone sont supprimés avant tout envoi ;
 * - une fois vérifiés, les prix deviennent des observations indépendantes, sans lien entre elles ni
 *   avec la personne : le contenu d'un panier n'est jamais conservé ni revendu.
 */

export interface ReceiptLine {
  /** Désignation telle qu'imprimée (après nettoyage). */
  label: string;
  quantity: number;
  /** Prix unitaire imprimé (centimes), sinon total ÷ quantité. */
  unitPriceCents: number;
  totalCents: number;
  /** Remise ou action imprimée sous l'article (centimes, positive). */
  discountCents: number;
  /** Ligne au poids (« 0.534 kg x 3.50 »). */
  weighed: boolean;
}

export interface ParsedReceipt {
  chainId: ChainId | null;
  /** Date d'achat (AAAA-MM-JJ) ; l'heure n'est jamais conservée. */
  purchaseDate: string | null;
  /** Localité ou succursale imprimée en en-tête (information de magasin, non personnelle). */
  storeHint: string | null;
  lines: ReceiptLine[];
  totalCents: number | null;
  /** Nombre d'éléments personnels supprimés, par type (contrôle, jamais le contenu). */
  removed: Record<string, number>;
}

export type ReceiptStatus = 'extracted' | 'submitted' | 'reviewed' | 'published' | 'rejected';

/** Enregistrement transmis au serveur (après nettoyage et accord explicite de la personne). */
export interface ReceiptSubmission {
  id: string;
  status: ReceiptStatus;
  chainId: ChainId;
  storeId: string | null;
  purchaseDate: string;
  lines: Array<Pick<ReceiptLine, 'label' | 'quantity' | 'unitPriceCents' | 'discountCents' | 'weighed'>>;
  /** Jeton anonyme de dépôt (limitation d'abus) ; aucun compte, aucune adresse, aucune position. */
  submittedAt: string;
}

const CHAIN_MARKERS: Array<[ChainId, RegExp]> = [
  ['migros', /\bmigros\b/i],
  ['coop', /\bcoop\b/i],
  ['denner', /\bdenner\b/i],
  ['lidl', /\blidl\b/i],
  ['aldi', /\baldi\b/i],
  ['ottos', /\botto'?s\b/i],
  ['aligro', /\baligro\b/i],
  ['action', /\baction\b/i],
];

/** Motifs d'informations personnelles supprimées avant tout traitement. */
const PII: Array<[string, RegExp]> = [
  ['carte_fidelite', /\b(cumulus|supercard|lidl\s*plus|club)\b[^\n]{0,20}?\d[\d\s]{5,}/gi],
  ['iban', /\bCH\d{2}(?:\s?[0-9A-Z]{4}){4}\s?[0-9A-Z]{1}\b/gi],
  ['carte_bancaire', /\b(?:\d[ -]?){13,19}\b|\b(?:x{2,}|\*{2,})[ -]?\d{4}\b/gi],
  ['courriel', /[\w.+-]+@[\w-]+\.[\w.]+/g],
  ['telephone', /(?:\+41|0041|\b0)\s?\d{2}[\s.]?\d{3}[\s.]?\d{2}[\s.]?\d{2}\b/g],
  ['personnel', /\b(caissi[eè]re?|kassier(?:in)?|bedient von|servi par|cassiere|cassiera|ihr[e]? verk[aä]ufer(?:in)?)\b[^\n]*/gi],
  ['transaction', /\b(trx|trm|terminal|transaktion|transaction|aid|auth(?:\.|orisation)?|autorisierung|beleg|ref)\b[\s.:#-]*[\w-]{3,}/gi],
  // Heure (« 12:34 », « 12h34 ») ; jamais « 1.50 », qui est un prix.
  ['heure', /\b([01]?\d|2[0-3])[:h][0-5]\d(?::[0-5]\d)?\b/g],
];

/** Supprime les informations personnelles d'un texte de ticket. */
export function scrubReceiptText(text: string): { text: string; removed: Record<string, number> } {
  const removed: Record<string, number> = {};
  let out = text;
  for (const [kind, re] of PII) {
    out = out.replace(re, () => {
      removed[kind] = (removed[kind] ?? 0) + 1;
      return ' ';
    });
  }
  return { text: out.replace(/[ \t]+/g, ' '), removed };
}

function cents(s: string): number {
  return Math.round(Number(s.replace(',', '.').replace(/[’']/g, '')) * 100);
}

const DATE = /\b(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})\b/;
const TOTAL = /\b(total|totale|summe|gesamt|à payer|a payer|zu bezahlen|chf total)\b[^\d-]*(\d+[.,]\d{2})/i;
const SKIP = /\b(total|totale|summe|gesamt|mwst|tva|iva|rabatt total|bar|cash|twint|karte|carte|visa|mastercard|maestro|postfinance|rückgeld|rendu|change|zwischensumme|sous-total|anzahl artikel|nombre d'articles|merci|danke|grazie)\b/i;
/** « 2 x 1.95 » ou « 0.534 kg x 3.50 » */
const QTY = /(\d+(?:[.,]\d+)?)\s*(kg)?\s*[x×*]\s*(\d+[.,]\d{2})/i;
/** Prix en fin de ligne, éventuellement suivi d'un code TVA (« 3.90 A », « 3.90 1 »). */
const LINE_PRICE = /(-?\d+[.,]\d{2})\s*(?:[A-D]|[0-9]|\*)?\s*$/;
const DISCOUNT = /^(?:.*\b(aktion|action|rabatt|rabais|réduction|reduktion|sconto)\b.*|\s*)(-\d+[.,]\d{2})\s*(?:[A-D]|[0-9])?\s*$/i;

/**
 * Analyse le texte d'un ticket (sortie de reconnaissance de caractères ou texte collé).
 * Tolérant : une ligne illisible est ignorée, jamais inventée.
 */
export function parseReceiptText(raw: string): ParsedReceipt {
  const { text, removed } = scrubReceiptText(raw);
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let chainId: ChainId | null = null;
  for (const [id, re] of CHAIN_MARKERS) {
    if (rows.slice(0, 8).some((r) => re.test(r))) {
      chainId = id;
      break;
    }
  }
  let purchaseDate: string | null = null;
  for (const r of rows) {
    const m = DATE.exec(r);
    if (!m) continue;
    const y = (m[3] as string).length === 2 ? `20${m[3]}` : (m[3] as string);
    const mo = Number(m[2]);
    const d = Number(m[1]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      purchaseDate = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      break;
    }
  }
  const header = rows.slice(0, 6).find((r) => !CHAIN_MARKERS.some(([, re]) => re.test(r)) && /^[A-Za-zÀ-ÿ' -]{3,40}$/.test(r) && !SKIP.test(r));
  const lines: ReceiptLine[] = [];
  let totalCents: number | null = null;
  let pendingQty: { qty: number; unit: number; weighed: boolean } | null = null;
  for (const r of rows) {
    const t = TOTAL.exec(r);
    if (t) {
      totalCents = cents(t[2] as string);
      continue;
    }
    const disc = DISCOUNT.exec(r);
    if (disc && lines.length) {
      const last = lines[lines.length - 1] as ReceiptLine;
      last.discountCents += Math.abs(cents(disc[2] as string));
      continue;
    }
    if (SKIP.test(r) || DATE.test(r)) continue;
    const q = QTY.exec(r);
    const p = LINE_PRICE.exec(r);
    // Ligne ne contenant que « 2 x 0.95 » (éventuellement suivie d'un code TVA).
    const qtyOnly = q !== null && r.slice(0, q.index).trim() === '' && /^\s*[A-D]?\s*$/.test(r.slice(q.index + q[0].length));
    if (q && (qtyOnly || !p)) {
      // Quantité imprimée seule : sous l'article (Migros) si elle en explique le total, sinon au-dessus.
      const qty = Number((q[1] as string).replace(',', '.'));
      const unit = cents(q[3] as string);
      const last = lines[lines.length - 1];
      if (last && last.quantity === 1 && Math.abs(last.totalCents - Math.round(qty * unit)) <= 1) {
        last.quantity = q[2] ? 1 : qty;
        last.unitPriceCents = unit;
        last.weighed = Boolean(q[2]);
      } else {
        pendingQty = { qty, unit, weighed: Boolean(q[2]) };
      }
      continue;
    }
    if (!p) continue;
    const total = cents(p[1] as string);
    if (total <= 0) continue;
    let label = r.slice(0, p.index).replace(QTY, '').replace(/\s{2,}/g, ' ').trim();
    label = label.replace(/\s+\d+$/, '').trim();
    if (label.length < 2 || !/[A-Za-zÀ-ÿ]{2}/.test(label)) continue;
    const qm = q ?? null;
    const qty = qm ? Number((qm[1] as string).replace(',', '.')) : (pendingQty?.qty ?? 1);
    const weighed = qm ? Boolean(qm[2]) : (pendingQty?.weighed ?? false);
    const unit = qm ? cents(qm[3] as string) : (pendingQty?.unit ?? (qty > 0 && !weighed ? Math.round(total / qty) : total));
    pendingQty = null;
    lines.push({ label, quantity: weighed ? 1 : qty, unitPriceCents: unit, totalCents: total, discountCents: 0, weighed });
  }
  return { chainId, purchaseDate, storeHint: header ?? null, lines, totalCents, removed };
}

/**
 * Relevés anonymes issus d'un ticket vérifié : un prix par article rapproché, prix payé hors remise
 * (prix affiché en rayon), à midi du jour d'achat (l'heure réelle n'est pas conservée), sans
 * identifiant de ticket.
 */
export function receiptObservations(
  sub: ReceiptSubmission,
  matchedProductIds: Array<string | null>,
  opts: { observedAtPlace?: string | null; zoneId?: string | null } = {},
): PriceObservation[] {
  const out: PriceObservation[] = [];
  sub.lines.forEach((l, i) => {
    const rp = matchedProductIds[i];
    if (!rp || l.weighed || l.unitPriceCents <= 0) return;
    out.push({
      id: `receipts:${rp}:${sub.storeId ?? 'ch'}:${sub.purchaseDate}`,
      retailerProductId: rp,
      zoneId: opts.zoneId ?? null,
      storeId: sub.storeId,
      priceCents: l.unitPriceCents,
      observedAt: `${sub.purchaseDate}T10:00:00.000Z`,
      source: { connectorId: 'receipts', kind: 'receipt', ref: null },
      isDemo: false,
      // Prix imprimé avant la remise éventuelle (ligne séparée) : prix affiché en rayon.
      priceType: 'regular',
      channel: 'store',
      reliability: 'crowd',
      license: null,
      sourceUrl: null,
      observedAtPlace: opts.observedAtPlace ?? null,
      proof: 'receipt',
    });
  });
  return out;
}
