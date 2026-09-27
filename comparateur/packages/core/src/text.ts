/** Normalisation de texte pour la recherche (accents, casse, ligatures). */
export function normalizeText(input: string): string {
  return input
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(input: string): string[] {
  const n = normalizeText(input);
  return n ? n.split(' ') : [];
}

const STOPWORDS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'a', 'au', 'aux', 'et', 'en', 'pour', 'avec', 'sans',
  'un', 'une', 'the', 'and', 'x',
]);

export function significantTokens(input: string): string[] {
  return tokenize(input).filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

export interface Searchable {
  id: string;
  /** Texte principal (nom). */
  name: string;
  /** Texte secondaire (mots-clés, catégorie). */
  extra?: string;
}

/**
 * Score de pertinence simple et prévisible :
 * chaque mot de la requête doit être le préfixe d'un mot du produit (tolérance
 * au pluriel « s »/« x »). Bonus si le mot est dans le nom et en début de nom.
 */
export function searchScore(query: string, item: Searchable): number {
  const q = tokenize(query);
  if (q.length === 0) return 0;
  const nameTokens = tokenize(item.name);
  const extraTokens = tokenize(item.extra ?? '');
  let score = 0;
  for (const token of q) {
    const stem = token.length > 3 ? token.replace(/[sx]$/, '') : token;
    const inName = nameTokens.findIndex((w) => w.startsWith(stem));
    if (inName >= 0) {
      score += 10 + (inName === 0 ? 5 : 0) + (nameTokens[inName] === token ? 3 : 0);
      continue;
    }
    if (extraTokens.some((w) => w.startsWith(stem))) {
      score += 4;
      continue;
    }
    return 0;
  }
  return score - nameTokens.length * 0.1;
}

export function search<T extends Searchable>(query: string, items: T[], limit = 20): T[] {
  return items
    .map((item) => ({ item, score: searchScore(query, item) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'fr'))
    .slice(0, limit)
    .map((r) => r.item);
}
