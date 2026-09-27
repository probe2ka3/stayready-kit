'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getMessages, paths, type Locale } from '@/i18n';
import { useApp, useHydrated } from '@/lib/store';
import { IconBasket, IconPin } from './icons';
import { LocationPicker } from './location-picker';

export function HomeStart({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const router = useRouter();
  const hydrated = useHydrated();
  const location = useApp((s) => s.location);
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm md:p-5">
      {hydrated && location && (
        <Link
          href={paths.stores(locale)}
          className="flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2.5 text-[15px] font-semibold text-primary-strong"
        >
          <IconPin />
          <span className="truncate">{location.label}</span>
          <span className="ml-auto text-sm font-medium">{m.nav.stores} →</span>
        </Link>
      )}
      <LocationPicker locale={locale} onSelected={() => router.push(paths.stores(locale))} />
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>
      <Link
        href={paths.basket(locale)}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 font-semibold hover:bg-surface-2"
      >
        <IconBasket className="h-5 w-5" />
        {m.home.startBasket}
      </Link>
    </div>
  );
}
