import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Home, MessageCircle } from 'lucide-react';
import { Page } from '../types';
import { buildOrderMessage, buildWhatsAppUrl, getWhatsAppPhone, resolvePublicOrigin } from '../lib/whatsapp';
import { resolveWorkerBaseUrl } from '../lib/stripe';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';

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
  status: 'RECEIVED' | 'PENDING_PAYMENT' | 'PAID_ONLINE' | 'IN_PREPARATION' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
};

export const SuccessPage: React.FC<SuccessPageProps> = ({ navigateTo }) => {
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Paiement en cours de confirmation…');
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [orderDetails, setOrderDetails] = useState<OrderResponse | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  const buildOrderLines = (order: OrderResponse | null) => {
    if (!order?.items?.length) return ['- (aucun article)'];
    return order.items.map((item) => `- ${Math.max(1, Math.trunc(item.quantity))}x ${item.name}`);
  };

  const orderMessage = useMemo(() => {
    if (!orderDetails) return '';
    const publicOrigin = resolvePublicOrigin() || window.location.origin;
    const verifyUrl = `${publicOrigin}/order/${orderDetails.id}`;
    const paymentLabel =
      orderDetails.status === 'PENDING_PAYMENT' ? 'En ligne (confirmation en cours)' : 'En ligne (confirmé)';
    return buildOrderMessage({
      orderId: orderDetails.id,
      paymentLabel,
      verifyUrl,
      lines: buildOrderLines(orderDetails),
    });
  }, [orderDetails]);

  const isMessageLoading = !orderMessage;

  const openWhatsAppForOrder = useCallback((order: OrderResponse | null) => {
    setWhatsAppError(null);
    setCopyMessage(null);

    try {
      if (!order) {
        setWhatsAppError('Commande introuvable pour WhatsApp.');
        return;
      }
      const message = orderMessage || 'Commande Snack Family';
      const url = buildWhatsAppUrl(getWhatsAppPhone(), message);
      window.location.assign(url);
    } catch (error) {
      console.error('[SuccessPage] Failed to open WhatsApp', error);
      setWhatsAppError("Impossible de préparer le message WhatsApp.");
    }
  }, [orderMessage]);

  const copyOrderMessage = useCallback(async () => {
    setWhatsAppError(null);
    if (!orderMessage) {
      setCopyMessage('Le message est en cours de préparation.');
      return;
    }

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(orderMessage);
        setCopyMessage('Message copié ✅');
        return;
      } catch (error) {
        console.warn('[SuccessPage] Clipboard API failed', error);
      }
    }

    const textArea = messageRef.current;
    if (textArea) {
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, textArea.value.length);
      setCopyMessage('Sélectionnez le texte et copiez-le manuellement.');
    } else {
      setCopyMessage('Copiez le message manuellement.');
    }
  }, [orderMessage]);

  const fetchOrderBySession = useCallback(async (sessionId: string) => {
    const endpoint = `${resolveWorkerBaseUrl()}/order-by-session?session_id=${encodeURIComponent(sessionId)}`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error('Impossible de vérifier le paiement.');
    }
    return (await response.json()) as { orderId: string; status: OrderResponse['status'] };
  }, []);

  const fetchOrderDetails = useCallback(async (id: string) => {
    const endpoint = `${resolveWorkerBaseUrl()}/api/orders/${encodeURIComponent(id)}`;
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
        if (result.status !== 'PENDING_PAYMENT') {
          const details = await fetchOrderDetails(result.orderId);
          if (cancelled) return;
          setOrderDetails(details);
          setStatusMessage('Commande confirmée — préparation en cours');
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

      <div className="mt-8 w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-2 text-left">
          <h2 className="text-lg font-bold text-snack-black">Confirmation</h2>
          <p className="text-sm text-gray-600">
            Utilisez WhatsApp ou copiez le message ci-dessous si l’ouverture automatique est bloquée.
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <button
            onClick={() => openWhatsAppForOrder(orderDetails)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-bold uppercase tracking-wider text-white shadow hover:bg-green-700"
          >
            <MessageCircle size={20} />
            Ouvrir WhatsApp
          </button>
          <button
            onClick={copyOrderMessage}
            className="inline-flex items-center justify-center rounded-lg border border-snack-black px-6 py-3 text-sm font-bold uppercase tracking-wider text-snack-black hover:bg-snack-black hover:text-white"
          >
            Copier le message
          </button>
          {isMessageLoading && <LoadingSpinner label="Chargement du message..." size={20} />}
          <textarea
            ref={messageRef}
            readOnly
            value={orderMessage}
            className="min-h-[160px] w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 focus:outline-none"
          />
          {copyMessage && <p className="text-sm text-gray-600">{copyMessage}</p>}
          {whatsAppError && <p className="text-sm text-red-600">{whatsAppError}</p>}
        </div>
      </div>
    </div>
  );
};
