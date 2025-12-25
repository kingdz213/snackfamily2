import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { resolveWorkerBaseUrl } from '../lib/stripe';
import { OrderTimeline } from './OrderTimeline';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';

type AdminAction = 'OPEN' | 'DELIVERED';

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type OrderResponse = {
  id: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryAddress: string;
  paymentMethod: 'STRIPE' | 'CASH';
  status:
    | 'RECEIVED'
    | 'PENDING_PAYMENT'
    | 'PAID_ONLINE'
    | 'IN_PREPARATION'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED';
  desiredDeliveryAt?: string | null;
  desiredDeliverySlotLabel?: string | null;
};

type DeliveredAction = {
  exp: number;
  sig: string;
};

type AdminActionResponse = {
  ok: boolean;
  order: OrderResponse;
  publicOrderUrl: string;
  deliveredAction?: DeliveredAction;
};

const formatCents = (value: number) => `${(value / 100).toFixed(2)} €`;

export const AdminOrderHubPage: React.FC = () => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const orderId = params.get('orderId')?.trim() ?? '';
  const exp = Number(params.get('exp'));
  const sig = params.get('sig')?.trim() ?? '';

  const [pin, setPin] = useState('');
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [publicOrderUrl, setPublicOrderUrl] = useState<string | null>(null);
  const [deliveredAction, setDeliveredAction] = useState<DeliveredAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isLinkValid = Boolean(orderId) && Number.isFinite(exp) && Boolean(sig);

  const postAction = async (action: AdminAction, actionExp: number, actionSig: string) => {
    const endpoint = `${resolveWorkerBaseUrl()}/admin/order-action`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        action,
        exp: actionExp,
        sig: actionSig,
        pin,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload?.message || payload?.error || 'Action impossible.';
      throw new Error(message);
    }

    return (await response.json()) as AdminActionResponse;
  };

  const handleAccess = async () => {
    if (!pin) {
      setError('Merci de saisir le PIN admin.');
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const data = await postAction('OPEN', exp, sig);
      setOrder(data.order);
      setPublicOrderUrl(data.publicOrderUrl);
      setDeliveredAction(data.deliveredAction ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelivered = async () => {
    if (!deliveredAction) return;
    setError(null);
    setSuccessMessage(null);
    setIsDelivering(true);
    try {
      const data = await postAction('DELIVERED', deliveredAction.exp, deliveredAction.sig);
      setOrder(data.order);
      setPublicOrderUrl(data.publicOrderUrl);
      setSuccessMessage('Commande marquée comme livrée.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setIsDelivering(false);
    }
  };

  if (!isLinkValid) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-gray-50 px-4 py-16">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
            <AlertTriangle size={22} />
          </div>
          <h1 className="text-2xl font-display font-bold text-snack-black uppercase mb-2">Lien invalide</h1>
          <p className="text-sm text-gray-600">Le lien admin est incomplet ou expiré.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-gray-50 px-4 py-16">
      <div className="max-w-2xl w-full bg-white rounded-2xl border border-gray-200 p-6 shadow-xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-display font-bold text-snack-black uppercase">Gestion commande</h1>
          <p className="text-sm text-gray-600">Commande #{orderId}</p>
        </div>

        {!order ? (
          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-700" htmlFor="admin-pin">
              PIN admin
            </label>
            <input
              id="admin-pin"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
              placeholder="Saisir le PIN"
            />
            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
            <button
              onClick={handleAccess}
              disabled={isSubmitting}
              className={`cta-premium w-full rounded-lg bg-snack-gold px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-black transition-all glow-soft shine-sweep ${
                isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-white'
              }`}
            >
              {isSubmitting ? <LoadingSpinner label="Accès..." size={20} /> : 'Accéder'}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <OrderTimeline status={order.status} />
            <div className="rounded-xl border border-snack-gold/30 bg-snack-light px-4 py-4">
              <div className="text-sm text-gray-600">Statut actuel</div>
              <div className="text-lg font-semibold text-snack-black">{order.status.replace(/_/g, ' ')}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 space-y-3">
              <div className="text-sm font-bold uppercase text-gray-500">Récapitulatif</div>
              <ul className="space-y-2 text-sm text-gray-700">
                {order.items.map((item, idx) => (
                  <li key={`${item.name}-${idx}`} className="flex justify-between">
                    <span>
                      {item.quantity}x {item.name}
                    </span>
                    <span>{formatCents(item.price * item.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-gray-100 pt-3 text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>Sous-total</span>
                  <span>{formatCents(order.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Livraison</span>
                  <span>{formatCents(order.deliveryFee)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-800">
                  <span>Total</span>
                  <span>{formatCents(order.total)}</span>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 space-y-2 text-sm text-gray-600">
              <div className="font-bold uppercase text-gray-500">Infos client</div>
              <div>Adresse : {order.deliveryAddress}</div>
              <div>Paiement : {order.paymentMethod === 'STRIPE' ? 'En ligne' : 'Cash'}</div>
              {(order.desiredDeliveryAt || order.desiredDeliverySlotLabel) && (
                <div>
                  Heure souhaitée :{' '}
                  {order.desiredDeliverySlotLabel ||
                    new Date(order.desiredDeliveryAt ?? '').toLocaleString('fr-BE', {
                      weekday: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                </div>
              )}
            </div>

            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
            {successMessage && (
              <p className="text-sm font-semibold text-green-600 flex items-center gap-2">
                <CheckCircle size={16} />
                {successMessage}
              </p>
            )}

            <button
              onClick={handleDelivered}
              disabled={isDelivering || !deliveredAction}
              className={`cta-premium w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-gold transition-all glow-soft shine-sweep ${
                isDelivering || !deliveredAction ? 'opacity-60 cursor-not-allowed' : 'hover:bg-snack-gold hover:text-snack-black'
              }`}
            >
              {isDelivering ? <LoadingSpinner label="Mise à jour..." size={20} /> : '✅ Marquer comme livrée'}
            </button>

            {publicOrderUrl && (
              <a
                href={publicOrderUrl}
                className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-snack-black hover:border-snack-gold transition-colors"
              >
                Voir suivi client
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
