import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui';
import { WaitlistForm } from '@/components/waitlist-form';
import { paths } from '@/i18n';
import { getAppData } from '@/server/data';
import { serverEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Bientôt',
    description: 'TesPrix compare le coût de vos courses en Suisse, trajet compris. Ouverture prochaine.',
    alternates: { canonical: `/${locale}/bientot` },
  };
}

const CANTON_NAMES: Record<string, string> = {
  GE: 'Genève', VD: 'Vaud', NE: 'Neuchâtel', FR: 'Fribourg', VS: 'Valais', JU: 'Jura', BE: 'Berne', ZH: 'Zurich', TI: 'Tessin',
};

/** Page d'attente : présentation honnête du service et de l'état de ses données. */
export default async function WaitlistPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  const collections = await getAppData().collections();
  const prices = collections.reduce((a, c) => a + c.prices + c.promotions, 0);
  const pilot = serverEnv.pilotCantons.map((c) => CANTON_NAMES[c] ?? c).join(', ');
  return (
    <div className="space-y-6">
      <section className="space-y-3 pt-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Bientôt en Suisse romande</p>
        <h1 className="text-3xl font-extrabold leading-tight">
          Tes courses, au bon prix, <span className="text-primary">au bon endroit.</span>
        </h1>
        <p className="text-lg text-muted">
          TesPrix compare le coût réel de votre panier entre les enseignes proches de chez vous, trajet compris, et vous dit s’il vaut la peine
          de faire un détour ou d’attendre une promotion déjà annoncée.
        </p>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Le panier complet', 'Un magasin, le moins cher par article, ou le meilleur compromis prix + trajet + nombre d’arrêts.'],
          ['Des détours chiffrés', 'Chaque arrêt proposé indique l’économie sur les produits, les kilomètres en plus et le gain net.'],
          ['Des prix sourcés', 'Chaque prix affiche sa source et sa date. Jamais de prix inventé, jamais de promotion supposée.'],
        ].map(([t, b]) => (
          <Card key={t} className="space-y-1">
            <h2 className="font-bold">{t}</h2>
            <p className="text-sm text-muted">{b}</p>
          </Card>
        ))}
      </div>

      <Card className="space-y-2">
        <h2 className="text-lg font-bold">Où en sommes-nous ?</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>{prices.toLocaleString('fr-CH')} prix et promotions réels collectés à ce jour, avec leur source.</li>
          <li>Lidl : prix du site officiel, relus chaque jour. Migros, Coop, Denner, Aldi : relevés communautaires Open Prices, encore peu nombreux.</li>
          <li>Une couverture complète de Migros, Coop, Denner et Aldi nécessitera un accord avec ces enseignes.</li>
          <li>Zone pilote : {pilot}.</li>
        </ul>
        <p className="text-sm">
          <Link href={paths.sources(locale)} className="font-semibold underline">
            Voir les sources
          </Link>{' '}
          ·{' '}
          <Link href={paths.method(locale)} className="font-semibold underline">
            Comprendre la méthode
          </Link>
        </p>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Être prévenu·e de l’ouverture</h2>
        <WaitlistForm enabled={serverEnv.signupEnabled} />
      </Card>
    </div>
  );
}
