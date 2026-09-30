import { normalizeQuantity, type CanonicalProduct } from '@cabas/core';

/**
 * Catalogue normalisé initial (≈ 200 références essentielles).
 *
 * Les désignations sont génériques et rédigées pour le projet (aucun texte ni
 * photo repris des enseignes). Les attributs `organic`, `swissOrigin`, `labels`
 * et `brandRequired` sont des **exigences** : un article d'enseigne n'est
 * équivalent que s'il les satisfait.
 *
 * `demo` ne sert qu'à générer les données de démonstration fictives :
 * - `chf` : ordre de grandeur arbitraire utilisé comme base des prix fictifs,
 * - `swissTypical` : les articles fictifs sont d'origine suisse.
 * Ces valeurs ne sont jamais présentées comme des prix réels.
 */
export interface ProductSeed extends CanonicalProduct {
  demo: { chf: number; swissTypical: boolean };
}

interface Opts {
  organic?: boolean;
  swiss?: boolean;
  swissTypical?: boolean;
  labels?: string[];
  brand?: string;
  kw?: string;
}

function p(
  slug: string,
  name: string,
  categoryId: string,
  amount: number,
  unit: string,
  demoChf: number,
  opts: Opts = {},
): ProductSeed {
  return {
    id: slug,
    slug,
    name,
    categoryId,
    quantity: normalizeQuantity(amount, unit),
    attributes: {
      ...(opts.organic ? { organic: true } : {}),
      ...(opts.swiss ? { swissOrigin: true } : {}),
      ...(opts.labels ? { labels: opts.labels } : {}),
    },
    brandRequired: opts.brand ?? null,
    keywords: opts.kw ? opts.kw.split(/\s*,\s*/) : [],
    demo: { chf: demoChf, swissTypical: Boolean(opts.swissTypical ?? opts.swiss) },
  };
}

