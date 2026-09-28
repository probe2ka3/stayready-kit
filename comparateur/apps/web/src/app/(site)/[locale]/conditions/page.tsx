import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TermsFr } from '@/content/fr/legal';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Conditions d’utilisation',
    description: 'Projet de conditions d’utilisation de TesPrix.',
    alternates: { canonical: `/${locale}/conditions` },
    robots: { index: false },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  return <TermsFr />;
}
