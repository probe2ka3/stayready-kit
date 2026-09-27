'use client';

import type { CompareResultDto } from '@cabas/core';
import type { BasketItem, Prefs, SavedLocation, When } from './store';
import type { TravelSettings } from '@cabas/core';

export interface LocalityDto {
  label: string;
  zip: string;
  name: string;
  canton: string;
  lat: number;
  lon: number;
}

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

export interface StoresResponse {
  radiusKm: number;
  chains: Array<{ chainId: string; name: string; badge: string; count: number; nearestKm: number }>;
  absentChains: Array<{ chainId: string; name: string; badge: string }>;
  stores: Array<{
    id: string;
    chainId: string;
    name: string;
    address: string;
    crowKm: number;
    hoursToday: string | null;
    openNow: 'open' | 'closed' | 'unknown';
    accessNotes: string | null;
  }>;
  truncated: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => null)) as T & { error?: { code: string; message: string } };
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? 'error', body?.error?.message ?? res.statusText);
  return body;
}

export function searchLocalities(q: string, signal?: AbortSignal) {
  return request<{ localities: LocalityDto[] }>(`/api/v1/localities?q=${encodeURIComponent(q)}&limit=8`, { signal });
}

export function fetchStores(lat: number, lon: number, radius: number, signal?: AbortSignal) {
  return request<StoresResponse>(`/api/v1/stores?lat=${lat}&lon=${lon}&radius=${radius}`, { signal });
}

export function searchProducts(params: { q?: string; category?: string; ids?: string[] }, signal?: AbortSignal) {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.category) sp.set('category', params.category);
  if (params.ids) sp.set('ids', params.ids.join(','));
  sp.set('limit', params.ids ? '200' : '40');
  return request<{ products: ProductDto[] }>(`/api/v1/products?${sp.toString()}`, { signal });
}

export interface CompareParams {
  location: SavedLocation;
  radiusKm: number;
  excludedChains: string[];
  presentChains: string[] | null;
  excludedStores: string[];
  basket: BasketItem[];
  prefs: Prefs;
  when: When;
  maxStores: number | null;
  travel: TravelSettings;
  minSavingChf: number;
  referenceChainId: string | null;
}

export function compare(p: CompareParams, signal?: AbortSignal) {
  const chains = p.presentChains ? p.presentChains.filter((c) => !p.excludedChains.includes(c)) : undefined;
  return request<CompareResultDto>('/api/v1/compare', {
    method: 'POST',
    signal,
    body: JSON.stringify({
      origin: { lat: p.location.lat, lon: p.location.lon, label: p.location.label.slice(0, 100) },
      radiusKm: p.radiusKm,
      chains,
      excludedStores: p.excludedStores.slice(0, 500),
      lines: p.basket.map((b) => ({ id: b.id, productId: b.productId, qty: b.qty, prefs: b.prefs })),
      prefs: p.prefs,
      when: p.when.mode === 'now' ? { mode: 'now' } : { mode: 'plan', date: p.when.date, time: p.when.time || null },
      maxStores: p.maxStores,
      travel: p.travel,
      minSavingPerExtraStoreChf: p.minSavingChf,
      referenceChainId: p.referenceChainId,
    }),
  });
}
