import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Home, MessageCircle } from 'lucide-react';
import { Page } from '../types';
import { getOrderBySession, type Order } from '../lib/orders';
import { WhatsAppOrderParams, openWhatsAppOrder } from '../lib/whatsapp';

interface SuccessPageProps {
  navigateTo: (page: Page) => void;
}

export const SuccessPage: React.FC<SuccessPageProps> = ({ navigateTo }) => {
  const [order, setOrder] = useState<Order | null>(null);
  const [statusInfo, setStatusInfo] = useState<string | null>(null);
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const hasAutoSentRef = useRef(false);

  const sessionId = useRef<string | null>(null);

  if (sessionId.current === null) {
    const search = new URLSearchParams(window.location.search);
    sessionId.current = search.get('session_id');
  }

  const buildWhatsAppPayload = useCallback((orderData: Order): WhatsAppOrderParams => {
    return {
      orderId: orderData.id,
      paymentLabel: 'En ligne (confirmé)',
      verificationUrl: `${window.location.origin}/order/${orderData.id}`,
      customerName: orderData.customer?.name ?? '',
      customerPhone: orderData.customer?.phone ?? '',
      address: orderData.customer?.address ?? '',
      postalCode: '',
      city: '',
      items: orderData.items.map((item) => ({
        label: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
      })),
      subtotal: Math.max(0, orderData.total - orderData.deliveryFee),
      deliveryFee: orderData.deliveryFee,
      total: orderData.total,
      notes: orderData.note,
      timestampIso: orderData.createdAt,
    };
  }, []);

  const handleSendWhatsApp = useCallback(() => {
    setWhatsAppError(null);

    try {
      if (!order) {
        setWhatsAppError('Commande introuvable.');
        return;
      }
      if (order.status !== 'PAID_ONLINE') {
        setWhatsAppError('Le paiement est en cours de confirmation. Merci de réessayer.');
        return;
      }
      openWhatsAppOrder(buildWhatsAppPayload(order));
    } catch (error) {
      console.error('[SuccessPage] Failed to open WhatsApp', error);
      setWhatsAppError("Impossible de préparer le message WhatsApp.");
    }
  }, [buildWhatsAppPayload, order]);

  const fetchOrder = useCallback(async () => {
    setIsLoading(true);
    setStatusInfo(null);
    setWhatsAppError(null);

    try {
      const id = sessionId.current;
      if (!id) {
        setStatusInfo('Impossible de retrouver la session Stripe.');
        return;
      }
      const orderData = await getOrderBySession(id);
      setOrder(orderData);
      if (orderData.status !== 'PAID_ONLINE') {
        setStatusInfo('Paiement en cours de confirmation. Merci de patienter quelques instants.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Commande introuvable.';
      setStatusInfo(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasAutoSentRef.current) return;
    if (order?.status !== 'PAID_ONLINE') return;
    hasAutoSentRef.current = true;
    handleSendWhatsApp();
  }, [handleSendWhatsApp, order]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

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
          disabled={isLoading || !order || order.status !== 'PAID_ONLINE'}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-bold uppercase tracking-wider text-white shadow hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <MessageCircle size={20} />
          Envoyer la commande sur WhatsApp
        </button>
        {statusInfo && <p className="text-sm text-gray-600">{statusInfo}</p>}
        {whatsAppError && <p className="text-sm text-red-600">{whatsAppError}</p>}
        {order && order.status !== 'PAID_ONLINE' && (
          <button
            onClick={fetchOrder}
            className="text-sm font-semibold text-snack-black underline decoration-snack-gold underline-offset-4"
          >
            Réessayer la vérification
          </button>
        )}
      </div>
    </div>
  );
};
