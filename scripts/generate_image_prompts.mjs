import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const MENU_DATA_PATH = path.resolve('data/menuData.ts');
const OUTPUT_CSV = path.resolve('scripts/image-prompts.csv');

const slugify = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .trim();

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

const basePrompt = 'Photographie culinaire ultra réaliste, style pub premium, fond blanc, éclairage studio doux, texture nette, pas de logo/texte/marque.';

const describeItem = (categoryName, itemName) => {
  const categorySlug = slugify(categoryName);
  const itemSlug = slugify(itemName);

  if (categorySlug.includes('pizza')) {
    return `Pizza "${itemName}" fraîchement cuite, pâte dorée et garniture appétissante.`;
  }
  if (categorySlug.includes('boisson') || /coca|fanta|ice-tea|eau|red-bull|sprite|orangina/.test(itemSlug)) {
    return `Boisson rafraîchissante "${itemName}", bouteille ou canette nette avec condensation légère.`;
  }
  if (categorySlug.includes('dessert') || /tiramisu|dessert|gateau|glace/.test(itemSlug)) {
    return `Dessert "${itemName}" servi avec présentation élégante et texture gourmande.`;
  }
  if (categorySlug.includes('assiette')) {
    return `Assiette "${itemName}" généreuse avec frites dorées et garniture fraîche.`;
  }
  if (categorySlug.includes('mitraillette')) {
    return `Mitraillette "${itemName}" dans demi-baguette, frites croustillantes visibles.`;
  }
  if (categorySlug.includes('kapsalon')) {
    return `Kapsalon "${itemName}" gratiné, frites et viande en barquette appétissante.`;
  }
  if (categorySlug.includes('hamburger')) {
    return `Hamburger "${itemName}" gourmet avec pain moelleux et garniture généreuse.`;
  }
  if (categorySlug.includes('durum') || categorySlug.includes('durum')) {
    return `Dürüm "${itemName}" roulé, galette chaude et garniture visible.`;
  }
  if (categorySlug.includes('sandwich')) {
    return `Sandwich "${itemName}" bien garni, pain frais et ingrédients visibles.`;
  }
  if (categorySlug.includes('snack')) {
    return `Snack "${itemName}" croustillant, portion individuelle appétissante.`;
  }
  if (categorySlug.includes('viande')) {
    return `Portion de "${itemName}" grillée, présentation simple et gourmande.`;
  }

  return `Plat "${itemName}" présenté avec soin, appétissant et gourmand.`;
};

const escapeCsv = (value) => {
  const needsQuotes = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

const main = async () => {
  const categories = await loadMenuCategories();
  const rows = [['filename', 'prompt']];

  categories.forEach((category) => {
    const categorySlug = slugify(category.title);
    category.items.forEach((item) => {
      const itemSlug = slugify(item.name);
      const filename = `${categorySlug}/${itemSlug}.png`;
      const prompt = `${basePrompt} ${describeItem(category.title, item.name)}`;
      rows.push([filename, prompt]);
    });
  });

  const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\n');
  await fs.writeFile(OUTPUT_CSV, `${csv}\n`);
  console.log(`✅ Image prompts saved to ${OUTPUT_CSV}`);
};

main().catch((err) => {
  console.error('❌ Failed to generate image prompts', err);
  process.exit(1);
});
