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
  const base = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  if (base) return normalizeBaseUrl(base);

  if (import.meta.env.DEV) return normalizeBaseUrl(DEFAULT_WORKER_BASE_URL);

  throw new Error("MISSING_WORKER_BASE_URL: VITE_WORKER_BASE_URL est manquant.");
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

  const validatedItems = items.map((it, i) => {
    const name = String(it?.name ?? "").trim();
    const price = Number(it?.price);
    const quantity = Number(it?.quantity);

    if (!name) throw new Error(`Item ${i} missing name`);
    if (!Number.isInteger(price) || price <= 0) throw new Error(`Item ${i} invalid price`);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Item ${i} invalid quantity`);

    return { name, price, quantity };
  });

  const payload = {
    items: validatedItems,
    origin: resolvePublicOrigin(),
  };

  const endpoint = `${resolveWorkerBaseUrl()}/create-checkout-session`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  let raw = "";

  try {
    logDev("[stripe] POST", endpoint, payload);
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    raw = await response.text().catch(() => "");
    logDev("[stripe] response", response.status, raw);
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`WORKER_FETCH: ${(err as Error)?.message ?? err}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let message = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      message = parsed?.message || parsed?.details || parsed?.error || raw;
    } catch {}
    throw new Error(message || `WORKER_${response.status}`);
  }

  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (err) {
    throw new Error(`WORKER_PARSE: ${(err as Error)?.message ?? err}`);
  }

  const url = data?.url;
  if (!url) throw new Error("WORKER_EMPTY: aucune url retournée.");

  window.location.assign(url);
}
