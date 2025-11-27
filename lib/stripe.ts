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
const STRIPE_REDIRECT_HOST_SUFFIXES = ['stripe.com'];

function sanitizeText(value: string, max = 200) {
  // Remove control characters and angle brackets to reduce injection vectors
  const withoutControls = value.replace(/[\r\n\t]+/g, ' ').replace(/[<>]/g, ' ');
  // Collapse repeated whitespace and trim
  const collapsed = withoutControls.replace(/\s{2,}/g, ' ').trim();
  // Limit length to protect metadata and logs
  return collapsed.slice(0, max);
}

function resolveSafeOrigin() {
  const fallback = 'https://snackfamily2.com';
  try {
    const rawOrigin = window.location.origin;
    if (!rawOrigin || rawOrigin === 'null' || rawOrigin === 'about:blank') {
      return fallback;
    }

    const parsed = new URL(rawOrigin);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol === 'https:' || (isLocalhost && parsed.protocol === 'http:')) {
      return parsed.origin;
    }
  } catch (e) {
    console.warn('Origin validation failed, using fallback', e);
  }
  return fallback;
}

function resolveWorkerUrl(): string {
  const envUrl = import.meta.env?.VITE_STRIPE_WORKER_URL?.trim();
  return envUrl || DEFAULT_WORKER_URL;
}

function ensureValidWorkerUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.username || parsed.password) {
      throw new Error('Les identifiants dans l\'URL du worker sont interdits.');
    }
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
    const rawPrice = Number.isFinite(item.price) ? item.price : Number(item.price ?? 0);
    const price = Math.max(0, Math.trunc(rawPrice || 0));

    const normalizedName = sanitizeText(item.name ?? '');
    if (!normalizedName) {
      throw new Error("Chaque article doit avoir un nom");
    }
    if (price <= 0) {
      throw new Error("Les prix doivent être supérieurs à zéro (en centimes)");
    }

    return {
      ...item,
      name: normalizedName,
      price,
      quantity,
    };
  });
}

function sanitizeCustomer(customer?: CheckoutCustomerInfo): CheckoutCustomerInfo | undefined {
  if (!customer) return undefined;

  const sanitizeField = (value?: string, max = 200) => {
    if (!value) return undefined;
    const cleaned = sanitizeText(value, max);
    if (!cleaned) return undefined;
    return cleaned;
  };

  const sanitized: CheckoutCustomerInfo = {};
  const fullName = sanitizeField(customer.fullName, 120);
  if (fullName) sanitized.fullName = fullName;

  const address = sanitizeField(customer.address, 200);
  if (address) sanitized.address = address;

  const postalCode = sanitizeField(customer.postalCode, 20);
  if (postalCode) sanitized.postalCode = postalCode;

  const city = sanitizeField(customer.city, 120);
  if (city) sanitized.city = city;

  const phone = sanitizeField(customer.phone, 40);
  if (phone) sanitized.phone = phone;

  const instructions = sanitizeField(customer.instructions, 300);
  if (instructions) sanitized.instructions = instructions;

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function validateRedirectUrl(redirectUrl: string): string {
  const trimmed = redirectUrl.trim();
  if (!trimmed) {
    throw new Error("Le service de paiement n'a pas renvoyé d'URL de redirection.");
  }

  try {
    const parsed = new URL(trimmed);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';

    if (parsed.protocol !== 'https:' && !(isLocalhost && parsed.protocol === 'http:')) {
      throw new Error('URL de redirection non sécurisée.');
    }

    const isStripeHost = STRIPE_REDIRECT_HOST_SUFFIXES.some((suffix) =>
      parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`)
    );

    if (!isStripeHost && !isLocalhost) {
      throw new Error("URL de redirection inattendue renvoyée par le service de paiement.");
    }

    return parsed.toString();
  } catch (urlError) {
    console.error('Invalid redirect URL returned by worker', urlError);
    throw new Error("URL de redirection invalide renvoyée par le service de paiement.");
  }
}

export async function startCheckout(items: CheckoutItem[], options?: CheckoutOptions): Promise<string> {
  // Determine a safe origin for success/cancel redirects
  // Use fallback if window.location.origin is null/about:blank (sandboxes)
  const origin = resolveSafeOrigin();

  const WORKER_URL = ensureValidWorkerUrl(resolveWorkerUrl());

  const normalizedItems = normalizeItems(items);
  const customer = sanitizeCustomer(options?.customer);

  const payload = {
    items: normalizedItems,
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`,
    ...(customer ? { metadata: customer } : {})
  };

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

    let data: any;
    try {
      data = await response.json();
    } catch (parseErr) {
      throw new Error("Réponse du service de paiement invalide (JSON)");
    }
    const redirectUrl = typeof data?.url === 'string' ? data.url : '';
    const safeRedirect = validateRedirectUrl(redirectUrl);

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
  const WORKER_URL = ensureValidWorkerUrl(resolveWorkerUrl() || DEFAULT_WORKER_URL);

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
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
        let safeUrl: string;
        try {
          safeUrl = validateRedirectUrl(String(data.url));
        } catch (redirectError) {
          throw redirectError instanceof Error ? redirectError : new Error(String(redirectError));
        }

        if (confirm(`Test réussi ! URL reçue : ${safeUrl}\n\nVoulez-vous être redirigé vers Stripe ?`)) {
             window.location.href = safeUrl;
        }
    } else {
        alert("Réponse reçue mais pas d'URL: " + JSON.stringify(data));
    }

  } catch (error) {
    console.error("Test Error:", error);
    if (error instanceof DOMException && error.name === 'AbortError') {
      alert("Test Stripe interrompu: délai dépassé.");
    } else {
      alert(`Échec du test: ${error instanceof Error ? error.message : String(error)}`);
    }
  } finally {
    clearTimeout(timeout);
    console.groupEnd();
  }
}
