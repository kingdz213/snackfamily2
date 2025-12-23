import { CartItem, MenuCategory, MenuItem } from '../types';

export const MIN_ORDER_EUR = 20;

type CategoryType = 'drink' | 'dessert' | 'snack';

interface CartSignals {
  hasDrink: boolean;
  hasDessert: boolean;
  hasSnack: boolean;
}

interface SuggestionEntry {
  item: MenuItem;
  category: MenuCategory;
  type: CategoryType;
  price: number;
}

const drinkKeywords = ['boisson', 'coca', 'cola', 'fanta', 'sprite', 'ice tea', 'eau', 'water', 'red bull'];
const dessertKeywords = ['dessert', 'tiramisu', 'spéculoos', 'speculoos', 'fraise', 'sucré', 'sweet'];
const snackKeywords = ['snack', 'nugget', 'fricadelle', 'mexicano', 'viandelle', 'poulycroc', 'lucifer', 'loempia'];

const normalize = (value: string) => value.toLowerCase();

const matchesKeywords = (value: string, keywords: string[]) => {
  const normalized = normalize(value);
  return keywords.some((kw) => normalized.includes(kw));
};

const getCategoryType = (category: MenuCategory): CategoryType | null => {
  const normalizedTitle = normalize(`${category.id} ${category.title}`);
  if (matchesKeywords(normalizedTitle, drinkKeywords)) return 'drink';
  if (matchesKeywords(normalizedTitle, dessertKeywords)) return 'dessert';
  if (matchesKeywords(normalizedTitle, snackKeywords)) return 'snack';
  return null;
};

const buildSuggestionPool = (menuCategories: MenuCategory[]): SuggestionEntry[] => {
  const pool: SuggestionEntry[] = [];

  menuCategories.forEach((category) => {
    const type = getCategoryType(category);
    if (!type) return;

    category.items.forEach((item) => {
      if (item.unavailable) return;
      const price = Number(item.price);
      if (!Number.isFinite(price)) return;
      pool.push({ item, category, type, price });
    });
  });

  return pool.sort((a, b) => a.price - b.price);
};

export const getCartSignals = (cartItems: CartItem[]): CartSignals => {
  return cartItems.reduce<CartSignals>(
    (acc, item) => {
      const name = normalize(item.name);
      if (!acc.hasDrink && matchesKeywords(name, drinkKeywords)) acc.hasDrink = true;
      if (!acc.hasDessert && matchesKeywords(name, dessertKeywords)) acc.hasDessert = true;
      if (!acc.hasSnack && matchesKeywords(name, snackKeywords)) acc.hasSnack = true;
      return acc;
    },
    { hasDrink: false, hasDessert: false, hasSnack: false }
  );
};

export const pickSuggestions = (
  menuCategories: MenuCategory[],
  missingAmount: number,
  cartSignals: CartSignals
): { missing: number; suggestions: Array<{ item: MenuItem; category: MenuCategory }> } => {
  const pool = buildSuggestionPool(menuCategories);
  const missing = Math.max(0, missingAmount);
  const suggestions: Array<{ item: MenuItem; category: MenuCategory }> = [];

  if (pool.length === 0) return { missing, suggestions };

  const takeCheapest = (type?: CategoryType) => {
    const found = pool.find((entry) => (type ? entry.type === type : true) && !suggestions.find((s) => s.item === entry.item));
    if (found) suggestions.push({ item: found.item, category: found.category });
  };

  if (missing > 0) {
    const targetCount = Math.min(6, Math.max(3, pool.length));
    for (let i = 0; i < targetCount; i++) {
      takeCheapest();
    }
    return { missing, suggestions };
  }

  const neededTypes: CategoryType[] = [];
  if (!cartSignals.hasDrink) neededTypes.push('drink');
  if (!cartSignals.hasDessert) neededTypes.push('dessert');

  neededTypes.forEach((type) => takeCheapest(type));

  return { missing, suggestions };
};

export const getRecommendations = (
  cartItems: CartItem[],
  menuCategories: MenuCategory[]
): { missing: number; suggestions: Array<{ item: MenuItem; category: MenuCategory }> } => {
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartSignals = getCartSignals(cartItems);
  return pickSuggestions(menuCategories, MIN_ORDER_EUR - subtotal, cartSignals);
};

