export interface CheckoutItem {
  name: string;
  price: number; // cents (integer)
  quantity: number;
}

const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

// Logs DEV (sans casser la prod)
const dev = import.meta.env.DEV;
const logDev = (...args: any[]) => dev && console.log(...args);
const logDevGroup = (label: string) => dev && console.group(label);
const logDevGroupEnd = () => dev && console.groupEnd();
const logDevWarn = (...args: any[]) => dev && console.warn(...args);

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
  logDevGroup("🧾 startCheckout");

  if (!Array.isArray(items) || items.length === 0) {
    logDevGroupEnd();
    throw new Error("CART_EMPTY: Panier vide.");
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

  const payload = {
    items: validatedItems,
    origin: resolvePublicOrigin(),
  };

  const endpoint = `${resolveWorkerBaseUrl()}/create-checkout-session`;

  logDev("endpoint:", endpoint);
  logDev("payload:", payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    logDevGroupEnd();
    throw new Error(`WORKER_FETCH: ${(err as Error)?.message ?? err}`);
  }

  clearTimeout(timeout);

  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text().catch(() => "");

  logDev("status:", response.status);
  logDev("content-type:", contentType);
  logDev("raw:", raw);

  if (!response.ok) {
    let detail = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      detail = parsed?.error || parsed?.message || raw;
    } catch (e) {
      logDevWarn("Worker error body not JSON", e);
    }
    logDevGroupEnd();
    throw new Error(`WORKER_${response.status}: ${detail || "Réponse vide"}`);
  }

  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    logDevGroupEnd();
    throw new Error("WORKER_NON_JSON: Le Worker doit renvoyer du JSON.");
  }

  const url = data?.url;
  if (!url) {
    logDevGroupEnd();
    throw new Error("WORKER_EMPTY: aucune url retournée.");
  }

  logDev("redirecting to:", url);
  logDevGroupEnd();
  window.location.assign(url);
}

export function runDevTest() {
  return startCheckout([{ name: "Test", price: 100, quantity: 1 }]);
}
