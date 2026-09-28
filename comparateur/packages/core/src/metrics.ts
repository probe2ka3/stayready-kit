/**
 * Indicateurs d'usage **agrégés et anonymes** (tableau de bord d'exploitation).
 *
 * Principes (LPD, minimisation) :
 * - aucun identifiant d'utilisateur, aucune adresse IP, aucune position, aucun contenu
 *   de panier ne sont enregistrés : uniquement des compteurs quotidiens (jour, indicateur,
 *   dimension parmi une liste fermée) ;
 * - le « retour » d'un visiteur est calculé dans son navigateur (date de sa dernière
 *   visite, conservée localement) et transmis sous forme de tranche (« revenu sous 7 jours ») ;
 * - les signaux « Do Not Track » et « Global Privacy Control » sont respectés.
 */

export const METRICS = {
  /** Visite quotidienne d'un navigateur (au plus une par jour et par navigateur). */
  visit: ['new', 'within_1d', 'within_7d', 'within_30d', 'older'],
  /** Comparaison lancée. */
  compare: ['now', 'plan'],
  /** Taille du panier comparé. */
  compare_lines: ['1-5', '6-10', '11-20', '21+'],
  /** Nombre de magasins du parcours optimisé. */
  compare_stores: ['0', '1', '2', '3', '4', '5'],
  /** Données servies lors de la comparaison. */
  compare_data: ['live', 'demo', 'mixed'],
  detour: ['shown', 'accepted', 'refused'],
  wait_signal: ['shown', 'used'],
  list: ['saved', 'shared', 'printed'],
  search: ['query', 'category'],
} as const;

export type MetricName = keyof typeof METRICS;

export function isValidMetric(metric: string, dimension: string): metric is MetricName {
  return metric in METRICS && (METRICS[metric as MetricName] as readonly string[]).includes(dimension);
}

export function linesBucket(n: number): (typeof METRICS.compare_lines)[number] {
  if (n <= 5) return '1-5';
  if (n <= 10) return '6-10';
  if (n <= 20) return '11-20';
  return '21+';
}

/** Tranche de retour d'après la date de la visite précédente (calcul local au navigateur). */
export function visitBucket(previous: string | null, today: string): (typeof METRICS.visit)[number] {
  if (!previous) return 'new';
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`)) / 86_400_000);
  if (days <= 1) return 'within_1d';
  if (days <= 7) return 'within_7d';
  if (days <= 30) return 'within_30d';
  return 'older';
}

export interface UsageRow {
  day: string;
  metric: string;
  dimension: string;
  count: number;
}

export interface KpiSummary {
  days: number;
  visits: number;
  newVisitors: number;
  returningVisits: number;
  /** Part des visites de navigateurs déjà venus dans les 7 jours. */
  returnRate7d: number | null;
  compares: number;
  comparesPerVisit: number | null;
  planShare: number | null;
  liveShare: number | null;
  detoursShown: number;
  detoursAccepted: number;
  listsSaved: number;
  byDay: Array<{ day: string; visits: number; compares: number }>;
}

export function summarizeUsage(rows: UsageRow[]): KpiSummary {
  const sum = (metric: string, dims?: string[]) =>
    rows.filter((r) => r.metric === metric && (!dims || dims.includes(r.dimension))).reduce((a, r) => a + r.count, 0);
  const visits = sum('visit');
  const compares = sum('compare');
  const days = [...new Set(rows.map((r) => r.day))].sort();
  return {
    days: days.length,
    visits,
    newVisitors: sum('visit', ['new']),
    returningVisits: visits - sum('visit', ['new']),
    returnRate7d: visits ? sum('visit', ['within_1d', 'within_7d']) / visits : null,
    compares,
    comparesPerVisit: visits ? compares / visits : null,
    planShare: compares ? sum('compare', ['plan']) / compares : null,
    liveShare: compares ? sum('compare_data', ['live']) / compares : null,
    detoursShown: sum('detour', ['shown']),
    detoursAccepted: sum('detour', ['accepted']),
    listsSaved: sum('list', ['saved']),
    byDay: days.map((day) => ({
      day,
      visits: rows.filter((r) => r.day === day && r.metric === 'visit').reduce((a, r) => a + r.count, 0),
      compares: rows.filter((r) => r.day === day && r.metric === 'compare').reduce((a, r) => a + r.count, 0),
    })),
  };
}
