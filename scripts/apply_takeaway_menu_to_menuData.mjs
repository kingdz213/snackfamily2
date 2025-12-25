import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const MENU_DATA_PATH = path.resolve('data/menuData.ts');
const NORMALIZED_PATH = path.resolve('data/takeawayMenu.normalized.json');

const slugify = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .trim();

const rawCode = (code) => ({ __raw: code });

const loadMenuCategories = async () => {
  const source = await fs.readFile(MENU_DATA_PATH, 'utf8');
  const patched = source.replace(/import\.meta\.env/g, 'globalThis.__IMPORT_META_ENV__');
  const transpiled = ts.transpileModule(patched, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  }).outputText;

  globalThis.__IMPORT_META_ENV__ = { DEV: false };
  const dataUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
  const module = await import(dataUrl);
  delete globalThis.__IMPORT_META_ENV__;
  return module.MENU_CATEGORIES ?? [];
};

const formatValue = (value, indent = 0) => {
  const pad = '  '.repeat(indent);
  const padNext = '  '.repeat(indent + 1);

  if (value && typeof value === 'object' && value.__raw) {
    return value.__raw;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${padNext}${value.map((item) => formatValue(item, indent + 1)).join(`,\n${padNext}`)}\n${pad}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, val]) => val !== undefined)
      .map(([key, val]) => `${key}: ${formatValue(val, indent + 1)}`);
    if (entries.length === 0) return '{}';
    return `{\n${padNext}${entries.join(`,\n${padNext}`)}\n${pad}}`;
  }

  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "\\'")}'`;
  }

  if (value === null) return 'null';
  return String(value);
};

const toEuros = (cents) => Number((cents / 100).toFixed(2));

const buildMenuDataFile = (categories) => {
  const serializedCategories = formatValue(categories, 1);
  return `import { MenuCategory, MenuItem, MenuOptionGroup } from '../types';\n\nconst parsePrice = (v: string | number | undefined | null): number | undefined => {\n  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;\n  if (typeof v !== 'string') return undefined;\n  const cleaned = v.replace('€', '').trim().replace(',', '.');\n  const n = Number(cleaned);\n  return Number.isFinite(n) ? n : undefined;\n};\n\nconst DURUM_FRIES_OPTION_GROUP: MenuOptionGroup = {\n  id: 'fries',\n  label: 'Accompagnement',\n  defaultChoiceId: 'no-fries',\n  choices: [\n    { id: 'no-fries', label: 'Sans frites', deltaPriceCents: 0 },\n    { id: 'with-fries', label: 'Avec frites (+2,00€)', deltaPriceCents: 200 },\n  ],\n};\n\nconst RAW_MENU_CATEGORIES: MenuCategory[] = [${serializedCategories}\n];\n\nconst sanitizeItem = (item: MenuItem, categoryTitle: string): MenuItem => {\n  const price = parsePrice(item.price);\n  const priceSecondary = item.priceSecondary !== undefined\n    ? parsePrice(item.priceSecondary)\n    : undefined;\n\n  const hasInvalidPrimary = price === undefined;\n  const hasInvalidSecondary = item.priceSecondary !== undefined && priceSecondary === undefined;\n  const hasInvalidPrice = hasInvalidPrimary || hasInvalidSecondary;\n\n  if (import.meta.env.DEV && hasInvalidPrice) {\n    console.warn(`[menuData] Prix invalide pour "${item.name}" dans "${categoryTitle}"`, {\n      price: item.price,\n      priceSecondary: item.priceSecondary,\n    });\n  }\n\n  return {\n    ...item,\n    price: price ?? 0,\n    priceSecondary,\n    unavailable: item.unavailable ?? hasInvalidPrice,\n  };\n};\n\nexport const MENU_CATEGORIES: MenuCategory[] = RAW_MENU_CATEGORIES.map((category) => ({\n  ...category,\n  items: category.items.map((item) => sanitizeItem(item, category.title)),\n}));\n`;
};

const isDurumCategory = (name) => {
  const slug = slugify(name);
  return slug.includes('durum');
};

const main = async () => {
  const normalized = JSON.parse(await fs.readFile(NORMALIZED_PATH, 'utf8'));
  const existingCategories = await loadMenuCategories();
  const existingMap = new Map(
    existingCategories.map((category) => [slugify(category.title), category])
  );

  const updatedCategories = normalized.categories.map((category) => {
    const existingCategory = existingMap.get(slugify(category.categoryName));
    const itemMap = new Map(
      (existingCategory?.items ?? []).map((item) => [slugify(item.name), item])
    );

    const items = category.items.map((item) => {
      const existingItem = itemMap.get(item.id) ?? itemMap.get(slugify(item.name));
      const nextItem = {
        ...(existingItem ?? {}),
        name: item.name,
        description: item.description ?? existingItem?.description,
        price: toEuros(item.priceCents),
        unavailable: false,
      };

      if (isDurumCategory(category.categoryName)) {
        nextItem.optionGroups = [rawCode('DURUM_FRIES_OPTION_GROUP')];
      }

      return nextItem;
    });

    return {
      id: existingCategory?.id ?? category.categoryId ?? slugify(category.categoryName),
      title: category.categoryName,
      description: existingCategory?.description,
      hasSauces: existingCategory?.hasSauces ?? false,
      hasVeggies: existingCategory?.hasVeggies ?? false,
      hasSupplements: existingCategory?.hasSupplements ?? false,
      items,
    };
  });

  const fileContents = buildMenuDataFile(updatedCategories);
  await fs.writeFile(MENU_DATA_PATH, fileContents);
  console.log('✅ menuData.ts updated from Takeaway normalized menu');
};

main().catch((err) => {
  console.error('❌ Failed to update menuData.ts', err);
  process.exit(1);
});
