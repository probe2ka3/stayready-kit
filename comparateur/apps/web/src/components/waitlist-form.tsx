'use client';

import { useState } from 'react';
import { Button, Notice } from './ui';

/** Formulaire d'inscription préparé ; inactif tant que les inscriptions sont fermées. */
export function WaitlistForm({ enabled }: { enabled: boolean }) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  if (!enabled) {
    return (
      <Notice tone="info">
        Les inscriptions à la liste d’attente ouvriront après la validation juridique du service. Aucune adresse n’est collectée pour l’instant.
      </Notice>
    );
  }
  if (state === 'done') return <Notice tone="info">Merci ! Vous recevrez un courriel de confirmation.</Notice>;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('sending');
        const res = await fetch('/api/v1/waitlist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, consent: true }),
        }).catch(() => null);
        setState(res?.ok ? 'done' : 'error');
      }}
    >
      <label className="block">
        <span className="mb-1 block font-medium">Adresse électronique</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 w-full rounded-xl border border-border bg-surface px-3"
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
        <span>J’accepte d’être informé·e par courriel de l’ouverture de TesPrix. Désinscription à tout moment.</span>
      </label>
      <Button type="submit" disabled={!consent || state === 'sending'}>
        M’inscrire
      </Button>
      {state === 'error' && <p className="text-sm text-danger">Inscription impossible pour le moment.</p>}
    </form>
  );
}
