import type { Metadata } from 'next';
import { StoresView } from '@/components/stores-view';
import { getMessages, isLocale, type Locale } from '@/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const m = getMessages(isLocale(locale) ? locale : 'fr');
  return {
    title: m.stores.title,
    description: 'Trouvez les succursales Migros, Coop, Denner, Aldi, Lidl, OTTO’S, Action et Aligro autour de votre code postal.',
    alternates: { canonical: `/${locale}/magasins` },
  };
}

export default async function StoresPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <StoresView locale={(isLocale(locale) ? locale : 'fr') as Locale} />;
}
