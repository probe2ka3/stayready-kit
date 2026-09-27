'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { addDays, MAX_PLAN_DAYS, zurichToday, type TravelMode } from '@cabas/core';
import { CHAINS } from '@cabas/reference';
import { getMessages, paths, plural, type Locale } from '@/i18n';
import { ApiError, compare } from '@/lib/api';
import { useApp, useHydrated } from '@/lib/store';
import { IconPin } from './icons';
import { ResultsView } from './results-view';
import { Button, Card, Notice, PageTitle, Segmented, Toggle } from './ui';

const LOYALTY = CHAINS.flatMap((c) => c.loyaltyPrograms.map((l) => ({ ...l, chain: c.name })));

function NumberField({
  id,
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4 py-2">
      <span className="text-[15px] font-medium">{label}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="num h-11 w-24 rounded-xl border border-border bg-surface px-3 text-right"
      />
    </label>
  );
}

export function CompareView({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const hydrated = useHydrated();
  const state = useApp();
  const { location, basket, when, maxStores, travel, prefs, minSavingChf, referenceChainId, lastResult } = state;
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoRan = useRef(false);
  const today = zurichToday(new Date());

  const run = useCallback(async () => {
    const s = useApp.getState();
    if (!s.location || s.basket.length === 0) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus('running');
    setError(null);
    try {
      const res = await compare(
        {
          location: s.location,
          radiusKm: s.radiusKm,
          excludedChains: s.excludedChains,
          presentChains: CHAINS.map((c) => c.id),
          excludedStores: s.excludedStores,
          basket: s.basket,
          prefs: s.prefs,
          when: s.when,
          maxStores: s.maxStores,
          travel: s.travel,
          minSavingChf: s.minSavingChf,
          referenceChainId: s.referenceChainId,
        },
        ctrl.signal,
      );
      s.setLastResult(res);
      setStatus('idle');
      requestAnimationFrame(() => document.getElementById('resultats')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setStatus('error');
      setError(e instanceof ApiError && e.status !== 500 ? e.message : m.compare.error);
    }
  }, [m.compare.error]);

  // Lancement automatique à l'arrivée sur la page si tout est prêt.
  useEffect(() => {
    if (hydrated && !autoRan.current && location && basket.length > 0 && !lastResult) {
      autoRan.current = true;
      void run();
    }
  }, [hydrated, location, basket.length, lastResult, run]);

  if (!hydrated) return <PageTitle>{m.compare.title}</PageTitle>;

  const planDate = when.mode === 'plan' ? when.date : addDays(today, 1);
  const count = basket.reduce((a, b) => a + b.qty, 0);

  return (
    <div className="space-y-5">
      <PageTitle>{m.compare.title}</PageTitle>

      {!location && (
        <Notice tone="warn">
          {m.compare.needLocation}{' '}
          <Link href={paths.stores(locale)} className="font-semibold underline">
            {m.nav.stores}
          </Link>
        </Notice>
      )}
      {basket.length === 0 && (
        <Notice tone="warn">
          {m.compare.needBasket}{' '}
          <Link href={paths.basket(locale)} className="font-semibold underline">
            {m.nav.basket}
          </Link>
        </Notice>
      )}

      {location && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="flex items-center gap-1">
            <IconPin className="h-4 w-4" /> {location.label} · {state.radiusKm} km
          </span>
          <Link href={paths.basket(locale)} className="underline-offset-2 hover:underline">
            {plural(m.basket.items, count)}
          </Link>
          <Link href={paths.stores(locale)} className="text-primary underline-offset-2 hover:underline">
            {m.location.change}
          </Link>
        </div>
      )}

      <Card className="space-y-4">
        <div className="space-y-2">
          <h2 className="font-semibold">{m.compare.whenTitle}</h2>
          <Segmented
            label={m.compare.whenTitle}
            value={when.mode}
            onChange={(mode) => state.setWhen(mode === 'now' ? { mode: 'now' } : { mode: 'plan', date: planDate, time: null })}
            options={[
              { value: 'now', label: m.compare.now },
              { value: 'plan', label: m.compare.plan },
            ]}
          />
          {when.mode === 'plan' && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="text-sm font-medium">
                {m.compare.date}
                <input
                  type="date"
                  min={today}
                  max={addDays(today, MAX_PLAN_DAYS)}
                  value={when.date}
                  onChange={(e) => e.target.value && state.setWhen({ ...when, date: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3"
                />
              </label>
              <label className="text-sm font-medium">
                {m.compare.time}
                <input
                  type="time"
                  value={when.time ?? ''}
                  onChange={(e) => state.setWhen({ ...when, time: e.target.value || null })}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3"
                />
              </label>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="font-semibold">{m.compare.maxStores}</h2>
          <Segmented
            label={m.compare.maxStores}
            value={maxStores === null ? 0 : maxStores}
            onChange={(n) => state.setMaxStores(n === 0 ? null : n)}
            options={[
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
              { value: 0, label: m.compare.unlimited },
            ]}
          />
        </div>

        <div className="space-y-2">
          <h2 className="font-semibold">{m.compare.mode}</h2>
          <Segmented<TravelMode>
            label={m.compare.mode}
            value={travel.mode}
            onChange={(mode) => state.setTravel({ mode })}
            options={(['car', 'bike', 'foot', 'transit'] as const).map((v) => ({ value: v, label: m.compare.modes[v] }))}
          />
        </div>

        <details className="group rounded-xl border border-border px-3">
          <summary className="flex min-h-11 items-center justify-between font-semibold">
            {m.compare.moreSettings}
            <span aria-hidden className="text-muted transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="divide-y divide-border pb-2">
            <NumberField id="cost-km" label={m.compare.costPerKm} value={travel.costPerKmChf} step={0.05} min={0} max={5} onChange={(v) => state.setTravel({ costPerKmChf: v })} />
            <Toggle checked={travel.returnToOrigin} onChange={(v) => state.setTravel({ returnToOrigin: v })} label={m.compare.returnToOrigin} />
            <NumberField id="min-store" label={m.compare.minutesPerStore} value={travel.minutesPerStore} step={5} min={0} max={120} onChange={(v) => state.setTravel({ minutesPerStore: Math.round(v) })} />
            <NumberField id="vot" label={m.compare.valueOfTime} value={travel.valueOfTimeChfPerHour} step={1} min={0} max={300} onChange={(v) => state.setTravel({ valueOfTimeChfPerHour: v })} />
            <Toggle checked={travel.valueInStoreTime} onChange={(v) => state.setTravel({ valueInStoreTime: v })} label={m.compare.valueInStore} />
            <NumberField id="min-saving" label={m.compare.minSaving} value={minSavingChf} step={0.5} min={0} max={100} onChange={state.setMinSaving} />
            <fieldset className="py-2">
              <legend className="text-[15px] font-medium">{m.compare.loyalty}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {LOYALTY.map((l) => {
                  const on = prefs.loyaltyPrograms.includes(l.id);
                  return (
                    <label key={l.id} className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        className="h-4 w-4 accent-[var(--primary)]"
                        onChange={() =>
                          state.setPrefs({
                            loyaltyPrograms: on ? prefs.loyaltyPrograms.filter((x) => x !== l.id) : [...prefs.loyaltyPrograms, l.id],
                          })
                        }
                      />
                      {l.name} <span className="text-muted">({l.chain})</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Toggle checked={prefs.allowSimilarPacks} onChange={(v) => state.setPrefs({ allowSimilarPacks: v })} label={m.compare.allowSimilar} />
            <Toggle checked={prefs.includeStalePrices} onChange={(v) => state.setPrefs({ includeStalePrices: v })} label={m.compare.includeStale} />
            <label className="flex items-center justify-between gap-4 py-2">
              <span className="text-[15px] font-medium">{m.compare.referenceChain}</span>
              <select
                value={referenceChainId ?? ''}
                onChange={(e) => state.setReferenceChain(e.target.value || null)}
                className="h-11 rounded-xl border border-border bg-surface px-2"
              >
                <option value="">{m.compare.none}</option>
                {CHAINS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </details>

        <Button size="lg" className="w-full" onClick={run} disabled={!location || basket.length === 0 || status === 'running'}>
          {status === 'running' ? m.compare.running : m.compare.run}
        </Button>
        {error && <Notice tone="danger">{error}</Notice>}
      </Card>

      <div id="resultats" aria-live="polite" className="scroll-mt-20">
        {lastResult ? (
          <ResultsView
            result={lastResult}
            locale={locale}
            onPickDate={(date) => {
              state.setWhen(date === today ? { mode: 'now' } : { mode: 'plan', date, time: when.mode === 'plan' ? when.time : null });
              void Promise.resolve().then(run);
            }}
          />
        ) : status !== 'running' && location && basket.length > 0 ? (
          <p className="text-muted">{m.results.empty}</p>
        ) : null}
      </div>
    </div>
  );
}
