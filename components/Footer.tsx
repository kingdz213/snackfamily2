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