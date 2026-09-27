import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ImprintFr } from '@/content/fr/legal';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Mentions légales',
    description: 'Exploitant, indépendance, marques et sources des données.',
    alternates: { canonical: `/${locale}/mentions-legales` },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  return <ImprintFr />;
}
