import type { Store } from '@cabas/core';
import { chainConnectors } from './chains';
import { DemoPriceConnector } from './demo';
import { LidlWebConnector } from './lidl';
import { OpenPricesConnector, type OpContext } from './open-prices';
import type { PriceConnector } from './types';

export interface ConnectorDeps {
  /** Succursales connues : lieu et zone des relevés communautaires. */
  stores?: Store[];
  resolveZone?: OpContext['resolveZone'];
}

/**
 * Registre des connecteurs de prix :
 * - démonstration (données fictives, jamais mélangées aux données réelles) ;
 * - sources réelles en ligne : Lidl (site officiel), Open Prices (ODbL) ;
 * - un connecteur d'enseigne par entrée de `@cabas/reference` (CHAINS) pour les imports
 *   structurés et, lorsqu'un accord existe, un flux officiel.
 */
export function priceConnectors(deps: ConnectorDeps = {}): PriceConnector[] {
  return [
    new DemoPriceConnector(),
    new LidlWebConnector(),
    new OpenPricesConnector(deps.stores ?? [], deps.resolveZone),
    ...chainConnectors(),
  ];
}

/** Connecteurs qui collectent des prix réels en ligne (tâche `collect`). */
export const LIVE_CONNECTOR_IDS = ['lidl-web', 'open-prices'];

export function findConnector(id: string, deps: ConnectorDeps = {}): PriceConnector | undefined {
  return priceConnectors(deps).find((c) => c.id === id);
}
