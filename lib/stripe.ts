export interface CheckoutItem {
  name: string;
  price: number; // in cents
  quantity: number;
}

export interface CheckoutCustomerInfo {
  fullName?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  instructions?: string;
}

interface CheckoutOptions {
  customer?: CheckoutCustomerInfo;
}

const DEFAULT_WORKER_URL = "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev/create-checkout-session";

function resolveWorkerUrl(): string {
  const envUrl = import.meta.env?.VITE_STRIPE_WORKER_URL?.trim();
  return envUrl || DEFAULT_WORKER_URL;
}

function ensureValidWorkerUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(isLocalhost && parsed.protocol === 'http:')) {
      throw new Error('Le worker Stripe doit utiliser HTTPS (ou HTTP localhost en dev).');
    }
    return parsed.toString();
  } catch (e) {
    throw new Error('URL du worker Stripe invalide. Vérifiez VITE_STRIPE_WORKER_URL.');
  }
}

function normalizeItems(items: CheckoutItem[]): CheckoutItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No checkout items provided");
  }

  return items.map((item) => {
    const quantity = Math.max(1, Math.trunc(item.quantity || 0));
    const price = Math.max(0, Math.trunc(item.price || 0));

    if (!item.name) {
      throw new Error("Chaque article doit avoir un nom");
    }
    if (price <= 0) {
      throw new Error("Les prix doivent être supérieurs à zéro (en centimes)");
    }

    return {
      ...item,
      price,
      quantity,
    };
  });
}

function sanitizeCustomer(customer?: CheckoutCustomerInfo): CheckoutCustomerInfo | undefined {
  if (!customer) return undefined;

  const sanitized: CheckoutCustomerInfo = {};
  if (customer.fullName?.trim()) sanitized.fullName = customer.fullName.trim();
  if (customer.address?.trim()) sanitized.address = customer.address.trim();
  if (customer.postalCode?.trim()) sanitized.postalCode = customer.postalCode.trim();
  if (customer.city?.trim()) sanitized.city = customer.city.trim();
  if (customer.phone?.trim()) sanitized.phone = customer.phone.trim();
  if (customer.instructions?.trim()) sanitized.instructions = customer.instructions.trim();

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export async function startCheckout(items: CheckoutItem[], options?: CheckoutOptions): Promise<string> {
  console.log("Initiating Stripe Checkout...");

  // Determine a safe origin for success/cancel redirects
  // Use fallback if window.location.origin is null/about:blank (sandboxes)
  const origin = window.location.origin && window.location.origin !== 'null' && window.location.origin !== 'about:blank'
    ? window.location.origin
    : 'https://snackfamily2.com';

  const WORKER_URL = ensureValidWorkerUrl(resolveWorkerUrl());

  const normalizedItems = normalizeItems(items);
  const customer = sanitizeCustomer(options?.customer);

  const payload = {
    items: normalizedItems,
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`,
    ...(customer ? { metadata: customer } : {})
  };

  console.log("Sending payload to Worker:", payload);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
        console.error("Worker response error:", response.status);
        let errorBody: string | undefined;
        try {
          errorBody = await response.text();
        } catch (readErr) {
          console.error("Unable to read error body", readErr);
        }

        throw new Error(`Erreur HTTP ${response.status}${errorBody ? ` - ${errorBody}` : ''}`);
    }

    const data = await response.json();
    console.log("Session created:", data);

    const redirectUrl = typeof data?.url === 'string' ? data.url.trim() : '';

    if (!redirectUrl) {
      console.error("No URL in response:", data);
      throw new Error("Le service de paiement n'a pas renvoyé d'URL de redirection.");
    }

    let safeRedirect: string;
    try {
      const parsed = new URL(redirectUrl);
      if (parsed.protocol !== 'https:' && !(parsed.hostname === 'localhost' && parsed.protocol === 'http:')) {
        throw new Error('URL de redirection non sécurisée.');
      }
      safeRedirect = parsed.toString();
    } catch (urlError) {
      console.error('Invalid redirect URL returned by worker', urlError);
      throw new Error("URL de redirection invalide renvoyée par le service de paiement.");
    }

    // Redirect to Stripe Checkout and expose URL for callers/tests
    window.location.href = safeRedirect;
    return safeRedirect;
  } catch (e) {
    console.error("Checkout Exception:", e);
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error("La demande de paiement a expiré. Veuillez réessayer.");
    }
    throw e instanceof Error ? e : new Error("Impossible de contacter le serveur de paiement.");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * DEV ONLY: Test function to verify Worker connectivity
 */
export async function runDevTest() {
  const WORKER_URL = resolveWorkerUrl() || DEFAULT_WORKER_URL;

  const origin = window.location.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost:5173';

  const payload = {
    items: [
      { name: "Test Snack (DEV)", price: 500, quantity: 1 } // 5.00 EUR (500 cents)
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
    } catch(e) {
      throw new Error("Invalid JSON response from Worker");
    }

    if (data.url) {
        if (confirm(`Test réussi ! URL reçue : ${data.url}\n\nVoulez-vous être redirigé vers Stripe ?`)) {
             window.location.href = data.url;
        }
    } else {
        alert("Réponse reçue mais pas d'URL: " + JSON.stringify(data));
    }

  } catch (error) {
    console.error("Test Error:", error);
    alert(`Échec du test: ${error instanceof Error ? error.message : String(error)}`);
  }
  console.groupEnd();
}