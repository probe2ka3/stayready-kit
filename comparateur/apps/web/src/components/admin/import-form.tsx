'use client';

import { startTransition, useActionState, useState } from 'react';
import { importAction, type ImportState } from '@/server/admin-actions';

export function ImportForm({ chains }: { chains: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAction, { done: false });
  // Champs contrôlés : React réinitialise les formulaires après une action, la sélection doit persister.
  const [connector, setConnector] = useState(chains[0]?.id ?? '');
  const [dryRun, setDryRun] = useState(true);
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => {
        // Soumission explicite : évite la réinitialisation automatique du formulaire par React.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <label className="block text-sm font-medium">
          Enseigne (connecteur)
          <select name="connector" required value={connector} onChange={(e) => setConnector(e.target.value)} className="mt-1 block h-10 w-full max-w-xs rounded-lg border border-border bg-surface px-2">
            {chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Fichiers (CSV ou JSON, 5 Mo max. chacun)
          <input name="files" type="file" multiple required accept=".csv,.json,text/csv,application/json" className="mt-1 block text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dryRun" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Simulation (valider sans rien enregistrer)
        </label>
        <button type="submit" disabled={pending} className="h-10 rounded-xl bg-primary px-4 font-semibold text-on-primary disabled:opacity-60">
          {pending ? 'Traitement…' : 'Importer'}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.summary && (
        <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
          <h2 className="text-lg font-bold">{state.dryRun ? 'Résultat de la simulation' : 'Import effectué'}</h2>
          <p>
            {state.summary.products} articles · {state.summary.prices} prix · {state.summary.promotions} promotions ·{' '}
            {state.summary.matchesValidated} correspondances validées · {state.summary.matchesSuggested} à valider
          </p>
          {state.summary.applied && (
            <p className="text-primary">
              Enregistré : {state.summary.applied.prices} prix, {state.summary.applied.promotions} promotions ({state.summary.applied.rejected} rejet(s) en base).
            </p>
          )}
          {state.summary.rejected.length > 0 && (
            <div>
              <h3 className="font-semibold text-danger">Lignes refusées ({state.summary.rejected.length})</h3>
              <ul className="mt-1 max-h-72 space-y-0.5 overflow-auto">
                {state.summary.rejected.map((r, i) => (
                  <li key={i}>
                    {r.file} ligne {r.line ?? '?'}
                    {r.field ? ` [${r.field}]` : ''} : {r.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {state.summary.warnings.length > 0 && (
            <div>
              <h3 className="font-semibold text-warn">Avertissements ({state.summary.warnings.length})</h3>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto">
                {state.summary.warnings.map((r, i) => (
                  <li key={i}>
                    {r.file} ligne {r.line ?? '?'} : {r.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
