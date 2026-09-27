import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MethodFr } from '@/content/fr/methode';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Méthode de comparaison',
    description: 'Comment le comparateur choisit les magasins, calcule le coût du trajet et les économies, et gère les promotions.',
    alternates: { canonical: `/${locale}/methode` },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  return <MethodFr />;
}
