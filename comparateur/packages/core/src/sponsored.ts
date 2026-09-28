/**
 * Liens commerciaux et campagnes partenaires.
 *
 * Règles (non négociables, testées) :
 * - un contenu sponsorisé est toujours signalé comme tel (« Annonce » / « Partenaire ») ;
 * - il est affiché **à côté** des résultats, jamais inséré dans le classement ;
 * - le moteur de comparaison ne reçoit aucune donnée commerciale : les résultats sont
 *   identiques avec ou sans campagne ;
 * - aucun lien n'est suivi par un traceur tiers ; `rel="sponsored nofollow noopener"`.
 *
 * Aucun programme d'affiliation n'est configuré : l'enseigne doit d'abord proposer un
 * programme réel et vérifié (voir docs/MARCHE.md §5).
 */

export type Disclosure = 'annonce' | 'partenaire' | 'lien_affilie';

export interface SponsoredPlacement {
  id: string;
  /** Emplacement : sous les résultats, sur la page d'accueil ou dans la liste. */
  slot: 'results_footer' | 'home' | 'list_footer';
  disclosure: Disclosure;
  title: string;
  body: string;
  url: string;
  /** Enseigne concernée (facultatif) : purement informatif, sans effet sur le calcul. */
  chainId?: string | null;
  startsAt: string;
  endsAt: string;
  campaign: string;
}

export const DISCLOSURE_LABEL: Record<Disclosure, string> = {
  annonce: 'Annonce',
  partenaire: 'Partenaire',
  lien_affilie: 'Lien affilié',
};

/** Emplacements actifs pour un créneau, triés par date de début (jamais par prix payé). */
export function activePlacements(list: SponsoredPlacement[], slot: SponsoredPlacement['slot'], now: Date): SponsoredPlacement[] {
  const t = now.getTime();
  return list
    .filter((p) => p.slot === slot && Date.parse(p.startsAt) <= t && t <= Date.parse(p.endsAt) && isSafeUrl(p.url))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}
