import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Politique de sécurité du contenu. Aucune ressource tierce n'est chargée
 * (polices système, pas d'analytics, pas de CDN) : tout est « self ».
 * 'unsafe-inline' est requis pour les scripts d'hydratation de Next.js sans nonce ;
 * voir docs/SECURITE.md pour le passage à une CSP à nonce.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Racine du monorepo : inclut les paquets de l'espace de travail dans la sortie autonome.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  agentRules: false,
  reactStrictMode: true,
  transpilePackages: ['@cabas/core', '@cabas/reference', '@cabas/connectors', '@cabas/db'],
  serverExternalPackages: ['postgres'],
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  async redirects() {
    return [{ source: '/', destination: '/fr', permanent: false }];
  },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/api/(.*)', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/admin/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

export default nextConfig;
