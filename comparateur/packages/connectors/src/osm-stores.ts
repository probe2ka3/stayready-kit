/**
 * Succursales depuis OpenStreetMap (licence ODbL 1.0).
 *
 * Obligations : attribution « © les contributeurs d'OpenStreetMap » et, si la base
 * dérivée est redistribuée publiquement, diffusion sous ODbL. Les données sont
 * récupérées via l'instance Overpass de l'association suisse OSM (overpass.osm.ch),
 * avec un agent utilisateur identifiable et à faible fréquence (hebdomadaire).
 */

import type { Store } from '@cabas/core';
import { CHAINS, zoneForStore } from '@cabas/reference';
import { emptyReport, type ConnectorContext, type ImportReport, type StoreConnector } from './types';

export const OSM_ATTRIBUTION = '© les contributeurs d’OpenStreetMap (ODbL)';
export const DEFAULT_OVERPASS_URL = 'https://overpass.osm.ch/api/interpreter';

export const OVERPASS_QUERY = `[out:json][timeout:180];
area["ISO3166-1"="CH"][admin_level=2]->.ch;
(
  nwr(area.ch)["shop"]["brand"~"^(Migros|Coop|Coop City|Denner|Aldi|Aldi Suisse|Lidl|Lidl Schweiz|Otto's|OTTO'S|OTTO'S mini|Action|Aligro)$",i];
  nwr(area.ch)["shop"~"^(supermarket|convenience|variety_store|department_store|wholesale)$"]["name"~"^(Migros|Coop|Denner|Aldi|Lidl|Otto's|Action|Aligro)",i][!"brand"];
);
out center tags;`;

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const EXCLUDED = /(migrolino|migros\s*partner|\bvoi\b|\bteo\b|migros.?outlet|migros daily|coop\s*pronto|coop to go|coop bau|coop vitality|denner\s*satellit|express|partner)/i;

/** Classe un point OSM dans une enseigne retenue, ou l'exclut (formats hors périmètre V1). */
export function classifyOsm(tags: Record<string, string>): { chainId: string; format: string | null } | null {
  const brand = (tags.brand ?? '').trim();
  const name = (tags.name ?? '').trim();
  const shop = tags.shop ?? '';
  const label = brand || name;
  if (EXCLUDED.test(brand) || EXCLUDED.test(name)) return null;
  const b = label.toLowerCase();
  const foodShops = ['supermarket', 'convenience', 'grocery', 'department_store', 'wholesale'];
  if (/^migros\b/.test(b) && foodShops.includes(shop)) {
    const format = /^(MMM|MM|M)\b/.exec(name.replace(/^Migros\s*/i, ''))?.[1] ?? null;
    return { chainId: 'migros', format };
  }
  if (/^coop city\b/.test(b) && ['department_store', 'supermarket'].includes(shop)) return { chainId: 'coop', format: 'Coop City' };
  if (/^coop\b/.test(b) && ['supermarket', 'convenience'].includes(shop)) {
    if (tags['brand:wikidata'] && tags['brand:wikidata'] !== 'Q432564') return null;
    return { chainId: 'coop', format: null };
  }
  if (/^denner\b/.test(b) && ['supermarket', 'convenience', 'grocery'].includes(shop)) return { chainId: 'denner', format: null };
  if (/^aldi\b/.test(b) && shop === 'supermarket') return { chainId: 'aldi', format: null };
  if (/^lidl\b/.test(b) && shop === 'supermarket') return { chainId: 'lidl', format: null };
  if (/^otto'?s\b/.test(b) && ['variety_store', 'department_store'].includes(shop)) {
    return { chainId: 'ottos', format: /mini/i.test(label) ? "OTTO'S mini" : null };
  }
  if (/^action\b/.test(b) && ['variety_store', 'department_store', 'houseware'].includes(shop)) return { chainId: 'action', format: null };
  if (/^aligro\b/.test(b)) return { chainId: 'aligro', format: null };
  return null;
}

function accessNotes(tags: Record<string, string>): string | null {
  const notes: string[] = [];
  if (tags.wheelchair === 'yes') notes.push('Accessible en fauteuil roulant');
  else if (tags.wheelchair === 'limited') notes.push('Accès en fauteuil roulant limité');
  else if (tags.wheelchair === 'no') notes.push('Non accessible en fauteuil roulant');
  if (tags.level && tags.level !== '0') notes.push(`Niveau ${tags.level}`);
  if (/station|bahnhof|gare/i.test(tags.name ?? '')) notes.push('En gare');
  return notes.length ? notes.join(' · ') : null;
}

/** Canton seul (chaîne) ou localité complète (canton + langue, pour les régions Lidl). */
export type PlaceResolver = (
  lat: number,
  lon: number,
  zip?: string | null,
) => string | { canton: string | null; lang?: string | null } | null;

export function osmElementsToStores(
  elements: OsmElement[],
  resolvePlace: PlaceResolver,
  verifiedAt: string,
): { stores: Store[]; report: ImportReport } {
  const report = emptyReport();
  const stores: Store[] = [];
  const chainNames = new Map(CHAINS.map((c) => [c.id, c.name]));
  for (const el of elements) {
    const tags = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined) continue;
    const cls = classifyOsm(tags);
    if (!cls) {
      report.warnings.push({ message: `Exclu : ${tags.brand ?? tags.name ?? '?'} (${tags.shop ?? '?'}) ${el.type}/${el.id}` });
      continue;
    }
    const zip = tags['addr:postcode'] ?? null;
    const place = resolvePlace(lat, lon, zip);
    const canton = typeof place === 'string' ? place : (place?.canton ?? null);
    const lang = typeof place === 'string' ? null : (place?.lang ?? null);
    const street = [tags['addr:street'] ?? tags['addr:place'], tags['addr:housenumber']].filter(Boolean).join(' ') || null;
    stores.push({
      id: `osm:${el.type}/${el.id}`,
      chainId: cls.chainId,
      name: tags.name?.trim() || chainNames.get(cls.chainId) || cls.chainId,
      format: cls.format,
      street,
      zip,
      city: tags['addr:city'] ?? null,
      canton,
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
      openingHours: tags.opening_hours ?? null,
      accessNotes: accessNotes(tags),
      zoneId: zoneForStore(cls.chainId, canton, lang),
      source: { connectorId: 'osm', kind: 'open_data', ref: `https://www.openstreetmap.org/${el.type}/${el.id}` },
      verifiedAt,
    });
  }
  report.accepted.products = 0;
  return { stores, report };
}

export class OsmStoreConnector implements StoreConnector {
  readonly id = 'osm';
  readonly label = 'Succursales OpenStreetMap (ODbL)';

  constructor(
    private readonly resolvePlace: PlaceResolver,
    private readonly overpassUrl = DEFAULT_OVERPASS_URL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchStores(ctx: ConnectorContext): Promise<{ stores: Store[]; report: ImportReport }> {
    const res = await this.fetchImpl(this.overpassUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': ctx.env?.HTTP_USER_AGENT ?? 'cabas-comparateur/0.1 (import hebdomadaire des succursales)',
      },
      body: new URLSearchParams({ data: OVERPASS_QUERY }).toString(),
      signal: ctx.signal,
    });
    if (!res.ok) throw new Error(`Overpass : HTTP ${res.status}`);
    const json = (await res.json()) as { elements?: OsmElement[] };
    const result = osmElementsToStores(json.elements ?? [], this.resolvePlace, ctx.now.toISOString());
    ctx.log.info('Succursales OpenStreetMap récupérées', { stores: result.stores.length });
    return result;
  }
}
