import React, { useEffect, useRef, useState } from 'react';
import { Menu, X, ShoppingBag } from 'lucide-react';
import { Page } from '../types';
import { motion } from 'framer-motion';
import { prefersReducedMotion, motionSafeTransition } from '@/src/lib/motion';
import { getNextOpenSlot, isOpenNow } from '@/src/lib/openingHours';

interface HeaderProps {
  currentPage: Page;
  navigateTo: (page: Page) => void;
  cartCount: number;
  toggleCart: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentPage, navigateTo, cartCount, toggleCart }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isBadgePopping, setIsBadgePopping] = useState(false);
  const [openingInfo, setOpeningInfo] = useState<{ isOpen: boolean; nextLabel: string | null }>({
    isOpen: true,
    nextLabel: null,
  });
  const prevCountRef = useRef(cartCount);
  const reduceMotion = prefersReducedMotion();

  const navLinks: { name: string; page: Page }[] = [
    { name: 'Accueil', page: 'home' },
    { name: 'Menu', page: 'menu' },
    { name: 'Infos', page: 'infos' },
    { name: 'Contact', page: 'contact' },
    { name: 'Mon compte', page: 'account' },
    { name: 'Espace gérant', page: 'admin' },
  ];

  const handleNav = (page: Page) => {
    navigateTo(page);
    setIsMenuOpen(false);
  };

  useEffect(() => {
    if (cartCount > prevCountRef.current && !reduceMotion) {
      setIsBadgePopping(true);
      window.setTimeout(() => setIsBadgePopping(false), 220);
    }
    prevCountRef.current = cartCount;
  }, [cartCount, reduceMotion]);

  useEffect(() => {
    const refreshOpeningInfo = () => {
      const now = new Date();
      const isOpen = isOpenNow(now);
      const nextOpen = isOpen ? null : getNextOpenSlot(now);
      setOpeningInfo({ isOpen, nextLabel: nextOpen?.label ?? null });
    };

    refreshOpeningInfo();
    const interval = window.setInterval(refreshOpeningInfo, 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);


  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-snack-black border-b border-white/10 shadow-lg min-h-[96px] sm:min-h-[104px]">
      <div className="container mx-auto px-4 py-4 h-full flex items-center justify-between gap-4 sm:gap-6">
        
        {/* LOGO */}
        <button onClick={() => handleNav('home')} className="flex flex-col group text-left shrink-0">
            <h1 className="font-display font-bold text-white text-4xl tracking-tighter uppercase group-hover:text-snack-gold transition-colors leading-none">
                Snack Family <span className="text-snack-gold">2</span>
            </h1>
            <span className="text-gray-400 text-[11px] font-bold tracking-[0.4em] uppercase mt-1 group-hover:text-white transition-colors">
                Colfontaine
            </span>
            <span
              className={`mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                openingInfo.isOpen ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'
              }`}
            >
              {openingInfo.isOpen ? 'Ouvert maintenant ✅' : 'Fermé ❌'}
            </span>
            {!openingInfo.isOpen && openingInfo.nextLabel && (
              <span className="mt-1 text-[11px] text-gray-400 font-semibold">
                Prochaine ouverture : {openingInfo.nextLabel}
              </span>
            )}
        </button>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center space-x-10">
          {navLinks.map((link) => {
            const isActive =
              currentPage === link.page ||
              (link.page === 'admin' && currentPage === 'adminOrderDetail') ||
              (link.page === 'account' && (currentPage === 'myOrders' || currentPage === 'myOrderDetail'));
            return (
              <button 
                key={link.name} 
                onClick={() => handleNav(link.page)}
                className={`font-display font-bold text-lg uppercase tracking-wide transition-colors relative py-2 ${
                  isActive ? 'text-snack-gold' : 'text-white hover:text-snack-gold'
                }`}
              >
                {link.name}
                {isActive && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-snack-gold"></span>
                )}
              </button>
            );
          })}
          
          <div className="flex items-center gap-4 shrink-0">
              {/* Cart Toggle Icon */}
              <button 
                onClick={toggleCart}
                className="relative text-white hover:text-snack-gold transition-colors p-2"
                aria-label="Panier"
              >
                  <ShoppingBag size={24} />
                  {cartCount > 0 && (
                      <motion.span
                        className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border border-snack-black"
                        animate={
                          reduceMotion
                            ? { scale: 1 }
                            : isBadgePopping
                            ? { scale: [1, 1.2, 1] }
                            : { scale: 1 }
                        }
                        transition={reduceMotion ? { duration: 0 } : { ...motionSafeTransition, duration: 0.2 }}
                      >
                        {cartCount}
                      </motion.span>
                  )}
              </button>

              {/* Commander Button - Navigates to Order Page */}
              <button 
                onClick={() => handleNav('commander')}
                className={`cta-premium px-6 py-2.5 rounded font-display font-bold text-lg uppercase tracking-wide transition-all transform shadow-lg glow-soft shine-sweep ${
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
        <div className="flex lg:hidden items-center gap-6 shrink-0">
            <button
              onClick={toggleCart}
              className="relative text-snack-gold p-2 hover:text-white transition-colors"
              aria-label="Voir le panier"
            >
               <ShoppingBag size={30} />
               {cartCount > 0 && (
                   <motion.span
                     className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border border-snack-black"
                     animate={
                       reduceMotion
                         ? { scale: 1 }
                         : isBadgePopping
                         ? { scale: [1, 1.2, 1] }
                         : { scale: 1 }
                     }
                     transition={reduceMotion ? { duration: 0 } : { ...motionSafeTransition, duration: 0.2 }}
                   >
                     {cartCount}
                   </motion.span>
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
          {navLinks.map((link, index) => {
            const isActive =
              currentPage === link.page ||
              (link.page === 'admin' && currentPage === 'adminOrderDetail') ||
              (link.page === 'account' && (currentPage === 'myOrders' || currentPage === 'myOrderDetail'));
            return (
              <button 
                key={link.name} 
                onClick={() => handleNav(link.page)}
                className={`font-display text-2xl font-bold uppercase tracking-wide border-b border-gray-800 pb-4 text-left transition-all duration-300 ${
                  isActive ? 'text-snack-gold' : 'text-white hover:pl-2'
                }`}
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                {link.name}
              </button>
            );
          })}
          <button 
            onClick={() => handleNav('commander')}
            className="cta-premium w-full bg-snack-gold text-snack-black font-display font-bold text-xl uppercase tracking-wide py-4 text-center rounded mt-4 hover:bg-white transition-colors shadow-lg flex items-center justify-center gap-2 glow-soft shine-sweep"
          >
            <ShoppingBag size={20} />
            Commander
          </button>
        </div>
      </div>
    </header>
  );
};
