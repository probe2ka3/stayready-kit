import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReceiptView } from '@/components/receipt-view';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Scanner mon ticket',
    description: 'Contribuer aux prix en magasin à partir d’un ticket de caisse, sans données personnelles.',
    alternates: { canonical: `/${locale}/ticket` },
    robots: { index: false },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  return <ReceiptView submitEnabled={process.env.RECEIPTS_ENABLED === 'true'} />;
}
