/**
 * Offre grand public (phase 3) : **TesPrix est gratuit pour les consommateurs**, sans abonnement,
 * sans publicité ciblée et sans revente de données personnelles. Toutes les fonctions sont incluses,
 * y compris les alertes de base. Le financement repose sur des offres professionnelles (données
 * agrégées, tableaux de bord, widget ; voir docs/BUSINESS_MODEL_V2.md), qui ne modifient jamais le
 * calcul ni le classement des résultats.
 *
 * Les limites ci-dessous ne sont que des garde-fous techniques (protection contre les abus), pas des
 * paliers commerciaux.
 */

export type PlanId = 'free';

export type Feature =
  | 'compare' // comparaison, 3 scénarios, itinéraire
  | 'plan_date' // comparaison à une date future (promotions annoncées)
  | 'detours' // propositions d'arrêts supplémentaires
  | 'shopping_list' // liste de courses (navigateur)
  | 'saved_baskets' // paniers enregistrés (compte, lorsque les comptes seront ouverts)
  | 'recurring_baskets' // paniers récurrents
  | 'price_alerts' // alerte de baisse de prix (alertes de base)
  | 'promo_tracking' // suivi des promotions annoncées sur ses articles
  | 'price_history' // historique des prix d'un article
  | 'savings_history' // historique des économies
  | 'notifications' // notifications (courriel, push)
  | 'sync' // synchronisation entre appareils
  | 'advanced_planning' // plusieurs dates comparées
  | 'receipt_scan'; // contribution par ticket de caisse

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

export const ALL_FEATURES: Feature[] = [
  'compare',
  'plan_date',
  'detours',
  'shopping_list',
  'saved_baskets',
  'recurring_baskets',
  'price_alerts',
  'promo_tracking',
  'price_history',
  'savings_history',
  'notifications',
  'sync',
  'advanced_planning',
  'receipt_scan',
];

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Gratuit',
    features: ALL_FEATURES,
    limits: { comparesPerDay: null, savedBaskets: 20, priceAlerts: 30, planDays: 60 },
  },
};

export function can(plan: PlanId, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}
