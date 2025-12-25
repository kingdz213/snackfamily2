import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { MenuPage } from './components/MenuPage';
import { InfoPage } from './components/InfoPage';
import { ContactPage } from './components/ContactPage';
import { OrderPage } from './components/OrderPage';
import { SuccessPage } from './components/SuccessPage';
import { CancelPage } from './components/CancelPage';
import { OrderStatusPage } from './components/OrderStatusPage';
import { Footer } from './components/Footer';
import { OrderingCTA } from './components/OrderingCTA';
import { OrderUI } from './components/OrderUI';
import { AdminPage } from './components/AdminPage';
import { CartItem, MenuItem, MenuCategory, Page } from './types';

const pageToPath: Record<Page, string> = {
  home: '/',
  menu: '/menu',
  infos: '/infos',
  contact: '/contact',
  commander: '/commander',
  admin: '/admin',
  success: '/success',
  cancel: '/cancel',
  orderStatus: '/order',
};

const getOrderIdFromPath = (pathname: string): string | null => {
  if (!pathname.startsWith('/order/')) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  return segments[1] || null;
};

const getPageFromLocation = (): { page: Page; orderId?: string } => {
  try {
    const { pathname, search } = window.location;

    if (search.includes('success=true')) return { page: 'success' };
    if (search.includes('canceled=true')) return { page: 'cancel' };

    const orderId = getOrderIdFromPath(pathname);
    if (orderId) return { page: 'orderStatus', orderId };

    const matchedEntry = Object.entries(pageToPath).find(([, path]) => path === pathname);
    if (matchedEntry) return { page: matchedEntry[0] as Page };
  } catch (e) {
    console.warn("Navigation warning: could not determine initial page", e);
  }
  return { page: 'home' };
};

const getWindowWidth = () => {
  if (typeof window === 'undefined') return 0;
  return Number.isFinite(window.innerWidth) ? window.innerWidth : 0;
};

function App() {
  const initialLocation = getPageFromLocation();
  const [currentPage, setCurrentPage] = useState<Page>(initialLocation.page);
  const [orderId, setOrderId] = useState<string | null>(initialLocation.orderId ?? null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | null>(null);
  const [screenW, setScreenW] = useState<number>(() => getWindowWidth());
  const toastTimeoutRef = useRef<number | null>(null);
  const [showCartToast, setShowCartToast] = useState(false);

  // Scroll en haut à chaque changement de page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentPage]);

  useEffect(() => {
    const updateSize = () => {
      const width = getWindowWidth();
      setScreenW(width);
      console.log('[App] screenW updated', width);
    };

    window.addEventListener('resize', updateSize);
    window.addEventListener('orientationchange', updateSize);
    updateSize();

    return () => {
      window.removeEventListener('resize', updateSize);
      window.removeEventListener('orientationchange', updateSize);
    };
  }, []);

  useEffect(() => {
    const handlePopstate = () => {
      const next = getPageFromLocation();
      setCurrentPage(next.page);
      setOrderId(next.orderId ?? null);
    };

    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, []);

  const navigateTo = (page: Page) => {
    try {
      const path = pageToPath[page] || '/';
      window.history.pushState({}, '', path);
    } catch (e) {
      console.warn("Navigation warning: could not push state", e);
    }

    setCurrentPage(page);
    if (page !== 'orderStatus') {
      setOrderId(null);
    }
    setIsOrderModalOpen(false);
    setSelectedItem(null);
    setSelectedCategory(null);

    if (page === 'commander') {
      console.log('[App] Navigating to commander, closing overlays');
      setIsCartOpen(false);
    }

    if (page === 'home') {
      console.log('[App] Navigating to home, cleaning overlays');
      setIsCartOpen(false);
    }

    // Si on va sur la page Commander, on s'assure que le panier est fermé initialement
    if (page === 'commander') {
      setIsCartOpen(false);
    }
  };

  const addToCart = (item: CartItem) => {
    setCartItems(prev => [...prev, item]);
    setShowCartToast(true);

    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = window.setTimeout(() => {
      setShowCartToast(false);
    }, 1500);
  };

  const toggleCart = () => {
    setIsCartOpen((v) => {
      const next = !v;
      console.log('[App] Cart icon clicked, toggling cart to', next);
      return next;
    });
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

  const closeOrderModal = () => {
    setIsOrderModalOpen(false);
    setSelectedItem(null);
    setSelectedCategory(null);
  };

  useEffect(() => {
    console.log('[App] isCartOpen', isCartOpen, 'isOrderModalOpen', isOrderModalOpen, 'screenW', screenW);
    if (!isCartOpen && !isOrderModalOpen) {
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('filter');
    }
  }, [isCartOpen, isOrderModalOpen, screenW]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

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
      case 'orderStatus': return orderId ? <OrderStatusPage orderId={orderId} navigateTo={navigateTo} /> : <Home navigateTo={navigateTo} />;
      case 'admin': return <AdminPage navigateTo={navigateTo} />;
      default: return <Home navigateTo={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-snack-light flex flex-col font-sans text-snack-black">
      <Header
        currentPage={currentPage}
        navigateTo={navigateTo}
        cartCount={cartItems.reduce((acc, item) => acc + item.quantity, 0)}
        toggleCart={toggleCart}
      />

      <main className="flex-grow pt-24">
        {renderPage()}
      </main>

      <Footer navigateTo={navigateTo} />

      {/* Bouton flottant Commander (visible sauf sur Checkout/Success/Cancel/Commander) */}
      {currentPage !== 'success' && currentPage !== 'cancel' && currentPage !== 'commander' && currentPage !== 'admin' && (
        <OrderingCTA
          navigateTo={navigateTo}
        />
      )}

      {/* Interface Modale Commande + Panier */}
      <OrderUI
        isOrderModalOpen={isOrderModalOpen}
        selectedItem={selectedItem}
        selectedCategory={selectedCategory}
        closeOrderModal={closeOrderModal}
        openOrderModal={openOrderModal}
        addToCart={addToCart}
        
        isCartOpen={isCartOpen}
        closeCart={() => setIsCartOpen(false)}
        cartItems={cartItems}
        removeFromCart={removeFromCart}
        clearCart={clearCart}
        screenW={screenW}
      />

      {showCartToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 transform rounded-full bg-snack-dark px-4 py-2 text-sm text-white shadow-lg">
          Ajouté au panier
        </div>
      )}

    </div>
  );
}

export default App;
