import { MenuCategory, MenuItem } from '../types';

function parsePrice(v: string | number | undefined | null): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const cleaned = v.replace('€', '').trim().replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

const FALLBACK_DESSERT_CATEGORY: MenuCategory = {
  id: 'desserts',
  title: '11. Desserts',
  description: 'Fait maison.',
  hasSauces: false,
  hasVeggies: false,
  hasSupplements: false,
  items: [
    { name: 'Tiramisu Classique', price: 3.00 },
    { name: 'Tiramisu Spéculoos', price: 3.50 },
    { name: 'Tiramisu Fraise', price: 3.50 },
  ],
};

const RAW_MENU_CATEGORIES: MenuCategory[] = [
  {
    id: 'assiettes',
    title: '1. Assiettes',
    description: 'Servies avec frites, salade et pain. (Pas de suppléments)',
    hasSauces: true,
    hasVeggies: true,
    hasSupplements: false,
    items: [
      { name: 'Assiette Pita', price: 14.50 },
      { name: 'Assiette Poulet mariné', price: 14.50 },
      { name: 'Assiette Kefta', price: 14.50 },
      { name: 'Assiette Merguez', price: 14.40 },
      { name: 'Assiette Brochette bœuf', price: 14.50 },
      { name: 'Assiette Brochette agneau', price: 14.50 },
      { name: 'Assiette Brochette poulet', price: 14.50 },
      { name: 'Assiette Brochette dinde', price: 14.50 },
      { name: 'Assiette Brochette grizzly', price: 13.50 },
      { name: 'Assiette Brochette pilon', price: 14.50 },
      { name: 'Assiette Escalope dinde', price: 14.50 },
      { name: 'Assiette Croquette fromage', price: 14.50 },
      { name: 'Assiette Américain', price: 12.50 },
      { name: 'Assiette Crudités', price: 7.50 },
    ]
  },
  {
    id: 'durums',
    title: '2. Dürüms',
    description: 'Galette roulée.',
    hasSauces: true,
    hasVeggies: true,
    hasSupplements: true,
    items: [
      { name: 'Dürüm Poulet', price: 6.50 },
      { name: 'Dürüm Pita', price: 6.50 },
      { name: 'Dürüm Mixte', price: 6.00 },
      { name: 'Dürüm Hawaï', price: 6.50 },
      { name: 'Dürüm Végétarien', price: 6.00 },
      { name: 'Dürüm Tenders', price: 6.00 },
    ]
  },
  {
    id: 'sandwichs',
    title: '3. Sandwichs',
    description: 'Sandwichs froids et chauds.',
    hasSauces: true,
    hasVeggies: true,
    hasSupplements: true,
    items: [
      { name: 'Sandwich Jambon', price: 4.00 },
      { name: 'Sandwich Fromage', price: 4.00 },
      { name: 'Sandwich Dagobert', price: 4.00 },
      { name: 'Sandwich Américain', price: 4.00 },
      { name: 'Sandwich Thon mayo poulet', price: 6.50 },
    ]
  },
  {
    id: 'hamburgers',
    title: '4. Hamburgers',
    description: 'Prix : Menu Frites / Seul (Pain).',
    hasSauces: true,
    hasVeggies: true,
    hasSupplements: true,
    items: [
      { name: 'Hamburger Poulet', price: 7.00, priceSecondary: 4.50 },
      { name: 'Hamburger Dinde', price: 7.00, priceSecondary: 4.50 },
      { name: 'Fish Burger', price: 6.50, priceSecondary: 4.00 },
      { name: 'Hamburger Bœuf', price: 7.50, priceSecondary: 5.00 },
      { name: 'Hamburger Kefta', price: 7.50, priceSecondary: 5.00 },
      { name: 'Hamburger Géant', price: 8.50, priceSecondary: 6.00 },
      { name: 'Maestro Bacon', price: 8.50, priceSecondary: 6.00 },
    ]
  },
  {
    id: 'mitraillettes',
    title: '5. Mitraillettes',
    description: 'Demi-baguette avec frites dedans.',
    hasSauces: true,
    hasVeggies: true,
    hasSupplements: true,
    items: [
      { name: 'Mitraillette Hamburger', price: 8.00 },
      { name: 'Mitraillette Fricadelle', price: 8.00 },
      { name: 'Mitraillette Boulette', price: 8.00 },
      { name: 'Mitraillette Cervelas', price: 8.00 },
      { name: 'Mitraillette Dinde', price: 8.00 },
      { name: 'Mitraillette Poisson', price: 8.00 },
      { name: 'Mitraillette Végétarien', price: 8.00 },
      { name: 'Mitraillette Mexicanos', price: 8.50 },
      { name: 'Mitraillette Viandelle', price: 8.50 },
      { name: 'Mitraillette Poulycroc', price: 8.50 },
      { name: 'Mitraillette Grizzly', price: 8.50 },
      { name: 'Mitraillette Tenders', price: 9.00 },
      { name: 'Mitraillette Poulet', price: 9.00 },
      { name: 'Mitraillette Pita', price: 9.00 },
      { name: 'Mitraillette Brochette Bœuf', price: 9.00 },
      { name: 'Mitraillette Brochette Poulet', price: 9.00 },
      { name: 'Mitraillette Brochette Dinde', price: 9.00 },
      { name: 'Mitraillette Brochette Poisson', price: 9.00 },
      { name: 'Mitraillette Kefta', price: 9.00 },
      { name: 'Mitraillette Brochette Agneau', price: 9.50 },
      { name: 'Mitraillette Maestro', price: 10.00 },
    ]
  },
  {
    id: 'kapsalons',
    title: '6. Kapsalons',
    description: 'Barquette avec frites, viande et fromage gratiné.',
    hasSauces: true,
    hasVeggies: true,
    hasSupplements: true,
    items: [
      { name: 'Kapsalon Petit', price: 7.00 },
      { name: 'Kapsalon Moyen', price: 8.00 },
      { name: 'Kapsalon Grand', price: 10.00 },
    ]
  },
  {
    id: 'snacks',
    title: '7. Snacks',
    description: 'Snacks frits à la pièce.',
    hasSauces: false,
    hasVeggies: false,
    hasSupplements: true,
    items: [
      { name: 'Nuggets (6 pièces)', price: 4.50 },
      { name: 'Fricadelle', price: 3.00 },
      { name: 'Mexicano', price: 4.00 },
      { name: 'Viandelle', price: 3.50 },
      // Keeping these as they are common supplements not explicitly removed
      { name: 'Loempia (Mini)', price: 4.00 },
      { name: 'Poulycroc', price: 3.50 },
      { name: 'Lucifer', price: 4.00 },
    ]
  },
  {
    id: 'viandes',
    title: '8. Viandes (Seules)',
    description: 'Pièce de viande sur assiette ou dans ravier.',
    hasSauces: false,
    hasVeggies: false,
    hasSupplements: true,
    items: [
      { name: 'Viande Pita', price: 4.00 },
      { name: 'Viande Poulet', price: 4.00 },
      { name: 'Viande Kefta', price: 5.00 },
      { name: 'Brochette bœuf', price: 4.30 },
      { name: 'Brochette agneau', price: 4.30 },
      { name: 'Brochette grizzly', price: 3.80 },
      { name: 'Merguez (2 pcs)', price: 3.80 },
    ]
  },
  {
    id: 'pizzas',
    title: '9. Pizzas',
    description: 'Pizzas maison 33cm. (Pas de suppléments)',
    hasSauces: false,
    hasVeggies: false,
    hasSupplements: false,
    items: [
      { name: 'Pizza Classica (Margherita)', price: 8.50 },
      { name: 'Pizza Parma', price: 10.00 },
      { name: 'Pizza Bologna', price: 11.00 },
      { name: 'Pizza Végétarienne', price: 11.00 },
      { name: 'Pizza Tropicale', price: 11.00 },
      { name: 'Pizza Fondante', price: 11.50 },
      { name: 'Pizza Neptune', price: 11.50 },
      { name: 'Pizza Napolitaine', price: 11.50 },
      { name: 'Pizza Tunisiano', price: 12.00 },
      { name: 'Pizza Quattro Stagioni', price: 12.00 },
      { name: 'Pizza Fermière', price: 12.00 },
      { name: 'Pizza Texane', price: 12.00 },
      { name: 'Pizza Savoyarde', price: 13.00 },
      { name: 'Pizza Norvégienne', price: 13.00 },
      { name: 'Pizza Riviera', price: 13.00 },
      { name: 'Pizza Atlantica', price: 13.50 },
      { name: 'Pizza Mediterranée', price: 13.50 },
    ]
  },
  {
    id: 'boissons',
    title: '10. Boissons',
    description: 'Boissons 50cl.',
    hasSauces: false,
    hasVeggies: false,
    hasSupplements: false,
    items: [
      { name: 'Coca-Cola 50cl', price: 2.50 },
      { name: 'Coca-Cola Zéro 50cl', price: 2.50 },
      { name: 'Fanta 50cl', price: 2.50 },
      { name: 'Ice Tea 50cl', price: 2.50 },
      { name: 'Eau 50cl', price: 1.50 },
      { name: 'Red Bull', price: 3.00 },
    ]
  },
  {
    id: 'desserts',
    title: '11. Desserts',
    description: 'Fait maison.',
    hasSauces: false,
    hasVeggies: false,
    hasSupplements: false,
    items: [
      { name: 'Tiramisu Classique', price: 3.00 },
      { name: 'Tiramisu Spéculoos', price: 3.50 },
      { name: 'Tiramisu Fraise', price: 3.50 },
    ]
  }
];

