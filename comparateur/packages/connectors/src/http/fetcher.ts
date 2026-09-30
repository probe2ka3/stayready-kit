import { createHash } from 'node:crypto';
import { appendFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { silentLogger, type ConnectorContext, type Logger } from '../types';
import { ALLOW_ALL, DISALLOW_ALL, isAllowed, parseRobots, type RobotsPolicy } from './robots';

/**
 * Client HTTP de collecte « poli » (voir docs/audit/03-sources-prix.md §7) :
 * agent identifié, robots.txt respecté, délai minimal par hôte, reprises limitées,
 * arrêt définitif sur 401/403/451 ou défi anti-robot, archivage des réponses.
 */

export interface FetcherOptions {
  userAgent: string;
  /** Délai minimal entre deux requêtes vers un même hôte (défaut 3 s). */
  minDelayMs?: number;
  /** Nombre de reprises après une erreur réseau, 429 ou 5xx (défaut 3). */
  maxRetries?: number;
  timeoutMs?: number;
  maxBytes?: number;
  /** Dossier d'archivage des réponses (gzip) ; null = pas d'archive. */
  archiveDir?: string | null;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  log?: Logger;
}

export type BlockReason = 'robots' | 'forbidden' | 'challenge' | 'quota';

/** Accès refusé : ne jamais réessayer autrement (pas de changement d'agent, pas de contournement). */
export class HttpBlockedError extends Error {
  constructor(
    public readonly url: string,
    public readonly reason: BlockReason,
    public readonly status: number | null = null,
  ) {
    super(
      reason === 'robots'
        ? `Interdit par robots.txt : ${url}`
        : reason === 'quota'
          ? `Quota d'accès gratuit atteint (HTTP 402) : ${url}`
          : reason === 'challenge'
          ? `Protection anti-robot détectée : ${url}`
          : `Accès refusé (HTTP ${status}) : ${url}`,
    );
  }
}

export class HttpFetchError extends Error {
  constructor(
    public readonly url: string,
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
  }
}

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  body: string;
  fetchedAt: Date;
  sha256: string;
  archivedAs: string | null;
  /** En-têtes utiles (limites de débit annoncées par la source). */
  headers?: Record<string, string>;
}

export interface FetcherStats {
  requests: number;
  bytes: number;
  retries: number;
  blocked: Record<string, BlockReason>;
  errors: number;
}

