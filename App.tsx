import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { StickyCartBar } from './components/StickyCartBar';
import { AdminOrderHubPage } from './components/AdminOrderHubPage';
import { AdminDashboardPage } from './components/AdminDashboardPage';
import { AdminOrderDetailPage } from './components/AdminOrderDetailPage';
import { AccountPage } from './components/AccountPage';
import { MyOrdersPage } from './components/MyOrdersPage';
import { MyOrderDetailPage } from './components/MyOrderDetailPage';
import { AuthModal } from './components/AuthModal';
import { CartItem, MenuItem, MenuCategory, Page } from './types';
import { subscribeToForegroundMessages } from './lib/notifications';
import { useAuth } from '@/src/auth/AuthProvider';
import { MENU_CATEGORIES } from './data/menuData';
import { firebaseInitError, getFirebaseEnvPresence } from '@/src/firebase';

const pageToPath: Record<Page, string> = {
  home: '/',
  menu: '/menu',
  infos: '/infos',
  contact: '/contact',
  commander: '/commander',
  admin: '/admin',
  adminOrderDetail: '/admin/orders',
  adminOrderHub: '/admin/order',
  success: '/success',
  cancel: '/cancel',
  orderStatus: '/order',
  account: '/compte',
  myOrders: '/mes-commandes',
  myOrderDetail: '/mes-commandes',
};

const getOrderIdFromPath = (pathname: string): string | null => {
  if (!pathname.startsWith('/order/')) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  return segments[1] || null;
};

const getAdminOrderIdFromPath = (pathname: string): string | null => {
  if (!pathname.startsWith('/admin/orders/')) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 3) return null;
  return segments[2] || null;
};

const getMyOrderIdFromPath = (pathname: string): string | null => {
  if (!pathname.startsWith('/mes-commandes/')) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  return segments[1] || null;
};

