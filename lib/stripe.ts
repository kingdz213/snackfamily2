// lib/stripe.ts (FRONT) — envoie les PRIX EN EUROS au worker

export interface CheckoutItem {
  name: string;
  price: number; // EUROS (ex: 14.50)
  quantity: number;
}

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

export async function startCheckout(params: {
  items: CheckoutItem[];
  deliveryEnabled: boolean;
  deliveryAddress: string;
  // optionnel si tu veux activer le vrai blocage 10km
  deliveryLat?: number;
  deliveryLng?: number;
}): Promise<void> {
  const { items, deliveryEnabled, deliveryAddress, deliveryLat, deliveryLng } = params;

  if (!Array.isArray(items) || items.length === 0) throw new Error("CART_EMPTY: Panier vide.");

  // Validation simple front
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
    return { name, price, quantity };
  });

  const endpoint = resolveWorkerEndpoint();

  const payload: any = {
    items: validatedItems,
    origin: window.location.origin,
    deliveryEnabled,
    deliveryAddress: deliveryEnabled ? String(deliveryAddress ?? "").trim() : "",
  };

  if (typeof deliveryLat === "number" && typeof deliveryLng === "number") {
    payload.deliveryLat = deliveryLat;
    payload.deliveryLng = deliveryLng;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await res.text().catch(() => "");

  if (!res.ok) {
    let detail = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      detail = parsed?.message || parsed?.error || raw;
    } catch {}
    throw new Error(`WORKER_${res.status}: ${detail || "Réponse vide"}`);
  }

  let data: any;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error("WORKER_NON_JSON: Le Worker doit renvoyer du JSON.");
  }

  if (!data?.url) throw new Error("WORKER_EMPTY: aucune url retournée.");

  window.location.assign(data.url);
}
