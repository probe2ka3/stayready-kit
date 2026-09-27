import type { Metadata } from 'next';
import { BasketView } from '@/components/basket-view';
import { getMessages, isLocale, type Locale } from '@/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const m = getMessages(isLocale(locale) ? locale : 'fr');
  return {
    title: m.basket.title,
    description: 'Constituez votre panier de courses : alimentation, entretien, hygiène. Aucun compte requis.',
    alternates: { canonical: `/${locale}/panier` },
  };
}

export default async function BasketPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <BasketView locale={(isLocale(locale) ? locale : 'fr') as Locale} />;
}
