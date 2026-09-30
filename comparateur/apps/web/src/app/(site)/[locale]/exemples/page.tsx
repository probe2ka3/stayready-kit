import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CATEGORIES, PRODUCTS } from '@cabas/reference';
import { ExamplesView, type ExampleBasket } from '@/components/examples-view';
import { serverEnv } from '@/server/env';
import { toProductDto } from '@/server/products';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Paniers d’exemple',
    description: 'Trois paniers réels à Lausanne, Bulle et Genève pour découvrir la comparaison.',
    alternates: { canonical: `/${locale}/exemples` },
    robots: { index: false },
  };
}

/** Paniers de démonstration (data/demo/baskets.json), chargés dans le navigateur en un clic. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  let baskets: ExampleBasket[] = [];
  try {
    const raw = JSON.parse(readFileSync(join(serverEnv.dataDir, 'demo', 'baskets.json'), 'utf8')) as { baskets: Array<Omit<ExampleBasket, 'products'>> };
    const iconOf = new Map(CATEGORIES.map((c) => [c.id, c.icon]));
    const byId = new Map(PRODUCTS.map((p) => [p.id, p]));
    baskets = raw.baskets.map((b) => ({
      ...b,
      lines: b.lines.filter((l) => byId.has(l.productId)),
      products: Object.fromEntries(
        b.lines.flatMap((l) => {
          const p = byId.get(l.productId);
          if (!p) return [];
          const dto = toProductDto(p, iconOf.get(p.categoryId) ?? '🛒');
          return [[p.id, { name: dto.name, quantity: dto.quantity, icon: dto.icon, organic: dto.organic, swiss: dto.swiss, brand: dto.brand }]];
        }),
      ),
    }));
  } catch {
    baskets = [];
  }
  return <ExamplesView locale="fr" baskets={baskets} />;
}
