# Code Snapshot

## App.tsx

```
import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { MenuPage } from './components/MenuPage';
import { InfoPage } from './components/InfoPage';
import { ContactPage } from './components/ContactPage';
import { OrderPage } from './components/OrderPage';
import { SuccessPage } from './components/SuccessPage';
import { CancelPage } from './components/CancelPage';
import { Footer } from './components/Footer';
import { OrderingCTA } from './components/OrderingCTA';
import { OrderUI } from './components/OrderUI';
import { CartItem, MenuItem, MenuCategory, Page } from './types';

function App() {
  const pageToPath: Record<Page, string> = {
    home: '/',
    menu: '/menu',
    infos: '/infos',
    contact: '/contact',
    commander: '/commander',
    success: '/success',
    cancel: '/cancel'
  };
  const pathToPage: Record<string, Page> = Object.entries(pageToPath).reduce((acc, [page, path]) => {
    acc[path] = page as Page;
    return acc;
  }, {} as Record<string, Page>);
  const aliasPathToPage: Record<string, Page> = {
    '/home': 'home',
    '/index.html': 'home',
  };

  // Détection robuste de la page initiale (Success/Cancel) compatible sandbox
  const getInitialPage = (): Page => {
    try {
      const path = window.location.pathname;
      const search = window.location.search;

      if (path.includes('/success') || search.includes('success=true')) return 'success';
      if (path.includes('/cancel') || search.includes('canceled=true')) return 'cancel';

      const normalizedPath = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
      const mappedPage = pathToPage[normalizedPath] ?? aliasPathToPage[normalizedPath];

      return mappedPage ?? 'home';
    } catch (e) {
      console.warn("Navigation warning: could not determine initial page", e);
    }
    return 'home';
  };

  const [currentPage, setCurrentPage] = useState<Page>(getInitialPage());
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | null>(null);

  const closeOrderModal = () => {
    setIsOrderModalOpen(false);
    setSelectedItem(null);
    setSelectedCategory(null);
  };

  // Scroll en haut à chaque changement de page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  const navigateTo = (page: Page) => {
    const targetPath = pageToPath[page] ?? '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }

    setCurrentPage(page);
    // Always reset modal-related state when navigating to avoid stale overlays
    closeOrderModal();
    // Ferme systématiquement le panier lors d'un changement de page pour éviter qu'il ne reste ouvert
    setIsCartOpen(false);
  };

  // Persist cart items locally to survive refresh/navigation (without exposing sensitive data)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('snackfamily_cart');
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed)) {
          const sanitized = parsed
            .map((item) => {
              const price = Number(item.price);
              const quantity = Number.isFinite(item.quantity) ? Math.max(1, Math.trunc(item.quantity)) : 1;
              if (!item.id || !item.name || !Number.isFinite(price)) return null;
              return {
                ...item,
                price,
                quantity,
                selectedSupplements: Array.isArray(item.selectedSupplements)
                  ? item.selectedSupplements.filter(Boolean)
                  : undefined,
                selectedVeggies: Array.isArray(item.selectedVeggies)
                  ? item.selectedVeggies.filter(Boolean)
                  : undefined,
              } as CartItem;
            })
            .filter(Boolean) as CartItem[];

          if (sanitized.length) {
            setCartItems(sanitized);
          }
        }
      }
    } catch (e) {
      console.warn('Unable to restore cart from storage', e);
    }
  }, []);

  useEffect(() => {
    try {
      if (cartItems.length) {
        localStorage.setItem('snackfamily_cart', JSON.stringify(cartItems));
      } else {
        localStorage.removeItem('snackfamily_cart');
      }
    } catch (e) {
      console.warn('Unable to persist cart locally', e);
    }
  }, [cartItems]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getInitialPage());
      setIsCartOpen(false);
      closeOrderModal();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Clear cart after a successful checkout to avoid stale items when returning to the site
  useEffect(() => {
    if (currentPage === 'success') {
      setCartItems([]);
      setIsCartOpen(false);
    }
  }, [currentPage]);

  const addToCart = (item: CartItem) => {
    setCartItems(prev => [...prev, item]);
    setIsCartOpen(true); // Ouvre le panier automatiquement après ajout
  };

  const removeFromCart = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const openOrderModal = (item: MenuItem, category: MenuCategory) => {
    setSelectedItem(item);
    setSelectedCategory(category);
    setIsOrderModalOpen(true);
  };

  // Rendu conditionnel des pages
  const renderPage = () => {
    switch (currentPage) {
      case 'home': return <Home navigateTo={navigateTo} />;
      case 'menu': return <MenuPage openOrderModal={openOrderModal} />;
      case 'infos': return <InfoPage />;
      case 'contact': return <ContactPage />;
      case 'commander': return <OrderPage openOrderModal={openOrderModal} />;
      case 'success': return <SuccessPage navigateTo={navigateTo} />;
      case 'cancel': return <CancelPage navigateTo={navigateTo} />;
      default: return <Home navigateTo={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-snack-light flex flex-col font-sans text-snack-black">
      <Header
        currentPage={currentPage}
        navigateTo={navigateTo}
        cartCount={cartItems.reduce((acc, item) => acc + item.quantity, 0)}
        toggleCart={() => setIsCartOpen((open) => !open)}
      />

      <main className="flex-grow pt-24">
        {renderPage()}
      </main>

      <Footer navigateTo={navigateTo} />

      {/* Bouton flottant Commander (visible sauf sur Checkout/Success/Cancel/Commander) */}
      {currentPage !== 'success' && currentPage !== 'cancel' && currentPage !== 'commander' && (
        <OrderingCTA 
            navigateTo={navigateTo}
            toggleCart={() => setIsCartOpen(true)} 
        />
      )}

      {/* Interface Modale Commande + Panier */}
      <OrderUI 
        isOrderModalOpen={isOrderModalOpen}
        selectedItem={selectedItem}
        selectedCategory={selectedCategory}
        closeOrderModal={closeOrderModal}
        addToCart={addToCart}
        
        isCartOpen={isCartOpen}
        closeCart={() => setIsCartOpen(false)}
        cartItems={cartItems}
        removeFromCart={removeFromCart}
        clearCart={clearCart}
        isCommanderPage={currentPage === 'commander'}
      />
    </div>
  );
}

export default App;
```

## index.tsx

```
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

console.log("App initializing...");

// Global error handler for Script Errors (usually CDN/CORS issues)
window.addEventListener('error', (event) => {
  console.error("Global error caught:", event.error || event.message);
  const container = document.getElementById('root');
  // Only show this fallback if the app hasn't rendered anything yet
  if (container && container.innerHTML === '') {
     container.innerHTML = `
       <div style="color: #333; padding: 40px; text-align: center; font-family: sans-serif;">
         <h2 style="color: #e11d48; margin-bottom: 10px;">Une erreur est survenue</h2>
         <p>Veuillez rafraîchir la page.</p>
         <p style="font-size: 12px; color: #999; margin-top: 20px;">${event.message}</p>
       </div>
     `;
  }
});

const container = document.getElementById('root');

if (container) {
  try {
    // Clear any existing content
    container.innerHTML = '';
    
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("App rendered successfully.");
  } catch (error) {
    console.error("Error during app rendering:", error);
    container.innerHTML = '<div style="color: red; padding: 20px; text-align: center;">Une erreur est survenue lors du chargement de l\'application.<br/>Veuillez rafraîchir la page.</div>';
  }
} else {
  console.error("Critical Error: 'root' element not found in DOM.");
}
```

## index.html

```
<!DOCTYPE html>
<html lang="fr" class="scroll-smooth">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Snack Family 2 - Friterie à Colfontaine</title>
    <meta name="description" content="Snack Family 2 à Colfontaine (Wasmes). Friterie belge, Mitraillettes, Burgers. Ouvert midi et soir. Commande en ligne." />
    
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              snack: {
                black: '#111111',
                gold: '#FFD700',
                darkRed: '#8B0000',
                light: '#F8F9FA',
                gray: '#343a40',
              }
            },
            fontFamily: {
              sans: ['Inter', 'system-ui', 'sans-serif'],
              display: ['Oswald', 'sans-serif'],
            },
            backgroundImage: {
              'gradient-dark': 'linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.4))',
            }
          }
        }
      }
    </script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Oswald:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      body { 
        font-family: 'Inter', sans-serif; 
        background-color: #F8F9FA;
        color: #343a40;
      }
      h1, h2, h3, h4, .font-display {
        font-family: 'Oswald', sans-serif;
        text-transform: uppercase;
      }
      .no-scrollbar::-webkit-scrollbar {
        display: none;
      }
      .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
    </style>
    <script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.2.0",
    "react/": "https://esm.sh/react@18.2.0/",
    "react-dom": "https://esm.sh/react-dom@18.2.0",
    "react-dom/": "https://esm.sh/react-dom@18.2.0/",
    "lucide-react": "https://esm.sh/lucide-react@0.263.1?deps=react@18.2.0",
    "framer-motion": "https://esm.sh/framer-motion@10.12.16?deps=react@18.2.0,react-dom@18.2.0"
  }
}
</script>
  </head>
  <body class="antialiased">
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

## vite.config.ts

```
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

```

## vite-env.d.ts

```
/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_STRIPE_WORKER_URL?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}

```

## package.json

```
{
  "name": "snack-family-2",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "lucide-react": "0.263.1",
    "framer-motion": "10.12.16"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  }
}

```

## tsconfig.json

```
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "module": "ESNext",
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "skipLibCheck": true,
    "types": [
      "node"
    ],
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "moduleDetection": "force",
    "allowJs": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": [
        "./*"
      ]
    },
    "allowImportingTsExtensions": true,
    "noEmit": true
  }
}
```

## README.md

```
<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1lwpn6AJ8-E7OCm7TxNgbanRPDFlkm-lw

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create a `.env.local` file with your Stripe worker endpoint so Checkout knows where to send orders **(mandatory)**:
   ```
   VITE_STRIPE_WORKER_URL=https://<your-worker>.workers.dev/create-checkout-session
   ```
   > The endpoint must live on your server/Worker and use your **secret** Stripe key to create Checkout sessions.
3. Run the app:
   `npm run dev`

## Stripe Checkout configuration

The frontend never stores your Stripe secret. Instead it POSTs the cart to a secure backend (Cloudflare Worker, serverless function, etc.) defined by `VITE_STRIPE_WORKER_URL`. The backend must:

1. Receive `{ items, successUrl, cancelUrl }` from the frontend.
2. Call `stripe.checkout.sessions.create` with your Stripe **secret** key and return `{ url: session.url }`.
3. Respond with a non-2xx status and error body when session creation fails so the UI can display a meaningful error.

If `VITE_STRIPE_WORKER_URL` is missing, the checkout button blocks with an explicit alert so you can fix the configuration before users try to pay.

### Checklist rapide (fr)

Pour que le bouton **« Commander »** redirige correctement vers Stripe :

1. **Créez un backend sécurisé** (Cloudflare Worker, Netlify/ Vercel function, petit serveur Node/Express…). Placez-y votre **clé secrète Stripe**.
2. **Exposez un endpoint POST** (ex. `/create-checkout-session`) qui reçoit `{ items, successUrl, cancelUrl }` et renvoie `{ url: session.url }` après avoir appelé `stripe.checkout.sessions.create`.
3. **Mettez l’URL de cet endpoint** dans `.env.local` :
   ```
   VITE_STRIPE_WORKER_URL=https://<votre-worker>.workers.dev/create-checkout-session
   ```
