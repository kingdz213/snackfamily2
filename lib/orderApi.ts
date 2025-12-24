export type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

export type CustomerInfo = {
  name: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
};

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID_ONLINE' | 'CASH_ON_DELIVERY';

export type OrderPaymentMethod = 'STRIPE' | 'CASH';

export type OrderRecord = {
  id: string;
  createdAt?: string | null;
  items: OrderItem[];
  total: number;
  deliveryFee: number;
  customer: CustomerInfo;
  paymentMethod: OrderPaymentMethod;
  status: OrderStatus;
  stripeCheckoutSessionId?: string | null;
  note?: string | null;
};

export type CreateOrderPayload = {
  items: OrderItem[];
  total: number;
  deliveryFee: number;
  customer: CustomerInfo;
  note?: string;
};

const DEFAULT_FUNCTIONS_BASE_URL = 'https://europe-west1-snackfamily2.cloudfunctions.net';

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, '');
}

export function resolveFunctionsBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_FUNCTIONS_BASE_URL as string | undefined)?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_FUNCTIONS_BASE_URL;
  return normalizeBaseUrl(base);
}

async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') return body.error;
    if (body && typeof body.message === 'string') return body.message;
  } catch {
    // ignore
  }
  return response.statusText || 'Request failed';
}

export async function createOrderCash(payload: CreateOrderPayload): Promise<{ orderId: string }> {
  const endpoint = `${resolveFunctionsBaseUrl()}/createOrderCash`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const data = (await response.json()) as { orderId?: string };
  if (!data.orderId) {
    throw new Error('Order id missing');
  }

  return { orderId: data.orderId };
}

export async function createOrderStripe(payload: CreateOrderPayload & { successUrl: string; cancelUrl: string }) {
  const endpoint = `${resolveFunctionsBaseUrl()}/createOrderStripe`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const data = (await response.json()) as { url?: string; sessionId?: string; orderId?: string };
  if (!data.url || !data.orderId) {
    throw new Error('Checkout session missing');
  }

  return data as { url: string; sessionId: string; orderId: string };
}

export async function getOrder(params: { orderId?: string; sessionId?: string; pin?: string }) {
  const endpoint = `${resolveFunctionsBaseUrl()}/getOrder`;
  const search = new URLSearchParams();
  if (params.orderId) search.set('orderId', params.orderId);
  if (params.sessionId) search.set('sessionId', params.sessionId);
  if (params.pin) search.set('pin', params.pin);

  const response = await fetch(`${endpoint}?${search.toString()}`);

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const data = (await response.json()) as { order?: OrderRecord };
  if (!data.order) {
    throw new Error('Order not found');
  }

  return data.order;
}
