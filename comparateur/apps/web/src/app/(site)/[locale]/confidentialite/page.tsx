import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PrivacyFr } from '@/content/fr/legal';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Confidentialité',
    description: 'Données traitées par le comparateur : minimum nécessaire, sans compte, sans traceur.',
    alternates: { canonical: `/${locale}/confidentialite` },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  return <PrivacyFr />;
}