4. **Vérifiez les URLs de redirection**. Le frontend utilise `window.location.origin`; assurez-vous que votre domaine déployé correspond bien aux URLs `https://…/success` et `https://…/cancel` attendues par Stripe.
5. **Testez en local** : lancez `npm run dev`, ouvrez l’app, puis cliquez sur **« Test paiement (DEV) »** ou ajoutez un article et cliquez sur **« Payer avec Stripe »**. Vous devez voir une URL Stripe dans la console ou être redirigé vers Checkout.

### Cloudflare Worker complet (Stripe + KV + Emails + SMS)

Un worker TypeScript prêt pour la production est fourni dans `worker/stripe-worker.ts`. Il :

* crée des sessions Checkout via Stripe (HTTPS uniquement, localhost autorisé en dev) ;
* valide les items, nettoie les métadonnées et renvoie `{ url }` ;
* expose un endpoint `/webhook` pour `checkout.session.completed` ;
* enregistre chaque commande dans une base JSON (KV Cloudflare) ;
* peut envoyer un email (Resend) et deux SMS (client + propriétaire via Twilio) ;
* protège contre les payloads invalides, les redirects non sûrs et les JSON mal formés.

Variables d’environnement à fournir côté Worker :

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=...
RESEND_FROM=orders@snackfamily2.com
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+12025550123
ADMIN_PHONE=+32465671893
```

KV à lier : `ORDERS_KV` (stocke chaque commande au format JSON, indexée par session Stripe).

Pour déployer :

1) Créez un Worker, attachez `ORDERS_KV`, configurez les variables ci-dessus.
2) Déployez `worker/stripe-worker.ts` (via Wrangler/Pages Functions).
3) Configurez `VITE_STRIPE_WORKER_URL` avec l’URL publique du Worker (terminant par `/create-checkout-session`).
4) Ajoutez le webhook Stripe pointant vers `/webhook` avec la clé `STRIPE_WEBHOOK_SECRET`.

> ⚠️ Ne committez jamais votre clé secrète. Conservez-la dans les variables d’environnement de votre Worker/serveur.

```

## types.ts

```
export interface MenuItem {
  name: string;
  description?: string;
  price: string | number;
  priceSecondary?: string | number;
  priceLabel?: string;
  priceSecondaryLabel?: string;
  unavailable?: boolean;
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

export type Page = 'home' | 'menu' | 'infos' | 'contact' | 'commander' | 'success' | 'cancel';
```

## data/menuData.ts

```
import { MenuCategory } from '../types';

export const MENU_CATEGORIES: MenuCategory[] = [
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
```

## lib/stripe.ts

```
export interface CheckoutItem {
  name: string;
  price: number; // in cents
  quantity: number;
}

export interface CheckoutCustomerInfo {
  firstName?: string;
  lastName?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
  instructions?: string;
}

interface CheckoutOptions {
  customer?: CheckoutCustomerInfo;
}

// Default to the known production Worker endpoint; override with VITE_STRIPE_WORKER_URL if needed
const DEFAULT_WORKER_URL = "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev/create-checkout-session";
const STRIPE_REDIRECT_HOST_SUFFIXES = ['stripe.com'];
const MAX_ITEMS = 100;
const MAX_QUANTITY = 99;
const MAX_PRICE_CENTS = 1_000_000; // 10,000 EUR safeguard

function sanitizeText(value: string, max = 200) {
  // Remove control characters (ASCII), angle brackets, and normalize whitespace
  const withoutControls = value
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F]+/g, ' ')
    .replace(/[<>]/g, ' ');
  // Collapse repeated whitespace and trim
  const collapsed = withoutControls.replace(/\s{2,}/g, ' ').trim();
  // Limit length to protect metadata and logs
  return collapsed.slice(0, max);
}

function resolveSafeOrigin() {
  const fallback = 'https://snackfamily2.com';
  try {
    const rawOrigin = window.location.origin;
    if (!rawOrigin || rawOrigin === 'null' || rawOrigin === 'about:blank') {
      return fallback;
    }

    const parsed = new URL(rawOrigin);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol === 'https:' || (isLocalhost && parsed.protocol === 'http:')) {
      return parsed.origin;
    }
  } catch (e) {
    console.warn('Origin validation failed, using fallback', e);
  }
  return fallback;
}

function resolveWorkerUrl(): string {
  const envUrl = import.meta.env?.VITE_STRIPE_WORKER_URL?.trim();
  return envUrl || DEFAULT_WORKER_URL;
}

function ensureValidWorkerUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.username || parsed.password) {
      throw new Error('Les identifiants dans l\'URL du worker sont interdits.');
    }
    if (parsed.protocol !== 'https:' && !(isLocalhost && parsed.protocol === 'http:')) {
      throw new Error('Le worker Stripe doit utiliser HTTPS (ou HTTP localhost en dev).');
    }
    return parsed.toString();
  } catch (e) {
    throw new Error('URL du worker Stripe invalide. Vérifiez VITE_STRIPE_WORKER_URL.');
  }
}

function normalizeItems(items: CheckoutItem[]): CheckoutItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No checkout items provided");
  }

  if (items.length > MAX_ITEMS) {
    throw new Error(`Trop d'articles dans le panier (max ${MAX_ITEMS}).`);
  }

  return items.map((item) => {
    const quantity = Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(item.quantity || 0)));
    const rawPrice = Number.isFinite(item.price) ? item.price : Number(item.price ?? 0);
    const price = Math.max(0, Math.trunc(rawPrice || 0));

    const normalizedName = sanitizeText(item.name ?? '');
    if (!normalizedName) {
      throw new Error("Chaque article doit avoir un nom");
    }
    if (price <= 0) {
      throw new Error("Les prix doivent être supérieurs à zéro (en centimes)");
    }
    if (price > MAX_PRICE_CENTS) {
      throw new Error("Le montant d'un article dépasse la limite autorisée.");
    }

    return {
      ...item,
      name: normalizedName,
      price,
      quantity,
    };
  });
}

function sanitizeCustomer(customer?: CheckoutCustomerInfo): CheckoutCustomerInfo | undefined {
  if (!customer) return undefined;

  const sanitizeField = (value?: string, max = 200) => {
    if (!value) return undefined;
    const cleaned = sanitizeText(value, max);
    if (!cleaned) return undefined;
    return cleaned;
  };

  const sanitizeEmail = (value?: string) => {
    if (!value) return undefined;
    const trimmed = sanitizeText(value, 200);
    const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!emailPattern.test(trimmed)) return undefined;
    return trimmed.slice(0, 160);
  };

  const sanitized: CheckoutCustomerInfo = {};
  const firstName = sanitizeField(customer.firstName, 80);
  const lastName = sanitizeField(customer.lastName, 80);
  if (firstName) sanitized.firstName = firstName;
  if (lastName) sanitized.lastName = lastName;

  const address = sanitizeField(customer.address, 200);
  if (address) sanitized.address = address;

  const postalCode = sanitizeField(customer.postalCode, 20);
  if (postalCode) sanitized.postalCode = postalCode;

  const city = sanitizeField(customer.city, 120);
  if (city) sanitized.city = city;

  const phone = sanitizeField(customer.phone, 40);
  if (phone) sanitized.phone = phone;

  const email = sanitizeEmail(customer.email);
  if (email) sanitized.email = email;

  const instructions = sanitizeField(customer.instructions, 300);
  if (instructions) sanitized.instructions = instructions;

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function validateRedirectUrl(redirectUrl: string): string {
  const trimmed = redirectUrl.trim();
  if (!trimmed) {
    throw new Error("Le service de paiement n'a pas renvoyé d'URL de redirection.");
  }

  try {
    const parsed = new URL(trimmed);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    if (parsed.protocol !== 'https:' && !(isLocalhost && parsed.protocol === 'http:')) {
      throw new Error('URL de redirection non sécurisée.');
    }

    const isStripeHost = STRIPE_REDIRECT_HOST_SUFFIXES.some((suffix) =>
      parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`)
    );

    if (!isStripeHost && !isLocalhost) {
      throw new Error("URL de redirection inattendue renvoyée par le service de paiement.");
    }

    return parsed.toString();
  } catch (urlError) {
    console.error('Invalid redirect URL returned by worker', urlError);
    throw new Error("URL de redirection invalide renvoyée par le service de paiement.");
  }
}

export async function startCheckout(items: CheckoutItem[], options?: CheckoutOptions): Promise<string> {
  // Determine a safe origin for success/cancel redirects
  // Use fallback if window.location.origin is null/about:blank (sandboxes)
  const origin = resolveSafeOrigin();

  const WORKER_URL = ensureValidWorkerUrl(resolveWorkerUrl());

  const normalizedItems = normalizeItems(items);
  const customer = sanitizeCustomer(options?.customer);

  const payload = {
    items: normalizedItems,
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`,
    ...(customer ? { metadata: customer } : {})
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
        console.error("Worker response error:", response.status);
        let errorBody: string | undefined;
        try {
          errorBody = await response.text();
        } catch (readErr) {
          console.error("Unable to read error body", readErr);
        }

        throw new Error(`Erreur HTTP ${response.status}${errorBody ? ` - ${errorBody}` : ''}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch (parseErr) {
      throw new Error("Réponse du service de paiement invalide (JSON)");
    }
    const redirectUrl = typeof data?.url === 'string' ? data.url : '';
    const safeRedirect = validateRedirectUrl(redirectUrl);

    // Redirect to Stripe Checkout and expose URL for callers/tests
    window.location.href = safeRedirect;
    return safeRedirect;
  } catch (e) {
    console.error("Checkout Exception:", e);
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error("La demande de paiement a expiré. Veuillez réessayer.");
    }
    throw e instanceof Error ? e : new Error("Impossible de contacter le serveur de paiement.");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * DEV ONLY: Test function to verify Worker connectivity
 */
export async function runDevTest() {
  const WORKER_URL = ensureValidWorkerUrl(resolveWorkerUrl() || DEFAULT_WORKER_URL);

  const origin = window.location.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost:5173';

  const payload = {
    items: [
      { name: "Test Snack (DEV)", price: 500, quantity: 1 } // 5.00 EUR (500 cents)
    ],
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`
  };

  console.group("🧪 Stripe Worker Dev Test");
  console.log("Target URL:", WORKER_URL);
  console.log("Payload:", payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    console.log("HTTP Status:", response.status);

    const text = await response.text();
    console.log("Raw Response Body:", text);

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${text}`);
    }

    let data;
    try {
      data = JSON.parse(text);
      console.log("Parsed JSON:", data);
    } catch(e) {
      throw new Error("Invalid JSON response from Worker");
    }

    if (data.url) {
        let safeUrl: string;
        try {
          safeUrl = validateRedirectUrl(String(data.url));
        } catch (redirectError) {
          throw redirectError instanceof Error ? redirectError : new Error(String(redirectError));
        }

        if (confirm(`Test réussi ! URL reçue : ${safeUrl}\n\nVoulez-vous être redirigé vers Stripe ?`)) {
             window.location.href = safeUrl;
        }
    } else {
        alert("Réponse reçue mais pas d'URL: " + JSON.stringify(data));
    }

  } catch (error) {
    console.error("Test Error:", error);
    if (error instanceof DOMException && error.name === 'AbortError') {
      alert("Test Stripe interrompu: délai dépassé.");
    } else {
      alert(`Échec du test: ${error instanceof Error ? error.message : String(error)}`);
    }
  } finally {
    clearTimeout(timeout);
    console.groupEnd();
  }
}

```

## worker/stripe-worker.ts

```
import Stripe from 'stripe';

interface Env {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
  ADMIN_PHONE?: string; // e.g. +32465671893
  ORDERS_KV: KVNamespace;
}

interface CheckoutPayload {
  items?: { name: string; price: number; quantity: number }[];
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}

type OrderRecord = {
  id: string;
  status: string;
  amountTotal: number;
  currency: string;
  items: { name: string; price: number; quantity: number }[];
  customer?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    instructions?: string;
  };
  createdAt: string;
};

const allowedOrigins = ['https://snackfamily2.com', 'https://www.snackfamily2.com', 'http://localhost:5173'];

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'access-control-allow-origin': '*',
      ...extraHeaders,
    },
  });
}

function sanitizeText(value: string, max = 200) {
  const withoutControls = value.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F<>]/g, ' ');
  const cleaned = withoutControls.replace(/\s{2,}/g, ' ').trim();
  return cleaned.slice(0, max);
}

function ensureHttps(url: string) {
  const parsed = new URL(url);
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
    throw new Error('Les URLs de redirection doivent être en HTTPS (ou localhost en dev).');
  }
  return parsed.toString();
}

async function handleCreateCheckout(request: Request, env: Env, stripe: Stripe) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let payload: CheckoutPayload;
  try {
    payload = await request.json();
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    return jsonResponse({ error: 'No items provided' }, 400);
  }

  if (items.length > 100) {
    return jsonResponse({ error: 'Too many items' }, 400);
  }

  const lineItems = items.map((item, index) => {
    const name = sanitizeText(String(item.name || 'Article')) || `Article ${index + 1}`;
    const price = Math.trunc(Number(item.price));
    const quantity = Math.max(1, Math.trunc(Number(item.quantity)) || 1);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid item price');
    }
    return {
      price_data: {
        currency: 'eur',
        product_data: { name },
        unit_amount: price,
      },
      quantity,
    };
  });

  const successUrl = payload.successUrl ? ensureHttps(payload.successUrl) : undefined;
  const cancelUrl = payload.cancelUrl ? ensureHttps(payload.cancelUrl) : undefined;
  if (!successUrl || !cancelUrl) {
    return jsonResponse({ error: 'Missing successUrl/cancelUrl' }, 400);
  }

  const metadata: Record<string, string> = {};
  Object.entries(payload.metadata || {}).forEach(([key, value]) => {
    if (!value) return;
    const cleaned = sanitizeText(String(value), 240);
    if (cleaned) metadata[key] = cleaned;
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });

  return jsonResponse({ url: session.url });
}

async function storeOrder(env: Env, record: OrderRecord) {
  await env.ORDERS_KV.put(record.id, JSON.stringify(record));
}

async function sendEmail(env: Env, record: OrderRecord) {
  if (!env.RESEND_API_KEY || !record.customer?.email) return;
  const from = env.RESEND_FROM || 'orders@snackfamily2.com';
  const subject = `Commande SnackFamily2 #${record.id}`;
  const body = `Merci pour votre commande !\nTotal: ${(record.amountTotal / 100).toFixed(2)} €\nAdresse: ${record.customer.address || ''}`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: record.customer.email, subject, text: body }),
  });
}

