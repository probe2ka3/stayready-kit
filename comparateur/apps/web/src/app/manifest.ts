import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cabas — comparateur de courses',
    short_name: 'Cabas',
    description: 'Comparez le coût de vos courses en Suisse, trajet compris.',
    start_url: '/fr',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f5f6f2',
    theme_color: '#1d7a4b',
    lang: 'fr-CH',
    categories: ['shopping', 'food', 'utilities'],
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
