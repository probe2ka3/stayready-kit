import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './server/session';

/**
 * 1. Contrôle optimiste de l'accès à l'administration (lecture du cookie seulement) ;
 *    le contrôle définitif est refait dans chaque page et action (requireAdmin).
 * 2. Verrou de lancement : avec PUBLIC_ACCESS=waitlist, seules la page d'attente, les
 *    pages légales et d'information sont publiques. L'application reste accessible en
 *    prévisualisation avec ?acces=<PREVIEW_TOKEN> (cookie HttpOnly, 30 jours).
 */
const PREVIEW_COOKIE = 'tesprix_preview';

const OPEN_WHEN_WAITLIST = [
  /^\/fr\/(bientot|mentions-legales|confidentialite|conditions|sources|methode|a-propos)\/?$/,
  /^\/api\/v1\/(health|waitlist)$/,
  // API professionnelle : authentification propre par clé (fermée si aucune clé n'est configurée).
  /^\/api\/b2b\/v1\/[a-z-]+$/,
];

function digest(value: string): Buffer {
  return createHash('sha256').update(`tesprix-preview:${value}`).digest();
}

function previewToken(): string | null {
  const t = process.env.PREVIEW_TOKEN ?? '';
  return t.length >= 16 ? t : null;
}

function hasPreview(req: NextRequest): boolean {
  const token = previewToken();
  const cookie = req.cookies.get(PREVIEW_COOKIE)?.value;
  if (!token || !cookie || !/^[0-9a-f]{64}$/.test(cookie)) return false;
  return timingSafeEqual(Buffer.from(cookie, 'hex'), digest(token));
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (path === '/admin' || path.startsWith('/admin/')) {
    if (path === '/admin/login') return NextResponse.next();
    const session = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (!session) return NextResponse.redirect(new URL('/admin/login', req.nextUrl));
    return NextResponse.next();
  }

  if (process.env.PUBLIC_ACCESS !== 'waitlist') return NextResponse.next();

  // Activation de la prévisualisation par lien (jeton comparé à temps constant).
  const offered = req.nextUrl.searchParams.get('acces');
  const token = previewToken();
  if (offered && token && timingSafeEqual(digest(offered), digest(token))) {
    const clean = new URL(req.nextUrl);
    clean.searchParams.delete('acces');
    const res = NextResponse.redirect(clean);
    res.cookies.set(PREVIEW_COOKIE, digest(token).toString('hex'), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 86400,
    });
    return res;
  }
  if (OPEN_WHEN_WAITLIST.some((r) => r.test(path)) || hasPreview(req)) return NextResponse.next();
  if (path.startsWith('/api/')) {
    return NextResponse.json({ error: { code: 'not_open', message: 'Service en préparation' } }, { status: 403 });
  }
  return NextResponse.redirect(new URL('/fr/bientot', req.nextUrl));
}

export const config = {
  // Tout sauf les ressources statiques (le verrou ne s'applique qu'aux pages et à l'API).
  matcher: ['/((?!_next/|icon|apple-icon|manifest|robots\\.txt|sitemap\\.xml|sw\\.js|favicon).*)'],
};
