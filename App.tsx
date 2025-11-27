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

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPage(getInitialPage());
      setIsCartOpen(false);
      closeOrderModal();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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