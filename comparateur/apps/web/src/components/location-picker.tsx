'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { isInSwitzerlandBBox } from '@cabas/core';
import { getMessages, type Locale } from '@/i18n';
import { searchLocalities, type LocalityDto } from '@/lib/api';
import { useApp, type SavedLocation } from '@/lib/store';
import { IconLocate, IconPin, IconSearch } from './icons';
import { Button, cx } from './ui';

/**
 * Saisie du code postal ou de la localité (liste déroulante accessible, ARIA 1.2
 * « combobox »), avec géolocalisation facultative sur action explicite.
 */
export function LocationPicker({
  locale,
  onSelected,
  autoFocus,
  compact,
}: {
  locale: Locale;
  onSelected?: (l: SavedLocation) => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const m = getMessages(locale);
  const setLocation = useApp((s) => s.setLocation);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocalityDto[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [geoState, setGeoState] = useState<'idle' | 'pending' | 'error'>('idle');
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchLocalities(q, ctrl.signal)
        .then((r) => {
          setResults(r.localities);
          setActive(r.localities.length ? 0 : -1);
          setOpen(true);
        })
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const choose = (l: LocalityDto) => {
    const loc: SavedLocation = { label: l.label, lat: l.lat, lon: l.lon, zip: l.zip, precise: false };
    setLocation(loc);
    setQuery(l.label);
    setOpen(false);
    onSelected?.(loc);
  };

  const geolocate = () => {
    if (!('geolocation' in navigator)) {
      setGeoState('error');
      return;
    }
    setGeoState('pending');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: Math.round(pos.coords.latitude * 1e5) / 1e5, lon: Math.round(pos.coords.longitude * 1e5) / 1e5 };
        if (!isInSwitzerlandBBox(p)) {
          setGeoState('error');
          return;
        }
        const loc: SavedLocation = { label: m.location.precise, ...p, precise: true };
        setLocation(loc);
        setGeoState('idle');
        onSelected?.(loc);
      },
      () => setGeoState('error'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  return (
    <div className="space-y-2">
      <label htmlFor={`${listId}-input`} className={cx('block font-semibold', compact ? 'sr-only' : 'text-[15px]')}>
        {m.location.label}
      </label>
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="text"
          inputMode="search"
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          placeholder={m.location.placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && open && results[active]) {
              e.preventDefault();
              choose(results[active] as LocalityDto);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="h-13 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-base shadow-sm outline-none placeholder:text-muted focus:border-primary"
        />
        {open && query.trim().length >= 2 && (
          <ul
            id={`${listId}-list`}
            role="listbox"
            className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-border bg-surface py-1 shadow-lg"
          >
            {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">{m.location.noResult}</li>}
            {results.map((r, i) => (
              <li
                key={`${r.zip}-${r.name}`}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(r);
                }}
                className={cx('flex cursor-pointer items-center gap-2 px-3 py-2.5', i === active && 'bg-primary-soft')}
              >
                <IconPin className="h-4 w-4 text-muted" />
                <span className="num font-semibold">{r.zip}</span>
                <span>{r.name}</span>
                <span className="ml-auto text-xs text-muted">{r.canton}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="ghost" size="sm" onClick={geolocate} disabled={geoState === 'pending'} className="-ml-2">
          <IconLocate />
          {geoState === 'pending' ? m.location.geoPending : m.location.useGeo}
        </Button>
        <span className="text-xs text-muted">{m.location.geoPrivacy}</span>
      </div>
      {geoState === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {m.location.geoDenied}
        </p>
      )}
    </div>
  );
}
