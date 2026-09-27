import { DEFAULT_LOCALE, type Locale } from './config';
import { fr, type Messages } from './messages/fr';

const DICTIONARIES: Record<Locale, Messages> = { fr };

export function getMessages(locale: Locale = DEFAULT_LOCALE): Messages {
  return DICTIONARIES[locale] ?? fr;
}

/** Remplace les variables `{nom}` d'un message. */
export function format(message: string, vars: Record<string, string | number> = {}): string {
  return message.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Formes singulier / pluriel. En français, 0 et 1 prennent le singulier. */
export type PluralForms = readonly [one: string, other: string];

export function plural(forms: PluralForms, n: number, vars: Record<string, string | number> = {}): string {
  return format(n < 2 ? forms[0] : forms[1], { n, ...vars });
}

export type { Messages };
export * from './config';
