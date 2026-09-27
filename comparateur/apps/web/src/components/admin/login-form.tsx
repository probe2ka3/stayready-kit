'use client';

import { startTransition, useActionState, useState } from 'react';
import { loginAction, type LoginState } from '@/server/admin-actions';

const MESSAGES: Record<NonNullable<LoginState['error']>, string> = {
  invalid: 'Identifiants incorrects.',
  not_configured: 'Administration non configurée.',
  rate_limited: 'Trop de tentatives. Réessayez dans quelques minutes.',
};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: null });
  const [username, setUsername] = useState('');
  return (
    <form onSubmit={(e) => {
        // Soumission explicite : évite la réinitialisation automatique du formulaire par React.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <label className="block text-sm font-medium">
        Utilisateur
        <input
          name="username"
          autoComplete="username"
          required
          maxLength={64}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3" />
      </label>
      <label className="block text-sm font-medium">
        Mot de passe
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {MESSAGES[state.error]}
        </p>
      )}
      <button type="submit" disabled={pending} className="h-11 w-full rounded-xl bg-primary font-semibold text-on-primary disabled:opacity-60">
        {pending ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
