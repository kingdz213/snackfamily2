import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Home, MessageCircle } from 'lucide-react';
import { Page } from '../types';
import { buildOrderMessage, buildWhatsAppUrl, getWhatsAppPhone } from '../lib/whatsapp';
import { resolveWorkerBaseUrl } from '../lib/stripe';

interface SuccessPageProps {
  navigateTo: (page: Page) => void;
}

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type OrderResponse = {
  id: string;
  items: OrderItem[];
  total: number;
  deliveryAddress: string;
  paymentMethod: 'STRIPE' | 'CASH';
  status: 'PENDING_PAYMENT' | 'PAID_ONLINE' | 'CASH_ON_DELIVERY';
};

export const SuccessPage: React.FC<SuccessPageProps> = ({ navigateTo }) => {
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Paiement en cours de confirmation…');
  const [orderDetails, setOrderDetails] = useState<OrderResponse | null>(null);
  const hasAutoSentRef = useRef(false);

  const buildOrderLines = (order: OrderResponse | null) => {
    if (!order?.items?.length) return ['- (aucun article)'];
    return order.items.map((item) => `- ${Math.max(1, Math.trunc(item.quantity))}x ${item.name}`);
  };

  const openWhatsAppForOrder = useCallback((order: OrderResponse | null) => {
    setWhatsAppError(null);

    try {
      if (!order) {
        setWhatsAppError('Commande introuvable pour WhatsApp.');
        return;
      }
      const verifyUrl = `${window.location.origin}/order/${order.id}`;
      const message = buildOrderMessage({
        orderId: order.id,
        paymentLabel: 'En ligne (confirmé)',
        verifyUrl,
        lines: buildOrderLines(order),
      });
      const url = buildWhatsAppUrl(getWhatsAppPhone(), message);
      window.open(url, '_blank');
    } catch (error) {
      console.error('[SuccessPage] Failed to open WhatsApp', error);
      setWhatsAppError("Impossible de préparer le message WhatsApp.");
    }
  }, []);

  const fetchOrderBySession = useCallback(async (sessionId: string) => {
    const endpoint = `${resolveWorkerBaseUrl()}/order-by-session?session_id=${encodeURIComponent(sessionId)}`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error('Impossible de vérifier le paiement.');
    }
    return (await response.json()) as { orderId: string; status: OrderResponse['status'] };
  }, []);

  const fetchOrderDetails = useCallback(async (id: string) => {
    const endpoint = `${resolveWorkerBaseUrl()}/order/${encodeURIComponent(id)}`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error('Impossible de récupérer la commande.');
    }
    return (await response.json()) as OrderResponse;
  }, []);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (!sessionId) {
      setStatusMessage('Session Stripe introuvable.');
      return;
    }

    let attempts = 0;
    let cancelled = false;

    const pollStatus = async () => {
      try {
        const result = await fetchOrderBySession(sessionId);
        if (cancelled) return;
        if (result.status === 'PAID_ONLINE') {
          const details = await fetchOrderDetails(result.orderId);
          if (cancelled) return;
          setOrderDetails(details);
          setStatusMessage('Paiement confirmé ✅');

          if (!hasAutoSentRef.current) {
            hasAutoSentRef.current = true;
            openWhatsAppForOrder(details);
          }
          return;
        }

        attempts += 1;
        if (attempts >= 10) {
          setStatusMessage('Paiement en cours de confirmation…');
          return;
        }
        setTimeout(pollStatus, 2000);
      } catch (error) {
        if (cancelled) return;
        setStatusMessage('Paiement en cours de confirmation…');
        console.error('[SuccessPage] Failed to poll order status', error);
      }
    };

    pollStatus();

    return () => {
      cancelled = true;
    };
  }, [fetchOrderBySession, fetchOrderDetails, openWhatsAppForOrder]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-20 bg-gray-50">
      <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-6 shadow-lg">
        <CheckCircle size={48} />
      </div>
      <h1 className="text-4xl font-display font-bold text-snack-black uppercase mb-4">Paiement Réussi !</h1>
      <p className="text-xl text-gray-600 max-w-lg mb-8">
        Merci pour votre commande. Nous allons commencer la préparation de votre repas immédiatement.
      </p>
      <p className="text-sm text-gray-500 mb-4">{statusMessage}</p>
      <button
        onClick={() => navigateTo('home')}
        className="bg-snack-gold text-snack-black px-8 py-3 rounded font-bold uppercase tracking-wider hover:bg-black hover:text-snack-gold transition-colors flex items-center gap-2 shadow-md"
      >
        <Home size={20} />
        Retour à l'accueil
      </button>

      <div className="mt-6 flex flex-col items-center gap-3">
        <button
          onClick={() => openWhatsAppForOrder(orderDetails)}
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