async function sendSms(env: Env, record: OrderRecord) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) return;
  const adminPhone = env.ADMIN_PHONE || '+32465671893';
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const basicAuth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  const summary = record.items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
  const textClient = `Commande SnackFamily2 confirmée. Total ${(record.amountTotal / 100).toFixed(2)}€.`;
  const textOwner = `Nouvelle commande ${(record.amountTotal / 100).toFixed(2)}€ - ${record.customer?.firstName || ''} ${record.customer?.lastName || ''} - ${record.customer?.address || ''} - ${summary}`;

  const send = async (to: string, body: string) => {
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: env.TWILIO_FROM!, To: to, Body: body }),
    });
  };

  if (record.customer?.phone) {
    await send(record.customer.phone, textClient);
  }
  await send(adminPhone, textOwner);
}

async function handleWebhook(request: Request, env: Env, stripe: Stripe) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let event: Stripe.Event;
  if (env.STRIPE_WEBHOOK_SECRET) {
    const signature = request.headers.get('stripe-signature');
    const rawBody = await request.text();
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature || '', env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return new Response('Invalid signature', { status: 400 });
    }
  } else {
    try {
      event = await request.json();
    } catch (err) {
      return new Response('Invalid JSON', { status: 400 });
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    const items = lineItems.data.map((li) => ({
      name: li.description || li.price?.product?.toString() || 'Article',
      price: li.amount_total || li.price?.unit_amount || 0,
      quantity: li.quantity || 1,
    }));

    const record: OrderRecord = {
      id: session.id,
      status: session.payment_status || 'paid',
      amountTotal: session.amount_total || 0,
      currency: session.currency || 'eur',
      items,
      customer: {
        firstName: session.metadata?.firstName,
        lastName: session.metadata?.lastName,
        email: session.customer_details?.email || session.metadata?.email,
        phone: session.customer_details?.phone || session.metadata?.phone,
        address: session.metadata?.address,
        city: session.metadata?.city,
        postalCode: session.metadata?.postalCode,
        instructions: session.metadata?.instructions,
      },
      createdAt: new Date().toISOString(),
    };

    await storeOrder(env, record);
    await sendEmail(env, record);
    await sendSms(env, record);
  }

  return new Response('ok', { status: 200 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    if (origin && allowedOrigins.includes(origin)) {
      // CORS handled in jsonResponse
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    if (url.pathname.endsWith('/create-checkout-session')) {
      try {
        return await handleCreateCheckout(request, env, stripe);
      } catch (err) {
        return jsonResponse({ error: err instanceof Error ? err.message : 'Checkout failed' }, 400);
      }
    }

    if (url.pathname.endsWith('/webhook')) {
      return handleWebhook(request, env, stripe);
    }

    return new Response('Not Found', { status: 404 });
  },
};

```

## components/About.tsx

```
import React from 'react';
import { Utensils, Clock, ShoppingBag } from 'lucide-react';

export const About: React.FC = () => {
  return (
    <section id="presentation" className="relative py-20 bg-snack-black overflow-hidden">
      {/* Textured Background */}
      <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1615719413546-198b25453f85?q=80&w=1936&auto=format&fit=crop" 
            alt="Texture de fond rustique" 
            className="w-full h-full object-cover opacity-10 mix-blend-overlay" 
          />
          <div className="absolute inset-0 bg-gradient-to-r from-snack-black via-snack-black/95 to-snack-black/90"></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          
          {/* Text Content */}
          <div className="w-full lg:w-1/2">
            <span className="text-snack-gold font-display font-bold uppercase tracking-widest mb-2 block text-sm">À propos de nous</span>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6 uppercase leading-none">
              Friterie & Snack <br/><span className="text-gray-400">Authentique</span>
            </h2>
            
            <div className="w-20 h-1.5 bg-snack-gold mb-8"></div>

            <p className="text-gray-300 text-lg mb-6 leading-relaxed">
              Bienvenue chez <strong>Snack Family 2</strong>, votre friterie de référence à Wasmes. 
              Nous vous proposons une large gamme de spécialités belges : mitraillettes généreuses, frites croustillantes, 
              et viandes de qualité.
            </p>
            
            <div className="space-y-6 mt-8">
               <div className="flex items-start gap-4 group">
                  <div className="p-3 bg-white/10 rounded text-snack-gold group-hover:bg-snack-gold group-hover:text-snack-black transition-colors">
                    <Utensils size={24} />
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-lg text-white uppercase">Service Matin & Midi</h4>
                    <p className="text-gray-400 text-sm">Retrouvez nos sandwichs garnis froids préparés minute pour vos pauses déjeuner.</p>
                  </div>
               </div>
               
               <div className="flex items-start gap-4 group">
                  <div className="p-3 bg-white/10 rounded text-snack-gold group-hover:bg-snack-gold group-hover:text-snack-black transition-colors">
                    <ShoppingBag size={24} />
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-lg text-white uppercase">Commandes en ligne</h4>
                    <p className="text-gray-400 text-sm">Notre service de commande en ligne est disponible principalement pour le service du soir, à emporter ou en livraison.</p>
                  </div>
               </div>
            </div>
          </div>

          {/* Images - Clean Snack Food */}
          <div className="w-full lg:w-1/2 grid grid-cols-2 gap-4">
            <img 
              src="https://images.unsplash.com/photo-1573080496987-aeb4d9170d5c?q=80&w=800&auto=format&fit=crop" 
              alt="Frites belges" 
              className="w-full h-64 object-cover rounded shadow-lg transform translate-y-8 transition-all duration-500 ease-out hover:scale-105 hover:translate-y-6 border border-white/10"
            />
            <img 
              src="https://images.unsplash.com/photo-1561758033-d8f19662cb23?q=80&w=800&auto=format&fit=crop" 
              alt="Burger Snack" 
              className="w-full h-64 object-cover rounded shadow-lg transition-all duration-500 ease-out hover:scale-105 hover:-translate-y-2 border border-white/10"
            />
          </div>

        </div>
      </div>
    </section>
  );
};
```

## components/CancelPage.tsx

```
import React from 'react';
import { XCircle, ShoppingBag } from 'lucide-react';
import { Page } from '../types';

interface CancelPageProps {
  navigateTo: (page: Page) => void;
}

export const CancelPage: React.FC<CancelPageProps> = ({ navigateTo }) => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-20 bg-gray-50">
      <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center text-red-600 mb-6 shadow-lg">
        <XCircle size={48} />
      </div>
      <h1 className="text-4xl font-display font-bold text-snack-black uppercase mb-4">Paiement Annulé</h1>
      <p className="text-xl text-gray-600 max-w-lg mb-8">
        Vous avez annulé le processus de paiement. Aucun montant n'a été débité.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <button 
            onClick={() => navigateTo('commander')}
            className="bg-snack-gold text-snack-black px-8 py-3 rounded font-bold uppercase tracking-wider hover:bg-black hover:text-snack-gold transition-colors flex items-center gap-2 shadow-md"
        >
            <ShoppingBag size={20} />
            Retourner au panier
        </button>
      </div>
    </div>
  );
};
```

## components/ContactPage.tsx

```
import React from 'react';
import { Phone, Mail } from 'lucide-react';

export const ContactPage: React.FC = () => {
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        
        <div className="text-center mb-12">
            <h1 className="text-5xl font-display font-bold text-snack-black uppercase mb-4">Contactez-nous</h1>
            <p className="text-gray-500 text-lg">Une question ? Une commande spéciale ? Nous sommes là pour vous.</p>
        </div>

        <div className="max-w-2xl mx-auto">
            
            {/* Direct Contact */}
            <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-100">
                <h2 className="text-2xl font-display font-bold text-snack-black uppercase mb-6 border-b-2 border-snack-gold inline-block pb-1">Coordonnées</h2>
                
                <div className="space-y-6">
                    <a href="tel:+32465671893" className="flex items-center gap-4 group">
                        <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                            <Phone size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 uppercase font-bold">Téléphone</p>
                            <p className="text-xl font-bold text-snack-black group-hover:text-green-600 transition-colors">+32 465 67 18 93</p>
                        </div>
                    </a>

                    <a href="mailto:alahammouda2016@gmail.com" className="flex items-center gap-4 group">
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <Mail size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-400 uppercase font-bold">Email</p>
                            <p className="text-lg font-medium text-snack-black group-hover:text-blue-600 transition-colors break-all">alahammouda2016@gmail.com</p>
                        </div>
                    </a>
                </div>
            </div>
        </div>

        {/* FAQ Mini Section */}
        <div className="mt-16 text-center">
            <h3 className="text-xl font-bold text-snack-black uppercase mb-4">Questions Fréquentes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                <div className="bg-white p-4 rounded border border-gray-200">
                    <p className="font-bold text-snack-gold mb-1">Livrez-vous à domicile ?</p>
                    <p className="text-sm text-gray-600">Oui, nous livrons dans un rayon de 5km autour de Colfontaine le soir.</p>
                </div>
                <div className="bg-white p-4 rounded border border-gray-200">
                    <p className="font-bold text-snack-gold mb-1">Acceptez-vous la carte ?</p>
                    <p className="text-sm text-gray-600">Oui, nous acceptons Bancontact et Espèces au comptoir et en livraison.</p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};
