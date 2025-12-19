// lib/stripe.ts
export type CheckoutItem = { id: string; quantity: number };

type WorkerResponse = { url?: string; error?: string; details?: unknown };

const DEFAULT_WORKER_BASE_URL =
  "https://delicate-meadow-9436snackfamily2payments.squidih5.workers.dev";
const DEFAULT_PUBLIC_ORIGIN = "https://snackfamily2.eu";

const normalizeBase = (base: string) => base.replace(/\/+$/, "");
const envStr = (key: string) => (import.meta.env[key] as string | undefined)?.trim();

export const resolveWorkerBaseUrl = () => {
  const configured = envStr("VITE_WORKER_BASE_URL");
  return normalizeBase(configured && configured.length > 0 ? configured : DEFAULT_WORKER_BASE_URL);
};

export const resolvePublicOrigin = () => {
  const envOrigin = envStr("VITE_PUBLIC_ORIGIN") || envStr("VITE_ORIGIN_FALLBACK");

  if (typeof window !== "undefined" && window.location) {
    const o = window.location.origin;
    if (o && o !== "null" && o !== "about:blank") return o;
  }

  if (envOrigin && envOrigin.length > 0) return envOrigin;
  return DEFAULT_PUBLIC_ORIGIN;
};

const sanitizeItems = (items: CheckoutItem[]) =>
  (items ?? [])
    .map((it) => ({
      id: String(it?.id ?? "").trim(),
      quantity: Number.isFinite(it?.quantity) ? Math.max(1, Math.trunc(it.quantity)) : 1,
    }))
    .filter((it) => it.id.length > 0);

async function parseWorkerResponse(
  res: Response
): Promise<{ raw: string; json?: WorkerResponse }> {
  const raw = await res.text();
  try {
    return { raw, json: JSON.parse(raw) as WorkerResponse };
  } catch {
    return { raw };
  }
}

/**
 * Démarre le checkout :
 * - le front envoie UNIQUEMENT {id, quantity}
 * - le Worker calcule les prix et renvoie { url }
 */
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
  if (customer) payload.customer = customer;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const { raw, json } = await parseWorkerResponse(res);

  if (!res.ok) {
    const msg =
      (json && typeof json.error === "string" && json.error) ||
      `Erreur HTTP ${res.status}${raw ? ` : ${raw}` : ""}`;
    throw new Error(msg);
  }

  if (json && typeof json.url === "string" && json.url) {
    window.location.assign(json.url);
    return;
  }

  throw new Error("Le serveur de paiement n'a pas renvoyé d'URL de redirection.");
}

/**
 * Test DEV (optionnel) :
 * ⚠️ Remplace "TEST_ITEM_ID" par un ID existant dans ton menu côté Worker.
 */
export async function runDevTest() {
  const testItems: CheckoutItem[] = [{ id: "TEST_ITEM_ID", quantity: 1 }];
  return startCheckout(testItems);
}
