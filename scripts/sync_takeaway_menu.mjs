import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const TAKEAWAY_URL = process.env.TAKEAWAY_URL ?? 'https://www.takeaway.com/be-fr/menu/snack-family-2';
const OUTPUT_RAW = path.resolve('data/takeawayMenu.raw.json');
const OUTPUT_NORMALIZED = path.resolve('data/takeawayMenu.normalized.json');

const slugify = (value) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .trim();

const parsePriceToCents = (value) => {
  if (!value) return null;
  const match = String(value)
    .replace(/\s+/g, ' ')
    .match(/(\d+[\.,]\d{1,2}|\d+)/g);
  if (!match) return null;
  const raw = match[match.length - 1].replace(',', '.');
  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
};

const autoScroll = async (page, iterations = 8) => {
  for (let i = 0; i < iterations; i += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
};

const clickCategoryTabs = async (page) => {
  const selectors = [
    '[data-testid="menu-categories"] button',
    '[data-testid="menu-categories"] a',
    '[data-testid="category-navigation"] button',
    '[role="tab"]',
    'nav a[href^="#"]',
  ];

  const handles = await page.$$(selectors.join(', '));
  const visited = new Set();

  for (const handle of handles) {
    const label = (await handle.innerText()).trim();
    if (!label || visited.has(label)) continue;
    visited.add(label);
    try {
      await handle.scrollIntoViewIfNeeded();
      await handle.click({ timeout: 2000 });
      await page.waitForLoadState('networkidle');
      await autoScroll(page, 4);
    } catch {
      // Ignore if click fails (layout differences)
    }
  }
};

const extractMenu = async (page) => {
  return page.evaluate(() => {
    const normalizeText = (value) => value?.replace(/\s+/g, ' ').trim() ?? '';

    const extractPrice = (node) => {
      const priceCandidates = Array.from(node.querySelectorAll('span, div, p'))
        .map((el) => normalizeText(el.textContent))
        .filter((text) => text.includes('€') || /\d+[\.,]\d{1,2}/.test(text));
      return priceCandidates.find((text) => text.includes('€')) ?? priceCandidates[0] ?? '';
    };

    const findItemNodes = (container) => {
      const explicit = container.querySelectorAll('[data-testid="menu-product"], [data-testid="menu-item"], [data-testid="product"]');
      if (explicit.length) return Array.from(explicit);
      const articles = container.querySelectorAll('article');
      if (articles.length) return Array.from(articles);
      return Array.from(container.querySelectorAll('li'));
    };

    const categorySelectors = [
      '[data-testid="menu-category"]',
      'section[data-testid*="category"]',
      'section',
    ];

    const sections = Array.from(document.querySelectorAll(categorySelectors.join(',')));

    const categories = sections
      .map((section) => {
        const heading = section.querySelector('h2, h3, header h2, header h3');
        const categoryName = normalizeText(heading?.textContent);
        const items = findItemNodes(section)
          .map((item) => {
            const name = normalizeText(
              item.querySelector('[data-testid="menu-product-name"], h3, h4, h5')?.textContent
            );
            if (!name) return null;
            const description = normalizeText(
              item.querySelector('[data-testid="menu-product-description"], p')?.textContent
            );
            const priceText = extractPrice(item);
            const soldOut = normalizeText(item.textContent).toLowerCase().includes('indisponible');
            const optionGroups = Array.from(item.querySelectorAll('[data-testid*="option"], fieldset'))
              .map((group) => {
                const label = normalizeText(group.querySelector('legend, h4, h5')?.textContent);
                const options = Array.from(group.querySelectorAll('label, li'))
                  .map((option) => normalizeText(option.textContent))
                  .filter(Boolean);
                return { label, options };
              })
              .filter((group) => group.options.length > 0);

            return {
              name,
              description: description && description !== name ? description : null,
              priceText,
              soldOut,
              optionGroups,
            };
          })
          .filter(Boolean);

        if (!categoryName || items.length === 0) return null;
        return { categoryName, items };
      })
      .filter(Boolean);

    return categories;
  });
};

const normalizeMenu = (rawCategories) => {
  return rawCategories.map((category) => {
    const categoryName = category.categoryName;
    const categoryId = slugify(categoryName);
    const items = category.items.map((item) => {
      const priceCents = parsePriceToCents(item.priceText) ?? 0;
      const id = slugify(item.name);
      const options = item.optionGroups?.length
        ? item.optionGroups.map((group) => ({
            id: slugify(group.label || 'options'),
            label: group.label || 'Options',
            choices: group.options.map((option) => ({
              id: slugify(option),
              label: option,
            })),
          }))
        : undefined;
      return {
        id,
        name: item.name,
        description: item.description ?? undefined,
        priceCents,
        priceDisplay: item.priceText ?? undefined,
        available: !item.soldOut,
        ...(options ? { options } : {}),
      };
    });

    return {
      categoryId,
      categoryName,
      items,
    };
  });
};

const main = async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    locale: 'fr-BE',
  });

  await page.goto(TAKEAWAY_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.waitForSelector('[data-testid="menu-category"], [data-testid="menu-product"], section', { timeout: 60000 });

  await autoScroll(page, 6);
  await clickCategoryTabs(page);
  await autoScroll(page, 6);

  const rawCategories = await extractMenu(page);
  await browser.close();

  const normalized = normalizeMenu(rawCategories);

  await fs.mkdir(path.dirname(OUTPUT_RAW), { recursive: true });
  await fs.writeFile(OUTPUT_RAW, JSON.stringify({
    sourceUrl: TAKEAWAY_URL,
    extractedAt: new Date().toISOString(),
    categories: rawCategories,
  }, null, 2));

  await fs.writeFile(OUTPUT_NORMALIZED, JSON.stringify({
    sourceUrl: TAKEAWAY_URL,
    extractedAt: new Date().toISOString(),
    categories: normalized,
  }, null, 2));

  console.log(`✅ Takeaway menu saved to ${OUTPUT_RAW} and ${OUTPUT_NORMALIZED}`);
};

main().catch((err) => {
  console.error('❌ Failed to sync Takeaway menu', err);
  process.exit(1);
});
