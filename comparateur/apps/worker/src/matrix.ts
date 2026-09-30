import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildOfferIndex,
  DEFAULT_FRESHNESS,
  DEFAULT_PREFS,
  formatQuantity,
  sourceInfo,
  zurichToday,
  resolveLine,
  type CanonicalProduct,
  type LineOption,
  type OfferIndex,
  type PriceProfile,
} from '@cabas/core';
import { matchesFor, readLiveSnapshots, readReviewedMatches, type LiveSnapshot } from '@cabas/connectors';
import { CATEGORIES, CHAINS, P1_ESSENTIALS, PRODUCTS } from '@cabas/reference';
import type { JobContext } from './jobs';

/** Enseignes de l'objectif initial. */
export const MATRIX_CHAINS = ['migros', 'coop', 'denner', 'aldi', 'lidl'] as const;

/**
 * Statut d'un couple besoin × enseigne, du plus au moins utile :
 * - official_public : prix officiel d'une source réutilisable publiquement (Lidl ; ⚖️ avis conseillé) ;
 * - store_survey : relevé en magasin (vaut pour ce magasin seulement) ;
 * - community : relevé communautaire Open Prices (ODbL), daté ;
 * - private_only : prix officiel d'une source dont les conditions interdisent l'usage public (Aldi) :
 *   pilote privé de l'exploitant uniquement ;
 * - stale : seul un prix trop ancien existe ;
 * - missing : aucune donnée gratuite.
 */
export type CellStatus = 'official_public' | 'store_survey' | 'community' | 'private_only' | 'stale' | 'missing';

const RANK: Record<CellStatus, number> = { official_public: 0, store_survey: 1, community: 2, private_only: 3, stale: 4, missing: 5 };
export const PUBLIC_STATUSES: CellStatus[] = ['official_public', 'store_survey', 'community'];
export const STATUS_LABEL: Record<CellStatus, string> = {
  official_public: 'officiel',
  store_survey: 'relevé local',
  community: 'Open Prices',
  private_only: 'privé seulement',
  stale: 'trop ancien',
  missing: 'aucune donnée',
};
const SYMBOL: Record<CellStatus, string> = { official_public: '●', store_survey: '◆', community: '○', private_only: '◐', stale: '·', missing: '—' };

export interface MatrixCell {
  status: CellStatus;
  connectorId: string | null;
  /** Montant pour la quantité du besoin (paquets entiers) et prix au kilo, au litre ou à la pièce. */
  totalCents: number | null;
  unitPrice: LineOption['unitPrice'] | null;
  productName: string | null;
  packs: number | null;
  observedAt: string | null;
  scope: string | null;
  place: string | null;
  promotion: { validFrom: string; validTo: string; confirmed: boolean } | null;
  reasons: string[];
}

export interface MatrixRow {
  slug: string;
  name: string;
  quantity: string;
  category: string;
  cells: Record<string, MatrixCell>;
  publicChains: number;
  privateChains: number;
}

export interface EssentialsMatrix {
  generatedAt: string;
  sources: Array<{ connectorId: string; collectedAt: string; publicUse: string }>;
  rows: MatrixRow[];
  summary: {
    needs: number;
    byChain: Record<string, Record<CellStatus, number>>;
    comparablePublic: Record<'1' | '2' | '3' | '4' | '5', number>;
    comparablePrivate: Record<'1' | '2' | '3' | '4' | '5', number>;
  };
}

function statusFor(connectorId: string): CellStatus {
  const info = sourceInfo({ connectorId, kind: 'retailer_site' });
  if (info.publicUse === 'requires_authorization' || info.publicUse === 'licence_required') return 'private_only';
  if (info.collectionMethod === 'manual_survey') return 'store_survey';
  if (info.tier === 'first_party') return 'official_public';
  return 'community';
}