```

## components/Footer.tsx

```
import React from 'react';
import { Page } from '../types';

interface FooterProps {
  navigateTo: (page: Page) => void;
}

export const Footer: React.FC<FooterProps> = ({ navigateTo }) => {
  return (
    <footer className="bg-black text-gray-500 py-12 border-t border-white/10 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-start gap-8">
          
          <div>
             <h3 className="block text-white font-display font-bold text-2xl uppercase mb-2">Snack Family <span className="text-snack-gold">2</span></h3>
             <p className="text-sm mb-4">Le goût authentique de la Belgique.</p>
             <div className="flex flex-col gap-2 text-xs text-gray-400">
                <span>7 Place Wasmes, 7340 Colfontaine</span>
                <a href="tel:+32465671893" className="hover:text-white transition-colors">+32 465 67 18 93</a>
                <a href="mailto:alahammouda2016@gmail.com" className="hover:text-white transition-colors">alahammouda2016@gmail.com</a>
             </div>
          </div>

          <div className="flex flex-col gap-2 text-sm uppercase tracking-wider font-medium">
            <button onClick={() => navigateTo('home')} className="text-left hover:text-white transition-colors">Accueil</button>
            <button onClick={() => navigateTo('menu')} className="text-left hover:text-white transition-colors">Menu</button>
            <button onClick={() => navigateTo('infos')} className="text-left hover:text-white transition-colors">Infos</button>
            <button onClick={() => navigateTo('commander')} className="text-left hover:text-snack-gold text-white transition-colors">Commander</button>
          </div>
        </div>
        <div className="mt-12 text-center text-xs text-gray-700 border-t border-white/5 pt-6">
          &copy; 2025 Snack Family 2. Tous droits réservés.
        </div>
      </div>
    </footer>
  );
};
```

## components/Header.tsx

```
import React, { useEffect, useState } from 'react';
import { Menu, X, ShoppingBag } from 'lucide-react';
import { Page } from '../types';

