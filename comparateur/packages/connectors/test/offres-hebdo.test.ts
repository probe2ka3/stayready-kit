import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildOfferIndex,
  DEFAULT_FRESHNESS,
  DEFAULT_PREFS,
  resolveLine,
  type PriceObservation,
  type PricingContext,
  type Promotion,
  type RetailerProduct,
} from '@cabas/core';
import { PRODUCTS } from '@cabas/reference';
import { buildLidlBatch, evaluateOfferRules, matchesFor, offerDesignation, parseProductPage, readReviewedMatches, type OfferRule, type ReviewedMatch } from '../src';

/**
 * Offres hebdomadaires Lidl reliées par les règles revues (data/matching/reviewed.json, `offerRules`) :
 * correspondance justifiée par la désignation, la variante, la contenance, l'unité et le statut bio,
 * jamais par le seul nom générique ou l'identifiant de la semaine ; une offre reliée ne vaut que par
 * ses propres promotions (dates, carte, région), jamais prolongée par son prix « au lieu de ».
 */

const dataDir = join(__dirname, '..', '..', '..', 'data');
const NOW = new Date('2026-10-03T06:00:00Z');
const oranges = PRODUCTS.find((p) => p.slug === 'oranges-2kg')!;

const offer = (erp: string, name: string, amount: number, unit: 'g' | 'ml' | 'piece' = 'g', extra: Partial<RetailerProduct> = {}): RetailerProduct => ({
  id: `lidl:offer-${erp}`,
  chainId: 'lidl',
  connectorId: 'lidl-web',
  sku: `offer-${erp}`,
  name,
  quantity: { amount, unit },
  attributes: {},
  isDemo: false,
  ...extra,
});

const regular = (id: string, name: string, amount: number): RetailerProduct => ({
  id: `lidl:${id}`,
  chainId: 'lidl',
  connectorId: 'lidl-web',
  sku: id,
  name,
  quantity: { amount, unit: 'g' },
  attributes: {},
  isDemo: false,
});

const LIDL = { connectorId: 'lidl-web', kind: 'retailer_site' as const, ref: 'https://www.lidl.ch/' };
const obs = (productId: string, cents: number): PriceObservation => ({
  id: `o-${productId}`,
  retailerProductId: productId,
  zoneId: null,
  storeId: null,
  priceCents: cents,
  observedAt: '2026-10-03T05:00:00Z',
  source: LIDL,
  isDemo: false,
  reliability: 'official',
});
const promo = (productId: string, extra: Partial<Promotion>): Promotion => ({
  id: `p-${productId}-${extra.loyaltyProgram ?? 'all'}`,
  retailerProductId: productId,
  chainId: 'lidl',
  zoneId: null,
  storeId: null,
  type: 'price',
  whileStocksLast: false,
  publishedAt: '2026-09-29T06:00:00Z',
  validFrom: '2026-10-01',
  validTo: '2026-10-07',
  source: LIDL,
  verifiedAt: '2026-10-03T05:00:00Z',
  isDemo: false,
  ...extra,
});

const ctx = (targetDate: string, loyaltyPrograms: string[] = []): PricingContext => ({
  asOf: NOW,
  today: '2026-10-03',
  targetDate,
  policy: DEFAULT_FRESHNESS,
  prefs: { ...DEFAULT_PREFS, loyaltyPrograms },
});
const LIDL_PROFILE = { key: 'lidl|*|*', chainId: 'lidl', zoneId: null, storeId: null };

async function rules(): Promise<{ reviewed: ReviewedMatch[]; offerRules: OfferRule[] }> {
  const reviewed = await readReviewedMatches(dataDir);
  return { reviewed, offerRules: reviewed.flatMap((r) => (r.offerRule ? [r.offerRule] : [])) };
}

