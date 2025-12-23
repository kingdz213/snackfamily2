import React, { useState } from 'react';
import { CheckCircle, Home, MessageCircle } from 'lucide-react';
import { Page } from '../types';
import { LAST_ORDER_STORAGE_KEY, WhatsAppOrderParams, openWhatsAppOrder } from '../lib/whatsapp';

interface SuccessPageProps {
  navigateTo: (page: Page) => void;
}

export const SuccessPage: React.FC<SuccessPageProps> = ({ navigateTo }) => {
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);

  const handleSendWhatsApp = () => {
    setWhatsAppError(null);

    try {
      const payloadRaw = localStorage.getItem(LAST_ORDER_STORAGE_KEY);
      if (!payloadRaw) {
        setWhatsAppError('Aucune commande récente à envoyer.');
        return;
      }

      const parsed = JSON.parse(payloadRaw) as WhatsAppOrderParams;
      const payload: WhatsAppOrderParams = {
        ...parsed,
        paymentStatus: 'stripe',
        timestampIso: new Date().toISOString(),
      };

      openWhatsAppOrder(payload);
    } catch (error) {
      console.error('[SuccessPage] Failed to open WhatsApp', error);
      setWhatsAppError("Impossible de préparer le message WhatsApp.");
    }
  };

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

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          onClick={handleSendWhatsApp}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-bold uppercase tracking-wider text-white shadow hover:bg-green-700"
        >
          <MessageCircle size={20} />
          Envoyer la commande sur WhatsApp
        </button>
        {whatsAppError && <p className="text-sm text-red-600">{whatsAppError}</p>}
      </div>
    </div>
  );
};
