import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatQuantity, withCrowDistance } from '@cabas/core';
import { buildRelevesBatch, incompatibleVariants, privateLeaks, PROOF_EXTENSIONS, readReviewedMatches, RELEVE_COLUMNS, RELEVES_CONNECTOR_ID, writeLiveSnapshot, type OfferRule, type ReleveLine } from '@cabas/connectors';
import { CATEGORIES, CHAINS, P1_ESSENTIALS, PRODUCTS } from '@cabas/reference';
import { snapshotPath } from './context';
import type { JobContext } from './jobs';
import { readLocalitiesSnapshot, readStoresSnapshot } from './snapshots';

/** Dossier privé des relevés (non versionné) ; preuves dans son sous-dossier `preuves/`. */
export const privateRelevesDir = (dataDir: string) => join(dataDir, 'private', 'releves');

const STATUS_LABEL: Record<ReleveLine['status'], string> = {
  publie: 'publié',
  en_attente: 'en attente',
  refuse: 'refusé',
  invalide: 'invalide',
  exemple: 'exemple ignoré',
};

/**
 * Relevés en magasin (`releves [--dir=data/private/releves] [--dry-run]`) : lit les fichiers CSV
 * **privés** du dossier, vérifie chaque ligne (données, statut de validation, besoin du noyau,
 * variante, fichier de preuve présent dans `preuves/`) et écrit :
 * - le rapport privé `rapport.md` du même dossier (statut et motif de chaque ligne, preuves citées) ;
 * - l'instantané publiable `data/prices/live/releves.json` des seules lignes validées, sans nom de
 *   fichier, ni preuve, ni auteur, ni validateur (contrôle bloquant avant écriture).
 * Les fichiers restent la référence : l'instantané est entièrement recalculé à chaque import. Les
 * fichiers du dossier versionné `data/releves/` (modèle) ne sont jamais lus comme relevés réels.
 */
export async function jobReleves(ctx: JobContext) {
  const dir = typeof ctx.flags.dir === 'string' ? ctx.flags.dir : privateRelevesDir(ctx.env.dataDir);
  const publicDir = join(ctx.env.dataDir, 'releves');
  if (existsSync(publicDir)) {
    const stray = (await readdir(publicDir)).filter((f) => f.toLowerCase().endsWith('.csv') && f !== 'modele.csv');
    if (stray.length) ctx.log.warn('Fichiers de relevés dans le dossier versionné data/releves : non lus (à déplacer vers data/private/releves)', { fichiers: stray.length });
  }
  // Sans dossier privé (CI publique, nouvelle installation) : rien à importer, instantané inchangé.
  if (!existsSync(dir)) {
    ctx.log.warn('Aucun dossier privé de relevés : rien à importer, instantané inchangé (voir docs/RELEVES.md)', { dossier: dir });
    return;
  }
  const names = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
  const files = await Promise.all(names.map(async (name) => ({ name, content: await readFile(join(dir, name), 'utf8') })));
  const proofDir = join(dir, 'preuves');
  const proofFiles = new Set(existsSync(proofDir) ? (await readdir(proofDir)).filter((f) => PROOF_EXTENSIONS.test(f)) : []);
  const { stores } = await readStoresSnapshot(snapshotPath(ctx.env, 'stores'));
  const rules = (await readReviewedMatches(ctx.env.dataDir)).flatMap((r) => (r.offerRule ? [r.offerRule] : []));
  const batch = buildRelevesBatch(files, { now: ctx.now, stores, proofFiles, incompatible: incompatibleVariants(rules) });
  const r = batch.report;
  await writeFile(join(dir, 'rapport.md'), privateReport(batch.lines, ctx.now));
  if (!ctx.flags.quiet) {
    console.table(batch.lines.map((l) => ({ fichier: l.file, ligne: l.line, statut: STATUS_LABEL[l.status], besoin: l.need ?? '', motif: l.reasons.join(' ; ') })));
  }
  ctx.log.info('Relevés lus', { fichiers: names.length, preuves: proofFiles.size, ...r.accepted, ...r.metrics });
  if (ctx.flags['dry-run']) return;
  if (batch.prices.length === 0 && batch.promotions.length === 0) {
    ctx.log.warn('Aucun relevé publiable (validé, du noyau, avec preuve) : instantané inchangé');
    return;
  }
  const publicBatch = { retailerProducts: batch.retailerProducts, prices: batch.prices, promotions: batch.promotions };
  const leaks = privateLeaks(publicBatch, files);
  if (leaks.length) throw new Error(`Publication bloquée : ${leaks.length} donnée(s) privée(s) dans l'instantané (voir rapport privé)`);
  const path = await writeLiveSnapshot(ctx.env.dataDir, {
    connectorId: RELEVES_CONNECTOR_ID,
    label: 'Relevés en magasin (locaux, indicatifs)',
    license: null,
    attribution: null,
    collectedAt: ctx.now.toISOString(),
    status: 'success',
    message: `${r.metrics?.published ?? 0} relevé(s) validé(s) publié(s)`,
    metrics: { published: r.metrics?.published ?? 0, stores: r.metrics?.stores ?? 0, needs: r.metrics?.needs ?? 0 },
    batch: publicBatch,
  });
  ctx.log.info('Instantané des relevés écrit', { path });
}

