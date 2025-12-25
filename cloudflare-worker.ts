// cloudflare-worker.ts
// Cloudflare Worker (NO SDK, NO import) -> Stripe Checkout via fetch
// Règles: minimum 20€ (hors livraison) + livraison 2.50€ + livraison max 10km + adresse + position obligatoires

interface Env {
  ORDERS_KV?: KVNamespace;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DEFAULT_ORIGIN?: string;
  ADMIN_PIN?: string;
  ADMIN_SIGNING_SECRET?: string;
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
    "Access-Control-Allow-Headers": "Content-Type, X-ADMIN-PIN",
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

function hasOrdersKv(env: Env) {
  return Boolean(env.ORDERS_KV);
}

function hasStripeSecret(env: Env) {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function hasWebhookSecret(env: Env) {
  return Boolean(env.STRIPE_WEBHOOK_SECRET);
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

type OrderStatus =
  | "RECEIVED"
  | "PENDING_PAYMENT"
  | "PAID_ONLINE"
  | "IN_PREPARATION"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED";
type PaymentMethod = "STRIPE" | "CASH";

type OrderRecord = {
  id: string;
  createdAt: string;
  statusUpdatedAt: string;
  items: { name: string; quantity: number; price: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  fulfillmentStatus?: string;
  fulfillmentUpdatedAt?: string;
  stripeCheckoutSessionId?: string;
  adminHubUrl?: string;
  origin: string;
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

async function readOrder(env: Env, orderId: string): Promise<OrderRecord | null> {
  if (!env.ORDERS_KV) throw new Error("ORDERS_KV not bound");
  const raw = await env.ORDERS_KV.get(`order:${orderId}`);
  return raw ? (JSON.parse(raw) as OrderRecord) : null;
}

function normalizeOrderStatus(order: OrderRecord): OrderRecord {
  if (!order.status) {
    order.status = order.paymentMethod === "STRIPE" ? "PENDING_PAYMENT" : "RECEIVED";
  }

  if (!order.statusUpdatedAt) {
    order.statusUpdatedAt = order.createdAt || nowIso();
  }

  if (order.status === "CASH_ON_DELIVERY") {
    order.status = "RECEIVED";
  }

  const legacy = order.fulfillmentStatus;
  if (legacy && ["IN_PREPARATION", "OUT_FOR_DELIVERY", "DELIVERED"].includes(legacy)) {
    order.status = legacy as OrderStatus;
  }

  return order;
}

function getAdminPin(env: Env) {
  const pin = env.ADMIN_PIN?.trim();
  return pin && pin.length > 0 ? pin : null;
}

function getAdminSigningSecret(env: Env) {
  const secret = env.ADMIN_SIGNING_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

function isAdminPinValid(env: Env, provided: string | null | undefined) {
  const expected = getAdminPin(env);
  if (!expected) return false;
  return provided === expected;
}

function extractAdminPin(request: Request, url: URL) {
  const headerPin = request.headers.get("X-ADMIN-PIN");
  return headerPin?.trim() || url.searchParams.get("pin");
}

async function listOrders(env: Env, limit = 50): Promise<OrderRecord[]> {
  if (!env.ORDERS_KV) throw new Error("ORDERS_KV not bound");
  const listing = await env.ORDERS_KV.list({ prefix: "order:", limit: Math.max(limit * 2, 100) });
  const orderKeys = listing.keys
    .map((entry) => entry.name)
    .filter((name) => name.startsWith("order:") && !name.startsWith("order:session:"));
  const orders = await Promise.all(
    orderKeys.map(async (key) => {
      const raw = await env.ORDERS_KV!.get(key);
      return raw ? (JSON.parse(raw) as OrderRecord) : null;
    })
  );
  return orders
    .filter((order): order is OrderRecord => Boolean(order))
    .map((order) => normalizeOrderStatus(order))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

type AdminPurpose = "ADMIN_HUB" | "ADMIN_DELIVER";

function buildAdminPayload(orderId: string, exp: number, purpose: AdminPurpose) {
  return `${orderId}.${exp}.${purpose}`;
}

async function signAdmin(secret: string, orderId: string, exp: number, purpose: AdminPurpose) {
  return hmacSha256Hex(secret, buildAdminPayload(orderId, exp, purpose));
}

async function verifyAdmin(secret: string, orderId: string, exp: number, sig: string, purpose: AdminPurpose) {
  const expected = await signAdmin(secret, orderId, exp, purpose);
  return expected === sig;
}

function statusRank(status: OrderStatus) {
  switch (status) {
    case "RECEIVED":
    case "PENDING_PAYMENT":
    case "PAID_ONLINE":
      return 0;
    case "IN_PREPARATION":
      return 1;
    case "OUT_FOR_DELIVERY":
      return 2;
    case "DELIVERED":
      return 3;
    default:
      return 0;
  }
}

function buildPublicOrderUrl(origin: string, orderId: string) {
  return `${origin}/order/${orderId}`;
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
        const adminSecret = getAdminSigningSecret(env);
        const adminExp = Date.now() + 48 * 60 * 60 * 1000;
        const adminHubUrl = adminSecret
          ? `${checkoutOrigin}/admin/order?orderId=${encodeURIComponent(orderId)}&exp=${encodeURIComponent(
              String(adminExp)
            )}&sig=${encodeURIComponent(await signAdmin(adminSecret, orderId, adminExp, "ADMIN_HUB"))}`
          : undefined;
        const publicOrderUrl = buildPublicOrderUrl(checkoutOrigin, orderId);
        const order: OrderRecord = {
          id: orderId,
          createdAt: nowIso(),
          statusUpdatedAt: nowIso(),
          items: validation.items.map((it) => ({ name: it.name, quantity: it.quantity, price: it.cents })),
          subtotal: sub,
          deliveryFee: DELIVERY_FEE_CENTS,
          total: sub + DELIVERY_FEE_CENTS,
          deliveryAddress,
          deliveryLat,
          deliveryLng,
          paymentMethod: "CASH",
          status: "RECEIVED",
          adminHubUrl,
          origin: checkoutOrigin,
        };

        await saveOrder(env, order);
        return json({ orderId, publicOrderUrl, adminHubUrl }, 200, cors);
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
        const adminSecret = getAdminSigningSecret(env);
        const adminExp = Date.now() + 48 * 60 * 60 * 1000;
        const adminHubUrl = adminSecret
          ? `${checkoutOrigin}/admin/order?orderId=${encodeURIComponent(orderId)}&exp=${encodeURIComponent(
              String(adminExp)
            )}&sig=${encodeURIComponent(await signAdmin(adminSecret, orderId, adminExp, "ADMIN_HUB"))}`
          : undefined;
        const publicOrderUrl = buildPublicOrderUrl(checkoutOrigin, orderId);
        const order: OrderRecord = {
          id: orderId,
          createdAt: nowIso(),
          statusUpdatedAt: nowIso(),
          items: validation.items.map((it) => ({ name: it.name, quantity: it.quantity, price: it.cents })),
          subtotal: sub,
          deliveryFee: DELIVERY_FEE_CENTS,
          total: sub + DELIVERY_FEE_CENTS,
          deliveryAddress,
          deliveryLat,
          deliveryLng,
          paymentMethod: "STRIPE",
          status: "PENDING_PAYMENT",
          adminHubUrl,
          origin: checkoutOrigin,
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

        return json(
          { url: result.session.url, sessionId: result.session.id, orderId, publicOrderUrl, adminHubUrl },
          200,
          cors
        );
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
              normalizeOrderStatus(existing);
              existing.status = "PAID_ONLINE";
              existing.statusUpdatedAt = nowIso();
              existing.stripeCheckoutSessionId = existing.stripeCheckoutSessionId ?? event?.data?.object?.id;
              await saveOrder(env, existing);
            }
          }
        }

        return json({ ok: true }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/admin/order-action") {
        const secret = getAdminSigningSecret(env);
        const pinSecret = getAdminPin(env);
        if (!pinSecret || !secret) {
          return json({ error: "ADMIN_DISABLED", message: "Admin PIN or signing secret not configured." }, 403, cors);
        }

        const body: any = await request.json().catch(() => null);
        if (!body) return json({ error: "INVALID_JSON" }, 400, cors);

        const orderId = String(body.orderId ?? "").trim();
        const action = String(body.action ?? "").trim() as "OPEN" | "DELIVERED";
        const exp = Number(body.exp);
        const sig = String(body.sig ?? "").trim();
        const pin = String(body.pin ?? "").trim();

        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        if (!Number.isFinite(exp)) return json({ error: "EXP_INVALID" }, 400, cors);
        if (!sig) return json({ error: "SIG_REQUIRED" }, 400, cors);
        if (Date.now() > exp) return json({ error: "LINK_EXPIRED" }, 400, cors);
        if (!pin || pin !== pinSecret) return json({ error: "PIN_INVALID" }, 403, cors);
        if (action !== "OPEN" && action !== "DELIVERED") return json({ error: "INVALID_ACTION" }, 400, cors);

        const purpose = action === "OPEN" ? "ADMIN_HUB" : "ADMIN_DELIVER";
        const isValidSig = await verifyAdmin(secret, orderId, exp, sig, purpose);
        if (!isValidSig) return json({ error: "INVALID_SIGNATURE" }, 401, cors);

        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);

        normalizeOrderStatus(order);
        const rank = statusRank(order.status);

        if (action === "OPEN") {
          if (rank > 1) {
            return json({ error: "STATUS_LOCKED", message: "Commande déjà en cours de livraison ou livrée." }, 409, cors);
          }
          if (rank < 1) {
            order.status = "IN_PREPARATION";
            order.statusUpdatedAt = nowIso();
            await saveOrder(env, order);
          }

          const deliveredExp = Date.now() + 24 * 60 * 60 * 1000;
          const deliveredSig = await signAdmin(secret, orderId, deliveredExp, "ADMIN_DELIVER");
          const publicOrderUrl = buildPublicOrderUrl(order.origin, orderId);

          return json(
            {
              ok: true,
              order,
              publicOrderUrl,
              deliveredAction: { exp: deliveredExp, sig: deliveredSig },
            },
            200,
            cors
          );
        }

        if (rank < 1) {
          return json({ error: "STATUS_NOT_READY", message: "Commande pas encore en préparation." }, 409, cors);
        }

        if (order.status !== "DELIVERED") {
          order.status = "DELIVERED";
          order.statusUpdatedAt = nowIso();
          await saveOrder(env, order);
        }

        return json(
          {
            ok: true,
            order,
            publicOrderUrl: buildPublicOrderUrl(order.origin, orderId),
          },
          200,
          cors
        );
      }

      if (request.method === "GET" && url.pathname === "/api/admin/orders") {
        if (!getAdminPin(env)) {
          return json({ error: "ADMIN_PIN_MISSING", message: "ADMIN_PIN not configured." }, 500, cors);
        }
        const pin = extractAdminPin(request, url);
        if (!isAdminPinValid(env, pin)) {
          return json({ error: "UNAUTHORIZED", message: "Admin PIN required." }, 401, cors);
        }
        const limit = Number(url.searchParams.get("limit") ?? "30");
        const orders = await listOrders(env, Number.isFinite(limit) ? Math.max(1, Math.min(limit, 50)) : 30);
        return json(
          {
            orders: orders.map((order) => ({
              orderId: order.id,
              createdAt: order.createdAt,
              paymentMethod: order.paymentMethod,
              status: order.status,
              total: order.total,
            })),
          },
          200,
          cors
        );
      }

      if (request.method === "POST" && url.pathname.startsWith("/api/admin/orders/") && url.pathname.endsWith("/status")) {
        if (!getAdminPin(env)) {
          return json({ error: "ADMIN_PIN_MISSING", message: "ADMIN_PIN not configured." }, 500, cors);
        }
        const match = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
        const orderId = match?.[1];
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);

        const body: any = await request.json().catch(() => null);
        if (!body) return json({ error: "INVALID_JSON" }, 400, cors);
        const pin = extractAdminPin(request, url) || body.pin;
        if (!isAdminPinValid(env, pin)) {
          return json({ error: "UNAUTHORIZED", message: "Admin PIN required." }, 401, cors);
        }

        const status = String(body.status ?? "").trim() as OrderStatus;
        const allowed: OrderStatus[] = ["IN_PREPARATION", "OUT_FOR_DELIVERY", "DELIVERED"];
        if (!allowed.includes(status)) {
          return json({ error: "INVALID_STATUS" }, 400, cors);
        }

        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);

        normalizeOrderStatus(order);
        order.status = status;
        order.statusUpdatedAt = nowIso();
        await saveOrder(env, order);

        return json(
          { ok: true, status: order.status },
          200,
          cors
        );
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/orders/")) {
        const orderId = url.pathname.replace("/api/orders/", "").trim();
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);
        normalizeOrderStatus(order);

        return json(
          {
            id: order.id,
            createdAt: order.createdAt,
            items: order.items,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            total: order.total,
          deliveryAddress: order.deliveryAddress,
          paymentMethod: order.paymentMethod,
          status: order.status,
          statusUpdatedAt: order.statusUpdatedAt,
          adminHubUrl: order.adminHubUrl,
        },
        200,
        cors
      );
      }

      if (request.method === "GET" && (url.pathname.startsWith("/order/") || url.pathname.startsWith("/orders/"))) {
        const orderId = url.pathname.startsWith("/orders/")
          ? url.pathname.replace("/orders/", "").trim()
          : url.pathname.replace("/order/", "").trim();
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);
        normalizeOrderStatus(order);

        return json(
          {
            id: order.id,
            createdAt: order.createdAt,
            items: order.items,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            total: order.total,
          deliveryAddress: order.deliveryAddress,
          paymentMethod: order.paymentMethod,
          status: order.status,
          statusUpdatedAt: order.statusUpdatedAt,
          adminHubUrl: order.adminHubUrl,
        },
        200,
        cors
      );
      }

      if (request.method === "GET" && url.pathname === "/order-by-session") {
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) return json({ error: "SESSION_ID_REQUIRED" }, 400, cors);
        const orderId = await env.ORDERS_KV!.get(`order:session:${sessionId}`);
        if (!orderId) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);
        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);
        normalizeOrderStatus(order);
        return json({ orderId, status: order.status }, 200, cors);
      }

      return json({ error: "NOT_FOUND" }, 404, cors);
    } catch (e: any) {
      return json({ error: "WORKER_ERROR", details: e?.message ?? String(e) }, 500, cors);
    }
  },
};
