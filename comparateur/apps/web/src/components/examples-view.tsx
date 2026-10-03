'use client';

import { useRouter } from 'next/navigation';
import { addDays, holidayInfo, weekdayOf, zurichToday, type TravelSettings } from '@cabas/core';
import { format, getMessages, paths, plural, type Locale } from '@/i18n';
import { shortCalendarDate } from '@/lib/format';
import { useApp, type ProductInfo } from '@/lib/store';
import { Button, Card, Notice, PageTitle } from './ui';

export interface ExampleBasket {
  id: string;
  title: string;
  origin: { lat: number; lon: number; label: string };
  radiusKm: 5 | 10 | 20 | 30;
  lines: Array<{ productId: string; qty: number }>;
  when: { mode: 'plan'; date: string; time: string | null };
  maxStores: number;
  travel: TravelSettings;
  minSavingPerExtraStoreChf: number;
  products: Record<string, ProductInfo>;
}

/**
 * Paniers d'exemple : remplacent la localité, le panier et les réglages de ce navigateur, puis
 * lancent la comparaison. Une date d'exemple déjà passée est remplacée par le prochain jour ouvrable
 * (ni dimanche ni jour férié : la plupart des magasins sont fermés, la comparaison serait vide).
 */
export function ExamplesView({ locale, baskets }: { locale: Locale; baskets: ExampleBasket[] }) {
  const m = getMessages(locale);
  const router = useRouter();
  const today = zurichToday(new Date());
  return (
    <div className="space-y-4">
      <PageTitle>{m.examples.title}</PageTitle>
      <p className="text-muted">{m.examples.lead}</p>
      {baskets.length === 0 && <Notice tone="warn">{m.examples.none}</Notice>}
      {baskets.map((b) => {
        let date = b.when.date > today ? b.when.date : addDays(today, 1);
        while (weekdayOf(date) === 7 || holidayInfo(date).status !== 'none') date = addDays(date, 1);
        return (
          <Card key={b.id} className="space-y-2">
            <h2 className="text-lg font-bold">{b.title}</h2>
            <p className="text-sm text-muted">
              {format(m.examples.details, {
                place: b.origin.label,
                items: plural(m.basket.items, b.lines.reduce((a, l) => a + l.qty, 0)),
                date: shortCalendarDate(date),
                stores: String(b.maxStores),
              })}
            </p>
            <p className="text-sm">{b.lines.map((l) => `${l.qty} × ${b.products[l.productId]?.name ?? l.productId}`).join(' · ')}</p>
            <Button
              onClick={() => {
                useApp.setState({
                  location: { label: b.origin.label, lat: b.origin.lat, lon: b.origin.lon, precise: false },
                  radiusKm: b.radiusKm,
                  excludedChains: [],
                  excludedStores: [],
                  includedStores: [],
                  basket: b.lines.map((l, i) => ({ id: `ex-${b.id}-${i}`, productId: l.productId, qty: l.qty })),
                  products: { ...useApp.getState().products, ...b.products },
                  when: { mode: 'plan', date, time: b.when.time },
                  maxStores: b.maxStores,
                  travel: b.travel,
                  minSavingChf: b.minSavingPerExtraStoreChf,
                  lastResult: null,
                });
                router.push(paths.compare(locale));
              }}
            >
              {m.examples.load}
            </Button>
          </Card>
        );
      })}
      <p className="text-xs text-muted">{m.examples.note}</p>
    </div>
  );
}