/** Rapport privé de validation (dossier non versionné) : une ligne par relevé lu. */
function privateReport(lines: ReleveLine[], now: Date): string {
  const esc = (t: string | null) => (t ?? '').replace(/\|/g, '/');
  return [
    '# Relevés en magasin : rapport privé de validation',
    '',
    `Généré le ${now.toISOString()} par \`pnpm job releves\`. **Privé** : ne pas versionner ni partager.`,
    '',
    '| Fichier | Ligne | Statut | Enseigne | Magasin | Date | Besoin | Article | Preuve | Motifs |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...lines.map((l) => `| ${esc(l.file)} | ${l.line} | ${STATUS_LABEL[l.status]} | ${esc(l.chainId)} | ${esc(l.storeId)} | ${esc(l.date)} | ${esc(l.need)} | ${esc(l.article)} | ${esc(l.proof)} | ${esc(l.reasons.join(' ; '))} |`),
    '',
  ].join('\n');
}

/**
 * Magasins proches d'un NPA (`magasins --npa=1630 [--rayon=5] [--enseignes=migros,coop]`) :
 * identifiants à reporter dans la colonne « magasin » des relevés.
 */
export async function jobMagasins(ctx: JobContext) {
  const zip = String(ctx.flags.npa ?? '');
  if (!/^\d{4}$/.test(zip)) throw new Error('Usage : magasins --npa=1630 [--rayon=5] [--enseignes=migros,coop]');
  const radius = Number(ctx.flags.rayon ?? 5);
  const chains = typeof ctx.flags.enseignes === 'string' ? ctx.flags.enseignes.split(',') : ['migros', 'coop', 'denner', 'aldi', 'lidl'];
  const { list } = await readLocalitiesSnapshot(snapshotPath(ctx.env, 'localities'));
  const place = list.find((l) => l.zip === zip);
  if (!place) throw new Error(`NPA inconnu : ${zip}`);
  const { stores } = await readStoresSnapshot(snapshotPath(ctx.env, 'stores'));
  const near = withCrowDistance(place, stores.filter((s) => chains.includes(s.chainId)))
    .filter((s) => s.crowKm <= radius)
    .sort((a, b) => a.crowKm - b.crowKm);
  const chainName = new Map(CHAINS.map((c) => [c.id, c.name]));
  console.log(`Magasins à moins de ${radius} km de ${zip} ${place.name} (distance à vol d'oiseau) :`);
  console.table(near.map((s) => ({ magasin: s.id, enseigne: chainName.get(s.chainId) ?? s.chainId, nom: s.name, adresse: [s.street, s.zip, s.city].filter(Boolean).join(' '), km: s.crowKm.toFixed(1), plan: osmUrl(s.id) })));
}

