'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { IconMinus, IconPlus } from './icons';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'min-h-9 px-3 text-sm',
        size === 'md' && 'min-h-11 px-4 text-[15px]',
        size === 'lg' && 'min-h-13 px-5 text-base',
        variant === 'primary' && 'bg-primary text-on-primary hover:bg-primary-strong',
        variant === 'secondary' && 'border border-border bg-surface text-text hover:bg-surface-2',
        variant === 'ghost' && 'text-muted hover:bg-surface-2 hover:text-text',
        variant === 'danger' && 'border border-danger/40 bg-danger-soft text-danger hover:bg-danger-soft/70',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, as: As = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' | 'li' }) {
  return <As className={cx('rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]', className)}>{children}</As>;
}

export function ChainBadge({ badge, name, size = 'md' }: { badge: string; name: string; size?: 'sm' | 'md' }) {
  // Pastille neutre : aucun logo ni couleur de marque des enseignes (LPM/LDA).
  return (
    <span
      title={name}
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 font-bold tracking-tight text-text',
        size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs',
      )}
    >
      {badge}
    </span>
  );
}

export function Stepper({
  value,
  onChange,
  labelDecrease,
  labelIncrease,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  labelDecrease: string;
  labelIncrease: string;
  label: string;
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-border bg-surface" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} className="grid h-11 w-11 place-items-center rounded-l-xl text-text hover:bg-surface-2" aria-label={labelDecrease}>
        <IconMinus />
      </button>
      <output className="num min-w-8 text-center font-semibold" aria-live="polite">
        {value}
      </output>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= 99} className="grid h-11 w-11 place-items-center rounded-r-xl text-text hover:bg-surface-2 disabled:opacity-40" aria-label={labelIncrease}>
        <IconPlus />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-border bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-10 flex-1 rounded-lg px-2 text-sm font-semibold transition-colors',
              active ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]" />
        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function Pill({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'primary' | 'accent' | 'warn' | 'danger' | 'info' | 'demo'; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold',
        tone === 'neutral' && 'bg-surface-2 text-muted',
        tone === 'primary' && 'bg-primary-soft text-primary-strong',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'info' && 'bg-info-soft text-info',
        tone === 'demo' && 'bg-demo-soft text-demo',
      )}
    >
      {children}
    </span>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-muted">{sub}</p>}
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'demo'; children: ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'rounded-xl px-3 py-2 text-sm',
        tone === 'info' && 'bg-info-soft text-info',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'demo' && 'bg-demo-soft text-demo',
      )}
    >
      {children}
    </div>
  );
}