export const PRODUCTS: ProductSeed[] = [
  // --- Fruits ---------------------------------------------------------------------------
  p('pommes-gala-1kg', 'Pommes Gala', 'fruits', 1, 'kg', 3.5, { swissTypical: true, kw: 'pomme' }),
  p('pommes-bio-1kg', 'Pommes bio', 'fruits', 1, 'kg', 5.2, { organic: true, swissTypical: true, kw: 'pomme' }),
  p('poires-1kg', 'Poires', 'fruits', 1, 'kg', 3.9, { swissTypical: true }),
  p('bananes-1kg', 'Bananes', 'fruits', 1, 'kg', 2.6, { kw: 'banane' }),
  p('bananes-bio-1kg', 'Bananes bio', 'fruits', 1, 'kg', 3.5, { organic: true, kw: 'banane' }),
  p('oranges-2kg', 'Oranges (filet)', 'fruits', 2, 'kg', 4.5, { kw: 'orange, agrumes' }),
  p('citrons-500g', 'Citrons', 'fruits', 500, 'g', 2.2, { kw: 'citron, agrumes' }),
  p('mandarines-1kg', 'Mandarines / clémentines', 'fruits', 1, 'kg', 3.8, { kw: 'clementine, agrumes' }),
  p('raisin-blanc-500g', 'Raisin blanc', 'fruits', 500, 'g', 3.5),
  p('kiwis-6', 'Kiwis', 'fruits', 6, 'pce', 2.9, { kw: 'kiwi' }),
  p('avocats-2', 'Avocats prêts à manger', 'fruits', 2, 'pce', 3.2, { kw: 'avocat' }),
  p('ananas-1', 'Ananas', 'fruits', 1, 'pce', 3.5),

  // --- Légumes --------------------------------------------------------------------------
  p('carottes-1kg', 'Carottes', 'legumes', 1, 'kg', 2.2, { swissTypical: true, kw: 'carotte' }),
  p('carottes-bio-1kg', 'Carottes bio', 'legumes', 1, 'kg', 3.2, { organic: true, swissTypical: true, kw: 'carotte' }),
  p('oignons-1kg', 'Oignons jaunes', 'legumes', 1, 'kg', 2.1, { swissTypical: true, kw: 'oignon' }),
  p('ail-3', 'Ail (3 têtes)', 'legumes', 3, 'pce', 1.9),
  p('tomates-grappe-500g', 'Tomates en grappe', 'legumes', 500, 'g', 3.2, { kw: 'tomate' }),
  p('tomates-cerises-250g', 'Tomates cerises', 'legumes', 250, 'g', 2.9, { kw: 'tomate' }),
  p('concombre-1', 'Concombre', 'legumes', 1, 'pce', 1.3),
  p('salade-iceberg-1', 'Salade iceberg', 'legumes', 1, 'pce', 1.8, { swissTypical: true, kw: 'laitue' }),
  p('mesclun-150g', 'Salade mêlée prête à l’emploi', 'legumes', 150, 'g', 2.95, { kw: 'mesclun, salade' }),
  p('poivrons-500g', 'Poivrons mélangés', 'legumes', 500, 'g', 3.5, { kw: 'poivron' }),
  p('courgettes-500g', 'Courgettes', 'legumes', 500, 'g', 2.4, { kw: 'courgette' }),
  p('brocoli-500g', 'Brocoli', 'legumes', 500, 'g', 2.9),
  p('champignons-250g', 'Champignons de Paris', 'legumes', 250, 'g', 2.6, { swissTypical: true, kw: 'champignon' }),
  p('poireaux-500g', 'Poireaux', 'legumes', 500, 'g', 2.5, { swissTypical: true, kw: 'poireau' }),
  p('chou-fleur-1', 'Chou-fleur', 'legumes', 1, 'pce', 3.2),
  p('epinards-frais-250g', 'Épinards frais', 'legumes', 250, 'g', 2.9, { kw: 'epinard' }),

  // --- Pommes de terre ------------------------------------------------------------------
  p('pdt-fermes-2500g', 'Pommes de terre fermes à la cuisson', 'pommes-de-terre', 2.5, 'kg', 4.5, { swiss: true, kw: 'patates, pdt' }),
  p('pdt-farineuses-2500g', 'Pommes de terre farineuses', 'pommes-de-terre', 2.5, 'kg', 4.5, { swiss: true, kw: 'patates, pdt, puree' }),
  p('pdt-grenailles-1kg', 'Pommes de terre grenailles', 'pommes-de-terre', 1, 'kg', 3.4, { swiss: true, kw: 'patates, pdt' }),
  p('pdt-bio-2kg', 'Pommes de terre bio', 'pommes-de-terre', 2, 'kg', 5.9, { organic: true, swiss: true, kw: 'patates, pdt' }),

  // --- Pâtes, riz et céréales -----------------------------------------------------------
  p('spaghetti-500g', 'Spaghetti', 'pates-riz-cereales', 500, 'g', 1.6, { kw: 'pates' }),
  p('spaghetti-bio-500g', 'Spaghetti bio', 'pates-riz-cereales', 500, 'g', 2.4, { organic: true, kw: 'pates' }),
  p('penne-500g', 'Penne', 'pates-riz-cereales', 500, 'g', 1.6, { kw: 'pates' }),
  p('fusilli-500g', 'Fusilli (torsades)', 'pates-riz-cereales', 500, 'g', 1.6, { kw: 'pates, torsades' }),
  p('cornettes-500g', 'Cornettes', 'pates-riz-cereales', 500, 'g', 1.5, { swissTypical: true, kw: 'pates, hornli' }),
  p('nouilles-oeufs-500g', 'Nouilles aux œufs', 'pates-riz-cereales', 500, 'g', 2.4, { swissTypical: true, kw: 'pates' }),
  p('riz-long-1kg', 'Riz long grain', 'pates-riz-cereales', 1, 'kg', 2.4),
  p('riz-basmati-1kg', 'Riz basmati', 'pates-riz-cereales', 1, 'kg', 3.9),
  p('riz-risotto-1kg', 'Riz pour risotto', 'pates-riz-cereales', 1, 'kg', 3.6, { kw: 'arborio, carnaroli' }),
  p('flocons-avoine-500g', 'Flocons d’avoine', 'pates-riz-cereales', 500, 'g', 1.4, { swissTypical: true, kw: 'avoine' }),
  p('birchermuesli-1kg', 'Birchermüesli', 'pates-riz-cereales', 1, 'kg', 4.5, { swissTypical: true, kw: 'muesli, cereales' }),
  p('corn-flakes-500g', 'Flocons de maïs (corn flakes)', 'pates-riz-cereales', 500, 'g', 3.2, { kw: 'cereales' }),
  p('couscous-500g', 'Couscous moyen', 'pates-riz-cereales', 500, 'g', 1.9, { kw: 'semoule' }),
  p('polenta-500g', 'Polenta', 'pates-riz-cereales', 500, 'g', 1.8, { swissTypical: true, kw: 'mais' }),
  p('lentilles-500g', 'Lentilles vertes', 'pates-riz-cereales', 500, 'g', 2.6, { kw: 'legumineuses' }),
  p('quinoa-500g', 'Quinoa', 'pates-riz-cereales', 500, 'g', 4.5),

  // --- Farine, sucre et sel -------------------------------------------------------------
  p('farine-blanche-1kg', 'Farine blanche', 'farine-sucre-sel', 1, 'kg', 1.7, { swissTypical: true, kw: 'fleur de farine' }),
  p('farine-mi-blanche-1kg', 'Farine mi-blanche', 'farine-sucre-sel', 1, 'kg', 1.9, { swissTypical: true }),
  p('farine-complete-1kg', 'Farine complète', 'farine-sucre-sel', 1, 'kg', 2.2, { swissTypical: true }),
  p('farine-bio-1kg', 'Farine blanche bio', 'farine-sucre-sel', 1, 'kg', 3.2, { organic: true, swissTypical: true }),
  p('sucre-cristal-1kg', 'Sucre cristallisé', 'farine-sucre-sel', 1, 'kg', 1.4, { swissTypical: true, kw: 'sucre blanc' }),
  p('sucre-glace-500g', 'Sucre glace', 'farine-sucre-sel', 500, 'g', 1.6),
  p('sucre-canne-1kg', 'Sucre de canne', 'farine-sucre-sel', 1, 'kg', 2.8),
  p('sel-cuisine-1kg', 'Sel de cuisine iodé', 'farine-sucre-sel', 1, 'kg', 0.95, { swissTypical: true }),
  p('levure-seche-3', 'Levure sèche (3 sachets)', 'farine-sucre-sel', 3, 'pce', 1.2, { kw: 'boulangerie' }),
  p('poudre-lever-5', 'Poudre à lever (5 sachets)', 'farine-sucre-sel', 5, 'pce', 1.3, { kw: 'levure chimique' }),
  p('amidon-mais-250g', 'Amidon de maïs', 'farine-sucre-sel', 250, 'g', 2.1, { kw: 'fecule, maizena' }),

  // --- Huiles, vinaigres et condiments --------------------------------------------------
  p('huile-tournesol-1l', 'Huile de tournesol', 'huiles-condiments', 1, 'l', 3.2),
  p('huile-colza-1l', 'Huile de colza', 'huiles-condiments', 1, 'l', 3.6, { swissTypical: true }),
  p('huile-olive-1l', 'Huile d’olive extra vierge', 'huiles-condiments', 1, 'l', 9.9, { kw: 'olive' }),
  p('huile-olive-500ml', 'Huile d’olive extra vierge (petite bouteille)', 'huiles-condiments', 500, 'ml', 5.9, { kw: 'olive' }),
  p('vinaigre-vin-1l', 'Vinaigre de vin', 'huiles-condiments', 1, 'l', 1.8),
  p('vinaigre-balsamique-500ml', 'Vinaigre balsamique', 'huiles-condiments', 500, 'ml', 3.2),
  p('mayonnaise-265g', 'Mayonnaise', 'huiles-condiments', 265, 'g', 2.6),
  p('moutarde-200g', 'Moutarde mi-forte', 'huiles-condiments', 200, 'g', 1.9, { swissTypical: true }),
  p('ketchup-500g', 'Ketchup', 'huiles-condiments', 500, 'g', 2.5),
  p('bouillon-legumes-250g', 'Bouillon de légumes en poudre', 'huiles-condiments', 250, 'g', 4.5, { kw: 'bouillon' }),
  p('sauce-soja-250ml', 'Sauce soja', 'huiles-condiments', 250, 'ml', 2.9),
  p('poivre-noir-50g', 'Poivre noir moulu', 'huiles-condiments', 50, 'g', 2.5, { kw: 'epices' }),
  p('assaisonnement-90g', 'Assaisonnement universel', 'huiles-condiments', 90, 'g', 2.95, { kw: 'aromate, epices' }),

  // --- Lait, beurre et fromages ---------------------------------------------------------
  p('lait-entier-uht-1l', 'Lait entier UHT', 'produits-laitiers', 1, 'l', 1.5, { swiss: true, kw: 'lait' }),
  p('lait-demi-uht-1l', 'Lait demi-écrémé UHT', 'produits-laitiers', 1, 'l', 1.45, { swiss: true, kw: 'lait drink' }),
  p('lait-entier-past-1l', 'Lait entier pasteurisé', 'produits-laitiers', 1, 'l', 1.7, { swiss: true, kw: 'lait frais' }),
  p('lait-bio-1l', 'Lait entier bio', 'produits-laitiers', 1, 'l', 1.95, { organic: true, swiss: true, kw: 'lait' }),
  p('lait-sans-lactose-1l', 'Lait sans lactose', 'produits-laitiers', 1, 'l', 2.2, { swiss: true, labels: ['lactose-free'], kw: 'lait' }),
  p('boisson-avoine-1l', 'Boisson à l’avoine', 'produits-laitiers', 1, 'l', 2.5, { kw: 'lait vegetal, avoine, vegan' }),
  p('beurre-cuisine-250g', 'Beurre de cuisine', 'produits-laitiers', 250, 'g', 3.5, { swiss: true, kw: 'beurre' }),
  p('beurre-choix-200g', 'Beurre de choix', 'produits-laitiers', 200, 'g', 3.6, { swiss: true, kw: 'beurre de table' }),
  p('creme-entiere-250ml', 'Crème entière', 'produits-laitiers', 250, 'ml', 2.4, { swiss: true, kw: 'creme' }),
  p('creme-cafe-10', 'Crème à café (portions)', 'produits-laitiers', 10, 'pce', 1.5, { swissTypical: true, kw: 'creme' }),
  p('yogourt-nature-180g', 'Yogourt nature', 'produits-laitiers', 180, 'g', 0.55, { swiss: true, kw: 'yaourt, yoghourt' }),
  p('yogourt-fraise-180g', 'Yogourt à la fraise', 'produits-laitiers', 180, 'g', 0.6, { swiss: true, kw: 'yaourt, yoghourt' }),
  p('sere-maigre-500g', 'Séré maigre', 'produits-laitiers', 500, 'g', 2.4, { swiss: true, kw: 'quark' }),
  p('gruyere-aop-250g', 'Gruyère AOP', 'produits-laitiers', 250, 'g', 5.5, { swiss: true, labels: ['aop'], kw: 'fromage' }),
  p('emmentaler-aop-250g', 'Emmentaler AOP', 'produits-laitiers', 250, 'g', 4.9, { swiss: true, labels: ['aop'], kw: 'fromage, emmental' }),
  p('mozzarella-150g', 'Mozzarella', 'produits-laitiers', 150, 'g', 1.6, { kw: 'fromage' }),
  p('fromage-rape-120g', 'Fromage râpé', 'produits-laitiers', 120, 'g', 2.7, { swissTypical: true, kw: 'fromage' }),
  p('raclette-400g', 'Fromage à raclette en tranches', 'produits-laitiers', 400, 'g', 7.9, { swiss: true, kw: 'fromage' }),
  p('mascarpone-250g', 'Mascarpone', 'produits-laitiers', 250, 'g', 2.9),

  // --- Œufs ----------------------------------------------------------------------------
  p('oeufs-sol-6', 'Œufs suisses d’élevage au sol', 'oeufs', 6, 'pce', 3.4, { swiss: true, kw: 'oeuf' }),
  p('oeufs-sol-10', 'Œufs suisses d’élevage au sol (10)', 'oeufs', 10, 'pce', 5.4, { swiss: true, kw: 'oeuf' }),
  p('oeufs-plein-air-6', 'Œufs suisses de plein air', 'oeufs', 6, 'pce', 3.9, { swiss: true, kw: 'oeuf, libre parcours' }),
  p('oeufs-bio-6', 'Œufs bio', 'oeufs', 6, 'pce', 5.2, { organic: true, swiss: true, kw: 'oeuf' }),
  p('oeufs-importes-10', 'Œufs d’élevage au sol, importés (10)', 'oeufs', 10, 'pce', 3.6, { kw: 'oeuf' }),

  // --- Pain -----------------------------------------------------------------------------
  p('pain-mi-blanc-500g', 'Pain mi-blanc', 'pain', 500, 'g', 2.4, { swissTypical: true }),
  p('pain-complet-500g', 'Pain complet', 'pain', 500, 'g', 2.8, { swissTypical: true }),
  p('pain-toast-500g', 'Pain toast', 'pain', 500, 'g', 2.2),
  p('tresse-500g', 'Tresse au beurre', 'pain', 500, 'g', 3.6, { swissTypical: true, kw: 'zopf' }),
  p('croissants-4', 'Croissants au beurre', 'pain', 4, 'pce', 3.2, { kw: 'viennoiserie' }),
  p('baguette-250g', 'Baguette', 'pain', 250, 'g', 1.6),

  // --- Viande et poisson ----------------------------------------------------------------
  p('poulet-poitrine-500g', 'Poitrine de poulet suisse', 'viande-poisson', 500, 'g', 12.5, { swiss: true, kw: 'volaille, filet' }),
  p('boeuf-hache-500g', 'Viande hachée de bœuf', 'viande-poisson', 500, 'g', 9.9, { swissTypical: true, kw: 'hache, boeuf' }),
  p('porc-cotelettes-500g', 'Côtelettes de porc', 'viande-poisson', 500, 'g', 9.5, { swissTypical: true, kw: 'porc' }),
  p('saucisses-veau-260g', 'Saucisses de veau à rôtir (2 pièces)', 'viande-poisson', 260, 'g', 5.6, { swissTypical: true, kw: 'saucisse' }),
  p('cervelas-200g', 'Cervelas (2 pièces)', 'viande-poisson', 200, 'g', 2.6, { swissTypical: true, kw: 'saucisse' }),
  p('jambon-cuit-150g', 'Jambon cuit en tranches', 'viande-poisson', 150, 'g', 3.9, { swissTypical: true, kw: 'charcuterie' }),
  p('saumon-fume-100g', 'Saumon fumé', 'viande-poisson', 100, 'g', 4.9, { kw: 'poisson' }),
  p('tofu-250g', 'Tofu nature bio', 'viande-poisson', 250, 'g', 2.8, { organic: true, kw: 'vegetarien, vegan' }),

  // --- Conserves ------------------------------------------------------------------------
  p('tomates-pelees-400g', 'Tomates pelées', 'conserves', 400, 'g', 1.1, { kw: 'tomate' }),
  p('tomates-concassees-400g', 'Tomates concassées', 'conserves', 400, 'g', 1.1, { kw: 'tomate, pulpe' }),
  p('concentre-tomates-200g', 'Concentré de tomates', 'conserves', 200, 'g', 1.2, { kw: 'puree de tomates' }),
  p('sauce-tomate-400g', 'Sauce tomate au basilic', 'conserves', 400, 'g', 2.4, { kw: 'sauce pates' }),
  p('pois-chiches-400g', 'Pois chiches', 'conserves', 400, 'g', 1.3, { kw: 'legumineuses' }),
  p('haricots-rouges-400g', 'Haricots rouges', 'conserves', 400, 'g', 1.3, { kw: 'legumineuses' }),
  p('mais-340g', 'Maïs doux', 'conserves', 340, 'g', 1.6),
  p('thon-huile-240g', 'Thon à l’huile (3 boîtes)', 'conserves', 240, 'g', 4.5, { kw: 'poisson' }),
  p('raviolis-870g', 'Raviolis à la sauce tomate', 'conserves', 870, 'g', 3.5),
  p('lait-coco-400ml', 'Lait de coco', 'conserves', 400, 'ml', 1.8, { kw: 'coco' }),

  // --- Petit-déjeuner, café et douceurs -------------------------------------------------
  p('confiture-fraises-500g', 'Confiture de fraises', 'petit-dejeuner', 500, 'g', 2.9, { kw: 'confiture' }),
  p('miel-fleurs-500g', 'Miel de fleurs', 'petit-dejeuner', 500, 'g', 6.9, { kw: 'miel' }),
  p('pate-tartiner-400g', 'Pâte à tartiner aux noisettes', 'petit-dejeuner', 400, 'g', 3.5, { kw: 'chocolat, noisette' }),
  p('nutella-450g', 'Nutella', 'petit-dejeuner', 450, 'g', 4.5, { brand: 'Nutella', kw: 'pate a tartiner' }),
  p('chocolat-lait-100g', 'Chocolat au lait', 'petit-dejeuner', 100, 'g', 1.5, { swissTypical: true, kw: 'tablette' }),
  p('chocolat-noir-100g', 'Chocolat noir', 'petit-dejeuner', 100, 'g', 1.6, { swissTypical: true, kw: 'tablette' }),
  p('cafe-grains-1kg', 'Café en grains', 'petit-dejeuner', 1, 'kg', 12.9, { kw: 'cafe' }),
  p('cafe-moulu-500g', 'Café moulu', 'petit-dejeuner', 500, 'g', 6.9, { kw: 'cafe' }),
  p('capsules-cafe-10', 'Capsules de café compatibles (10)', 'petit-dejeuner', 10, 'pce', 3.5, { kw: 'cafe, nespresso' }),
  p('the-noir-25', 'Thé noir (25 sachets)', 'petit-dejeuner', 25, 'pce', 2.2, { kw: 'the' }),
  p('infusion-menthe-20', 'Infusion à la menthe (20 sachets)', 'petit-dejeuner', 20, 'pce', 2.2, { kw: 'tisane, the' }),
  p('cacao-poudre-500g', 'Boisson au cacao en poudre', 'petit-dejeuner', 500, 'g', 4.5, { kw: 'chocolat en poudre' }),
  p('petits-beurre-200g', 'Petits-beurre', 'petit-dejeuner', 200, 'g', 1.6, { kw: 'biscuits' }),
  p('chips-nature-175g', 'Chips nature', 'petit-dejeuner', 175, 'g', 2.6, { kw: 'aperitif' }),

  // --- Boissons -------------------------------------------------------------------------
  p('eau-plate-6x1500ml', 'Eau minérale plate (6 × 1,5 l)', 'boissons', 9, 'l', 3.3, { swissTypical: true, kw: 'eau' }),
  p('eau-gazeuse-6x1500ml', 'Eau minérale gazeuse (6 × 1,5 l)', 'boissons', 9, 'l', 3.6, { swissTypical: true, kw: 'eau petillante' }),
  p('jus-orange-1l', 'Jus d’orange', 'boissons', 1, 'l', 2.2, { kw: 'jus' }),
  p('jus-pomme-1l', 'Jus de pomme', 'boissons', 1, 'l', 1.9, { swissTypical: true, kw: 'jus' }),
  p('the-froid-1500ml', 'Thé froid au citron', 'boissons', 1.5, 'l', 1.6, { swissTypical: true, kw: 'ice tea' }),
  p('cola-1500ml', 'Boisson au cola', 'boissons', 1.5, 'l', 1.9, { kw: 'soda' }),
  p('coca-cola-1500ml', 'Coca-Cola', 'boissons', 1.5, 'l', 2.6, { brand: 'Coca-Cola', kw: 'cola, soda' }),
  p('sirop-framboise-1l', 'Sirop de framboise', 'boissons', 1, 'l', 3.2, { swissTypical: true, kw: 'sirop' }),

  // --- Surgelés -------------------------------------------------------------------------
  p('epinards-surg-600g', 'Épinards hachés surgelés', 'surgeles', 600, 'g', 2.6, { kw: 'epinard' }),
  p('petits-pois-surg-1kg', 'Petits pois surgelés', 'surgeles', 1, 'kg', 3.9),
  p('legumes-surg-1kg', 'Mélange de légumes surgelés', 'surgeles', 1, 'kg', 3.6),
  p('frites-four-1kg', 'Frites au four surgelées', 'surgeles', 1, 'kg', 3.2, { kw: 'pommes frites' }),
  p('pizza-margherita-350g', 'Pizza margherita surgelée', 'surgeles', 350, 'g', 3.5, { kw: 'pizza' }),
  p('glace-vanille-1l', 'Glace à la vanille', 'surgeles', 1, 'l', 4.5, { swissTypical: true, kw: 'creme glacee' }),
  p('colin-surg-400g', 'Filets de colin surgelés', 'surgeles', 400, 'g', 5.9, { kw: 'poisson, lieu' }),

  // --- Entretien et ménage --------------------------------------------------------------
  p('liquide-vaisselle-750ml', 'Liquide vaisselle', 'entretien', 750, 'ml', 2.1, { kw: 'produit vaisselle' }),
  p('tablettes-lave-vaisselle-40', 'Tablettes pour lave-vaisselle (40)', 'entretien', 40, 'pce', 8.9, { kw: 'tabs' }),
  p('lessive-liquide-40', 'Lessive liquide couleurs (40 lessives)', 'entretien', 40, 'lavages', 12.9, { kw: 'linge' }),
  p('lessive-poudre-40', 'Lessive en poudre universelle (40 lessives)', 'entretien', 40, 'lavages', 11.9, { kw: 'linge' }),
  p('capsules-lessive-30', 'Capsules de lessive (30)', 'entretien', 30, 'pce', 9.9, { kw: 'linge, pods' }),
  p('adoucissant-1500ml', 'Adoucissant', 'entretien', 1.5, 'l', 3.9, { kw: 'linge' }),
  p('nettoyant-multi-1l', 'Nettoyant multi-usages', 'entretien', 1, 'l', 2.9, { kw: 'nettoyant' }),
  p('nettoyant-wc-750ml', 'Nettoyant WC', 'entretien', 750, 'ml', 2.5, { kw: 'toilettes' }),
  p('detartrant-1l', 'Détartrant liquide', 'entretien', 1, 'l', 3.9, { kw: 'calcaire, vinaigre' }),
  p('nettoyant-vitres-500ml', 'Nettoyant vitres', 'entretien', 500, 'ml', 2.6, { kw: 'fenetres' }),
  p('nettoyant-sols-1l', 'Nettoyant pour sols', 'entretien', 1, 'l', 3.2),
  p('eponges-10', 'Éponges grattantes (10)', 'entretien', 10, 'pce', 2.2, { kw: 'eponge' }),
  p('lavettes-microfibre-3', 'Lavettes microfibre (3)', 'entretien', 3, 'pce', 3.5, { kw: 'chiffons' }),
  p('sacs-poubelle-35l-20', 'Sacs à ordures 35 l, non taxés (20)', 'entretien', 20, 'pce', 2.9, { kw: 'sacs poubelle, ordures' }),
  p('papier-alu-30m', 'Papier aluminium (rouleau de 30 m)', 'entretien', 1, 'pce', 3.2, { kw: 'aluminium' }),
  p('film-alimentaire-50m', 'Film alimentaire (rouleau de 50 m)', 'entretien', 1, 'pce', 2.5, { kw: 'cellophane' }),
  p('papier-cuisson-10m', 'Papier cuisson (rouleau de 10 m)', 'entretien', 1, 'pce', 2.4, { kw: 'papier sulfurise' }),
  p('sacs-congelation-30', 'Sacs de congélation 3 l (30)', 'entretien', 30, 'pce', 1.9, { kw: 'sachets' }),
  p('gants-menage-m', 'Gants de ménage (taille M)', 'entretien', 1, 'pce', 1.9, { kw: 'gants' }),

  // --- Hygiène --------------------------------------------------------------------------
  p('savon-liquide-300ml', 'Savon liquide pour les mains', 'hygiene', 300, 'ml', 1.9, { kw: 'savon' }),
  p('savon-recharge-500ml', 'Savon liquide, recharge', 'hygiene', 500, 'ml', 2.5, { kw: 'savon' }),
  p('gel-douche-250ml', 'Gel douche', 'hygiene', 250, 'ml', 2.2, { kw: 'douche' }),
  p('shampoing-250ml', 'Shampoing cheveux normaux', 'hygiene', 250, 'ml', 2.6, { kw: 'shampooing, cheveux' }),
  p('apres-shampoing-200ml', 'Après-shampoing', 'hygiene', 200, 'ml', 2.6, { kw: 'baume, cheveux' }),
  p('dentifrice-75ml', 'Dentifrice au fluor', 'hygiene', 75, 'ml', 1.9, { kw: 'dents' }),
  p('brosses-dents-2', 'Brosses à dents (2)', 'hygiene', 2, 'pce', 2.9, { kw: 'dents' }),
  p('deodorant-50ml', 'Déodorant roll-on', 'hygiene', 50, 'ml', 2.4, { kw: 'deo' }),
  p('rasoirs-5', 'Rasoirs jetables (5)', 'hygiene', 5, 'pce', 3.5, { kw: 'rasage' }),
  p('coton-tiges-200', 'Cotons-tiges (200)', 'hygiene', 200, 'pce', 1.5, { kw: 'coton' }),
  p('disques-demaquillants-80', 'Disques démaquillants (80)', 'hygiene', 80, 'pce', 1.6, { kw: 'coton' }),
  p('serviettes-hygieniques-16', 'Serviettes hygiéniques (16)', 'hygiene', 16, 'pce', 2.9, { kw: 'protection' }),
  p('tampons-32', 'Tampons normal (32)', 'hygiene', 32, 'pce', 3.9, { kw: 'protection' }),
  p('couches-t4-44', 'Couches taille 4, 7–18 kg (44)', 'hygiene', 44, 'pce', 14.9, { kw: 'bebe, langes' }),
  p('lingettes-bebe-64', 'Lingettes pour bébé (64)', 'hygiene', 64, 'pce', 1.9, { kw: 'bebe' }),
  p('creme-mains-100ml', 'Crème pour les mains', 'hygiene', 100, 'ml', 2.9),

  // --- Papier et mouchoirs --------------------------------------------------------------
  p('papier-toilette-10', 'Papier toilette 3 plis (10 rouleaux)', 'papier', 10, 'rouleaux', 5.5, { kw: 'papier hygienique, wc' }),
  p('papier-toilette-24', 'Papier toilette 3 plis (24 rouleaux)', 'papier', 24, 'rouleaux', 11.9, { kw: 'papier hygienique, wc' }),
  p('papier-toilette-recycle-10', 'Papier toilette recyclé (10 rouleaux)', 'papier', 10, 'rouleaux', 4.5, { labels: ['recycled'], kw: 'papier hygienique, wc' }),
  p('essuie-tout-4', 'Essuie-tout (4 rouleaux)', 'papier', 4, 'rouleaux', 4.2, { kw: 'papier menage, sopalin' }),
  p('mouchoirs-boite-100', 'Mouchoirs en boîte (100)', 'papier', 100, 'pce', 1.9, { kw: 'kleenex' }),
  p('mouchoirs-poche-15', 'Mouchoirs de poche (15 paquets)', 'papier', 15, 'pce', 2.5, { kw: 'kleenex, tempo' }),
  p('serviettes-table-50', 'Serviettes de table en papier (50)', 'papier', 50, 'pce', 2.2),

  // --- Piles et articles ménagers -------------------------------------------------------
  p('piles-aa-4', 'Piles alcalines AA (4)', 'maison', 4, 'pce', 3.9, { kw: 'batteries, lr6' }),
  p('piles-aa-8', 'Piles alcalines AA (8)', 'maison', 8, 'pce', 6.9, { kw: 'batteries, lr6' }),
  p('piles-aaa-4', 'Piles alcalines AAA (4)', 'maison', 4, 'pce', 3.9, { kw: 'batteries, lr03' }),
  p('ampoule-led-e27', 'Ampoule LED E27 (équivalent 60 W)', 'maison', 1, 'pce', 3.9, { kw: 'lampe' }),
  p('bougies-chauffe-plat-50', 'Bougies chauffe-plat (50)', 'maison', 50, 'pce', 3.9, { kw: 'bougie' }),
  p('allumettes-10', 'Allumettes (10 boîtes)', 'maison', 10, 'pce', 1.5),
  p('filtres-cafe-80', 'Filtres à café n° 4 (80)', 'maison', 80, 'pce', 1.9, { kw: 'cafe' }),
  p('croquettes-chat-2kg', 'Croquettes pour chat adulte', 'maison', 2, 'kg', 7.9, { kw: 'animaux, chat' }),
  p('litiere-chat-10l', 'Litière pour chat', 'maison', 10, 'l', 5.9, { kw: 'animaux, chat' }),
  // --- Extension phase 3 : besoins de base supplémentaires -------------------------------
  p('courge-butternut-1', 'Courge butternut', 'legumes', 1, 'piece', 2.9, { swissTypical: true, kw: 'courge' }),
  p('rosti-500g', 'Rösti prêt à cuire', 'pommes-de-terre', 500, 'g', 3.2, { swissTypical: true, kw: 'roesti, rosti' }),
  p('pates-completes-500g', 'Pâtes complètes', 'pates-riz-cereales', 500, 'g', 1.9, { kw: 'pates, ble complet' }),
  p('lasagne-500g', 'Feuilles de lasagne', 'pates-riz-cereales', 500, 'g', 2.2, { kw: 'lasagnes, pates' }),
  p('gnocchi-500g', 'Gnocchi de pommes de terre', 'pates-riz-cereales', 500, 'g', 2.6),
  p('tortellini-250g', 'Tortellini frais', 'pates-riz-cereales', 250, 'g', 3.9, { kw: 'pates fraiches' }),
  p('riz-complet-1kg', 'Riz complet', 'pates-riz-cereales', 1, 'kg', 2.9, { kw: 'riz' }),
  p('boulgour-500g', 'Boulgour', 'pates-riz-cereales', 500, 'g', 2.5, { kw: 'bulgur' }),
  p('muesli-croustillant-500g', 'Muesli croustillant', 'pates-riz-cereales', 500, 'g', 3.9, { kw: 'muesli, crunchy' }),
  p('sucre-morceaux-1kg', 'Sucre en morceaux', 'farine-sucre-sel', 1, 'kg', 2.2, { kw: 'sucre' }),
  p('vinaigre-pomme-500ml', 'Vinaigre de pomme', 'huiles-condiments', 500, 'ml', 1.9, { kw: 'vinaigre' }),
  p('pesto-190g', 'Pesto alla genovese', 'huiles-condiments', 190, 'g', 3.5, { kw: 'pesto, basilic' }),
  p('cornichons-190g', 'Cornichons', 'huiles-condiments', 190, 'g', 2.2),
  p('paprika-poudre-50g', 'Paprika doux en poudre', 'huiles-condiments', 50, 'g', 1.9, { kw: 'epices, paprika' }),
  p('fromage-frais-200g', 'Fromage frais à tartiner', 'produits-laitiers', 200, 'g', 2.9, { swissTypical: true, kw: 'fromage frais, cottage' }),
  p('creme-acidulee-180g', 'Demi-crème acidulée', 'produits-laitiers', 180, 'g', 1.9, { swissTypical: true, kw: 'creme acidulee, sauerrahm' }),
  p('yogourt-grec-500g', 'Yogourt à la grecque nature', 'produits-laitiers', 500, 'g', 2.9, { kw: 'yogourt, yaourt grec' }),
  p('feta-200g', 'Feta', 'produits-laitiers', 200, 'g', 3.2, { kw: 'fromage de brebis' }),
  p('fondue-800g', 'Fondue moitié-moitié prête à l’emploi', 'produits-laitiers', 800, 'g', 12.9, { swissTypical: true, kw: 'fondue, fromage' }),
  p('pain-seigle-500g', 'Pain de seigle', 'pain', 500, 'g', 3.2, { swissTypical: true, kw: 'pain' }),
  p('tortillas-320g', 'Tortillas de blé', 'pain', 320, 'g', 2.5, { kw: 'wraps' }),
  p('lardons-150g', 'Lardons', 'viande-poisson', 150, 'g', 3.2, { swissTypical: true, kw: 'lard, speck' }),
  p('salami-100g', 'Salami en tranches', 'viande-poisson', 100, 'g', 3.5, { kw: 'charcuterie' }),
  p('jambon-cru-100g', 'Jambon cru en tranches', 'viande-poisson', 100, 'g', 4.5, { kw: 'charcuterie, prosciutto' }),
  p('saucisses-vienne-200g', 'Saucisses de Vienne', 'viande-poisson', 200, 'g', 3.9, { swissTypical: true, kw: 'wienerli, saucisses' }),
  p('saumon-frais-250g', 'Filet de saumon frais', 'viande-poisson', 250, 'g', 7.5, { kw: 'poisson, saumon' }),
  p('compote-pommes-700g', 'Compote de pommes', 'conserves', 700, 'g', 2.2, { kw: 'puree de pommes' }),
  p('cacahuetes-200g', 'Cacahuètes grillées salées', 'petit-dejeuner', 200, 'g', 2.5, { kw: 'arachides, apero' }),
  p('noix-melangees-200g', 'Mélange de noix', 'petit-dejeuner', 200, 'g', 4.5, { kw: 'fruits a coque' }),
  p('amandes-200g', 'Amandes', 'petit-dejeuner', 200, 'g', 3.9, { kw: 'fruits a coque' }),
  p('raisins-secs-500g', 'Raisins secs', 'petit-dejeuner', 500, 'g', 3.5, { kw: 'fruits secs' }),
  p('chips-paprika-175g', 'Chips au paprika', 'petit-dejeuner', 175, 'g', 2.9, { kw: 'chips' }),
  p('the-vert-20', 'Thé vert (20 sachets)', 'petit-dejeuner', 20, 'piece', 2.2, { kw: 'the' }),
  p('jus-multifruits-1l', 'Jus multivitaminé', 'boissons', 1, 'l', 1.9, { kw: 'jus de fruits, ace' }),
  p('biere-6x500ml', 'Bière blonde (6 × 50 cl)', 'boissons', 3, 'l', 7.9, { kw: 'biere, lager' }),
  p('poisson-pane-450g', 'Bâtonnets de poisson panés surgelés', 'surgeles', 450, 'g', 4.5, { kw: 'fischstaebli, poisson' }),
  p('haricots-verts-surg-750g', 'Haricots verts surgelés', 'surgeles', 750, 'g', 3.2, { kw: 'haricots' }),
  p('bain-bouche-500ml', 'Bain de bouche', 'hygiene', 500, 'ml', 3.9, { kw: 'dentaire' }),
  p('patee-chat-400g', 'Nourriture humide pour chat (4 × 100 g)', 'maison', 400, 'g', 2.5, { kw: 'chat, patee' }),
  p('croquettes-chien-3kg', 'Croquettes pour chien adulte', 'maison', 3, 'kg', 9.9, { kw: 'chien' }),
];

