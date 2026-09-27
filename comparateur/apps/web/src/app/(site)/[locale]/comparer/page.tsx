import type { Metadata } from 'next';
import { CompareView } from '@/components/compare-view';
import { getMessages, isLocale, type Locale } from '@/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const m = getMessages(isLocale(locale) ? locale : 'fr');
  return {
    title: m.compare.title,
    description: 'Comparez le coût de votre panier : un seul magasin, le prix le plus bas ou le coût global trajet compris.',
    alternates: { canonical: `/${locale}/comparer` },
  };
}

export default async function ComparePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <CompareView locale={(isLocale(locale) ? locale : 'fr') as Locale} />;
}
