'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getMessages, paths, type Locale } from '@/i18n';
import { trackVisit } from '@/lib/metrics';
import { useApp, useHydrated } from '@/lib/store';
import { IconBasket, IconList, IconScale, IconStore } from './icons';

function useNavItems(locale: Locale) {
  const m = getMessages(locale);
  return [
    { href: paths.stores(locale), label: m.nav.stores, Icon: IconStore },
    { href: paths.basket(locale), label: m.nav.basket, Icon: IconBasket, badge: true },
    { href: paths.compare(locale), label: m.nav.compare, Icon: IconScale },
    { href: paths.list(locale), label: m.nav.list, Icon: IconList },
  ];
}

function BasketCount() {
  const hydrated = useHydrated();
  const count = useApp((s) => s.basket.reduce((a, b) => a + b.qty, 0));
  if (!hydrated || count === 0) return null;
  return (
    <span className="num absolute -top-1.5 left-1/2 ml-2 min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-5 text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Barre de navigation inférieure (mobile) : les 4 étapes du parcours. */
export function BottomNav({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const items = useNavItems(locale);
  const m = getMessages(locale);
  // Page d'attente : pas de navigation vers l'application (fermée au public).
  if (pathname?.endsWith('/bientot')) return null;
  return (
    <nav
      aria-label={m.nav.main}
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map(({ href, label, Icon, badge }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${active ? 'text-primary' : 'text-muted'}`}
              >
                <Icon className="h-6 w-6" />
                {label}
                {badge && <BasketCount />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DesktopNav({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  const items = useNavItems(locale);
  const m = getMessages(locale);
  if (pathname?.endsWith('/bientot')) return null;
  return (
    <nav aria-label={m.nav.main} className="hidden md:block">
      <ul className="flex items-center gap-1">
        {items.map(({ href, label, badge }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-primary-soft text-primary-strong' : 'text-muted hover:bg-surface-2 hover:text-text'}`}
              >
                {label}
                {badge && <BasketCount />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Bandeau « démonstration » : visible par défaut, masqué uniquement si le serveur
 * confirme que des prix réels sont disponibles.
 */
export function DemoBanner({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const [demo, setDemo] = useState(true);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/v1/health', { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: { demo?: boolean }) => setDemo(j.demo !== false))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);
  if (!demo) return null;
  return (
    <div role="note" className="border-b border-demo/30 bg-demo-soft text-demo">
      <p className="mx-auto max-w-5xl px-4 py-2 text-center text-[13px] font-medium leading-snug">
        {m.demo.banner}{' '}
        <Link href={paths.sources(locale)} className="underline underline-offset-2">
          {m.demo.more}
        </Link>
      </p>
    </div>
  );
}

/** Compteur de visite anonyme (une fois par jour et par navigateur au plus). */
export function VisitCounter() {
  useEffect(() => {
    trackVisit();
  }, []);
  return null;
}

/** Enregistre le service worker (mode hors ligne des listes) en production. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
