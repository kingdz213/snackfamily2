import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Home, MessageCircle } from 'lucide-react';
import { Page } from '../types';
import { getOrder, type OrderRecord } from '../lib/orderApi';
import { buildOrderVerificationUrl, openWhatsAppOrder, type WhatsAppOrderParams } from '../lib/whatsapp';

interface SuccessPageProps {
  navigateTo: (page: Page) => void;
}

export const SuccessPage: React.FC<SuccessPageProps> = ({ navigateTo }) => {
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Vérification du paiement…');
  const hasAutoSentRef = useRef(false);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<number | null>(null);

  const sessionId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return params.get('session_id') || '';
  }, []);

  const handleSendWhatsApp = useCallback(() => {
    setWhatsAppError(null);

    try {
      if (!order?.id) {
        setWhatsAppError('Aucune commande confirmée à envoyer.');
        return;
      }

      const payload: WhatsAppOrderParams = {
        orderId: order.id,
        paymentLabel: 'En ligne (confirmé)',
        verificationUrl: buildOrderVerificationUrl(order.id),
      };

      openWhatsAppOrder(payload);
    } catch (error) {
      console.error('[SuccessPage] Failed to open WhatsApp', error);
      setWhatsAppError("Impossible de préparer le message WhatsApp.");
    }
  }, [order]);

  const fetchOrder = useCallback(async () => {
    if (!sessionId) {
      setStatusMessage('Session Stripe introuvable.');
      return;
    }

    try {
      const fetchedOrder = await getOrder({ sessionId });
      setOrder(fetchedOrder);

      if (fetchedOrder.status === 'PAID_ONLINE') {
        setStatusMessage('Paiement confirmé ✅');
        if (!hasAutoSentRef.current) {
          hasAutoSentRef.current = true;
          handleSendWhatsApp();
        }
      } else {
        setStatusMessage('Paiement en cours de confirmation…');
        if (retryCountRef.current < 5) {
          retryCountRef.current += 1;
          retryTimeoutRef.current = window.setTimeout(fetchOrder, 3000);
        }
      }
    } catch (error) {
      console.error('[SuccessPage] Failed to fetch order', error);
      setStatusMessage('Impossible de vérifier le paiement pour le moment.');
    }
  }, [handleSendWhatsApp, sessionId]);

  useEffect(() => {
    fetchOrder();

    return () => {
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [fetchOrder]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-20 bg-gray-50">
      <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-6 shadow-lg">
        <CheckCircle size={48} />
      </div>
      <h1 className="text-4xl font-display font-bold text-snack-black uppercase mb-4">Paiement Réussi !</h1>
      <p className="text-xl text-gray-600 max-w-lg mb-4">
        Merci pour votre commande. Nous allons commencer la préparation dès confirmation du paiement.
      </p>
      <p className="text-sm text-gray-500 mb-8">{statusMessage}</p>
      <button
        onClick={() => navigateTo('home')}
        className="bg-snack-gold text-snack-black px-8 py-3 rounded font-bold uppercase tracking-wider hover:bg-black hover:text-snack-gold transition-colors flex items-center gap-2 shadow-md"
      >
        <Home size={20} />
        Retour à l'accueil
      </button>

      {order?.status === 'PAID_ONLINE' && (
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
      )}
    </div>
  );
};
