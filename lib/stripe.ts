// src/lib/stripe.ts

export interface CheckoutItem {
  name: string;
  price: number; // EUROS (ex: 14.50)
  quantity: number;
}

export type StartCheckoutParams = {
  origin?: string; // optionnel
  items: CheckoutItem[];

  // Livraison obligatoire (car ton Worker impose adresse + 10km)
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;

  // Paiement
  paymentMethod: "stripe" | "cash";
};

export type StartCheckoutResult =
  | { ok: true; method: "stripe"; url: string; sessionId?: string; orderId?: string }
  | { ok: true; method: "cash"; orderId: string; message?: string; totalCents?: number }
  | { ok: false; error: string; message?: string; details?: any };

const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, "");
}
function normalizeEndpoint(baseOrEndpoint: string): string {
  const trimmed = baseOrEndpoint.replace(/\/+$/, "");
  if (trimmed.endsWith("/create-checkout-session")) return trimmed;
  return `${trimmed}/create-checkout-session`;
}

export function resolveWorkerEndpoint(): string {
  const checkoutApiUrl = (import.meta.env.VITE_CHECKOUT_API_URL as string | undefined)?.trim();
  if (checkoutApiUrl) return normalizeEndpoint(checkoutApiUrl);

  const base = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  if (base) return `${normalizeBaseUrl(base)}/create-checkout-session`;

  if (import.meta.env.DEV) return `${normalizeBaseUrl(DEFAULT_WORKER_BASE_URL)}/create-checkout-session`;

  throw new Error(
    "MISSING_WORKER_BASE_URL: VITE_WORKER_BASE_URL (ou VITE_CHECKOUT_API_URL) est manquant."
  );
}

export async function startCheckout(params: StartCheckoutParams): Promise<StartCheckoutResult> {
  const { items, deliveryAddress, deliveryLat, deliveryLng, paymentMethod } = params;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("CART_EMPTY: Panier vide.");
  }

  const validatedItems = items.map((it, i) => {
    const name = String(it?.name ?? "").trim();
    const price =
      typeof (it as any)?.price === "string"
        ? Number(String((it as any).price).replace(",", "."))
        : Number(it?.price);
    const quantity = Number(it?.quantity);

    if (!name) throw new Error(`Item ${i} missing name`);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Item ${i} invalid price`);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Item ${i} invalid quantity`);

    return { name, price, quantity }; // ✅ EUROS
  });

  const endpoint = resolveWorkerEndpoint();

  const payload = {
    items: validatedItems,
    origin: params.origin || window.location.origin,

    paymentMethod,
    deliveryAddress: String(deliveryAddress ?? "").trim(),
    deliveryLat: Number(deliveryLat),
    deliveryLng: Number(deliveryLng),
  };

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
    throw new Error(`WORKER_FETCH: ${(err as Error)?.message ?? err}`);
  } finally {
    clearTimeout(timeout);
  }

  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    // si le worker renvoie pas du json
  }

  if (!response.ok) {
    const msg =
      data?.message || data?.error || raw || `Erreur Worker (${response.status})`;
    return { ok: false, error: `WORKER_${response.status}`, message: msg, details: data };
  }

  // Stripe -> redirect
  if (data?.url) {
    window.location.assign(data.url);
    return { ok: true, method: "stripe", url: data.url, sessionId: data.sessionId, orderId: data.orderId };
  }

  // Cash -> pas d’URL
  if (data?.ok && data?.method === "cash") {
    return {
      ok: true,
      method: "cash",
      orderId: data.orderId,
      message: data.message,
      totalCents: data.totalCents,
    };
  }

  return { ok: false, error: "WORKER_BAD_RESPONSE", message: "Réponse Worker inattendue.", details: data };
}