/** Profils de prix présents dans l'index pour une enseigne : national, zones, magasins relevés. */
function profilesFor(index: OfferIndex, chainId: string): PriceProfile[] {
  const zones = new Set<string>();
  const stores = new Set<string>();
  for (const [productId, list] of index.pricesByProduct) {
    if (index.products.get(productId)?.chainId !== chainId) continue;
    for (const o of list) {
      if (o.storeId) stores.add(o.storeId);
      else if (o.zoneId) zones.add(o.zoneId);
    }
  }
  for (const [productId, list] of index.promotionsByProduct) {
    if (index.products.get(productId)?.chainId !== chainId) continue;
    for (const p of list) {
      if (p.storeId) stores.add(p.storeId);
      else if (p.zoneId) zones.add(p.zoneId);
    }
  }
  return [
    { key: `${chainId}|*|*`, chainId, zoneId: null, storeId: null },
    ...[...zones].map((z) => ({ key: `${chainId}|${z}|*`, chainId, zoneId: z, storeId: null })),
    ...[...stores].map((s) => ({ key: `${chainId}|*|${s}`, chainId, zoneId: null, storeId: s })),
  ];
}

/**
 * Matrice des 50 besoins du noyau × 5 enseignes, calculée source par source avec les mêmes règles que
 * le comparateur (correspondances revues, exigences, fraîcheur, paquets entiers, actions datées).
 */
export function buildEssentialsMatrix(snapshots: LiveSnapshot[], reviewed: Parameters<typeof matchesFor>[2], now: Date): EssentialsMatrix {
  const today = zurichToday(now);
  const ctx = { asOf: now, today, targetDate: today, policy: DEFAULT_FRESHNESS, prefs: DEFAULT_PREFS };
  const catBySlug = new Map(PRODUCTS.map((p) => [p.slug, p]));
  const catName = new Map(CATEGORIES.map((c) => [c.id, c.name]));
  const perSource = snapshots.map((s) => {
    const products = s.batch.retailerProducts;
    const { matches } = matchesFor(products, PRODUCTS, reviewed);
    const index = buildOfferIndex({ products, matches, prices: s.batch.prices, promotions: s.batch.promotions }, { allowBenchmarkSources: false });
    return { connectorId: s.connectorId, status: statusFor(s.connectorId), index, profiles: new Map(MATRIX_CHAINS.map((c) => [c, profilesFor(index, c)])) };
  });

  const rows: MatrixRow[] = [];
  for (const slug of P1_ESSENTIALS) {
    const canonical = catBySlug.get(slug) as CanonicalProduct;
    const line = { id: 'l1', productId: canonical.id, qty: 1 };
    const cells: Record<string, MatrixCell> = {};
    for (const chainId of MATRIX_CHAINS) {
      let best: MatrixCell = emptyCell('missing');
      for (const src of perSource) {
        for (const profile of src.profiles.get(chainId) ?? []) {
          const out = resolveLine(line, canonical, profile, src.index, ctx);
          let cell: MatrixCell | null = null;
          if (out.option) {
            const o = out.option;
            cell = {
              status: src.status,
              connectorId: src.connectorId,
              totalCents: o.totalCents,
              unitPrice: o.unitPrice,
              productName: o.productName,
              packs: o.packs,
              observedAt: o.observedAt,
              scope: profile.storeId ? `magasin ${profile.storeId}` : profile.zoneId ? `zone ${profile.zoneId}` : 'national',
              place: o.observedAtPlace ?? null,
              promotion: o.promotion ? { validFrom: o.promotion.validFrom, validTo: o.promotion.validTo, confirmed: o.status === 'promo_confirmed' } : null,
              reasons: o.statusReasons,
            };
          } else if (out.unavailable?.reason === 'stale_price_excluded' && out.unavailable.lastKnown) {
            cell = { ...emptyCell('stale'), connectorId: src.connectorId, observedAt: out.unavailable.lastKnown.observedAt };
          }
          if (!cell) continue;
          const better = RANK[cell.status] < RANK[best.status] || (RANK[cell.status] === RANK[best.status] && (cell.totalCents ?? Infinity) < (best.totalCents ?? Infinity));
          if (better) best = cell;
        }
      }
      cells[chainId] = best;
    }
    const statuses = MATRIX_CHAINS.map((c) => cells[c]?.status as CellStatus);
    rows.push({
      slug,
      name: canonical.name,
      quantity: formatQuantity(canonical.quantity),
      category: catName.get(canonical.categoryId) ?? canonical.categoryId,
      cells,
      publicChains: statuses.filter((s) => PUBLIC_STATUSES.includes(s)).length,
      privateChains: statuses.filter((s) => PUBLIC_STATUSES.includes(s) || s === 'private_only').length,
    });
  }

  // Regroupement par rayon (ordre du catalogue), ordre du noyau à l'intérieur d'un rayon.
  const catSort = new Map(CATEGORIES.map((c) => [c.name, c.sort]));
  rows.sort((a, b) => (catSort.get(a.category) ?? 999) - (catSort.get(b.category) ?? 999));
  const byChain = Object.fromEntries(
    MATRIX_CHAINS.map((c) => [c, Object.fromEntries((Object.keys(RANK) as CellStatus[]).map((s) => [s, rows.filter((r) => r.cells[c]?.status === s).length]))]),
  ) as EssentialsMatrix['summary']['byChain'];
  const atLeast = (key: 'publicChains' | 'privateChains') =>
    Object.fromEntries(['1', '2', '3', '4', '5'].map((k) => [k, rows.filter((r) => r[key] >= Number(k)).length])) as EssentialsMatrix['summary']['comparablePublic'];
  return {
    generatedAt: now.toISOString(),
    sources: snapshots.map((s) => ({ connectorId: s.connectorId, collectedAt: s.collectedAt, publicUse: sourceInfo({ connectorId: s.connectorId, kind: 'retailer_site' }).publicUse })),
    rows,
    summary: { needs: rows.length, byChain, comparablePublic: atLeast('publicChains'), comparablePrivate: atLeast('privateChains') },
  };
}

