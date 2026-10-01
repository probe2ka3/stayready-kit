import { describe, expect, it } from 'vitest';
import {
  buildCoopEpaperBatch,
  coopOffer,
  pageLayout,
  pairOffers,
  parseCoopDescription,
  parseCoopPeriod,
  regionCode,
  unitHintMatches,
  type CoopEpaperPage,
  type PdfTextRun,
} from '../src';

// Pages synthétiques au format du magazine des actions (positions en points depuis le haut) ; valeurs fictives.
const run = (x: number, y: number, h: number, str: string): PdfTextRun => ({ x, y, h, w: str.length * h * 0.45, str });
const cell = (x: number, y: number, price: string, ref: string | null, desc: string[], extra: PdfTextRun[] = []): PdfTextRun[] => [
  run(x + 175, y - 40, 35, '25%'),
  run(x + 178, y, 28, price),
  ...(ref ? [run(x + 178, y + 9, 9, `au lieu de ${ref}`)] : []),
  ...desc.map((d, i) => run(x, y + 96 + i * 10, 9, d)),
  ...extra,
];
const page = (n: number, runs: PdfTextRun[], height = 841.9): CoopEpaperPage => ({ pageNumber: n, url: `https://epaper.example/p${n}`, runs, height, extractedAt: '2026-10-01T05:00:00.000Z' });
const cover = [run(391, 58, 22, 'Du jeudi au mercredi'), run(434, 84, 22, '1.10'), run(466, 84, 22, '-'), run(475, 84, 22, '7.10.2026'), run(398, 102, 12, 'dans la limite des stocks disponibles'), run(20, 780, 6.5, 'SR')];
const now = new Date('2026-10-01T06:00:00Z');
const edition = { defId: 1463, publicationDate: '2026-10-01', edId: 1, name: 'Magazine des actions' };

describe('Coop (journal numérique) : désignations', () => {
  it('nom, origine, conditionnement et prix unitaire imprimé', () => {
    const d = parseCoopDescription('Pommes Gala (sauf bio), sucrées, IP-Suisse, Suisse, la barquette de 750 g (100 g = –.20)');
    expect(d).toMatchObject({ origin: 'Suisse', packText: '750 g', quantity: { amount: 750, unit: 'g' }, unitHint: { amount: 100, unit: 'g', cents: 20 } });
    expect(d.name).toBe('Pommes Gala (sauf bio), sucrées, IP-Suisse');
    expect(parseCoopDescription('Viande de bœuf hachée Coop, Suisse, en libre-service, 2 × 400 g, duo (100 g = 1.46)').quantity).toEqual({ amount: 800, unit: 'g' });
    expect(parseCoopDescription('Saucisses de veau Coop, IGP, 3 × 2 × 140 g, trio (100 g = 1.18)').quantity).toEqual({ amount: 840, unit: 'g' });
    expect(parseCoopDescription('Lait drink Coop, IP-Suisse, Suisse, UHT, 1,5 %, 12 × 1 litre (1 litre = 1.41)')).toMatchObject({ quantity: { amount: 12000, unit: 'ml' }, unitHint: { amount: 1000, unit: 'ml', cents: 141 } });
    expect(parseCoopDescription('Tomates grappes (sauf bio), Suisse/Pays-Bas, en vrac, le kg')).toMatchObject({ quantity: { amount: 1000, unit: 'g' }, variableWeight: true, origin: 'Suisse/Pays-Bas' });
    expect(parseCoopDescription('Mangues bio Naturaplan, Espagne, en vrac, la pièce').quantity).toEqual({ amount: 1, unit: 'piece' });
  });

  it('contrôle du prix unitaire (à 1 centime ou 1 % près)', () => {
    expect(unitHintMatches(1170, { amount: 800, unit: 'g' }, { amount: 100, unit: 'g', cents: 146 })).toBe(true);
    expect(unitHintMatches(150, { amount: 800, unit: 'g' }, { amount: 100, unit: 'g', cents: 146 })).toBe(false);
  });

  it('dates imprimées et région de l’édition', () => {
    expect(parseCoopPeriod('Du jeudi au mercredi\n1.10 - 7.10.2026')).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(parseCoopPeriod('Du jeudi 1.10 au mercredi 7.10.2026')).toEqual({ from: '2026-10-01', to: '2026-10-07' });
    expect(parseCoopPeriod('29.12 - 4.1.2027')).toEqual({ from: '2026-12-29', to: '2027-01-04' });
    expect(parseCoopPeriod('Offres sur les nouveautés valables jusqu’au mercredi 14 octobre 2026')).toEqual({ from: null, to: '2026-10-14' });
    expect(parseCoopPeriod('sans date')).toBeNull();
    expect(regionCode(cover)).toBe('SR');
  });
});