/**
 * Priorités du catalogue des besoins de base :
 * - P1 : **noyau de 50 aliments de base** (plan sans dépenses, docs/PLAN_SANS_DEPENSES.md) — fruits,
 *   légumes, pommes de terre, farine, sucre, sel, huiles, riz, pâtes, lait, œufs, beurre et autres
 *   aliments courants ; suivis dans le jeu de validation (`data/validation/essentials.json`) ;
 * - P3 : achats occasionnels ou non alimentaires secondaires ;
 * - P2 : tous les autres achats courants (dont hygiène et entretien, hors du noyau).
 */
export const P1_ESSENTIALS = [
  // Fruits (5)
  'bananes-1kg', 'pommes-gala-1kg', 'poires-1kg', 'oranges-2kg', 'citrons-500g',
  // Légumes (7)
  'carottes-1kg', 'oignons-1kg', 'tomates-grappe-500g', 'concombre-1', 'poivrons-500g', 'courgettes-500g', 'salade-iceberg-1',
  // Pommes de terre (2)
  'pdt-fermes-2500g', 'pdt-farineuses-2500g',
  // Farine, sucre, sel (4)
  'farine-blanche-1kg', 'farine-mi-blanche-1kg', 'sucre-cristal-1kg', 'sel-cuisine-1kg',
  // Huiles et vinaigre (4)
  'huile-tournesol-1l', 'huile-colza-1l', 'huile-olive-1l', 'vinaigre-vin-1l',
  // Riz, pâtes, céréales, légumineuses (6)
  'riz-long-1kg', 'spaghetti-500g', 'penne-500g', 'flocons-avoine-500g', 'polenta-500g', 'lentilles-500g',
  // Lait et produits laitiers (10)
  'lait-entier-uht-1l', 'lait-demi-uht-1l', 'beurre-cuisine-250g', 'beurre-choix-200g', 'creme-entiere-250ml',
  'yogourt-nature-180g', 'sere-maigre-500g', 'gruyere-aop-250g', 'emmentaler-aop-250g', 'mozzarella-150g',
  // Œufs (2)
  'oeufs-sol-6', 'oeufs-plein-air-6',
  // Pain (2)
  'pain-mi-blanc-500g', 'pain-complet-500g',
  // Viande et poisson (4)
  'poulet-poitrine-500g', 'boeuf-hache-500g', 'jambon-cuit-150g', 'thon-huile-240g',
  // Conserves (2)
  'tomates-concassees-400g', 'pois-chiches-400g',
  // Autres aliments courants (2)
  'confiture-fraises-500g', 'cafe-moulu-500g',
] as const;

