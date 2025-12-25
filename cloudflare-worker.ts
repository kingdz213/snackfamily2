// cloudflare-worker.ts
// Cloudflare Worker (NO SDK, NO import) -> Stripe Checkout via fetch
// Règles: minimum 20€ (hors livraison) + livraison 2.50€ + livraison max 10km + adresse + position obligatoires
// Paiement CASH = géré côté front (pas besoin du Worker). Le Worker sert uniquement pour Stripe.

interface Env {
  STRIPE_SECRET_KEY: string;
  DEFAULT_ORIGIN?: string;
  ORDERS_KV?: KVNamespace;
}

const FALLBACK_ORIGIN = "https://snackfamily2.eu";

// Business rules
const MIN_ORDER_CENTS = 2000; // 20.00€ hors livraison
const DELIVERY_FEE_CENTS = 250; // 2.50€
const MAX_DELIVERY_KM = 10;

// Snack address: "Pl. de Wasmes 7 7340 Colfontaine"
// Coord approximatives (ok pour rayon 10km). Tu peux affiner plus tard.
const SHOP_LAT = 50.425226;
const SHOP_LNG = 3.846433;

const EXACT_ALLOWED_ORIGINS = new Set([
  "https://snackfamily2.eu",
  "https://www.snackfamily2.eu",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
]);

const VERCEL_PREVIEW_REGEX = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

function normalizeOrigin(raw: string | null) {
  if (!raw || typeof raw !== "string") return "";
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

function isAllowedOrigin(origin: string) {
  if (!origin) return false;
  if (EXACT_ALLOWED_ORIGINS.has(origin)) return true;
  if (VERCEL_PREVIEW_REGEX.test(origin)) return true;
  return false;
}

function corsHeadersFor(origin: string) {
  const allowed = isAllowedOrigin(origin) ? origin : FALLBACK_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  } as Record<string, string>;
}

function json(data: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function text(data: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(data, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...headers,
    },
  });
}

function hasOrdersKv(env: Env) {
  return Boolean(env.ORDERS_KV && typeof env.ORDERS_KV.get === "function");
}

function hasStripeSecret(env: Env) {
  return Boolean(env.STRIPE_SECRET_KEY && String(env.STRIPE_SECRET_KEY).trim());
}

// Accepte EUROS (14.50) OU CENTIMES (1450)
function toCentsSmart(price: unknown): number | null {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return null;

  if (Number.isInteger(n) && n >= 100) return n; // déjà centimes
  return Math.round(n * 100); // euros -> centimes
}

type NormalizedItem = { name: string; quantity: number; cents: number };

function validateItems(items: any): { items: NormalizedItem[] } | { error: string; message: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "ITEMS_INVALID", message: "items must be a non-empty array" };
  }

  const normalized: NormalizedItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const name = String(it?.name ?? "").trim();
    const quantity = Number(it?.quantity ?? 1);
    const cents = toCentsSmart(it?.price);

    if (!name) return { error: "ITEM_NAME_MISSING", message: `items[${i}].name missing` };
    if (!Number.isInteger(quantity) || quantity <= 0)
      return { error: "ITEM_QTY_INVALID", message: `items[${i}].quantity must be integer > 0` };
    if (!Number.isInteger(cents) || cents <= 0)
      return { error: "ITEM_PRICE_INVALID", message: `items[${i}].price must be > 0 (euros or cents)` };

    normalized.push({ name, quantity, cents });
  }

  return { items: normalized };
}

function subtotalCents(items: NormalizedItem[]) {
  return items.reduce((sum, it) => sum + it.cents * it.quantity, 0);
}

