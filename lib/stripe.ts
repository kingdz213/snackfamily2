// src/lib/stripe.ts

export interface CheckoutItem {
  name: string;
  price: number; // EUROS (ex: 14.50)
  quantity: number;
}

export type StartCheckoutParams = {
  origin: string;
  items: CheckoutItem[];

  // livraison obligatoire
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
};

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

  throw new Error("MISSING_WORKER_BASE_URL: VITE_WORKER_BASE_URL (ou VITE_CHECKOUT_API_URL) est manquant.");
}

export async function startCheckout(params: StartCheckoutParams): Promise<void> {
  const origin = (params.origin || window.location.origin).trim();
  const endpoint = resolveWorkerEndpoint();

  const deliveryAddress = String(params.deliveryAddress || "").trim();
  if (!deliveryAddress) throw new Error("Adresse de livraison obligatoire.");

  const validatedItems = params.items.map((it, i) => {
    const name = String(it?.name ?? "").trim();
    const price =
      typeof (it as any)?.price === "string"
        ? Number(String((it as any).price).replace(",", "."))
        : Number(it?.price);
    const quantity = Number(it?.quantity);

    if (!name) throw new Error(`Item ${i} missing name`);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Item ${i} invalid price`);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error(`Item ${i} invalid quantity`);

    return { name, price, quantity };
  });

  const payload = {
    origin,
    items: validatedItems,
    // le worker est livraison-only, donc on envoie forcément ces champs
    deliveryAddress,
    deliveryLat: params.deliveryLat,
    deliveryLng: params.deliveryLng,
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

  if (!response.ok) {
    let detail = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      detail = parsed?.message || parsed?.error || raw;
    } catch {}
    throw new Error(`WORKER_${response.status}: ${detail || "Réponse vide"}`);
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
