'use client';

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_COST_PER_KM, DEFAULT_TRAVEL, type CompareResultDto, type ScenarioKind, type TravelSettings } from '@cabas/core';

/**
 * État de l'application conservé **uniquement dans le navigateur** (localStorage).
 * Aucun compte, aucune synchronisation serveur : conforme au principe de
 * minimisation (LPD art. 6-7). L'utilisateur peut tout effacer depuis le panier.
 */

export interface SavedLocation {
  label: string;
  lat: number;
  lon: number;
  zip?: string;
  /** Position précise du navigateur (géolocalisation) plutôt que le centre de la localité. */
  precise: boolean;
}

export interface BasketItem {
  id: string;
  productId: string;
  qty: number;
  prefs?: { organic?: boolean; swissOrigin?: boolean };
}

export interface ProductInfo {
  name: string;
  quantity: string;
  icon: string;
  organic: boolean;
  swiss: boolean;
  brand: string | null;
}

export type When = { mode: 'now' } | { mode: 'plan'; date: string; time: string | null };

export interface Prefs {
  organicOnly: boolean;
  swissOnly: boolean;
  loyaltyPrograms: string[];
  allowSimilarPacks: boolean;
  includeStalePrices: boolean;
}

export interface SavedList {
  result: CompareResultDto;
  scenario: ScenarioKind;
  savedAt: string;
}

interface State {
  location: SavedLocation | null;
  radiusKm: 5 | 10 | 20 | 30;
  /** Enseignes désélectionnées (par défaut, toutes les enseignes présentes sont incluses). */
  excludedChains: string[];
  excludedStores: string[];
  basket: BasketItem[];
  products: Record<string, ProductInfo>;
  favorites: string[];
  prefs: Prefs;
  when: When;
  maxStores: number | null;
  travel: TravelSettings;
  minSavingChf: number;
  referenceChainId: string | null;
  lastResult: CompareResultDto | null;
  savedList: SavedList | null;
  checked: Record<string, boolean>;

  setLocation(l: SavedLocation | null): void;
  setRadius(r: 5 | 10 | 20 | 30): void;
  toggleChain(chainId: string): void;
  toggleStore(storeId: string): void;
  addProduct(productId: string, info: ProductInfo): void;
  setQty(productId: string, qty: number): void;
  removeProduct(productId: string): void;
  setLinePrefs(productId: string, prefs: BasketItem['prefs']): void;
  clearBasket(): void;
  toggleFavorite(productId: string, info?: ProductInfo): void;
  setPrefs(p: Partial<Prefs>): void;
  setWhen(w: When): void;
  setMaxStores(n: number | null): void;
  setTravel(t: Partial<TravelSettings>): void;
  setMinSaving(chf: number): void;
  setReferenceChain(id: string | null): void;
  setLastResult(r: CompareResultDto | null): void;
  saveList(scenario: ScenarioKind): void;
  toggleChecked(key: string): void;
  resetChecked(): void;
  forgetEverything(): void;
}

const initial = {
  location: null,
  radiusKm: 10 as const,
  excludedChains: [],
  excludedStores: [],
  basket: [],
  products: {},
  favorites: [],
  prefs: { organicOnly: false, swissOnly: false, loyaltyPrograms: [], allowSimilarPacks: true, includeStalePrices: false },
  when: { mode: 'now' } as When,
  maxStores: 2,
  travel: DEFAULT_TRAVEL,
  minSavingChf: 2,
  referenceChainId: null,
  lastResult: null,
  savedList: null,
  checked: {},
};

let seq = 0;
const lineId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export const useApp = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      setLocation: (location) => set({ location, lastResult: null }),
      setRadius: (radiusKm) => set({ radiusKm, lastResult: null }),
      toggleChain: (chainId) =>
        set((s) => ({
          excludedChains: s.excludedChains.includes(chainId)
            ? s.excludedChains.filter((c) => c !== chainId)
            : [...s.excludedChains, chainId],
          lastResult: null,
        })),
      toggleStore: (storeId) =>
        set((s) => ({
          excludedStores: s.excludedStores.includes(storeId)
            ? s.excludedStores.filter((c) => c !== storeId)
            : [...s.excludedStores, storeId],
          lastResult: null,
        })),
      addProduct: (productId, info) =>
        set((s) => {
          const existing = s.basket.find((b) => b.productId === productId);
          const basket = existing
            ? s.basket.map((b) => (b.productId === productId ? { ...b, qty: Math.min(99, b.qty + 1) } : b))
            : [...s.basket, { id: lineId(), productId, qty: 1 }];
          return { basket, products: { ...s.products, [productId]: info }, lastResult: null };
        }),
      setQty: (productId, qty) =>
        set((s) => ({
          basket:
            qty <= 0
              ? s.basket.filter((b) => b.productId !== productId)
              : s.basket.map((b) => (b.productId === productId ? { ...b, qty: Math.min(99, qty) } : b)),
          lastResult: null,
        })),
      removeProduct: (productId) =>
        set((s) => ({ basket: s.basket.filter((b) => b.productId !== productId), lastResult: null })),
      setLinePrefs: (productId, prefs) =>
        set((s) => ({
          basket: s.basket.map((b) => (b.productId === productId ? { ...b, prefs: { ...b.prefs, ...prefs } } : b)),
          lastResult: null,
        })),
      clearBasket: () => set({ basket: [], lastResult: null }),
      toggleFavorite: (productId, info) =>
        set((s) => ({
          favorites: s.favorites.includes(productId)
            ? s.favorites.filter((f) => f !== productId)
            : [...s.favorites, productId],
          products: info ? { ...s.products, [productId]: info } : s.products,
        })),
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p }, lastResult: null })),
      setWhen: (when) => set({ when, lastResult: null }),
      setMaxStores: (maxStores) => set({ maxStores, lastResult: null }),
      setTravel: (t) =>
        set((s) => {
          const next = { ...s.travel, ...t };
          // Changer de mode de transport réinitialise le coût kilométrique par défaut du mode.
          if (t.mode && t.mode !== s.travel.mode && t.costPerKmChf === undefined) {
            next.costPerKmChf = DEFAULT_COST_PER_KM[t.mode];
          }
          return { travel: next, lastResult: null };
        }),
      setMinSaving: (minSavingChf) => set({ minSavingChf, lastResult: null }),
      setReferenceChain: (referenceChainId) => set({ referenceChainId, lastResult: null }),
      setLastResult: (lastResult) => set({ lastResult }),
      saveList: (scenario) => {
        const result = get().lastResult;
        if (!result) return;
        set({ savedList: { result, scenario, savedAt: new Date().toISOString() }, checked: {} });
      },
      toggleChecked: (key) => set((s) => ({ checked: { ...s.checked, [key]: !s.checked[key] } })),
      resetChecked: () => set({ checked: {} }),
      forgetEverything: () => set({ ...initial }),
    }),
    {
      name: 'cabas-v1',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Le dernier résultat n'est pas conservé (il peut devenir obsolète) ; la liste choisie l'est.
      partialize: (s) => {
        const { lastResult: _r, ...rest } = s;
        return rest;
      },
    },
  ),
);

/**
 * Évite les écarts d'hydratation : le rendu serveur ne connaît pas l'état local,
 * les composants qui en dépendent attendent le montage côté navigateur.
 */
export function useHydrated(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (useApp.persist.hasHydrated()) setReady(true);
    return useApp.persist.onFinishHydration(() => setReady(true));
  }, []);
  return ready;
}
