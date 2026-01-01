import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveWorkerBaseUrl } from '../lib/stripe';
import { OrderTimeline } from './OrderTimeline';
import { LoadingSpinner } from '@/src/components/LoadingSpinner';
import { Trash2 } from 'lucide-react';
import { MENU_CATEGORIES } from '../data/menuData';
import { MenuCategory, MenuItem } from '../types';
import {
  applyAvailabilityToMenu,
  getBrusselsEndOfDayIso,
  resolveMenuItemKey,
  type MenuAvailabilityMap,
} from '@/src/lib/menuAvailability';
import { toWhatsAppDigits } from '@/src/lib/phone';

type OrderStatus =
  | 'RECEIVED'
  | 'PENDING_PAYMENT'
  | 'PAID_ONLINE'
  | 'IN_PREPARATION'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

type PaymentMethod = 'stripe' | 'cash';

type AdminOrderSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  customerName?: string;
  phone?: string;
  address: string;
  deliveryType?: string;
  paymentMethod: PaymentMethod;
  totalCents: number;
  amountDueCents: number;
  itemsCount: number;
  adminHubUrl?: string;
  desiredDeliveryAt?: string;
  desiredDeliverySlotLabel?: string;
  notes?: string;
};

type AdminOrdersResponse = {
  orders: AdminOrderSummary[];
  cursor?: string;
};

type AvailabilityResponse = {
  ok: boolean;
  availability?: MenuAvailabilityMap;
  updatedAt?: string;
};

type AvailabilityMode = 'AVAILABLE' | 'TODAY' | 'MANUAL';

type StoreMode = 'AUTO' | 'OPEN' | 'CLOSED';

type WeeklyHours = Record<number, { start: string; end: string } | null>;

type StoreException = {
  date: string;
  closed: boolean;
};

type StoreSettings = {
  mode: StoreMode;
  weeklyHours: WeeklyHours;
  autoHolidaysBE: boolean;
  exceptions: StoreException[];
  updatedAt?: string;
};

const TOKEN_STORAGE_KEY = 'sf2_admin_token';
const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  0: { start: '16:30', end: '23:00' },
  1: null,
  2: { start: '11:30', end: '23:00' },
  3: { start: '11:30', end: '23:00' },
  4: { start: '11:30', end: '23:00' },
  5: { start: '11:30', end: '23:00' },
  6: { start: '11:30', end: '23:00' },
};

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  mode: 'AUTO',
  weeklyHours: DEFAULT_WEEKLY_HOURS,
  autoHolidaysBE: true,
  exceptions: [],
};

const statusLabels: Record<OrderStatus, string> = {
  RECEIVED: 'Commande reçue',
  PENDING_PAYMENT: 'Paiement en attente',
  PAID_ONLINE: 'Commande confirmée',
  IN_PREPARATION: 'En préparation',
  OUT_FOR_DELIVERY: 'En cours de livraison',
  DELIVERED: 'Livrée',
};

const formatCents = (value: number) => `${(value / 100).toFixed(2).replace('.', ',')} €`;

const formatDate = (value: string) => new Date(value).toLocaleString('fr-BE');

