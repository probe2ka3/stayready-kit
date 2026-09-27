import type { Metadata } from 'next';
import { ListView } from '@/components/list-view';
import { getMessages, isLocale, type Locale } from '@/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const m = getMessages(isLocale(locale) ? locale : 'fr');
  // Page personnelle (contenu propre au navigateur) : non indexée.
  return { title: m.list.title, robots: { index: false, follow: true } };
}

export default async function ListPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ListView locale={(isLocale(locale) ? locale : 'fr') as Locale} />;
}
