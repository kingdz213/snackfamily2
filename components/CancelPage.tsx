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