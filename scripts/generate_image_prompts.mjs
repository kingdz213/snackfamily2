import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MENU_DATA_PATH = path.resolve(__dirname, '../data/menuData.ts');
const OUTPUT_PATH = path.resolve(__dirname, 'image-prompts.csv');

const slugify = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'et')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toCsvValue = (value) => {
  const needsQuotes = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

const normalizePromptItem = (name) =>
  name
    .replace(/Coca-Cola Zéro/gi, 'soda cola zéro')
    .replace(/Coca-Cola/gi, 'soda cola')
    .replace(/Fanta/gi, 'soda orange')
    .replace(/Red Bull/gi, 'boisson énergisante')
    .replace(/Ice Tea/gi, 'thé glacé');

const impliesFries = (category, item) => {
  const fields = [category.title, category.description, item.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (fields.includes('frites')) {
    return true;
  }

  if (Array.isArray(item.optionGroups)) {
    return item.optionGroups.some((group) => {
      if (group.label?.toLowerCase().includes('frites')) return true;
      return group.choices?.some((choice) => choice.label?.toLowerCase().includes('frites'));
    });
  }

  return false;
};

const loadMenuCategories = async () => {
  const source = await fs.readFile(MENU_DATA_PATH, 'utf8');
  const sanitizedSource = source.replace(/import\.meta\.env\.DEV/g, 'false');
  const compiled = ts.transpileModule(sanitizedSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: MENU_DATA_PATH,
  });

  const module = { exports: {} };
  const context = vm.createContext({
    console,
    process,
    require: createRequire(import.meta.url),
    module,
    exports: module.exports,
    __dirname: path.dirname(MENU_DATA_PATH),
    __filename: MENU_DATA_PATH,
  });

  const script = new vm.Script(compiled.outputText, { filename: MENU_DATA_PATH });
  script.runInContext(context);

  const menuCategories = module.exports.MENU_CATEGORIES;
  if (!menuCategories) {
    throw new Error('Impossible de charger MENU_CATEGORIES depuis menuData.ts');
  }

  return menuCategories;
};

const buildPrompt = (itemName, withFries) => {
  const friesClause = withFries ? ' accompagné de frites belges croustillantes' : '';
  return [
    `Photographie culinaire ultra réaliste, style publicité premium, ${itemName}${friesClause}.`,
    'Produit isolé sur fond blanc propre, éclairage studio doux, détails nets, textures appétissantes.',
    'Aucun logo, aucun texte, aucune marque.',
  ].join(' ');
};

const generateCsv = async () => {
  const categories = await loadMenuCategories();
  const lines = ['filename,prompt'];

  categories.forEach((category) => {
    const categorySlug = slugify(category.id ?? category.title ?? 'categorie');
    category.items.forEach((item) => {
      const itemSlug = slugify(item.name);
      const filename = `${categorySlug}-${itemSlug}`;
      const itemLabel = normalizePromptItem(item.name.toLowerCase());
      const prompt = buildPrompt(itemLabel, impliesFries(category, item));
      lines.push(`${toCsvValue(filename)},${toCsvValue(prompt)}`);
    });
  });

  await fs.writeFile(OUTPUT_PATH, `${lines.join('\n')}\n`, 'utf8');
};

try {
  await generateCsv();
  console.log(`CSV généré: ${path.relative(process.cwd(), OUTPUT_PATH)}`);
} catch (error) {
  console.error('Erreur lors de la génération du CSV:', error);
  process.exitCode = 1;
}
