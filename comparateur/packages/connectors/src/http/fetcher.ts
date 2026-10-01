import { createHash } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
  /** Plafond de requêtes pour ce client (une source) pendant l'exécution ; défaut : aucun. */
  maxRequests?: number;
  /** Erreurs consécutives sur un hôte au-delà desquelles l'hôte n'est plus sollicité (défaut 5). */
  maxConsecutiveErrors?: number;
  /** Dossier du cache des ressources peu changeantes (plans du site) ; null = pas de cache. */
  cacheDir?: string | null;
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

/** Plafond de requêtes de la source atteint : la collecte s'arrête proprement (lot partiel). */
export class HttpBudgetError extends Error {
  constructor(
    public readonly url: string,
    public readonly limit: number,
  ) {
    super(`Plafond de ${limit} requêtes atteint pour cette source : ${url}`);
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
  /** Contenu binaire (`getBinary`, ex. page PDF) ; `body` est alors vide. */
  bytes?: Uint8Array;
}

export interface FetcherStats {
  requests: number;
  bytes: number;
  retries: number;
  blocked: Record<string, BlockReason>;
  errors: number;
  /** Réponses servies par le cache local (aucune requête). */
  cacheHits: number;
  /** Hôtes abandonnés après trop d'erreurs consécutives (disjoncteur). */
  tripped: string[];
  budgetExhausted: boolean;
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
  readonly stats: FetcherStats = { requests: 0, bytes: 0, retries: 0, blocked: {}, errors: 0, cacheHits: 0, tripped: [], budgetExhausted: false };
  private readonly robotsCache = new Map<string, Promise<RobotsPolicy>>();
  private readonly nextSlot = new Map<string, number>();
  private readonly consecutiveErrors = new Map<string, number>();
  /**
   * Cookies de session renvoyés par chaque hôte (comportement normal d'un client HTTP : session
   * anonyme d'un journal numérique, par exemple). Jamais d'identifiants ni de cookies fabriqués.
   */
  private readonly cookies = new Map<string, Map<string, string>>();
  private readonly opts: Required<Omit<FetcherOptions, 'archiveDir' | 'cacheDir'>> & { archiveDir: string | null; cacheDir: string | null };

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
      maxRequests: Number.POSITIVE_INFINITY,
      maxConsecutiveErrors: 5,
      ...options,
      archiveDir: options.archiveDir ?? null,
      cacheDir: options.cacheDir ?? null,
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
   * GET d'une ressource peu changeante (plan du site) : servie par le cache local tant qu'elle a moins
   * de `maxAgeMs`, sinon relue et remise en cache. Sans dossier de cache : GET ordinaire.
   */
  async getCached(url: string, maxAgeMs: number, accept = 'application/xml'): Promise<FetchResult> {
    if (!this.opts.cacheDir) return this.get(url, accept);
    const file = join(this.opts.cacheDir, `${createHash('sha1').update(url).digest('hex').slice(0, 20)}.json`);
    try {
      const st = await stat(file);
      if (this.opts.clock() - st.mtimeMs < maxAgeMs) {
        const cached = JSON.parse(await readFile(file, 'utf8')) as FetchResult & { fetchedAt: string };
        this.stats.cacheHits++;
        return { ...cached, fetchedAt: new Date(cached.fetchedAt) };
      }
    } catch {
      // absent ou illisible : relecture
    }
    const res = await this.get(url, accept);
    try {
      await mkdir(this.opts.cacheDir, { recursive: true });
      await writeFile(file, JSON.stringify(res));
    } catch (e) {
      this.opts.log.warn('Mise en cache impossible', { url, error: String(e) });
    }
    return res;
  }

  /**
   * GET d'un document binaire autorisé (page PDF d'un prospectus) : mêmes règles que `get`. Le
   * contenu n'est pas archivé (volumineux) ; seul le texte qui en est extrait est conservé.
   *
   * `publisherOrigin` : document servi par un hébergeur de fichiers au moyen d'une adresse signée
   * fournie par le site éditeur (l'hébergeur refuse tout accès non signé, y compris à robots.txt) :
   * le robots.txt applicable est celui de l'éditeur. Un refus (401/403) du document lui-même arrête
   * la collecte comme ailleurs.
   */
  async getBinary(url: string, accept = 'application/pdf', publisherOrigin?: string): Promise<FetchResult> {
    const delay = await this.admit(url, publisherOrigin);
    return this.request(url, accept, this.opts.maxRetries + 1, delay, null, true);
  }

  /**
   * Cache clé → valeur (données dérivées d'un document qui ne change pas : texte d'une page de
   * prospectus déjà lue). Aucun accès réseau ; null si absent, illisible ou plus vieux que `maxAgeMs`.
   */
  async cacheRead<T>(key: string, maxAgeMs: number): Promise<T | null> {
    if (!this.opts.cacheDir) return null;
    const file = join(this.opts.cacheDir, `kv-${createHash('sha1').update(key).digest('hex').slice(0, 20)}.json`);
    try {
      const st = await stat(file);
      if (this.opts.clock() - st.mtimeMs >= maxAgeMs) return null;
      const value = JSON.parse(await readFile(file, 'utf8')) as T;
      this.stats.cacheHits++;
      return value;
    } catch {
      return null;
    }
  }

