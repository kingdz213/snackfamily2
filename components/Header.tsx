import React, { useState } from 'react';
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

  return (
    <header className="fixed top-0 left-0 w-full z-50 bg-snack-black border-b border-white/10 shadow-lg min-h-[88px] sm:min-h-[96px]">
      <div className="container mx-auto px-4 py-3 sm:py-0 h-full flex justify-between items-center">
        
        {/* LOGO */}
        <button onClick={() => handleNav('home')} className="flex flex-col group text-left">
            <h1 className="font-display font-bold text-white text-4xl tracking-tighter uppercase group-hover:text-snack-gold transition-colors leading-none">
                Snack Family <span className="text-snack-gold">2</span>
            </h1>
            <span className="text-gray-400 text-[11px] font-bold tracking-[0.4em] uppercase mt-1 group-hover:text-white transition-colors">
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
              className="relative text-snack-gold p-2 hover:text-white transition-colors"
              aria-label="Voir le panier"
            >
               <ShoppingBag size={30} />
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