// Haversine (km)
function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function createCheckoutSession(params: {
  items: NormalizedItem[];
  origin: string;
  stripeSecretKey: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  distance: number;
}) {
  const { items, origin, stripeSecretKey, deliveryAddress, deliveryLat, deliveryLng, distance } = params;

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${origin}/success?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/cancel`);

  // Adresse demandée dans Stripe Checkout (en plus de ce que tu collectes côté site)
  form.append("shipping_address_collection[allowed_countries][]", "BE");
  form.append("shipping_address_collection[allowed_countries][]", "FR");
  form.set("phone_number_collection[enabled]", "true");

  // Metadata (utile pour retrouver l'adresse/zone côté Stripe)
  form.set("metadata[min_order_cents]", String(MIN_ORDER_CENTS));
  form.set("metadata[delivery_fee_cents]", String(DELIVERY_FEE_CENTS));
  form.set("metadata[delivery_address]", deliveryAddress);
  form.set("metadata[delivery_lat]", String(deliveryLat));
  form.set("metadata[delivery_lng]", String(deliveryLng));
  form.set("metadata[delivery_distance_km]", distance.toFixed(3));

  // Items
  let idx = 0;
  for (const item of items) {
    form.set(`line_items[${idx}][quantity]`, String(item.quantity));
    form.set(`line_items[${idx}][price_data][currency]`, "eur");
    form.set(`line_items[${idx}][price_data][unit_amount]`, String(item.cents));
    form.set(`line_items[${idx}][price_data][product_data][name]`, item.name);
    idx++;
  }

  // Livraison (2.50€) toujours ajoutée
  form.set(`line_items[${idx}][quantity]`, "1");
  form.set(`line_items[${idx}][price_data][currency]`, "eur");
  form.set(`line_items[${idx}][price_data][unit_amount]`, String(DELIVERY_FEE_CENTS));
  form.set(`line_items[${idx}][price_data][product_data][name]`, "Livraison");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const bodyText = await res.text();
  let bodyJson: any = null;
  try {
    bodyJson = JSON.parse(bodyText);
  } catch {}

  if (!res.ok) {
    return { ok: false, status: res.status, stripe: bodyJson ?? bodyText };
  }
  return { ok: true, session: bodyJson };
}

export default {
  async fetch(request: Request, env: Env) {
    const requestOrigin = normalizeOrigin(request.headers.get("Origin"));
    const cors = corsHeadersFor(requestOrigin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(
        {
          ok: true,
          hasOrdersKV: hasOrdersKv(env),
          hasStripeSecret: hasStripeSecret(env),
          origin: env.DEFAULT_ORIGIN || FALLBACK_ORIGIN,
        },
        200,
        cors
      );
    }

    if (url.pathname !== "/create-checkout-session") {
      return json({ error: "NOT_FOUND" }, 404, cors);
    }

    if (request.method !== "POST") {
      return json({ error: "METHOD_NOT_ALLOWED" }, 405, cors);
    }

    try {
      if (!hasStripeSecret(env)) {
        return json({ error: "SERVER_MISCONFIGURED", details: "Missing STRIPE_SECRET_KEY" }, 500, cors);
      }
      if (!hasOrdersKv(env)) {
        return json({ error: "SERVER_MISCONFIGURED", details: "ORDERS_KV not bound" }, 500, cors);
      }

      const body: any = await request.json().catch(() => null);
      if (!body) return json({ error: "INVALID_JSON" }, 400, cors);

      const validation = validateItems(body.items);
      if ("error" in validation) return json(validation, 400, cors);

      // Minimum 20€ hors livraison
      const sub = subtotalCents(validation.items);
      if (sub < MIN_ORDER_CENTS) {
        return json(
          { error: "MIN_ORDER_NOT_MET", message: "Il faut commander un minimum de 20€ (hors livraison)." },
          400,
          cors
        );
      }

      // Livraison obligatoire: adresse + coords
      const deliveryAddress = String(body.deliveryAddress ?? "").trim();
      const deliveryLat = Number(body.deliveryLat);
      const deliveryLng = Number(body.deliveryLng);

      if (!deliveryAddress) {
        return json({ error: "DELIVERY_ADDRESS_REQUIRED", message: "Adresse de livraison obligatoire." }, 400, cors);
      }
      if (!Number.isFinite(deliveryLat) || !Number.isFinite(deliveryLng)) {
        return json({ error: "DELIVERY_POSITION_REQUIRED", message: "Position obligatoire (géolocalisation)." }, 400, cors);
      }

      // Zone 10km
      const km = distanceKm(SHOP_LAT, SHOP_LNG, deliveryLat, deliveryLng);
      if (km > MAX_DELIVERY_KM) {
        return json(
          { error: "DELIVERY_OUT_OF_RANGE", message: `Livraison uniquement dans un rayon de ${MAX_DELIVERY_KM} km.` },
          400,
          cors
        );
      }

      const checkoutOrigin = isAllowedOrigin(requestOrigin)
        ? requestOrigin
        : (env.DEFAULT_ORIGIN || FALLBACK_ORIGIN);

      const result = await createCheckoutSession({
        items: validation.items,
        origin: checkoutOrigin,
        stripeSecretKey: String(env.STRIPE_SECRET_KEY),
        deliveryAddress,
        deliveryLat,
        deliveryLng,
        distance: km,
      });

      if (!result.ok) {
        return json({ error: "STRIPE_API_ERROR", status: result.status, details: result.stripe }, 502, cors);
      }

      if (!result.session?.url) {
        return json({ error: "STRIPE_NO_URL", details: result.session }, 502, cors);
      }

      return json({ url: result.session.url, sessionId: result.session.id }, 200, cors);
    } catch (e: any) {
      return json({ error: "WORKER_ERROR", details: e?.message ?? String(e) }, 500, cors);
    }
  },
};
