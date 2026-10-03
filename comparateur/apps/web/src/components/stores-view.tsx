'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { format, getMessages, paths, plural, type Locale } from '@/i18n';
import { fetchStores, type StoresResponse } from '@/lib/api';
import { km, shortDate } from '@/lib/format';
import { useApp, useHydrated } from '@/lib/store';
import { IconChevron, IconPin } from './icons';
import { LocationPicker } from './location-picker';
import { Card, ChainBadge, cx, Notice, PageTitle, Pill, Segmented } from './ui';

const RADII = [5, 10, 20, 30] as const;

export function StoresView({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const hydrated = useHydrated();
  const { location, radiusKm, excludedChains, excludedStores, basket, maxStores } = useApp();
  const { setRadius, toggleChain, toggleStore, setLocation, setMaxStores } = useApp();
  const [data, setData] = useState<StoresResponse | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!hydrated || !location) return;
    const ctrl = new AbortController();
    setState('loading');
    fetchStores(location.lat, location.lon, radiusKm, ctrl.signal)
      .then((r) => {
        setData(r);
        setState('idle');
      })
      .catch((e: unknown) => {
        if ((e as Error).name !== 'AbortError') setState('error');
      });
    return () => ctrl.abort();
  }, [hydrated, location, radiusKm]);

  const storesByChain = useMemo(() => {
    const map = new Map<string, StoresResponse['stores']>();
    for (const s of data?.stores ?? []) {
      const list = map.get(s.chainId) ?? [];
      list.push(s);
      map.set(s.chainId, list);
    }
    return map;
  }, [data]);

  if (!hydrated) return <PageTitle>{m.stores.title}</PageTitle>;

  const basketCount = basket.reduce((a, b) => a + b.qty, 0);

  return (
    <div className="space-y-4">
      <PageTitle>{m.stores.title}</PageTitle>

      <Card className="space-y-3">
        {location && !editing ? (
          <div className="flex items-center gap-3">
            <IconPin className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-muted">{m.location.current}</p>
              <p className="truncate font-semibold">{location.label}</p>
            </div>
            <button type="button" onClick={() => setEditing(true)} className="rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-soft">
              {m.location.change}
            </button>
          </div>
        ) : (
          <LocationPicker
            locale={locale}
            autoFocus={editing}
            onSelected={(l) => {
              setLocation(l);
              setEditing(false);
            }}
          />
        )}
        <div>
          <p id="radius-label" className="mb-1.5 text-sm font-semibold">
            {m.stores.radius}
          </p>
          <Segmented
            label={m.stores.radius}
            value={radiusKm}
            onChange={setRadius}
            options={RADII.map((r) => ({ value: r, label: `${r} km` }))}
          />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">{m.compare.maxStores}</p>
          <Segmented
            label={m.compare.maxStores}
            value={maxStores === null ? 0 : maxStores}
            onChange={(n) => setMaxStores(n === 0 ? null : n)}
            options={[
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
              { value: 0, label: m.compare.unlimited },
            ]}
          />
        </div>
      </Card>

      {!location && <Notice>{m.stores.noLocation}</Notice>}
      {state === 'error' && <Notice tone="danger">{m.compare.error}</Notice>}
      {state === 'loading' && !data && <p className="text-muted">{m.common.loading}</p>}

      {location && data && (
        <>
          {data.chains.length === 0 ? (
            <Notice tone="warn">{m.stores.none}</Notice>
          ) : (
            <section aria-labelledby="present" className={cx('space-y-2', state === 'loading' && 'opacity-60')}>
              <h2 id="present" className="text-lg font-bold">
                {m.stores.chainsPresent}
              </h2>
              <ul className="space-y-2">
                {data.chains.map((c) => {
                  const included = !excludedChains.includes(c.chainId);
                  const stores = storesByChain.get(c.chainId) ?? [];
                  return (
                    <li key={c.chainId} className="rounded-2xl border border-border bg-surface">
                      <div className="flex items-center gap-3 p-3">
                        <ChainBadge badge={c.badge} name={c.name} />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                            {c.name}
                            <Pill tone={c.priceData.kind === 'official' ? 'primary' : c.priceData.kind === 'none' ? 'danger' : 'warn'}>
                              {m.stores.priceLabel[c.priceData.kind]}
                            </Pill>
                          </p>
                          <p className="text-sm text-muted">
                            {plural(m.stores.storesCount, c.count)} · {format(m.stores.nearest, { km: km(c.nearestKm) })}
                          </p>
                          <p className="text-xs text-muted">
                            {format(m.stores.priceText[c.priceData.kind === 'community' && c.priceData.officialRestricted ? 'communityRestricted' : c.priceData.kind] ?? '', {
                              date: c.priceData.lastObservation ? shortDate(c.priceData.lastObservation) : '—',
                            })}
                          </p>
                        </div>
                        <label className="relative inline-flex cursor-pointer items-center">
                          <span className="sr-only">
                            {m.stores.include} {c.name}
                          </span>
                          <input type="checkbox" className="peer sr-only" checked={included} onChange={() => toggleChain(c.chainId)} />
                          <span className="h-7 w-12 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-[var(--focus)]" />
                          <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                        </label>
                      </div>
                      {included && stores.length > 0 && (
                        <details className="group border-t border-border">
                          <summary className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-primary">
                            <IconChevron className="h-4 w-4 transition-transform group-open:rotate-90" />
                            {m.stores.showStores} ({stores.length})
                          </summary>
                          <ul className="divide-y divide-border">
                            {stores.map((s) => {
                              const excluded = excludedStores.includes(s.id);
                              return (
                                <li key={s.id} className={cx('flex items-start gap-3 px-3 py-2.5', excluded && 'opacity-50')}>
                                  <input
                                    type="checkbox"
                                    className="mt-1 h-5 w-5 accent-[var(--primary)]"
                                    checked={!excluded}
                                    onChange={() => toggleStore(s.id)}
                                    aria-label={`${m.stores.include} ${s.name}`}
                                  />
                                  <div className="min-w-0 flex-1 text-sm">
                                    <p className="font-medium">{s.name}</p>
                                    {s.address && <p className="text-muted">{s.address}</p>}
                                    <p className="text-muted">
                                      {m.stores.todayHours} : {s.hoursToday ?? m.stores.hoursUnknown}
                                    </p>
                                    {s.accessNotes && <p className="text-muted">{s.accessNotes}</p>}
                                    <p className="text-xs text-muted">{m.stores.stockUnknown}</p>
                                  </div>
                                  <div className="text-right text-sm">
                                    <p className="num font-semibold">{km(s.crowKm)}</p>
                                    {s.openNow === 'open' && <Pill tone="primary">{m.results.openStatus.open}</Pill>}
                                    {s.openNow === 'closed' && <Pill>{m.results.openStatus.closed}</Pill>}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {data.absentChains.length > 0 && (
            <section aria-labelledby="absent" className="rounded-2xl border border-dashed border-border p-3">
              <h2 id="absent" className="text-sm font-semibold text-muted">
                {m.stores.chainsAbsent} ({radiusKm} km)
              </h2>
              <p className="mt-1 text-sm text-muted">{data.absentChains.map((c) => c.name).join(' · ')}</p>
            </section>
          )}

          <section aria-labelledby="availability" className="rounded-2xl bg-surface-2 p-3 text-sm">
            <h2 id="availability" className="font-semibold">
              {m.stores.availabilityTitle}
            </h2>
            <p className="mt-1 text-muted">{m.stores.availabilityText}</p>
          </section>

          <p className="text-xs text-muted">{m.stores.osm}</p>

          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 md:bottom-4">
            <Link
              href={basketCount > 0 ? paths.compare(locale) : paths.basket(locale)}
              className="flex min-h-13 items-center justify-center rounded-2xl bg-primary px-4 text-base font-bold text-on-primary shadow-lg hover:bg-primary-strong"
            >
              {basketCount > 0 ? `${m.basket.compare} (${plural(m.basket.items, basketCount)})` : m.stores.continue}
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
