import { loadStripe } from "@stripe/stripe-js";

export interface CheckoutItem {
  name: string;
  price: number; // in cents
  quantity: number;
}

const STRIPE_KEY = (import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined)?.trim();
export const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : Promise.resolve(null);

const WORKER_URL_ENV = (import.meta.env.VITE_WORKER_URL as string | undefined)?.trim();
const WORKER_URL = WORKER_URL_ENV
  ?? "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev/create-checkout-session";

if (!WORKER_URL_ENV) {
  console.warn("VITE_WORKER_URL is not set; using default worker URL.");
}

export async function startCheckout(items: CheckoutItem[]) {
  try {
    console.log("Initiating Stripe Checkout...");

    const missingConfig: string[] = [];
    if (!STRIPE_KEY) missingConfig.push("Clé publique Stripe manquante (VITE_STRIPE_PUBLIC_KEY)");
    if (!WORKER_URL_ENV) missingConfig.push("URL du worker Stripe manquante (VITE_WORKER_URL)");

    if (missingConfig.length > 0) {
      const message = missingConfig.join(". ");
      console.warn(message);
      if (import.meta.env.DEV) {
        throw new Error(message);
      }
      throw new Error("Configuration du paiement indisponible. Veuillez réessayer plus tard.");
    }

    const origin = window.location.origin && window.location.origin !== "null" && window.location.origin !== "about:blank"
      ? window.location.origin
      : "https://snackfamily2.eu";

    const payloadItems = items.map((item) => ({
      name: item.name,
      price: Math.round(item.price),
      quantity: item.quantity
    }));

    const payload = {
      items: payloadItems,
      successUrl: `${origin}/success`,
      cancelUrl: `${origin}/cancel`
    };

    console.log("Sending payload to Worker:", payload);

    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error("Worker response error:", response.status);
      const errorBody = await response.text().catch(() => "");
      if (errorBody) {
        console.error("Worker response body:", errorBody);
      }
      throw new Error("Serveur de paiement indisponible. Veuillez réessayer dans quelques instants.");
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new Error("Réponse invalide du serveur de paiement.");
    }
    console.log("Session created:", data);

    if (data?.sessionId) {
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Stripe n'a pas pu être chargé (clé publique manquante ?).");
      }
      const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
      if (error) {
        throw error;
      }
      return;
    }

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    console.error("No URL or sessionId in response:", data);
    throw new Error("Le service de paiement n'a pas renvoyé de redirection Stripe.");
  } catch (e) {
    console.error("Checkout Exception:", e);
    throw e;
  }
}

export async function runDevTest() {
  const origin = window.location.origin && window.location.origin !== "null"
    ? window.location.origin
    : "http://localhost:3000";

  const payload = {
    items: [
      { name: "Test Snack (DEV)", price: 500, quantity: 1 }
    ],
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`
  };

  console.group("🧪 Stripe Worker Dev Test");
  console.log("Target URL:", WORKER_URL);
  console.log("Payload:", payload);

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    console.log("HTTP Status:", response.status);

    const text = await response.text();
    console.log("Raw Response Body:", text);

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${text}`);
    }

    let data;
    try {
      data = JSON.parse(text);
      console.log("Parsed JSON:", data);
    } catch (e) {
      throw new Error("Invalid JSON response from Worker");
    }

    if (data?.url) {
      if (confirm(`Test réussi ! URL reçue : ${data.url}\n\nVoulez-vous être redirigé vers Stripe ?`)) {
        window.location.href = data.url;
      }
    } else if (data?.sessionId) {
      const stripe = await stripePromise;
      if (!stripe) throw new Error("Stripe failed to load");
      await stripe.redirectToCheckout({ sessionId: data.sessionId });
    } else {
      alert("Réponse reçue mais pas d'URL: " + JSON.stringify(data));
    }

  } catch (error) {
    console.error("Test Error:", error);
    alert(`Échec du test: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.groupEnd();
}
