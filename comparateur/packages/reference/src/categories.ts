import type { Category } from '@cabas/core';

export const CATEGORIES: Category[] = [
  { id: 'fruits', name: 'Fruits', kind: 'food', icon: '🍎', sort: 10 },
  { id: 'legumes', name: 'Légumes', kind: 'food', icon: '🥕', sort: 20 },
  { id: 'pommes-de-terre', name: 'Pommes de terre', kind: 'food', icon: '🥔', sort: 30 },
  { id: 'pates-riz-cereales', name: 'Pâtes, riz et céréales', kind: 'food', icon: '🍝', sort: 40 },
  { id: 'farine-sucre-sel', name: 'Farine, sucre et sel', kind: 'food', icon: '🧂', sort: 50 },
  { id: 'huiles-condiments', name: 'Huiles, vinaigres et condiments', kind: 'food', icon: '🫒', sort: 60 },
  { id: 'produits-laitiers', name: 'Lait, beurre et fromages', kind: 'food', icon: '🥛', sort: 70 },
  { id: 'oeufs', name: 'Œufs', kind: 'food', icon: '🥚', sort: 80 },
  { id: 'pain', name: 'Pain et boulangerie', kind: 'food', icon: '🍞', sort: 90 },
  { id: 'viande-poisson', name: 'Viande et poisson', kind: 'food', icon: '🍗', sort: 100 },
  { id: 'conserves', name: 'Conserves', kind: 'food', icon: '🥫', sort: 110 },
  { id: 'petit-dejeuner', name: 'Petit-déjeuner, café et douceurs', kind: 'food', icon: '☕', sort: 120 },
  { id: 'boissons', name: 'Boissons', kind: 'food', icon: '🧃', sort: 130 },
  { id: 'surgeles', name: 'Surgelés', kind: 'food', icon: '🧊', sort: 140 },
  { id: 'entretien', name: 'Entretien et ménage', kind: 'household', icon: '🧽', sort: 200 },
  { id: 'hygiene', name: 'Hygiène', kind: 'hygiene', icon: '🧴', sort: 300 },
  { id: 'papier', name: 'Papier et mouchoirs', kind: 'other', icon: '🧻', sort: 400 },
  { id: 'maison', name: 'Piles et articles ménagers', kind: 'other', icon: '🔋', sort: 410 },
];
