import { describe, expect, it } from 'vitest';
import { weekdayOf, zurichToday } from '@cabas/core';
import { CHAINS } from '@cabas/reference';
import {
  classifyOsm,
  generateDemoData,
  isValidGtin,
  makeCantonResolver,
  osmElementsToStores,
  parseCsv,
  parseImportFile,
  parseSwisstopoCsv,
} from '../src';

const NOW = new Date('2026-09-27T10:00:00Z');

describe('lecteur CSV', () => {
  it('gère séparateur « ; », guillemets, BOM et retours à la ligne', () => {
    const csv = '﻿chain_id;name;note\nmigros;"Farine ""fleur""";"ligne 1\nligne 2"\n\ncoop;Sucre;\n';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(['chain_id', 'name', 'note']);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.values.name).toBe('Farine "fleur"');
    expect(rows[0]?.values.note).toBe('ligne 1\nligne 2');
    expect(rows[1]?.line).toBe(5);
  });
  it('détecte la virgule', () => {
    expect(parseCsv('a,b\n1,2').rows[0]?.values).toEqual({ a: '1', b: '2' });
  });
});

describe('GTIN', () => {
  it('vérifie la clé de contrôle', () => {
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('12345')).toBe(false);
  });
});

const HEADER =
  'chain_id;sku;name;brand;gtin;quantity;unit;organic;swiss_origin;canonical_slug;price_chf;observed_at;scope;source_kind;source_ref;audience;vat_included';

describe('import structuré', () => {
  it('importe des articles et prix valides avec correspondance explicite', () => {
    const csv = `${HEADER}
migros;100001;Farine fleur 1 kg;;;1;kg;0;1;farine-blanche-1kg;1,75;2026-09-26;national;manual_survey;Relevé magasin Bulle;consumer;1
migros;100002;Farine fleur 500 g;;;500;g;0;1;farine-blanche-1kg;0.95;2026-09-26T08:00:00Z;zone:migros-nf;manual_survey;Relevé;consumer;1`;
    const batch = parseImportFile(csv, 'migros.prices.csv', { connectorId: 'migros', now: NOW, chainId: 'migros' });
    expect(batch.report.rejected).toEqual([]);
    expect(batch.retailerProducts).toHaveLength(2);
    expect(batch.prices[0]?.priceCents).toBe(175);
    expect(batch.prices[1]?.zoneId).toBe('migros-nf');
    expect(batch.matches.map((m) => [m.kind, m.status])).toEqual([
      ['equivalent', 'validated'],
      ['similar', 'validated'],
    ]);
    expect(batch.prices.every((p) => !p.isDemo && p.source.kind === 'manual_survey')).toBe(true);
  });

  it('refuse les lignes non conformes et explique pourquoi', () => {
    const csv = `${HEADER}
migros;1;Farine;;;1;kg;;;;1.5;2026-09-26;national;demo;x;consumer;1
migros;2;Farine;;;1;kg;;;;1.5;2026-12-01;national;manual_survey;x;consumer;1
aligro;3;Farine;;;1;kg;;;;1.2;2026-09-26;national;manual_survey;x;professional;0
migros;4;Farine;;4006381333932;1;kg;;;;1.5;2026-09-26;national;manual_survey;x;consumer;1
migros;5;Farine;;;1;kg;;;;1.5;2026-09-26;zone:inconnue;manual_survey;x;consumer;1
coop;6;Farine;;;1;kg;;;;1.5;2026-09-26;national;manual_survey;x;consumer;1
migros;7;Farine;;;1;kg;;;;1.5;2026-09-26;national;manual_survey;;consumer;1`;
    const batch = parseImportFile(csv, 'bad.csv', { connectorId: 'migros', now: NOW, chainId: 'migros' });
    expect(batch.retailerProducts).toHaveLength(0);
    const fields = batch.report.rejected.map((r) => r.field);
    expect(fields).toEqual(['source_kind', 'observed_at', 'chain_id', 'gtin', 'scope', 'chain_id', 'source_ref']);
  });

  it('exige des prix TTC pour particuliers chez Aligro', () => {
    const csv = `${HEADER}
aligro;9;Farine;;;1;kg;;;;1.2;2026-09-26;national;manual_survey;x;professional;1
aligro;10;Farine;;;1;kg;;;;1.2;2026-09-26;national;manual_survey;x;consumer;0
aligro;11;Farine;;;1;kg;;;;1.3;2026-09-26;national;manual_survey;x;consumer;1`;
    const batch = parseImportFile(csv, 'aligro.csv', { connectorId: 'aligro', now: NOW });
    expect(batch.report.rejected.map((r) => r.field)).toEqual(['audience', 'vat_included']);
    expect(batch.prices).toHaveLength(1);
  });

  it('valide les promotions (dates, publication, mécanique)', () => {
    const csv = `chain_id;sku;type;promo_price_chf;percent;buy_qty;pay_qty;min_qty;loyalty_program;while_stocks_last;published_at;valid_from;valid_to;source_kind;source_ref
lidl;1;percent;;20;;;;lidl-plus;1;2026-09-17;2026-10-01;2026-10-07;manual_survey;Dépliant
lidl;2;price;1.95;;;;;;;2026-09-24;2026-09-24;2026-09-30;manual_survey;Dépliant
lidl;3;multibuy;;;2;3;;;;2026-09-24;2026-09-24;2026-09-30;manual_survey;Dépliant
lidl;4;percent;;20;;;;;;2026-09-24;2026-09-30;2026-09-24;manual_survey;Dépliant
lidl;5;percent;;20;;;;;;2026-10-01;2026-10-01;2026-10-07;manual_survey;Dépliant`;
    const batch = parseImportFile(csv, 'lidl.promotions.csv', { connectorId: 'lidl', now: NOW });
    expect(batch.promotions).toHaveLength(2);
    expect(batch.promotions[0]?.loyaltyProgram).toBe('lidl-plus');
    expect(batch.promotions[1]?.promoPriceCents).toBe(195);
    expect(batch.report.rejected.map((r) => r.field)).toEqual(['buy_qty', 'valid_to', 'published_at']);
  });

  it('propose des correspondances à valider quand la référence n’est pas indiquée', () => {
    const csv = `${HEADER}
denner;77;Spaghetti de blé dur;;;500;g;0;0;;1.2;2026-09-26;national;manual_survey;x;consumer;1`;
    const batch = parseImportFile(csv, 'denner.csv', { connectorId: 'denner', now: NOW });
    expect(batch.matches[0]).toMatchObject({ canonicalId: 'spaghetti-500g', status: 'suggested', kind: 'equivalent' });
  });

  it('accepte le format JSON', () => {
    const json = JSON.stringify({
      products: [
        {
          chain_id: 'coop',
          sku: 'x1',
          name: 'Lait entier UHT',
          quantity: 1,
          unit: 'l',
          swiss_origin: true,
          canonical_slug: 'lait-entier-uht-1l',
          price_chf: 1.6,
          observed_at: '2026-09-25',
          source_kind: 'agreement',
          source_ref: 'Flux partenaire',
        },
      ],
    });
    const batch = parseImportFile(json, 'coop.json', { connectorId: 'coop', now: NOW });
    expect(batch.report.rejected).toEqual([]);
    expect(batch.prices[0]?.priceCents).toBe(160);
  });
});

