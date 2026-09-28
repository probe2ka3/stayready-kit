import { addDays, summarizeUsage, zurichToday } from '@cabas/core';
import { AdminTitle, Table } from '@/components/admin/ui';
import { requireAdmin } from '@/server/auth';
import { getAppData } from '@/server/data';
import { usageSince } from '@/server/metrics';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Indicateurs' };

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)} %`);
const num = (v: number | null, d = 1) => (v === null ? '—' : v.toFixed(d));

/** Coûts techniques déclarés par l'exploitant (variables d'environnement, CHF). */
function declaredCosts() {
  const n = (k: string) => Number(process.env[k] ?? '0') || 0;
  const monthly = {
    hébergement: n('COST_HOSTING_CHF_MONTH'),
    'base de données': n('COST_DATABASE_CHF_MONTH'),
    itinéraires: n('COST_ROUTING_CHF_MONTH'),
    'données de prix': n('COST_DATA_CHF_MONTH'),
    'domaine (÷ 12)': n('COST_DOMAIN_CHF_YEAR') / 12,
  };
  return { monthly, total: Object.values(monthly).reduce((a, b) => a + b, 0) };
}

/**
 * Indicateurs d'exploitation, construits uniquement à partir de compteurs anonymes
 * agrégés (aucun identifiant, aucune position, aucun panier).
 */
export default async function Indicators() {
  await requireAdmin();
  const now = new Date();
  const today = zurichToday(now);
  const data = getAppData();
  const [rows30, rows7, status, collections] = await Promise.all([
    usageSince(addDays(today, -29)),
    usageSince(addDays(today, -6)),
    data.chainStatus(now),
    data.collections(),
  ]);
  const k30 = summarizeUsage(rows30);
  const k7 = summarizeUsage(rows7);
  const costs = declaredCosts();
  const covered = status.filter((s) => s.realPrices > 0);
  const byMetric = new Map<string, number>();
  for (const r of rows30) byMetric.set(`${r.metric} · ${r.dimension}`, (byMetric.get(`${r.metric} · ${r.dimension}`) ?? 0) + r.count);

  return (
    <div className="space-y-6">
      <AdminTitle sub="Compteurs anonymes agrégés par jour : ni identifiant, ni adresse IP, ni position, ni contenu de panier.">Indicateurs</AdminTitle>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Visites (7 j)', String(k7.visits), `${k7.newVisitors} nouveaux navigateurs`],
          ['Taux de retour (30 j)', pct(k30.returnRate7d), 'visites de navigateurs revenus sous 7 jours'],
          ['Comparaisons (7 j)', String(k7.compares), `${num(k7.comparesPerVisit)} par visite`],
          ['Coût technique / comparaison', k30.compares ? `${(costs.total / Math.max(1, k30.compares)).toFixed(3)} CHF` : '—', `coûts déclarés ${costs.total.toFixed(2)} CHF/mois`],
        ].map(([label, value, sub]) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-sm text-muted">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted">{sub}</p>
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Usage des fonctions (30 jours)</h2>
        <Table head={['Indicateur', 'Valeur']}>
          {[
            ['Part des comparaisons planifiées (date future)', pct(k30.planShare)],
            ['Part des comparaisons sur prix réels', pct(k30.liveShare)],
            ['Détours proposés / acceptés', `${k30.detoursShown} / ${k30.detoursAccepted}`],
            ['Listes de courses enregistrées', String(k30.listsSaved)],
          ].map(([a, b]) => (
            <tr key={a}>
              <td className="px-3 py-2">{a}</td>
              <td className="px-3 py-2 font-medium">{b}</td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Par jour</h2>
        <Table head={['Jour', 'Visites', 'Comparaisons']}>
          {k30.byDay.map((d) => (
            <tr key={d.day}>
              <td className="px-3 py-2">{d.day}</td>
              <td className="px-3 py-2">{d.visits}</td>
              <td className="px-3 py-2">{d.compares}</td>
            </tr>
          ))}
        </Table>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Couverture des prix</h2>
        <p className="text-sm text-muted">
          {covered.length} enseigne(s) sur {status.length} avec des prix réels ·{' '}
          {collections.map((c) => `${c.label} : ${c.prices} prix, ${c.promotions} promotions`).join(' · ') || 'aucune collecte'}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Coûts techniques déclarés (CHF / mois)</h2>
        <Table head={['Poste', 'Montant']}>
          {Object.entries(costs.monthly).map(([k, v]) => (
            <tr key={k}>
              <td className="px-3 py-2">{k}</td>
              <td className="px-3 py-2">{v.toFixed(2)}</td>
            </tr>
          ))}
        </Table>
        <p className="text-xs text-muted">À renseigner par l’exploitant (variables COST_*_CHF_MONTH, COST_DOMAIN_CHF_YEAR).</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Compteurs bruts (30 jours)</h2>
        <Table head={['Indicateur · dimension', 'Total']}>
          {[...byMetric.entries()].sort().map(([k, v]) => (
            <tr key={k}>
              <td className="px-3 py-2">{k}</td>
              <td className="px-3 py-2">{v}</td>
            </tr>
          ))}
        </Table>
      </section>
    </div>
  );
}