describe('règles revues des offres hebdomadaires', () => {
  it('désignation comparable : sans marque en capitales, sans « pack de N », sans accents', () => {
    expect(offerDesignation('QUALITÉ SUISSE Poires suisses')).toBe('poires suisses');
    expect(offerDesignation('VITA D’OR Huile de colza')).toBe('huile de colza');
    expect(offerDesignation('EMMI Mozzarella, pack de 3')).toBe('mozzarella');
    expect(offerDesignation('Oranges')).toBe('oranges');
  });

  it('chaque règle cite un besoin du catalogue, une justification et un relecteur', async () => {
    const { offerRules } = await rules();
    expect(offerRules.length).toBeGreaterThan(0);
    const slugs = new Set(PRODUCTS.map((p) => p.slug));
    for (const r of offerRules) {
      expect(slugs.has(r.canonicalSlug), r.id).toBe(true);
      expect(r.justification.length, r.id).toBeGreaterThan(20);
      expect(r.reviewer && r.reviewedAt, r.id).toBeTruthy();
    }
    expect(new Set(offerRules.map((r) => r.id)).size).toBe(offerRules.length);
  });

  it('oranges en sachet de 1 kg : reliées au besoin de 2 kg (autre conditionnement)', async () => {
    const { offerRules } = await rules();
    const out = evaluateOfferRules(offer('10059701', 'Oranges', 1000), offerRules, PRODUCTS);
    expect(out).toMatchObject({ status: 'linked', canonical: { slug: 'oranges-2kg' }, kind: 'similar', rule: { id: 'lidl-oranges' } });
  });

  it('produit incompatible : variante exclue, bio, pièces, contenance non admise, variante inconnue → « à vérifier »', async () => {
    const { offerRules } = await rules();
    const reason = (p: RetailerProduct) => {
      const out = evaluateOfferRules(p, offerRules, PRODUCTS);
      expect(out?.status, p.name).toBe('to_review');
      return out && out.status === 'to_review' ? out.reason : '';
    };
    expect(reason(offer('1', 'Oranges', 1000, 'g', { details: 'Oranges sanguines, Italie' }))).toMatch(/sanguin/);
    expect(reason(offer('2', 'Oranges', 1000, 'g', { attributes: { organic: true } }))).toMatch(/bio/);
    // Citrons à la pièce : aucune conversion en grammes sans poids documenté.
    expect(reason(offer('3', 'Citrons', 1, 'piece'))).toMatch(/aucune conversion sans poids documenté/);
    expect(reason(offer('4', 'Oranges', 1500))).toMatch(/contenance 1500 g non admise/);
    expect(reason(offer('5', 'MARIBEL Confiture bio', 240, 'g', { details: 'Diverses sortes' }))).toMatch(/diverses sortes/);
  });

  it('nom générique d’une autre enseigne ou désignation inconnue : aucune règle', async () => {
    const { offerRules } = await rules();
    expect(evaluateOfferRules({ ...offer('6', 'Oranges', 1000), chainId: 'aldi' }, offerRules, PRODUCTS)).toBeNull();
    expect(evaluateOfferRules(offer('7', 'Oranges à presser', 2000), offerRules, PRODUCTS)).toBeNull();
  });

  it('matchesFor : reliée → validée (promotions seulement) ; à vérifier → suggestion ; décision par identifiant prioritaire', async () => {
    const { reviewed } = await rules();
    const products = [offer('10059701', 'Oranges', 1000), offer('10059586', 'Citrons', 1, 'piece'), offer('10059999', 'Oranges', 1000)];
    const refusal: ReviewedMatch = { retailerProductId: 'lidl:offer-10059999', canonicalSlug: null, reviewer: 'test', reviewedAt: '2026-10-03' };
    const { matches } = matchesFor(products, PRODUCTS, [...reviewed, refusal]);
    expect(matches.find((m) => m.retailerProductId === 'lidl:offer-10059701')).toMatchObject({
      canonicalId: oranges.id,
      status: 'validated',
      kind: 'similar',
      ruleId: 'lidl-oranges',
      promotionsOnly: true,
    });
    expect(matches.find((m) => m.retailerProductId === 'lidl:offer-10059586')).toMatchObject({ status: 'suggested', ruleId: 'lidl-citrons' });
    expect(matches.filter((m) => m.retailerProductId === 'lidl:offer-10059999' && m.status === 'validated')).toHaveLength(0);
  });

  it('offre hebdomadaire validée par identifiant : promotions seulement (jamais prolongée par son « au lieu de »)', () => {
    const p = offer('10059585', 'QUALITÉ SUISSE Pommes rouges suisses', 1000);
    const byId: ReviewedMatch = { retailerProductId: p.id, canonicalSlug: 'pommes-gala-1kg', reviewer: 'test', reviewedAt: '2026-09-28' };
    const { matches } = matchesFor([p, regular('100300', 'Pommes Gala', 1000)], PRODUCTS, [byId, { ...byId, retailerProductId: 'lidl:100300' }]);
    expect(matches.find((m) => m.retailerProductId === p.id)).toMatchObject({ status: 'validated', promotionsOnly: true });
    expect(matches.find((m) => m.retailerProductId === 'lidl:100300')?.promotionsOnly).toBeUndefined();
  });
});

