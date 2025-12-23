// src/lib/stripe.ts

export interface CheckoutItem {
  name: string;
  price: number; // CENTIMES (ex: 1450 = 14,50€)
  quantity: number;
}

export type StartCheckoutParams = {
  items: CheckoutItem[];
  [key: string]: unknown;
};

const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

export function resolveWorkerBaseUrl(): string {
  const checkoutApiUrl = (import.meta.env.VITE_CHECKOUT_API_URL as string | undefined)?.trim();
  if (checkoutApiUrl) return normalizeBaseUrl(checkoutApiUrl);

  const base = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  if (base) return normalizeBaseUrl(base);

  if (import.meta.env.DEV) return normalizeBaseUrl(DEFAULT_WORKER_BASE_URL);

  throw new Error(
    "MISSING_WORKER_BASE_URL: VITE_WORKER_BASE_URL (ou VITE_CHECKOUT_API_URL) est manquant.",
  );
}

export function resolvePublicOrigin(): string {
  const envOrigin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim();
  if (envOrigin) return envOrigin.replace(/\/+$/, "");
  return "https://snackfamily2.eu";
}

function validateItems(items: CheckoutItem[]): CheckoutItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No checkout items provided");
  }

  return items.map((item, index) => {
    const name = String(item?.name ?? "").trim();
    const price = Number(item?.price);
    const quantity = Number(item?.quantity);

    if (!name) throw new Error(`Item ${index} missing name`);
    if (!Number.isInteger(price) || price <= 0) throw new Error(`Item ${index} invalid price`);
    if (!Number.isInteger(quantity) || quantity < 1)
      throw new Error(`Item ${index} invalid quantity`);

    return { name, price, quantity } satisfies CheckoutItem;
  });
}

export async function startCheckout(itemsOrParams: CheckoutItem[] | StartCheckoutParams): Promise<void> {
  const itemsInput = Array.isArray(itemsOrParams) ? itemsOrParams : itemsOrParams?.items;
  const items = validateItems(itemsInput ?? []);

  const payload = {
    items,
    origin: resolvePublicOrigin(),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  const endpoint = `${resolveWorkerBaseUrl()}/create-checkout-session`;

  let response: Response;
  try {
    if (import.meta.env.DEV) {
      console.info("[stripe] POST", endpoint, payload);
    }

    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (import.meta.env.DEV) console.error("[stripe] fetch error", err);
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timeout);
  }

  const raw = await response.text().catch(() => "");

  if (!response.ok) {
    const message = raw || `${response.status} ${response.statusText}`.trim();
    throw new Error(message.trim());
  }

  let data: any;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (err) {
    throw new Error("Invalid JSON returned by checkout endpoint");
  }

  const url = data?.url;
  if (!url) throw new Error("Checkout url missing");

  if (import.meta.env.DEV) console.info("[stripe] redirect", url);
  window.location.assign(url);
}

export async function runDevTest(): Promise<void> {
  const items: CheckoutItem[] = [
    {
      name: "Test Panini",
      price: 750,
      quantity: 1,
    },
  ];

  return startCheckout(items);
}
