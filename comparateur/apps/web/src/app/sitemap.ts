import type { MetadataRoute } from 'next';
import { LOCALES, paths } from '@/i18n';
import { siteUrl } from '@/lib/site';

// Généré à la demande : utilise SITE_URL de l'environnement d'exécution.
export const dynamic = 'force-dynamic';

/**
 * Plan du site : uniquement des pages d'information stables. Aucune page n'est
 * générée à partir de prix (non vérifiés en mode démonstration).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const pages: Array<[(l: (typeof LOCALES)[number]) => string, number]> = [
    [paths.home, 1],
    [paths.stores, 0.8],
    [paths.basket, 0.8],
    [paths.compare, 0.8],
    [paths.method, 0.6],
    [paths.sources, 0.5],
    [paths.about, 0.4],
    [paths.privacy, 0.2],
    [paths.imprint, 0.2],
  ];
  return LOCALES.flatMap((l) =>
    pages.map(([p, priority]) => ({
      url: `${base}${p(l)}`,
      changeFrequency: 'weekly' as const,
      priority,
      alternates: { languages: Object.fromEntries(LOCALES.map((x) => [x === 'fr' ? 'fr-CH' : x, `${base}${p(x)}`])) },
    })),
  );
}
