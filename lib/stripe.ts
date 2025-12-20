import { loadStripe } from "@stripe/stripe-js";

export interface CheckoutItem {
  name: string;
  price: number; // cents (integer)
  quantity: number;
}

const STRIPE_KEY = (import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined)?.trim();

function normalizeEndpoint(base: string) {
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.endsWith("/create-checkout-session")) return trimmed;
  return `${trimmed}/create-checkout-session`;
}

function resolveWorkerUrl() {
  const rawCandidates = [
    (import.meta.env.VITE_CHECKOUT_API_URL as string | undefined)?.trim(),
    (import.meta.env.VITE_WORKER_URL as string | undefined)?.trim(),
    // Compatibilité legacy : ancien nom d'env utilisé en prod
    (import.meta.env.VITE_WORKER_BASE_URL as string | undefined)?.trim(),
  ].filter(Boolean) as string[];

  if (rawCandidates.length === 0) {
    if (import.meta.env.DEV) {
      return normalizeEndpoint("https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev");
    }
    throw new Error(
      "MISSING_WORKER_URL: Aucun endpoint Stripe n'est configuré (VITE_CHECKOUT_API_URL / VITE_WORKER_URL / VITE_WORKER_BASE_URL)."
    );
  }

  return normalizeEndpoint(rawCandidates[0]);
}

// ⚠️ En prod, l'URL doit être fournie via l'env. En dev on tolère un fallback public.
const WORKER_URL = (() => {
  try {
    return resolveWorkerUrl();
  } catch (error) {
    console.error(error);
    return "";
  }
})();

export const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : Promise.resolve(null);

function safeOrigin() {
  const envOrigin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim();
  if (envOrigin) return envOrigin.replace(/^http:\/\//, "https://");

  const { origin, hostname } = window.location;

  if (origin.startsWith("http://snackfamily2.eu")) return "https://snackfamily2.eu";
  if (origin.startsWith("http://www.snackfamily2.eu")) return "https://www.snackfamily2.eu";

  // Forcer le https sur le domaine officiel pour éviter les mixed-content en prod
  if (hostname === "snackfamily2.eu" || hostname === "www.snackfamily2.eu") {
    return `https://${hostname}`;
  }

  if (origin && origin !== "null" && origin !== "about:blank") return origin;

  // Fallback sûr (évite about:blank)
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
    throw new Error("MISSING_STRIPE_KEY: Clé Stripe manquante sur cette version (Preview/Prod).");
  }

  if (!Array.isArray(items) || items.length === 0) {
    console.error("No items");
    console.groupEnd();
    throw new Error("CART_EMPTY: Panier vide.");
  }

  if (!WORKER_URL) {
    console.groupEnd();
    throw new Error(
      "MISSING_WORKER_URL: Aucun endpoint Stripe n'est configuré (VITE_CHECKOUT_API_URL / VITE_WORKER_URL / VITE_WORKER_BASE_URL)."
    );
  }

  const validatedItems = items.map((it, idx) => {
    const name = String(it.name ?? "").trim();
    const price = Math.round(Number(it.price));
    const quantity = Math.round(Number(it.quantity));

    if (!name) {
      throw new Error(`ITEM_${idx}_NAME: Article sans nom`);
    }
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`ITEM_${idx}_PRICE: Prix invalide (doit être un entier en centimes > 0)`);
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error(`ITEM_${idx}_QTY: Quantité invalide (>= 1)`);
    }

    return { name, price, quantity };
  });

  const payload = {
    items: validatedItems,
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`,
  };

  console.log("Payload:", payload);

  let res: Response;
  try {
    res = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.groupEnd();
    throw new Error(`WORKER_FETCH: Impossible d’appeler le backend (${(err as Error)?.message || err}).`);
  }

  const raw = await res.text().catch(() => "");
  const contentType = res.headers.get("content-type") || "";
  console.log("HTTP:", res.status);
  console.log("Content-Type:", contentType);
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
    const code = res.status === 404 ? "WORKER_404" : `WORKER_${res.status}`;
    throw new Error(`${code}: ${errorDetail || "Réponse vide"}`);
  }

  const looksLikeHtml =
    contentType.includes("text/html") ||
    raw.trimStart().toLowerCase().startsWith("<!doctype html") ||
    raw.trimStart().toLowerCase().startsWith("<html");

  if (looksLikeHtml) {
    console.groupEnd();
    throw new Error(
      "WORKER_HTML: Le backend de paiement renvoie une page HTML (Cloudflare Access / mauvaise URL ?). L’endpoint doit être public et retourner du JSON."
    );
  }

  const isLikelyJson = contentType.includes("application/json") || contentType.includes("application/ld+json");

  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    console.groupEnd();
    const code = isLikelyJson ? "WORKER_NON_JSON" : "WORKER_HTML";
    const message =
      code === "WORKER_HTML"
        ? "WORKER_HTML: Le backend de paiement renvoie une page HTML (Cloudflare Access / mauvaise URL ?). L’endpoint doit être public et retourner du JSON."
        : "WORKER_NON_JSON: Réponse Worker non-JSON (probablement HTML 404/CORS/Access)";
    throw new Error(message);
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
      throw new Error("STRIPE_LOAD: Stripe n’a pas pu être chargé.");
    }
    const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
    console.groupEnd();
    if (error) throw error;
    return;
  }

  console.groupEnd();
  throw new Error("WORKER_EMPTY: aucune url/sessionId retournée.");
}

export async function runDevTest() {
  console.info("[runDevTest] Launching test checkout with 5€ item");
  return startCheckout([{ name: "Test Snack", price: 500, quantity: 1 }]);
}
