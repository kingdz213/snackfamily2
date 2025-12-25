// src/lib/stripe.ts

export type CheckoutItem = {
  name: string;
  price: number;
  quantity: number;
};

export type CheckoutPayload = {
  origin: string;
  items: CheckoutItem[];
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
};

export type CashOrderPayload = {
  items: CheckoutItem[];
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  origin: string;
};

export type CheckoutResponse = {
  url?: string;
  sessionId?: string;
  orderId?: string;
};

export type CashOrderResponse = {
  orderId: string;
};

const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

export function resolveWorkerBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_WORKER_BASE_URL;
  return normalizeBaseUrl(base);
}

async function postJson<T>(endpoint: string, payload: unknown): Promise<T> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorBody = await response.json();
      if (errorBody && typeof errorBody.message === 'string') {
        errorMessage = errorBody.message;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(errorMessage || 'Request failed');
  }

  return (await response.json()) as T;
}

export async function startCashOrder(payload: CashOrderPayload): Promise<CashOrderResponse> {
  const endpoint = `${resolveWorkerBaseUrl()}/create-cash-order`;
  return postJson<CashOrderResponse>(endpoint, payload);
}

export async function startCheckout(payload: CheckoutPayload): Promise<CheckoutResponse> {
  const logDev = (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log(...args);
  };

  const endpoint = `${resolveWorkerBaseUrl()}/create-checkout-session`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    logDev('[stripe] POST', endpoint, payload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorBody = await response.json();
        if (errorBody && typeof errorBody.message === 'string') {
          errorMessage = errorBody.message;
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(errorMessage || 'Stripe checkout failed');
    }

    const data = (await response.json()) as CheckoutResponse;
    const url = data?.url;

    if (!url) {
      throw new Error('Checkout url missing');
    }

    logDev('[stripe] redirect', url);
    window.location.assign(url);
    return data;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timeout);
  }
}
