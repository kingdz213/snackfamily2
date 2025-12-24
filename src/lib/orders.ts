import { resolveWorkerBaseUrl } from './stripe';

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID_ONLINE' | 'CASH_ON_DELIVERY';
export type PaymentMethod = 'STRIPE' | 'CASH';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderCustomer {
  name: string;
  phone: string;
  address: string;
}

export interface Order {
  id: string;
  createdAt: string;
  items: OrderItem[];
  total: number;
  deliveryFee: number;
  customer: OrderCustomer;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  stripeCheckoutSessionId?: string;
  note?: string;
}

export interface CreateOrderPayload {
  items: OrderItem[];
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  customer: OrderCustomer;
  note?: string;
}

export interface CreateOrderStripeResponse {
  url: string;
  sessionId: string;
  orderId: string;
}

const DEFAULT_TIMEOUT = 15000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return response;
  } finally {
    window.clearTimeout(id);
  }
}

function handleError(message: string, error: unknown): never {
  throw error instanceof Error ? error : new Error(message);
}

export async function createOrderCash(payload: CreateOrderPayload): Promise<string> {
  const endpoint = `${resolveWorkerBaseUrl()}/create-order-cash`;
  try {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || body?.error || 'Impossible de créer la commande cash.');
    }

    const data = (await response.json()) as { orderId?: string };
    if (!data?.orderId) {
      throw new Error('OrderId manquant.');
    }

    return data.orderId;
  } catch (error) {
    handleError('Impossible de créer la commande cash.', error);
  }
}

export async function createOrderStripe(payload: CreateOrderPayload): Promise<CreateOrderStripeResponse> {
  const endpoint = `${resolveWorkerBaseUrl()}/create-order-stripe`;
  try {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || body?.error || 'Impossible de démarrer le paiement.');
    }

    const data = (await response.json()) as CreateOrderStripeResponse;
    if (!data?.url || !data?.sessionId || !data?.orderId) {
      throw new Error('Réponse Stripe incomplète.');
    }

    return data;
  } catch (error) {
    handleError('Impossible de démarrer le paiement.', error);
  }
}

export async function getOrder(orderId: string): Promise<Order> {
  const endpoint = `${resolveWorkerBaseUrl()}/order/${encodeURIComponent(orderId)}`;
  try {
    const response = await fetchWithTimeout(endpoint, { method: 'GET' }, DEFAULT_TIMEOUT);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || body?.error || 'Commande introuvable.');
    }
    const data = (await response.json()) as { order?: Order };
    if (!data?.order) {
      throw new Error('Commande introuvable.');
    }
    return data.order;
  } catch (error) {
    handleError('Commande introuvable.', error);
  }
}

export async function getOrderBySession(sessionId: string): Promise<Order> {
  const endpoint = `${resolveWorkerBaseUrl()}/order-by-session?sessionId=${encodeURIComponent(sessionId)}`;
  try {
    const response = await fetchWithTimeout(endpoint, { method: 'GET' }, DEFAULT_TIMEOUT);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || body?.error || 'Commande introuvable.');
    }
    const data = (await response.json()) as { order?: Order };
    if (!data?.order) {
      throw new Error('Commande introuvable.');
    }
    return data.order;
  } catch (error) {
    handleError('Commande introuvable.', error);
  }
}
