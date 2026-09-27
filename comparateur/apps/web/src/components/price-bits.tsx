'use client';

import type { LineOption, PriceStatus } from '@cabas/core';
import { format, getMessages, type Locale } from '@/i18n';
import { money, shortDate, unitPriceLabel } from '@/lib/format';
import { Pill } from './ui';

const TONE: Record<PriceStatus, 'primary' | 'accent' | 'warn' | 'danger' | 'demo'> = {
  verified: 'primary',
  promo_confirmed: 'accent',
  indicative: 'warn',
  stale: 'danger',
  demo: 'demo',
};

/** Statut de fiabilité d'un prix, avec date de vérification et motifs. */
export function StatusBadge({ option, locale }: { option: LineOption; locale: Locale }) {
  const m = getMessages(locale);
  const reasons = option.statusReasons.map((r) => m.status.reasons[r] ?? r).join(' · ');
  const title = `${m.status[option.status]} — ${format(m.status.checkedOn, { date: shortDate(option.observedAt) })}${reasons ? ` — ${reasons}` : ''}`;
  return (
    <Pill tone={TONE[option.status]} title={title}>
      {m.status[option.status]}
    </Pill>
  );
}

/** Ligne d'une liste de courses : article, quantité, prix, promotion, statut. */
export function OptionLine({
  productName,
  qty,
  option,
  locale,
  compact,
}: {
  productName: string;
  qty: number;
  option: LineOption;
  locale: Locale;
  compact?: boolean;
}) {
  const m = getMessages(locale);
  const reasons = option.statusReasons.filter((r) => r !== 'demo_data').map((r) => m.status.reasons[r] ?? r);
  const packInfo = option.packs !== qty ? `${option.packs} × ` : qty > 1 ? `${qty} × ` : '';
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium leading-snug">
          {packInfo}
          {productName}
        </p>
        <div className="shrink-0 text-right">
          <p className="num font-bold">{money(option.totalCents)}</p>
          {option.promotion && option.regularTotalCents != null && option.regularTotalCents > option.totalCents && (
            <p className="num text-xs text-muted line-through" aria-label="Prix normal">
              {money(option.regularTotalCents)}
            </p>
          )}
        </div>
      </div>
      {!compact && (
        <p className="text-sm text-muted">
          {option.productName}
          {option.brand ? ` · ${option.brand}` : ''} · {unitPriceLabel(option.unitPrice)}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {option.promotion && (
          <Pill tone="accent" title={option.promotion.label ?? undefined}>
            {option.promotion.mechanic}
            {option.promotion.endIsPresumed ? '' : ` · jusqu’au ${shortDate(`${option.promotion.validTo}T12:00:00Z`)}`}
          </Pill>
        )}
        <StatusBadge option={option} locale={locale} />
        {!compact && reasons.length > 0 && <span className="text-xs text-muted">{reasons.join(' · ')}</span>}
      </div>
    </div>
  );
}
