import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { haversineKm, type Store } from '@cabas/core';
import { RELEVE_COLUMNS } from '@cabas/connectors';
import { CHAINS } from '@cabas/reference';
import type { JobContext } from './jobs';
import { PUBLIC_STATUSES, type EssentialsMatrix, type MatrixCell } from './matrix';

const ORDER = ['migros', 'coop', 'denner', 'aldi', 'lidl'];
const name = (id: string) => CHAINS.find((c) => c.id === id)?.name ?? id;
const day = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Exigences par besoin, lues dans le tableau du § 5 de docs/RELEVES.md (« — » si aucune). */
async function requirements(root: string): Promise<Map<string, string>> {
  const path = join(root, 'docs', 'RELEVES.md');
  const out = new Map<string, string>();
  if (!existsSync(path)) return out;
  for (const line of (await readFile(path, 'utf8')).split('\n')) {
    const m = /^\| `([a-z0-9-]+)` \|.*\| ([^|]+) \|$/.exec(line);
    if (m) out.set(m[1] as string, (m[2] as string).trim());
  }
  return out;
}

/**
 * `releves-prioritaires` : relevés en magasin qui feraient le plus progresser la **version publique**
 * (docs/RELEVES_PRIORITAIRES.md et fiche CSV docs/releves/fiche-noyau.csv). Calculé sur la matrice
 * publique (`data/matrice/essentiels.json`, sources publiables seulement) : aucune donnée d'une source
 * privée n'est utilisée. Priorité : une 3e enseigne à une comparaison existante, puis une 2e enseigne
 * aux besoins du panier de base, puis aux autres besoins.
 */
