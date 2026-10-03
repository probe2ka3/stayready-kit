import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RELEVE_COLUMNS } from '@cabas/connectors';
import type { JobContext } from '../src/jobs';
import { jobReleves } from '../src/releves';

/**
 * Tâche `releves` de bout en bout, dans un dossier de données **temporaire** (jamais data/ réel) :
 * relevés privés, preuve, validation, rapport privé et instantané publiable épuré.
 * Données fictives : elles ne rejoignent jamais les données publiques réelles.
 */
const root = join(__dirname, '..', '..', '..');
const NOW = new Date('2026-10-06T08:00:00Z');
const silent = { info: () => {}, warn: () => {}, error: () => {} };
const dirs: string[] = [];

function dataDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'tesprix-releves-'));
  dirs.push(d);
  mkdirSync(join(d, 'stores'), { recursive: true });
  mkdirSync(join(d, 'matching'), { recursive: true });
  mkdirSync(join(d, 'private', 'releves', 'preuves'), { recursive: true });
  const src = { connectorId: 'osm-stores', kind: 'open_data', ref: 'test' };
  writeFileSync(
    join(d, 'stores', 'osm-stores.json'),
    JSON.stringify({ retrievedAt: '2026-10-01T00:00:00Z', stores: [{ id: 'osm:node/1', chainId: 'migros', name: 'Migros', street: 'Rue fictive 1', city: 'Bulle', lat: 46.62, lon: 7.06, source: src }] }),
  );
  writeFileSync(join(d, 'matching', 'reviewed.json'), readFileSync(join(root, 'data', 'matching', 'reviewed.json')));
  return d;
}

const ctx = (d: string, flags: JobContext['flags'] = { quiet: true }): JobContext => ({
  env: { databaseUrl: undefined, dataDir: d, importDir: join(d, 'imports'), overpassUrl: undefined, env: {} },
  now: NOW,
  flags,
  args: [],
  log: silent,
});

const line = (o: Partial<Record<(typeof RELEVE_COLUMNS)[number], string>>) =>
  RELEVE_COLUMNS.map(
    (c) =>
      ({
        enseigne: 'migros',
        magasin: 'osm:node/1',
        date: '2026-10-05',
        besoin: 'penne-500g',
        article: 'Penne',
        marque: 'Marque fictive',
        contenance: '500',
        unite: 'g',
        prix_chf: '9.99',
        preuve: 'IMG_FICTIVE_1.jpg',
        releve_par: 'Bénévole fictif',
        statut: 'valide',
        valide_par: 'Validation fictive',
        ...o,
      })[c] ?? '',
  ).join(';');

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('tâche releves (dossier privé → instantané publiable épuré)', () => {
  it('publie seulement les lignes validées avec preuve ; rapport privé complet ; aucune donnée privée publiée', async () => {
    const d = dataDir();
    writeFileSync(join(d, 'private', 'releves', 'preuves', 'IMG_FICTIVE_1.jpg'), 'fictif');
    writeFileSync(
      join(d, 'private', 'releves', '2026-10-bulle-migros.csv'),
      [
        RELEVE_COLUMNS.join(';'),
        line({}),
        line({ besoin: 'sucre-cristal-1kg', article: 'Sucre cristallisé', contenance: '1', unite: 'kg', statut: 'a_valider', valide_par: '' }),
        line({ besoin: 'bananes-1kg', article: 'Bananes', contenance: '', unite: 'kg', au_poids: 'oui', preuve: 'IMG_FICTIVE_2.jpg' }),
        line({ besoin: 'farine-blanche-1kg', article: 'Farine blanche', contenance: '', unite: 'g' }),
      ].join('\n'),
    );
    await jobReleves(ctx(d));

    const report = readFileSync(join(d, 'private', 'releves', 'rapport.md'), 'utf8');
    expect(report).toMatch(/\| 2026-10-bulle-migros\.csv \| 2 \| publié \|/);
    expect(report).toMatch(/\| 3 \| en attente \|.*en attente de validation/);
    expect(report).toMatch(/\| 4 \| en attente \|.*IMG_FICTIVE_2\.jpg/);
    expect(report).toMatch(/\| 5 \| invalide \|.*contenance/);

    const snap = readFileSync(join(d, 'prices', 'live', 'releves.json'), 'utf8');
    const parsed = JSON.parse(snap) as { batch: { prices: Array<{ storeId: string; reliability: string; source: { ref: string } }> } };
    expect(parsed.batch.prices).toHaveLength(1);
    expect(parsed.batch.prices[0]).toMatchObject({ storeId: 'osm:node/1', reliability: 'survey', source: { ref: 'relevé en magasin du 2026-10-05' } });
    for (const secret of ['2026-10-bulle-migros.csv', 'IMG_FICTIVE', 'Bénévole fictif', 'Validation fictive', 'rapport']) expect(snap).not.toContain(secret);
  });

  it('rien de publiable : instantané non écrit ; fichiers du dossier versionné data/releves jamais lus', async () => {
    const d = dataDir();
    mkdirSync(join(d, 'releves'));
    writeFileSync(join(d, 'releves', 'oubli.csv'), [RELEVE_COLUMNS.join(';'), line({})].join('\n'));
    writeFileSync(join(d, 'private', 'releves', 'a.csv'), [RELEVE_COLUMNS.join(';'), line({ statut: '' })].join('\n'));
    await jobReleves(ctx(d));
    expect(existsSync(join(d, 'prices', 'live', 'releves.json'))).toBe(false);
  });

  it('dossier privé absent (CI publique) : rien à importer, aucune erreur, rien d’écrit', async () => {
    const d = dataDir();
    rmSync(join(d, 'private', 'releves'), { recursive: true });
    const warnings: string[] = [];
    await jobReleves({ ...ctx(d), log: { ...silent, warn: (m: string) => warnings.push(m) } });
    expect(warnings.join(' ')).toMatch(/Aucun dossier privé de relevés/);
    expect(existsSync(join(d, 'prices', 'live', 'releves.json'))).toBe(false);
  });
});
