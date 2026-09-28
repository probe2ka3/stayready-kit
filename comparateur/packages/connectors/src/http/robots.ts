/**
 * Interprétation de robots.txt selon la RFC 9309 (Robots Exclusion Protocol) :
 * - groupe de l'agent (jeton produit, insensible à la casse), sinon groupe `*` ;
 * - règles `allow` / `disallow` avec jokers `*` et ancre `$` ;
 * - la règle la plus longue l'emporte, `allow` en cas d'égalité ;
 * - `Crawl-delay` (extension non normalisée, mais respectée).
 */

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsPolicy {
  rules: RobotsRule[];
  /** Délai en secondes demandé entre deux requêtes, s'il est indiqué. */
  crawlDelaySec: number | null;
  sitemaps: string[];
}

interface Group {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySec: number | null;
}

/** Politique permissive (robots.txt absent : RFC 9309 §2.3.1.3). */
export const ALLOW_ALL: RobotsPolicy = { rules: [], crawlDelaySec: null, sitemaps: [] };
/** Politique fermée (robots.txt injoignable : RFC 9309 §2.3.1.4). */
export const DISALLOW_ALL: RobotsPolicy = { rules: [{ allow: false, pattern: '/' }], crawlDelaySec: null, sitemaps: [] };

/** Jeton produit d'un agent HTTP : « TesPrixBot/1.0 (+https://…) » → « tesprixbot ». */
export function productToken(userAgent: string): string {
  return (userAgent.split(/[\s/]/)[0] ?? '').toLowerCase();
}

export function parseRobots(text: string, userAgent: string): RobotsPolicy {
  const token = productToken(userAgent);
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelaySec: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      // « Disallow: » vide = aucune restriction.
      if (value) current.rules.push({ allow: key === 'allow', pattern: value });
    } else if (key === 'crawl-delay') {
      const n = Number(value.replace(',', '.'));
      if (Number.isFinite(n) && n >= 0) current.crawlDelaySec = n;
    }
  }

  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && a === token));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const delays = chosen.map((g) => g.crawlDelaySec).filter((d): d is number => d !== null);
  return {
    rules: chosen.flatMap((g) => g.rules),
    crawlDelaySec: delays.length ? Math.max(...delays) : null,
    sitemaps,
  };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}${anchored ? '$' : ''}`);
}

/** Longueur significative d'un motif (jokers exclus) pour départager les règles. */
function specificity(pattern: string): number {
  return pattern.replace(/[*$]/g, '').length;
}

/** Comparaison sur la forme encodée, sans décoder « %2F » (RFC 9309 §2.2.2). */
function normalizePath(pathWithQuery: string): string {
  return pathWithQuery.replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase());
}

/** Le chemin (avec requête) est-il autorisé ? `/robots.txt` l'est toujours. */
export function isAllowed(policy: RobotsPolicy, pathWithQuery: string): boolean {
  const path = normalizePath(pathWithQuery || '/');
  if (path === '/robots.txt') return true;
  let best: RobotsRule | null = null;
  let bestLen = -1;
  for (const rule of policy.rules) {
    if (!patternToRegExp(normalizePath(rule.pattern)).test(path)) continue;
    const len = specificity(rule.pattern);
    if (len > bestLen || (len === bestLen && rule.allow && best && !best.allow)) {
      best = rule;
      bestLen = len;
    }
  }
  return best ? best.allow : true;
}
