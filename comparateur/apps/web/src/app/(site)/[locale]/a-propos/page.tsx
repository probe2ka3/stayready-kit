import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AboutFr } from '@/content/fr/legal';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'À propos',
    description: 'Un comparateur de courses indépendant pour la Suisse, sans affiliation avec les enseignes.',
    alternates: { canonical: `/${locale}/a-propos` },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  return <AboutFr />;
}
