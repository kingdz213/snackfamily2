import React, { useEffect, useState } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/src/firebase';
import { useAuth } from '@/src/auth/AuthProvider';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';
import { Page } from '../types';

interface MyOrdersPageProps {
  navigateTo: (page: Page) => void;
}

type OrderStatus =
  | 'RECEIVED'
  | 'PENDING_PAYMENT'
  | 'PAID_ONLINE'
  | 'IN_PREPARATION'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

type PaymentMethod = 'STRIPE' | 'CASH';

type MyOrder = {
  id: string;
  status: OrderStatus;
  createdAt: string;
  total: number;
  paymentMethod: PaymentMethod;
  deliveryAddress: string;
  desiredDeliveryAt?: string | null;
  desiredDeliverySlotLabel?: string | null;
};

const statusLabels: Record<OrderStatus, string> = {
  RECEIVED: 'Commande reçue',
  PENDING_PAYMENT: 'Paiement en attente',
  PAID_ONLINE: 'Commande confirmée',
  IN_PREPARATION: 'En préparation',
  OUT_FOR_DELIVERY: 'En livraison',
  DELIVERED: 'Livrée',
};

const paymentLabels: Record<PaymentMethod, string> = {
  STRIPE: 'En ligne',
  CASH: 'Cash',
};

const formatCents = (value: number) => `${(value / 100).toFixed(2).replace('.', ',')} €`;

const formatSchedule = (value?: string | null, label?: string | null) => {
  if (label) return label;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('fr-BE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
};

export const MyOrdersPage: React.FC<MyOrdersPageProps> = ({ navigateTo }) => {
  const { user, loading } = useAuth();
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const q = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Omit<MyOrder, 'id'>;
          return { id: docSnap.id, ...data };
        });
        setOrders(next);
        setIsLoading(false);
      },
      (err) => {
        setError(err.message || 'Impossible de charger vos commandes.');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  if (!loading && !user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-snack-light px-4 py-16">
        <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-6 text-center shadow-lg space-y-4">
          <h1 className="text-2xl font-display font-bold text-snack-black">Mes commandes</h1>
          <p className="text-sm text-gray-600">Connectez-vous pour accéder à votre historique.</p>
          <button
            onClick={() => navigateTo('account')}
            className="cta-premium w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-gold hover:bg-snack-gold hover:text-snack-black transition-colors"
          >
            Aller à Mon compte
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-snack-light pt-24 pb-16 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-snack-black">Mes commandes</h1>
            <p className="text-sm text-gray-600">Historique et statuts en temps réel.</p>
          </div>
          <div className="text-xs text-gray-500">Synchronisation automatique</div>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner label="Chargement..." size={26} />
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            Aucune commande liée à votre compte pour le moment.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const scheduledLabel = formatSchedule(order.desiredDeliveryAt, order.desiredDeliverySlotLabel);
              return (
                <div key={order.id} className="border border-gray-200 rounded-2xl bg-white p-5 shadow-sm space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Commande #{order.id}</div>
                      <div className="text-sm text-gray-600">{new Date(order.createdAt).toLocaleString('fr-BE')}</div>
                      <div className="text-sm text-gray-600">
                        {paymentLabels[order.paymentMethod]} • {formatCents(order.total)}
                      </div>
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      <span className="inline-flex items-center rounded-full bg-snack-gold/15 px-3 py-1 text-xs font-semibold text-snack-black">
                        {statusLabels[order.status]}
                      </span>
                      {scheduledLabel && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                          <CalendarClock size={14} />
                          Heure souhaitée : {scheduledLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">{order.deliveryAddress}</div>
                    <button
                      type="button"
                      onClick={() => {
                      window.history.pushState({}, '', `/mes-commandes/${order.id}`);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                      }}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-snack-black hover:text-snack-gold transition-colors"
                    >
                    Détails
                    <ChevronRight size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
