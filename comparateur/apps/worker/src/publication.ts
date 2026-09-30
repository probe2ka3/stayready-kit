import { existsSync } from 'node:fs';
import { copyFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { liveSnapshotDir, type LiveSnapshot } from '@cabas/connectors';
import type { JobContext } from './jobs';

async function collectedAt(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  try {
    return (JSON.parse(await readFile(path, 'utf8')) as LiveSnapshot).collectedAt ?? null;
  } catch {
    return null;
  }
}

/**
 * `live-restore --from=<dossier>` : reprend les instantanés d'une exécution précédente (cache de
 * GitHub Actions) **seulement s'ils sont plus récents** que ceux du dépôt. Une collecte faite sur un
 * ordinateur puis versionnée n'est donc jamais écrasée par un cache plus ancien.
 */
export async function jobLiveRestore(ctx: JobContext) {
  const from = String(ctx.flags.from ?? '');
  if (!from) throw new Error('Usage : live-restore --from=<dossier>');
  if (!existsSync(from)) {
    ctx.log.info('Aucun instantané en cache', { from });
    return;
  }
  const dir = liveSnapshotDir(ctx.env.dataDir);
  for (const f of (await readdir(from)).filter((x) => x.endsWith('.json'))) {
    const cached = await collectedAt(join(from, f));
    const current = await collectedAt(join(dir, f));
    if (cached && (!current || cached > current)) {
      await copyFile(join(from, f), join(dir, f));
      ctx.log.info('Instantané repris du cache', { file: f, cached, current });
    } else {
      ctx.log.info('Instantané du dépôt conservé', { file: f, cached, current });
    }
  }
}