describe('offre reliée dans le calcul du panier (oranges, besoin de 2 kg)', () => {
  // Offre Lidl Plus 1.39 le sachet de 1 kg (au lieu de 1.95) du 01 au 07.10 ; le prix « au lieu de »
  // est aussi présent comme relevé de l'article (comme dans l'instantané réel).
  const orangesOffer = offer('10059701', 'Oranges', 1000);
  const filet = regular('100200', 'Oranges filet', 2000);
  const index = (withFilet: boolean) =>
    buildOfferIndex({
      products: [orangesOffer, ...(withFilet ? [filet] : [])],
      matches: [
        { canonicalId: oranges.id, retailerProductId: orangesOffer.id, kind: 'similar', status: 'validated', confidence: 1, ruleId: 'lidl-oranges', promotionsOnly: true },
        ...(withFilet ? [{ canonicalId: oranges.id, retailerProductId: filet.id, kind: 'equivalent' as const, status: 'validated' as const, confidence: 1 }] : []),
      ],
      prices: [obs(orangesOffer.id, 195), ...(withFilet ? [obs(filet.id, 399)] : [])],
      promotions: [promo(orangesOffer.id, { promoPriceCents: 139, referencePriceCents: 195, loyaltyProgram: 'lidl-plus' })],
    });
  const line = { id: 'l', productId: oranges.id, qty: 1 };

  it('carte déclarée : deux sachets de 1 kg, montant payé 2 × 1.39, quantité achetée = demandée', () => {
    const r = resolveLine(line, oranges, LIDL_PROFILE, index(false), ctx('2026-10-06', ['lidl-plus']));
    expect(r.option).toMatchObject({
      packs: 2,
      requestedQuantity: { amount: 2000, unit: 'g' },
      purchasedQuantity: { amount: 2000, unit: 'g' },
      totalCents: 278,
      matchRule: 'lidl-oranges',
      unitPrice: { basis: 'kg', cents: 139 },
    });
    expect(r.option?.promotion).toMatchObject({ loyaltyProgram: 'lidl-plus', validFrom: '2026-10-01', validTo: '2026-10-07' });
    expect(r.option?.statusReasons).toEqual(expect.arrayContaining(['pack_size_differs', 'loyalty_required']));
  });

  it('carte absente : l’offre n’est pas appliquée ; signalée si un autre article de l’enseigne est retenu', () => {
    const alone = resolveLine(line, oranges, LIDL_PROFILE, index(false), ctx('2026-10-06'));
    // Le prix « au lieu de » (1.95) n'est pas repris comme prix normal de l'offre.
    expect(alone.option).toBeNull();
    const withFilet = resolveLine(line, oranges, LIDL_PROFILE, index(true), ctx('2026-10-06'));
    expect(withFilet.option).toMatchObject({ retailerProductId: filet.id, packs: 1, totalCents: 399, matchRule: null });
    expect(withFilet.option?.loyaltyOffer).toMatchObject({ program: 'Lidl Plus', totalCents: 278, quantity: { amount: 2000, unit: 'g' }, validTo: '2026-10-07' });
  });

  it('hors période : l’offre ne vaut plus, rien n’est prolongé, même avec la carte', () => {
    const after = resolveLine(line, oranges, LIDL_PROFILE, index(false), ctx('2026-10-09', ['lidl-plus']));
    expect(after.option).toBeNull();
    const withFilet = resolveLine(line, oranges, LIDL_PROFILE, index(true), ctx('2026-10-09', ['lidl-plus']));
    expect(withFilet.option).toMatchObject({ retailerProductId: filet.id, totalCents: 399, promotion: null });
    expect(withFilet.option?.loyaltyOffer ?? null).toBeNull();
  });
});

