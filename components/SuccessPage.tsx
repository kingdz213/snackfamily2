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