export type CheckoutItem = {
  id?: string;
  name?: string;
  quantity?: number;
};

type WorkerResponse =
  | { url: string }
  | { sessionId: string }
  | { error: string; details?: unknown }
  | Record<string, unknown>;

const DEFAULT_WORKER_BASE_URL =
  'https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev';

const normalizeBase = (base: string) => base.replace(/\/+$/, '');

const resolveWorkerBaseUrl = () => {
  const configured = import.meta.env.VITE_WORKER_BASE_URL as string | undefined;
  const trimmed = configured?.trim();
  return trimmed && trimmed.length > 0 ? normalizeBase(trimmed) : normalizeBase(DEFAULT_WORKER_BASE_URL);
};

const resolvePublicOrigin = () => {
  const envOrigin = (import.meta.env.VITE_ORIGIN_FALLBACK as string | undefined)?.trim();

  if (typeof window !== 'undefined' && window.location) {
    const o = window.location.origin;
    if (o && o !== 'null' && o !== 'about:blank') return o;
  }

  if (envOrigin && envOrigin.length > 0) return envOrigin;

  return 'https://snackfamily2.eu';
};

const sanitizeItems = (items: CheckoutItem[]) =>
  (items || [])
    .map((item) => ({
      id: (item.id || 'menu-item').trim(),
      quantity: Number.isFinite(item.quantity) ? Math.max(1, Math.trunc(item.quantity!)) : 1,
    }))
    .filter((item) => item.id.length > 0);

export async function startCheckout(items: CheckoutItem[], customer?: Record<string, unknown>) {
  if (!items || items.length === 0) {
    throw new Error('Panier vide: impossible de démarrer le paiement.');
  }

  const workerBaseUrl = resolveWorkerBaseUrl();
  const endpoint = `${workerBaseUrl}/create-checkout-session`;
  const origin = resolvePublicOrigin();

  const payload: Record<string, unknown> = {
    items: sanitizeItems(items),
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`,
  };

  if (customer) {
    payload.customer = customer;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let data: WorkerResponse;

  try {
    data = rawText ? (JSON.parse(rawText) as WorkerResponse) : ({} as WorkerResponse);
  } catch {
    throw new Error('Le serveur de paiement a renvoyé une réponse invalide.');
  }

  if (!response.ok) {
    const message = typeof (data as any)?.error === 'string' ? (data as any).error : `Erreur HTTP: ${response.status}`;
    throw new Error(message);
  }

  if (typeof (data as any)?.url === 'string' && (data as any).url) {
    window.location.assign((data as any).url);
    return;
  }

  if (typeof (data as any)?.sessionId === 'string' && (data as any).sessionId) {
    throw new Error('Checkout session requires Stripe.js redirect, but no URL was provided.');
  }

  throw new Error("Le service de paiement n'a renvoyé ni URL ni sessionId.");
}
