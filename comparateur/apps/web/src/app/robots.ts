import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

// Généré à la demande : utilise SITE_URL de l'environnement d'exécution.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/fr/liste'] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