function emptyCell(status: CellStatus): MatrixCell {
  return { status, connectorId: null, totalCents: null, unitPrice: null, productName: null, packs: null, observedAt: null, scope: null, place: null, promotion: null, reasons: [] };
}

const chf = (c: number | null) => (c == null ? '—' : (c / 100).toFixed(2));
const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const unitTxt = (u: MatrixCell['unitPrice']) => (u ? `${chf(u.cents)}/${u.basis === 'piece' ? 'pce' : u.basis}` : '');

export function matrixMarkdown(m: EssentialsMatrix): string {
  const chainName = new Map(CHAINS.map((c) => [c.id, c.name]));
  const s = m.summary;
  const out = [
    '# Matrice des 50 aliments de base × 5 enseignes',
    '',
    `Calculée par \`pnpm job matrice-essentiels --now=${m.generatedAt}\` sur les instantanés versionnés :`,
    ...m.sources.map((x) => `- \`${x.connectorId}\` du ${dm(x.collectedAt)} (réutilisation : ${x.publicUse})`),
    '',
    'Mêmes règles que le comparateur : correspondances revues, exigences du besoin (bio, Suisse, AOP, sans lactose…), paquets entiers, fraîcheur (officiel ≤ 30 jours, communautaire ≤ 90 jours), actions datées. Montant = prix payé pour la quantité du besoin ; entre parenthèses, prix au kilo, au litre ou à la pièce.',
    '',
    `Légende : ${(Object.keys(SYMBOL) as CellStatus[]).map((k) => `${SYMBOL[k]} ${STATUS_LABEL[k]}`).join(' · ')}.`,
    '',
    '## Résumé',
    '',
    '| Enseigne | ' + (Object.keys(SYMBOL) as CellStatus[]).map((k) => `${SYMBOL[k]} ${STATUS_LABEL[k]}`).join(' | ') + ' |',
    '|---|' + (Object.keys(SYMBOL) as CellStatus[]).map(() => '---|').join(''),
    ...MATRIX_CHAINS.map((c) => `| ${chainName.get(c)} | ${(Object.keys(SYMBOL) as CellStatus[]).map((k) => s.byChain[c]?.[k] ?? 0).join(' | ')} |`),
    '',
    '| Besoins comparables dans au moins… | 1 enseigne | 2 | 3 | 4 | 5 |',
    '|---|---|---|---|---|---|',
    `| Version publique (sans Aldi) | ${(['1', '2', '3', '4', '5'] as const).map((k) => s.comparablePublic[k]).join(' | ')} |`,
    `| Pilote privé (avec Aldi) | ${(['1', '2', '3', '4', '5'] as const).map((k) => s.comparablePrivate[k]).join(' | ')} |`,
    '',
    '## Détail',
    '',
    `| Besoin | ${MATRIX_CHAINS.map((c) => chainName.get(c)).join(' | ')} | Public | Privé |`,
    `|---|${MATRIX_CHAINS.map(() => '---|').join('')}---|---|`,
  ];
  let category = '';
  for (const r of m.rows) {
    if (r.category !== category) {
      category = r.category;
      out.push(`| **${category}** |${MATRIX_CHAINS.map(() => ' |').join('')} | |`);
    }
    const cells = MATRIX_CHAINS.map((c) => {
      const x = r.cells[c] as MatrixCell;
      if (x.status === 'missing') return SYMBOL.missing;
      if (x.status === 'stale') return `${SYMBOL.stale} trop ancien (${dm(x.observedAt)})`;
      const promo = x.promotion ? `, action ${dm(x.promotion.validFrom).slice(0, 5)}–${dm(x.promotion.validTo).slice(0, 5)}` : '';
      const weight = x.reasons.includes('variable_weight') ? ', au poids' : '';
      return `${SYMBOL[x.status]} ${chf(x.totalCents)} (${unitTxt(x.unitPrice)}) ${dm(x.observedAt)}${promo}${weight}`;
    });
    out.push(`| ${r.name} (${r.quantity}) | ${cells.join(' | ')} | ${r.publicChains} | ${r.privateChains} |`);
  }
  out.push(
    '',
    'Les cellules « relevé local » ne valent que pour le magasin relevé ; « Open Prices » : relevé communautaire d’un magasin, généralisé à la zone (Migros) ou au pays selon la politique tarifaire de l’enseigne ; « privé seulement » : prix Aldi, dont les conditions d’utilisation réservent le site à un usage privé (jamais publiés sans autorisation écrite).',
    '',
  );
  return out.join('\n');
}

