// lib/stripe.ts

export interface CheckoutItem {
  name: string;
  price: number; // cents (integer)
  quantity: number;
}

// Worker prod par défaut (fallback en DEV seulement)
const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

// DEV logs (ne casse pas la prod)
const dev = import.meta.env.DEV;
const logDev = (...args: any[]) => dev && console.log(...args);
const logDevGroup = (label: string) => dev && console.group(label);
const logDevGroupEnd = () => dev && console.groupEnd();
const logDevWarn = (...args: any[]) => dev && console.warn(...args);

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

function normalizeEndpoint(baseOrEndpoint: string): string {
  const trimmed = baseOrEndpoint.replace(/\/+$/, "");
  if (trimmed.endsWith("/create-checkout-session")) return trimmed;
  return `${trimmed}/create-checkout-session`;
}

export function resolveWorkerBaseUrl(): string {
  // 1) Si tu mets directement l’endpoint complet (recommandé si tu veux)
  const checkoutApiUrl = (import.meta.env.VITE_CHECKOUT_API_URL as string | undefined)?.trim();
  if (checkoutApiUrl) return normalizeEndpoint(checkoutApiUrl);

  // 2) Sinon base URL du worker
  const base = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  if (base) return normalizeBaseUrl(base);

  // 3) Fallback DEV uniquement
  if (import.meta.env.DEV) return normalizeBaseUrl(DEFAULT_WORKER_BASE_URL);

  throw new Error("MISSING_WORKER_BASE_URL: VITE_WORKER_BASE_URL (ou VITE_CHECKOUT_API_URL) est manquant.");
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
    const name = String(item?.name ?? "").trim();
    const price = Number(item?.price);
    const quantity = Number(item?.quantity);

    if (!name) throw new Error(`Item ${index} missing name`);
    if (!Number.isInteger(price) || price <= 0) throw new Error(`Item ${index} invalid price`);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Item ${index} invalid quantity`);

    return { name, price, quantity };
  });

  const origin = resolvePublicOrigin();

  // Endpoint final
  const baseOrEndpoint = resolveWorkerBaseUrl();
  const endpoint = baseOrEndpoint.includes("/create-checkout-session")
    ? baseOrEndpoint
    : `${baseOrEndpoint}/create-checkout-session`;

  const payload = { items: validatedItems, origin };

  logDev("endpoint:", endpoint);
  logDev("payload:", payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  let raw = "";

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    raw = await response.text().catch(() => "");
  } catch (err) {
    clearTimeout(timeout);
    logDevGroupEnd();
    throw new Error(`WORKER_FETCH: ${(err as Error)?.message ?? err}`);
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get("content-type") || "";
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

// Petit test DEV (à appeler depuis la console si besoin)
export function runDevTest() {
  return startCheckout([{ name: "Test", price: 100, quantity: 1 }]);
}