const CHALLENGE_MARKERS = [
  'captcha-delivery.com',
  'Please enable JS and disable any ad blocker',
  'cf-chl-bypass',
  'challenge-platform',
  '_Incapsula_Resource',
];

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export class PoliteFetcher {
  readonly stats: FetcherStats = { requests: 0, bytes: 0, retries: 0, blocked: {}, errors: 0 };
  private readonly robotsCache = new Map<string, Promise<RobotsPolicy>>();
  private readonly nextSlot = new Map<string, number>();
  private readonly opts: Required<Omit<FetcherOptions, 'archiveDir'>> & { archiveDir: string | null };

  constructor(options: FetcherOptions) {
    if (!options.userAgent || /mozilla|chrome|safari/i.test(options.userAgent)) {
      throw new Error('Agent HTTP identifiable requis (jamais un agent de navigateur)');
    }
    this.opts = {
      minDelayMs: 3000,
      maxRetries: 3,
      timeoutMs: 30_000,
      maxBytes: 8 * 1024 * 1024,
      fetchImpl: fetch,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      clock: () => Date.now(),
      log: silentLogger,
      ...options,
      archiveDir: options.archiveDir ?? null,
    };
  }

  /** Hôte marqué bloqué pendant cette exécution. */
  isBlocked(url: string): boolean {
    return new URL(url).host in this.stats.blocked;
  }

  async robots(origin: string): Promise<RobotsPolicy> {
    let p = this.robotsCache.get(origin);
    if (!p) {
      p = this.loadRobots(origin);
      this.robotsCache.set(origin, p);
    }
    return p;
  }

  private async loadRobots(origin: string): Promise<RobotsPolicy> {
    const url = `${origin}/robots.txt`;
    try {
      const res = await this.request(url, 'text/plain', 1);
      return parseRobots(res.body, this.opts.userAgent);
    } catch (e) {
      if (e instanceof HttpFetchError && e.status !== null && e.status >= 400 && e.status < 500) {
        // 404/410 : aucune restriction (RFC 9309 §2.3.1.3). 401/403 relèvent de HttpBlockedError.
        return ALLOW_ALL;
      }
      if (e instanceof HttpBlockedError) throw e;
      // Injoignable : on considère tout interdit (RFC 9309 §2.3.1.4).
      this.opts.log.warn('robots.txt injoignable : accès suspendu', { origin, error: String(e) });
      return DISALLOW_ALL;
    }
  }

  /** GET d'une page autorisée, avec délai, reprises et archivage. */
  async get(url: string, accept = 'text/html,application/xhtml+xml'): Promise<FetchResult> {
    const delay = await this.admit(url);
    return this.request(url, accept, this.opts.maxRetries + 1, delay);
  }

  /**
   * POST vers un point d'accès public explicitement prévu pour les machines (ex. serveur MCP
   * autorisé par robots.txt) : mêmes règles que `get` (robots.txt, délai, reprises, arrêt).
   */
  async post(url: string, body: string, contentType = 'application/json', accept = 'application/json'): Promise<FetchResult> {
    const delay = await this.admit(url);
    return this.request(url, accept, this.opts.maxRetries + 1, delay, { method: 'POST', body, contentType });
  }

  private async admit(url: string): Promise<number> {
    const u = new URL(url);
    if (u.host in this.stats.blocked) throw new HttpBlockedError(url, this.stats.blocked[u.host] as BlockReason);
    const policy = await this.robots(u.origin);
    if (!isAllowed(policy, `${u.pathname}${u.search}`)) throw new HttpBlockedError(url, 'robots');
    return Math.max(this.opts.minDelayMs, (policy.crawlDelaySec ?? 0) * 1000);
  }

  private async waitTurn(host: string, delayMs: number) {
    const now = this.opts.clock();
    const slot = this.nextSlot.get(host) ?? now;
    const wait = Math.max(0, slot - now);
    this.nextSlot.set(host, Math.max(now, slot) + delayMs);
    if (wait > 0) await this.opts.sleep(wait);
  }

  private async request(
    url: string,
    accept: string,
    attempts: number,
    delayMs = this.opts.minDelayMs,
    send: { method: 'POST'; body: string; contentType: string } | null = null,
  ): Promise<FetchResult> {
    const host = new URL(url).host;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      await this.waitTurn(host, delayMs);
      if (attempt > 0) this.stats.retries++;
      this.stats.requests++;
      let res: Response;
      try {
        res = await this.opts.fetchImpl(url, {
          method: send?.method ?? 'GET',
          headers: {
            'user-agent': this.opts.userAgent,
            accept,
            'accept-language': 'fr-CH,fr;q=0.9,de-CH;q=0.5',
            ...(send ? { 'content-type': send.contentType } : {}),
          },
          body: send?.body,
          redirect: 'follow',
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
      } catch (e) {
        lastError = e;
        this.opts.log.warn('Erreur réseau, nouvelle tentative', { url, attempt, error: String(e) });
        await this.opts.sleep(backoffMs(attempt));
        continue;
      }
      const body = await readLimited(res, this.opts.maxBytes);
      this.stats.bytes += body.length;
      if (res.status === 401 || res.status === 403 || res.status === 451) {
        this.stats.blocked[host] = 'forbidden';
        throw new HttpBlockedError(url, 'forbidden', res.status);
      }
      if (res.status === 402) {
        // Quota gratuit épuisé : arrêt, jamais de contournement (nouvelle identité, autre adresse…).
        this.stats.blocked[host] = 'quota';
        throw new HttpBlockedError(url, 'quota', res.status);
      }
      if (CHALLENGE_MARKERS.some((m) => body.includes(m))) {
        this.stats.blocked[host] = 'challenge';
        throw new HttpBlockedError(url, 'challenge', res.status);
      }
      if (RETRYABLE.has(res.status) && attempt < attempts - 1) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 300) * 1000 : backoffMs(attempt);
        this.opts.log.warn('Réponse temporairement indisponible, nouvelle tentative', { url, status: res.status, waitMs: wait });
        await this.opts.sleep(wait);
        lastError = new HttpFetchError(url, `HTTP ${res.status}`, res.status);
        continue;
      }
      if (!res.ok) {
        this.stats.errors++;
        throw new HttpFetchError(url, `HTTP ${res.status} : ${url}`, res.status);
      }
      const fetchedAt = new Date(this.opts.clock());
      const sha256 = createHash('sha256').update(body).digest('hex');
      const contentType = res.headers.get('content-type') ?? '';
      const archivedAs = await this.archive(url, res.status, contentType, body, fetchedAt, sha256);
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        if (/^x-ratelimit|^retry-after/i.test(k)) headers[k.toLowerCase()] = v;
      });
      return { url, status: res.status, contentType, body, fetchedAt, sha256, archivedAs, headers };
    }
    this.stats.errors++;
    if (lastError instanceof HttpFetchError) throw lastError;
    throw new HttpFetchError(url, `Échec après ${attempts} tentatives : ${String(lastError)}`);
  }

  private async archive(url: string, status: number, contentType: string, body: string, at: Date, sha256: string) {
    if (!this.opts.archiveDir) return null;
    const u = new URL(url);
    const day = at.toISOString().slice(0, 10);
    const dir = join(this.opts.archiveDir, u.host, day);
    const ext = contentType.includes('json') ? 'json' : contentType.includes('xml') ? 'xml' : contentType.includes('html') ? 'html' : 'txt';
    const file = `${createHash('sha1').update(url).digest('hex').slice(0, 16)}-${sha256.slice(0, 8)}.${ext}.gz`;
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, file), gzipSync(body));
      await appendFile(join(dir, 'index.jsonl'), `${JSON.stringify({ url, status, fetchedAt: at.toISOString(), sha256, file })}\n`);
      return join(u.host, day, file);
    } catch (e) {
      this.opts.log.warn('Archivage impossible', { url, error: String(e) });
      return null;
    }
  }
}

