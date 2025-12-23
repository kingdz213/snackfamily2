// src/lib/stripe.ts

export interface CheckoutItem {
  name: string;
  price: number; // CENTIMES (ex: 750 => 7,50€)
  quantity: number;
}

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

export function resolvePublicOrigin(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim();
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;

  throw new Error("PUBLIC_ORIGIN_UNAVAILABLE");
}

export async function startCheckout(items: CheckoutItem[]): Promise<void> {
  const dev = import.meta.env.DEV;
  const logDev = (...args: unknown[]) => {
    if (dev) console.log(...args);
  };

  const sanitizedItems = items.map((item, index) => {
    const name = String(item?.name ?? "").trim();
    const price = Number(item?.price);
    const quantity = Number(item?.quantity);

    if (!name) throw new Error(`Item ${index} missing name`);
    if (!Number.isInteger(price) || price <= 0) throw new Error(`Item ${index} invalid price`);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Item ${index} invalid quantity`);

    return { name, price, quantity };
  });

  const endpoint = `${resolveWorkerBaseUrl()}/create-checkout-session`;
  const payload = {
    items: sanitizedItems,
    origin: resolvePublicOrigin(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  let text = "";

  try {
    logDev("[stripe] POST", endpoint, payload);
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    text = await response.text();
    logDev("[stripe] response", response.status, text);
  } catch (error) {
    clearTimeout(timeout);
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Stripe worker ${response.status}: ${text || response.statusText}`);
  }

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  const url = (data as { url?: string })?.url;
  if (!url) throw new Error("Checkout url missing");

  window.location.assign(url);
}

export async function runDevTest() {
  return startCheckout([{ name: "Test", price: 100, quantity: 1 }]);
}
