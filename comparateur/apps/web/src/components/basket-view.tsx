'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CATEGORIES } from '@cabas/reference';
import { getMessages, paths, plural, type Locale } from '@/i18n';
import { searchProducts, type ProductDto } from '@/lib/api';
import { useApp, useHydrated, type ProductInfo } from '@/lib/store';
import { IconPlus, IconSearch, IconStar, IconTrash } from './icons';
import { Button, Card, cx, PageTitle, Pill, Stepper, Toggle } from './ui';

const toInfo = (p: ProductDto): ProductInfo => ({
  name: p.name,
  quantity: p.quantity,
  icon: p.icon,
  organic: p.organic,
  swiss: p.swiss,
  brand: p.brand,
});

function Badges({ p, m }: { p: Pick<ProductDto, 'organic' | 'swiss' | 'brand'> & { labels?: string[] }; m: ReturnType<typeof getMessages> }) {
  return (
    <span className="flex flex-wrap gap-1">
      {p.organic && <Pill tone="primary">{m.basket.organic}</Pill>}
      {p.swiss && <Pill tone="info">{m.basket.swiss}</Pill>}
      {p.labels?.includes('aop') && <Pill tone="neutral">AOP</Pill>}
      {p.labels?.includes('vegan') && <Pill tone="neutral">Vegan</Pill>}
      {p.labels?.includes('lactose-free') && <Pill tone="neutral">Sans lactose</Pill>}
      {p.brand && <Pill tone="warn" title={m.basket.brandRequired}>{p.brand}</Pill>}
    </span>
  );
}

function ProductRow({ p, locale }: { p: ProductDto; locale: Locale }) {
  const m = getMessages(locale);
  const line = useApp((s) => s.basket.find((b) => b.productId === p.id));
  const favorite = useApp((s) => s.favorites.includes(p.id));
  const { addProduct, setQty, toggleFavorite } = useApp();
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-xl">
        {p.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">{p.name}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
          {p.quantity}
          <Badges p={p} m={m} />
        </p>
      </div>
      <button
        type="button"
        onClick={() => toggleFavorite(p.id, toInfo(p))}
        aria-pressed={favorite}
        aria-label={favorite ? m.basket.removeFavorite : m.basket.addFavorite}
        className={cx('grid h-10 w-10 place-items-center rounded-lg', favorite ? 'text-warn' : 'text-muted hover:text-text')}
      >
        <IconStar filled={favorite} />
      </button>
      {line ? (
        <Stepper
          value={line.qty}
          onChange={(n) => setQty(p.id, n)}
          label={`${m.basket.quantity} — ${p.name}`}
          labelDecrease={m.basket.decrease}
          labelIncrease={m.basket.increase}
        />
      ) : (
        <Button onClick={() => addProduct(p.id, toInfo(p))} aria-label={`${m.basket.add} ${p.name}`} className="min-w-[6.5rem]">
          <IconPlus />
          {m.basket.add}
        </Button>
      )}
    </li>
  );
}

