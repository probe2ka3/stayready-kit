import { NextResponse } from 'next/server';
import { search } from '@cabas/core';
import { getAppData } from '@/server/data';
import { jsonError, limitOr429 } from '@/server/http';
import { errorInfo, log } from '@/server/log';
import { toProductDto } from '@/server/products';
import { issues, productsQuery } from '@/server/validation';

/**
 * GET /api/v1/products?q=farine | ?category=oeufs | ?ids=a,b
 * Recherche dans le catalogue normalisé (sans prix : les prix dépendent du lieu).
 */
export async function GET(req: Request) {
  const limited = limitOr429(req, 'search');
  if (limited) return limited;
  const parsed = productsQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return jsonError(400, 'invalid_query', 'Requête invalide', { issues: issues(parsed.error) });
  const { q, category, ids, limit } = parsed.data;
  try {
    const data = getAppData();
    const [products, categories] = await Promise.all([data.products(), data.categories()]);
    const catName = new Map(categories.map((c) => [c.id, c.name]));
    let list = products;
    if (ids) {
      const wanted = new Set(ids.split(',').slice(0, 200));
      list = list.filter((p) => wanted.has(p.id));
    }
    if (category) list = list.filter((p) => p.categoryId === category);
    if (q) {
      list = search(
        q,
        list.map((p) => ({ ...p, extra: `${(p.keywords ?? []).join(' ')} ${catName.get(p.categoryId) ?? ''}` })),
        limit,
      );
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr')).slice(0, limit);
    }
    const iconOf = new Map(categories.map((c) => [c.id, c.icon]));
    return NextResponse.json({ products: list.map((p) => toProductDto(p, iconOf.get(p.categoryId) ?? '🛒')) });
  } catch (e) {
    log('error', 'products_failed', errorInfo(e));
    return jsonError(500, 'server_error', 'Erreur interne');
  }
}
