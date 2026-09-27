import { listAnomalies } from '@cabas/db';
import { AdminTitle, fmt, MemoryModeNotice, Table } from '@/components/admin/ui';
import { resolveAnomalyAction } from '@/server/admin-actions';
import { requireAdmin } from '@/server/auth';
import { getPostgresData } from '@/server/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Anomalies' };

const SEVERITY: Record<string, string> = { error: '🔴 erreur', warning: '🟠 alerte', info: '🔵 info' };

export default async function AnomaliesPage() {
  await requireAdmin();
  const pg = getPostgresData();
  const rows = pg ? await listAnomalies(pg.handle, { limit: 300 }) : [];
  return (
    <div className="space-y-4">
      <AdminTitle sub="Détectées automatiquement (prix périmés, variations brutales, promotions incohérentes, prix unitaires aberrants). « Écarter la donnée » retire le prix ou la promotion du comparateur.">
        Anomalies ouvertes
      </AdminTitle>
      {!pg && <MemoryModeNotice />}
      <Table head={['Détectée', 'Gravité', 'Type', 'Objet', 'Message', 'Action']}>
        {rows.map((a) => (
          <tr key={a.id}>
            <td className="px-3 py-2">{fmt(a.detectedAt)}</td>
            <td className="px-3 py-2">{SEVERITY[a.severity] ?? a.severity}</td>
            <td className="px-3 py-2">{a.kind}</td>
            <td className="px-3 py-2 font-mono text-xs">
              {a.entityType}
              <br />
              {a.entityId}
            </td>
            <td className="px-3 py-2">
              {a.message}
              {Object.keys(a.details as object).length > 0 && <p className="text-xs text-muted">{JSON.stringify(a.details)}</p>}
            </td>
            <td className="px-3 py-2">
              <form action={resolveAnomalyAction} className="flex flex-col gap-1">
                <input type="hidden" name="id" value={a.id} />
                <button name="resolution" value="fixed" className="rounded-lg border border-border px-2 py-1">
                  Corrigée
                </button>
                <button name="resolution" value="ignored" className="rounded-lg border border-border px-2 py-1">
                  Ignorer
                </button>
                <button name="resolution" value="rejected_data" className="rounded-lg border border-danger/40 px-2 py-1 text-danger">
                  Écarter la donnée
                </button>
              </form>
            </td>
          </tr>
        ))}
      </Table>
      {pg && rows.length === 0 && <p className="text-muted">Aucune anomalie ouverte.</p>}
    </div>
  );
}