function backoffMs(attempt: number): number {
  return Math.min(60_000, 2000 * 2 ** attempt);
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  const len = Number(res.headers.get('content-length') ?? '0');
  if (len > maxBytes) throw new HttpFetchError(res.url, `Réponse trop volumineuse (${len} octets)`, res.status);
  const text = await res.text();
  if (text.length > maxBytes) throw new HttpFetchError(res.url, 'Réponse trop volumineuse', res.status);
  return text;
}

/** Supprime les archives plus anciennes que `days` jours (dossiers `hôte/AAAA-MM-JJ`). */
export async function purgeArchive(dir: string, days: number, now = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  let removed = 0;
  let hosts: string[] = [];
  try {
    hosts = await readdir(dir);
  } catch {
    return 0;
  }
  for (const host of hosts) {
    let daysDirs: string[] = [];
    try {
      daysDirs = await readdir(join(dir, host));
    } catch {
      continue;
    }
    for (const d of daysDirs) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < limit) {
        await rm(join(dir, host, d), { recursive: true, force: true });
        removed++;
      }
    }
  }
  return removed;
}

export function requireFetcher(ctx: ConnectorContext): PoliteFetcher {
  if (!ctx.fetcher) throw new Error('Client HTTP de collecte non fourni');
  return ctx.fetcher;
}
