import { listAudit, listRuns } from '@cabas/db';
import { AdminTitle, fmt, MemoryModeNotice, Table } from '@/components/admin/ui';
import { requireAdmin } from '@/server/auth';
import { getPostgresData } from '@/server/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Journal' };

export default async function JournalPage() {
  await requireAdmin();
  const pg = getPostgresData();
  const [runs, auditRows] = pg ? await Promise.all([listRuns(pg.handle, 100), listAudit(pg.handle, 100)]) : [[], []];
  return (
    <div className="space-y-6">
      <AdminTitle sub="Traçabilité des mises à jour : exécutions des connecteurs et actions des administrateurs.">Journal</AdminTitle>
      {!pg && <MemoryModeNotice />}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Exécutions (imports, connecteurs, contrôles)</h2>
        <Table head={['Début', 'Fin', 'Connecteur', 'Type', 'Par', 'État', 'Statistiques', 'Problèmes']}>
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{fmt(r.startedAt)}</td>
              <td className="px-3 py-2">{fmt(r.finishedAt)}</td>
              <td className="px-3 py-2">{r.connectorId}</td>
              <td className="px-3 py-2">{r.kind}</td>
              <td className="px-3 py-2">{r.triggeredBy}</td>
              <td className="px-3 py-2">{r.status}</td>
              <td className="max-w-xs truncate px-3 py-2 text-muted">{JSON.stringify(r.stats)}</td>
              <td className="px-3 py-2">{Array.isArray(r.issues) ? r.issues.length : 0}{r.message ? ` · ${r.message}` : ''}</td>
            </tr>
          ))}
        </Table>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Actions des administrateurs</h2>
        <Table head={['Date', 'Auteur', 'Action', 'Objet', 'Détails']}>
          {auditRows.map((a) => (
            <tr key={a.id}>
              <td className="px-3 py-2">{fmt(a.at)}</td>
              <td className="px-3 py-2">{a.actor}</td>
              <td className="px-3 py-2">{a.action}</td>
              <td className="px-3 py-2 font-mono text-xs">{[a.entityType, a.entityId].filter(Boolean).join(' ')}</td>
              <td className="max-w-md truncate px-3 py-2 text-muted">{JSON.stringify(a.details)}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
