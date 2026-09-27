import { resolve } from 'node:path';
import { readEnv } from './context';
import { JOBS, loggerFor } from './jobs';

/**
 * Utilisation : pnpm job <tâche> [arguments] [--option[=valeur]]
 * Exemple     : pnpm job import data/imports/examples/migros.prices.csv --connector migros --dry-run
 */
function parseArgs(argv: string[]) {
  const flags: Record<string, string | boolean> = {};
  const args: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) flags[k as string] = v;
      else if (argv[i + 1] && !(argv[i + 1] as string).startsWith('--') && ['connector', 'only', 'by'].includes(k as string)) {
        flags[k as string] = argv[++i] as string;
      } else flags[k as string] = true;
    } else args.push(resolve(process.env.INIT_CWD ?? process.cwd(), a));
  }
  return { flags, args };
}

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  const job = name ? JOBS[name] : undefined;
  if (!name || !job) {
    console.log('Tâches disponibles :');
    for (const [k, v] of Object.entries(JOBS)) console.log(`  ${k.padEnd(12)} ${v.help}`);
    process.exit(name ? 1 : 0);
  }
  const { flags, args } = parseArgs(rest);
  const log = loggerFor(name);
  const started = Date.now();
  try {
    await job.run({ env: readEnv(), now: new Date(), flags, args, log });
    log.info('Tâche terminée', { durationMs: Date.now() - started });
  } catch (e) {
    log.error('Tâche en échec', { message: e instanceof Error ? e.message : String(e) });
    process.exitCode = 1;
  }
}

void main();
