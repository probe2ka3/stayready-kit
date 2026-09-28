import type { Metadata } from 'next';
import Link from 'next/link';
import '../../globals.css';
import { LogoMark } from '@/components/icons';
import { logoutAction } from '@/server/admin-actions';
import { getAdminSession } from '@/server/auth';

export const metadata: Metadata = {
  title: { default: 'Administration', template: '%s · Administration TesPrix' },
  robots: { index: false, follow: false },
};

const NAV: Array<[string, string]> = [
  ['/admin', 'Tableau de bord'],
  ['/admin/indicateurs', 'Indicateurs'],
  ['/admin/correspondances', 'Correspondances'],
  ['/admin/anomalies', 'Anomalies'],
  ['/admin/imports', 'Imports'],
  ['/admin/journal', 'Journal'],
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  return (
    <html lang="fr-CH">
      <body className="min-h-dvh">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/admin" className="flex items-center gap-2 font-semibold">
              <LogoMark className="h-6 w-6" /> Administration
            </Link>
            {session && (
              <>
                <nav aria-label="Administration" className="flex flex-wrap gap-1 text-sm">
                  {NAV.map(([href, label]) => (
                    <Link key={href} href={href} className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-surface-2 hover:text-text">
                      {label}
                    </Link>
                  ))}
                </nav>
                <form action={logoutAction} className="ml-auto flex items-center gap-3 text-sm">
                  <span className="text-muted">{session.username}</span>
                  <button type="submit" className="rounded-lg border border-border px-3 py-1.5 font-medium hover:bg-surface-2">
                    Déconnexion
                  </button>
                </form>
              </>
            )}
            <Link href="/fr" className={session ? 'text-sm text-primary' : 'ml-auto text-sm text-primary'}>
              Site public →
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
