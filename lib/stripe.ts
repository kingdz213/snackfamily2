import { loadStripe } from "@stripe/stripe-js";

export type CheckoutItem = { id: string; quantity: number };

type WorkerResponse = {
  url?: string;
  sessionId?: string;
  error?: string;
  details?: unknown;
};

const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";

const normalizeBase = (base: string) => base.replace(/\/+$/, "");

const resolveWorkerBaseUrl = () => {
  const env = (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim();
  return normalizeBase(env && env.length > 0 ? env : DEFAULT_WORKER_BASE_URL);
};

const resolvePublicOrigin = () => {
  const envOrigin =
    (import.meta.env.VITE_ORIGIN_FALLBACK as string | undefined)?.trim() ||
    (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim();

  if (typeof window !== "undefined" && window.location) {
    const o = window.location.origin;
    if (o && o !== "null" && o !== "about:blank") return o;
  }

  if (envOrigin) return envOrigin;

  return "https://snackfamily2.eu";
};

const sanitizeItems = (items: CheckoutItem[]) =>
  (items ?? [])
    .map((it) => ({
      id: String((it as any)?.id ?? "").trim(),
      quantity: Number.isFinite((it as any)?.quantity)
        ? Math.max(1, Math.trunc((it as any).quantity))
        : 1,
    }))
    .filter((it) => it.id.length > 0);

// Stripe (fallback si le worker renvoie sessionId plutôt que url)
const STRIPE_PUBLIC_KEY =
  (import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined)?.trim() ||
  (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim();

export const stripePromise = STRIPE_PUBLIC_KEY ? loadStripe(STRIPE_PUBLIC_KEY) : Promise.resolve(null);

async function parseWorkerJson(res: Response): Promise<{ data: WorkerResponse; raw: string }> {
  const raw = await res.text();
  try {
    const data = JSON.parse(raw) as WorkerResponse;
    return { data, raw };
  } catch {
    // si le worker renvoie autre chose
    return { data: { error: "Invalid JSON response from payment server.", details: raw }, raw };
  }
}

export async function startCheckout(items: CheckoutItem[], customer?: Record<string, unknown>) {
  const safeItems = sanitizeItems(items);
  if (safeItems.length === 0) throw new Error("Panier vide : impossible de démarrer le paiement.");

  const base = resolveWorkerBaseUrl();
  const endpoint = `${base}/create-checkout-session`;
  const origin = resolvePublicOrigin();

  const payload: Record<string, unknown> = {
    items: safeItems,
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`,
  };
  if (customer && typeof customer === "object") payload.customer = customer;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const { data, raw } = await parseWorkerJson(res);

  if (!res.ok) {
    const msg =
      typeof data?.error === "string" && data.error.length > 0
        ? data.error
        : `Erreur HTTP ${res.status}: ${raw}`;
    throw new Error(msg);
  }

  // 1) Cas recommandé : worker renvoie une URL Stripe Checkout
  if (typeof data?.url === "string" && data.url) {
    window.location.assign(data.url);
    return;
  }

  // 2) Fallback : worker renvoie sessionId (Stripe.js)
  if (typeof data?.sessionId === "string" && data.sessionId) {
    const stripe = await stripePromise;
    if (!stripe) throw new Error("Stripe n'est pas configuré (clé publique manquante).");
    const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
    if (error) throw error;
    return;
  }

  throw new Error("Le serveur de paiement n'a renvoyé ni url ni sessionId.");
}
