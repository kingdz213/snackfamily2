export interface MenuItem {
  name: string;
  description?: string;
  price: string | number;
  priceSecondary?: string | number;
  priceLabel?: string;
  priceSecondaryLabel?: string;
  unavailable?: boolean;
  imageUrl?: string;
  optionGroups?: MenuOptionGroup[];
}

export interface MenuOptionChoice {
  id: string;
  label: string;
  deltaPriceCents: number;
}

export interface MenuOptionGroup {
  id: string;
  label: string;
  choices: MenuOptionChoice[];
  defaultChoiceId?: string;
}

export interface CartSelectedOption {
  groupId: string;
  groupLabel: string;
  choiceId: string;
  choiceLabel: string;
  deltaPriceCents: number;
}

export interface MenuCategory {
  id: string;
  title: string;
  description?: string;
  items: MenuItem[];
  hasSauces?: boolean;
  hasSupplements?: boolean;
  hasVeggies?: boolean;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  selectedSauce?: string;
  selectedSupplements?: string[];
  selectedVeggies?: string[];
  variant?: 'Solo' | 'Menu/Frites';
  selectedOptions?: CartSelectedOption[];
}

export const SAUCES = [
  "Sans sauce", "Ketchup", "Ketchup curry", "Mayonnaise", "Barbecue", 
  "Andalouse", "Samouraï", "Américaine", "Américaine forte", "Pita", 
  "Tartare", "Brazil", "Algérienne", "Cocktail", "Harissa", 
  "Hannibal", "Hawaï", "Géant"
];

export const SUPPLEMENTS = [
  { name: "Feta", price: 0.80 },
  { name: "Cheese", price: 0.80 },
  { name: "Œuf", price: 0.80 },
  { name: "Bacon", price: 0.80 },
  { name: "Olives", price: 0.80 },
];

export const VEGGIES = [
  "Salade", "Chou blanc", "Chou rouge", "Carottes", "Oignons", "Oignons secs", "Tomate", "Cornichon"
];

export type Page =
  | 'home'
  | 'menu'
  | 'infos'
  | 'contact'
  | 'commander'
  | 'success'
  | 'cancel'
  | 'admin'
  | 'adminOrderDetail'
  | 'adminOrderHub'
  | 'orderStatus'
  | 'account'
  | 'myOrders'
  | 'myOrderDetail';
