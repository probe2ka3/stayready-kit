'use client';

import { formatQuantity, quantityGap, type LineOption, type PriceStatus } from '@cabas/core';
import { format, getMessages, type Locale } from '@/i18n';
import { money, shortCalendarDate, shortDate, unitPriceLabel } from '@/lib/format';
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
  // Date de lecture visible : « vérifié » n'est jamais une garantie au-delà de ce jour.
  const badge = m.status.badge[option.status];
  return (
    <Pill tone={TONE[option.status]} title={title}>
      {badge ? format(badge, { date: shortDate(option.observedAt) }) : m.status[option.status]}
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
  const promo = option.promotion;
  const promoPhase = promo
    ? promo.announced
      ? format(promo.endIsPresumed ? m.status.promoAnnouncedOpenEnd : m.status.promoAnnounced, {
          from: shortCalendarDate(promo.validFrom),
          to: shortCalendarDate(promo.validTo),
        })
      : promo.endIsPresumed
        ? m.status.promoCurrentOpenEnd
        : format(m.status.promoCurrent, { to: shortCalendarDate(promo.validTo) })
    : null;
  const size = formatQuantity(option.quantity);
  // Montant réellement payé : nombre de paquets × prix du paquet ; le prix au kilo sert seulement à comparer.
  const packLine =
    option.packPriceCents != null && !promo
      ? format(m.status.packs, { packs: String(option.packs), size, price: money(option.packPriceCents) })
      : format(m.status.packsPromo, { packs: String(option.packs), size });
  // Quantité demandée, quantité réellement achetée (paquets entiers) et éventuel surplus, toujours affichés.
  const gap = option.requestedQuantity && option.purchasedQuantity ? quantityGap(option.requestedQuantity, option.purchasedQuantity) : null;
  const requested = option.requestedQuantity && option.purchasedQuantity
    ? [
        format(m.status.requested, { requested: formatQuantity(option.requestedQuantity), purchased: formatQuantity(option.purchasedQuantity) }),
        gap?.surplus ? format(m.status.surplus, { qty: formatQuantity(gap.surplus) }) : null,
        gap?.shortfall ? format(m.status.shortfall, { qty: formatQuantity(gap.shortfall) }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
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
      {!compact && (
        <p className="text-xs text-muted">
          {packLine}
          {requested ? ` · ${requested}` : ''}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {promo && (
          <Pill tone="accent" title={promo.label ?? undefined}>
            {promo.mechanic}
          </Pill>
        )}
        {promoPhase && <span className="text-xs font-medium">{promoPhase}</span>}
        <StatusBadge option={option} locale={locale} />
        {!compact && reasons.length > 0 && <span className="text-xs text-muted">{reasons.join(' · ')}</span>}
      </div>
      {!compact && promo && (promo.conditions ?? []).length > 0 && (
        <p className="mt-0.5 text-xs text-muted">{format(m.status.conditions, { list: (promo.conditions ?? []).join(' · ') })}</p>
      )}
      {!compact && option.loyaltyOffer && (
        <p className="mt-0.5 text-xs text-muted" data-testid="loyalty-not-applied">
          {format(m.status.loyaltyNotApplied, {
            program: option.loyaltyOffer.program,
            price: money(option.loyaltyOffer.totalCents),
            qty: formatQuantity(option.loyaltyOffer.quantity),
            to: shortCalendarDate(option.loyaltyOffer.validTo),
          })}
        </p>
      )}
      {!compact && !option.isDemo && <SourceLine option={option} locale={locale} />}
    </div>
  );
}

/** Provenance d'un prix réel : source, niveau, date, lieu du relevé, licence et autres sources. */
export function SourceLine({ option, locale }: { option: LineOption; locale: Locale }) {
  const m = getMessages(locale);
  const date = shortDate(option.observedAt);
  const text =
    option.reliability === 'crowd'
      ? format(m.status.sourceCrowd, { date, place: option.observedAtPlace ?? '—' })
      : option.reliability === 'survey'
        ? format(m.status.sourceSurvey, { date, place: option.observedAtPlace ?? '—' })
        : option.reliability === 'third_party'
          ? format(m.status.sourceThirdParty, { date, provider: option.sourceProvider })
          : format(m.status.sourceOfficial, { date });
  const alternatives = (option.alternatives ?? []).filter((a) => a.connectorId !== option.divergence?.other.connectorId);
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted">
      <p>
        {text}
        {option.reliability === 'crowd' && ` · ${m.status.sourceCrowdLicense}`}
        {typeof option.confidence === 'number' && ` · ${format(m.status.confidence, { value: String(Math.round(option.confidence * 100)) })}`}
        {option.sourceUrl && (
          <>
            {' · '}
            <a href={option.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
              {m.status.sourceLink}
            </a>
          </>
        )}
      </p>
      {option.divergence && (
        <p className="text-warn">
          {format(m.status.divergence, {
            gap: String(Math.round(option.divergence.relativeGap * 100)),
            provider: option.divergence.other.provider,
            price: money(option.divergence.other.totalCents),
            date: shortDate(option.divergence.other.observedAt),
          })}
        </p>
      )}
      {alternatives.length > 0 && (
        <p>
          {format(m.status.alternatives, {
            list: alternatives.map((a) => `${a.provider} ${money(a.totalCents)} (${shortDate(a.observedAt)})`).join(' · '),
          })}
        </p>
      )}
    </div>
  );
}
