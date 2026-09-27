import { chainConnectors } from './chains';
import { DemoPriceConnector } from './demo';
import type { PriceConnector } from './types';

/**
 * Registre des connecteurs de prix. Ajouter une enseigne = ajouter une entrée dans
 * `@cabas/reference` (CHAINS) : son connecteur est créé automatiquement. Un flux
 * officiel peut ensuite être branché sans toucher au reste du système.
 */
export function priceConnectors(): PriceConnector[] {
  return [new DemoPriceConnector(), ...chainConnectors()];
}

export function findConnector(id: string): PriceConnector | undefined {
  return priceConnectors().find((c) => c.id === id);
}
