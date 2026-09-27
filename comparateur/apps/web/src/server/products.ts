import { formatQuantity, type CanonicalProduct } from '@cabas/core';

export interface ProductDto {
  id: string;
  name: string;
  categoryId: string;
  quantity: string;
  icon: string;
  organic: boolean;
  swiss: boolean;
  labels: string[];
  brand: string | null;
}

export function toProductDto(p: CanonicalProduct, icon: string): ProductDto {
  return {
    id: p.id,
    name: p.name,
    categoryId: p.categoryId,
    quantity: formatQuantity(p.quantity),
    icon,
    organic: Boolean(p.attributes.organic),
    swiss: Boolean(p.attributes.swissOrigin),
    labels: p.attributes.labels ?? [],
    brand: p.brandRequired ?? null,
  };
}
