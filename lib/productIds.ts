export type VariantKey = 'menu' | 'solo';

export const slugifyId = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

export const variantKeyFromLabel = (variant?: 'Solo' | 'Menu/Frites'): VariantKey | undefined => {
  if (!variant) return undefined;
  return variant === 'Solo' ? 'solo' : 'menu';
};

export const buildProductId = (
  name: string,
  categoryId?: string,
  variant?: VariantKey
): string => {
  const categoryPart = categoryId ? `${slugifyId(categoryId)}__` : '';
  const variantPart = variant ? `__${variant}` : '';
  return `${categoryPart}${slugifyId(name)}${variantPart}`;
};

export const buildSupplementId = (supplementName: string): string => {
  return `supp_${slugifyId(supplementName)}`;
};