  async cacheWrite(key: string, value: unknown): Promise<void> {
    if (!this.opts.cacheDir) return;
    try {
      await mkdir(this.opts.cacheDir, { recursive: true });
      await writeFile(join(this.opts.cacheDir, `kv-${createHash('sha1').update(key).digest('hex').slice(0, 20)}.json`), JSON.stringify(value));
    } catch (e) {
      this.opts.log.warn('Mise en cache impossible', { key, error: String(e) });
    }
  }

  /**
   * POST vers un point d'accès public explicitement prévu pour les machines (ex. serveur MCP
   * autorisé par robots.txt) : mêmes règles que `get` (robots.txt, délai, reprises, arrêt).
   */
  async post(url: string, body: string, contentType = 'application/json', accept = 'application/json'): Promise<FetchResult> {
    const delay = await this.admit(url);
    return this.request(url, accept, this.opts.maxRetries + 1, delay, { method: 'POST', body, contentType });
  }

  private async admit(url: string, publisherOrigin?: string): Promise<number> {
    const u = new URL(url);
    if (u.host in this.stats.blocked) throw new HttpBlockedError(url, this.stats.blocked[u.host] as BlockReason);
    if (this.stats.tripped.includes(u.host)) throw new HttpFetchError(url, `Hôte abandonné après ${this.opts.maxConsecutiveErrors} erreurs consécutives : ${url}`);
    if (this.stats.requests >= this.opts.maxRequests) {
      this.stats.budgetExhausted = true;
      throw new HttpBudgetError(url, this.opts.maxRequests);
    }
    const policy = await this.robots(publisherOrigin ?? u.origin);
    if (!isAllowed(policy, publisherOrigin ? '/' : `${u.pathname}${u.search}`)) throw new HttpBlockedError(url, 'robots');
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
    binary = false,
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
            ...(this.cookies.get(host)?.size ? { cookie: [...(this.cookies.get(host) as Map<string, string>)].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
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
      this.keepCookies(host, res);
      const bytes = binary && res.ok ? await readLimitedBytes(res, this.opts.maxBytes) : null;
      const body = bytes ? '' : await readLimited(res, this.opts.maxBytes);
      this.stats.bytes += bytes ? bytes.byteLength : body.length;
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
        this.noteError(host);
        throw new HttpFetchError(url, `HTTP ${res.status} : ${url}`, res.status);
      }
      this.consecutiveErrors.set(host, 0);
      const fetchedAt = new Date(this.opts.clock());
      const sha256 = createHash('sha256').update(bytes ?? body).digest('hex');
      const contentType = res.headers.get('content-type') ?? '';
      const archivedAs = bytes ? null : await this.archive(url, res.status, contentType, body, fetchedAt, sha256);
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        if (/^x-ratelimit|^retry-after/i.test(k)) headers[k.toLowerCase()] = v;
      });
      return { url, status: res.status, contentType, body, fetchedAt, sha256, archivedAs, headers, ...(bytes ? { bytes } : {}) };
    }
    this.stats.errors++;
    this.noteError(host);
    if (lastError instanceof HttpFetchError) throw lastError;
    throw new HttpFetchError(url, `Échec après ${attempts} tentatives : ${String(lastError)}`);
  }

  private keepCookies(host: string, res: Response) {
    const set = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of set) {
      const m = /^\s*([^=;\s]+)=([^;]*)/.exec(line);
      if (!m) continue;
      const jar = this.cookies.get(host) ?? new Map<string, string>();
      if (/;\s*max-age=0\b|;\s*expires=thu, 01 jan 1970/i.test(line)) jar.delete(m[1] as string);
      else jar.set(m[1] as string, m[2] as string);
      this.cookies.set(host, jar);
    }
  }

  /** Disjoncteur : au-delà de N erreurs consécutives, l'hôte n'est plus sollicité pendant l'exécution. */
  private noteError(host: string) {
    const n = (this.consecutiveErrors.get(host) ?? 0) + 1;
    this.consecutiveErrors.set(host, n);
    if (n >= this.opts.maxConsecutiveErrors && !this.stats.tripped.includes(host)) {
      this.stats.tripped.push(host);
      this.opts.log.warn('Hôte abandonné pour cette exécution (erreurs consécutives)', { host, errors: n });
    }
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

async function readLimitedBytes(res: Response, maxBytes: number): Promise<Uint8Array> {
  const len = Number(res.headers.get('content-length') ?? '0');
  if (len > maxBytes) throw new HttpFetchError(res.url, `Réponse trop volumineuse (${len} octets)`, res.status);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new HttpFetchError(res.url, 'Réponse trop volumineuse', res.status);
  return buf;
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
