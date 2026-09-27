import { normalizeText, type CanonicalProduct, type Category, type Chain, type Locality, type PriceZone, type Unit } from '@cabas/core';
import { eq, sql } from 'drizzle-orm';
import { chunk, type Database, type DbHandle } from './client';
import { canonicalProducts, categories, chains, localities, priceZones } from './schema';

/** Synchronise les données de référence (idempotent). */
export async function syncReference(
  db: Database,
  data: { chains: Chain[]; zones: PriceZone[]; categories: Category[]; products: CanonicalProduct[] },
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [i, c] of data.chains.entries()) {
      const row = {
        id: c.id,
        name: c.name,
        badge: c.badge,
        website: c.website,
        status: c.status,
        promoCalendar: c.promoCalendar,
        loyaltyPrograms: c.loyaltyPrograms,
        consumerPricesOnly: Boolean(c.consumerPricesOnly),
        notes: c.notes ?? null,
        sort: i,
        updatedAt: new Date().toISOString(),
      };
      await tx.insert(chains).values(row).onConflictDoUpdate({ target: chains.id, set: row });
    }
    for (const z of data.zones) {
      await tx.insert(priceZones).values(z).onConflictDoUpdate({ target: priceZones.id, set: z });
    }
    for (const c of data.categories) {
      await tx.insert(categories).values(c).onConflictDoUpdate({ target: categories.id, set: c });
    }
    for (const part of chunk(data.products, 200)) {
      const rows = part.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        categoryId: p.categoryId,
        amount: p.quantity.amount,
        unit: p.quantity.unit,
        attributes: p.attributes,
        brandRequired: p.brandRequired ?? null,
        gtins: p.gtins ?? [],
        keywords: p.keywords ?? [],
        searchText: normalizeText(`${p.name} ${(p.keywords ?? []).join(' ')}`),
        active: true,
        updatedAt: new Date().toISOString(),
      }));
      await tx
        .insert(canonicalProducts)
        .values(rows)
        .onConflictDoUpdate({
          target: canonicalProducts.id,
          set: {
            slug: sql`excluded.slug`,
            name: sql`excluded.name`,
            categoryId: sql`excluded.category_id`,
            amount: sql`excluded.amount`,
            unit: sql`excluded.unit`,
            attributes: sql`excluded.attributes`,
            brandRequired: sql`excluded.brand_required`,
            gtins: sql`excluded.gtins`,
            keywords: sql`excluded.keywords`,
            searchText: sql`excluded.search_text`,
            active: sql`true`,
            updatedAt: sql`now()`,
          },
        });
    }
  });
}

export async function listChains(db: Database): Promise<Chain[]> {
  const rows = await db.select().from(chains).orderBy(chains.sort);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    badge: r.badge,
    website: r.website,
    status: r.status as Chain['status'],
    promoCalendar: r.promoCalendar as Chain['promoCalendar'],
    loyaltyPrograms: r.loyaltyPrograms as Chain['loyaltyPrograms'],
    consumerPricesOnly: r.consumerPricesOnly,
    notes: r.notes ?? undefined,
  }));
}

export async function listZones(db: Database): Promise<PriceZone[]> {
  return db.select().from(priceZones);
}

export async function listCategories(db: Database): Promise<Category[]> {
  const rows = await db.select().from(categories).orderBy(categories.sort);
  return rows.map((r) => ({ ...r, kind: r.kind as Category['kind'] }));
}

export async function listCanonicalProducts(db: Database): Promise<CanonicalProduct[]> {
  const rows = await db.select().from(canonicalProducts).where(eq(canonicalProducts.active, true));
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    categoryId: r.categoryId,
    quantity: { amount: r.amount, unit: r.unit as Unit },
    attributes: r.attributes as CanonicalProduct['attributes'],
    brandRequired: r.brandRequired,
    gtins: r.gtins,
    keywords: r.keywords,
  }));
}

/* ---------------------------------------------------------------- */
/* Localités                                                          */
/* ---------------------------------------------------------------- */

export async function replaceLocalities(handle: DbHandle, list: Locality[]): Promise<number> {
  await handle.db.transaction(async (tx) => {
    await tx.delete(localities);
    for (const part of chunk(list, 1000)) {
      await tx.insert(localities).values(
        part.map((l) => ({
          ...l,
          searchText: normalizeText(`${l.zip} ${l.name} ${l.municipality}`),
        })),
      );
    }
  });
  return list.length;
}

export interface LocalityHit extends Locality {
  label: string;
}

function toHit(r: { zip: string; suffix: string; name: string; municipality: string; canton: string; lat: number; lon: number; lang: string }): LocalityHit {
  return { ...r, label: `${r.zip} ${r.name} (${r.canton})` };
}

/** Recherche par NPA (préfixe) ou par nom de localité / commune (sans accents). */
export async function searchLocalities(handle: DbHandle, query: string, limit = 10): Promise<LocalityHit[]> {
  const q = normalizeText(query);
  if (!q) return [];
  const { sql: s } = handle;
  const zip = /^\d{1,4}/.exec(q)?.[0];
  const rest = q.replace(/^\d{1,4}\s*/, '');
  const rows = zip
    ? await s`
        SELECT zip, suffix, name, municipality, canton, lat, lon, lang FROM localities
        WHERE zip LIKE ${zip + '%'} AND (${rest} = '' OR search_text LIKE ${'%' + rest + '%'})
        ORDER BY zip, name LIMIT ${limit}`
    : await s`
        SELECT zip, suffix, name, municipality, canton, lat, lon, lang FROM localities
        WHERE search_text LIKE ${'%' + q + '%'}
        ORDER BY (lower(name) = ${q}) DESC, (search_text LIKE ${'% ' + q + '%'}) DESC, similarity(search_text, ${q}) DESC, zip
        LIMIT ${limit}`;
  return rows.map((r) => toHit(r as unknown as Locality));
}
