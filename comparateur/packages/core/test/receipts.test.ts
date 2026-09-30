import { describe, expect, it } from 'vitest';
import { parseReceiptText, receiptObservations, scrubReceiptText, sourceInfo } from '../src';

/** Ticket fictif rédigé pour les tests (format proche des tickets suisses). */
const TICKET = `MIGROS
Filiale Morat
Tel. 026 672 21 11
M-Classic Lait entier UHT 1l      1.60 A
Penne rigate 500g                 1.90 A
2 x 0.95
Yogourt nature 180g               1.90 A
Aktion                           -0.40 A
Bananes 0.834 kg x 2.90           2.42 A
TOTAL CHF                         7.42
Cumulus 2099 1234 5678 9
Visa XXXX XXXX XXXX 4242
Trx 004512 Terminal 88110022
Caissière: Nathalie
28.09.2026 17:42:10
Merci de votre visite`;

describe('tickets de caisse', () => {
  it('supprime toutes les informations personnelles, jamais les prix', () => {
    const { text, removed } = scrubReceiptText(TICKET);
    for (const secret of ['2099 1234 5678 9', '4242', 'Nathalie', '17:42', '88110022', '026 672 21 11']) expect(text).not.toContain(secret);
    expect(text).toContain('1.60');
    expect(text).toContain('28.09.2026');
    expect(removed).toMatchObject({ carte_fidelite: 1, personnel: 1, heure: 1 });
  });

  it('lit enseigne, date, articles, quantités, remises, articles au poids et total', () => {
    const r = parseReceiptText(TICKET);
    expect(r.chainId).toBe('migros');
    expect(r.purchaseDate).toBe('2026-09-28');
    expect(r.storeHint).toBe('Filiale Morat');
    expect(r.totalCents).toBe(742);
    expect(r.lines.map((l) => [l.label, l.quantity, l.unitPriceCents, l.totalCents, l.discountCents, l.weighed])).toEqual([
      ['M-Classic Lait entier UHT 1l', 1, 160, 160, 0, false],
      ['Penne rigate 500g', 2, 95, 190, 0, false],
      ['Yogourt nature 180g', 1, 190, 190, 40, false],
      ['Bananes', 1, 290, 242, 0, true],
    ]);
  });

  it('ne produit que des relevés anonymes et indépendants (ni heure, ni ticket, ni personne)', () => {
    const r = parseReceiptText(TICKET);
    const obs = receiptObservations(
      { id: 'r1', status: 'reviewed', chainId: 'migros', storeId: 'osm:node/1', purchaseDate: r.purchaseDate!, lines: r.lines, submittedAt: '2026-09-28T18:00:00Z' },
      ['migros:gtin-1', null, 'migros:gtin-3', 'migros:gtin-4'],
    );
    // Article non rapproché et article au poids ignorés.
    expect(obs.map((o) => [o.retailerProductId, o.priceCents])).toEqual([
      ['migros:gtin-1', 160],
      ['migros:gtin-3', 190],
    ]);
    expect(obs[0]).toMatchObject({ reliability: 'crowd', proof: 'receipt', storeId: 'osm:node/1', observedAt: '2026-09-28T10:00:00.000Z' });
    expect(JSON.stringify(obs)).not.toContain('r1');
    expect(sourceInfo(obs[0]!.source)).toMatchObject({ tier: 'community', collectionMethod: 'receipt_scan' });
  });
});
