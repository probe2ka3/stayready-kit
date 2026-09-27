import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import '../../globals.css';
import { BottomNav, DemoBanner, Footer, Header } from '@/components/shell';
import { ServiceWorker } from '@/components/shell-client';
import { getMessages, isLocale, LOCALES, type Locale } from '@/i18n';
import { siteUrl } from '@/lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const m = getMessages(isLocale(locale) ? locale : 'fr');
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${m.app.name} — ${m.home.title}`, template: `%s · ${m.app.name}` },
    description: m.home.lead,
    applicationName: m.app.name,
    formatDetection: { telephone: false },
    openGraph: { type: 'website', siteName: m.app.name, locale: 'fr_CH' },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#1d7a4b' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1310' },
  ],
};

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale as Locale);
  return (
    <html lang={locale === 'fr' ? 'fr-CH' : locale}>
      <body className="min-h-dvh">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
        >
          {m.nav.skip}
        </a>
        <Header locale={locale} />
        <DemoBanner locale={locale} />
        <main id="contenu" className="pb-nav mx-auto max-w-5xl px-4 pt-5">
          {children}
        </main>
        <Footer locale={locale} />
        <BottomNav locale={locale} />
        <ServiceWorker />
      </body>
    </html>
  );
}
