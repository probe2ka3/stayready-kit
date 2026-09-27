/**
 * Langues. Seul le français est publié ; l'allemand, l'italien et l'anglais sont
 * prévus : ajouter un dictionnaire dans `messages/`, l'inscrire ici, et traduire
 * les pages de contenu (`src/content/<langue>/`). Les pages d'une langue non
 * traduite ne sont pas générées (pas de contenu dupliqué pour le référencement).
 */
export const LOCALES = ['fr'] as const;
export const PLANNED_LOCALES = ['de', 'it', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'fr';

export const INTL_LOCALE: Record<Locale, string> = { fr: 'fr-CH' };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Chemins de l'application (segments identiques dans toutes les langues pour l'instant). */
export const paths = {
  home: (l: Locale) => `/${l}`,
  stores: (l: Locale) => `/${l}/magasins`,
  basket: (l: Locale) => `/${l}/panier`,
  compare: (l: Locale) => `/${l}/comparer`,
  list: (l: Locale) => `/${l}/liste`,
  method: (l: Locale) => `/${l}/methode`,
  sources: (l: Locale) => `/${l}/sources`,
  about: (l: Locale) => `/${l}/a-propos`,
  privacy: (l: Locale) => `/${l}/confidentialite`,
  imprint: (l: Locale) => `/${l}/mentions-legales`,
};
