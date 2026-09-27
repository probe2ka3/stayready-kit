import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Locality, Store } from '@cabas/core';
import { OSM_ATTRIBUTION, SWISSTOPO_ATTRIBUTION } from '@cabas/connectors';

/**
 * Instantanés versionnés des données ouvertes (dans `data/`), pour démarrer sans
 * accès réseau et pour le mode « mémoire ». Les formats sont compacts mais lisibles.
 */

type LocalityRow = [string, string, string, string, string, number, number, string];

export interface LocalitiesSnapshot {
  source: string;
  attribution: string;
  license: string;
  retrievedAt: string;
  fields: string[];
  rows: LocalityRow[];
}

export interface StoresSnapshot {
  source: string;
  attribution: string;
  license: string;
  retrievedAt: string;
  stores: Store[];
}

export async function writeLocalitiesSnapshot(path: string, list: Locality[], retrievedAt: Date): Promise<void> {
  const snap: LocalitiesSnapshot = {
    source: 'swisstopo — Répertoire officiel des localités (CSV WGS84)',
    attribution: SWISSTOPO_ATTRIBUTION,
    license: 'OGD swisstopo — utilisation libre avec mention de la source',
    retrievedAt: retrievedAt.toISOString(),
    fields: ['zip', 'suffix', 'name', 'municipality', 'canton', 'lat', 'lon', 'lang'],
    rows: list.map((l) => [l.zip, l.suffix, l.name, l.municipality, l.canton, l.lat, l.lon, l.lang]),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(snap)}\n`);
}

export async function readLocalitiesSnapshot(path: string): Promise<{ list: Locality[]; retrievedAt: string }> {
  const snap = JSON.parse(await readFile(path, 'utf8')) as LocalitiesSnapshot;
  return {
    retrievedAt: snap.retrievedAt,
    list: snap.rows.map(([zip, suffix, name, municipality, canton, lat, lon, lang]) => ({
      zip,
      suffix,
      name,
      municipality,
      canton,
      lat,
      lon,
      lang,
    })),
  };
}

export async function writeStoresSnapshot(path: string, stores: Store[], retrievedAt: Date): Promise<void> {
  const compact = stores.map((s) =>
    Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null && v !== undefined)),
  ) as unknown as Store[];
  const snap: StoresSnapshot = {
    source: 'OpenStreetMap via overpass.osm.ch',
    attribution: OSM_ATTRIBUTION,
    license: 'ODbL-1.0 (https://opendatacommons.org/licenses/odbl/1-0/)',
    retrievedAt: retrievedAt.toISOString(),
    stores: compact,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(snap, null, 0).replace(/\},\{"id"/g, '},\n{"id"')}\n`);
}

export async function readStoresSnapshot(path: string): Promise<{ stores: Store[]; retrievedAt: string }> {
  const snap = JSON.parse(await readFile(path, 'utf8')) as StoresSnapshot;
  return { stores: snap.stores, retrievedAt: snap.retrievedAt };
}
