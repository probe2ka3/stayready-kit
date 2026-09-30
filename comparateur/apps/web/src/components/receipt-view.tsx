'use client';

import { useMemo, useState } from 'react';
import { parseReceiptText } from '@cabas/core';
import { money } from '@/lib/format';
import { Button, Card } from './ui';

const REMOVED_LABEL: Record<string, string> = {
  carte_fidelite: 'numéro de carte de fidélité',
  iban: 'IBAN',
  carte_bancaire: 'numéro de carte bancaire',
  courriel: 'adresse électronique',
  telephone: 'numéro de téléphone',
  personnel: 'nom du personnel',
  transaction: 'numéro de transaction ou de terminal',
  heure: 'heure d’achat',
};

/**
 * « Scanner mon ticket » (version minimale) : le texte du ticket est analysé dans le navigateur ;
 * rien n'est envoyé. Les informations personnelles sont retirées avant l'affichage du résultat.
 * L'envoi reste désactivé tant que la politique de confidentialité n'est pas validée.
 */
export function ReceiptView({ submitEnabled }: { submitEnabled: boolean }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => (text.trim() ? parseReceiptText(text) : null), [text]);
  const removed = parsed ? Object.entries(parsed.removed) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Scanner mon ticket</h1>
      <p className="text-muted">
        Vos tickets de caisse peuvent compléter les prix des enseignes qui ne publient pas les leurs. Le ticket est lu sur votre
        appareil ; seuls les articles, les prix, l’enseigne, la succursale et la date seraient transmis, après votre accord.
      </p>

      <Card className="space-y-3 p-4">
        <label htmlFor="receipt-text" className="block font-semibold">
          Texte du ticket
        </label>
        <p className="text-sm text-muted">
          Collez le texte d’un ticket (application de l’enseigne, reçu électronique). La photo avec lecture sur l’appareil est en
          préparation.
        </p>
        <textarea
          id="receipt-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="w-full rounded-xl border border-border bg-surface p-3 font-mono text-sm"
          placeholder={'MIGROS\nFiliale …\nLait entier UHT 1l   1.60\n…\nTOTAL CHF   …'}
          spellCheck={false}
          autoComplete="off"
        />
      </Card>

      {parsed && (
        <Card className="space-y-3 p-4" as="section">
          <h2 className="text-lg font-bold">Résultat (sur votre appareil)</h2>
          <p className="text-sm">
            Enseigne : <strong>{parsed.chainId ?? 'non reconnue'}</strong> · Date : <strong>{parsed.purchaseDate ?? 'non lue'}</strong>
            {parsed.storeHint ? ` · ${parsed.storeHint}` : ''}
          </p>
          {removed.length > 0 && (
            <p className="rounded-xl bg-primary-soft p-3 text-sm">
              Retiré avant tout envoi : {removed.map(([k, n]) => `${REMOVED_LABEL[k] ?? k}${n > 1 ? ` (${n})` : ''}`).join(', ')}.
            </p>
          )}
          {parsed.lines.length === 0 ? (
            <p className="text-sm text-muted">Aucune ligne d’article reconnue.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {parsed.lines.map((l, i) => (
                <li key={`${l.label}-${i}`} className="flex justify-between gap-3 py-2">
                  <span>
                    {l.quantity > 1 ? `${l.quantity} × ` : ''}
                    {l.label}
                    {l.weighed ? ' (au poids, non utilisé)' : ''}
                    {l.discountCents > 0 ? ` · remise ${money(l.discountCents)}` : ''}
                  </span>
                  <span className="num font-semibold">{money(l.unitPriceCents)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button disabled={!submitEnabled} className="w-full">
            Envoyer les prix (anonymes)
          </Button>
          {!submitEnabled && (
            <p className="text-xs text-muted">
              L’envoi n’est pas encore ouvert : il le sera après validation de la politique de confidentialité. Aucune donnée n’a
              quitté votre appareil.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