interface HeaderProps {
  currentPage: Page;
  navigateTo: (page: Page) => void;
  cartCount: number;
  toggleCart: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentPage, navigateTo, cartCount, toggleCart }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks: { name: string; page: Page }[] = [
    { name: 'Accueil', page: 'home' },
    { name: 'Menu', page: 'menu' },
    { name: 'Infos', page: 'infos' },
    { name: 'Contact', page: 'contact' },
  ];

  const handleNav = (page: Page) => {
    navigateTo(page);
    setIsMenuOpen(false);
  };

  // Close the mobile menu whenever the current page changes (including popstate/navigation)
  useEffect(() => {
    if (isMenuOpen) {
      setIsMenuOpen(false);
    }
  }, [currentPage, isMenuOpen]);

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-snack-black border-b border-white/10 shadow-lg h-24">
      <div className="container mx-auto px-4 h-full flex justify-between items-center">
        
        {/* LOGO */}
        <button onClick={() => handleNav('home')} className="flex flex-col group text-left">
            <h1 className="font-display font-bold text-white text-4xl tracking-tighter uppercase group-hover:text-snack-gold transition-colors leading-none">
                Snack Family <span className="text-snack-gold">2</span>
            </h1>
            <span className="text-gray-400 text-[10px] font-bold tracking-[0.4em] uppercase mt-1 group-hover:text-white transition-colors">
                Colfontaine
            </span>
        </button>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center space-x-10">
          {navLinks.map((link) => (
            <button 
              key={link.name} 
              onClick={() => handleNav(link.page)}
              className={`font-display font-bold text-lg uppercase tracking-wide transition-colors relative py-2 ${
                currentPage === link.page ? 'text-snack-gold' : 'text-white hover:text-snack-gold'
              }`}
            >
              {link.name}
              {currentPage === link.page && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-snack-gold"></span>
              )}
            </button>
          ))}
          
          <div className="flex items-center gap-4">
              {/* Cart Toggle Icon */}
              <button 
                onClick={toggleCart}
                className="relative text-white hover:text-snack-gold transition-colors p-2"
                aria-label="Panier"
              >
                  <ShoppingBag size={24} />
                  {cartCount > 0 && (
                      <span className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border border-snack-black">
                      {cartCount}
                      </span>
                  )}
              </button>

              {/* Commander Button - Navigates to Order Page */}
              <button 
                onClick={() => handleNav('commander')}
                className={`px-6 py-2.5 rounded font-display font-bold text-lg uppercase tracking-wide transition-all transform hover:-translate-y-0.5 shadow-lg ${
                    currentPage === 'commander' 
                    ? 'bg-white text-snack-black' 
                    : 'bg-snack-gold hover:bg-white text-snack-black'
                }`}
              >
                Commander
              </button>
          </div>
        </nav>

        {/* Mobile Menu Controls */}
        <div className="flex lg:hidden items-center gap-6">
            <button 
              onClick={toggleCart}
              className="relative text-snack-gold p-1 hover:text-white transition-colors"
              aria-label="Voir le panier"
            >
               <ShoppingBag size={28} />
               {cartCount > 0 && (
                   <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border border-snack-black">
                     {cartCount}
                   </span>
               )}
            </button>
            <button 
              className="text-white p-2 focus:outline-none hover:text-snack-gold transition-colors z-50 relative"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            >
              <div className={`transition-transform duration-300 ease-in-out ${isMenuOpen ? 'rotate-90' : 'rotate-0'}`}>
                {isMenuOpen ? <X size={32} /> : <Menu size={32} />}
              </div>
            </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      <div 
        className={`lg:hidden absolute top-full left-0 w-full bg-snack-black border-t border-gray-800 shadow-2xl transition-all duration-300 ease-in-out overflow-hidden origin-top ${
          isMenuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="flex flex-col p-8 space-y-6">
          {navLinks.map((link, index) => (
            <button 
              key={link.name} 
              onClick={() => handleNav(link.page)}
              className={`font-display text-2xl font-bold uppercase tracking-wide border-b border-gray-800 pb-4 text-left transition-all duration-300 ${
                currentPage === link.page ? 'text-snack-gold' : 'text-white hover:pl-2'
              }`}
              style={{ transitionDelay: `${index * 50}ms` }}
            >
              {link.name}
            </button>
          ))}
          <button 
            onClick={() => handleNav('commander')}
            className="w-full bg-snack-gold text-snack-black font-display font-bold text-xl uppercase tracking-wide py-4 text-center rounded mt-4 hover:bg-white transition-colors shadow-lg flex items-center justify-center gap-2"
          >
            <ShoppingBag size={20} />
            Commander
          </button>
        </div>
      </div>
    </header>
  );
};
```

## components/Hero.tsx

```
import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ArrowRight } from 'lucide-react';

export const Hero: React.FC = () => {
  return (
    <section id="home" className="relative h-[85vh] w-full overflow-hidden bg-snack-black">
      {/* Background Image - Mitraillette/Snack Focus */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1623246123320-4d3d358b1da6?q=80&w=1920&auto=format&fit=crop" 
          alt="Mitraillette belge avec frites" 
          className="w-full h-full object-cover object-center opacity-60" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-snack-black via-transparent to-snack-black/80"></div>
      </div>

      {/* Content */}
      <div className="relative z-20 h-full flex flex-col justify-center items-center text-center px-4 pt-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl"
        >
          <span className="inline-block py-1 px-3 border border-snack-gold text-snack-gold text-xs font-bold uppercase tracking-[0.2em] mb-6 rounded">
            Depuis 2019
          </span>
          
          <h1 className="text-5xl md:text-7xl font-display font-bold text-white mb-6 uppercase leading-tight">
            Snack Family <span className="text-snack-gold">2</span><br/>
            <span className="text-3xl md:text-5xl text-gray-200 font-normal normal-case">Votre snack friterie à Wasmes</span>
          </h1>
          
          <div className="flex flex-col md:flex-row gap-4 justify-center items-center mt-8">
            <a 
              href="#menu" 
              className="bg-snack-gold hover:bg-white text-snack-black px-8 py-4 rounded font-display font-bold text-xl uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
            >
              <span>Commander maintenant</span>
              <ArrowRight size={20} />
            </a>
            
            <a 
              href="#infos" 
              className="text-white border-2 border-white/30 hover:border-white px-8 py-3.5 rounded font-display font-bold text-lg uppercase tracking-wider transition-all hover:bg-white/10"
            >
              Infos & Horaires
            </a>
          </div>
        </motion.div>
      </div>

      {/* Scroll Indicator */}
      <motion.div 
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 text-white/70"
        animate={{ y: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        <ChevronDown size={32} />
      </motion.div>
    </section>
  );
};
```

## components/Home.tsx

```
import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Star, Utensils } from 'lucide-react';
import { Page } from '../types';

interface HomeProps {
  navigateTo: (page: Page) => void;
}

export const Home: React.FC<HomeProps> = ({ navigateTo }) => {
  
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 40 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { type: "spring", stiffness: 50, damping: 20 }
    }
  };

  const titleVariants = {
      hidden: { opacity: 0, y: -20 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  return (
    <div className="w-full">
      {/* HERO SECTION - Centered & Updated Background */}
      <section className="relative min-h-screen w-full overflow-hidden bg-snack-black flex items-center justify-center">
        <div className="absolute inset-0 z-0">
          {/* Hero Background: Updated with user specific image */}
          <img 
            src="https://t3.ftcdn.net/jpg/00/95/76/70/360_F_95767085_XpMCX6Cq49xlhMcTM5s8mbguWpo9eCt2.jpg" 
            alt="Snack Family 2 Background" 
            className="w-full h-full object-cover object-center opacity-50" 
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-black/60"></div>
        </div>

        {/* Content Container - Removed pt-20 for perfect vertical centering */}
        <div className="relative z-20 container mx-auto px-4 flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-5xl w-full flex flex-col items-center"
          >
            {/* Badge - Perfectly Centered */}
            <div className="mb-8 flex justify-center">
                <span className="bg-snack-gold text-snack-black px-6 py-2 font-display font-bold uppercase tracking-[0.2em] text-sm rounded shadow-lg border border-white/10">
                    Ouvert Midi & Soir
                </span>
            </div>
            
            {/* Title - Perfectly Centered */}
            <h1 
              className="text-5xl md:text-7xl lg:text-9xl font-display font-bold text-white mb-6 uppercase leading-none drop-shadow-2xl tracking-tight text-center"
              style={{ textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
            >
              Le Vrai Goût <br/><span className="text-snack-gold">Belge</span>
            </h1>
            
            {/* Subtitle - Perfectly Centered */}
            <p className="text-lg md:text-2xl text-gray-200 font-light max-w-3xl mx-auto mb-10 leading-relaxed drop-shadow-md text-center">
              Frites fraîches, viandes savoureuses et mitraillettes généreuses.<br className="hidden md:block"/>
              <span className="font-medium text-white">L'authentique snack de Colfontaine.</span>
            </p>
            
            {/* Buttons - Perfectly Centered & Aligned */}
            <div className="flex flex-col sm:flex-row gap-5 w-full justify-center items-center">
              <button 
                onClick={() => navigateTo('commander')}
                className="bg-snack-gold hover:bg-white text-snack-black min-w-[200px] px-8 py-4 rounded font-display font-bold text-lg uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-3 shadow-xl hover:shadow-2xl hover:scale-105"
              >
                <span>Commander</span>
                <ArrowRight size={20} />
              </button>
              
              <button 
                onClick={() => navigateTo('menu')}
                className="bg-white/10 backdrop-blur-sm border-2 border-white text-white hover:bg-white hover:text-snack-black min-w-[200px] px-8 py-4 rounded font-display font-bold text-lg uppercase tracking-wider transition-all duration-200 flex items-center justify-center shadow-lg hover:shadow-2xl hover:scale-105"
              >
                Voir le Menu
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* SPECIALTIES SECTION */}
      <section className="py-24 bg-gray-50">
        <div className="container mx-auto px-4">
            <motion.div 
              className="text-center mb-16"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={titleVariants}
            >
                <span className="text-snack-gold font-display font-bold text-sm uppercase tracking-[0.2em] block mb-2">Qualité & Tradition</span>
                <h2 className="text-4xl md:text-6xl font-display font-bold text-snack-black uppercase">Nos Spécialités</h2>
                <div className="w-24 h-1.5 bg-snack-black mx-auto mt-6 rounded-full"></div>
            </motion.div>

            <motion.div 
                className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10 max-w-7xl mx-auto"
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
            >
                
                {/* CARD 1: MITRAILLETTE */}
                <motion.div 
                    variants={cardVariants}
                    className="group cursor-pointer bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 flex flex-col h-full" 
                    onClick={() => navigateTo('menu')}
                >
                    <div className="h-72 overflow-hidden relative shrink-0">
                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500 z-10"></div>
                        <img 
                            src="https://external-preview.redd.it/i-ate-mitraillette-belgian-sandwich-v0-0ldkUUwxVvwj89WsLNeh0V1LA5knt3wsvkAijP-kO48.jpg?width=1080&crop=smart&auto=webp&s=c1a48e77958b210ae29deebccfd8ea66688f3991" 
                            alt="Mitraillette Belge - Baguette frites sauce" 
                            className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-110"
                            loading="lazy"
                        />
                    </div>
                    <div className="p-8 text-center flex flex-col items-center flex-grow relative">
                         <div className="absolute -top-7 bg-snack-black text-white p-3 rounded-full border-4 border-white shadow-lg z-20">
                            <Utensils size={24} />
                         </div>
                         <h3 className="text-2xl font-display font-bold text-snack-black uppercase mb-3 mt-4 group-hover:text-snack-gold transition-colors">Mitraillette</h3>
                         <p className="text-gray-600 text-sm leading-relaxed mb-6 flex-grow">
                           Le classique belge : demi-baguette, viande au choix, frites fraîches et sauce généreuse.
                         </p>
                         <span className="mt-auto inline-block text-snack-gold font-bold uppercase text-xs tracking-widest border-b-2 border-snack-gold pb-1">Choisir</span>
                    </div>
                </motion.div>

                {/* CARD 2: FRITES & SNACKS */}
                <motion.div 
                    variants={cardVariants}
                    className="group cursor-pointer bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 flex flex-col h-full" 
                    onClick={() => navigateTo('menu')}
                >
                    <div className="h-72 overflow-hidden relative shrink-0">
                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500 z-10"></div>
                        <img 
                            src="https://lvdneng.rosselcdn.net/sites/default/files/dpistyles_v2/ena_16_9_extra_big/2019/08/02/node_620600/40427962/public/2019/08/02/B9720457242Z.1_20190802154932_000%2BGFQE6BVPL.1-0.jpg?itok=V1WaHWU91564754610" 
                            alt="Frites et Snacks Belges sur plateau" 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                            loading="lazy"
                        />
                    </div>
                    <div className="p-8 text-center flex flex-col items-center flex-grow relative">
                         <div className="absolute -top-7 bg-snack-black text-white p-3 rounded-full border-4 border-white shadow-lg z-20">
                            <Star size={24} />
                         </div>
                         <h3 className="text-2xl font-display font-bold text-snack-black uppercase mb-3 mt-4 group-hover:text-snack-gold transition-colors">Frites & Snacks</h3>
                         <p className="text-gray-600 text-sm leading-relaxed mb-6 flex-grow">
                           Une envie de Mexicano, Fricadelle ou Poulycroc ? Accompagnez-les de nos frites dorées.
                         </p>
                         <span className="mt-auto inline-block text-snack-gold font-bold uppercase text-xs tracking-widest border-b-2 border-snack-gold pb-1">Voir la carte</span>
                    </div>
                </motion.div>

                {/* CARD 3: DURUMS */}
                <motion.div 
                    variants={cardVariants}
                    className="group cursor-pointer bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 flex flex-col h-full" 
                    onClick={() => navigateTo('menu')}
                >
                    <div className="h-72 overflow-hidden relative shrink-0">
                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500 z-10"></div>
                        <img 
                            src="https://latelierdurum.fr/wp-content/uploads/2024/10/Capture-decran-2024-10-26-125007-edited.png" 
                            alt="Dürüm Kebab Roulé" 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                            loading="lazy"
                        />
                    </div>
                    <div className="p-8 text-center flex flex-col items-center flex-grow relative">
                         <div className="absolute -top-7 bg-snack-black text-white p-3 rounded-full border-4 border-white shadow-lg z-20">
                            <Utensils size={24} />
                         </div>
                         <h3 className="text-2xl font-display font-bold text-snack-black uppercase mb-3 mt-4 group-hover:text-snack-gold transition-colors">Dürüms</h3>
                         <p className="text-gray-600 text-sm leading-relaxed mb-6 flex-grow">
                           Galette chaude roulée, garnie de viande grillée et de crudités croquantes.
                         </p>
                         <span className="mt-auto inline-block text-snack-gold font-bold uppercase text-xs tracking-widest border-b-2 border-snack-gold pb-1">Composer</span>
                    </div>
                </motion.div>

            </motion.div>
        </div>
      </section>

      {/* PROMO BANNER */}
      <section className="py-20 bg-snack-gold">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-center gap-12 text-center md:text-left">
            <div className="bg-snack-black text-white p-6 rounded-full shadow-2xl shrink-0">
                <Utensils size={40} />
            </div>
            <div className="max-w-xl">
                <h2 className="text-3xl md:text-4xl font-display font-bold text-snack-black uppercase mb-3">Faim de loup ?</h2>
                <p className="text-snack-black/80 font-medium text-lg leading-relaxed">
                    Évitez l'attente ! Commandez en ligne pour le service du soir et récupérez votre repas chaud.
                </p>
            </div>
            <div>
                <button 
                    onClick={() => navigateTo('commander')}
                    className="bg-snack-black text-white hover:bg-white hover:text-black px-10 py-5 rounded font-display font-bold text-xl uppercase tracking-wide transition-all shadow-2xl transform hover:-translate-y-1 whitespace-nowrap flex items-center gap-3"
                >
                    <span>Je commande</span>
                    <ArrowRight size={20} />
                </button>
            </div>
        </div>
      </section>
    </div>
  );
}
```

## components/InfoPage.tsx

```
import React from 'react';
import { MapPin, Clock, Phone, Mail } from 'lucide-react';

export const InfoPage: React.FC = () => {
  return (
    <div className="bg-white min-h-screen">
       {/* Header */}
       <div className="bg-snack-black text-white py-16">
         <div className="container mx-auto px-4 text-center">
            <span className="text-snack-gold font-display font-bold uppercase tracking-widest text-sm">Pratique</span>
            <h1 className="text-5xl font-display font-bold uppercase mt-2">Infos & Horaires</h1>
         </div>
       </div>

       <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 max-w-6xl mx-auto">
             
             {/* Hours Card */}
             <div className="bg-gray-50 p-8 rounded-lg border border-gray-100 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                    <div className="bg-snack-gold p-3 rounded-full text-snack-black">
                        <Clock size={24} />
                    </div>
                    <h2 className="text-2xl font-display font-bold uppercase text-snack-black">Horaires d'ouverture</h2>
                </div>
                
                <div className="space-y-4 text-lg">
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                        <span className="font-medium text-gray-600">Lundi</span>
                        <span className="font-bold text-snack-black">11h00 – 23h00</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                        <span className="font-medium text-gray-600">Mardi</span>
                        <span className="font-bold text-snack-black">11h00 – 23h00</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                        <span className="font-medium text-gray-600">Mercredi</span>
                        <span className="font-bold text-snack-black">11h00 – 23h00</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                        <span className="font-medium text-gray-600">Jeudi</span>
                        <span className="font-bold text-snack-black">11h00 – 23h00</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                        <span className="font-medium text-gray-600">Vendredi</span>
                        <span className="font-bold text-snack-black">11h00 – 23h00</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-200 pb-2">
                        <span className="font-medium text-gray-600">Samedi</span>
                        <span className="font-bold text-snack-black">11h00 – 23h00</span>
                    </div>
                    <div className="flex justify-between pb-2">
                        <span className="font-medium text-snack-gold">Dimanche</span>
                        <span className="font-bold text-snack-gold">16h30 – 23h00</span>
                    </div>
                </div>
             </div>

             {/* Location Card */}
             <div className="space-y-8">
                 <div className="bg-snack-black text-white p-8 rounded-lg shadow-lg">
                    <div className="flex items-start gap-4 mb-6">
                        <MapPin className="text-snack-gold shrink-0" size={32} />
                        <div>
                            <h3 className="font-display font-bold text-2xl uppercase mb-2">Adresse</h3>
                            <p className="text-xl text-gray-300 leading-relaxed">
                                7 Place de Wasmes<br/>
                                7340 Colfontaine<br/>
                                Belgique
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-4 mb-6">
                        <Phone className="text-snack-gold shrink-0" size={32} />
                        <div>
                            <h3 className="font-display font-bold text-2xl uppercase mb-2">Téléphone</h3>
                            <a href="tel:+32465671893" className="text-xl text-gray-300 hover:text-snack-gold transition-colors">
                                +32 465 67 18 93
                            </a>
                        </div>
                    </div>

                    <div className="flex items-start gap-4">
                        <Mail className="text-snack-gold shrink-0" size={32} />
                        <div>
                            <h3 className="font-display font-bold text-2xl uppercase mb-2">Email</h3>
                            <a href="mailto:alahammouda2016@gmail.com" className="text-xl text-gray-300 hover:text-snack-gold transition-colors break-all">
                                alahammouda2016@gmail.com
                            </a>
                        </div>
                    </div>
                 </div>

                 <div className="bg-white p-2 rounded-lg shadow-md border border-gray-200 h-64">
                    <iframe 
                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2543.8889977632!2d3.8397!3d50.4006!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c24f9a7c7a7a7f%3A0x123456789abcdef!2sPlace%20de%20Wasmes%207%2C%207340%20Colfontaine%2C%20Belgium!5e0!3m2!1sen!2sbe!4v1620000000000!5m2!1sen!2sbe" 
                        width="100%" 
                        height="100%" 
                        style={{ border: 0 }} 
                        allowFullScreen={true} 
                        loading="lazy"
                        title="Google Maps Snack Family 2"
                        className="rounded"
                    ></iframe>
                 </div>
             </div>

          </div>
       </div>
    </div>
  );
};
```

## components/InfoSection.tsx

```
import React from 'react';
import { Clock, MapPin, Phone, Mail } from 'lucide-react';

export const InfoSection: React.FC = () => {
  return (
    <section id="infos" className="bg-snack-black text-white scroll-mt-20">
      {/* Hidden anchor for contact compatibility */}
      <div id="contact" className="absolute -top-20"></div>
      
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* Info & Hours */}
          <div className="space-y-10">
             <div>
                <span className="text-snack-gold font-display font-bold uppercase tracking-widest text-sm mb-2 block">Pratique</span>
                <h2 className="text-4xl font-display font-bold uppercase mb-8">Infos & Contact</h2>
                
                <div className="flex items-start gap-4 mb-6">
                   <MapPin className="text-snack-gold mt-1" size={24} />
                   <div>
                      <h4 className="font-bold text-lg">Adresse</h4>
                      <p className="text-gray-300">7 Place Wasmes<br/>7340 Colfontaine, Belgique</p>
                   </div>
                </div>

                <div className="flex items-start gap-4 mb-6">
                   <Phone className="text-snack-gold mt-1" size={24} />
                   <div>
                      <h4 className="font-bold text-lg">Téléphone</h4>
                      <a href="tel:+32465671893" className="text-gray-300 hover:text-snack-gold transition-colors">
                        +32 465 67 18 93
                      </a>
                   </div>
                </div>

                <div className="flex items-start gap-4">
                   <Mail className="text-snack-gold mt-1" size={24} />
                   <div>
                      <h4 className="font-bold text-lg">Email</h4>
                      <a href="mailto:alahammouda2016@gmail.com" className="text-gray-300 hover:text-snack-gold transition-colors break-all">
                        alahammouda2016@gmail.com
                      </a>
                   </div>
                </div>
             </div>

             <div className="bg-white/5 p-8 rounded border border-white/10">
                <div className="flex items-center gap-3 mb-6">
                   <Clock className="text-snack-gold" size={24} />
                   <h3 className="font-display font-bold text-2xl uppercase">Horaires d'ouverture</h3>
                </div>
                <div className="space-y-4">
                   <div className="flex justify-between items-center border-b border-white/10 pb-3">
                      <span className="font-medium">Lundi – Samedi</span>
                      <span className="text-snack-gold font-bold">11h00 – 23h00</span>
                   </div>
                   <div className="flex justify-between items-center border-b border-white/10 pb-3">
                      <span className="font-medium">Dimanche</span>
                      <span className="text-snack-gold font-bold">16h30 – 23h00</span>
                   </div>
                </div>
             </div>
          </div>

          {/* Map */}
          <div className="h-full min-h-[400px] rounded overflow-hidden bg-gray-800 border border-white/10 relative z-10">
             <iframe 
               src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2543.8889977632!2d3.8397!3d50.4006!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x47c24f9a7c7a7a7f%3A0x123456789abcdef!2sPlace%20de%20Wasmes%207%2C%207340%20Colfontaine%2C%20Belgium!5e0!3m2!1sen!2sbe!4v1620000000000!5m2!1sen!2sbe" 
               width="100%" 
               height="100%" 
               style={{ border: 0 }} 
               allowFullScreen={true} 
               loading="lazy"
               title="Google Maps Snack Family 2"
               className="grayscale hover:grayscale-0 transition-all duration-500"
             ></iframe>
          </div>

        </div>
      </div>
    </section>
  );
};
```

## components/Menu.tsx

```
import React from 'react';
// This component seems unused in the main routing (App.tsx uses MenuPage), 
// but we keep it valid.
export const Menu: React.FC = () => {
  return (
    <section id="menu" className="py-20 bg-snack-light text-center">
      <p className="text-gray-500">Veuillez utiliser la page Menu dédiée pour commander.</p>
    </section>
  );
};
```

## components/MenuPage.tsx

```
import React, { useState } from 'react';
import { MENU_CATEGORIES } from '../data/menuData';
import { MenuItem, MenuCategory, SAUCES } from '../types';
import { Plus, Search } from 'lucide-react';

interface MenuPageProps {
  openOrderModal: (item: MenuItem, category: MenuCategory) => void;
}

export const MenuPage: React.FC<MenuPageProps> = ({ openOrderModal }) => {
  const [activeCategory, setActiveCategory] = useState(MENU_CATEGORIES[0].id);
  const [searchQuery, setSearchQuery] = useState('');

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    const element = document.getElementById(`cat-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Filter categories and items based on search query
  const filteredCategories = MENU_CATEGORIES.map(category => {
    if (!searchQuery) return category;

    const filteredItems = category.items.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return { ...category, items: filteredItems };
  }).filter(category => category.items.length > 0);

  return (
    <div className="bg-gray-50 min-h-screen pb-20">
      {/* Page Header */}
      <div className="bg-snack-black text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-display font-bold uppercase tracking-wide">Notre Carte</h1>
          <p className="text-gray-400 mt-2 max-w-2xl mx-auto mb-8">Découvrez nos spécialités belges, préparées avec passion.</p>
          
          {/* Search Bar */}
          <div className="max-w-xl mx-auto relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="text-gray-400 group-focus-within:text-snack-gold transition-colors" size={20} />
            </div>
            <input
              type="text"
              placeholder="Rechercher un produit (ex: Mitraillette, Burger...)"
              className="w-full pl-12 pr-4 py-3 rounded-full bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-snack-gold focus:bg-snack-black/50 transition-all backdrop-blur-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col lg:flex-row gap-8">
          
          {/* Categories Sidebar (Sticky) */}
          <div className="w-full lg:w-1/4">
            <div className="sticky top-24 bg-white rounded-lg shadow-md overflow-hidden">
              <div className="bg-snack-gold p-4">
                <h3 className="font-display text-snack-black font-bold text-lg uppercase">Catégories</h3>
              </div>
              <ul className="flex lg:flex-col overflow-x-auto lg:overflow-visible no-scrollbar divide-y divide-gray-100">
                {filteredCategories.map((cat) => (
                  <li key={cat.id} className="flex-shrink-0">
                    <button
                      onClick={() => scrollToCategory(cat.id)}
                      className={`w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between text-sm font-bold uppercase tracking-wide ${
                        activeCategory === cat.id ? 'text-snack-gold bg-gray-900' : 'text-gray-600'
                      }`}
                    >
                      {cat.title.replace(/^\d+\.\s/, '')}
                    </button>
                  </li>
                ))}
                {filteredCategories.length === 0 && (
                  <li className="p-5 text-gray-500 text-sm text-center italic">
                    Aucune catégorie trouvée
                  </li>
                )}
              </ul>
            </div>
          </div>

          {/* Menu List */}
          <div className="w-full lg:w-3/4 space-y-12">
            {filteredCategories.length > 0 ? (
              filteredCategories.map((cat) => (
                <div key={cat.id} id={`cat-${cat.id}`} className="scroll-mt-28">
                  <div className="flex items-end gap-4 mb-6 border-b-2 border-snack-gold pb-2">
                     <h2 className="text-3xl font-display font-bold text-snack-black uppercase leading-none">
                       {cat.title}
                     </h2>
                  </div>
                  {cat.description && <p className="text-gray-500 italic mb-6 -mt-4">{cat.description}</p>}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {cat.items.map((item, idx) => {
                      return (
                        <div key={idx} className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 hover:border-snack-gold hover:scale-[1.02] hover:shadow-md transition-all duration-200 group flex flex-col justify-between h-full">
                          <div>
                            <div className="flex justify-between items-start mb-2">
                              <h3 className="font-bold text-lg text-snack-black group-hover:text-snack-gold transition-colors">
                                {item.name}
                              </h3>
                              {item.unavailable && (
                                <span className="bg-red-100 text-red-600 text-[10px] font-bold uppercase px-2 py-1 rounded">
                                  Indisponible
                                </span>
                              )}
                            </div>
                            {item.description && <p className="text-sm text-gray-400 mb-4">{item.description}</p>}
                          </div>

                          <div className="flex items-end justify-between mt-4 pt-4 border-t border-gray-50">
                            <div className="flex flex-col">
                                {item.priceSecondary && (
                                    <span className="text-xs text-gray-400 font-medium uppercase">
                                        Seul: {Number(item.priceSecondary).toFixed(2)}€
                                    </span>
                                )}
                                <span className="text-xl font-bold text-snack-black">
                                    {Number(item.price).toFixed(2)} €
                                </span>
                                {item.priceSecondary && (
                                    <span className="text-[10px] text-snack-gold font-bold uppercase">
                                        {cat.id === 'mitraillettes' ? 'Mitraillette' : 'Menu / Frites'}
                                    </span>
                                )}
                            </div>
                            
                            {!item.unavailable && (
                              <button 
                                onClick={() => openOrderModal(item, cat)}
                                className="bg-snack-black text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-snack-gold hover:text-black transition-all duration-200 shadow-md transform active:scale-90 active:bg-green-600 active:text-white"
                              >
                                <Plus size={20} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-white p-12 rounded-lg shadow-sm border border-gray-200 text-center">
                <Search size={48} className="mx-auto text-gray-300 mb-4" />
                <h3 className="text-xl font-bold text-snack-black mb-2">Aucun résultat trouvé</h3>
                <p className="text-gray-500">Nous n'avons trouvé aucun produit correspondant à "{searchQuery}".</p>
                <button 
                  onClick={() => setSearchQuery('')}
                  className="mt-6 text-snack-gold font-bold uppercase tracking-wide underline hover:text-black"
                >
                  Voir tout le menu
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
```

## components/OrderPage.tsx

```
import React, { useState } from 'react';
import { MENU_CATEGORIES } from '../data/menuData';
import { MenuItem, MenuCategory } from '../types';
import { Plus } from 'lucide-react';

interface OrderPageProps {
  openOrderModal: (item: MenuItem, category: MenuCategory) => void;
}

export const OrderPage: React.FC<OrderPageProps> = ({ openOrderModal }) => {
  const [activeCategory, setActiveCategory] = useState('assiettes');

  const filteredCategory = MENU_CATEGORIES.find(c => c.id === activeCategory);

  return (
    <div className="bg-gray-100 min-h-screen h-full flex flex-col">
      
      {/* Mobile Category Select */}
      <div className="md:hidden p-4 bg-white sticky top-0 z-20 shadow-sm">
          <select 
              value={activeCategory} 
              onChange={(e) => setActiveCategory(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded font-bold uppercase text-sm"
          >
              {MENU_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.title}</option>
              ))}
          </select>
      </div>

      {/* Desktop Category Filter Bar */}
      <div className="hidden md:flex flex-wrap justify-center gap-2 p-6 bg-white shadow-sm sticky top-20 z-20">
            {MENU_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${
                      activeCategory === cat.id 
                      ? 'bg-snack-black text-snack-gold shadow-md' 
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {cat.title.replace(/^\d+\.\s/, '')}
                </button>
            ))}
      </div>

      {/* Products Grid */}
      <div className="p-4 md:p-8 pb-32 container mx-auto">
          {filteredCategory && (
              <div className="max-w-6xl mx-auto">
                  <div className="mb-6 text-center md:text-left">
                      <h2 className="text-3xl font-display font-bold uppercase text-snack-black">{filteredCategory.title}</h2>
                      <p className="text-gray-500 text-sm">{filteredCategory.description}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {filteredCategory.items.map((item, idx) => {
                          return (
                            <div 
                                key={idx}
                                className={`text-left bg-white p-6 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-full active:scale-[0.98] active:border-green-600 ${
                                    item.unavailable ? 'opacity-60 grayscale' : ''
                                }`}
                            >
                                <div className="w-full">
                                    <div className="flex justify-between items-start">
                                        <span className="font-bold text-snack-black text-xl leading-tight">{item.name}</span>
                                        {item.unavailable && (
                                            <span className="bg-red-100 text-red-600 text-[10px] font-bold uppercase px-2 py-1 rounded">Indisponible</span>
                                        )}
                                    </div>
                                    {item.description && <p className="text-sm text-gray-400 mt-2">{item.description}</p>}
                                </div>
                                
                                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between w-full">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-xl text-snack-black">{Number(item.price).toFixed(2)}€</span>
                                        {item.priceSecondary && (
                                            <span className="text-[10px] text-gray-400 font-medium uppercase">
                                                {filteredCategory.id === 'mitraillettes' ? 'Mitraillette' : 'Menu'}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {!item.unavailable && (
                                        <button 
                                          onClick={() => openOrderModal(item, filteredCategory)}
                                          className="bg-snack-gold text-snack-black px-4 py-2 rounded font-bold uppercase text-sm flex items-center gap-2 hover:bg-black hover:text-snack-gold transition-colors"
                                        >
                                            <span>Ajouter</span>
                                            <Plus size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>
                          );
                      })}
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};
```

## components/OrderUI.tsx

```
import React, { useState, useEffect } from 'react';
import { X, Minus, Plus, ShoppingBag, Trash2, CreditCard } from 'lucide-react';
import { MenuItem, MenuCategory, SAUCES, SUPPLEMENTS, VEGGIES, CartItem } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { startCheckout, runDevTest, CheckoutCustomerInfo } from '../lib/stripe';

interface OrderUIProps {
  isOrderModalOpen: boolean;
  selectedItem: MenuItem | null;
  selectedCategory: MenuCategory | null;
  closeOrderModal: () => void;
  addToCart: (item: CartItem) => void;
  
  isCartOpen: boolean;
  closeCart: () => void;
  cartItems: CartItem[];
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  isCommanderPage?: boolean;
}

export const OrderUI: React.FC<OrderUIProps> = ({
  isOrderModalOpen,
  selectedItem,
  selectedCategory,
  closeOrderModal,
  addToCart,
  isCartOpen,
  closeCart,
  cartItems,
  removeFromCart,
  clearCart,
  isCommanderPage = false
}) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedSauce, setSelectedSauce] = useState<string>('Sans sauce');
  const [selectedSupplements, setSelectedSupplements] = useState<string[]>([]);
  const [selectedVeggies, setSelectedVeggies] = useState<string[]>([]);
  
  const [variant, setVariant] = useState<'Menu/Frites' | 'Solo'>('Menu/Frites');
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState<CheckoutCustomerInfo>({});

  const sanitizeInput = (value: string, max = 200) => {
    const withoutControls = value
      // strip ASCII control characters
      .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F]+/g, ' ')
      // neutralize angle brackets
      .replace(/[<>]/g, ' ');

    const cleaned = withoutControls.replace(/\s{2,}/g, ' ').trim();
    return cleaned.slice(0, max);
  };

  const sanitizeEmail = (value: string) => {
    const cleaned = sanitizeInput(value, 160);
    const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    return emailPattern.test(cleaned) ? cleaned : '';
  };

  const sanitizeDeliveryInfo = (info?: CheckoutCustomerInfo): CheckoutCustomerInfo => {
    if (!info || typeof info !== 'object') return {};

    const cleaned: CheckoutCustomerInfo = {};

    const setField = (key: keyof CheckoutCustomerInfo, value?: string, max = 200) => {
      if (!value) return;
      const safeValue = sanitizeInput(String(value), max);
      if (safeValue) cleaned[key] = safeValue;
    };

    setField('firstName', info.firstName, 80);
    setField('lastName', info.lastName, 80);
    setField('address', info.address, 200);
    setField('city', info.city, 120);
    setField('postalCode', info.postalCode, 20);
    setField('phone', info.phone, 40);
    setField('instructions', info.instructions, 300);

    if (info.email) {
      const validEmail = sanitizeEmail(info.email);
      if (validEmail) cleaned.email = validEmail;
    }

    return cleaned;
  };

  // Restore persisted delivery info to ease repeat orders
  useEffect(() => {
    try {
      const raw = localStorage.getItem('snackfamily_delivery');
      if (raw) {
        const parsed = JSON.parse(raw) as CheckoutCustomerInfo;
        const cleaned = sanitizeDeliveryInfo(parsed);
        if (Object.keys(cleaned).length > 0) {
          setDeliveryInfo(cleaned);
        }
      }
    } catch (e) {
      console.warn('Unable to restore delivery info', e);
    }
  }, []);

  useEffect(() => {
    try {
      const cleaned = sanitizeDeliveryInfo(deliveryInfo);
      if (Object.keys(cleaned).length > 0) {
        localStorage.setItem('snackfamily_delivery', JSON.stringify(cleaned));
      } else {
        localStorage.removeItem('snackfamily_delivery');
      }
    } catch (e) {
      console.warn('Unable to persist delivery info', e);
    }
  }, [deliveryInfo]);

  useEffect(() => {
    if (isOrderModalOpen) {
      setQuantity(1);
      setSelectedSauce('Sans sauce');
      setSelectedSupplements([]);
      // FIX: Default to NO veggies selected (empty array)
      setSelectedVeggies([]);
      setVariant('Menu/Frites');
    }
  }, [isOrderModalOpen, selectedItem]);

  const handleSupplementToggle = (suppName: string) => {
    if (selectedSupplements.includes(suppName)) {
      setSelectedSupplements(selectedSupplements.filter(s => s !== suppName));
    } else {
      setSelectedSupplements([...selectedSupplements, suppName]);
    }
  };

  const handleVeggieToggle = (vegName: string) => {
    if (selectedVeggies.includes(vegName)) {
        setSelectedVeggies(selectedVeggies.filter(v => v !== vegName));
    } else {
        setSelectedVeggies([...selectedVeggies, vegName]);
    }
  };

  const getCurrentItemPrice = () => {
    if (!selectedItem) return 0;
    let base = variant === 'Solo' && selectedItem.priceSecondary 
        ? Number(selectedItem.priceSecondary) 
        : Number(selectedItem.price);
    
    const suppsCost = selectedSupplements.length * 0.80;
    return base + suppsCost;
  };

  const handleAddToCart = () => {
    if (!selectedItem) return;
    const itemTotal = getCurrentItemPrice();
    
    const newItem: CartItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: selectedItem.name,
      price: itemTotal,
      quantity: quantity,
      selectedSauce: selectedCategory?.hasSauces ? selectedSauce : undefined,
      selectedSupplements: selectedCategory?.hasSupplements ? selectedSupplements : undefined,
      selectedVeggies: selectedCategory?.hasVeggies ? selectedVeggies : undefined,
      variant: selectedItem.priceSecondary ? variant : undefined
    };

    addToCart(newItem);
    closeOrderModal();
  };

  const handleDeliveryChange = (key: keyof CheckoutCustomerInfo, value: string, max = 200) => {
    const sanitizedValue = key === 'email' ? sanitizeEmail(value) : sanitizeInput(value, max);
    setDeliveryInfo((prev) => ({
      ...prev,
      [key]: sanitizedValue || undefined,
    }));
  };

  const handleStripeCheckout = async () => {
    if (isCheckingOut) return;
    if (cartItems.length === 0) return;
    setIsCheckingOut(true);

    try {
      const checkoutItems = cartItems.map(item => {
        // Build a descriptive name including options for Stripe Line Items
        let description = item.name;
        if (item.variant) description += ` (${item.variant})`;
        if (item.selectedSauce) description += ` - ${item.selectedSauce}`;
        if (item.selectedSupplements && item.selectedSupplements.length > 0) {
          description += ` + ${item.selectedSupplements.join(', ')}`;
        }

        return {
          name: description,
          // IMPORTANT: Stripe expects integer cents.
          // We round to avoid floating point errors
          price: Math.round(item.price * 100),
          quantity: item.quantity
        };
      });

      await startCheckout(checkoutItems, { customer: deliveryInfo });
      // Page redirects on success
    } catch (error) {
      console.error("Checkout failed", error);
      alert(
        `Le paiement n'a pas pu démarrer. ${error instanceof Error ? error.message : 'Veuillez vérifier la configuration Stripe et réessayer.'}`,
      );
    } finally {
      setIsCheckingOut(false);
    }
  };

  const cartTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <>
      {/* --- ORDER MODAL --- */}
      <AnimatePresence>
        {isOrderModalOpen && selectedItem && selectedCategory && (
          <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center pointer-events-none">
            <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-sm pointer-events-auto"
                onClick={closeOrderModal}
            />
            <motion.div 
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="bg-white w-full md:w-[600px] max-h-[90vh] md:rounded-xl shadow-2xl flex flex-col pointer-events-auto overflow-hidden"
            >
                <div className="bg-snack-black text-white p-5 flex justify-between items-center">
                   <div>
                       <h3 className="font-display font-bold text-2xl uppercase tracking-wide">{selectedItem.name}</h3>
                       <span className="text-snack-gold text-sm font-medium uppercase tracking-wider">{selectedCategory.title}</span>
                   </div>
                   <button onClick={closeOrderModal} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                       <X size={24} />
                   </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-8 bg-gray-50">
                   {selectedItem.priceSecondary && (
                       <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                           <h4 className="font-bold text-snack-black uppercase mb-3 text-sm tracking-wider flex items-center gap-2">
                             <span className="w-2 h-2 bg-snack-gold rounded-full"></span> Format
                           </h4>
                           <div className="grid grid-cols-2 gap-4">
                               <button onClick={() => setVariant('Menu/Frites')} className={`p-3 rounded border-2 text-sm font-bold uppercase flex flex-col items-center justify-center gap-1 transition-all ${variant === 'Menu/Frites' ? 'border-snack-gold bg-snack-gold/10 text-black' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                                   <span>{selectedCategory.id === 'mitraillettes' ? 'Mitraillette (+Frites)' : 'Menu / Frites'}</span>
                                   <span className="text-lg">{Number(selectedItem.price).toFixed(2)} €</span>
                               </button>
                               <button onClick={() => setVariant('Solo')} className={`p-3 rounded border-2 text-sm font-bold uppercase flex flex-col items-center justify-center gap-1 transition-all ${variant === 'Solo' ? 'border-snack-gold bg-snack-gold/10 text-black' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                                   <span>{selectedCategory.id === 'mitraillettes' ? 'Pain Seul' : 'Seul / Pain'}</span>
                                   <span className="text-lg">{Number(selectedItem.priceSecondary).toFixed(2)} €</span>
                               </button>
                           </div>
                       </div>
                   )}

                   {selectedCategory.hasSauces && (
                       <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                           <h4 className="font-bold text-snack-black uppercase mb-3 text-sm tracking-wider flex items-center gap-2">
                             <span className="w-2 h-2 bg-snack-gold rounded-full"></span> Sauce
                           </h4>
                           <select value={selectedSauce} onChange={(e) => setSelectedSauce(e.target.value)} className="w-full p-3 border border-gray-300 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none bg-white font-medium">
                               {SAUCES.map(s => <option key={s} value={s}>{s}</option>)}
                           </select>
                       </div>
                   )}

                   {selectedCategory.hasVeggies && (
                       <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                           <div className="flex justify-between items-center mb-3">
                                <h4 className="font-bold text-snack-black uppercase text-sm tracking-wider flex items-center gap-2">
                                    <span className="w-2 h-2 bg-snack-gold rounded-full"></span> Crudités
                                </h4>
                                <div className="text-xs space-x-2 font-bold">
                                    <button onClick={() => setSelectedVeggies(VEGGIES)} className="text-snack-gold hover:underline uppercase">Tout</button>
                                    <span className="text-gray-300">|</span>
                                    <button onClick={() => setSelectedVeggies([])} className="text-gray-400 hover:underline uppercase">Rien</button>
                                </div>
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                               {VEGGIES.map(veg => (
                                   <label key={veg} className="flex items-center space-x-2 cursor-pointer select-none p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-colors">
                                       <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedVeggies.includes(veg) ? 'bg-snack-black border-snack-black' : 'border-gray-300'}`}>
                                           {selectedVeggies.includes(veg) && <div className="w-2 h-2 bg-snack-gold rounded-full"></div>}
                                       </div>
                                       <input type="checkbox" checked={selectedVeggies.includes(veg)} onChange={() => handleVeggieToggle(veg)} className="hidden" />
                                       <span className={`text-sm ${selectedVeggies.includes(veg) ? 'text-snack-black font-bold' : 'text-gray-500'}`}>{veg}</span>
                                   </label>
                               ))}
                           </div>
                       </div>
                   )}

                   {selectedCategory.hasSupplements && (
                       <div className="bg-white p-4 rounded border border-gray-200 shadow-sm">
                           <h4 className="font-bold text-snack-black uppercase mb-3 text-sm tracking-wider flex items-center gap-2">
                               <span className="w-2 h-2 bg-snack-gold rounded-full"></span> Suppléments (+0.80€)
                           </h4>
                           <div className="grid grid-cols-2 gap-2">
                               {SUPPLEMENTS.map(sup => (
                                   <label key={sup.name} className={`flex items-center justify-between cursor-pointer select-none p-3 border rounded transition-all ${selectedSupplements.includes(sup.name) ? 'border-snack-gold bg-yellow-50/50' : 'border-gray-200 hover:border-gray-300'}`}>
                                       <div className="flex items-center space-x-2">
                                            <input type="checkbox" checked={selectedSupplements.includes(sup.name)} onChange={() => handleSupplementToggle(sup.name)} className="accent-snack-gold w-4 h-4" />
                                            <span className="text-sm font-bold text-snack-black">{sup.name}</span>
                                       </div>
                                       <span className="text-xs font-bold text-snack-gold bg-black px-1.5 py-0.5 rounded">+0.80€</span>
                                   </label>
                               ))}
                           </div>
                       </div>
                   )}
                </div>

                <div className="p-5 border-t border-gray-200 bg-white flex items-center gap-4 shadow-up-lg">
                    <div className="flex items-center border-2 border-gray-200 rounded-lg bg-white h-12">
                        <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500"><Minus size={18} /></button>
                        <span className="w-10 text-center font-bold text-lg text-snack-black">{quantity}</span>
                        <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-full flex items-center justify-center hover:bg-gray-100 text-gray-500"><Plus size={18} /></button>
                    </div>
                    <button onClick={handleAddToCart} className="flex-1 bg-snack-gold text-snack-black h-14 rounded-lg font-display font-bold text-lg uppercase tracking-wide hover:bg-black hover:text-snack-gold transition-all duration-200 flex items-center justify-between px-6 shadow-lg active:scale-95 active:bg-green-600 active:text-white">
                        <span>Ajouter</span>
                        <span>{(getCurrentItemPrice() * quantity).toFixed(2)} €</span>
                    </button>
                </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- CART DRAWER --- */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]"
                onClick={closeCart}
            />
            <motion.div
                initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed top-0 right-0 h-full w-full md:w-[450px] bg-white shadow-2xl z-[80] flex flex-col relative"
            >
                <AnimatePresence>
                {isClearConfirmOpen && (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm z-[90] flex items-center justify-center p-6"
                    >
                        <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-xs text-center">
                             <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                                 <Trash2 size={24} />
                             </div>
                             <h3 className="font-display font-bold text-xl uppercase text-snack-black mb-2">Vider le panier ?</h3>
                             <p className="text-gray-500 text-sm mb-6">Cette action supprimera tous les articles de votre commande.</p>
                             <div className="grid grid-cols-2 gap-3">
                                 <button onClick={() => setIsClearConfirmOpen(false)} className="py-2 rounded-lg border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors">Annuler</button>
                                 <button onClick={() => { clearCart(); setIsClearConfirmOpen(false); }} className="py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700 transition-colors">Vider</button>
                             </div>
                        </div>
                    </motion.div>
                )}
                </AnimatePresence>

                <div className="p-5 bg-snack-black text-white flex justify-between items-center shadow-md relative z-10">
                    <div className="flex items-center gap-3">
                        <ShoppingBag className="text-snack-gold" />
                        <h2 className="font-display font-bold text-xl uppercase">Votre Panier</h2>
                    </div>
                    <div className="flex items-center gap-4">
                         {cartItems.length > 0 && (
                            <button onClick={() => setIsClearConfirmOpen(true)} className="text-xs font-bold text-gray-400 hover:text-red-500 uppercase tracking-wider transition-colors">Vider</button>
                        )}
                        <button onClick={closeCart} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50">
                    {cartItems.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <ShoppingBag size={64} className="mb-4 opacity-20" />
                            <p className="text-lg font-medium">Votre panier est vide</p>
                            <button onClick={closeCart} className="mt-4 text-snack-gold underline font-bold uppercase text-sm">Continuer mes achats</button>
                            <div className="mt-12 text-center">
                                <button 
                                  onClick={() => runDevTest()}
                                  className="text-xs text-gray-300 hover:text-red-500 underline"
                                >
                                  Test paiement (DEV)
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                          <div className="space-y-4">
                            {cartItems.map((item) => (
                                <div key={item.id} className="border border-gray-200 rounded-lg p-4 shadow-sm bg-white relative group hover:border-snack-gold transition-colors">
                                    <button onClick={() => removeFromCart(item.id)} className="absolute top-3 right-3 text-gray-300 hover:text-red-500 transition-colors p-1"><Trash2 size={18} /></button>
                                    <div><h4 className="font-bold text-snack-black text-lg">{item.name}</h4>{item.variant && <span className="text-[10px] font-bold text-black uppercase bg-snack-gold px-1.5 py-0.5 rounded mr-2">{item.variant === 'Menu/Frites' ? 'Menu/Frites' : 'Seul'}</span>}</div>
                                    <div className="mt-2 text-sm text-gray-500 space-y-1 border-l-2 border-gray-100 pl-3">
                                        {item.selectedSauce && <p><span className="font-bold text-xs uppercase">Sauce:</span> {item.selectedSauce}</p>}
                                        {item.selectedVeggies && <p><span className="font-bold text-xs uppercase">Crudités:</span> {item.selectedVeggies.length === VEGGIES.length ? 'Tout' : item.selectedVeggies.length === 0 ? 'Aucune' : item.selectedVeggies.join(', ')}</p>}
                                        {item.selectedSupplements && item.selectedSupplements.length > 0 && <p className="text-snack-black font-bold">+ {item.selectedSupplements.join(', ')}</p>}
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-gray-50 flex justify-between items-center">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Qté: {item.quantity}</span>
                                        <span className="font-bold text-lg text-snack-black">{(item.price * item.quantity).toFixed(2)} €</span>
                                    </div>
                                </div>
                            ))}
                          </div>

                          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <h3 className="font-display font-bold text-lg uppercase text-snack-black mb-3">Informations de livraison</h3>
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <input
                                  type="text"
                                  placeholder="Prénom"
                                  value={deliveryInfo.firstName || ''}
                                  onChange={(e) => handleDeliveryChange('firstName', e.target.value, 80)}
                                  className="w-full p-3 border border-gray-200 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder="Nom"
                                  value={deliveryInfo.lastName || ''}
                                  onChange={(e) => handleDeliveryChange('lastName', e.target.value, 80)}
                                  className="w-full p-3 border border-gray-200 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none"
                                />
                              </div>
                              <input
                                type="email"
                                placeholder="Email"
                                value={deliveryInfo.email || ''}
                                onChange={(e) => handleDeliveryChange('email', e.target.value, 120)}
                                className="w-full p-3 border border-gray-200 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none"
                              />
                              <input
                                type="text"
                                placeholder="Adresse"
                                value={deliveryInfo.address || ''}
                                onChange={(e) => handleDeliveryChange('address', e.target.value, 200)}
                                className="w-full p-3 border border-gray-200 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none"
                              />
                              <div className="grid grid-cols-2 gap-3">
                                <input
                                  type="text"
                                  placeholder="Code postal"
                                  value={deliveryInfo.postalCode || ''}
                                  onChange={(e) => handleDeliveryChange('postalCode', e.target.value, 20)}
                                  className="w-full p-3 border border-gray-200 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none"
                                />
                                <input
                                  type="text"
                                  placeholder="Ville"
                                  value={deliveryInfo.city || ''}
                                  onChange={(e) => handleDeliveryChange('city', e.target.value, 120)}
                                  className="w-full p-3 border border-gray-200 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none"
                                />
                              </div>
                              <input
                                type="tel"
                                placeholder="Téléphone"
                                value={deliveryInfo.phone || ''}
                                onChange={(e) => handleDeliveryChange('phone', e.target.value, 40)}
                                className="w-full p-3 border border-gray-200 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none"
                              />
                              <textarea
                                placeholder="Instructions de livraison (étage, digicode, etc.)"
                                value={deliveryInfo.instructions || ''}
                                onChange={(e) => handleDeliveryChange('instructions', e.target.value, 300)}
                                className="w-full p-3 border border-gray-200 rounded focus:border-snack-gold focus:ring-1 focus:ring-snack-gold outline-none min-h-[80px]"
                              />
                            </div>
                          </div>
                        </>
                    )}
                </div>

                {cartItems.length > 0 && (
                    <div className="p-6 border-t border-gray-200 bg-white shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                        <div className="flex justify-between items-center mb-6">
                            <span className="text-gray-500 uppercase font-bold tracking-wider text-sm">Total</span>
                            <span className="text-3xl font-display font-bold text-snack-black">{cartTotal.toFixed(2)} €</span>
                        </div>
                        <button 
                            id="stripe-checkout-btn"
                            onClick={handleStripeCheckout}
                            disabled={isCheckingOut}
                            className={`w-full bg-snack-gold text-snack-black py-4 rounded font-display font-bold text-xl uppercase tracking-wide border border-transparent transition-all shadow-lg flex items-center justify-center gap-2 group ${isCheckingOut ? 'opacity-75 cursor-not-allowed' : 'hover:bg-white hover:border-snack-black hover:border-gray-200'}`}
                        >
                            {isCheckingOut ? (<span>Chargement...</span>) : (<><CreditCard size={24} className="group-hover:scale-110 transition-transform" /><span>Payer avec Stripe</span></>)}
                        </button>
                        <div className="mt-4 text-center">
                            <button 
                              onClick={() => runDevTest()}
                              className="text-xs text-gray-300 hover:text-red-500 underline"
                            >
                              Test paiement (DEV)
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

```

## components/OrderingCTA.tsx

```
import React, { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Page } from '../types';

interface OrderingCTAProps {
    toggleCart: () => void;
    navigateTo: (page: Page) => void;
}

export const OrderingCTA: React.FC<OrderingCTAProps> = ({ toggleCart, navigateTo }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 500);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div 
      className={`fixed bottom-6 right-6 z-40 transition-all duration-500 transform ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'
      }`}
    >
      <button 
        onClick={() => navigateTo('commander')}
        className="flex items-center gap-3 bg-snack-gold hover:bg-white text-snack-black py-4 px-8 rounded shadow-xl font-display font-bold text-xl uppercase tracking-wider border border-snack-black/10 hover:scale-105 transition-all"
      >
        <ShoppingBag size={24} />
        <span>Commander</span>
      </button>
    </div>
  );
};
```

## components/SuccessPage.tsx

```
import React from 'react';
import { CheckCircle, Home } from 'lucide-react';
import { Page } from '../types';

interface SuccessPageProps {
  navigateTo: (page: Page) => void;
}

export const SuccessPage: React.FC<SuccessPageProps> = ({ navigateTo }) => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-20 bg-gray-50">
      <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-6 shadow-lg">
        <CheckCircle size={48} />
      </div>
      <h1 className="text-4xl font-display font-bold text-snack-black uppercase mb-4">Paiement Réussi !</h1>
      <p className="text-xl text-gray-600 max-w-lg mb-8">
        Merci pour votre commande. Nous allons commencer la préparation de votre repas immédiatement.
      </p>
      <button 
        onClick={() => navigateTo('home')}
        className="bg-snack-gold text-snack-black px-8 py-3 rounded font-bold uppercase tracking-wider hover:bg-black hover:text-snack-gold transition-colors flex items-center gap-2 shadow-md"
      >
        <Home size={20} />
        Retour à l'accueil
      </button>
    </div>
  );
};
```

