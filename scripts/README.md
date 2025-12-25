# Scripts de synchronisation

## Synchroniser le menu Takeaway

1. Installer Playwright (une fois) :

```bash
npx playwright install chromium
```

2. Lancer la sync :

```bash
npm run sync:takeaway
```

Cela génère :
- `data/takeawayMenu.raw.json`
- `data/takeawayMenu.normalized.json`

## Mettre à jour le menu interne et les prompts

```bash
npm run sync:menu
npm run sync:prompts
```

Ou tout en une commande :

```bash
npm run sync:all
```

Cette commande met à jour :
- `data/menuData.ts`
- `scripts/image-prompts.csv`
