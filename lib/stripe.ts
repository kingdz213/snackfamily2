// src/lib/stripe.ts

export interface CheckoutItem {
  name: string;
  price: number; // cents
  quantity: number;
}

export type StartCheckoutParams = CheckoutItem[];

const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

export function resolveWorkerBaseUrl(): string {
  const envBase = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  if (envBase) return normalizeBaseUrl(envBase);

  if (import.meta.env.DEV) return normalizeBaseUrl(DEFAULT_WORKER_BASE_URL);

  throw new Error("VITE_WORKER_BASE_URL is required");
}

export function resolvePublicOrigin(): string {
  const envOrigin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim();
  if (envOrigin) return normalizeBaseUrl(envOrigin);

  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeBaseUrl(window.location.origin);
  }

  throw new Error("PUBLIC_ORIGIN unavailable");
}

export async function startCheckout(items: StartCheckoutParams): Promise<void> {
  if (!Array.isArray(items)) throw new Error("Items must be an array");

  const validatedItems = items.map((it, index) => {
    const name = String(it?.name ?? "").trim();
    const price = Number(it?.price);
    const quantity = Number(it?.quantity);

    if (!name) throw new Error(`Item ${index} missing name`);
    if (!Number.isInteger(price) || price <= 0)
      throw new Error(`Item ${index} invalid price`);
    if (!Number.isInteger(quantity) || quantity < 1)
      throw new Error(`Item ${index} invalid quantity`);

    return { name, price, quantity } satisfies CheckoutItem;
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  const payload = {
    items: validatedItems,
    origin: resolvePublicOrigin(),
  } as const;

  const endpoint = `${resolveWorkerBaseUrl()}/create-checkout-session`;

  let response: Response;
  let raw = "";

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug("[stripe] startCheckout payload", payload);
  }

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    raw = await response.text();
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(`Fetch error: ${(err as Error)?.message ?? err}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const statusText = response.statusText || "Unknown error";
    const reason = raw ? `${response.status} ${raw}` : `${response.status} ${statusText}`;
    throw new Error(reason);
  }

  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error("Invalid JSON response");
  }

  const url = data?.url;
  if (!url) throw new Error("Checkout url missing");

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug("[stripe] redirecting to", url);
  }

  window.location.assign(url);
}

export async function runDevTest(): Promise<void> {
  const sample: CheckoutItem[] = [
    { name: "Test produit", price: 750, quantity: 2 },
  ];
  await startCheckout(sample);
}
