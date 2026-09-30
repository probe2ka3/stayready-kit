import 'server-only';
import type { B2BPlanId } from '@cabas/core';

/**
 * Abstraction du paiement des **offres professionnelles** (API de données, tableau de bord, widget,
 * marque blanche). Le service grand public est gratuit : aucun paiement consommateur n'est prévu.
 * **Aucun paiement n'est actif** :
 * le fournisseur par défaut refuse toute opération. Un fournisseur réel (Stripe,
 * Datatrans, Payrexx, TWINT via un prestataire…) pourra implémenter cette interface
 * sans toucher au reste de l'application, après décision de l'exploitant
 * (contrat, conditions générales, TVA, politique de confidentialité).
 */
export interface CheckoutRequest {
  plan: B2BPlanId;
  period: 'month' | 'year';
  /** Identifiant interne du client professionnel (jamais l'adresse électronique en clair dans les métadonnées). */
  accountRef: string;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingProvider {
  readonly id: string;
  readonly enabled: boolean;
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
  /** Vérifie la signature et renvoie l'évènement normalisé (abonnement créé, renouvelé, résilié). */
  handleWebhook(rawBody: string, signature: string | null): Promise<BillingEvent | null>;
  cancel(subscriptionRef: string): Promise<void>;
}

export type BillingEvent =
  | { kind: 'subscription_active'; accountRef: string; plan: B2BPlanId; periodEnd: string }
  | { kind: 'subscription_canceled'; accountRef: string; periodEnd: string };

export class BillingDisabledError extends Error {
  constructor() {
    super('Paiement non activé');
  }
}

/** Fournisseur par défaut : paiement désactivé. */
export const disabledBilling: BillingProvider = {
  id: 'none',
  enabled: false,
  async createCheckout() {
    throw new BillingDisabledError();
  },
  async handleWebhook() {
    return null;
  },
  async cancel() {
    throw new BillingDisabledError();
  },
};

/** Fournisseur configuré (BILLING_PROVIDER) : seul « none » est disponible à ce stade. */
export function getBillingProvider(): BillingProvider {
  const id = process.env.BILLING_PROVIDER ?? 'none';
  if (id !== 'none') {
    // Garde-fou : un fournisseur inconnu ne doit jamais activer silencieusement un paiement.
    console.warn(JSON.stringify({ level: 'warn', msg: 'BILLING_PROVIDER inconnu, paiement désactivé', id }));
  }
  return disabledBilling;
}
