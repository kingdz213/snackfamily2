// lib/stripe.ts
export interface CheckoutItem {
  name: string;
  price: number; // cents (integer)
  quantity: number;
}

type WorkerResponse = { url?: string; error?: string; details?: unknown };

const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

const dev = import.meta.env.DEV;

// Logs DEV (sans casser la prod)
const logDev = (...args: any[]) => dev && console.log(...args);
const logDevGroup = (label: string) => dev && console.group(label);
const logDevGroupEnd = () => dev && console.groupEnd();
const logDevWarn = (...args: any[]) => dev && console.warn(...args);

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}

function envStr(key: string): string | undefined {
  return (import.meta.env[key] as string | undefined)?.trim();
}

/**
 * Base URL du Worker Cloudflare
 * Exemple: https://xxxx.workers.dev
 */
export function resolveWorkerBaseUrl(): string {
  const configured = envStr("VITE_WORKER_BASE_URL") || envStr("VITE_WORKER_URL") || envStr("VITE_CHECKOUT_API_URL");

  if (configured) return normalizeBaseUrl(configured);

  // En DEV, on autorise un fallback (pratique pour tester)
  if (dev) return normalizeBaseUrl(DEFAULT_WORKER_BASE_URL);

  // En prod, on force à configurer la variable
  throw new Error(
    "MISSING_WORKER_BASE_URL: Configure VITE_WORKER_BASE_URL (ex: https://xxxx.workers.dev)"
  );
}

/**
 * Origin public pour construire les success/cancel urls côté backend.
 * En prod, mets VITE_PUBLIC_ORIGIN=https://snackfamily2.eu
 */
export function resolvePublicOrigin(): string {
  const o = envStr("VITE_PUBLIC_ORIGIN");
  if (o) return o.replace(/\/+$/, "");
  // fallback runtime
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }
  return "https://example.com";
}

function validateItems(items: CheckoutItem[]): CheckoutItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("CART_EMPTY: Panier vide.");
  }

  return items.map((item, index) => {
    const name = String(item?.name ?? "").trim();
    const price = Number(item?.price);
    const quantity = Number(item?.quantity);

    if (!name) throw new Error(`ITEM_${index}_NAME: Nom manquant`);
    if (!Number.isInteger(price) || price <= 0)
      throw new Error(`ITEM_${index}_PRICE: Prix invalide (cents)`);
    if (!Number.isInteger(quantity) || quantity < 1)
      throw new Error(`ITEM_${index}_QTY: Quantité invalide`);

    return { name, price, quantity };
  });
}

export async function startCheckout(items: CheckoutItem[]): Promise<void> {
  logDevGroup("🧾 startCheckout");

  const validatedItems = validateItems(items);

  const payload = {
    items: validatedItems,
    origin: resolvePublicOrigin(),
  };

  const base = resolveWorkerBaseUrl();
  const endpoint = `${base}/create-checkout-session`;

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
    throw new Error(`WORKER_FETCH: ${(err as Error)?.message ?? String(err)}`);
  }

  clearTimeout(timeout);

  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text().catch(() => "");

  logDev("status:", response.status);
  logDev("content-type:", contentType);
  logDev("raw:", raw);

  // Erreurs HTTP
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

  // Doit être du JSON
  let data: WorkerResponse;
  try {
    data = raw ? (JSON.parse(raw) as WorkerResponse) : {};
  } catch {
    logDevGroupEnd();
    throw new Error("WORKER_NON_JSON: Le Worker doit renvoyer du JSON.");
  }

  const url = data?.url;

  if (!url) {
    logDevGroupEnd();
    throw new Error(
      `WORKER_EMPTY: aucune url retournée. (réponse: ${raw || "vide"})`
    );
  }

  logDev("redirecting to:", url);
  logDevGroupEnd();

  window.location.assign(url);
}

export function runDevTest() {
  return startCheckout([{ name: "Test", price: 100, quantity: 1 }]);
}