describe('données de démonstration', () => {
  const { batch } = generateDemoData(NOW);

  it('sont entièrement marquées comme fictives', () => {
    expect(batch.retailerProducts.length).toBeGreaterThan(800);
    expect(batch.retailerProducts.every((p) => p.isDemo && p.name.includes('fictif'))).toBe(true);
    expect(batch.prices.every((p) => p.isDemo && p.source.kind === 'demo')).toBe(true);
    expect(batch.promotions.every((p) => p.isDemo)).toBe(true);
  });

  it('sont reproductibles', () => {
    const again = generateDemoData(NOW).batch;
    expect(again.prices.map((p) => p.priceCents)).toEqual(batch.prices.map((p) => p.priceCents));
  });

  it('ne contiennent aucune promotion publiée après l’instant de génération', () => {
    expect(batch.promotions.every((p) => Date.parse(p.publishedAt) <= NOW.getTime())).toBe(true);
  });

  it('respectent le calendrier de chaque enseigne', () => {
    for (const chain of CHAINS) {
      const days = new Set(chain.promoCalendar.waves.map((w) => w.startWeekday));
      for (const p of batch.promotions.filter((x) => x.chainId === chain.id)) {
        expect(days.has(weekdayOf(p.validFrom)), `${chain.id} ${p.validFrom}`).toBe(true);
      }
    }
    // Migros : jeudi → mercredi ; la vague suivante (jeudi 01.10, publiée le 30.09) n'est pas encore connue
    const migros = batch.promotions.filter((p) => p.chainId === 'migros');
    expect(migros.some((p) => p.validFrom === '2026-09-24' && p.validTo === '2026-09-30')).toBe(true);
    expect(migros.some((p) => p.validFrom === '2026-10-01')).toBe(false);
    // Lidl publie plusieurs semaines à l'avance
    expect(batch.promotions.some((p) => p.chainId === 'lidl' && p.validFrom === '2026-10-01')).toBe(true);
    // OTTO'S : fin présumée
    expect(batch.promotions.filter((p) => p.chainId === 'ottos').every((p) => p.endIsPresumed)).toBe(true);
    expect(zurichToday(NOW)).toBe('2026-09-27');
  });

  it('reflètent des assortiments différents (Action : pas de produits frais)', () => {
    const action = batch.retailerProducts.filter((p) => p.chainId === 'action');
    expect(action.length).toBeGreaterThan(20);
    expect(action.some((p) => p.id.includes('lait-entier'))).toBe(false);
  });
});

