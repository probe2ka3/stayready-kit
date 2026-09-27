import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './server/session';

/**
 * Contrôle optimiste de l'accès à l'administration (lecture du cookie seulement).
 * Le contrôle définitif est refait dans chaque page et action (requireAdmin).
 */
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === '/admin/login') return NextResponse.next();
  const session = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.redirect(new URL('/admin/login', req.nextUrl));
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
