import 'server-only';
import { restrictedConnectorIds, SOURCE_REGISTRY } from '@cabas/core';
import { serverEnv } from './env';

/**
 * Enseignes dont la source officielle n'est pas affichée dans ce déploiement (conditions : usage
 * privé, sans autorisation enregistrée). L'exclusion vise la source : les relevés d'une source
 * publiable (Open Prices) pour ces enseignes restent affichés.
 */
export function restrictedChainIds(): Set<string> {
  if (!serverEnv.restrictSources) return new Set();
  return new Set(restrictedConnectorIds(serverEnv.authorizedSources).flatMap((id) => SOURCE_REGISTRY[id]?.chainIds ?? []));
}
