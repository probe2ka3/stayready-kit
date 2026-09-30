import { TIER_LABEL, type QualityIssueKind, type SourceTier } from '@cabas/core';
import { CHAINS, PRODUCTS } from '@cabas/reference';
import { AdminTitle, fmt, Table } from '@/components/admin/ui';
import { requireAdmin } from '@/server/auth';
import { dataQualityView, latestDailyRun } from '@/server/data-quality';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Qualité des données' };

const KIND_LABEL: Record<QualityIssueKind, string> = {
  connector_broken: 'Connecteurs en panne',
  suspicious_price: 'Prix suspects',
  abnormal_change: 'Variations anormales',
  inconsistent_quantity: 'Contenances incohérentes',
  duplicate: 'Doublons',
  stale_data: 'Données anciennes',
  source_divergence: 'Divergences entre sources',
  promo_as_regular: 'Action lue comme prix normal',
};

const SEVERITY_CLASS = { error: 'text-danger', warning: 'text-warn', info: 'text-muted' } as const;

/**
 * Qualité des données et couverture : références couvertes par enseigne, comparables dans 2, 3, 4
 * ou 5 enseignes, fraîcheur des prix, alertes du contrôle de qualité et état des sources.
 */
export default async function DataQuality({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireAdmin();
  const { type } = await searchParams;
  const { coverage, quality, sources } = await dataQualityView();
  const run = latestDailyRun();
  const minutes = (ms: number) => `${Math.round(ms / 6000) / 10} min`;
  const chainName = new Map(CHAINS.map((c) => [c.id, c.name]));
  const productName = new Map(PRODUCTS.map((p) => [p.id, p.name]));
  const issues = type ? quality.issues.filter((i) => i.kind === type) : quality.issues;
  const f = coverage.freshness;
  const share = (n: number) => (f.total ? `${Math.round((n / f.total) * 100)} %` : '—');

  return (
    <div className="space-y-6">
      <AdminTitle sub={`Calculé le ${fmt(coverage.at)} à partir des dernières collectes et des correspondances revues. Seules les correspondances validées comptent.`}>
        Qualité des données
      </AdminTitle>

      <div className="grid gap-3 sm:grid-cols-4">
        {(['2', '3', '4', '5'] as const).map((n) => (
          <div key={n} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">Comparables dans ≥ {n} enseignes</p>
            <p className="text-2xl font-bold">{coverage.comparable[n]}</p>
            <p className="text-xs text-muted">sur {coverage.catalogSize} références du catalogue</p>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Couverture par enseigne</h2>
        <Table head={['Enseigne', 'Références couvertes', 'dont source officielle', 'Articles', 'Avec prix utilisable', '< 24 h', '< 48 h', '< 7 j', 'Plus ancien']}>
          {coverage.chains.map((c) => (
            <tr key={c.chainId}>
              <td className="px-3 py-2 font-medium">{chainName.get(c.chainId) ?? c.chainId}</td>
              <td className="px-3 py-2">
                {c.references} <span className="text-muted">({Math.round(c.share * 100)} %)</span>
              </td>
              <td className="px-3 py-2">{c.referencesFirstParty}</td>
              <td className="px-3 py-2">{c.products}</td>
              <td className="px-3 py-2">{c.pricedProducts}</td>
              <td className="px-3 py-2">{c.fresh24h}</td>
              <td className="px-3 py-2">{c.fresh48h}</td>
              <td className="px-3 py-2">{c.fresh7d}</td>
              <td className="px-3 py-2">{c.older}</td>
            </tr>
          ))}
        </Table>
        <p className="text-sm text-muted">
          Fraîcheur des prix utilisables : {share(f.h24)} de moins de 24 h, {share(f.h24 + f.h48)} de moins de 48 h,{' '}
          {share(f.h24 + f.h48 + f.d7)} de moins de 7 jours ({f.total} articles).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Collecte quotidienne</h2>
        {!run ? (
          <p className="text-sm text-muted">Aucun journal : lancer « pnpm job quotidien » (ou installer la tâche planifiée, docs/COLLECTE_QUOTIDIENNE.md).</p>
        ) : (
          <>
            <p className="text-sm">
              Dernière exécution le {fmt(run.finishedAt)} ({minutes(run.durationMs)} ; {run.requests} requêtes pour la journée, reprises comprises) :{' '}
              <span className={run.ok ? 'font-semibold' : 'font-semibold text-danger'}>{run.ok ? 'données produites' : 'aucune source n’a abouti'}</span>
              {run.validation ? ` · contrôle de non-régression ${run.validation.passed}/${run.validation.checked}` : ''}
            </p>
            <Table head={['Source', 'État', 'Requêtes', 'Articles', 'Prix', 'Actions', 'Durée', 'Dernière collecte réussie', 'Message']}>
              {run.sources.map((s) => (
                <tr key={s.connector}>
                  <td className="px-3 py-2 font-medium">{s.connector}</td>
                  <td className={`px-3 py-2 ${s.status === 'success' ? '' : 'text-warn'}`}>{s.status}</td>
                  <td className="px-3 py-2">{s.requests}</td>
                  <td className="px-3 py-2">{s.products}</td>
                  <td className="px-3 py-2">{s.prices}</td>
                  <td className="px-3 py-2">{s.promotions}</td>
                  <td className="px-3 py-2">{minutes(s.durationMs)}</td>
                  <td className="px-3 py-2">{fmt(s.collectedAt)}</td>
                  <td className="px-3 py-2 text-muted">{s.message ?? ''}</td>
                </tr>
              ))}
            </Table>
            <Table head={['Enseigne', 'Collecte automatique', 'Besoins du noyau avec prix', 'Lus le jour même', 'Dernier relevé', 'Actions en cours', 'Fin non publiée']}>
              {run.chains.map((c) => (
                <tr key={c.chainId}>
                  <td className="px-3 py-2 font-medium">{chainName.get(c.chainId) ?? c.chainId}</td>
                  <td className="px-3 py-2">{c.automatic === 'public' ? 'oui, publiable' : c.automatic === 'private' ? 'oui, usage privé' : 'non'}</td>
                  <td className="px-3 py-2">{c.coreNeedsPriced}/50</td>
                  <td className="px-3 py-2">{c.coreNeedsToday}</td>
                  <td className="px-3 py-2">{fmt(c.newestObservation)}</td>
                  <td className="px-3 py-2">{c.promotionsActive}</td>
                  <td className="px-3 py-2">{c.promotionsEndUnknown}</td>
                </tr>
              ))}
            </Table>
            {run.steps.some((s) => !s.ok) && (
              <p className="text-sm text-danger">Étapes en échec : {run.steps.filter((s) => !s.ok).map((s) => `${s.step} (${s.message ?? ''})`).join(' ; ')}</p>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Sources</h2>
        <Table head={['Source', 'Niveau', 'Dernière collecte', 'État', 'Articles', 'Prix', 'Actions', 'Licence']}>
          {sources.map((s) => (
            <tr key={s.connectorId}>
              <td className="px-3 py-2 font-medium">
                {s.provider}
                {s.benchmarkOnly && <span className="ml-2 rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">comparaison uniquement</span>}
              </td>
              <td className="px-3 py-2">{TIER_LABEL[s.tier as SourceTier] ?? s.tier}</td>
              <td className="px-3 py-2">{fmt(s.collectedAt)}</td>
              <td className="px-3 py-2">{s.status}</td>
              <td className="px-3 py-2">{s.products}</td>
              <td className="px-3 py-2">{s.prices}</td>
              <td className="px-3 py-2">{s.promotions}</td>
              <td className="px-3 py-2 text-muted">{s.license ?? '—'}</td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Alertes</h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <a href="/admin/qualite" className={`rounded-full border border-border px-3 py-1 ${!type ? 'bg-surface-2 font-semibold' : ''}`}>
            Toutes ({quality.issues.length})
          </a>
          {(Object.keys(KIND_LABEL) as QualityIssueKind[]).map((k) => (
            <a key={k} href={`/admin/qualite?type=${k}`} className={`rounded-full border border-border px-3 py-1 ${type === k ? 'bg-surface-2 font-semibold' : ''}`}>
              {KIND_LABEL[k]} ({quality.counts[k]})
            </a>
          ))}
        </div>
        {issues.length === 0 ? (
          <p className="text-sm text-muted">Aucune alerte.</p>
        ) : (
          <Table head={['Gravité', 'Type', 'Enseigne', 'Élément', 'Constat']}>
            {issues.slice(0, 300).map((i, n) => {
              const [canon] = i.entityId.split('|');
              return (
                <tr key={`${i.kind}-${i.entityId}-${n}`}>
                  <td className={`px-3 py-2 font-medium ${SEVERITY_CLASS[i.severity]}`}>{i.severity}</td>
                  <td className="px-3 py-2">{KIND_LABEL[i.kind]}</td>
                  <td className="px-3 py-2">{i.chainId ? (chainName.get(i.chainId) ?? i.chainId) : (i.connectorId ?? '—')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{productName.get(canon ?? '') ?? i.entityId}</td>
                  <td className="px-3 py-2">{i.message}</td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="text-xs text-muted">
          Une alerte appelle une vérification : aucune donnée n’est supprimée automatiquement. Deux sources en désaccord restent
          toutes deux enregistrées ; le comparateur affiche la plus fiable et signale l’écart.
        </p>
      </section>
    </div>
  );
}