const sanitizeItem = (item: MenuItem, categoryTitle: string): MenuItem => {
  const price = parsePrice(item.price);
  const priceSecondary = item.priceSecondary !== undefined
    ? parsePrice(item.priceSecondary)
    : undefined;

  const hasInvalidPrimary = price === undefined;
  const hasInvalidSecondary = item.priceSecondary !== undefined && priceSecondary === undefined;
  const hasInvalidPrice = hasInvalidPrimary || hasInvalidSecondary;

  if (import.meta.env.DEV && hasInvalidPrice) {
    console.warn(`[menuData] Prix invalide pour "${item.name}" dans "${categoryTitle}"`, {
      price: item.price,
      priceSecondary: item.priceSecondary,
    });
  }

  return {
    ...item,
    price: price ?? 0,
    priceSecondary,
    unavailable: item.unavailable ?? hasInvalidPrice,
  };
};

const MENU_CATEGORY_SOURCE = RAW_MENU_CATEGORIES.some((category) => category.id === 'desserts')
  ? RAW_MENU_CATEGORIES
  : [...RAW_MENU_CATEGORIES, FALLBACK_DESSERT_CATEGORY];

export const MENU_CATEGORIES: MenuCategory[] = MENU_CATEGORY_SOURCE.map((category) => ({
  ...category,
  items: category.items.map((item) => sanitizeItem(item, category.title)),
}));
