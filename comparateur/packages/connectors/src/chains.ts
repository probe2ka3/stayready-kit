import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Chain } from '@cabas/core';
import { CHAINS } from '@cabas/reference';
import { mergeBatches, parseImportFile } from './file-import';
import {
  ConnectorNotReadyError,
  type ConnectorBatch,
  type ConnectorContext,
  type ConnectorStatus,
  type PriceConnector,
} from './types';

/**
 * Connecteur propre à chaque enseigne.
 *
 * Ordre de priorité des sources (docs/audit/01-enseignes.md §5) :
 *  1. flux officiel autorisé  → `officialFeed` (à brancher lorsqu'un accord existe) ;
 *  2. import structuré        → fichiers déposés dans `<IMPORT_DIR>/<enseigne>/`.
 * Sans l'un ou l'autre, le connecteur est « en attente d'autorisation » et ne fait rien :
 * il n'existe volontairement aucune collecte automatisée des sites des enseignes.
 */
export interface OfficialFeed {
  /** Indique si le flux est configuré (clé, URL…). */
  isConfigured(env: Record<string, string | undefined>): boolean;
  fetch(ctx: ConnectorContext): Promise<ConnectorBatch>;
}

export class ChainConnector implements PriceConnector {
  readonly id: string;
  readonly label: string;
  readonly chainIds: string[];
  readonly sourceKind = 'manual_import' as const;

  constructor(
    private readonly chain: Chain,
    private readonly officialFeed: OfficialFeed | null = null,
  ) {
    this.id = chain.id;
    this.label = `${chain.name} — connecteur d'enseigne`;
    this.chainIds = [chain.id];
  }

  private async importFiles(importDir: string | undefined): Promise<string[]> {
    if (!importDir) return [];
    try {
      const dir = join(importDir, this.chain.id);
      const entries = await readdir(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && /\.(csv|json)$/i.test(e.name))
        .map((e) => join(dir, e.name))
        .sort();
    } catch {
      return [];
    }
  }

  async status(ctx: Pick<ConnectorContext, 'importDir' | 'env'>): Promise<ConnectorStatus> {
    if (this.officialFeed?.isConfigured(ctx.env ?? {})) {
      return { state: 'ready', message: 'Flux officiel configuré.' };
    }
    const files = await this.importFiles(ctx.importDir);
    if (files.length > 0) {
      return { state: 'ready', message: `${files.length} fichier(s) d'import structuré en attente.` };
    }
    return {
      state: 'awaiting_authorization',
      message:
        "Aucune API publique ni accord n'est disponible pour cette enseigne. Déposer un import structuré " +
        `(CSV/JSON) dans ${ctx.importDir ? join(ctx.importDir, this.chain.id) : '<IMPORT_DIR>/' + this.chain.id}.`,
    };
  }

  /** Fichiers qui seront traités par `run` (pour archivage après import). */
  async pendingFiles(importDir: string | undefined): Promise<string[]> {
    return this.importFiles(importDir);
  }

  async run(ctx: ConnectorContext): Promise<ConnectorBatch> {
    if (this.officialFeed?.isConfigured(ctx.env ?? {})) return this.officialFeed.fetch(ctx);
    const files = await this.importFiles(ctx.importDir);
    if (files.length === 0) throw new ConnectorNotReadyError(this.id, await this.status(ctx));
    const batches: ConnectorBatch[] = [];
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      batches.push(
        parseImportFile(content, file.split(/[\\/]/).pop() as string, {
          connectorId: this.id,
          now: ctx.now,
          chainId: this.chain.id,
        }),
      );
      ctx.log.info('Fichier importé', { connector: this.id, file });
    }
    return mergeBatches(this.id, batches);
  }
}

export function chainConnectors(): ChainConnector[] {
  return CHAINS.map((c) => new ChainConnector(c));
}
