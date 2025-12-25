import React, { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { Page } from '../types';
import { prefersReducedMotion } from '@/src/lib/motion';

interface OrderingCTAProps {
    navigateTo: (page: Page) => void;
}

export const OrderingCTA: React.FC<OrderingCTAProps> = ({ navigateTo }) => {
  const [isVisible, setIsVisible] = useState(false);
  const reduceMotion = prefersReducedMotion();

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 500);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div 
      className={`fixed bottom-6 right-6 z-40 ${
        reduceMotion ? 'transition-opacity duration-300' : 'transition-all duration-500 transform'
      } ${isVisible ? 'opacity-100' : 'opacity-0'} ${reduceMotion ? '' : isVisible ? 'translate-y-0' : 'translate-y-20'}`}
    >
      <button 
        onClick={() => navigateTo('commander')}
        className="cta-premium flex items-center gap-3 bg-snack-gold hover:bg-white text-snack-black py-4 px-8 rounded shadow-xl font-display font-bold text-xl uppercase tracking-wider border border-snack-black/10 transition-all glow-soft shine-sweep"
      >
        <ShoppingBag size={24} />
        <span>Commander</span>
      </button>
    </div>
  );
};
