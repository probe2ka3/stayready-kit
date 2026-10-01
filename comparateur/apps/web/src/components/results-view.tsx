'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CompareResultDto, OutlookDayDto, ScenarioDto, ScenarioKind, SolutionDto } from '@cabas/core';
import { format, getMessages, paths, plural, type Locale } from '@/i18n';
import { duration, km, money, shortCalendarDate, shortDate, time } from '@/lib/format';
import { track } from '@/lib/metrics';
import { useApp } from '@/lib/store';
import { IconRoute } from './icons';
import { PartnerSlot } from './partner-slot';
import { OptionLine } from './price-bits';
import { Button, Card, ChainBadge, cx, Notice, Pill } from './ui';

const ORDER: ScenarioKind[] = ['single_store', 'cheapest_products', 'optimized_total'];

export function ResultsView({
  result,
  locale,
  onPickDate,
  onRerun,
}: {
  result: CompareResultDto;
  locale: Locale;
  onPickDate?: (date: string) => void;
  /** Relance la comparaison après l'acceptation ou le refus d'un détour. */
  onRerun?: () => void;
}) {
  const m = getMessages(locale);
  const scenarios = ORDER.map((k) => result.scenarios.find((s) => s.kind === k)).filter((s): s is ScenarioDto => Boolean(s));
  const [selected, setSelected] = useState<ScenarioKind>(scenarios.some((s) => s.kind === 'optimized_total') ? 'optimized_total' : (scenarios[0]?.kind ?? 'single_store'));
  const current = scenarios.find((s) => s.kind === selected) ?? scenarios[0];

  const globalWarnings = result.meta.warnings.filter((w) => w !== 'demo_data' && m.results.warnings[w]);

  return (
    <div className="space-y-5">
      {result.meta.dataMode !== 'live' && <Notice tone="demo">{m.results.demoNotice}</Notice>}
      {globalWarnings.length > 0 && (
        <div className="space-y-1.5">
          {globalWarnings.map((w) => (
            <Notice key={w} tone={w === 'no_open_store' || w === 'no_stores_in_radius' ? 'warn' : 'info'}>
              {m.results.warnings[w]}
            </Notice>
          ))}
        </div>
      )}

      {result.waitSignal && <WaitSignal signal={result.waitSignal} locale={locale} onPick={onPickDate} />}

      {(result.solutions ?? []).length > 0 && <Solutions result={result} locale={locale} />}
      <TravelMethod result={result} locale={locale} />

      {scenarios.length === 0 ? null : (
        <>
          <div role="tablist" aria-label="Scénarios" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {scenarios.map((s) => (
              <ScenarioTab key={s.kind} s={s} locale={locale} active={s.kind === current?.kind} onSelect={() => setSelected(s.kind)} />
            ))}
          </div>
          {current && <ScenarioDetail s={current} locale={locale} onRerun={onRerun} />}
        </>
      )}

      <Alternatives result={result} locale={locale} chosen={result.scenarios.find((x) => x.kind === 'optimized_total')?.storeCount ?? null} />
      <Ranking result={result} locale={locale} />
      {result.planning && <Planning result={result} locale={locale} />}
      <PriceDates result={result} locale={locale} />
      {result.outlook.length > 0 && <Outlook days={result.outlook} locale={locale} onPick={onPickDate} target={result.meta.targetDate} />}

      <PartnerSlot slot="results_footer" />

      <p className="text-xs text-muted">
        {format(m.results.computedIn, { ms: result.meta.stats.durationMs })} · {result.meta.storesConsidered} succursales ·{' '}
        {result.meta.stats.subsetsEvaluated} combinaisons évaluées.
      </p>
    </div>
  );
}