export async function jobRelevesPrioritaires(ctx: JobContext) {
  const dataDir = ctx.env.dataDir;
  const root = join(dataDir, '..');
  const matrix = JSON.parse(await readFile(join(dataDir, 'matrice', 'essentiels.json'), 'utf8')) as EssentialsMatrix;
  const basket = new Set(
    (JSON.parse(await readFile(join(dataDir, 'demo', 'panier-noyau.json'), 'utf8')) as { baskets: Array<{ lines: Array<{ productId: string }> }> }).baskets[0]?.lines.map((l) => l.productId) ?? [],
  );
  const req = await requirements(root);
  const publicCell = (x: MatrixCell | undefined) => Boolean(x && PUBLIC_STATUSES.includes(x.status) && x.totalCents != null);

  const rows = matrix.rows.map((r) => {
    const have = ORDER.filter((c) => publicCell(r.cells[c]));
    const missing = ORDER.filter((c) => !have.includes(c));
    // Relevé communautaire : retiré après 90 jours (date d'expiration affichée pour le renouveler).
    const expiring = have
      .map((c) => r.cells[c] as MatrixCell)
      .filter((x) => x.status === 'community' && x.observedAt)
      .map((x) => new Date(Date.parse(x.observedAt as string) + 90 * 86_400_000).toISOString());
    return { r, have, missing, expiring, basket: basket.has(r.slug) };
  });
  const tier = (x: (typeof rows)[number]) => (x.have.length >= 2 ? 1 : x.have.length === 1 ? (x.basket ? 2 : 3) : 4);
  rows.sort((a, b) => tier(a) - tier(b) || a.r.category.localeCompare(b.r.category) || a.r.name.localeCompare(b.r.name));

  const count = (n: number) => rows.filter((x) => x.have.length === n).length;
  const byChain = ORDER.map((c) => `${name(c)} ${rows.filter((x) => x.have.includes(c)).length}/50`).join(', ');

  // Bulle (FR) : les cinq enseignes à moins de 5 km (panier de démonstration) ; succursale la plus proche de chacune.
  const stores = (JSON.parse(await readFile(join(dataDir, 'stores', 'osm-stores.json'), 'utf8')) as { stores: Store[] }).stores;
  const bulle = { lat: 46.619, lon: 7.057 };
  const nearest = ORDER.map((c) => {
    const s = stores
      .filter((x) => x.chainId === c)
      .map((x) => ({ x, km: haversineKm(bulle, x) }))
      .sort((a, b) => a.km - b.km)[0];
    return s && s.km <= 5 ? `| ${name(c)} | \`${s.x.id}\` | ${[s.x.street, s.x.zip, s.x.city].filter(Boolean).join(' ') || s.x.name} | ${s.km.toFixed(1)} km |` : `| ${name(c)} | — | aucune succursale à moins de 5 km | — |`;
  });

  const line = (x: (typeof rows)[number], i: number) =>
    `| ${i + 1} | \`${x.r.slug}\` | ${x.r.name} | ${x.r.quantity} | ${req.get(x.r.slug) ?? '—'} | ${
      x.have.map((c) => `${name(c)} (${(x.r.cells[c] as MatrixCell).status === 'community' ? 'relevé communautaire' : 'prix publié'} du ${day((x.r.cells[c] as MatrixCell).observedAt as string)})`).join(', ') || 'aucune'
    }${x.expiring.length ? ` ; relevé retiré le ${day(x.expiring.sort()[0] as string)} s’il n’est pas renouvelé` : ''} | ${x.missing.map(name).join(', ')} |`;
  const head = '| # | Besoin | Désignation | Quantité | Exigences | Prix public aujourd’hui | Enseignes à relever |';
  const sep = '|---|---|---|---|---|---|---|';
  const section = (t: number) => rows.filter((x) => tier(x) === t);

  const md = [
    '# Relevés en magasin prioritaires pour la version publique',
    '',
    `Généré par \`pnpm job releves-prioritaires\` le ${day(ctx.now.toISOString())} à partir de la matrice publique du ${day(matrix.generatedAt)}`,
    '(sources publiables seulement : Lidl, Open Prices, relevés en magasin). Aucune donnée des collecteurs privés.',
    '',
    `Prix publiables par enseigne : ${byChain}. Besoins comparables dans 2 enseignes ou plus : **${rows.filter((x) => x.have.length >= 2).length}** ;`,
    `avec une seule enseigne : ${count(1)} ; sans aucune : ${count(0)}.`,
    '',
    'Un relevé en magasin (voie B de `docs/RELEVES.md` : CSV, un magasin, un jour, une preuve) est une donnée propre,',
    'publiable, **locale** (valable pour ce magasin) et datée ; il devient « indicatif » après 7 jours et est écarté après 30.',
    'Les correspondances restent strictes : format, unité, catégorie, exigences (origine, AOP…), conditions d’action et date.',
    '',
    '## Ce qu’il faut noter pour chaque article',
    '',
    '- prix **normal** affiché et, s’il y a lieu, prix **d’action** avec ses dates et conditions (carte, quantité minimale) ;',
    '- désignation exacte, marque, **contenance** du paquet (ou prix au kilo pour le vrac) ;',
    '- mentions exigées par le besoin : origine suisse, AOP, bio, mode d’élevage ;',
    '- magasin (identifiant OSM ci-dessous), date, preuve (photo de l’étiquette ou ticket de caisse).',
    '',
    '## Priorité 1 — ajouter une troisième enseigne à une comparaison existante',
    '',
    head,
    sep,
    ...section(1).map(line),
    '',
    '## Priorité 2 — deuxième enseigne pour les besoins du panier de base (17 aliments)',
    '',
    head,
    sep,
    ...section(2).map(line),
    '',
    '## Priorité 3 — deuxième enseigne pour les autres besoins',
    '',
    head,
    sep,
    ...section(3).map(line),
    ...(section(4).length ? ['', '## Priorité 4 — besoins sans aucun prix public (deux relevés nécessaires)', '', head, sep, ...section(4).map(line)] : []),
    '',
    '## Plan de visite conseillé',
    '',
    'Un relevé complet dans **une Migros** puis **une Coop** proches d’un Lidl donne, si les articles conformes',
    'sont présents, une deuxième puis une troisième enseigne à presque tous les besoins (comparaison locale à ce',
    'magasin). Exemple à Bulle, où les cinq enseignes sont à moins de 5 km (point de départ du panier de démonstration) :',
    '',
    '| Enseigne | Magasin (`magasin`) | Adresse | Distance |',
    '|---|---|---|---|',
    ...nearest,
    '',
    'Fiche à remplir : `docs/releves/fiche-noyau.csv` (colonnes de `data/releves/modele.csv`, besoins dans cet ordre).',
    'Une fois remplie, la copier dans `data/releves/`, puis `pnpm job releves` et `pnpm job matrice-essentiels`.',
    '',
  ];
  await writeFile(join(root, 'docs', 'RELEVES_PRIORITAIRES.md'), md.join('\n'));
  const csvDir = join(root, 'docs', 'releves');
  await mkdir(csvDir, { recursive: true });
  const csv = [RELEVE_COLUMNS.join(';'), ...rows.map((x) => RELEVE_COLUMNS.map((c) => (c === 'besoin' ? x.r.slug : '')).join(';'))];
  await writeFile(join(csvDir, 'fiche-noyau.csv'), `${csv.join('\n')}\n`);
  ctx.log.info('Relevés prioritaires écrits', { troisieme: section(1).length, panier: section(2).length, autres: section(3).length, sansPrix: section(4).length });
}
