import type { Metadata } from 'next';
import Link from 'next/link';
import { CHAINS } from '@cabas/reference';
import { HomeStart } from '@/components/home-start';
import { IconBasket, IconScale, IconStore } from '@/components/icons';
import { JsonLd } from '@/components/json-ld';
import { getMessages, isLocale, paths, type Locale } from '@/i18n';
import { siteUrl } from '@/lib/site';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: { canonical: `/${locale}`, languages: { 'fr-CH': '/fr', 'x-default': '/fr' } } };
}

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : 'fr';
  const m = getMessages(locale);
  const steps = [
    { Icon: IconStore, text: m.home.step1 },
    { Icon: IconBasket, text: m.home.step2 },
    { Icon: IconScale, text: m.home.step3 },
  ];
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: m.app.name,
          url: `${siteUrl()}/${locale}`,
          applicationCategory: 'ShoppingApplication',
          operatingSystem: 'Web',
          inLanguage: 'fr-CH',
          isAccessibleForFree: true,
          description: m.home.lead,
          areaServed: { '@type': 'Country', name: 'Suisse' },
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'CHF' },
        }}
      />
      <section className="grid items-start gap-6 py-2 md:grid-cols-[1.1fr_1fr] md:gap-10 md:py-8">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Suisse · {CHAINS.length} enseignes · sans compte
          </p>
          <h1 className="text-[1.9rem] font-extrabold leading-tight tracking-tight md:text-5xl">{m.home.title}</h1>
          <p className="text-lg text-muted">{m.home.lead}</p>
          <ul className="hidden space-y-2 text-[15px] md:block">
            {[m.home.trust1, m.home.trust2, m.home.trust3].map((t) => (
              <li key={t} className="flex gap-2">
                <span aria-hidden className="text-primary">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <HomeStart locale={locale} />
      </section>

      <section aria-labelledby="how" className="mt-10">
        <h2 id="how" className="mb-4 text-xl font-bold">
          {m.home.stepsTitle}
        </h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {steps.map(({ Icon, text }, i) => (
            <li key={text} className="flex gap-3 rounded-2xl border border-border bg-surface p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-strong">
                <Icon />
              </span>
              <p>
                <span className="mr-1 font-bold">{i + 1}.</span>
                {text}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="trust" className="mt-10 md:hidden">
        <h2 id="trust" className="mb-3 text-xl font-bold">
          {m.home.trustTitle}
        </h2>
        <ul className="space-y-2">
          {[m.home.trust1, m.home.trust2, m.home.trust3].map((t) => (
            <li key={t} className="flex gap-2">
              <span aria-hidden className="text-primary">✓</span>
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="chains" className="mt-10">
        <h2 id="chains" className="mb-3 text-xl font-bold">
          {m.home.chainsTitle}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {CHAINS.map((c) => (
            <li key={c.id} className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium">
              {c.name}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted">
          {m.app.independent}{' '}
          <Link href={paths.method(locale)} className="font-medium text-primary underline underline-offset-2">
            {m.nav.method}
          </Link>
        </p>
      </section>
    </>
  );
}
