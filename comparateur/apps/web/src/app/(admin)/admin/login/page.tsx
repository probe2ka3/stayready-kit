import { LoginForm } from '@/components/admin/login-form';
import { adminConfigured } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connexion' };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm space-y-4 py-8">
      <h1 className="text-2xl font-bold">Connexion</h1>
      {adminConfigured() ? (
        <LoginForm />
      ) : (
        <div className="rounded-xl bg-warn-soft p-4 text-sm text-warn">
          <p className="font-semibold">Administration non configurée.</p>
          <p className="mt-1">
            Définissez <code>ADMIN_USERNAME</code>, <code>ADMIN_PASSWORD_HASH</code> (généré par <code>node apps/web/scripts/hash-password.mjs</code>)
            et <code>SESSION_SECRET</code> (32 caractères au moins), puis redémarrez le serveur. Voir docs/DEPLOIEMENT.md.
          </p>
        </div>
      )}
    </div>
  );
}
