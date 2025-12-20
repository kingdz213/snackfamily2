import { loadStripe } from "@stripe/stripe-js";

export interface CheckoutItem {
  name: string;
  price: number; // cents (integer)
  quantity: number;
}

const STRIPE_KEY = (import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined)?.trim();

function resolveWorkerUrl() {
  const raw = (import.meta.env.VITE_WORKER_URL as string | undefined)?.trim();
  const fallback = "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

  const base = raw || fallback;
  const trimmed = base.replace(/\/+$/, "");

  if (trimmed.endsWith("/create-checkout-session")) return trimmed;
  return `${trimmed}/create-checkout-session`;
}

// ✅ On autorise un fallback Worker même si VITE_WORKER_URL n’est pas défini (utile en Preview)
const WORKER_URL = resolveWorkerUrl();

export const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : Promise.resolve(null);

function safeOrigin() {
  const envOrigin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim();
  if (envOrigin) return envOrigin;

  const o = window.location.origin;
  if (o?.startsWith("http://snackfamily2.eu")) return "https://snackfamily2.eu";
  if (o && o !== "null" && o !== "about:blank") return o;

  return "https://snackfamily2.eu";
}

export async function startCheckout(items: CheckoutItem[]) {
  console.group("🧾 startCheckout");
  console.log("Worker URL:", WORKER_URL);

  const origin = safeOrigin();
  console.log("Origin:", origin);

  if (!STRIPE_KEY) {
    console.error("Missing VITE_STRIPE_PUBLIC_KEY");
    console.groupEnd();
    throw new Error("Clé Stripe manquante sur cette version (Preview/Prod).");
  }

  if (!Array.isArray(items) || items.length === 0) {
    console.error("No items");
    console.groupEnd();
    throw new Error("Panier vide.");
  }

  const payload = {
    items: items.map((it) => ({
      name: String(it.name ?? "").trim(),
      price: Math.round(Number(it.price)), // cents integer
      quantity: Math.round(Number(it.quantity)),
    })),
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`,
  };

  console.log("Payload:", payload);

  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text().catch(() => "");
  console.log("HTTP:", res.status);
  console.log("Raw:", raw);

  if (!res.ok) {
    let errorDetail = raw;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      errorDetail = parsed?.error || parsed?.message || raw;
    } catch (e) {
      console.warn("Worker error body not JSON", e);
    }
    console.error("Worker returned error", errorDetail || "(empty body)");
    console.groupEnd();
    throw new Error(`Worker error (${res.status}): ${errorDetail || "Réponse vide"}`);
  }

  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    console.groupEnd();
    throw new Error("Réponse Worker non-JSON (probablement HTML 404/CORS/Access)");
  }

  console.log("Parsed:", data);

  // ✅ Worker peut renvoyer url ou sessionId
  if (data?.url) {
    console.groupEnd();
    window.location.href = data.url;
    return;
  }

  if (data?.sessionId) {
    const stripe = await stripePromise;
    if (!stripe) {
      console.groupEnd();
      throw new Error("Stripe n’a pas pu être chargé.");
    }
    const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
    console.groupEnd();
    if (error) throw error;
    return;
  }

  console.groupEnd();
  throw new Error("Worker: aucune url/sessionId retournée.");
}

export async function runDevTest() {
  console.info("[runDevTest] Launching test checkout with 5€ item");
  return startCheckout([{ name: "Test Snack", price: 500, quantity: 1 }]);
}
