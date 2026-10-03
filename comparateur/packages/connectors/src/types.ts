import type {
  CanonicalProduct,
  PriceObservation,
  ProductMatch,
  Promotion,
  RetailerProduct,
  SourceKind,
  Store,
} from '@cabas/core';

import type { PoliteFetcher } from './http/fetcher';
import type { ReviewedMatch } from './matching';

export interface ImportIssue {
  file?: string;
  line?: number;
  field?: string;
  message: string;
}

export interface ImportReport {
  accepted: { products: number; prices: number; promotions: number; matches: number };
  rejected: ImportIssue[];
  warnings: ImportIssue[];
  /** Mesures propres à la collecte (pages lues, articles par catégorie, blocages…). */
  metrics?: Record<string, number | string | boolean>;
}

/** Résultat d'une exécution de connecteur de prix. */
export interface ConnectorBatch {
  connectorId: string;
  retailerProducts: RetailerProduct[];
  /** Correspondances proposées par le connecteur (validées ou suggérées). */
  matches: ProductMatch[];
  prices: PriceObservation[];
  promotions: Promotion[];
  report: ImportReport;
}

export type ConnectorState =
  | 'ready' // exécutable
  | 'blocked' // la source refuse l'accès automatisé (403, défi anti-robot, robots.txt)
  | 'awaiting_authorization' // aucune source autorisée n'est configurée
  | 'not_configured' // configuration manquante (fichier, clé…)
  | 'disabled';

export interface ConnectorStatus {
  state: ConnectorState;
  message: string;
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };

export interface ConnectorContext {
  now: Date;
  log: Logger;
  /** Dossier des imports structurés (un sous-dossier par enseigne). */
  importDir?: string;
  env?: Record<string, string | undefined>;
  signal?: AbortSignal;
  /** Client HTTP poli partagé (robots.txt, délais, archive) pour les connecteurs en ligne. */
  fetcher?: PoliteFetcher;
  /** Catalogue normalisé (défaut : référentiel versionné). */
  catalog?: CanonicalProduct[];
  /** Correspondances revues par l'équipe données. */
  reviewedMatches?: ReviewedMatch[];
  /**
   * Collecte ciblée sur le noyau (tâche `quotidien`) : besoins à chercher et fiches déjà reliées à
   * ces besoins. Absent : collecte complète historique.
   */
  targets?: { needs?: string[]; productUrls?: string[] };
}

/** Connecteur de prix et promotions. Chaque enseigne dispose du sien. */
export interface PriceConnector {
  readonly id: string;
  readonly label: string;
  readonly chainIds: string[];
  /** Type de source fournie lorsque le connecteur est prêt. */
  readonly sourceKind: SourceKind;
  /**
   * La collecte relit toute la source (fenêtre complète) : après une collecte réussie, l'instantané
   * est remplacé au lieu d'être fusionné avec le précédent. Une décision retirée (correspondance,
   * attribution de lieu) disparaît ainsi dès la collecte suivante.
   */
  readonly completeRead?: boolean;
  status(ctx: Pick<ConnectorContext, 'importDir' | 'env'>): Promise<ConnectorStatus>;
  run(ctx: ConnectorContext): Promise<ConnectorBatch>;
}

export interface StoreConnector {
  readonly id: string;
  readonly label: string;
  fetchStores(ctx: ConnectorContext): Promise<{ stores: Store[]; report: ImportReport }>;
}

export function emptyReport(): ImportReport {
  return { accepted: { products: 0, prices: 0, promotions: 0, matches: 0 }, rejected: [], warnings: [] };
}

export class ConnectorNotReadyError extends Error {
  constructor(
    public readonly connectorId: string,
    public readonly status: ConnectorStatus,
  ) {
    super(`Connecteur ${connectorId} non disponible : ${status.message}`);
  }
}