/**
 * `matrice-essentiels [--now=ISO] [--out=dossier]` : écrit `data/matrice/essentiels.{md,json}` et la
 * page statique publique `data/public/index.html` (vue publique seulement, jamais Aldi).
 */
export async function jobEssentialsMatrix(ctx: JobContext) {
  const now = typeof ctx.flags.now === 'string' ? new Date(ctx.flags.now) : ctx.now;
  const dataDir = ctx.env.dataDir;
  const snapshots = await readLiveSnapshots(dataDir);
  const matrix = buildEssentialsMatrix(snapshots, await readReviewedMatches(dataDir), now);
  const outDir = typeof ctx.flags.out === 'string' ? ctx.flags.out : join(dataDir, 'matrice');
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'essentiels.json'), `${JSON.stringify(matrix, null, 1)}\n`);
  const md = matrixMarkdown(matrix);
  await writeFile(join(outDir, 'essentiels.md'), md);
  const publicDir = typeof ctx.flags.public === 'string' ? ctx.flags.public : join(dataDir, 'public');
  await mkdir(publicDir, { recursive: true });
  const template = await readFile(join(dataDir, 'public', 'template.html'), 'utf8');
  await writeFile(join(publicDir, 'index.html'), publicPage(template, matrix));
  if (!ctx.flags.quiet) console.log(md.split('## Détail')[0]);
  ctx.log.info('Matrice écrite', { outDir, publicDir, public: matrix.summary.comparablePublic, private: matrix.summary.comparablePrivate });
}

/**
 * Page publique statique (GitHub Pages ou tout hébergement de fichiers) : vue publique uniquement.
 * Les prix « privé seulement » (Aldi) n'y figurent jamais : ni montant, ni article, ni date.
 */
export function publicPage(template: string, m: EssentialsMatrix): string {
  const rows = m.rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    quantity: r.quantity,
    category: r.category,
    cells: Object.fromEntries(
      MATRIX_CHAINS.map((c) => {
        const x = r.cells[c] as MatrixCell;
        if (!PUBLIC_STATUSES.includes(x.status)) return [c, { status: x.status === 'stale' && x.connectorId && statusFor(x.connectorId) !== 'private_only' ? 'stale' : 'missing' }];
        return [
          c,
          {
            status: x.status,
            total: x.totalCents,
            unit: x.unitPrice,
            product: x.productName,
            packs: x.packs,
            date: x.observedAt,
            scope: x.scope,
            place: x.place,
            promo: x.promotion,
            weight: x.reasons.includes('variable_weight'),
          },
        ];
      }),
    ),
  }));
  const publicSources = m.sources.filter((s) => s.publicUse !== 'requires_authorization' && s.publicUse !== 'licence_required');
  const data = { generatedAt: m.generatedAt, sources: publicSources, chains: MATRIX_CHAINS.map((c) => ({ id: c, name: CHAINS.find((x) => x.id === c)?.name ?? c })), rows, comparable: m.summary.comparablePublic };
  return template.replace('/*__DATA__*/null', JSON.stringify(data).replace(/</g, '\\u003c'));
}