const P3_OCCASIONAL = new Set([
  'ananas-1', 'avocats-2', 'kiwis-6', 'raisin-blanc-500g', 'mesclun-150g', 'epinards-frais-250g', 'quinoa-500g',
  'couscous-500g', 'birchermuesli-1kg', 'sucre-canne-1kg', 'sucre-glace-500g', 'amidon-mais-250g',
  'levure-seche-3', 'poudre-lever-5', 'vinaigre-balsamique-500ml', 'sauce-soja-250ml', 'mascarpone-250g', 'raclette-400g',
  'oeufs-importes-10', 'tresse-500g', 'croissants-4', 'saumon-fume-100g', 'lait-coco-400ml', 'raviolis-870g',
  'capsules-cafe-10', 'infusion-menthe-20', 'cacao-poudre-500g', 'sirop-framboise-1l', 'coca-cola-1500ml', 'glace-vanille-1l',
  'pizza-margherita-350g', 'colin-surg-400g', 'detartrant-1l', 'nettoyant-vitres-500ml', 'lavettes-microfibre-3',
  'papier-alu-30m', 'film-alimentaire-50m', 'papier-cuisson-10m', 'sacs-congelation-30', 'gants-menage-m',
  'apres-shampoing-200ml', 'rasoirs-5', 'coton-tiges-200', 'disques-demaquillants-80', 'couches-t4-44', 'lingettes-bebe-64',
  'creme-mains-100ml', 'serviettes-table-50', 'piles-aa-8', 'piles-aaa-4', 'ampoule-led-e27', 'bougies-chauffe-plat-50',
  'allumettes-10', 'filtres-cafe-80', 'croquettes-chat-2kg', 'litiere-chat-10l', 'fondue-800g', 'tortellini-250g',
  'jambon-cru-100g', 'saumon-frais-250g', 'noix-melangees-200g', 'amandes-200g', 'biere-6x500ml', 'bain-bouche-500ml',
  'patee-chat-400g', 'croquettes-chien-3kg', 'paprika-poudre-50g', 'courge-butternut-1',
]);