const formatSchedule = (value?: string, label?: string) => {
  if (label) return label;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('fr-BE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
};

export const AdminDashboardPage: React.FC = () => {
  const [pin, setPin] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [orderToDelete, setOrderToDelete] = useState<AdminOrderSummary | null>(null);
  const [deleteToast, setDeleteToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'availability'>('orders');
  const [availabilityCategories, setAvailabilityCategories] = useState<MenuCategory[]>(MENU_CATEGORIES);
  const [availabilityMap, setAvailabilityMap] = useState<MenuAvailabilityMap>({});
  const [availabilityUpdatedAt, setAvailabilityUpdatedAt] = useState<string | null>(null);
  const [availabilitySearch, setAvailabilitySearch] = useState('');
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [availabilityToast, setAvailabilityToast] = useState<string | null>(null);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [showUnavailableOnly, setShowUnavailableOnly] = useState(false);
  const [isResettingAvailability, setIsResettingAvailability] = useState(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [storeSettingsLoading, setStoreSettingsLoading] = useState(false);
  const [storeSettingsSaving, setStoreSettingsSaving] = useState(false);
  const [storeSettingsError, setStoreSettingsError] = useState<string | null>(null);
  const [storeSettingsToast, setStoreSettingsToast] = useState<string | null>(null);
  const [newExceptionDate, setNewExceptionDate] = useState('');

  const endpointBase = useMemo(() => resolveWorkerBaseUrl(), []);

  const persistToken = (value: string | null) => {
    setToken(value);
    if (typeof window === 'undefined') return;
    if (value) {
      localStorage.setItem(TOKEN_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  };

  const syncAvailability = useCallback((map: MenuAvailabilityMap, updatedAt?: string) => {
    setAvailabilityMap(map);
    setAvailabilityCategories(applyAvailabilityToMenu(MENU_CATEGORIES, map));
    setAvailabilityUpdatedAt(updatedAt ?? null);
  }, []);

  const hydrateStoreSettings = useCallback((payload: Partial<StoreSettings> | null) => {
    if (!payload) return;
    setStoreSettings({
      mode: payload.mode ?? DEFAULT_STORE_SETTINGS.mode,
      weeklyHours: payload.weeklyHours ?? DEFAULT_STORE_SETTINGS.weeklyHours,
      autoHolidaysBE: payload.autoHolidaysBE ?? DEFAULT_STORE_SETTINGS.autoHolidaysBE,
      exceptions: Array.isArray(payload.exceptions) ? payload.exceptions : [],
      updatedAt: payload.updatedAt,
    });
  }, []);

  const fetchStoreSettings = useCallback(async () => {
    if (!token) return;
    setStoreSettingsError(null);
    setStoreSettingsLoading(true);
    try {
      const response = await fetch(`${endpointBase}/admin/store-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || 'Impossible de charger les horaires.';
        throw new Error(message);
      }
      const payload = (await response.json()) as StoreSettings;
      hydrateStoreSettings(payload);
    } catch (err) {
      setStoreSettingsError(err instanceof Error ? err.message : 'Impossible de charger les horaires.');
    } finally {
      setStoreSettingsLoading(false);
    }
  }, [endpointBase, hydrateStoreSettings, token]);

  const fetchAvailability = useCallback(async () => {
    if (!token) return;
    setAvailabilityError(null);
    setAvailabilityLoading(true);
    try {
      const response = await fetch(`${endpointBase}/admin/menu/availability`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || 'Impossible de charger les disponibilités.';
        throw new Error(message);
      }
      const data = (await response.json()) as AvailabilityResponse;
      const availability = data.availability ?? {};
      syncAvailability(availability, data.updatedAt);
      setAvailabilityLoaded(true);
    } catch (err) {
      setAvailabilityError(err instanceof Error ? err.message : 'Impossible de charger les disponibilités.');
    } finally {
      setAvailabilityLoading(false);
    }
  }, [endpointBase, syncAvailability, token]);

  async function fetchOrders(reset = false, tokenOverride?: string) {
    const activeToken = tokenOverride ?? token;
    if (!activeToken) return;
    setError(null);
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (!reset && cursor) params.set('cursor', cursor);
      const response = await fetch(`${endpointBase}/admin/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || 'Impossible de charger les commandes.';
        throw new Error(message);
      }
      const data = (await response.json()) as AdminOrdersResponse;
      setOrders((prev) => (reset ? data.orders : [...prev, ...data.orders]));
      setCursor(data.cursor || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les commandes.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (stored) {
      setToken(stored);
    }
  }, []);

  useEffect(() => {
    if (token && orders.length === 0) {
      void fetchOrders(true);
    }
  }, [orders.length, token]);

  useEffect(() => {
    if (token) {
      void fetchStoreSettings();
    }
  }, [fetchStoreSettings, token]);

  useEffect(() => {
    if (activeTab === 'availability' && token && !availabilityLoaded) {
      void fetchAvailability();
    }
  }, [activeTab, availabilityLoaded, fetchAvailability, token]);

  useEffect(() => {
    if (!token) {
      setAvailabilityLoaded(false);
      syncAvailability({});
      setAvailabilitySearch('');
      setShowUnavailableOnly(false);
      setAvailabilityError(null);
      setAvailabilityToast(null);
      setStoreSettings(DEFAULT_STORE_SETTINGS);
      setStoreSettingsError(null);
      setStoreSettingsToast(null);
    }
  }, [syncAvailability, token]);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!pin) {
      setError('Merci de saisir le code gérant.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${endpointBase}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || 'Connexion refusée.';
        throw new Error(message);
      }
      const data = (await response.json()) as { token: string };
      persistToken(data.token);
      setOrders([]);
      setCursor(undefined);
      await fetchOrders(true, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion refusée.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      if (!token) return;
      setError(null);
      try {
        const response = await fetch(`${endpointBase}/admin/orders/${encodeURIComponent(orderId)}/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = payload?.message || 'Mise à jour impossible.';
          throw new Error(message);
        }
        const data = (await response.json()) as { summary: AdminOrderSummary };
        setOrders((prev) => prev.map((order) => (order.id === orderId ? data.summary : order)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Mise à jour impossible.');
      }
    },
    [endpointBase, token]
  );

  const getItemAvailabilityMode = useCallback(
    (item: MenuItem): AvailabilityMode => {
      const itemKey = resolveMenuItemKey(item);
      const override = availabilityMap[itemKey];
      if (!override || !override.unavailable) return 'AVAILABLE';
      if (override.until == null) return 'MANUAL';
      const untilMs = Date.parse(override.until);
      if (!Number.isFinite(untilMs) || Date.now() < untilMs) return 'TODAY';
      return 'AVAILABLE';
    },
    [availabilityMap]
  );

  const updateItemAvailability = useCallback(
    async (item: MenuItem, category: MenuCategory, mode: AvailabilityMode) => {
      if (!token) return;
      const previousMap = availabilityMap;
      const nextMap: MenuAvailabilityMap = { ...availabilityMap };
      const itemKey = resolveMenuItemKey(item, category);
      if (mode === 'AVAILABLE') {
        delete nextMap[itemKey];
      } else if (mode === 'TODAY') {
        nextMap[itemKey] = { unavailable: true, until: getBrusselsEndOfDayIso() };
      } else {
        nextMap[itemKey] = { unavailable: true, until: null };
      }
      syncAvailability(nextMap, availabilityUpdatedAt ?? undefined);
      setAvailabilityError(null);
      try {
        const response = await fetch(`${endpointBase}/admin/menu-availability`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ itemKey, mode }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message = payload?.message || 'Mise à jour impossible.';
          throw new Error(message);
        }
        const payload = (await response.json()) as { updatedAt?: string };
        setAvailabilityUpdatedAt(payload.updatedAt ?? null);
        setAvailabilityToast('Disponibilité mise à jour ✅');
      } catch (err) {
        syncAvailability(previousMap, availabilityUpdatedAt ?? undefined);
        setAvailabilityError(err instanceof Error ? err.message : 'Mise à jour impossible.');
      } finally {
        window.setTimeout(() => setAvailabilityToast(null), 1800);
      }
    },
    [availabilityMap, availabilityUpdatedAt, endpointBase, syncAvailability, token]
  );

  const resetAvailability = useCallback(async () => {
    if (!token) return;
    setAvailabilityError(null);
    setIsResettingAvailability(true);
    try {
      const response = await fetch(`${endpointBase}/admin/menu/reset`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || 'Réinitialisation impossible.';
        throw new Error(message);
      }
      const payload = (await response.json()) as { updatedAt?: string };
      syncAvailability({}, payload.updatedAt);
      setAvailabilityToast('Toutes les disponibilités ont été réinitialisées ✅');
    } catch (err) {
      setAvailabilityError(err instanceof Error ? err.message : 'Réinitialisation impossible.');
    } finally {
      setIsResettingAvailability(false);
      window.setTimeout(() => setAvailabilityToast(null), 1800);
    }
  }, [endpointBase, syncAvailability, token]);

  const updateWeeklyHours = (day: number, field: 'start' | 'end', value: string) => {
    setStoreSettings((prev) => {
      const current = prev.weeklyHours[day];
      if (!current) return prev;
      return {
        ...prev,
        weeklyHours: {
          ...prev.weeklyHours,
          [day]: {
            ...current,
            [field]: value,
          },
        },
      };
    });
  };

  const toggleDayClosed = (day: number, closed: boolean) => {
    setStoreSettings((prev) => ({
      ...prev,
      weeklyHours: {
        ...prev.weeklyHours,
        [day]: closed ? null : prev.weeklyHours[day] ?? DEFAULT_WEEKLY_HOURS[day],
      },
    }));
  };

  const addClosedException = () => {
    if (!newExceptionDate) return;
    setStoreSettings((prev) => {
      if (prev.exceptions.some((exception) => exception.date === newExceptionDate)) {
        return prev;
      }
      return {
        ...prev,
        exceptions: [...prev.exceptions, { date: newExceptionDate, closed: true }].sort((a, b) =>
          a.date.localeCompare(b.date)
        ),
      };
    });
    setNewExceptionDate('');
  };

  const removeException = (date: string) => {
    setStoreSettings((prev) => ({
      ...prev,
      exceptions: prev.exceptions.filter((exception) => exception.date !== date),
    }));
  };

  const saveStoreSettings = async () => {
    if (!token) return;
    setStoreSettingsError(null);
    setStoreSettingsSaving(true);
    try {
      const response = await fetch(`${endpointBase}/admin/store-settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mode: storeSettings.mode,
          weeklyHours: storeSettings.weeklyHours,
          autoHolidaysBE: storeSettings.autoHolidaysBE,
          exceptions: storeSettings.exceptions,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || 'Impossible de sauvegarder.';
        throw new Error(message);
      }
      const payload = (await response.json()) as StoreSettings;
      hydrateStoreSettings(payload);
      setStoreSettingsToast('Sauvegardé ✅');
    } catch (err) {
      setStoreSettingsError(err instanceof Error ? err.message : 'Impossible de sauvegarder.');
    } finally {
      setStoreSettingsSaving(false);
      window.setTimeout(() => setStoreSettingsToast(null), 2000);
    }
  };

  const handleDelete = useCallback(async () => {
    if (!token || !orderToDelete) return;
    setError(null);
    try {
      const response = await fetch(`${endpointBase}/admin/orders/${encodeURIComponent(orderToDelete.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const message = payload?.message || 'Suppression impossible.';
        throw new Error(message);
      }
      setOrders((prev) => prev.filter((order) => order.id !== orderToDelete.id));
      setDeleteToast('Commande supprimée ✅');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible.');
    } finally {
      setOrderToDelete(null);
      window.setTimeout(() => setDeleteToast(null), 2000);
    }
  }, [endpointBase, orderToDelete, token]);

  const copyAdminLink = async (order: AdminOrderSummary) => {
    if (!order.adminHubUrl) return;
    try {
      await navigator.clipboard.writeText(order.adminHubUrl);
      setCopiedOrderId(order.id);
      window.setTimeout(() => setCopiedOrderId(null), 1500);
    } catch {
      setError("Impossible de copier le lien.");
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-snack-light pt-24 pb-16 px-4">
        <div className="max-w-md mx-auto space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-display font-bold text-snack-black">Espace gérant</h1>
            <p className="text-sm text-gray-600">Connectez-vous pour gérer toutes les commandes.</p>
          </div>
          <form onSubmit={handleLogin} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4 shadow-sm">
            <label className="text-sm font-semibold text-gray-700" htmlFor="admin-pin">
              Code gérant
            </label>
            <input
              id="admin-pin"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
              placeholder="Saisir le code"
            />
            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={isSubmitting}
              className="cta-premium w-full rounded-lg bg-snack-black px-4 py-3 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-snack-gold hover:text-snack-black disabled:opacity-60"
            >
              {isSubmitting ? <LoadingSpinner label="Connexion..." size={20} /> : 'Accéder au tableau'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-snack-light pt-24 pb-16 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-snack-black">Tableau de bord gérant</h1>
            <p className="text-sm text-gray-600">Toutes les commandes, au même endroit.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            {activeTab === 'orders' ? (
              <button
                onClick={() => fetchOrders(true)}
                className="rounded-lg border border-snack-gold bg-snack-gold/10 px-4 py-2 text-sm font-semibold text-snack-black hover:bg-snack-gold transition-colors"
              >
                Actualiser
              </button>
            ) : (
              <button
                onClick={() => fetchAvailability()}
                className="rounded-lg border border-snack-gold bg-snack-gold/10 px-4 py-2 text-sm font-semibold text-snack-black hover:bg-snack-gold transition-colors"
              >
                Actualiser disponibilités
              </button>
            )}
            <button
              onClick={() => persistToken(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-snack-gold hover:text-snack-black transition-colors"
            >
              Se déconnecter
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('orders')}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'orders'
                ? 'border border-b-0 border-gray-200 bg-white text-snack-black'
                : 'text-gray-500 hover:text-snack-black'
            }`}
          >
            Commandes
          </button>
          <button
            onClick={() => setActiveTab('availability')}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'availability'
                ? 'border border-b-0 border-gray-200 bg-white text-snack-black'
                : 'text-gray-500 hover:text-snack-black'
            }`}
          >
            Disponibilités
          </button>
        </div>

        {activeTab === 'orders' && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {activeTab === 'availability' && availabilityError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {availabilityError}
          </div>
        )}

        {activeTab === 'orders' && (
          <>
            <section className="space-y-4">
              {orders.length === 0 && !isLoading ? (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
                  Aucune commande à afficher pour le moment.
                </div>
              ) : (
                orders.map((order) => {
                  const isStripePaid = order.paymentMethod === 'stripe' && order.amountDueCents === 0;
                  const isCashDue = order.paymentMethod === 'cash' && order.amountDueCents > 0;
                  const whatsappTarget = order.phone ? toWhatsAppDigits(order.phone) : '';

                  return (
                    <div key={order.id} className="border border-gray-200 rounded-2xl bg-white p-5 shadow-sm space-y-4">
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                              Commande #{order.id}
                            </div>
                            <h2 className="text-xl font-semibold text-snack-black">{order.address}</h2>
                            <p className="text-xs text-gray-500">
                              Dernière mise à jour : {formatDate(order.updatedAt)}
                            </p>
                          </div>
                          <div className="flex flex-col items-start gap-2">
                            <span className="inline-flex items-center rounded-full bg-snack-gold/15 px-3 py-1 text-xs font-semibold text-snack-black">
                              {statusLabels[order.status]}
                            </span>
                            {isStripePaid && (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                                Payée en ligne
                              </span>
                            )}
                            {isCashDue && (
                              <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                                À encaisser (espèces)
                              </span>
                            )}
                            <button
                              onClick={() => setOrderToDelete(order)}
                              className="inline-flex items-center gap-2 rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:border-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                              Supprimer
                            </button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                          <OrderTimeline status={order.status} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-gray-600">
                          <div>
                            <div className="text-xs uppercase text-gray-400 font-semibold">Paiement</div>
                            <div>
                              {order.paymentMethod === 'stripe'
                                ? 'Carte (Stripe)'
                                : 'Espèces'}{' '}
                              • {formatCents(order.totalCents)}
                            </div>
                            {(order.desiredDeliveryAt || order.desiredDeliverySlotLabel) && (
                              <div className="text-xs text-gray-500">
                                Heure souhaitée : {formatSchedule(order.desiredDeliveryAt, order.desiredDeliverySlotLabel)}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-xs uppercase text-gray-400 font-semibold">Contact</div>
                            {order.phone ? (
                              <div className="flex items-center gap-2">
                                <span>{order.phone}</span>
                                {whatsappTarget && (
                                  <a
                                    href={`https://wa.me/${whatsappTarget}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-snack-gold font-semibold hover:underline"
                                  >
                                    Contacter
                                  </a>
                                )}
                              </div>
                            ) : (
                              <div>Numéro indisponible</div>
                            )}
                            {order.customerName && <div className="text-xs text-gray-500">Client : {order.customerName}</div>}
                          </div>
                          <div>
                            <div className="text-xs uppercase text-gray-400 font-semibold">Articles</div>
                            <div>{order.itemsCount} article(s)</div>
                          </div>
                        </div>
                        {order.notes && (
                          <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                            Instructions : {order.notes}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-bold uppercase">
                        <button
                          onClick={() => updateStatus(order.id, 'IN_PREPARATION')}
                          className="rounded-lg border border-snack-gold bg-snack-gold/10 px-2 py-3 text-snack-black hover:bg-snack-gold transition-colors"
                        >
                          En préparation
                        </button>
                        <button
                          onClick={() => updateStatus(order.id, 'OUT_FOR_DELIVERY')}
                          className="rounded-lg border border-snack-gold bg-snack-gold/10 px-2 py-3 text-snack-black hover:bg-snack-gold transition-colors"
                        >
                          En livraison
                        </button>
                        <button
                          onClick={() => updateStatus(order.id, 'DELIVERED')}
                          className="rounded-lg border border-green-500 bg-green-50 px-2 py-3 text-green-700 hover:bg-green-500 hover:text-white transition-colors"
                        >
                          Livrée
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <a
                          href={`/admin/orders/${order.id}`}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-xs font-bold uppercase tracking-wide text-snack-black hover:border-snack-gold transition-colors"
                        >
                          Voir détails
                        </a>
                        {order.adminHubUrl && (
                          <button
                            onClick={() => copyAdminLink(order)}
                            className="inline-flex items-center justify-center rounded-lg border border-snack-gold/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-snack-black hover:border-snack-gold transition-colors"
                          >
                            {copiedOrderId === order.id ? 'Lien copié ✅' : 'Copier lien admin'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </section>

            {isLoading && (
              <div className="flex items-center justify-center py-6">
                <LoadingSpinner label="Chargement..." size={24} />
              </div>
            )}

            {cursor && (
              <button
                onClick={() => fetchOrders(false)}
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm font-bold uppercase tracking-wide text-snack-black hover:border-snack-gold transition-colors disabled:opacity-60"
              >
                Charger plus
              </button>
            )}
          </>
        )}

        {activeTab === 'availability' && (
          <section className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-snack-black">Gestion des disponibilités</h2>
                  <p className="text-xs text-gray-500">
                    {availabilityUpdatedAt
                      ? `Dernière mise à jour : ${formatDate(availabilityUpdatedAt)}`
                      : 'Dernière mise à jour indisponible'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={resetAvailability}
                    disabled={isResettingAvailability}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:border-red-400 transition-colors disabled:opacity-60"
                  >
                    Tout remettre disponible
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={availabilitySearch}
                  onChange={(event) => setAvailabilitySearch(event.target.value)}
                  placeholder="Rechercher un article"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                />
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={showUnavailableOnly}
                    onChange={(event) => setShowUnavailableOnly(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-snack-gold focus:ring-snack-gold"
                  />
                  Afficher seulement indisponibles
                </label>
              </div>
            </div>

            {availabilityLoading ? (
              <div className="flex items-center justify-center py-6">
                <LoadingSpinner label="Chargement..." size={24} />
              </div>
            ) : (
              availabilityCategories
                .map((category) => {
                  const filteredItems = category.items.filter((item) => {
                    const matchesSearch = item.name.toLowerCase().includes(availabilitySearch.toLowerCase());
                    const matchesAvailability = showUnavailableOnly ? item.unavailable : true;
                    return matchesSearch && matchesAvailability;
                  });
                  if (filteredItems.length === 0) return null;
                  return { ...category, items: filteredItems };
                })
                .filter((category): category is MenuCategory => Boolean(category))
                .map((category) => (
                  <div key={category.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-snack-black">{category.title}</h3>
                      <span className="text-xs text-gray-400">{category.items.length} article(s)</span>
                    </div>
                    <div className="space-y-3">
                      {category.items.map((item) => {
                        const currentMode = getItemAvailabilityMode(item);
                        return (
                          <div
                            key={item.id}
                            className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-snack-black">{item.name}</span>
                                {item.unavailable && (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600">
                                    Indisponible
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                {Number(item.price).toFixed(2)} €
                                {item.priceSecondary && ` • ${Number(item.priceSecondary).toFixed(2)} €`}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {([
                                { value: 'AVAILABLE', label: 'Disponible' },
                                { value: 'TODAY', label: 'Indispo aujourd’hui' },
                                { value: 'MANUAL', label: 'Indispo jusqu’à modif' },
                              ] as Array<{ value: AvailabilityMode; label: string }>).map((option) => (
                                <label
                                  key={option.value}
                                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase transition-colors ${
                                    currentMode === option.value
                                      ? 'border-snack-gold bg-snack-gold/10 text-snack-black'
                                      : 'border-gray-200 text-gray-500'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`availability-${item.id}`}
                                    value={option.value}
                                    checked={currentMode === option.value}
                                    onChange={() => updateItemAvailability(item, category, option.value)}
                                    className="accent-snack-gold"
                                  />
                                  {option.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
            )}
          </section>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-snack-black">Horaires & Ouverture</h2>
              <p className="text-sm text-gray-500">Mode automatique, override gérant et exceptions.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => fetchStoreSettings()}
                disabled={storeSettingsLoading}
                className="rounded-lg border border-snack-gold bg-snack-gold/10 px-4 py-2 text-sm font-semibold text-snack-black hover:bg-snack-gold transition-colors"
              >
                {storeSettingsLoading ? 'Actualisation...' : 'Actualiser horaires'}
              </button>
              <button
                onClick={saveStoreSettings}
                disabled={storeSettingsSaving}
                className="rounded-lg border border-snack-gold bg-snack-gold px-4 py-2 text-sm font-semibold text-snack-black hover:bg-snack-black hover:text-white transition-colors disabled:opacity-60"
              >
                {storeSettingsSaving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>

          {storeSettingsError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {storeSettingsError}
            </div>
          )}
          {storeSettingsToast && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {storeSettingsToast}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-700">Mode d'ouverture</div>
                <div className="flex flex-wrap gap-3">
                  {(['AUTO', 'OPEN', 'CLOSED'] as StoreMode[]).map((mode) => (
                    <label
                      key={mode}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide cursor-pointer transition-colors ${
                        storeSettings.mode === mode
                          ? 'border-snack-gold bg-snack-gold/10 text-snack-black'
                          : 'border-gray-200 text-gray-500'
                      }`}
                    >
                      <input
                        type="radio"
                        name="store-mode"
                        value={mode}
                        checked={storeSettings.mode === mode}
                        onChange={() => setStoreSettings((prev) => ({ ...prev, mode }))}
                        className="accent-snack-gold"
                      />
                      {mode === 'AUTO' ? 'Auto' : mode === 'OPEN' ? 'Ouvert' : 'Fermé'}
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={storeSettings.autoHolidaysBE}
                  onChange={(event) =>
                    setStoreSettings((prev) => ({ ...prev, autoHolidaysBE: event.target.checked }))
                  }
                  className="accent-snack-gold"
                />
                Fermé les jours fériés (Belgique)
              </label>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-700">Exceptions (jours fermés)</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="date"
                  value={newExceptionDate}
                  onChange={(event) => setNewExceptionDate(event.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold"
                />
                <button
                  type="button"
                  onClick={addClosedException}
                  className="rounded-lg border border-snack-gold bg-snack-gold/10 px-4 py-2 text-sm font-semibold text-snack-black hover:bg-snack-gold transition-colors"
                >
                  Ajouter jour fermé
                </button>
              </div>
              {storeSettings.exceptions.length === 0 ? (
                <div className="text-xs text-gray-400">Aucune exception enregistrée.</div>
              ) : (
                <ul className="space-y-2">
                  {storeSettings.exceptions.map((exception) => (
                    <li
                      key={exception.date}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                    >
                      <span>{exception.date}</span>
                      <button
                        type="button"
                        onClick={() => removeException(exception.date)}
                        className="text-xs font-semibold text-red-500 hover:text-red-600"
                      >
                        Supprimer
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-semibold text-gray-700">Horaires hebdomadaires</div>
            <div className="space-y-2">
              {DAY_LABELS.map((label, day) => {
                const daySchedule = storeSettings.weeklyHours[day];
                const isClosed = daySchedule === null;
                return (
                  <div
                    key={label}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <div className="w-12 text-sm font-semibold text-gray-700">{label}</div>
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={isClosed}
                        onChange={(event) => toggleDayClosed(day, event.target.checked)}
                        className="accent-snack-gold"
                      />
                      Fermé
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={daySchedule?.start ?? ''}
                        onChange={(event) => updateWeeklyHours(day, 'start', event.target.value)}
                        disabled={isClosed}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold disabled:bg-gray-100"
                      />
                      <span className="text-xs text-gray-500">→</span>
                      <input
                        type="time"
                        value={daySchedule?.end ?? ''}
                        onChange={(event) => updateWeeklyHours(day, 'end', event.target.value)}
                        disabled={isClosed}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-snack-gold disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {orderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h2 className="text-xl font-display font-bold text-snack-black">Supprimer cette commande ?</h2>
            <p className="text-sm text-gray-600">Cette action est irréversible.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setOrderToDelete(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:border-snack-gold hover:text-snack-black transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 rounded-full bg-snack-black px-4 py-2 text-xs font-bold uppercase tracking-wide text-snack-gold shadow-lg">
          {deleteToast}
        </div>
      )}

      {availabilityToast && (
        <div className="fixed top-36 left-1/2 -translate-x-1/2 rounded-full bg-snack-black px-4 py-2 text-xs font-bold uppercase tracking-wide text-snack-gold shadow-lg">
          {availabilityToast}
        </div>
      )}
    </div>
  );
};
