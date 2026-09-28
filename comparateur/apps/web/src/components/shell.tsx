import Link from 'next/link';
import { getMessages, paths, type Locale } from '@/i18n';
import { BottomNav, DemoBanner, DesktopNav } from './shell-client';
import { LogoMark } from './icons';

export function Header({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  return (
    <header className="no-print sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href={paths.home(locale)} className="flex items-center gap-2 font-semibold tracking-tight" aria-label={`${m.app.name}, accueil`}>
          <LogoMark />
          <span className="text-lg">
            {m.app.name.startsWith('Tes') ? (
              <>
                <span className="font-medium">Tes</span>
                <span className="font-extrabold text-primary">{m.app.name.slice(3)}</span>
              </>
            ) : (
              m.app.name
            )}
          </span>
          <span className="hidden text-xs font-normal text-muted sm:inline">· {m.app.tagline}</span>
        </Link>
        <DesktopNav locale={locale} />
      </div>
    </header>
  );
}

export function Footer({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const links: Array<[string, string]> = [
    [paths.method(locale), m.nav.method],
    [paths.sources(locale), m.nav.sources],
    [paths.about(locale), m.nav.about],
    [paths.privacy(locale), m.nav.privacy],
    [paths.imprint(locale), m.nav.imprint],
    [paths.terms(locale), m.nav.terms],
  ];
  return (
    <footer className="no-print mt-12 border-t border-border bg-surface">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 text-sm text-muted">
        <nav aria-label="Informations">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {links.map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="underline-offset-4 hover:text-text hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="font-medium text-text">{m.app.independent}</p>
        <p>{m.footer.attribution}</p>
        <p>{m.footer.workingName}</p>
      </div>
    </footer>
  );
}

export { BottomNav, DemoBanner };
