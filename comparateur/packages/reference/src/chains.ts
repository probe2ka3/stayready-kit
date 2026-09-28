import type { Chain, PriceZone } from '@cabas/core';

/**
 * Enseignes de la première version. Les calendriers promotionnels proviennent de
 * l'audit du 27.09.2026 (docs/audit/01-enseignes.md) : ils servent à générer les
 * données de démonstration et à détecter les promotions importées à un jour
 * inhabituel. Le moteur n'en dépend pas : chaque promotion porte ses propres dates.
 */
export const CHAINS: Chain[] = [
  {
    id: 'migros',
    name: 'Migros',
    badge: 'MI',
    website: 'https://www.migros.ch',
    status: 'active',
    promoCalendar: {
      waves: [
        { startWeekday: 4, durationDays: 7, publishLeadDays: 1, label: 'Actions de la semaine' },
        { startWeekday: 4, durationDays: 4, publishLeadDays: 1, label: 'Actions du week-end' },
      ],
      verifiedAt: '2026-09-27',
      sourceUrl: 'https://corporate.migros.ch/de/news/migros-aktionen-starten-neu-am-donnerstag',
      notes: 'Jeudi → mercredi depuis le 05.02.2026 ; Migros Magazin distribué le mercredi.',
    },
    loyaltyPrograms: [{ id: 'cumulus', name: 'Cumulus' }],
    notes: 'Prix pouvant varier selon la coopérative régionale et, pour le frais, selon la succursale.',
  },
  {
    id: 'coop',
    name: 'Coop',
    badge: 'CO',
    website: 'https://www.coop.ch',
    status: 'active',
    promoCalendar: {
      waves: [
        { startWeekday: 4, durationDays: 7, publishLeadDays: 0, label: 'Actions de la semaine' },
        { startWeekday: 4, durationDays: 4, publishLeadDays: 0, label: 'Actions du week-end' },
      ],
      verifiedAt: '2026-09-27',
      sourceUrl: 'https://www.foodaktuell.ch/2025/01/21/coop-aktionen-beginnen-neu-am-donnerstag',
      notes: 'Jeudi → mercredi depuis janvier 2025 ; Coopzeitung / Coopération le jeudi.',
    },
    loyaltyPrograms: [{ id: 'supercard', name: 'Supercard' }],
  },
  {
    id: 'denner',
    name: 'Denner',
    badge: 'DE',
    website: 'https://www.denner.ch',
    status: 'active',
    promoCalendar: {
      waves: [{ startWeekday: 4, durationDays: 7, publishLeadDays: 1, label: 'Actions de la semaine' }],
      verifiedAt: '2026-09-27',
      sourceUrl: 'https://www.denner.ch/de/aktionen/aktionen-ab-donnerstag',
      notes: 'Jeudi → mercredi depuis le 05.02.2026 ; « Denner Woche » le mercredi.',
    },
    loyaltyPrograms: [],
  },
  {
    id: 'aldi',
    name: 'Aldi Suisse',
    badge: 'AL',
    website: 'https://www.aldi-suisse.ch',
    status: 'active',
    promoCalendar: {
      waves: [
        { startWeekday: 4, durationDays: 4, publishLeadDays: 7, label: 'Actions dès jeudi' },
        { startWeekday: 1, durationDays: 3, publishLeadDays: 7, label: 'Actions dès lundi' },
      ],
      verifiedAt: '2026-09-27',
      sourceUrl: 'https://www.aldi-suisse.ch/de/aktionen-und-angebote',
      notes: 'Deux vagues (jeudi → dimanche, lundi → mercredi), annoncées à l’avance (« Kommende Aktionen »).',
    },
    loyaltyPrograms: [],
  },
  {
    id: 'lidl',
    name: 'Lidl Suisse',
    badge: 'LI',
    website: 'https://www.lidl.ch',
    status: 'active',
    promoCalendar: {
      waves: [
        { startWeekday: 4, durationDays: 7, publishLeadDays: 14, label: 'Lidl Aktuell' },
        { startWeekday: 1, durationDays: 3, publishLeadDays: 14, label: 'Actions dès lundi' },
      ],
      verifiedAt: '2026-09-27',
      sourceUrl: 'https://www.lidl.ch/',
      notes: 'Vagues du jeudi et du lundi ; section « Demnächst » plusieurs semaines à l’avance.',
    },
    loyaltyPrograms: [{ id: 'lidl-plus', name: 'Lidl Plus' }],
  },
  {
    id: 'ottos',
    name: "OTTO'S",
    badge: 'OT',
    website: 'https://www.ottos.ch',
    status: 'active',
    promoCalendar: {
      waves: [{ startWeekday: 2, durationDays: null, publishLeadDays: 7, label: 'Wochenhits' }],
      verifiedAt: '2026-09-27',
      sourceUrl: 'https://www.ottos.ch/de/prospekte',
      notes: 'Dès le mardi, « solange Vorrat » (sans date de fin publiée).',
    },
    loyaltyPrograms: [],
  },
  {
    id: 'action',
    name: 'Action',
    badge: 'AC',
    website: 'https://www.action.com/fr-ch/',
    status: 'active',
    promoCalendar: {
      waves: [{ startWeekday: 3, durationDays: 7, publishLeadDays: 7, label: 'Offres de la semaine' }],
      verifiedAt: '2026-09-27',
      sourceUrl: 'https://www.action.com/de-ch/wochenangebote/',
      notes: 'Mercredi → mardi ; offres à venir annoncées dans l’application.',
    },
    loyaltyPrograms: [],
  },
  {
    id: 'aligro',
    name: 'Aligro',
    badge: 'AG',
    website: 'https://www.aligro.ch',
    status: 'active',
    consumerPricesOnly: true,
    promoCalendar: {
      waves: [{ startWeekday: 1, durationDays: 7, publishLeadDays: 3, label: 'Actions de la semaine' }],
      verifiedAt: '2026-09-27',
      sourceUrl: 'https://www.aligro.ch/de/dokumente/prospekte',
      notes: 'Rythme observé sur agrégateur (début le lundi) : à confirmer auprès d’Aligro.',
    },
    loyaltyPrograms: [],
    notes: 'Seuls les prix TTC accessibles aux particuliers sans carte professionnelle sont admis.',
  },
];