describe('fiche catalogue Lidl : prix réservé à Lidl Plus', () => {
  // Structure réelle de la fiche « Oranges » (0080135) du 03.10.2026 : un seul bloc de prix au thème
  // Lidl Plus, prix barré 1.95 (sans carte) et 1.39* (membres), prix de base « LP » sur le prix carte.
  const page = (theme: string, footer = 'les kg') => `<html><head>
    <meta property="og:url" content="https://sortiment.lidl.ch/fr/catalog/product/view/id/13690/s/oranges-0080135/" /></head><body>
    <h1 class="page-title"><span class="base">Oranges</span></h1>
    <div class="price-box price-final_price"><span class="pricefield pricefield--attributebox ${theme} pricefield--discount"><span class="pricefield__wrapper">
    <span class="pricefield__badges pricefield__badges--top"><span class="pricefield__badge pricefield__badge--lidl-plus"><img src="lidl-plus-fr.png"></span></span>
    <span class="pricefield__header"> -28% </span><span class="pricefield__body"><span class="pricefield__price-prefix"><del class="pricefield__old-price">1.95</del></span>
    <strong class="pricefield__price" itemprop="price" content="1.39">1<span class="pricefield__price-delimiter">.</span><span class="pricefield__price-superscript">39<sup>*</sup></span></strong></span></span>
    <span class="pricefield__footer">${footer}</span></span></div><div class="towishlist-wrapper"></div></body></html>`;

  it('le prix affiché est le prix carte ; le prix sans carte est le prix barré', () => {
    expect(parseProductPage(page('pricefield--theme-lidl-plus'), 'u')).toMatchObject({ priceCents: 195, lidlPlusPriceCents: 139, isAction: false, cardPriceShown: true });
    // Bloc ordinaire en action : prix d'action pour tous.
    expect(parseProductPage(page('pricefield--theme-white').replace(/<span class="pricefield__badges[\s\S]*?<\/span><\/span>/, ''), 'u')).toMatchObject({ priceCents: 139, lidlPlusPriceCents: null, isAction: true });
    // Thème Lidl Plus sans prix barré : prix sans carte inconnu, article écarté.
    expect(parseProductPage(page('pricefield--theme-lidl-plus').replace(/<del[\s\S]*?<\/del>/, ''), 'u')).toBeNull();
  });

  it('dans le lot : prix normal 1.95 et action Lidl Plus 1.39 (jamais appliquée sans carte)', () => {
    const fetchedAt = new Date('2026-10-03T09:11:54Z');
    const batch = buildLidlBatch(
      { assortment: [], offers: [], products: [{ url: 'https://sortiment.lidl.ch/fr/catalog/product/view/id/13690', html: page('pricefield--theme-lidl-plus', 'les 500g | LP 1KG = 2,78 CHF'), fetchedAt }] },
      { now: fetchedAt, catalog: [], reviewedMatches: [] },
    );
    expect(batch.prices.map((p) => p.priceCents)).toEqual([195]);
    expect(batch.promotions).toHaveLength(1);
    expect(batch.promotions[0]).toMatchObject({ promoPriceCents: 139, loyaltyProgram: 'lidl-plus', validFrom: '2026-10-03', validTo: '2026-10-03' });
    // Prix de base « LP » cohérent avec le prix carte : aucun rejet.
    expect(batch.retailerProducts).toHaveLength(1);
  });
});
