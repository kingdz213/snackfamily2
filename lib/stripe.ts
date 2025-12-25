// src/lib/stripe.ts

export type CheckoutItem = {
  name: string;
  price: number; // cents
  quantity: number;
};

export type CheckoutPayload = {
  origin: string;
  items: CheckoutItem[];
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  desiredDeliveryAt?: string | null;
  desiredDeliverySlotLabel?: string | null;
  firebaseIdToken?: string;
};

export type CashOrderPayload = {
  items: CheckoutItem[];
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  origin: string;
  desiredDeliveryAt?: string | null;
  desiredDeliverySlotLabel?: string | null;
  firebaseIdToken?: string;
};

export type CheckoutResponse = {
  url?: string;
  sessionId?: string;
  orderId?: string;
  publicOrderUrl?: string;
  adminHubUrl?: string;
};

export type CashOrderResponse = {
  orderId: string;
  publicOrderUrl: string;
  adminHubUrl: string;
};


const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

const logDev = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(...args);
};

function withHttps(input: string): string {
  const v = input.trim();
  if (!v) return v;
  // If the env is "delicate-meadow-....workers.dev" (no scheme), fetch() treats it as relative.
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function stripKnownEndpoint(base: string): string {
  // Prevent accidental bases like ".../create-checkout-session"
  return base
    .replace(/\/create-checkout-session\/?$/i, "")
    .replace(/\/create-cash-order\/?$/i, "");
}

function normalizeBaseUrl(base: string): string {
  const cleaned = stripKnownEndpoint(withHttps(base)).replace(/\/+$/, "");

  // Extra safety: if someone puts something weird, try URL parsing.
  // Keeps custom worker routes if any (pathname), but without trailing slashes.
  try {
    const u = new URL(cleaned);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.origin}${path === "/" ? "" : path}`;
  } catch {
    return cleaned;
  }
}

export function resolveWorkerBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  const base = fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_WORKER_BASE_URL;
  return normalizeBaseUrl(base);
}

async function postJson<T>(
  endpoint: string,
  payload: unknown,
  opts?: { timeoutMs?: number }
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    logDev("[api] POST", endpoint, payload);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Try JSON error, then fallback to text (useful when server returns HTML like index.html)
      let message = response.statusText || "Request failed";

      try {
        const errorBody = await response.json();
        if (errorBody && typeof (errorBody as any).message === "string") {
          message = (errorBody as any).message;
        } else if (errorBody && typeof (errorBody as any).error === "string") {
          message = (errorBody as any).error;
        }
      } catch {
        try {
          const text = await response.text();
          if (text) message = `${message} - ${text.slice(0, 200)}`;
        } catch {
          // ignore
        }
      }

      throw new Error(message);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function startCashOrder(payload: CashOrderPayload): Promise<CashOrderResponse> {
  const endpoint = `${resolveWorkerBaseUrl()}/create-cash-order`;
  return postJson<CashOrderResponse>(endpoint, payload);
}

export async function startCheckout(payload: CheckoutPayload): Promise<CheckoutResponse> {
  const endpoint = `${resolveWorkerBaseUrl()}/create-checkout-session`;

  const data = await postJson<CheckoutResponse>(endpoint, payload);

  const url = data?.url;
  if (!url) throw new Error("Checkout url missing");

  logDev("[stripe] redirect", url);
  window.location.assign(url);
  return data;
}
