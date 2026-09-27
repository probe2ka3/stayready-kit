import type { LatLon, Store } from '@cabas/core';
import { and, eq, notInArray, sql as dsql } from 'drizzle-orm';
import { chunk, type DbHandle } from './client';
import { stores } from './schema';

/**
 * Remplace les succursales d'une source (connecteur) : insertion / mise à jour,
 * puis désactivation des succursales disparues de la source.
 */
export async function upsertStores(handle: DbHandle, connectorId: string, list: Store[]): Promise<{ upserted: number; deactivated: number }> {
  let deactivated = 0;
  await handle.db.transaction(async (tx) => {
    for (const part of chunk(list, 400)) {
      await tx
        .insert(stores)
        .values(
          part.map((s) => ({
            id: s.id,
            chainId: s.chainId,
            name: s.name,
            format: s.format ?? null,
            street: s.street ?? null,
            zip: s.zip ?? null,
            city: s.city ?? null,
            canton: s.canton ?? null,
            lat: s.lat,
            lon: s.lon,
            openingHours: s.openingHours ?? null,
            accessNotes: s.accessNotes ?? null,
            zoneId: s.zoneId ?? null,
            sourceConnector: connectorId,
            sourceKind: s.source.kind,
            sourceRef: s.source.ref ?? null,
            verifiedAt: s.verifiedAt ?? null,
            active: true,
          })),
        )
        .onConflictDoUpdate({
          target: stores.id,
          set: {
            chainId: dsql`excluded.chain_id`,
            name: dsql`excluded.name`,
            format: dsql`excluded.format`,
            street: dsql`excluded.street`,
            zip: dsql`excluded.zip`,
            city: dsql`excluded.city`,
            canton: dsql`excluded.canton`,
            lat: dsql`excluded.lat`,
            lon: dsql`excluded.lon`,
            openingHours: dsql`excluded.opening_hours`,
            accessNotes: dsql`excluded.access_notes`,
            zoneId: dsql`excluded.zone_id`,
            sourceKind: dsql`excluded.source_kind`,
            sourceRef: dsql`excluded.source_ref`,
            verifiedAt: dsql`excluded.verified_at`,
            active: dsql`true`,
            updatedAt: dsql`now()`,
          },
        });
    }
    const ids = list.map((s) => s.id);
    const res = await tx
      .update(stores)
      .set({ active: false, updatedAt: new Date().toISOString() })
      .where(and(eq(stores.sourceConnector, connectorId), eq(stores.active, true), ids.length ? notInArray(stores.id, ids) : undefined))
      .returning({ id: stores.id });
    deactivated = res.length;
  });
  return { upserted: list.length, deactivated };
}

interface StoreRow {
  id: string;
  chain_id: string;
  name: string;
  format: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  canton: string | null;
  lat: number;
  lon: number;
  opening_hours: string | null;
  access_notes: string | null;
  zone_id: string | null;
  source_connector: string;
  source_kind: string;
  source_ref: string | null;
  verified_at: string | null;
  crow_km: number;
}

function toStore(r: StoreRow): Store & { crowKm: number } {
  return {
    id: r.id,
    chainId: r.chain_id,
    name: r.name,
    format: r.format,
    street: r.street,
    zip: r.zip,
    city: r.city,
    canton: r.canton,
    lat: r.lat,
    lon: r.lon,
    openingHours: r.opening_hours,
    accessNotes: r.access_notes,
    zoneId: r.zone_id,
    source: { connectorId: r.source_connector, kind: r.source_kind as Store['source']['kind'], ref: r.source_ref },
    verifiedAt: r.verified_at,
    crowKm: Number(r.crow_km),
  };
}

/** Succursales actives dans un rayon (PostGIS, index GiST), triées par distance. */
export async function findStoresNear(
  handle: DbHandle,
  center: LatLon,
  radiusKm: number,
  chainIds?: string[] | null,
  limit = 3000,
): Promise<Array<Store & { crowKm: number }>> {
  const s = handle.sql;
  const point = s`ST_SetSRID(ST_MakePoint(${center.lon}, ${center.lat}), 4326)::geography`;
  const rows = await s<StoreRow[]>`
    SELECT id, chain_id, name, format, street, zip, city, canton, lat, lon, opening_hours, access_notes,
           zone_id, source_connector, source_kind, source_ref, verified_at,
           ST_Distance(location, ${point}) / 1000.0 AS crow_km
    FROM stores
    WHERE active
      AND ST_DWithin(location, ${point}, ${radiusKm * 1000})
      ${chainIds && chainIds.length ? s`AND chain_id = ANY(${chainIds})` : s``}
    ORDER BY crow_km
    LIMIT ${limit}`;
  return rows.map(toStore);
}

export async function countStoresByChain(handle: DbHandle): Promise<Record<string, number>> {
  const rows = await handle.sql<Array<{ chain_id: string; n: number }>>`
    SELECT chain_id, count(*)::int AS n FROM stores WHERE active GROUP BY chain_id`;
  return Object.fromEntries(rows.map((r) => [r.chain_id, r.n]));
}
