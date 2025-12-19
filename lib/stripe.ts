export type CheckoutItem = { id: string; quantity: number };

type WorkerResponse = { url?: string; sessionId?: string; error?: string; details?: unknown };

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

export async function startCheckout(items: CheckoutItem[], customer?: Record<string, unknown>) {
  const safeItems = sanitizeItems(items);
  if (safeItems.length === 0) {
    throw new Error("Panier vide : impossible de démarrer le paiement.");
  }

  const base = resolveWorkerBaseUrl();
  const endpoint = `${base}/create-checkout-session`;
  const origin = resolvePublicOrigin();

  const payload: Record<string, unknown> = {
    items: safeItems,
    successUrl: `${origin}/success`,
    cancelUrl: `${origin}/cancel`,
  };
  if (customer) payload.customer = customer;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();

  let data: WorkerResponse = {};
  try {
    data = raw ? (JSON.parse(raw) as WorkerResponse) : {};
  } catch {
    throw new Error("Réponse invalide du serveur de paiement.");
  }

  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : `Erreur HTTP ${res.status}`;
    throw new Error(msg);
  }

  if (typeof data?.url === "string" && data.url) {
    window.location.assign(data.url);
    return;
  }

  if (typeof data?.sessionId === "string" && data.sessionId) {
    throw new Error("Le serveur a renvoyé un identifiant de session non pris en charge côté client.");
  }

  throw new Error("Le serveur de paiement n'a pas renvoyé d'URL de redirection.");
}
