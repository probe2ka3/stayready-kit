import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SourcesFr } from '@/content/fr/sources';
import { getAppData } from '@/server/data';

// Données à jour à chaque visite (état des imports).
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Sources des données',
    description: 'Origine des prix, promotions et succursales, dates de vérification, calendriers promotionnels et attributions.',
    alternates: { canonical: `/${locale}/sources` },
  };
}

export default async function SourcesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  const data = getAppData();
  const now = new Date();
  const [status, realPrices] = await Promise.all([data.chainStatus(now), data.hasRealPrices(now)]);
  return <SourcesFr status={status} backend={data.mode} realPrices={realPrices} />;
}