describe('Coop (journal numérique) : appariement prix ↔ désignation', () => {
  it('le prix unitaire imprimé départage deux désignations proches', () => {
    // Le prix de droite (3.60) est plus proche de la désignation de gauche, mais seul 1.55 concorde avec elle.
    const runs = [
      run(221, 304, 28, '1.55'),
      run(221, 313, 9, 'au lieu de 1.95'),
      run(250, 330, 28, '3.60'),
      run(250, 339, 9, 'au lieu de 4.50'),
      run(43, 400, 9, 'Raisins sans pépins, Italie,'),
      run(43, 410, 9, 'la barquette de 500 g (100 g = –.31)'),
      run(306, 420, 9, 'Pruneaux, Suisse,'),
      run(306, 430, 9, 'la barquette de 500 g (100 g = –.72)'),
    ];
    const l = pageLayout(runs);
    const pairs = pairOffers(l.descriptions, l.tags).map((p) => [p.description.text.slice(0, 8), p.tag.cents]);
    expect(pairs).toEqual(expect.arrayContaining([['Raisins ', 155], ['Pruneaux', 360]]));
  });

  it('écarte offres conditionnelles, assortiments, poids variable sans prix aux 100 g et non-alimentaire', () => {
    const l = pageLayout([
      ...cell(43, 300, '2.95', '3.80', ['Orge perlé bio, 500 g (100 g = –.59)'], [run(221, 280, 9, 'à partir de 2')]),
      ...cell(306, 300, '3.50', '5.90', ['Entrecôtes de bœuf, Uruguay,', 'en libre-service, env. 550 g']),
      ...cell(43, 600, '1.15', '1.95', ['p. ex. Gourde bio, 100 g', '1.15 au lieu de 1.95']),
      ...cell(306, 600, '34.95', '69.95', ['Four à raclette, 2 ans de garantie, 13 pièces']),
    ]);
    const reasons = pairOffers(l.descriptions, l.tags).map(({ description, tag }) => {
      const o = coopOffer(description, tag, 'u');
      return 'skip' in o ? o.skip : 'accepté';
    });
    expect(reasons.sort()).toEqual(['non alimentaire', 'offre conditionnelle', 'offre sur un assortiment', 'poids variable sans prix aux 100 g']);
  });

  it('prix aux 100 g d’une pièce de poids variable : 100 g, poids variable', () => {
    const l = pageLayout(cell(43, 300, '2.60', '4.35', ['Filet mignon de porc Coop, Suisse,', 'en libre-service, env. 480 g'], [run(221, 280, 9, 'les 100 g')]));
    const [p] = pairOffers(l.descriptions, l.tags);
    const o = coopOffer(p!.description, p!.tag, 'u');
    if ('skip' in o) throw new Error(o.skip);
    expect(o.product.quantity).toEqual({ amount: 100, unit: 'g' });
    expect(o.product.attributes).toMatchObject({ swissOrigin: true, labels: ['poids-variable'] });
  });
});

describe('Coop (journal numérique) : lot', () => {
  const offers = (y: number) => cell(43, y, '1.50', '2.20', ['Pommes Gala, IP-Suisse, Suisse,', 'la barquette de 750 g (100 g = –.20)']);

  it('actions datées par la couverture, zone régionale, jamais de prix permanent', () => {
    const b = buildCoopEpaperBatch({ edition, pages: [page(1, [...cover, ...offers(300)])] }, { now });
    expect(b.prices).toEqual([]);
    expect(b.promotions).toHaveLength(1);
    expect(b.promotions[0]).toMatchObject({ chainId: 'coop', zoneId: 'coop-romandie', promoPriceCents: 150, referencePriceCents: 220, validFrom: '2026-10-01', validTo: '2026-10-07', endIsPresumed: false, whileStocksLast: true, verifiedAt: '2026-10-01T05:00:00.000Z' });
    expect(b.promotions[0]?.regionNote).toContain('SR');
  });

  it('pages « hypermarché » (et leur double page) exclues ; action expirée exclue ; page sans date écartée', () => {
    const hyper = [run(427, 137, 64, 'Les actions'), run(382, 203, 82, 'hypermarché'), ...offers(500)];
    const b = buildCoopEpaperBatch({ edition, pages: [page(1, cover), page(2, hyper, 1190.5), page(3, offers(500), 1190.5)] }, { now });
    expect(b.promotions).toHaveLength(0);
    expect(b.report.metrics?.['skipped: pages d’actions réservées à certains magasins']).toBe(2);
    const later = buildCoopEpaperBatch({ edition, pages: [page(1, [...cover, ...offers(300)])] }, { now: new Date('2026-10-09T06:00:00Z') });
    expect(later.promotions).toHaveLength(0);
    expect(later.report.metrics?.['skipped: action expirée']).toBe(1);
    const undated = buildCoopEpaperBatch({ edition, pages: [page(1, offers(300))] }, { now });
    expect(undated.promotions).toHaveLength(0);
    expect(undated.report.metrics?.['skipped: page sans dates de validité']).toBe(1);
  });
});
