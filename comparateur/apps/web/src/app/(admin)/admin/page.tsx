import Link from 'next/link';
import { priceConnectors } from '@cabas/connectors';
import { listAnomalies, listMatches, listRuns } from '@cabas/db';
import { CHAINS } from '@cabas/reference';
import { AdminTitle, fmt, MemoryModeNotice, Table } from '@/components/admin/ui';
import { runQualityAction } from '@/server/admin-actions';
import { requireAdmin } from '@/server/auth';
import { getAppData, getPostgresData } from '@/server/data';
import { serverEnv } from '@/server/env';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tableau de bord' };

export default async function AdminHome() {
  await requireAdmin();
  const data = getAppData();
  const pg = getPostgresData();
  const now = new Date();
  const status = await data.chainStatus(now);
  const connectors = await Promise.all(
    priceConnectors().map(async (c) => ({ id: c.id, label: c.label, ...(await c.status({ importDir: serverEnv.importDir, env: process.env })) })),
  );
  const [runs, anomalies, suggested] = pg
    ? await Promise.all([listRuns(pg.handle, 8), listAnomalies(pg.handle, { limit: 500 }), listMatches(pg.handle, { status: 'suggested', limit: 500 })])
    : [[], [], []];
  const chainName = new Map(CHAINS.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <AdminTitle sub={`Stockage : ${data.mode === 'postgres' ? 'PostgreSQL' : 'mémoire (démonstration)'}`}>Tableau de bord</AdminTitle>
      {!pg && <MemoryModeNotice />}

      {pg && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/admin/anomalies" className="rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2">
            <p className="text-sm text-muted">Anomalies ouvertes</p>
            <p className="text-3xl font-bold">{anomalies.length}</p>
          </Link>
          <Link href="/admin/correspondances" className="rounded-2xl border border-border bg-surface p-4 hover:bg-surface-2">
            <p className="text-sm text-muted">Correspondances à valider</p>
            <p className="text-3xl font-bold">{suggested.length}</p>
          </Link>
          <form action={runQualityAction} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">Contrôles de qualité</p>
            <button type="submit" className="mt-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-on-primary">
              Lancer maintenant
            </button>
          </form>
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Données par enseigne</h2>
        <Table head={['Enseigne', 'Succursales', 'Articles', 'dont démo', 'Prix réels', 'Dernière vérification', 'Promos en cours', 'Promos annoncées']}>
          {status.map((s) => (
            <tr key={s.chainId}>
              <td className="px-3 py-2 font-medium">{chainName.get(s.chainId) ?? s.chainId}</td>
              <td className="px-3 py-2">{s.stores}</td>
              <td className="px-3 py-2">{s.products}</td>
              <td className="px-3 py-2">{s.demoProducts}</td>
              <td className="px-3 py-2">{s.realPrices}</td>
              <td className="px-3 py-2">{fmt(s.lastObservation)}</td>
              <td className="px-3 py-2">{s.activePromotions}</td>
              <td className="px-3 py-2">{s.upcomingPromotions}</td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Connecteurs</h2>
        <Table head={['Connecteur', 'État', 'Détail']}>
          {connectors.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2 font-medium">{c.label}</td>
              <td className="px-3 py-2">{c.state === 'ready' ? '✅ prêt' : c.state === 'awaiting_authorization' ? '⏳ en attente d’autorisation' : c.state}</td>
              <td className="px-3 py-2 text-muted">{c.message}</td>
            </tr>
          ))}
        </Table>
        <p className="text-sm text-muted">
          Les connecteurs s’exécutent par la tâche planifiée <code>pnpm job daily</code>. Les imports manuels passent par la page Imports.
        </p>
      </section>

      {pg && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Dernières exécutions</h2>
          <Table head={['Début', 'Connecteur', 'Type', 'État', 'Statistiques']}>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{fmt(r.startedAt)}</td>
                <td className="px-3 py-2">{r.connectorId}</td>
                <td className="px-3 py-2">{r.kind}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="max-w-md truncate px-3 py-2 text-muted">{JSON.stringify(r.stats)}</td>
              </tr>
            ))}
          </Table>
        </section>
      )}
    </div>
  );
}