/** Lien OpenStreetMap d'une succursale (`osm:node/123` → page du nœud), pour la reconnaître sur le plan. */
function osmUrl(id: string): string {
  return id.startsWith('osm:') ? `https://www.openstreetmap.org/${id.slice(4)}` : '';
}

/** Besoins prioritaires d'une fiche Migros Bulle (P12) : manquants à Migros, présents chez Lidl et Coop/Denner. */
const FICHE_DEFAUT = ['penne-500g', 'tomates-concassees-400g', 'farine-blanche-1kg', 'sucre-cristal-1kg', 'bananes-1kg'];

/**
 * Fiche de collecte d'un magasin (`fiche-releves --enseigne=migros --magasin=osm:node/… [--besoins=a,b]
 * [--nom=migros-bulle]`) : CSV prérempli (une ligne par besoin, statut « a_valider ») et guide
 * reprenant **exactement** la définition des besoins (désignation, quantité, exigences) et les
 * variantes exclues par les règles revues. Aucun prix : la fiche est publique, les relevés non.
 */
export async function jobFicheReleves(ctx: JobContext) {
  const chainId = String(ctx.flags.enseigne ?? '');
  const storeId = String(ctx.flags.magasin ?? '');
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain || !storeId) throw new Error('Usage : fiche-releves --enseigne=migros --magasin=osm:node/… [--besoins=penne-500g,…] [--nom=migros-bulle]');
  const { stores } = await readStoresSnapshot(snapshotPath(ctx.env, 'stores'));
  const store = stores.find((s) => s.id === storeId);
  if (!store || store.chainId !== chain.id) throw new Error(`Magasin ${storeId} inconnu ou d'une autre enseigne (pnpm job magasins --npa=…)`);
  const slugs = typeof ctx.flags.besoins === 'string' ? ctx.flags.besoins.split(',') : FICHE_DEFAUT;
  const core = new Set<string>(P1_ESSENTIALS);
  const needs = slugs.map((slug) => {
    const c = PRODUCTS.find((p) => p.slug === slug);
    if (!c || !core.has(slug)) throw new Error(`Besoin hors des 50 du noyau : ${slug}`);
    return c;
  });
  const rules = (await readReviewedMatches(ctx.env.dataDir)).flatMap((r) => (r.offerRule && !r.offerRule.alwaysReview ? [r.offerRule] : []));
  const name = typeof ctx.flags.nom === 'string' ? ctx.flags.nom : `${chain.id}-${(store.city ?? 'magasin').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const outDir = join(ctx.env.dataDir, '..', 'docs', 'releves');
  const csvRows = needs.map((c) => RELEVE_COLUMNS.map((col) => ({ enseigne: chain.id, magasin: store.id, besoin: c.slug, statut: 'a_valider' })[col as string] ?? '').join(';'));
  await writeFile(join(outDir, `fiche-${name}.csv`), `${[RELEVE_COLUMNS.join(';'), ...csvRows].join('\n')}\n`);

  const category = new Map(CATEGORIES.map((c) => [c.id, c.name]));
  const requirement = (c: (typeof PRODUCTS)[number]) =>
    [c.attributes.swissOrigin ? 'origine suisse (colonne suisse = oui)' : '', c.attributes.organic ? 'bio' : '', ...(c.attributes.labels ?? []).map((l) => `« ${l.toUpperCase()} » dans la désignation`), c.brandRequired ? `marque ${c.brandRequired}` : '']
      .filter(Boolean)
      .join(', ') || 'aucune';
  const rulesFor = (slug: string) => rules.filter((r: OfferRule) => r.canonicalSlug === slug);
  const address = (st: typeof store) => [st.name, st.street, [st.zip, st.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const place = address(store);
  const others = withCrowDistance(store, stores.filter((st) => st.chainId === chain.id && st.id !== store.id))
    .filter((st) => st.crowKm <= 3)
    .sort((a, b) => a.crowKm - b.crowKm);
  const md = [
    `# Fiche de collecte : ${chain.name}, ${store.city ?? store.id}`,
    '',
    `Générée par \`pnpm job fiche-releves --enseigne=${chain.id} --magasin=${store.id}\`. Magasin : **${place || store.name}** (\`${store.id}\`, ${osmUrl(store.id)}). Si vous relevez dans une autre succursale, remplacez l'identifiant dans la colonne \`magasin\` : un prix ne vaut que pour le magasin où il a été relevé.`,
    ...(others.length
      ? ['', `Autres succursales ${chain.name} à moins de 3 km : ${others.map((st) => `\`${st.id}\` (${address(st)}, ${st.crowKm.toFixed(1)} km)`).join(' ; ')}.`]
      : []),
    '',
    `Fichier à remplir : \`docs/releves/fiche-${name}.csv\` (copie à placer dans \`data/private/releves/\`, **jamais** dans le dépôt public). Une ligne par besoin ; ne rien inventer : case vide si l'information n'est pas affichée.`,
    '',
    '## Besoins à relever (définition exacte du projet)',
    '',
    '| Besoin | Désignation | Quantité de référence | Exigences | Variante à relever | Ne pas relever : mots exclus par les règles revues (radicaux, sans accents) |',
    '|---|---|---|---|---|---|',
    ...needs.map((c) => {
      const rs = rulesFor(c.slug);
      const excluded = [...new Set(rs.flatMap((r) => [...(r.exclude ?? []).map((w) => w.trim().replace(/-$/, '')), ...(r.organic === false ? ['bio'] : [])]))];
      const required = [...new Set(rs.flatMap((r) => r.require ?? []))];
      return `| \`${c.slug}\` | ${c.name} | ${formatQuantity(c.quantity)} | ${requirement(c)} | la moins chère de la variante ordinaire (marque propre acceptée)${required.length ? ` ; doit mentionner : ${required.join(', ')}` : ''} | ${excluded.join(', ') || '—'} |`;
    }),
    '',
    `Rayons : ${[...new Set(needs.map((c) => category.get(c.categoryId) ?? c.categoryId))].join(', ')}. Une autre contenance est acceptée (le comparateur compte les paquets entiers à acheter et le surplus) : noter la contenance exacte imprimée. Fruits au poids : \`au_poids\` = oui, \`unite\` = kg, prix au kilo affiché.`,
    '',
    '## Par ligne',
    '',
    '- `date` (jour du relevé), `article` (désignation affichée), `variante` (rigate, fine, en sachet…), `marque`, `code_barres` (sous le code, si lisible), `contenance` + `unite`, `prix_chf` (prix normal) et, si l’étiquette l’indique, `prix_action_chf`, `action_du`/`action_au` (dates imprimées seulement), `carte` (`cumulus` si le prix est réservé à la carte), `conditions` (« dès 2 », bon…).',
    '- `preuve` : **nom du fichier photo** de l’étiquette ou du ticket (ex. `IMG_2031.jpg`), à placer dans `data/private/releves/preuves/`. Une note sans photo reste « en attente » et n’est jamais publiée.',
    '- `releve_par` : initiales ou pseudonyme ; `statut` : laisser `a_valider` ; la personne qui vérifie la photo met `valide` et ses initiales dans `valide_par`.',
    '- Ne jamais recopier de numéro de carte ni d’autre donnée personnelle du ticket.',
    '',
    '## Après la visite',
    '',
    '```bash',
    'pnpm job releves --dry-run   # contrôle : rapport privé data/private/releves/rapport.md',
    'pnpm job releves             # publie les seules lignes validées (instantané épuré)',
    'pnpm job matrice-essentiels  # couverture mise à jour',
    '```',
    '',
  ].join('\n');
  await writeFile(join(outDir, `FICHE_${name.toUpperCase().replace(/-/g, '_')}.md`), md);
  ctx.log.info('Fiche de collecte écrite', { magasin: store.id, besoins: needs.length, fichier: `docs/releves/fiche-${name}.csv` });
}
