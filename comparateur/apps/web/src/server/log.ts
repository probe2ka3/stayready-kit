import 'server-only';

type Level = 'info' | 'warn' | 'error';

/**
 * Journal applicatif structuré (une ligne JSON). Ne jamais y écrire de donnée
 * personnelle : pas d'adresse IP, pas de position précise, pas de panier.
 */
export function log(level: Level, msg: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...data });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function errorInfo(e: unknown): Record<string, unknown> {
  if (e instanceof Error) return { error: e.message, name: e.name };
  return { error: String(e) };
}
