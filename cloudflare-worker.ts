// cloudflare-worker.ts
// Cloudflare Worker (NO SDK, NO import) -> Stripe Checkout via fetch
// Règles: minimum 20€ (hors livraison) + livraison 2.50€ + livraison max 10km + adresse + position obligatoires

interface Env {
  ORDERS_KV?: KVNamespace;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DEFAULT_ORIGIN?: string;
  ADMIN_PIN?: string;
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
  return Boolean(env.ORDERS_KV);
}

function hasStripeSecret(env: Env) {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function hasWebhookSecret(env: Env) {
  return Boolean(env.STRIPE_WEBHOOK_SECRET);
}

function getAdminPin(env: Env) {
  const pin = String(env.ADMIN_PIN ?? "").trim();
  return pin.length > 0 ? pin : null;
}

function isAdminPinValid(env: Env, pin: string | null | undefined) {
  const expected = getAdminPin(env);
  if (!expected) return false;
  if (!pin) return false;
  return pin === expected;
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

type OrderStatus = "PENDING_PAYMENT" | "PAID_ONLINE" | "CASH_ON_DELIVERY";
type PaymentMethod = "STRIPE" | "CASH";
type FulfillmentStatus = "RECEIVED" | "IN_PREPARATION" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

type OrderRecord = {
  id: string;
  createdAt: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  stripeCheckoutSessionId?: string;
  origin: string;
  fulfillmentStatus: FulfillmentStatus;
  fulfillmentUpdatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function generateOrderId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function parseStripeSignature(header: string) {
  const parts = header.split(",").map((part) => part.trim());
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = value;
    if (key === "v1" && value) signatures.push(value);
  }
  return { timestamp, signatures };
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const bytes = new Uint8Array(signature);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyStripeSignature(payload: string, header: string, secret: string) {
  if (!header) return false;
  const { timestamp, signatures } = parseStripeSignature(header);
  if (!timestamp || signatures.length === 0) return false;
  const signedPayload = `${timestamp}.${payload}`;
  const expected = await hmacSha256Hex(secret, signedPayload);
  return signatures.some((sig) => sig === expected);
}

async function saveOrder(env: Env, order: OrderRecord) {
  if (!env.ORDERS_KV) throw new Error("ORDERS_KV not bound");
  await env.ORDERS_KV.put(`order:${order.id}`, JSON.stringify(order));
}

type StoredOrderRecord = Omit<OrderRecord, "fulfillmentStatus" | "fulfillmentUpdatedAt"> &
  Partial<Pick<OrderRecord, "fulfillmentStatus" | "fulfillmentUpdatedAt">>;

function normalizeFulfillmentStatus(value: unknown): FulfillmentStatus {
  if (
    value === "RECEIVED" ||
    value === "IN_PREPARATION" ||
    value === "OUT_FOR_DELIVERY" ||
    value === "DELIVERED" ||
    value === "CANCELLED"
  ) {
    return value;
  }
  return "RECEIVED";
}

function normalizeOrderRecord(order: StoredOrderRecord): OrderRecord {
  const fulfillmentStatus = normalizeFulfillmentStatus(order.fulfillmentStatus);
  const fulfillmentUpdatedAt = order.fulfillmentUpdatedAt ?? order.createdAt ?? nowIso();
  return {
    ...order,
    fulfillmentStatus,
    fulfillmentUpdatedAt,
  };
}

async function readOrder(env: Env, orderId: string): Promise<OrderRecord | null> {
  if (!env.ORDERS_KV) throw new Error("ORDERS_KV not bound");
  const raw = await env.ORDERS_KV.get(`order:${orderId}`);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as StoredOrderRecord;
  return normalizeOrderRecord(parsed);
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
  orderId: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  distance: number;
}) {
  const { items, origin, stripeSecretKey, orderId, deliveryAddress, deliveryLat, deliveryLng, distance } = params;

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
  form.set("metadata[order_id]", orderId);

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
    const origin = env.DEFAULT_ORIGIN ?? FALLBACK_ORIGIN;

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
          hasWebhookSecret: hasWebhookSecret(env),
          origin,
        },
        200,
        cors
      );
    }

    try {
      if (!hasOrdersKv(env)) {
        return json({ error: "SERVER_MISCONFIGURED", details: "ORDERS_KV not bound" }, 500, cors);
      }

      if (request.method === "POST" && url.pathname === "/create-cash-order") {
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
          return json(
            { error: "DELIVERY_POSITION_REQUIRED", message: "Position obligatoire (géolocalisation)." },
            400,
            cors
          );
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

        const bodyOrigin = normalizeOrigin(body.origin ?? "");
        const checkoutOrigin = isAllowedOrigin(requestOrigin)
          ? requestOrigin
          : isAllowedOrigin(bodyOrigin)
          ? bodyOrigin
          : origin;

        const orderId = generateOrderId();
        const order: OrderRecord = {
          id: orderId,
          createdAt: nowIso(),
          items: validation.items.map((it) => ({ name: it.name, quantity: it.quantity, price: it.cents })),
          subtotal: sub,
          deliveryFee: DELIVERY_FEE_CENTS,
          total: sub + DELIVERY_FEE_CENTS,
          deliveryAddress,
          deliveryLat,
          deliveryLng,
          paymentMethod: "CASH",
          status: "CASH_ON_DELIVERY",
          origin: checkoutOrigin,
          fulfillmentStatus: "RECEIVED",
          fulfillmentUpdatedAt: nowIso(),
        };

        await saveOrder(env, order);
        return json({ orderId }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/create-checkout-session") {
        if (!hasStripeSecret(env)) {
          return json({ error: "SERVER_MISCONFIGURED", details: "Missing STRIPE_SECRET_KEY" }, 500, cors);
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
          return json(
            { error: "DELIVERY_POSITION_REQUIRED", message: "Position obligatoire (géolocalisation)." },
            400,
            cors
          );
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

        const bodyOrigin = normalizeOrigin(body.origin ?? "");
        const checkoutOrigin = isAllowedOrigin(requestOrigin)
          ? requestOrigin
          : isAllowedOrigin(bodyOrigin)
          ? bodyOrigin
          : origin;
        const orderId = generateOrderId();
        const order: OrderRecord = {
          id: orderId,
          createdAt: nowIso(),
          items: validation.items.map((it) => ({ name: it.name, quantity: it.quantity, price: it.cents })),
          subtotal: sub,
          deliveryFee: DELIVERY_FEE_CENTS,
          total: sub + DELIVERY_FEE_CENTS,
          deliveryAddress,
          deliveryLat,
          deliveryLng,
          paymentMethod: "STRIPE",
          status: "PENDING_PAYMENT",
          origin: checkoutOrigin,
          fulfillmentStatus: "RECEIVED",
          fulfillmentUpdatedAt: nowIso(),
        };

        await saveOrder(env, order);

        const result = await createCheckoutSession({
          items: validation.items,
          origin: checkoutOrigin,
          stripeSecretKey: String(env.STRIPE_SECRET_KEY),
          orderId,
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

        order.stripeCheckoutSessionId = result.session.id;
        await saveOrder(env, order);
        await env.ORDERS_KV!.put(`order:session:${result.session.id}`, orderId);

        return json({ url: result.session.url, sessionId: result.session.id, orderId }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/stripe-webhook") {
        if (!hasWebhookSecret(env)) {
          return json({ error: "SERVER_MISCONFIGURED", details: "Missing STRIPE_WEBHOOK_SECRET" }, 500, cors);
        }

        const signature = request.headers.get("Stripe-Signature") || "";
        const rawBody = await request.text();
        const isValid = await verifyStripeSignature(rawBody, signature, String(env.STRIPE_WEBHOOK_SECRET));
        if (!isValid) {
          return json({ error: "INVALID_SIGNATURE" }, 400, cors);
        }

        let event: any = null;
        try {
          event = JSON.parse(rawBody);
        } catch {
          return json({ error: "INVALID_PAYLOAD" }, 400, cors);
        }

        if (event?.type === "checkout.session.completed") {
          const orderId = event?.data?.object?.metadata?.order_id;
          if (orderId) {
            const existing = await readOrder(env, orderId);
            if (existing) {
              existing.status = "PAID_ONLINE";
              existing.stripeCheckoutSessionId = existing.stripeCheckoutSessionId ?? event?.data?.object?.id;
              await saveOrder(env, existing);
            }
          }
        }

        return json({ ok: true }, 200, cors);
      }

      if (request.method === "GET" && url.pathname.startsWith("/orders/")) {
        const orderId = url.pathname.replace("/orders/", "").trim();
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);

        return json(
          {
            ...order,
            fulfillmentStatus: order.fulfillmentStatus,
            fulfillmentUpdatedAt: order.fulfillmentUpdatedAt,
          },
          200,
          cors
        );
      }

      if (request.method === "GET" && url.pathname.startsWith("/order/")) {
        const orderId = url.pathname.replace("/order/", "").trim();
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);

        return json(
          {
            id: order.id,
            items: order.items,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            total: order.total,
            deliveryAddress: order.deliveryAddress,
            paymentMethod: order.paymentMethod,
            status: order.status,
            fulfillmentStatus: order.fulfillmentStatus,
            fulfillmentUpdatedAt: order.fulfillmentUpdatedAt,
          },
          200,
          cors
        );
      }

      if (request.method === "GET" && url.pathname === "/admin/orders") {
        const pin = url.searchParams.get("pin");
        if (!isAdminPinValid(env, pin)) {
          return json({ error: "UNAUTHORIZED" }, 401, cors);
        }

        const listResult = await env.ORDERS_KV!.list({ prefix: "order:", limit: 200 });
        const orderKeys = listResult.keys.filter((key) => !key.name.startsWith("order:session:"));
        const rawOrders = await Promise.all(
          orderKeys.map(async (key) => {
            const value = await env.ORDERS_KV!.get(key.name);
            return value ? (JSON.parse(value) as StoredOrderRecord) : null;
          })
        );
        const normalized = rawOrders
          .filter((order): order is StoredOrderRecord => Boolean(order))
          .map((order) => normalizeOrderRecord(order))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 50)
          .map((order) => ({
            orderId: order.id,
            createdAt: order.createdAt,
            customer: order.deliveryAddress,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.status,
            fulfillmentStatus: order.fulfillmentStatus,
          }));

        return json({ orders: normalized }, 200, cors);
      }

      if (request.method === "POST" && url.pathname.startsWith("/admin/orders/") && url.pathname.endsWith("/fulfillment")) {
        const segments = url.pathname.split("/").filter(Boolean);
        const orderId = segments[2];
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);

        const body: any = await request.json().catch(() => null);
        const pin = body?.pin ?? null;
        if (!isAdminPinValid(env, pin)) {
          return json({ error: "UNAUTHORIZED" }, 401, cors);
        }

        const status = normalizeFulfillmentStatus(body?.status);
        if (status === "RECEIVED") {
          return json({ error: "INVALID_STATUS" }, 400, cors);
        }

        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);

        order.fulfillmentStatus = status;
        order.fulfillmentUpdatedAt = nowIso();
        await saveOrder(env, order);

        return json(
          {
            orderId: order.id,
            fulfillmentStatus: order.fulfillmentStatus,
            fulfillmentUpdatedAt: order.fulfillmentUpdatedAt,
          },
          200,
          cors
        );
      }

      if (request.method === "GET" && url.pathname.startsWith("/admin/orders/") && url.pathname.endsWith("/delivered")) {
        const segments = url.pathname.split("/").filter(Boolean);
        const orderId = segments[2];
        const pin = url.searchParams.get("pin");
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        if (!isAdminPinValid(env, pin)) {
          return json({ error: "UNAUTHORIZED" }, 401, cors);
        }

        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);

        order.fulfillmentStatus = "DELIVERED";
        order.fulfillmentUpdatedAt = nowIso();
        await saveOrder(env, order);
        return text("OK", 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/order-by-session") {
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) return json({ error: "SESSION_ID_REQUIRED" }, 400, cors);
        const orderId = await env.ORDERS_KV!.get(`order:session:${sessionId}`);
        if (!orderId) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);
        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);
        return json({ orderId, status: order.status }, 200, cors);
      }

      return json({ error: "NOT_FOUND" }, 404, cors);
    } catch (e: any) {
      return json({ error: "WORKER_ERROR", details: e?.message ?? String(e) }, 500, cors);
    }
  },
};