describe('succursales OpenStreetMap', () => {
  it('classe les enseignes et exclut les formats hors périmètre', () => {
    expect(classifyOsm({ brand: 'Migros', name: 'MMM Gruyère Centre', shop: 'supermarket' })).toEqual({ chainId: 'migros', format: 'MMM' });
    expect(classifyOsm({ brand: 'Migrolino', shop: 'convenience' })).toBeNull();
    expect(classifyOsm({ brand: 'Coop Pronto', shop: 'convenience' })).toBeNull();
    expect(classifyOsm({ brand: 'Coop', shop: 'doityourself' })).toBeNull();
    expect(classifyOsm({ brand: 'Coop City', shop: 'department_store' })).toEqual({ chainId: 'coop', format: 'Coop City' });
    expect(classifyOsm({ brand: "Otto's", shop: 'cosmetics' })).toBeNull();
    expect(classifyOsm({ brand: 'Denner', name: 'Denner Satellit', shop: 'convenience' })).toBeNull();
    expect(classifyOsm({ brand: 'ALDI', shop: 'supermarket' })).toEqual({ chainId: 'aldi', format: null });
    expect(classifyOsm({ name: 'Aligro Matran', shop: 'wholesale' })).toEqual({ chainId: 'aligro', format: null });
  });

  it('convertit les éléments et attribue la zone Migros par canton', () => {
    const resolve = () => 'FR';
    const { stores } = osmElementsToStores(
      [
        {
          type: 'node',
          id: 1,
          lat: 46.6,
          lon: 7.05,
          tags: { brand: 'Migros', name: 'Migros Bulle', shop: 'supermarket', opening_hours: 'Mo-Sa 08:00-19:00', 'addr:postcode': '1630' },
        },
        { type: 'way', id: 2, center: { lat: 46.61, lon: 7.06 }, tags: { brand: 'Lidl', shop: 'supermarket' } },
        { type: 'node', id: 3, lat: 46.6, lon: 7.0, tags: { brand: 'Migrolino', shop: 'convenience' } },
      ],
      resolve,
      NOW.toISOString(),
    );
    expect(stores).toHaveLength(2);
    expect(stores[0]).toMatchObject({ id: 'osm:node/1', chainId: 'migros', zoneId: 'migros-nf', canton: 'FR', zip: '1630' });
    expect(stores[1]).toMatchObject({ id: 'osm:way/2', chainId: 'lidl', zoneId: 'lidl-romandie', name: 'Lidl Suisse' });
    // Avec la langue de la localité : Morat (FR) germanophone → région alémanique pour Lidl.
    const withLang = osmElementsToStores(
      [{ type: 'way', id: 2, center: { lat: 46.93, lon: 7.12 }, tags: { brand: 'Lidl', shop: 'supermarket' } }],
      () => ({ canton: 'FR', lang: 'de' }),
      NOW.toISOString(),
    );
    expect(withLang.stores[0]?.zoneId).toBe('lidl-deutschschweiz');
  });
});

describe('localités swisstopo', () => {
  const csv = `Ortschaftsname;PLZ4;Zusatzziffer;ZIP_ID;Gemeindename;BFS-Nr;Kantonskürzel;Adressenanteil;E;N;Sprache;Validity
Bulle;1630;00;1;Bulle;2125;FR;98.5 %;7.057;46.618;fr;2008-07-01
Bulle;1630;00;1;Morlon;2135;FR;1.5 %;7.08;46.63;fr;2008-07-01
Lausanne;1003;00;150;Lausanne;5586;VD;100 %;6.6318;46.5205;fr;2008-07-01`;
  it('garde la commune principale et résout le canton', () => {
    const locs = parseSwisstopoCsv(csv);
    expect(locs).toHaveLength(2);
    expect(locs.find((l) => l.zip === '1630')?.municipality).toBe('Bulle');
    const resolve = makeCantonResolver(locs);
    expect(resolve(46.52, 6.63, null)).toBe('VD');
    expect(resolve(46.61, 7.05, '1630')).toBe('FR');
  });
});
