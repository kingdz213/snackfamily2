import Stripe from "stripe";

interface Env {
  STRIPE_SECRET_KEY: string;
  ALLOWED_ORIGIN?: string;
  DEFAULT_ORIGIN?: string;
}

const SAFE_FALLBACK_ORIGIN = "https://snackfamily2.eu";

function normalizeOrigin(origin?: string | null) {
  const value = typeof origin === "string" ? origin.trim() : "";
  if (!value) return "";
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    const protocol = url.protocol === "http:" ? "https:" : url.protocol;
    return `${protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function buildCorsHeaders(allowedOrigin: string) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  } as const;
}

function jsonResponse(status: number, data: Record<string, unknown>, allowedOrigin: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(allowedOrigin),
    },
  });
}

function validateItems(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "INVALID_ITEMS", message: "items doit être un tableau non vide" } as const;
  }

  const items = raw.map((item, idx) => {
    const name = typeof (item as any)?.name === "string" ? (item as any).name.trim() : "";
    const price = Number((item as any)?.price);
    const quantity = Number((item as any)?.quantity);

    if (!name) {
      throw { code: "ITEM_NAME", message: `items[${idx}].name est requis` };
    }

    if (!Number.isInteger(price) || price <= 0) {
      throw { code: "ITEM_PRICE", message: `items[${idx}].price doit être un entier > 0 (centimes)` };
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw { code: "ITEM_QUANTITY", message: `items[${idx}].quantity doit être un entier >= 1` };
    }

    return { name, price, quantity };
  });

  return { items } as const;
}

async function handlePost(request: Request, env: Env, allowedOrigin: string) {
  if (!env.STRIPE_SECRET_KEY) {
    return jsonResponse(500, { error: "SERVER_MISCONFIGURED", details: "STRIPE_SECRET_KEY manquant" }, allowedOrigin);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "INVALID_JSON" }, allowedOrigin);
  }

  const originFromBody = normalizeOrigin(body?.origin);
  const defaultOrigin = normalizeOrigin(env.DEFAULT_ORIGIN) || SAFE_FALLBACK_ORIGIN;
  const checkoutOrigin = originFromBody || defaultOrigin;

  let items: { name: string; price: number; quantity: number }[];
  try {
    const result = validateItems(body?.items);
    if ("error" in result) {
      return jsonResponse(400, { error: result.error, details: result.message }, allowedOrigin);
    }
    items = result.items;
  } catch (err: any) {
    return jsonResponse(400, { error: err?.code || "ITEM_VALIDATION", details: err?.message }, allowedOrigin);
  }

  const stripeClient = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((item) => ({
    price_data: {
      currency: "eur",
      product_data: { name: item.name },
      unit_amount: item.price,
    },
    quantity: item.quantity,
  }));

  try {
    const session = await stripeClient.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${checkoutOrigin}/?page=success`,
      cancel_url: `${checkoutOrigin}/?page=cancel`,
    });

    return jsonResponse(200, { url: session.url, sessionId: session.id }, allowedOrigin);
  } catch (err: any) {
    const message = err?.message || "Impossible de créer la session";
    return jsonResponse(500, { error: "STRIPE_ERROR", details: message }, allowedOrigin);
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const headerOrigin = normalizeOrigin(request.headers.get("Origin"));
    const configuredAllowed = normalizeOrigin(env.ALLOWED_ORIGIN);
    const allowedOrigin = configuredAllowed || headerOrigin || SAFE_FALLBACK_ORIGIN;

    if (request.method === "OPTIONS") {
      return jsonResponse(200, { ok: true }, allowedOrigin);
    }

    if (request.method !== "POST") {
      return jsonResponse(405, { error: "METHOD_NOT_ALLOWED" }, allowedOrigin);
    }

    return handlePost(request, env, allowedOrigin);
  },
};
