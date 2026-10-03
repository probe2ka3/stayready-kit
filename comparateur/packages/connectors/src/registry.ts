import type { Store } from '@cabas/core';
import { AldiApiConnector } from './aldi';
import { chainConnectors } from './chains';
import { DemoPriceConnector } from './demo';
import { CoopEpaperConnector } from './coop-epaper';
import { DennerWebConnector } from './denner';
import { FoodAllyConnector } from './foodally';
import { LidlWebConnector } from './lidl';
import { OpenPricesConnector, type OpContext, type OpLocationReview } from './open-prices';
import type { PriceConnector } from './types';

export interface ConnectorDeps {
  /** Succursales connues : lieu et zone des relevés communautaires. */
  stores?: Store[];
  resolveZone?: OpContext['resolveZone'];
  /** Lieux Open Prices sans enseigne identifiable, attribués après revue (`data/matching/op-locations.json`). */
  opLocations?: OpLocationReview[];
}

/**
 * Registre des connecteurs de prix :
 * - démonstration (données fictives, jamais mélangées aux données réelles) ;
 * - sources réelles en ligne : Lidl (site officiel), Aldi Suisse (API publique du site),
 *   Denner (site officiel, usage privé), Open Prices (ODbL), FoodAlly (fournisseur tiers, comparaison uniquement, désactivé par défaut) ;
 * - un connecteur d'enseigne par entrée de `@cabas/reference` (CHAINS) pour les imports
 *   structurés et, lorsqu'un accord existe, un flux officiel.
 */
export function priceConnectors(deps: ConnectorDeps = {}): PriceConnector[] {
  return [
    new DemoPriceConnector(),
    new LidlWebConnector(),
    new AldiApiConnector(),
    new DennerWebConnector(),
    new CoopEpaperConnector(),
    new OpenPricesConnector(deps.stores ?? [], deps.resolveZone, undefined, deps.opLocations ?? []),
    new FoodAllyConnector(),
    ...chainConnectors(),
  ];
}

/** Connecteurs qui collectent des prix réels en ligne (tâche `collect`). */
export const LIVE_CONNECTOR_IDS = ['lidl-web', 'aldi-api', 'denner-web', 'coop-epaper', 'open-prices', 'foodally'];

export function findConnector(id: string, deps: ConnectorDeps = {}): PriceConnector | undefined {
  return priceConnectors(deps).find((c) => c.id === id);
}
