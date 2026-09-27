import { formatQuantity, type Unit } from '@cabas/core';
import { listMatches } from '@cabas/db';
import { CHAINS } from '@cabas/reference';
import { AdminTitle, fmt, MemoryModeNotice, Table } from '@/components/admin/ui';
import { reviewMatchAction } from '@/server/admin-actions';
import { requireAdmin } from '@/server/auth';
import { getPostgresData } from '@/server/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Correspondances' };

const STATUSES = [
  ['suggested', 'À valider'],
  ['validated', 'Validées'],
  ['rejected', 'Rejetées'],
] as const;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const pg = getPostgresData();
  const sp = await searchParams;
  const status = STATUSES.some(([s]) => s === sp.status) ? (sp.status as string) : 'suggested';
  const chainId = CHAINS.some((c) => c.id === sp.chain) ? sp.chain : undefined;
  const q = sp.q?.slice(0, 60) || undefined;
  const includeDemo = sp.demo === '1';
  const rows = pg ? await listMatches(pg.handle, { status, chainId, q, includeDemo, limit: 300 }) : [];
  const q2 = (u: number, unit: string) => formatQuantity({ amount: u, unit: unit as Unit });

  return (
    <div className="space-y-4">
      <AdminTitle sub="Rattachement des articles des enseignes aux références normalisées. Seules les correspondances validées sont utilisées par le comparateur ; vos décisions ne sont jamais écrasées par un import.">
        Correspondances
      </AdminTitle>
      {!pg && <MemoryModeNotice />}
      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label>
          Statut
          <select name="status" defaultValue={status} className="mt-1 block h-10 rounded-lg border border-border bg-surface px-2">
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Enseigne
          <select name="chain" defaultValue={chainId ?? ''} className="mt-1 block h-10 rounded-lg border border-border bg-surface px-2">
            <option value="">Toutes</option>
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Recherche
          <input name="q" defaultValue={q ?? ''} className="mt-1 block h-10 rounded-lg border border-border bg-surface px-2" />
        </label>
        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" name="demo" value="1" defaultChecked={includeDemo} /> inclure la démo
        </label>
        <button type="submit" className="h-10 rounded-lg border border-border px-3 font-medium">
          Filtrer
        </button>
      </form>
      <Table head={['Référence normalisée', 'Article de l’enseigne', 'Type', 'Confiance', 'Décision']}>
        {rows.map((r) => (
          <tr key={`${r.canonicalId}/${r.retailerProductId}`} className={r.isDemo ? 'opacity-70' : ''}>
            <td className="px-3 py-2">
              <p className="font-medium">{r.canonicalName}</p>
              <p className="text-muted">{q2(r.canonicalAmount, r.canonicalUnit)}</p>
            </td>
            <td className="px-3 py-2">
              <p className="font-medium">{r.retailerName}</p>
              <p className="text-muted">
                {CHAINS.find((c) => c.id === r.chainId)?.name} · {q2(r.retailerAmount, r.retailerUnit)}
                {r.brand ? ` · ${r.brand}` : ''} {r.isDemo ? '· démo' : ''}
              </p>
            </td>
            <td className="px-3 py-2">{r.kind}</td>
            <td className="px-3 py-2">{Math.round(r.confidence * 100)} %</td>
            <td className="px-3 py-2">
              <form action={reviewMatchAction} className="flex flex-wrap items-center gap-1.5">
                <input type="hidden" name="canonicalId" value={r.canonicalId} />
                <input type="hidden" name="retailerProductId" value={r.retailerProductId} />
                <select name="kind" defaultValue={r.kind} aria-label="Type de correspondance" className="h-9 rounded-lg border border-border bg-surface px-1">
                  <option value="gtin">GTIN</option>
                  <option value="equivalent">équivalent</option>
                  <option value="similar">conditionnement différent</option>
                </select>
                <button name="decision" value="validated" className="h-9 rounded-lg bg-primary px-2.5 font-semibold text-on-primary">
                  Valider
                </button>
                <button name="decision" value="rejected" className="h-9 rounded-lg border border-danger/40 px-2.5 font-semibold text-danger">
                  Rejeter
                </button>
              </form>
              {r.reviewedBy && (
                <p className="mt-1 text-xs text-muted">
                  {r.reviewedBy} · {fmt(r.reviewedAt)}
                </p>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {pg && rows.length === 0 && <p className="text-muted">Aucune correspondance pour ces critères.</p>}
    </div>
  );
}
