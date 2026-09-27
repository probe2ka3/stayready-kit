import { CHAINS } from '@cabas/reference';
import { ImportForm } from '@/components/admin/import-form';
import { AdminTitle, MemoryModeNotice } from '@/components/admin/ui';
import { requireAdmin } from '@/server/auth';
import { getPostgresData } from '@/server/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Imports' };

export default async function ImportsPage() {
  await requireAdmin();
  const pg = getPostgresData();
  return (
    <div className="space-y-4">
      <AdminTitle sub="Import structuré de prix et de promotions (CSV ou JSON) issus d’une source autorisée ou d’un relevé documenté. Format : docs/DONNEES.md ; exemples : data/imports/examples/.">
        Imports
      </AdminTitle>
      {!pg && <MemoryModeNotice />}
      <ImportForm chains={CHAINS.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