const P1_SET = new Set<string>(P1_ESSENTIALS);
for (const product of PRODUCTS) {
  product.priority = P1_SET.has(product.slug) ? 'P1' : P3_OCCASIONAL.has(product.slug) ? 'P3' : 'P2';
}

/**
 * Termes de recherche des essentiels (jeu de validation, comparaison avec un fournisseur tiers).
 * L'allemand est la langue principale des désignations des sites suisses alémaniques.
 */
export const ESSENTIAL_QUERIES: Record<(typeof P1_ESSENTIALS)[number], { de: string; fr: string }> = {
  'bananes-1kg': { de: 'Bananen', fr: 'bananes' },
  'pommes-gala-1kg': { de: 'Äpfel Gala', fr: 'pommes gala' },
  'poires-1kg': { de: 'Birnen', fr: 'poires' },
  'oranges-2kg': { de: 'Orangen', fr: 'oranges' },
  'citrons-500g': { de: 'Zitronen', fr: 'citrons' },
  'carottes-1kg': { de: 'Karotten', fr: 'carottes' },
  'oignons-1kg': { de: 'Zwiebeln', fr: 'oignons' },
  'tomates-grappe-500g': { de: 'Rispentomaten', fr: 'tomates grappe' },
  'concombre-1': { de: 'Gurke', fr: 'concombre' },
  'poivrons-500g': { de: 'Peperoni gemischt', fr: 'poivrons' },
  'courgettes-500g': { de: 'Zucchetti', fr: 'courgettes' },
  'salade-iceberg-1': { de: 'Eisbergsalat', fr: 'salade iceberg' },
  'pdt-fermes-2500g': { de: 'Kartoffeln festkochend', fr: 'pommes de terre fermes' },
  'pdt-farineuses-2500g': { de: 'Kartoffeln mehligkochend', fr: 'pommes de terre farineuses' },
  'farine-blanche-1kg': { de: 'Weissmehl', fr: 'farine blanche' },
  'farine-mi-blanche-1kg': { de: 'Halbweissmehl', fr: 'farine mi-blanche' },
  'sucre-cristal-1kg': { de: 'Kristallzucker', fr: 'sucre cristallisé' },
  'sel-cuisine-1kg': { de: 'Speisesalz jodiert', fr: 'sel de cuisine' },
  'huile-tournesol-1l': { de: 'Sonnenblumenöl', fr: 'huile de tournesol' },
  'huile-colza-1l': { de: 'Rapsöl', fr: 'huile de colza' },
  'huile-olive-1l': { de: 'Olivenöl extra vergine', fr: "huile d'olive extra vierge" },
  'vinaigre-vin-1l': { de: 'Weinessig', fr: 'vinaigre de vin' },
  'riz-long-1kg': { de: 'Langkornreis', fr: 'riz long grain' },
  'spaghetti-500g': { de: 'Spaghetti', fr: 'spaghetti' },
  'penne-500g': { de: 'Penne', fr: 'penne' },
  'flocons-avoine-500g': { de: 'Haferflocken', fr: "flocons d'avoine" },
  'polenta-500g': { de: 'Polenta', fr: 'polenta' },
  'lentilles-500g': { de: 'Linsen', fr: 'lentilles' },
  'lait-entier-uht-1l': { de: 'Vollmilch UHT', fr: 'lait entier UHT' },
  'lait-demi-uht-1l': { de: 'Milch Drink UHT', fr: 'lait drink UHT' },
  'beurre-cuisine-250g': { de: 'Kochbutter', fr: 'beurre de cuisine' },
  'beurre-choix-200g': { de: 'Vorzugsbutter', fr: 'beurre de choix' },
  'creme-entiere-250ml': { de: 'Vollrahm', fr: 'crème entière' },
  'yogourt-nature-180g': { de: 'Joghurt nature', fr: 'yogourt nature' },
  'sere-maigre-500g': { de: 'Magerquark', fr: 'séré maigre' },
  'gruyere-aop-250g': { de: 'Gruyère AOP', fr: 'gruyère AOP' },
  'emmentaler-aop-250g': { de: 'Emmentaler AOP', fr: 'emmentaler AOP' },
  'mozzarella-150g': { de: 'Mozzarella', fr: 'mozzarella' },
  'oeufs-sol-6': { de: 'Eier Bodenhaltung', fr: 'oeufs élevage au sol' },
  'oeufs-plein-air-6': { de: 'Eier Freilandhaltung', fr: 'oeufs plein air' },
  'pain-mi-blanc-500g': { de: 'Halbweissbrot', fr: 'pain mi-blanc' },
  'pain-complet-500g': { de: 'Vollkornbrot', fr: 'pain complet' },
  'poulet-poitrine-500g': { de: 'Pouletbrust', fr: 'poitrine de poulet' },
  'boeuf-hache-500g': { de: 'Rindshackfleisch', fr: 'viande hachée de boeuf' },
  'jambon-cuit-150g': { de: 'Hinterschinken', fr: 'jambon cuit' },
  'thon-huile-240g': { de: 'Thon in Öl', fr: "thon à l'huile" },
  'tomates-concassees-400g': { de: 'Tomaten gehackt', fr: 'tomates concassées' },
  'pois-chiches-400g': { de: 'Kichererbsen', fr: 'pois chiches' },
  'confiture-fraises-500g': { de: 'Erdbeerkonfitüre', fr: 'confiture de fraises' },
  'cafe-moulu-500g': { de: 'Kaffee gemahlen', fr: 'café moulu' },
};