function ScenarioTab({ s, locale, active, onSelect }: { s: ScenarioDto; locale: Locale; active: boolean; onSelect: () => void }) {
  const m = getMessages(locale);
  const saving = s.savings && s.savings.globalSavingsCents > 0 ? s.savings.globalSavingsCents : 0;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cx(
        'rounded-2xl border p-3 text-left transition-colors',
        active ? 'border-primary bg-primary-soft/60 ring-2 ring-primary/30' : 'border-border bg-surface hover:bg-surface-2',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{m.results.scenarios[s.kind]}</span>
        {s.kind === 'optimized_total' && <Pill tone="primary">{m.results.recommended}</Pill>}
      </span>
      <span className="num mt-1 block text-2xl font-extrabold tracking-tight">{money(s.globalCents)}</span>
      <span className="block text-sm text-muted">
        {m.results.global} · {m.results.products} {money(s.purchaseCents)} · {plural(m.results.storeCount, s.storeCount)} · {km(s.travel.distanceKm)}
      </span>
      <span className="mt-1.5 flex flex-wrap gap-1">
        {saving > 0 && <Pill tone="accent">−{money(saving)}</Pill>}
        {s.coveredLines < s.totalLines && (
          <Pill tone="warn">{plural(m.results.missingCount, s.totalLines - s.coveredLines)}</Pill>
        )}
      </span>
    </button>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-2.5">
      <p className="text-xs text-muted">{label}</p>
      <p className="num text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ScenarioDetail({ s, locale, onRerun }: { s: ScenarioDto; locale: Locale; onRerun?: () => void }) {
  const m = getMessages(locale);
  const router = useRouter();
  const saveList = useApp((st) => st.saveList);
  const removeIncluded = useApp((st) => st.removeIncluded);
  const savings = s.savings;
  return (
    <section aria-label={m.results.scenarios[s.kind]} className="space-y-4">
      <p className="text-muted">{m.results.scenarioHelp[s.kind]}</p>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat
          label={m.results.products}
          value={money(s.purchaseCents)}
          sub={s.promoSavingsCents > 0 ? format(m.results.promoSaved, { amount: money(s.promoSavingsCents) }) : undefined}
        />
        <Stat
          label={m.results.travel}
          value={money(s.travel.travelCostCents + s.travel.inStoreCostCents)}
          sub={`${km(s.travel.distanceKm)} · ${duration(s.travel.driveMin)}`}
        />
        <Stat label={m.results.duration} value={duration(s.travel.totalMin)} sub={`${duration(s.travel.inStoreMin)} ${m.results.inStore}`} />
        <Stat label={m.results.global} value={money(s.globalCents)} sub={plural(m.results.storeCount, s.storeCount)} />
      </div>

      {savings && <SavingsCard savings={savings} locale={locale} />}

      {s.warnings.includes('presumed_hours') ? (
        <Notice tone="warn">{m.results.warnings.presumed_hours}</Notice>
      ) : (
        s.warnings.includes('opening_hours_unknown') && <Notice tone="warn">{m.results.warnings.opening_hours_unknown}</Notice>
      )}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <IconRoute /> {m.results.route}
          </h3>
          <a
            href={s.navigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-2"
          >
            {m.results.openRoute} ↗
          </a>
        </div>
        <ol className="space-y-3">
          {s.stops.map((stop) => (
            <li key={stop.store.id} className="flex gap-3">
              <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary">{stop.order}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {stop.store.chainName} <span className="font-normal text-muted">· {stop.store.name}</span>
                  {s.includedStoreIds.includes(stop.store.id) && (
                    <>
                      {' '}
                      <Pill tone="info">{m.results.detours.included}</Pill>{' '}
                      <button
                        type="button"
                        className="text-sm font-normal text-danger underline underline-offset-2"
                        onClick={() => {
                          removeIncluded(stop.store.id);
                          onRerun?.();
                        }}
                      >
                        {m.results.detours.remove}
                      </button>
                    </>
                  )}
                </p>
                {stop.store.address && <p className="text-sm text-muted">{stop.store.address}</p>}
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                  {km(stop.legDistanceKm)} · {duration(stop.legDurationMin)}
                  {stop.arrivalTime && <> · {format(m.results.arrival, { time: time(stop.arrivalTime) })}</>}
                  {stop.openStatus === 'open' && <Pill tone="primary">{m.results.openStatus.open}</Pill>}
                  {stop.openStatus === 'unknown' && <Pill tone="warn">{m.results.openStatus.unknown}</Pill>}
                  {stop.store.hoursOnDate && <span>· {stop.store.hoursOnDate}</span>}
                </p>
              </div>
            </li>
          ))}
          {s.travel.returnLeg && (
            <li className="flex gap-3 text-sm text-muted">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border">⌂</span>
              Retour · {km(s.travel.returnLeg.distanceKm)} · {duration(s.travel.returnLeg.durationMin)}
            </li>
          )}
        </ol>
      </Card>

      {s.stops.map((stop) => (
        <Card key={stop.store.id} className="print-break">
          <div className="mb-2 flex items-center gap-3">
            <ChainBadge badge={stop.store.chainBadge} name={stop.store.chainName} />
            <div className="min-w-0 flex-1">
              <h3 className="font-bold">
                {stop.order}. {stop.store.chainName}
              </h3>
              <p className="truncate text-sm text-muted">{stop.store.name}</p>
            </div>
            <p className="num text-right font-bold">{money(stop.subtotalCents)}</p>
          </div>
          <ul className="divide-y divide-border">
            {stop.items.map((it) => (
              <li key={it.lineId} className="py-2.5">
                <OptionLine productName={it.productName} qty={it.qty} option={it.option} locale={locale} />
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {s.detours.length > 0 && <Detours s={s} locale={locale} onRerun={onRerun} />}

      {s.missing.length > 0 && (
        <Card>
          <h3 className="mb-2 font-bold">{m.results.missingTitle}</h3>
          <ul className="space-y-2 text-sm">
            {s.missing.map((mi) => (
              <li key={mi.lineId}>
                <p className="font-medium">
                  {mi.qty > 1 ? `${mi.qty} × ` : ''}
                  {mi.productName}
                </p>
                <p className="text-muted">{mi.scope === 'everywhere' ? m.results.missingEverywhere : m.results.missingSelected}</p>
                {mi.lastKnown && (
                  <p className="text-muted">
                    {format(m.results.lastKnown, { price: money(mi.lastKnown.priceCents), date: shortDate(mi.lastKnown.observedAt) })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-muted">{m.status.availability}</p>

      <Button
        size="lg"
        className="w-full"
        onClick={() => {
          track('list', 'saved');
          saveList(s.kind);
          router.push(paths.list(locale));
        }}
      >
        {m.results.useList}
      </Button>
    </section>
  );
}

/**
 * Propositions d'arrêts supplémentaires : économie brute, coût du trajet ajouté,
 * économie nette et articles concernés. Accepter impose le magasin ; refuser l'écarte.
 */
function Detours({ s, locale, onRerun }: { s: ScenarioDto; locale: Locale; onRerun?: () => void }) {
  const m = getMessages(locale);
  const d = m.results.detours;
  const { acceptDetour, refuseDetour, minSavingChf } = useApp();
  return (
    <section aria-labelledby={`detours-${s.kind}`} className="space-y-2">
      <h3 id={`detours-${s.kind}`} className="text-lg font-bold">
        {d.title}
      </h3>
      <p className="text-sm text-muted">{d.help}</p>
      {s.detours.map((o) => (
        <Card key={o.store.id} className={cx('space-y-3', o.worthwhile && 'border-accent')}>
          <div className="flex items-center gap-3">
            <ChainBadge badge={o.store.chainBadge} name={o.store.chainName} />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{o.store.chainName}</p>
              <p className="truncate text-sm text-muted">
                {o.store.name}
                {o.store.address ? ` · ${o.store.address}` : ''}
              </p>
            </div>
          </div>
          {o.grossSavingsCents > 0 && (
            <p className="font-medium">
              {format(d.message, {
                amount: money(o.grossSavingsCents),
                items: plural(d.itemsCount, o.items.filter((it) => it.savingCents > 0).length),
                km: km(Math.max(0, o.extraDistanceKm)),
              })}{' '}
              {o.extraMinutes > 0 && format(d.messageTime, { time: duration(o.extraMinutes) })}
            </p>
          )}
          {o.extraCoveredLines > 0 && (
            <p className="font-medium">
              {plural(d.addsItems, o.extraCoveredLines)} ({money(o.addedItemsCents)})
            </p>
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted">{d.gross}</dt>
              <dd className="num font-semibold">{money(o.grossSavingsCents)}</dd>
            </div>
            <div>
              <dt className="text-muted">{d.travel}</dt>
              <dd className="num font-semibold">
                {o.extraTravelCostCents >= 0 ? '+' : '−'}
                {money(Math.abs(o.extraTravelCostCents))} · {km(Math.max(0, o.extraDistanceKm))}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{d.time}</dt>
              <dd className="num font-semibold">{duration(Math.max(0, o.extraMinutes))}</dd>
            </div>
            <div>
              <dt className="text-muted">{d.net}</dt>
              <dd className={cx('num font-bold', o.netSavingsCents > 0 ? 'text-primary-strong' : 'text-danger')}>
                {o.netSavingsCents >= 0 ? '' : '−'}
                {money(Math.abs(o.netSavingsCents))}
              </dd>
            </div>
          </dl>
          {o.droppedStores.length > 0 && (
            <p className="text-sm text-muted">{format(d.replaces, { stores: o.droppedStores.map((x) => `${x.chainName} (${x.name})`).join(', ') })}</p>
          )}
          {o.reason === 'below_threshold' && (
            <p className="text-sm text-muted">{format(d.belowThreshold, { amount: money(Math.round(minSavingChf * 100)) })}</p>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-semibold">{d.itemsTitle}</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {o.items.map((it) => (
                <li key={it.lineId} className="flex justify-between gap-3">
                  <span>
                    {it.qty > 1 ? `${it.qty} × ` : ''}
                    {it.productName}
                  </span>
                  <span className="num text-right">
                    {money(it.newCents)}{' '}
                    <span className="text-muted">
                      {it.baseCents != null ? format(d.insteadOf, { price: money(it.baseCents) }) : d.newItem}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={o.worthwhile ? 'primary' : 'secondary'}
              onClick={() => {
                track('detour', 'accepted');
                acceptDetour(o.store.id);
                onRerun?.();
              }}
            >
              {d.accept}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                track('detour', 'refused');
                refuseDetour(o.store.id);
                onRerun?.();
              }}
            >
              {d.refuse}
            </Button>
          </div>
        </Card>
      ))}
    </section>
  );
}

/** Signal « attendre serait moins cher », fondé uniquement sur les promotions déjà annoncées. */
function WaitSignal({ signal, locale, onPick }: { signal: NonNullable<CompareResultDto['waitSignal']>; locale: Locale; onPick?: (d: string) => void }) {
  const m = getMessages(locale);
  return (
    <Card className="space-y-2 border-accent">
      <h3 className="font-bold">{m.results.wait.title}</h3>
      <p>
        {format(m.results.wait.text, {
          amount: money(signal.savingsCents),
          date: shortCalendarDate(signal.date),
          days: plural(m.results.wait.days, signal.daysLater),
        })}
      </p>
      <p className="text-sm text-muted">{m.results.wait.note}</p>
      {onPick && (
        <Button
          variant="secondary"
          onClick={() => {
            track('wait_signal', 'used');
            onPick(signal.date);
          }}
        >
          {m.results.wait.pick}
        </Button>
      )}
    </Card>
  );
}

/**
 * Économie (ou surcoût) par rapport à la référence, présentée sans l'embellir :
 * produits, trajet, bilan, et différences de couverture du panier.
 */
function SavingsCard({ savings, locale }: { savings: NonNullable<ScenarioDto['savings']>; locale: Locale }) {
  const m = getMessages(locale);
  if (savings.isReference) {
    return (
      <Card>
        <p className="text-[15px]">
          <span className="font-semibold">{m.results.noSavings} : </span>
          {savings.referenceLabel}
        </p>
      </Card>
    );
  }
  const g = savings.globalSavingsCents;
  return (
    <Card className="space-y-1.5">
      <p className="text-[15px]">
        <span className="font-semibold">{g > 0 ? m.results.savings : g < 0 ? m.results.surcharge : m.results.equivalent}</span>
        {g !== 0 && (
          <>
            {' : '}
            <span className={cx('num font-bold', g > 0 ? 'text-accent' : 'text-warn')}>{money(Math.abs(g))}</span>
          </>
        )}{' '}
        {format(m.results.savingsVs, { ref: savings.referenceLabel })}, {plural(m.results.savingsOn, savings.comparableLines)}.
      </p>
      <p className="num text-sm text-muted">
        {m.results.productsDelta} {savings.purchaseSavingsCents >= 0 ? '−' : '+'}
        {money(Math.abs(savings.purchaseSavingsCents))} · {m.results.travelDelta} {savings.travelDeltaCents > 0 ? '+' : '−'}
        {money(Math.abs(savings.travelDeltaCents))}
      </p>
      {savings.extraCoveredLines > 0 && (
        <p className="text-sm">{plural(m.results.extraCovered, savings.extraCoveredLines, { ref: savings.referenceLabel })}</p>
      )}
      {savings.lostLines > 0 && (
        <p className="text-sm text-warn">{plural(m.results.lostCovered, savings.lostLines, { ref: savings.referenceLabel })}</p>
      )}
      <details>
        <summary className="text-sm font-medium text-primary">{m.results.formula}</summary>
        <p className="mt-1 text-sm text-muted">{m.results.formulaText}</p>
      </details>
    </Card>
  );
}

function Alternatives({ result, locale, chosen }: { result: CompareResultDto; locale: Locale; chosen: number | null }) {
  const m = getMessages(locale);
  // N'afficher un nombre de magasins que s'il réduit réellement le coût des produits
  // (ou couvre davantage d'articles) par rapport aux options avec moins de magasins.
  const alts: Array<NonNullable<CompareResultDto['alternativesByStoreCount'][number]>> = [];
  for (const a of result.alternativesByStoreCount) {
    if (!a) continue;
    const prev = alts[alts.length - 1];
    if (!prev || a.coveredLines > prev.coveredLines || (a.coveredLines === prev.coveredLines && a.purchaseCents < prev.purchaseCents)) {
      alts.push(a);
    }
  }
  if (alts.length < 2) return null;
  const max = Math.max(...alts.map((a) => a.globalCents));
  return (
    <Card>
      <h2 className="font-bold">{m.results.alternatives}</h2>
      <p className="mb-3 text-sm text-muted">{m.results.alternativesHelp}</p>
      <ul className="space-y-2">
        {alts.map((a) => (
          <li key={a.storeCount} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm">
            <span>
              {plural(m.results.storeCount, a.storeCount)}
              {a.coveredLines < result.totalLines && (
                <span className="block text-xs text-warn">{format(m.results.coverage, { covered: a.coveredLines, total: result.totalLines })}</span>
              )}
            </span>
            <span className="h-3 rounded-full bg-surface-2">
              <span
                className={cx('block h-3 rounded-full', a.storeCount === chosen ? 'bg-primary' : 'bg-muted/40')}
                style={{ width: `${Math.max(8, (a.globalCents / max) * 100)}%` }}
              />
            </span>
            <span className="num text-right font-semibold">
              {money(a.globalCents)}
              {a.storeCount === chosen && <span className="block text-xs font-medium text-primary">{m.results.chosen}</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Ranking({ result, locale }: { result: CompareResultDto; locale: Locale }) {
  const m = getMessages(locale);
  if (result.singleStoreRanking.length === 0) return null;
  return (
    <Card>
      <h2 className="mb-2 font-bold">{m.results.ranking}</h2>
      <ul className="divide-y divide-border">
        {result.singleStoreRanking.map((r) => (
          <li key={r.chainId} className="flex items-center gap-3 py-2">
            <ChainBadge badge={r.chainBadge} name={r.chainName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.chainName}</p>
              <p className="text-xs text-muted">
                {!r.reachable
                  ? m.results.unreachable
                  : r.isComplete
                    ? `${r.store?.name ?? ''} · ${km(r.distanceKm ?? 0)}`
                    : plural(m.results.rankingIncomplete, r.totalLines - r.coveredLines)}
              </p>
            </div>
            <span className="text-right">
              <span className={cx('num block font-semibold', !r.isComplete && 'text-muted')}>{r.coveredLines > 0 ? money(r.purchaseCents) : '—'}</span>
              {!r.isComplete && (
                <span className="block text-xs text-warn">
                  {format(m.results.solutions.coverage, {
                    covered: r.coveredLines,
                    total: r.totalLines,
                    pct: Math.round((r.coveredLines / Math.max(1, r.totalLines)) * 100),
                  })}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Planning({ result, locale }: { result: CompareResultDto; locale: Locale }) {
  const m = getMessages(locale);
  const p = result.planning;
  if (!p) return null;
  const target = shortCalendarDate(p.targetDate);
  // Articles du scénario recommandé : action publiée valable ce jour-là vs dernier prix connu.
  const scenario = result.scenarios.find((x) => x.kind === 'optimized_total') ?? result.scenarios[0];
  const items = scenario ? scenario.stops.flatMap((st) => st.items) : [];
  const focus = items.length
    ? {
        promo: items.filter((it) => it.option.promotion && it.option.status === 'promo_confirmed').length,
        known: items.filter((it) => it.option.status !== 'promo_confirmed').length,
      }
    : null;
  return (
    <Card className="space-y-3">
      <h2 className="font-bold">{format(m.results.planningTitle, { date: target })}</h2>
      <div className="grid grid-cols-3 gap-2">
        <Stat label={m.results.planningToday} value={money(p.todayPurchaseCents)} />
        <Stat label={format(m.results.planningTarget, { date: target })} value={money(p.targetPurchaseCents)} />
        <Stat
          label={m.results.planningDiff}
          value={`${p.differenceCents > 0 ? '−' : p.differenceCents < 0 ? '+' : ''}${money(Math.abs(p.differenceCents))}`}
          sub={p.differenceCents > 0 ? m.results.planningCheaperLater : p.differenceCents < 0 ? m.results.planningDearerLater : undefined}
        />
      </div>
      {focus && (
        <p className="text-sm">
          {format(m.results.planningSummary, {
            date: target,
            promo: plural(m.results.planningSummaryPromo, focus.promo),
            known: plural(m.results.planningSummaryPromo, focus.known),
          })}
        </p>
      )}
      {p.startingPromotions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{m.results.planningStarting}</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {p.startingPromotions.map((e) => (
              <li key={`${e.lineId}-${e.chainId}-${e.validFrom}`}>
                <Pill tone="accent">{e.mechanic}</Pill> {e.productName} · {e.chainName} · dès le {shortCalendarDate(e.validFrom)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.expiringPromotions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">{m.results.planningExpiring}</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {p.expiringPromotions.map((e) => (
              <li key={`${e.lineId}-${e.chainId}-${e.validTo}`}>
                <Pill>{e.mechanic}</Pill> {e.productName} · {e.chainName} · jusqu’au {shortCalendarDate(e.validTo)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-muted">{m.results.planningNote}</p>
    </Card>
  );
}

function Outlook({ days, locale, onPick, target }: { days: OutlookDayDto[]; locale: Locale; onPick?: (d: string) => void; target: string }) {
  const m = getMessages(locale);
  const max = Math.max(...days.map((d) => d.purchaseCents));
  const min = Math.min(...days.map((d) => d.purchaseCents));
  const span = Math.max(1, max - min);
  return (
    <Card>
      <h2 className="font-bold">{m.results.outlookTitle}</h2>
      <p className="mb-3 text-sm text-muted">{m.results.outlookHelp}</p>
      <ol className="scrollbar-none -mx-1 flex items-end gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((d) => {
          const h = 40 + ((d.purchaseCents - min) / span) * 60;
          const best = d.purchaseCents === min;
          const selected = d.date === target;
          return (
            <li key={d.date} className="flex min-w-[3.4rem] flex-1 flex-col items-center gap-1">
              <span className="num text-[11px] font-semibold">{money(d.purchaseCents).replace('CHF', '').trim()}</span>
              <button
                type="button"
                onClick={() => onPick?.(d.date)}
                aria-label={`${shortCalendarDate(d.date)} : ${money(d.purchaseCents)}`}
                className={cx('w-full rounded-t-lg transition-colors', best ? 'bg-primary' : 'bg-primary/30 hover:bg-primary/50', selected && 'ring-2 ring-accent')}
                style={{ height: `${h}px` }}
              />
              <span className="text-center text-[11px] leading-tight text-muted">{shortCalendarDate(d.date)}</span>
              {d.promoLines > 0 && <span className="text-[10px] font-semibold text-accent">{d.promoLines} promo</span>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/**
 * Tableau « Lidl seul / Aldi seul / combinaison » : achats, trajet aller-retour, total et économies
 * par rapport au meilleur magasin unique complet. Une solution incomplète n'affiche pas d'économie.
 */
function Solutions({ result, locale }: { result: CompareResultDto; locale: Locale }) {
  const m = getMessages(locale);
  const t = m.results.solutions;
  const rows = result.solutions;
  const noRef = rows.every((r) => r.notComparable === 'no_complete_reference');
  const label = (r: SolutionDto) =>
    r.kind === 'combination'
      ? `${t.combination} (${r.stores.map((st) => st.chainName).join(' + ')})`
      : format(t.chain, { chain: r.stores[0]?.chainName ?? r.chainIds[0] ?? '' });
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">{t.title}</h2>
        <p className="text-sm text-muted">{t.help}</p>
      </div>
      {noRef && <Notice tone="warn">{t.noCompleteReference}</Notice>}
      {(result.unavailableEverywhere ?? []).length > 0 && (
        <p className="text-sm text-warn">
          {format(t.unavailableEverywhere, { list: result.unavailableEverywhere.map((u) => u.productName).join(', ') })}
        </p>
      )}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.key}
            data-testid={`solution-${r.key}`}
            className={cx('rounded-xl border p-3', r.isReference ? 'border-primary' : 'border-border', !r.complete && 'opacity-80')}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                {label(r)}
                {r.isReference && (
                  <>
                    {' '}
                    <Pill tone="primary">{t.reference}</Pill>
                  </>
                )}
              </p>
              <p className="num text-lg font-extrabold">{r.complete ? money(r.globalCents) : '—'}</p>
            </div>
            <p className="text-xs text-muted">
              {r.stores.map((st) => `${st.chainName} · ${st.name}${st.address ? `, ${st.address}` : ''} (${km(st.crowKm)})`).join(' → ')}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">{t.purchases}</dt>
                <dd className="num font-semibold">{money(r.purchaseCents)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.travel}</dt>
                <dd className="num font-semibold">
                  {money(r.travelCostCents)} · {km(r.distanceKm)} · {duration(r.driveMin)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">{t.gross}</dt>
                <dd className="num font-semibold">{r.grossSavingsCents == null ? '—' : signed(r.grossSavingsCents)}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.net}</dt>
                <dd className={cx('num font-bold', (r.netSavingsCents ?? 0) > 0 && 'text-primary-strong', (r.netSavingsCents ?? 0) < 0 && 'text-danger')}>
                  {r.netSavingsCents == null ? '—' : signed(r.netSavingsCents)}
                </dd>
              </div>
            </dl>
            <p className="mt-1 text-xs text-muted">
              {format(t.coverage, { covered: r.coveredLines, total: r.totalLines, pct: Math.round(r.coverageRate * 100) })} ·{' '}
              {format(t.prices, { promo: String(r.promoLines), indicative: String(r.indicativeLines) })}
            </p>
            {!r.complete && <p className="text-xs font-medium text-warn">{plural(t.incomplete, r.totalLines - r.coveredLines)}</p>}
            {r.kind === 'combination' && !r.retained && <p className="text-xs text-muted">{t.notRetained}</p>}
          </li>
        ))}
      </ul>
      {!rows.some((r) => r.kind === 'combination') && rows.filter((r) => r.kind === 'single_chain').length > 1 && (
        <p className="text-sm text-muted">{t.noCombination}</p>
      )}
    </Card>
  );
}

/** Économie : positive = moins cher que la référence ; négative (« −2.07 CHF ») = plus cher. */
function signed(cents: number): string {
  return cents >= 0 ? money(cents) : `−${money(-cents)}`;
}

/** Méthode d'estimation des trajets, en clair : jamais présentée comme un itinéraire routier. */
function TravelMethod({ result, locale }: { result: CompareResultDto; locale: Locale }) {
  const m = getMessages(locale);
  const t = result.meta.travelMethod;
  if (!t) return null;
  const ret = t.returnToOrigin ? m.results.travelMethod.returnTrip : m.results.travelMethod.oneWay;
  const cost = money(Math.round(t.costPerKmChf * 100));
  const text = t.estimated
    ? format(m.results.travelMethod.estimated, {
        factor: String(t.detourFactor ?? '').replace('.', ','),
        overhead: String(t.overheadMin ?? 0),
        speed: String(t.speedKmh ?? ''),
        ret,
        cost,
      })
    : format(m.results.travelMethod.routed, { provider: t.provider, ret, cost });
  return <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">{text}</p>;
}

/** Dates des relevés réellement utilisés, par enseigne. */
function PriceDates({ result, locale }: { result: CompareResultDto; locale: Locale }) {
  const m = getMessages(locale);
  const list = (result.meta.priceDates ?? []).map((d) => {
    const chain = result.singleStoreRanking.find((r) => r.chainId === d.chainId)?.chainName ?? d.chainId;
    const oldest = shortDate(d.oldest);
    const newest = shortDate(d.newest);
    return oldest === newest
      ? format(m.results.priceDatesSame, { chain, date: newest })
      : format(m.results.priceDatesItem, { chain, oldest, newest });
  });
  if (list.length === 0) return null;
  return (
    <>
      <p className="text-xs text-muted">{format(m.results.priceDates, { list: list.join(' · ') })}</p>
      <p className="text-xs text-muted">{m.results.statusLegend}</p>
    </>
  );
}