export function BasketView({ locale }: { locale: Locale }) {
  const m = getMessages(locale);
  const hydrated = useHydrated();
  const { basket, products, favorites, prefs, location } = useApp();
  const { setQty, removeProduct, setLinePrefs, setPrefs, clearBasket, forgetEverything } = useApp();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [results, setResults] = useState<ProductDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [favProducts, setFavProducts] = useState<ProductDto[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q && !category) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(
      () => {
        searchProducts(q ? { q } : { category: category as string }, ctrl.signal)
          .then((r) => setResults(r.products))
          .catch(() => {})
          .finally(() => setLoading(false));
      },
      q ? 150 : 0,
    );
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, category]);

  useEffect(() => {
    if (!hydrated || favorites.length === 0) {
      setFavProducts([]);
      return;
    }
    const ctrl = new AbortController();
    searchProducts({ ids: favorites }, ctrl.signal)
      .then((r) => setFavProducts(r.products))
      .catch(() => {});
    return () => ctrl.abort();
  }, [hydrated, favorites]);

  const count = basket.reduce((a, b) => a + b.qty, 0);

  return (
    <div className="space-y-5">
      <PageTitle sub={m.basket.saved}>{m.basket.title}</PageTitle>

      <section aria-label={m.basket.search} className="space-y-3">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <label htmlFor="product-search" className="sr-only">
            {m.basket.search}
          </label>
          <input
            id="product-search"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder={m.basket.searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value) setCategory(null);
            }}
            className="h-13 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-base shadow-sm outline-none placeholder:text-muted focus:border-primary"
          />
        </div>
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label={m.basket.categories}>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => {
                setQuery('');
                setCategory(category === c.id ? null : c.id);
              }}
              className={cx(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-medium',
                category === c.id ? 'border-primary bg-primary-soft text-primary-strong' : 'border-border bg-surface text-text',
              )}
            >
              <span aria-hidden>{c.icon}</span>
              {c.name}
            </button>
          ))}
        </div>
        {(query.trim() || category) && (
          <Card className="py-1">
            {loading && results.length === 0 ? (
              <p className="py-3 text-muted">{m.common.loading}</p>
            ) : results.length === 0 ? (
              <p className="py-3 text-muted">{m.basket.noResults}</p>
            ) : (
              <ul className="divide-y divide-border">
                {results.map((p) => (
                  <ProductRow key={p.id} p={p} locale={locale} />
                ))}
              </ul>
            )}
          </Card>
        )}
      </section>

      {hydrated && favProducts.length > 0 && !query && !category && (
        <section aria-labelledby="favs">
          <h2 id="favs" className="mb-2 text-lg font-bold">
            {m.basket.favorites}
          </h2>
          <Card className="py-1">
            <ul className="divide-y divide-border">
              {favProducts.map((p) => (
                <ProductRow key={p.id} p={p} locale={locale} />
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section aria-labelledby="basket-list">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="basket-list" className="text-lg font-bold">
            {m.basket.title} {hydrated && count > 0 && <span className="text-muted">· {plural(m.basket.items, count)}</span>}
          </h2>
          {hydrated && basket.length > 0 && (
            <button
              type="button"
              className="text-sm font-medium text-danger underline-offset-2 hover:underline"
              onClick={() => {
                if (window.confirm(m.basket.clearConfirm)) clearBasket();
              }}
            >
              {m.basket.clear}
            </button>
          )}
        </div>
        {!hydrated ? null : basket.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-4 text-muted">
            {m.basket.empty}{' '}
            <Link href={paths.examples(locale)} className="font-semibold text-primary underline-offset-2 hover:underline">
              {m.examples.link}
            </Link>
          </p>
        ) : (
          <Card className="py-1">
            <ul className="divide-y divide-border">
              {basket.map((b) => {
                const info = products[b.productId];
                return (
                  <li key={b.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-xl">
                        {info?.icon ?? '🛒'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug">{info?.name ?? b.productId}</p>
                        <p className="text-sm text-muted">{info?.quantity}</p>
                      </div>
                      <Stepper
                        value={b.qty}
                        onChange={(n) => setQty(b.productId, n)}
                        label={`${m.basket.quantity} — ${info?.name ?? ''}`}
                        labelDecrease={m.basket.decrease}
                        labelIncrease={m.basket.increase}
                      />
                      <button
                        type="button"
                        onClick={() => removeProduct(b.productId)}
                        aria-label={`${m.basket.remove} ${info?.name ?? ''}`}
                        className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger"
                      >
                        <IconTrash />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 pl-14">
                      {!info?.organic && (
                        <button
                          type="button"
                          aria-pressed={Boolean(b.prefs?.organic)}
                          onClick={() => setLinePrefs(b.productId, { organic: !b.prefs?.organic })}
                          className={cx('rounded-full border px-2.5 py-1 text-xs font-semibold', b.prefs?.organic ? 'border-primary bg-primary-soft text-primary-strong' : 'border-border text-muted')}
                        >
                          {m.basket.lineOrganic}
                        </button>
                      )}
                      {!info?.swiss && (
                        <button
                          type="button"
                          aria-pressed={Boolean(b.prefs?.swissOrigin)}
                          onClick={() => setLinePrefs(b.productId, { swissOrigin: !b.prefs?.swissOrigin })}
                          className={cx('rounded-full border px-2.5 py-1 text-xs font-semibold', b.prefs?.swissOrigin ? 'border-info bg-info-soft text-info' : 'border-border text-muted')}
                        >
                          {m.basket.lineSwiss}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      {hydrated && (
        <section aria-labelledby="prefs">
          <h2 id="prefs" className="mb-1 text-lg font-bold">
            {m.basket.prefsTitle}
          </h2>
          <Card className="divide-y divide-border py-1">
            <Toggle checked={prefs.organicOnly} onChange={(v) => setPrefs({ organicOnly: v })} label={m.basket.organicOnly} />
            <Toggle checked={prefs.swissOnly} onChange={(v) => setPrefs({ swissOnly: v })} label={m.basket.swissOnly} />
          </Card>
          <p className="mt-3 text-sm text-muted">
            {m.basket.forgetHint}{' '}
            <button
              type="button"
              className="font-medium text-danger underline underline-offset-2"
              onClick={() => {
                if (window.confirm(m.basket.forgetConfirm)) forgetEverything();
              }}
            >
              {m.basket.forget}
            </button>
          </p>
        </section>
      )}

      {hydrated && basket.length > 0 && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 md:bottom-4">
          <Link
            href={location ? paths.compare(locale) : paths.stores(locale)}
            className="flex min-h-13 items-center justify-center rounded-2xl bg-primary px-4 text-base font-bold text-on-primary shadow-lg hover:bg-primary-strong"
          >
            {m.basket.compare} · {plural(m.basket.items, count)}
          </Link>
        </div>
      )}
    </div>
  );
}
