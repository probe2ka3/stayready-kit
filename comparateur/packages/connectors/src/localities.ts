import { inflateRawSync } from 'node:zlib';
import { haversineKm, type Locality } from '@cabas/core';
import { parseCsv } from './csv';

/**
 * Répertoire officiel des localités (swisstopo, données OGD).
 * Conditions : utilisation libre, y compris commerciale, avec mention de la source
 * « Source : Office fédéral de topographie swisstopo ».
 */
export const SWISSTOPO_LOCALITIES_URL =
  'https://data.geo.admin.ch/ch.swisstopo-vd.ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz/ortschaftenverzeichnis_plz_4326.csv.zip';

export const SWISSTOPO_ATTRIBUTION = 'Source : Office fédéral de topographie swisstopo';

/** Extraction minimale d'un fichier d'une archive ZIP (méthodes « stored » et « deflate »). */
export function unzipFirst(buffer: Buffer, predicate: (name: string) => boolean): Buffer | null {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Archive ZIP invalide');
  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let e = 0; e < entries; e++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Répertoire central ZIP invalide');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localHeader = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    offset += 46 + nameLen + extraLen + commentLen;
    if (!predicate(name)) continue;
    const lNameLen = buffer.readUInt16LE(localHeader + 26);
    const lExtraLen = buffer.readUInt16LE(localHeader + 28);
    const start = localHeader + 30 + lNameLen + lExtraLen;
    const data = buffer.subarray(start, start + compressedSize);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data);
    throw new Error(`Méthode de compression ZIP non gérée : ${method}`);
  }
  return null;
}

/**
 * Transforme le CSV swisstopo en localités. Une localité peut s'étendre sur plusieurs
 * communes : on conserve la commune qui porte la plus grande part des adresses.
 */
export function parseSwisstopoCsv(text: string): Locality[] {
  const { rows } = parseCsv(text);
  const best = new Map<string, { share: number; loc: Locality }>();
  for (const { values } of rows) {
    const zip = values['plz4'];
    const name = values['ortschaftsname'];
    const lat = Number(values['n']);
    const lon = Number(values['e']);
    if (!zip || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const suffix = values['zusatzziffer'] ?? '00';
    const share = Number((values['adressenanteil'] ?? '0').replace(/[^\d.]/g, '')) || 0;
    const key = `${zip}-${suffix}-${name}`;
    const loc: Locality = {
      zip,
      suffix,
      name,
      municipality: values['gemeindename'] ?? name,
      canton: values['kantonskürzel'] ?? values['kantonskurzel'] ?? '',
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
      lang: values['sprache'] ?? '',
    };
    const cur = best.get(key);
    if (!cur || share > cur.share) best.set(key, { share, loc });
  }
  return [...best.values()]
    .map((b) => b.loc)
    .sort((a, b) => a.zip.localeCompare(b.zip) || a.name.localeCompare(b.name, 'fr'));
}

export async function downloadSwisstopoLocalities(fetchImpl: typeof fetch = fetch): Promise<Locality[]> {
  const res = await fetchImpl(SWISSTOPO_LOCALITIES_URL);
  if (!res.ok) throw new Error(`swisstopo : HTTP ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());
  const csv = unzipFirst(zip, (n) => n.toLowerCase().endsWith('.csv'));
  if (!csv) throw new Error('swisstopo : fichier CSV introuvable dans l’archive');
  return parseSwisstopoCsv(csv.toString('utf8'));
}

/** Canton d'un point : localité du même NPA si connue, sinon la plus proche. */
/** Localité la plus proche (NPA prioritaire), pour le canton et la langue. */
export function makeLocalityResolver(localities: Locality[]) {
  const byZip = new Map<string, Locality[]>();
  for (const l of localities) {
    const list = byZip.get(l.zip) ?? [];
    list.push(l);
    byZip.set(l.zip, list);
  }
  const nearest = (candidates: Locality[], lat: number, lon: number) => {
    let best: Locality | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const l of candidates) {
      const d = haversineKm({ lat, lon }, l);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return { best, bestD };
  };
  return (lat: number, lon: number, zip?: string | null): Locality | null => {
    const byZ = zip ? byZip.get(zip) : undefined;
    if (byZ) {
      const r = nearest(byZ, lat, lon);
      // Un NPA mal saisi très éloigné : on se rabat sur la localité la plus proche.
      if (r.bestD <= 25) return r.best;
    }
    return nearest(localities, lat, lon).best;
  };
}

export function makeCantonResolver(localities: Locality[]) {
  const byZip = new Map<string, Locality[]>();
  for (const l of localities) {
    const list = byZip.get(l.zip) ?? [];
    list.push(l);
    byZip.set(l.zip, list);
  }
  return (lat: number, lon: number, zip?: string | null): string | null => {
    const candidates = (zip && byZip.get(zip)) || localities;
    let best: Locality | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const l of candidates) {
      const d = haversineKm({ lat, lon }, l);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    // Un NPA mal saisi très éloigné : on se rabat sur la localité la plus proche.
    if (zip && bestD > 25) return makeCantonResolver(localities)(lat, lon, null);
    return best?.canton ?? null;
  };
}
