import React, { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Page } from '../types';

interface OrderingCTAProps {
    navigateTo: (page: Page) => void;
}

export const OrderingCTA: React.FC<OrderingCTAProps> = ({ navigateTo }) => {
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