/**
 * Zones tarifaires Migros (coopératives régionales). Correspondance par canton
 * **approximative** : les limites réelles suivent les communes (ex. Migros Zurich
 * dessert aussi des communes de SG et SZ ; Migros Bâle s'étend au Jura).
 */
export const PRICE_ZONES: PriceZone[] = [
  { id: 'migros-aare', chainId: 'migros', name: 'Migros Aar', cantons: ['BE', 'SO', 'AG'] },
  { id: 'migros-basel', chainId: 'migros', name: 'Migros Bâle', cantons: ['BS', 'BL', 'JU'] },
  { id: 'migros-geneve', chainId: 'migros', name: 'Migros Genève', cantons: ['GE'] },
  { id: 'migros-luzern', chainId: 'migros', name: 'Migros Lucerne', cantons: ['LU', 'ZG', 'OW', 'NW', 'UR', 'SZ'] },
  { id: 'migros-nf', chainId: 'migros', name: 'Migros Neuchâtel-Fribourg', cantons: ['NE', 'FR'] },
  { id: 'migros-ostschweiz', chainId: 'migros', name: 'Migros Suisse orientale', cantons: ['SH', 'TG', 'SG', 'AR', 'AI', 'GR'] },
  { id: 'migros-ticino', chainId: 'migros', name: 'Migros Tessin', cantons: ['TI'] },
  { id: 'migros-vaud', chainId: 'migros', name: 'Migros Vaud', cantons: ['VD'] },
  { id: 'migros-valais', chainId: 'migros', name: 'Migros Valais', cantons: ['VS'] },
  { id: 'migros-zurich', chainId: 'migros', name: 'Migros Zurich', cantons: ['ZH', 'GL'] },
  /*
   * Lidl : prix nationaux, mais certaines actions sont limitées à une région linguistique
   * (« valable uniquement au Tessin », « … en Suisse romande »). La langue de la localité
   * (swisstopo) prime sur le canton, approximatif pour FR, VS et BE.
   */
  {
    id: 'lidl-deutschschweiz',
    chainId: 'lidl',
    name: 'Lidl Suisse alémanique',
    cantons: ['ZH', 'BE', 'LU', 'UR', 'SZ', 'OW', 'NW', 'GL', 'ZG', 'SO', 'BS', 'BL', 'SH', 'AR', 'AI', 'SG', 'GR', 'AG', 'TG'],
    languages: ['de', 'rm'],
  },
  { id: 'lidl-romandie', chainId: 'lidl', name: 'Lidl Suisse romande', cantons: ['GE', 'VD', 'NE', 'JU', 'FR', 'VS'], languages: ['fr'] },
  { id: 'lidl-ticino', chainId: 'lidl', name: 'Lidl Tessin', cantons: ['TI'], languages: ['it'] },
];

/**
 * Zone tarifaire d'une succursale : d'après la langue de la localité si la zone la
 * définit, sinon d'après le canton.
 */
export function zoneForStore(chainId: string, canton: string | null | undefined, lang?: string | null): string | null {
  const zones = PRICE_ZONES.filter((z) => z.chainId === chainId);
  if (lang) {
    const byLang = zones.find((z) => z.languages?.includes(lang));
    if (byLang) return byLang.id;
  }
  if (!canton) return null;
  return zones.find((z) => z.cantons.includes(canton))?.id ?? null;
}
