'use client';

import { useEffect, useState } from 'react';
import { DISCLOSURE_LABEL, type SponsoredPlacement } from '@cabas/core';
import { Card, Pill } from './ui';

/**
 * Emplacement commercial clairement signalé (« Annonce », « Partenaire », « Lien affilié »),
 * affiché hors des résultats. Rien n'est affiché si aucun partenariat n'est configuré.
 */
export function PartnerSlot({ slot }: { slot: SponsoredPlacement['slot'] }) {
  const [items, setItems] = useState<SponsoredPlacement[]>([]);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/v1/placements?slot=${slot}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : { placements: [] }))
      .then((j: { placements: SponsoredPlacement[] }) => setItems(j.placements ?? []))
      .catch(() => {});
    return () => ctrl.abort();
  }, [slot]);
  if (items.length === 0) return null;
  return (
    <aside aria-label="Contenus commerciaux" className="space-y-2">
      {items.map((p) => (
        <Card key={p.id} className="space-y-1 border-dashed">
          <Pill tone="neutral">{DISCLOSURE_LABEL[p.disclosure]}</Pill>
          <p className="font-semibold">{p.title}</p>
          <p className="text-sm text-muted">{p.body}</p>
          <a href={p.url} target="_blank" rel="sponsored nofollow noopener noreferrer" className="text-sm font-semibold underline">
            En savoir plus ↗
          </a>
        </Card>
      ))}
    </aside>
  );
}
