'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ScenarioDto } from '@cabas/core';
import { format, getMessages, paths, type Locale } from '@/i18n';
import { dateTime, money, time } from '@/lib/format';
import { useApp, useHydrated } from '@/lib/store';
import { IconCheck, IconPrint, IconRoute, IconShare } from './icons';
import { OptionLine } from './price-bits';
import { Button, Card, ChainBadge, cx, Notice, PageTitle } from './ui';

function listText(s: ScenarioDto, savedAt: string, demo: boolean): string {
  const lines: string[] = [`Liste de courses — Cabas (calculée le ${dateTime(savedAt)}${demo ? ', prix fictifs de démonstration' : ''})`];
  for (const stop of s.stops) {
    lines.push('', `${stop.order}. ${stop.store.chainName} — ${stop.store.name}${stop.store.address ? `, ${stop.store.address}` : ''}`);
    for (const it of stop.items) {
      const qty = it.option.packs !== 1 ? `${it.option.packs} × ` : '';
      lines.push(`  ☐ ${qty}${it.productName} — ${money(it.option.totalCents)}${it.option.promotion ? ` (${it.option.promotion.mechanic})` : ''}`);
    }
    lines.push(`  Sous-total : ${money(stop.subtotalCents)}`);
  }
  lines.push('', `Total : ${money(s.purchaseCents)}`, `Itinéraire : ${s.navigationUrl}`);
  return lines.join('\n');
}

export function ListView({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const hydrated = useHydrated();
  const { savedList, checked, toggleChecked, resetChecked } = useApp();
  const [copied, setCopied] = useState(false);

  if (!hydrated) return <PageTitle>{m.list.title}</PageTitle>;
  const scenario = savedList?.result.scenarios.find((s) => s.kind === savedList.scenario);
  if (!savedList || !scenario) {
    return (
      <div className="space-y-4">
        <PageTitle>{m.list.title}</PageTitle>
        <p className="rounded-2xl border border-dashed border-border p-4 text-muted">{m.list.empty}</p>
        <Link href={paths.compare(locale)} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-on-primary">
          {m.nav.compare}
        </Link>
      </div>
    );
  }

  const key = (storeId: string, lineId: string) => `${savedList.scenario}:${storeId}:${lineId}`;
  const total = scenario.stops.reduce((a, s) => a + s.items.length, 0);
  const done = scenario.stops.reduce((a, s) => a + s.items.filter((it) => checked[key(s.store.id, it.lineId)]).length, 0);
  const outdated = Date.now() - Date.parse(savedList.savedAt) > 24 * 3600_000;
  const demo = savedList.result.meta.dataMode !== 'live';

  const share = async () => {
    const text = listText(scenario, savedList.savedAt, demo);
    try {
      if (navigator.share) {
        await navigator.share({ title: m.list.title, text });
        return;
      }
    } catch {
      /* partage annulé : repli sur le presse-papiers */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle sub={`${m.results.scenarios[scenario.kind]} · ${format(m.list.generated, { date: dateTime(savedList.savedAt) })}`}>{m.list.title}</PageTitle>

      {demo && <Notice tone="demo">{m.results.demoNotice}</Notice>}
      {outdated && <Notice tone="warn">{m.list.outdated}</Notice>}

      <div className="no-print flex flex-wrap gap-2">
        <Button variant="secondary" onClick={share}>
          <IconShare /> {copied ? m.list.copied : m.list.share}
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          <IconPrint /> {m.list.print}
        </Button>
        <a
          href={scenario.navigationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-[15px] font-semibold hover:bg-surface-2"
        >
          <IconRoute /> {m.list.route} ↗
        </a>
      </div>

      <div className="no-print">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium">{format(m.list.progress, { done, total })}</span>
          {done > 0 && (
            <button type="button" onClick={resetChecked} className="text-muted underline-offset-2 hover:underline">
              {m.list.reset}
            </button>
          )}
        </div>
        <div className="h-2 rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      </div>

      {scenario.stops.map((stop) => (
        <Card key={stop.store.id} className="print-break">
          <div className="mb-2 flex items-start gap-3">
            <ChainBadge badge={stop.store.chainBadge} name={stop.store.chainName} />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold">
                {stop.order}. {stop.store.chainName}
              </h2>
              <p className="text-sm text-muted">
                {stop.store.name}
                {stop.store.address ? ` · ${stop.store.address}` : ''}
              </p>
              <p className="text-sm text-muted">
                {stop.arrivalTime ? `${format(m.results.arrival, { time: time(stop.arrivalTime) })} · ` : ''}
                {stop.store.hoursOnDate ?? m.stores.hoursUnknown}
              </p>
              <a href={stop.links.apple} target="_blank" rel="noopener noreferrer" className="no-print text-sm text-primary underline-offset-2 hover:underline">
                Plans ↗
              </a>{' '}
              <a href={stop.links.geo} className="no-print text-sm text-primary underline-offset-2 hover:underline">
                · GPS
              </a>
            </div>
            <p className="num font-bold">{money(stop.subtotalCents)}</p>
          </div>
          <ul className="divide-y divide-border">
            {stop.items.map((it) => {
              const k = key(stop.store.id, it.lineId);
              const isDone = Boolean(checked[k]);
              return (
                <li key={it.lineId}>
                  <label className={cx('flex cursor-pointer items-start gap-3 py-3', isDone && 'opacity-55')}>
                    <input type="checkbox" className="peer sr-only" checked={isDone} onChange={() => toggleChecked(k)} />
                    <span
                      aria-hidden
                      className={cx(
                        'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border-2 peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-[var(--focus)]',
                        isDone ? 'border-primary bg-primary text-on-primary' : 'border-border',
                      )}
                    >
                      {isDone && <IconCheck className="h-5 w-5" />}
                    </span>
                    <span className={cx('min-w-0 flex-1', isDone && 'line-through decoration-2')}>
                      <OptionLine productName={it.productName} qty={it.qty} option={it.option} locale={locale} compact />
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Card className="flex items-center justify-between">
        <span className="font-semibold">{m.results.products}</span>
        <span className="num text-xl font-extrabold">{money(scenario.purchaseCents)}</span>
      </Card>

      {scenario.missing.length > 0 && (
        <Notice tone="warn">
          {m.results.missingTitle} : {scenario.missing.map((mi) => mi.productName).join(', ')}
        </Notice>
      )}
      <p className="text-xs text-muted">{m.status.availability}</p>
    </div>
  );
}
