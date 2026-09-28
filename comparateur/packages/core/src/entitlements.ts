/**
 * Offres (freemium). L'offre gratuite reste pleinement utile : comparaison illimitée,
 * trois scénarios, itinéraire, planification, détours et listes de courses.
 * L'offre premium ajoute la mémoire et le suivi dans le temps (comptes, alertes,
 * historiques, synchronisation). Aucune fonction ne modifie le classement des résultats :
 * premium ou non, le calcul est identique.
 *
 * Aucun paiement n'est actif : voir apps/web/src/server/billing.ts (fournisseur désactivé).
 */

export type PlanId = 'free' | 'premium';

export type Feature =
  | 'compare' // comparaison, 3 scénarios, itinéraire
  | 'plan_date' // comparaison à une date future (promotions annoncées)
  | 'detours' // propositions d'arrêts supplémentaires
  | 'shopping_list' // liste de courses (navigateur)
  | 'saved_baskets' // paniers enregistrés (compte)
  | 'recurring_baskets' // paniers récurrents (hebdomadaires…)
  | 'price_alerts' // alerte lorsqu'un article baisse
  | 'promo_tracking' // suivi des promotions futures sur ses articles
  | 'price_history' // historique des prix d'un article
  | 'savings_history' // historique des économies réalisées
  | 'notifications' // notifications (courriel, push)
  | 'sync' // synchronisation entre appareils
  | 'advanced_planning'; // plusieurs dates comparées, meilleur jour de la semaine

export interface PlanDefinition {
  id: PlanId;
  name: string;
  features: Feature[];
  limits: {
    /** Comparaisons par jour (null = illimité). */
    comparesPerDay: number | null;
    savedBaskets: number;
    priceAlerts: number;
    /** Horizon de planification en jours. */
    planDays: number;
  };
}

const FREE_FEATURES: Feature[] = ['compare', 'plan_date', 'detours', 'shopping_list'];

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    features: FREE_FEATURES,
    limits: { comparesPerDay: null, savedBaskets: 0, priceAlerts: 0, planDays: 14 },
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    features: [
      ...FREE_FEATURES,
      'saved_baskets',
      'recurring_baskets',
      'price_alerts',
      'promo_tracking',
      'price_history',
      'savings_history',
      'notifications',
      'sync',
      'advanced_planning',
    ],
    limits: { comparesPerDay: null, savedBaskets: 20, priceAlerts: 50, planDays: 60 },
  },
};

export function can(plan: PlanId, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}

/** Tarifs étudiés (hypothèses, voir docs/BUSINESS_PLAN.md) : non facturés tant que le paiement est inactif. */
export const PRICE_HYPOTHESES = {
  monthlyChf: [2.9, 3.9, 4.9],
  /** Annuel ≈ 10 mois payés. */
  yearlyChf: [29, 39, 49],
} as const;
