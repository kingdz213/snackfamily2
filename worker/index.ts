import Stripe from "stripe";
import { MENU_CATEGORIES } from "../data/menuData";
import { SUPPLEMENTS } from "../types";

type Env = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_SECRET2?: string;
  "STRIPE-SECRET2"?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_WEBHOOK_SECRET2?: string;
  "STRIPE-WEBHOOK-SECRET2"?: string;
  ALLOWED_ORIGIN?: string;
  PUBLIC_BASE_URL?: string;
  [key: string]: string | undefined;
};

type PriceEntry = {
  name: string;
  unit_amount: number;
  currency: string;
};

type IncomingItem = {
  id: string;
  qty?: number;
  extras?: string[];
};

const DEFAULT_BASE_URL = "https://snackfamily2.eu";
const DEFAULT_ALLOWED_ORIGIN = DEFAULT_BASE_URL;
const DEFAULT_CURRENCY = "eur";

const slugifyId = (value: string): string => {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

const buildProductId = (
  name: string,
  categoryId?: string,
  variant?: "menu" | "solo"
): string => {
  const categoryPart = categoryId ? `${slugifyId(categoryId)}__` : "";
  const variantPart = variant ? `__${variant}` : "";
  return `${categoryPart}${slugifyId(name)}${variantPart}`;
};

const priceFromNumber = (value: number | string | undefined): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error("Invalid price value in catalog");
  }
  return Math.round(numeric * 100);
};

const PRICE_MAP: Record<string, PriceEntry> = (() => {
  const map: Record<string, PriceEntry> = {};

  MENU_CATEGORIES.forEach((category) => {
    category.items.forEach((item) => {
      const baseId = buildProductId(item.name, category.id);

      if (item.priceSecondary !== undefined) {
        map[`${baseId}__menu`] = {
          name: `${item.name} (Menu/Frites)`,
          unit_amount: priceFromNumber(item.price),
          currency: DEFAULT_CURRENCY,
        };
        map[`${baseId}__solo`] = {
          name: `${item.name} (Solo)`,
          unit_amount: priceFromNumber(item.priceSecondary),
          currency: DEFAULT_CURRENCY,
        };
      } else {
        map[baseId] = {
          name: item.name,
          unit_amount: priceFromNumber(item.price),
          currency: DEFAULT_CURRENCY,
        };
      }
    });
  });

  SUPPLEMENTS.forEach((supp) => {
    const suppId = `supp_${slugifyId(supp.name)}`;
    map[suppId] = {
      name: `Supplément ${supp.name}`,
      unit_amount: priceFromNumber(supp.price),
      currency: DEFAULT_CURRENCY,
    };
  });

  return map;
})();

const pickSecret = (env: Env, keys: string[]): string | null => {
  for (const key of keys) {
    const val = env[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return null;
};

const getStripeSecret = (env: Env): string | null => {
  return pickSecret(env, ["STRIPE_SECRET_KEY", "STRIPE_SECRET2", "STRIPE-SECRET2"]);
};

const getWebhookSecret = (env: Env): string | null => {
  return pickSecret(env, [
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_WEBHOOK_SECRET2",
    "STRIPE-WEBHOOK-SECRET2",
  ]);
};

const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      ...(headers || {}),
    },
  });

const corsHeaders = (origin: string) => ({
  "access-control-allow-origin": origin,
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
});

const withCors = (response: Response, origin: string) => {
  response.headers.set("access-control-allow-origin", origin);
  response.headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  response.headers.set("access-control-allow-headers", "content-type");
  return response;
};

const normalizeBaseUrl = (raw: string | null | undefined) => {
  if (!raw) return DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, "");
};

const buildLineItems = (items: IncomingItem[]): Stripe.Checkout.SessionCreateParams.LineItem[] => {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  items.forEach((incoming) => {
    const product = PRICE_MAP[incoming.id];
    if (!product) {
      throw new Error(`Unknown item id: ${incoming.id}`);
    }

    const quantity = Math.max(1, Math.floor(Number(incoming.qty || 1)));

    lineItems.push({
      price_data: {
        currency: product.currency,
        product_data: { name: product.name },
        unit_amount: product.unit_amount,
      },
      quantity,
    });

    const extras = Array.isArray(incoming.extras) ? incoming.extras : [];
    extras.forEach((extraId) => {
      const extra = PRICE_MAP[extraId];
      if (!extra) {
        throw new Error(`Unknown extra id: ${extraId}`);
      }
      lineItems.push({
        price_data: {
          currency: extra.currency,
          product_data: { name: extra.name },
          unit_amount: extra.unit_amount,
        },
        quantity,
      });
    });
  });

  return lineItems;
};

const handleCreateCheckout = async (request: Request, env: Env) => {
  const secret = getStripeSecret(env);
  if (!secret) {
    return json(
      { error: "Missing Stripe secret (set STRIPE_SECRET2 or STRIPE_SECRET_KEY)" },
      500
    );
  }

  const stripe = new Stripe(secret, {
    apiVersion: "2024-06-20" as any,
  });

  let payload: { items?: IncomingItem[]; customer?: { name?: string; phone?: string } };
  try {
    payload = await request.json();
  } catch (error) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    return json({ error: "No items provided" }, 400);
  }

  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  try {
    lineItems = buildLineItems(items);
  } catch (error) {
    return json({ error: (error as Error).message }, 400);
  }

  const baseUrl = normalizeBaseUrl(env.PUBLIC_BASE_URL || DEFAULT_BASE_URL);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    success_url: `${baseUrl}/success`,
    cancel_url: `${baseUrl}/cancel`,
    metadata: {
      customerName: payload.customer?.name || "",
      customerPhone: payload.customer?.phone || "",
    },
  });

  return json({ url: session.url });
};

const handleWebhook = async (request: Request, env: Env) => {
  const secret = getStripeSecret(env);
  if (!secret) {
    return json(
      { error: "Missing Stripe secret (set STRIPE_SECRET2 or STRIPE_SECRET_KEY)" },
      500
    );
  }

  const webhookSecret = getWebhookSecret(env);
  if (!webhookSecret) {
    return json(
      { error: "Missing Stripe webhook secret (set STRIPE_WEBHOOK_SECRET)" },
      500
    );
  }

  const stripe = new Stripe(secret, {
    apiVersion: "2024-06-20" as any,
  });

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return json({ error: "Missing stripe-signature header" }, 400);
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    return json({ error: `Webhook signature verification failed: ${(error as Error).message}` }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log("✅ Payment success for session", session.id);
    console.log("TODO: persist order to Firestore and notify snack", {
      customer: session.customer_details,
      amount_total: session.amount_total,
      metadata: session.metadata,
    });
  } else {
    console.log("Unhandled event type", event.type);
  }

  return json({ received: true });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/create-checkout-session" && request.method === "POST") {
      const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
      try {
        const response = await handleCreateCheckout(request, env);
        return withCors(response, allowedOrigin);
      } catch (error) {
        console.error("Create checkout error", error);
        return withCors(json({ error: "Checkout failed" }, 500), allowedOrigin);
      }
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true });
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      try {
        return await handleWebhook(request, env);
      } catch (error) {
        console.error("Webhook handler error", error);
        return json({ error: "Webhook processing failed" }, 500);
      }
    }

    if (url.pathname === "/" && request.method === "POST" && request.headers.get("stripe-signature")) {
      try {
        return await handleWebhook(request, env);
      } catch (error) {
        console.error("Webhook handler error", error);
        return json({ error: "Webhook processing failed" }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event: any, env: Env, ctx: any) {
    console.log("Cron trigger at", event.scheduledTime);
  },
};