const getPageFromLocation = (): { page: Page; orderId?: string; adminOrderId?: string } => {
  try {
    const { pathname, search } = window.location;

    if (search.includes('success=true')) return { page: 'success' };
    if (search.includes('canceled=true')) return { page: 'cancel' };

    const orderId = getOrderIdFromPath(pathname);
    if (orderId) return { page: 'orderStatus', orderId };

    const adminOrderId = getAdminOrderIdFromPath(pathname);
    if (adminOrderId) return { page: 'adminOrderDetail', adminOrderId };

    const myOrderId = getMyOrderIdFromPath(pathname);
    if (myOrderId) return { page: 'myOrderDetail', orderId: myOrderId };

    if (pathname.startsWith('/admin/order')) return { page: 'adminOrderHub' };
    if (pathname.startsWith('/admin')) return { page: 'admin' };
    if (pathname.startsWith('/mes-commandes')) return { page: 'myOrders' };

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

type AuthIntent =
  | { type: 'openOrderModal'; itemName: string; categoryId: string }
  | { type: 'openCart' };

function App() {
  const { user, loading } = useAuth();
  const initialLocation = getPageFromLocation();
  const [currentPage, setCurrentPage] = useState<Page>(initialLocation.page);
  const [orderId, setOrderId] = useState<string | null>(initialLocation.orderId ?? null);
  const [adminOrderId, setAdminOrderId] = useState<string | null>(initialLocation.adminOrderId ?? null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory | null>(null);
  const [screenW, setScreenW] = useState<number>(() => getWindowWidth());
  const toastTimeoutRef = useRef<number | null>(null);
  const [showCartToast, setShowCartToast] = useState(false);
  const [pushToast, setPushToast] = useState<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMessage, setAuthMessage] = useState('Connexion obligatoire pour commander.');
  const [pendingIntent, setPendingIntent] = useState<AuthIntent | null>(null);
  const pendingActionRef = useRef<null | (() => void)>(null);
  const [showFirebaseEnvDebug, setShowFirebaseEnvDebug] = useState(false);
  const debugFirebaseEnabled =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debugFirebase') === '1';
  const showFirebaseBanner = Boolean(
    firebaseInitError && (import.meta.env.DEV || debugFirebaseEnabled)
  );

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
      setAdminOrderId(next.adminOrderId ?? null);
    };

    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.info('ANIM PACK ACTIVE');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('postLoginIntent');
      if (stored) {
        const parsed = JSON.parse(stored) as AuthIntent;
        setPendingIntent(parsed);
      }
    } catch (error) {
      console.warn('[App] Failed to read postLoginIntent', error);
    }
  }, []);

  const navigateTo = (page: Page) => {
    try {
      const path = pageToPath[page] || '/';
      window.history.pushState({}, '', path);
    } catch (e) {
      console.warn("Navigation warning: could not push state", e);
    }

    setCurrentPage(page);
    if (page !== 'orderStatus' && page !== 'myOrderDetail') {
      setOrderId(null);
    }
    if (page !== 'adminOrderDetail') {
      setAdminOrderId(null);
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

  const addToCartRaw = (item: CartItem) => {
    setCartItems(prev => [...prev, item]);
    setShowCartToast(true);

    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = window.setTimeout(() => {
      setShowCartToast(false);
    }, 1500);
  };

  const openCart = () => {
    setIsCartOpen(true);
  };

  const removeFromCart = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const openOrderModalRaw = (item: MenuItem, category: MenuCategory) => {
    setSelectedItem(item);
    setSelectedCategory(category);
    setIsOrderModalOpen(true);
  };

  const persistIntent = (intent: AuthIntent | null) => {
    if (typeof window === 'undefined') return;
    try {
      if (!intent) {
        localStorage.removeItem('postLoginIntent');
        return;
      }
      localStorage.setItem('postLoginIntent', JSON.stringify(intent));
    } catch (error) {
      console.warn('[App] Failed to persist postLoginIntent', error);
    }
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    setPendingIntent(null);
    pendingActionRef.current = null;
    persistIntent(null);
  };

  const executeIntent = useCallback(
    (intent: AuthIntent | null) => {
      if (!intent) return;
      if (intent.type === 'openCart') {
        openCart();
        return;
      }
      const category = MENU_CATEGORIES.find((cat) => cat.id === intent.categoryId);
      const item = category?.items.find((entry) => entry.name === intent.itemName);
      if (category && item) {
        openOrderModalRaw(item, category);
      }
    },
    [openCart, openOrderModalRaw]
  );

  const requireAuth = useCallback(
    (action: () => void, intent?: AuthIntent) => {
      if (!loading && user) {
        action();
        return;
      }
      pendingActionRef.current = action;
      if (intent) {
        setPendingIntent(intent);
        persistIntent(intent);
      }
      setAuthMessage('Connexion obligatoire pour commander.');
      setIsAuthModalOpen(true);
    },
    [loading, user]
  );

  useEffect(() => {
    if (loading || !user) return;
    if (pendingActionRef.current) {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action();
      closeAuthModal();
      return;
    }
    if (pendingIntent) {
      executeIntent(pendingIntent);
      closeAuthModal();
    }
  }, [executeIntent, loading, pendingIntent, user]);

  const addToCart = (item: CartItem) => requireAuth(() => addToCartRaw(item));

  const toggleCart = () => {
    if (isCartOpen) {
      setIsCartOpen(false);
      return;
    }
    requireAuth(() => openCart(), { type: 'openCart' });
  };

  const openOrderModal = (item: MenuItem, category: MenuCategory) =>
    requireAuth(() => openOrderModalRaw(item, category), {
      type: 'openOrderModal',
      itemName: item.name,
      categoryId: category.id,
    });

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

  useEffect(() => {
    const unsubscribe = subscribeToForegroundMessages((payload) => {
      const title = payload.notification?.title || 'Snack Family 2';
      const body = payload.notification?.body || 'Mise à jour de commande.';
      setPushToast(`${title} — ${body}`);
      window.setTimeout(() => setPushToast(null), 2500);
    });

    return () => unsubscribe();
  }, []);

  // Rendu conditionnel des pages
  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const showStickyCart = currentPage === 'menu' && cartCount > 0;

  const renderPage = () => {
    switch (currentPage) {
      case 'home': return <Home navigateTo={navigateTo} />;
      case 'menu': return <MenuPage openOrderModal={openOrderModal} stickyCartVisible={showStickyCart} />;
      case 'infos': return <InfoPage />;
      case 'contact': return <ContactPage />;
      case 'commander': return <OrderPage openOrderModal={openOrderModal} />;
      case 'success': return <SuccessPage navigateTo={navigateTo} />;
      case 'cancel': return <CancelPage navigateTo={navigateTo} />;
      case 'orderStatus': return orderId ? <OrderStatusPage orderId={orderId} navigateTo={navigateTo} /> : <Home navigateTo={navigateTo} />;
      case 'admin': return <AdminDashboardPage />;
      case 'adminOrderDetail': return adminOrderId ? <AdminOrderDetailPage navigateTo={navigateTo} /> : <AdminDashboardPage />;
      case 'adminOrderHub': return <AdminOrderHubPage />;
      case 'account': return <AccountPage navigateTo={navigateTo} />;
      case 'myOrders': return <MyOrdersPage navigateTo={navigateTo} />;
      case 'myOrderDetail': return orderId ? <MyOrderDetailPage navigateTo={navigateTo} orderId={orderId} /> : <MyOrdersPage navigateTo={navigateTo} />;
      default: return <Home navigateTo={navigateTo} />;
    }
  };

  return (
    <div className="min-h-screen bg-snack-light flex flex-col font-sans text-snack-black">
      <Header
        currentPage={currentPage}
        navigateTo={navigateTo}
        cartCount={cartCount}
        toggleCart={toggleCart}
      />

      {showFirebaseBanner && (
        <div className="bg-amber-100 text-amber-900 text-sm font-semibold px-4 py-2 text-center border-b border-amber-200">
          <div>{firebaseInitError}</div>
          {import.meta.env.DEV && (
            <div className="mt-2 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFirebaseEnvDebug((prev) => !prev)}
                className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200 transition-colors"
              >
                Debug env Firebase
              </button>
              {showFirebaseEnvDebug && (
                <pre className="max-w-3xl overflow-auto rounded-lg bg-amber-50 px-3 py-2 text-left text-xs text-amber-900">
                  {JSON.stringify(getFirebaseEnvPresence(), null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      <main
        className={`flex-grow ${currentPage === 'home' ? 'bg-snack-black' : 'bg-snack-light'}`}
      >
        {renderPage()}
      </main>

      <Footer navigateTo={navigateTo} />

      {showStickyCart && (
        <StickyCartBar
          totalItems={cartCount}
          totalPrice={cartSubtotal}
          onOpenCart={toggleCart}
        />
      )}

      {/* Bouton flottant Commander (visible sauf sur Checkout/Success/Cancel/Commander) */}
      {currentPage !== 'success' &&
        currentPage !== 'cancel' &&
        currentPage !== 'commander' &&
        currentPage !== 'admin' &&
        currentPage !== 'adminOrderDetail' &&
        currentPage !== 'adminOrderHub' && (
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
        requireAuth={requireAuth}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        message={authMessage}
        onClose={closeAuthModal}
      />

      {showCartToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 transform rounded-full bg-snack-dark px-4 py-2 text-sm text-white shadow-lg">
          Ajouté au panier
        </div>
      )}

      {pushToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 transform rounded-full bg-snack-black px-4 py-2 text-xs font-bold uppercase tracking-wide text-snack-gold shadow-lg">
          {pushToast}
        </div>
      )}

    </div>
  );
}

export default App;
