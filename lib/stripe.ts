export interface CheckoutItem {
  name: string;
  price: number; // cents (integer)
  quantity: number;
}

const DEFAULT_WORKER_BASE_URL = "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

export function resolveWorkerBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  if (envUrl) return normalizeBaseUrl(envUrl);
  if (import.meta.env.DEV) return normalizeBaseUrl(DEFAULT_WORKER_BASE_URL);
  throw new Error("Missing worker base url");
}

export function resolvePublicOrigin(): string {
  const envOrigin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim();
  if (envOrigin) return envOrigin;
  return window.location.origin;
}

export async function startCheckout(items: CheckoutItem[]): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No checkout items provided");
  }

  const validatedItems = items.map((item, index) => {
    const name = String(item.name ?? "").trim();
    const price = Number(item.price);
    const quantity = Number(item.quantity);

    if (!name) throw new Error(`Item ${index} missing name`);
    if (!Number.isInteger(price) || price <= 0) throw new Error(`Item ${index} invalid price`);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Item ${index} invalid quantity`);

    return { name, price, quantity };
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  const payload = {
    items: validatedItems,
    origin: resolvePublicOrigin(),
  };

  const endpoint = `${resolveWorkerBaseUrl()}/create-checkout-session`;

  if (import.meta.env.DEV) {
    console.log("[startCheckout] endpoint", endpoint);
    console.log("[startCheckout] payload", payload);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw new Error(`Checkout request failed: ${(error as Error)?.message ?? error}`);
  }

  clearTimeout(timeout);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Checkout request failed (${response.status}): ${text}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`Invalid JSON response: ${(error as Error)?.message ?? error}`);
  }

  const url = (data as { url?: string })?.url;
  if (!url) {
    throw new Error("Checkout url missing");
  }

  if (import.meta.env.DEV) {
    console.log("[startCheckout] redirecting to", url);
  }

  window.location.assign(url);
}

export function runDevTest() {
  return startCheckout([{ name: "Test", price: 100, quantity: 1 }]);
}
