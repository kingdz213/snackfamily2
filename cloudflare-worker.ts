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
  FIREBASE_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_MESSAGING_SENDER_ID?: string;
  FIREBASE_APP_ID?: string;
}

const FALLBACK_ORIGIN = "https://snackfamily2.eu";
const MENU_AVAILABILITY_KEY = "menu:availability:v1";
const MENU_AVAILABILITY_UPDATED_KEY = "menu:availability:updatedAt";

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
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, X-ADMIN-PIN, Authorization",
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

function requireOrdersKv(env: Env, cors?: Record<string, string>) {
  if (!env.ORDERS_KV) {
    return json(
      { ok: false, error: "KV_NOT_CONFIGURED", message: "ORDERS_KV non configuré." },
      500,
      cors ?? {}
    );
  }
  return null;
}

function hasStripeSecret(env: Env) {
  return Boolean(env.STRIPE_SECRET_KEY);
}

function hasWebhookSecret(env: Env) {
  return Boolean(env.STRIPE_WEBHOOK_SECRET);
}

function getFirebaseApiKey(env: Env) {
  const key = env.FIREBASE_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

function getFirebaseProjectId(env: Env) {
  const value = env.FIREBASE_PROJECT_ID?.trim();
  return value && value.length > 0 ? value : null;
}

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

let cachedServiceAccount: ServiceAccount | null = null;

function getServiceAccount(env: Env): ServiceAccount | null {
  if (cachedServiceAccount) return cachedServiceAccount;
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.client_email || !parsed.private_key) return null;
    cachedServiceAccount = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function getFirebaseAuthDomain(env: Env) {
  const value = env.FIREBASE_AUTH_DOMAIN?.trim();
  return value && value.length > 0 ? value : null;
}

function getFirebaseMessagingSenderId(env: Env) {
  const value = env.FIREBASE_MESSAGING_SENDER_ID?.trim();
  return value && value.length > 0 ? value : null;
}

function getFirebaseAppId(env: Env) {
  const value = env.FIREBASE_APP_ID?.trim();
  return value && value.length > 0 ? value : null;
}

function extractBearerToken(request: Request) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function lookupFirebaseUid(idToken: string, apiKey: string) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    return null;
  }

  const data: any = await response.json().catch(() => null);
  const localId = data?.users?.[0]?.localId;
  return typeof localId === "string" && localId.length > 0 ? localId : null;
}

function userOrdersKey(uid: string) {
  return `user_orders:${uid}`;
}

async function readUserOrders(env: Env, uid: string): Promise<string[]> {
  if (!env.ORDERS_KV) throw new Error("ORDERS_KV not bound");
  const raw = await env.ORDERS_KV.get(userOrdersKey(uid));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function appendUserOrder(env: Env, uid: string, orderId: string) {
  const existing = await readUserOrders(env, uid);
  if (!existing.includes(orderId)) {
    existing.push(orderId);
  }
  await env.ORDERS_KV!.put(userOrdersKey(uid), JSON.stringify(existing));
}

async function removeUserOrder(env: Env, uid: string, orderId: string) {
  const existing = await readUserOrders(env, uid);
  const next = existing.filter((id) => id !== orderId);
  await env.ORDERS_KV!.put(userOrdersKey(uid), JSON.stringify(next));
}

type MenuAvailabilityState = {
  unavailableById: Record<string, boolean>;
  updatedAt?: string | null;
  kv: boolean;
};

function normalizeAvailabilityMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([, value]) => typeof value === "boolean")
  );
}

async function readMenuAvailability(env: Env): Promise<MenuAvailabilityState> {
  if (!env.ORDERS_KV) throw new Error("ORDERS_KV not bound");
  const raw = await env.ORDERS_KV.get(MENU_AVAILABILITY_KEY);
  if (!raw) {
    return { unavailableById: {}, updatedAt: null, kv: false };
  }
  let parsed: Record<string, boolean> = {};
  try {
    parsed = normalizeAvailabilityMap(JSON.parse(raw));
  } catch {
    parsed = {};
  }
  const updatedAt = (await env.ORDERS_KV.get(MENU_AVAILABILITY_UPDATED_KEY)) || null;
  return { unavailableById: parsed, updatedAt, kv: true };
}

async function writeMenuAvailability(env: Env, map: Record<string, boolean>) {
  if (!env.ORDERS_KV) throw new Error("ORDERS_KV not bound");
  await env.ORDERS_KV.put(MENU_AVAILABILITY_KEY, JSON.stringify(map));
  const updatedAt = nowIso();
  await env.ORDERS_KV.put(MENU_AVAILABILITY_UPDATED_KEY, updatedAt);
  return updatedAt;
}

function normalizePrivateKey(key: string) {
  return key.replace(/\\n/g, "\n");
}

function pemToArrayBuffer(pem: string) {
  const normalized = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

const tokenCache = new Map<string, { token: string; exp: number }>();

async function getGoogleAccessToken(env: Env, scope: string): Promise<string | null> {
  const serviceAccount = getServiceAccount(env);
  if (!serviceAccount) return null;

  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);
  if (cached && cached.exp - 60 > now) {
    return cached.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncodeString(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const keyData = pemToArrayBuffer(normalizePrivateKey(serviceAccount.private_key));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;

  const form = new URLSearchParams();
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.set("assertion", jwt);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!response.ok) return null;
  const data: any = await response.json().catch(() => null);
  const token = data?.access_token;
  const expiresIn = Number(data?.expires_in ?? 0);
  if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  tokenCache.set(scope, { token, exp: now + expiresIn });
  return token;
}

function statusNotificationCopy(status: OrderStatus) {
  switch (status) {
    case "RECEIVED":
      return "Commande reçue";
    case "IN_PREPARATION":
      return "Commande en préparation";
    case "OUT_FOR_DELIVERY":
      return "Commande en cours de livraison";
    case "DELIVERED":
      return "Commande livrée — merci !";
    case "PENDING_PAYMENT":
      return "Commande enregistrée";
    case "PAID_ONLINE":
      return "Commande confirmée";
    default:
      return "Mise à jour de commande";
  }
}

async function sendOrderStatusPush(env: Env, order: OrderRecord, overrideBody?: string) {
  const projectId = getFirebaseProjectId(env) || getServiceAccount(env)?.project_id || null;
  if (!projectId) return;
  const accessToken = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/firebase.messaging");
  if (!accessToken) return;

  const body = overrideBody ?? statusNotificationCopy(order.status);
  const origin = order.origin || env.DEFAULT_ORIGIN || FALLBACK_ORIGIN;
  const tokens = order.userUid ? await listUserFcmTokens(env, order.userUid) : [];
  if (tokens.length === 0) return;

  await Promise.all(
    tokens.map(async (token) => {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: "Snack Family 2 — Statut mis à jour",
              body: `Votre commande #${order.id} est maintenant : ${body}`,
            },
            data: {
              orderId: order.id,
              status: order.status,
              url: `${origin}/mes-commandes/${order.id}`,
            },
          },
        }),
      });

      if (!response.ok && order.userUid) {
        await deleteUserFcmToken(env, order.userUid, token);
      }
    })
  );
}

async function firestoreRequest(env: Env, path: string, init?: RequestInit): Promise<Response | null> {
  const projectId = getFirebaseProjectId(env) || getServiceAccount(env)?.project_id || null;
  if (!projectId) return null;
  const accessToken = await getGoogleAccessToken(env, "https://www.googleapis.com/auth/datastore");
  if (!accessToken) return null;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

function toFirestoreValue(value: any): any {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => toFirestoreValue(item)) } };
  }
  if (typeof value === "object" && value) {
    const fields: Record<string, any> = {};
    Object.entries(value).forEach(([key, val]) => {
      if (val === undefined) return;
      fields[key] = toFirestoreValue(val);
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function upsertOrderInFirestore(env: Env, order: OrderRecord) {
  if (!order.userUid) return;
  const response = await firestoreRequest(env, `orders/${order.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        userId: toFirestoreValue(order.userUid),
        status: toFirestoreValue(order.status),
        createdAt: toFirestoreValue(order.createdAt),
        updatedAt: toFirestoreValue(order.statusUpdatedAt || order.createdAt),
        paymentMethod: toFirestoreValue(order.paymentMethod),
        total: toFirestoreValue(order.total),
        subtotal: toFirestoreValue(order.subtotal),
        deliveryFee: toFirestoreValue(order.deliveryFee),
        deliveryAddress: toFirestoreValue(order.deliveryAddress),
        desiredDeliveryAt: toFirestoreValue(order.desiredDeliveryAt ?? null),
        desiredDeliverySlotLabel: toFirestoreValue(order.desiredDeliverySlotLabel ?? null),
        items: toFirestoreValue(
          (order.items || []).map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
          }))
        ),
      },
    }),
  });
  if (!response || response.ok) return;
  throw new Error("Firestore upsert failed");
}

async function updateOrderStatusInFirestore(env: Env, order: OrderRecord) {
  if (!order.userUid) return;
  const response = await firestoreRequest(env, `orders/${order.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        status: toFirestoreValue(order.status),
        updatedAt: toFirestoreValue(order.statusUpdatedAt || order.createdAt),
      },
    }),
  });
  if (!response || response.ok) return;
  throw new Error("Firestore update failed");
}

async function deleteOrderFromFirestore(env: Env, orderId: string) {
  const response = await firestoreRequest(env, `orders/${orderId}`, { method: "DELETE" });
  if (!response || response.ok || response.status === 404) return;
  throw new Error("Firestore delete failed");
}

async function listUserFcmTokens(env: Env, uid: string): Promise<string[]> {
  const response = await firestoreRequest(env, `users/${uid}/fcmTokens`, { method: "GET" });
  if (!response || !response.ok) return [];
  const data: any = await response.json().catch(() => null);
  const docs = Array.isArray(data?.documents) ? data.documents : [];
  return docs
    .map((doc: any) => {
      const name: string | undefined = doc?.name;
      if (!name) return null;
      const parts = name.split("/");
      return parts[parts.length - 1] || null;
    })
    .filter((token: string | null): token is string => Boolean(token));
}

async function deleteUserFcmToken(env: Env, uid: string, token: string) {
  const response = await firestoreRequest(env, `users/${uid}/fcmTokens/${token}`, { method: "DELETE" });
  if (!response || response.ok || response.status === 404) return;
  throw new Error("Firestore token delete failed");
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
  customerName?: string;
  customerPhone?: string;
  deliveryType?: string;
  notes?: string;
  paidAt?: string;
  isPaid?: boolean;
  amountPaidCents?: number;
  fulfillmentStatus?: string;
  fulfillmentUpdatedAt?: string;
  stripeCheckoutSessionId?: string;
  adminHubUrl?: string;
  origin: string;
  desiredDeliveryAt?: string;
  desiredDeliverySlotLabel?: string;
  userUid?: string;
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

async function hmacSha256Bytes(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return new Uint8Array(signature);
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeString(value: string) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeToString(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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

const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const ADMIN_LOGIN_RATE_WINDOW_MS = 5 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 6;

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

type AdminTokenPayload = {
  sub: "admin";
  exp: number;
  nonce: string;
};

async function createAdminToken(secret: string) {
  const exp = Date.now() + ADMIN_TOKEN_TTL_MS;
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as Crypto).randomUUID()
      : Math.random().toString(36).slice(2);
  const payload: AdminTokenPayload = { sub: "admin", exp, nonce };
  const payloadString = JSON.stringify(payload);
  const signature = await hmacSha256Bytes(secret, payloadString);
  return `${base64UrlEncodeString(payloadString)}.${base64UrlEncodeBytes(signature)}`;
}

async function verifyAdminToken(secret: string, token: string): Promise<AdminTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadPart, sigPart] = parts;
  if (!payloadPart || !sigPart) return null;
  let payloadString = "";
  try {
    payloadString = base64UrlDecodeToString(payloadPart);
  } catch {
    return null;
  }
  let payload: AdminTokenPayload;
  try {
    payload = JSON.parse(payloadString) as AdminTokenPayload;
  } catch {
    return null;
  }
  if (!payload || payload.sub !== "admin" || !Number.isFinite(payload.exp)) return null;
  if (Date.now() > payload.exp) return null;
  const expectedSig = await hmacSha256Bytes(secret, payloadString);
  const expectedSigPart = base64UrlEncodeBytes(expectedSig);
  if (expectedSigPart !== sigPart) return null;
  return payload;
}

function extractAdminToken(request: Request) {
  const header = request.headers.get("Authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  return header.slice(7).trim();
}

async function verifyAdminRequest(request: Request, env: Env) {
  const secret = getAdminSigningSecret(env);
  if (!secret) {
    return { ok: false, error: "ADMIN_DISABLED", message: "Admin signing secret missing." } as const;
  }
  const token = extractAdminToken(request);
  if (!token) {
    return { ok: false, error: "UNAUTHORIZED", message: "Token admin requis." } as const;
  }
  const payload = await verifyAdminToken(secret, token);
  if (!payload) {
    return { ok: false, error: "UNAUTHORIZED", message: "Token admin invalide ou expiré." } as const;
  }
  return { ok: true, payload } as const;
}

function getClientIp(request: Request) {
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp;
  const forwarded = request.headers.get("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return "unknown";
}

async function registerLoginAttempt(env: Env, clientIp: string) {
  if (!env.ORDERS_KV) return { allowed: true } as const;
  const key = `admin-login-rate:${clientIp}`;
  const raw = await env.ORDERS_KV.get(key);
  let data: { count: number; resetAt: number };
  if (raw) {
    try {
      data = JSON.parse(raw) as { count: number; resetAt: number };
    } catch {
      data = { count: 0, resetAt: Date.now() + ADMIN_LOGIN_RATE_WINDOW_MS };
    }
  } else {
    data = { count: 0, resetAt: Date.now() + ADMIN_LOGIN_RATE_WINDOW_MS };
  }

  if (Date.now() > data.resetAt) {
    data = { count: 0, resetAt: Date.now() + ADMIN_LOGIN_RATE_WINDOW_MS };
  }

  data.count += 1;
  await env.ORDERS_KV.put(key, JSON.stringify(data), { expirationTtl: Math.ceil(ADMIN_LOGIN_RATE_WINDOW_MS / 1000) });

  if (data.count > ADMIN_LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((data.resetAt - Date.now()) / 1000));
    return { allowed: false, retryAfter } as const;
  }
  return { allowed: true } as const;
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

type AdminOrderSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  customerName: string;
  phone: string;
  address: string;
  deliveryType: string;
  paymentMethod: "stripe" | "cash";
  totalCents: number;
  amountDueCents: number;
  itemsCount: number;
  adminHubUrl?: string;
  desiredDeliveryAt?: string;
  desiredDeliverySlotLabel?: string;
};

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").trim();
}

function resolvePaymentMethod(order: OrderRecord) {
  return order.paymentMethod === "STRIPE" ? "stripe" : "cash";
}

function isOrderPaid(order: OrderRecord) {
  if (order.paymentMethod === "STRIPE") {
    return ["PAID_ONLINE", "IN_PREPARATION", "OUT_FOR_DELIVERY", "DELIVERED"].includes(order.status);
  }
  return Boolean(order.isPaid || order.paidAt || order.amountPaidCents);
}

function buildOrderSummary(order: OrderRecord): AdminOrderSummary {
  const normalized = normalizeOrderStatus(order);
  const customerName = String(
    (normalized as any).customerName ?? (normalized as any).name ?? (normalized as any).customer ?? ""
  ).trim();
  const phone = String(
    (normalized as any).customerPhone ?? (normalized as any).phone ?? (normalized as any).customerPhoneNumber ?? ""
  ).trim();
  const updatedAt = normalized.statusUpdatedAt || normalized.fulfillmentUpdatedAt || normalized.createdAt || nowIso();
  const totalCents = Number.isFinite(normalized.total) ? normalized.total : 0;
  const amountDueCents = resolvePaymentMethod(normalized) === "stripe" ? (isOrderPaid(normalized) ? 0 : totalCents) : isOrderPaid(normalized) ? 0 : totalCents;

  return {
    id: normalized.id,
    createdAt: normalized.createdAt || nowIso(),
    updatedAt,
    status: normalized.status,
    customerName,
    phone: normalizePhone(phone),
    address: normalized.deliveryAddress || "Adresse non renseignée",
    deliveryType: normalized.deliveryType || "Livraison",
    paymentMethod: resolvePaymentMethod(normalized),
    totalCents,
    amountDueCents,
    itemsCount: Array.isArray(normalized.items) ? normalized.items.reduce((sum, item) => sum + (item?.quantity ?? 0), 0) : 0,
    adminHubUrl: normalized.adminHubUrl,
    desiredDeliveryAt: normalized.desiredDeliveryAt,
    desiredDeliverySlotLabel: normalized.desiredDeliverySlotLabel,
  };
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
          hasFirebaseProjectId: Boolean(getFirebaseProjectId(env)),
          hasFirebaseServiceAccount: Boolean(getServiceAccount(env)),
          origin,
        },
        200,
        cors
      );
    }

      if (request.method === "GET" && url.pathname === "/firebase-config") {
        const apiKey = getFirebaseApiKey(env);
        const authDomain = getFirebaseAuthDomain(env);
        const projectId = getFirebaseProjectId(env) || getServiceAccount(env)?.project_id || null;
        const messagingSenderId = getFirebaseMessagingSenderId(env);
        const appId = getFirebaseAppId(env);
        if (!apiKey || !authDomain || !projectId || !messagingSenderId || !appId) {
          return json({ error: "FIREBASE_CONFIG_MISSING" }, 500, cors);
        }
      return json(
        {
          apiKey,
          authDomain,
          projectId,
          messagingSenderId,
          appId,
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

        const desiredDeliveryAtRaw = typeof body.desiredDeliveryAt === "string" ? body.desiredDeliveryAt : null;
        const desiredDeliverySlotLabelRaw =
          typeof body.desiredDeliverySlotLabel === "string" ? body.desiredDeliverySlotLabel.trim() : null;
        if (desiredDeliveryAtRaw && Number.isNaN(Date.parse(desiredDeliveryAtRaw))) {
          return json({ error: "INVALID_SCHEDULE", message: "desiredDeliveryAt invalide." }, 400, cors);
        }

        const firebaseIdToken =
          (typeof body.firebaseIdToken === "string" && body.firebaseIdToken.trim()) || extractBearerToken(request);
        let userUid: string | undefined;
        if (firebaseIdToken) {
          const apiKey = getFirebaseApiKey(env);
          if (!apiKey) {
            return json({ error: "SERVER_MISCONFIGURED", message: "FIREBASE_API_KEY manquant." }, 500, cors);
          }
          const uid = await lookupFirebaseUid(firebaseIdToken, apiKey);
          if (!uid) {
            return json({ error: "UNAUTHORIZED", message: "Token Firebase invalide." }, 401, cors);
          }
          userUid = uid;
        }

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
          desiredDeliveryAt: desiredDeliveryAtRaw || undefined,
          desiredDeliverySlotLabel: desiredDeliverySlotLabelRaw || undefined,
          userUid,
        };

        await saveOrder(env, order);
        if (userUid) {
          await appendUserOrder(env, userUid, orderId);
          try {
            await upsertOrderInFirestore(env, order);
          } catch {
            // ignore firestore failure
          }
        }
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

        const desiredDeliveryAtRaw = typeof body.desiredDeliveryAt === "string" ? body.desiredDeliveryAt : null;
        const desiredDeliverySlotLabelRaw =
          typeof body.desiredDeliverySlotLabel === "string" ? body.desiredDeliverySlotLabel.trim() : null;
        if (desiredDeliveryAtRaw && Number.isNaN(Date.parse(desiredDeliveryAtRaw))) {
          return json({ error: "INVALID_SCHEDULE", message: "desiredDeliveryAt invalide." }, 400, cors);
        }

        const firebaseIdToken =
          (typeof body.firebaseIdToken === "string" && body.firebaseIdToken.trim()) || extractBearerToken(request);
        let userUid: string | undefined;
        if (firebaseIdToken) {
          const apiKey = getFirebaseApiKey(env);
          if (!apiKey) {
            return json({ error: "SERVER_MISCONFIGURED", message: "FIREBASE_API_KEY manquant." }, 500, cors);
          }
          const uid = await lookupFirebaseUid(firebaseIdToken, apiKey);
          if (!uid) {
            return json({ error: "UNAUTHORIZED", message: "Token Firebase invalide." }, 401, cors);
          }
          userUid = uid;
        }

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
          desiredDeliveryAt: desiredDeliveryAtRaw || undefined,
          desiredDeliverySlotLabel: desiredDeliverySlotLabelRaw || undefined,
          userUid,
        };

        await saveOrder(env, order);
        if (userUid) {
          await appendUserOrder(env, userUid, orderId);
          try {
            await upsertOrderInFirestore(env, order);
          } catch {
            // ignore firestore failure
          }
        }

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
              try {
                await updateOrderStatusInFirestore(env, existing);
              } catch {
                // ignore firestore failure
              }
            }
          }
        }

        return json({ ok: true }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/menu/availability") {
        const kvError = requireOrdersKv(env, cors);
        if (kvError) return kvError;
        const state = await readMenuAvailability(env);
        return json(
          {
            ok: true,
            unavailableById: state.unavailableById,
            updatedAt: state.updatedAt ?? undefined,
            kv: state.kv,
          },
          200,
          cors
        );
      }

      if (request.method === "POST" && url.pathname === "/admin/login") {
        const adminPin = getAdminPin(env);
        const secret = getAdminSigningSecret(env);
        if (!adminPin || !secret) {
          return json({ error: "ADMIN_DISABLED", message: "Admin PIN or signing secret not configured." }, 403, cors);
        }

        const rate = await registerLoginAttempt(env, getClientIp(request));
        if (!rate.allowed) {
          return json(
            { error: "RATE_LIMITED", message: "Trop de tentatives. Réessayez plus tard." },
            429,
            { ...cors, "Retry-After": String(rate.retryAfter ?? 30) }
          );
        }

        const body: any = await request.json().catch(() => null);
        if (!body) return json({ error: "INVALID_JSON" }, 400, cors);
        const pin = String(body.pin ?? "").trim();
        if (!pin || !isAdminPinValid(env, pin)) {
          return json({ error: "UNAUTHORIZED", message: "Code gérant invalide." }, 401, cors);
        }

        const token = await createAdminToken(secret);
        return json({ token, expiresIn: ADMIN_TOKEN_TTL_MS }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/admin/menu/availability") {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return json({ error: auth.error, message: auth.message }, 401, cors);
        }
        const kvError = requireOrdersKv(env, cors);
        if (kvError) return kvError;
        const state = await readMenuAvailability(env);
        return json(
          {
            ok: true,
            unavailableById: state.unavailableById,
            updatedAt: state.updatedAt ?? undefined,
            kv: state.kv,
          },
          200,
          cors
        );
      }

      if (request.method === "POST" && url.pathname.startsWith("/admin/menu/items/")) {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return json({ error: auth.error, message: auth.message }, 401, cors);
        }
        const kvError = requireOrdersKv(env, cors);
        if (kvError) return kvError;
        const match = url.pathname.match(/^\/admin\/menu\/items\/(.+)$/);
        const itemId = match?.[1] ? decodeURIComponent(match[1]) : "";
        if (!itemId) return json({ error: "ITEM_ID_REQUIRED", message: "Item id requis." }, 400, cors);

        const body: any = await request.json().catch(() => null);
        if (!body || typeof body.unavailable !== "boolean") {
          return json({ error: "INVALID_JSON", message: "Champ unavailable requis." }, 400, cors);
        }

        const state = await readMenuAvailability(env);
        const nextMap = { ...state.unavailableById };
        if (body.unavailable) {
          nextMap[itemId] = true;
        } else {
          delete nextMap[itemId];
        }
        const updatedAt = await writeMenuAvailability(env, nextMap);
        return json(
          { ok: true, itemId, unavailable: body.unavailable, updatedAt },
          200,
          cors
        );
      }

      if (request.method === "POST" && url.pathname === "/admin/menu/reset") {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return json({ error: auth.error, message: auth.message }, 401, cors);
        }
        const kvError = requireOrdersKv(env, cors);
        if (kvError) return kvError;
        const updatedAt = await writeMenuAvailability(env, {});
        return json({ ok: true, unavailableById: {}, updatedAt }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/admin/orders") {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return json({ error: auth.error, message: auth.message }, 401, cors);
        }

        const rawLimit = Number(url.searchParams.get("limit") ?? "50");
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 50)) : 50;
        const cursor = url.searchParams.get("cursor") || undefined;

        const listing = await env.ORDERS_KV!.list({ prefix: "order:", limit, cursor });
        const keys = listing.keys
          .map((entry) => entry.name)
          .filter((name) => name.startsWith("order:") && !name.startsWith("order:session:"));
        const records = await Promise.all(
          keys.map(async (key) => {
            const raw = await env.ORDERS_KV!.get(key);
            return raw ? (JSON.parse(raw) as OrderRecord) : null;
          })
        );
        const summaries = records
          .filter((order): order is OrderRecord => Boolean(order))
          .map((order) => buildOrderSummary(order))
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .slice(0, limit);

        return json({ orders: summaries, cursor: listing.cursor }, 200, cors);
      }

      if (request.method === "GET" && url.pathname.startsWith("/admin/orders/")) {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return json({ error: auth.error, message: auth.message }, 401, cors);
        }
        const match = url.pathname.match(/^\/admin\/orders\/([^/]+)$/);
        const orderId = match?.[1];
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);

        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);
        normalizeOrderStatus(order);

        return json(
          {
            order: {
              id: order.id,
              createdAt: order.createdAt,
              updatedAt: order.statusUpdatedAt || order.fulfillmentUpdatedAt || order.createdAt,
              items: order.items,
              subtotal: order.subtotal,
              deliveryFee: order.deliveryFee,
              total: order.total,
              deliveryAddress: order.deliveryAddress,
              paymentMethod: resolvePaymentMethod(order),
              status: order.status,
              statusUpdatedAt: order.statusUpdatedAt,
              customerName: order.customerName ?? "",
              phone: order.customerPhone ?? "",
              notes: order.notes ?? "",
              adminHubUrl: order.adminHubUrl,
              desiredDeliveryAt: order.desiredDeliveryAt,
              desiredDeliverySlotLabel: order.desiredDeliverySlotLabel,
            },
            summary: buildOrderSummary(order),
          },
          200,
          cors
        );
      }

      if (request.method === "POST" && url.pathname.startsWith("/admin/orders/") && url.pathname.endsWith("/status")) {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return json({ error: auth.error, message: auth.message }, 401, cors);
        }
        const match = url.pathname.match(/^\/admin\/orders\/([^/]+)\/status$/);
        const orderId = match?.[1];
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);

        const body: any = await request.json().catch(() => null);
        if (!body) return json({ error: "INVALID_JSON" }, 400, cors);

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
        try {
          await updateOrderStatusInFirestore(env, order);
        } catch {
          // ignore firestore failure
        }

        try {
          await sendOrderStatusPush(env, order);
        } catch {
          // ignore push failures
        }

        return json({ ok: true, summary: buildOrderSummary(order) }, 200, cors);
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/admin/orders/")) {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return json({ error: auth.error, message: auth.message }, 401, cors);
        }
        const match = url.pathname.match(/^\/admin\/orders\/([^/]+)$/);
        const orderId = match?.[1];
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);

        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);

        if (order.userUid) {
          await removeUserOrder(env, order.userUid, orderId);
        }
        try {
          await deleteOrderFromFirestore(env, orderId);
        } catch {
          // ignore firestore failure
        }
        if (order.stripeCheckoutSessionId) {
          await env.ORDERS_KV!.delete(`order:session:${order.stripeCheckoutSessionId}`);
        }
        await env.ORDERS_KV!.delete(`order:${orderId}`);

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
            try {
              await updateOrderStatusInFirestore(env, order);
            } catch {
              // ignore firestore failure
            }
            try {
              await sendOrderStatusPush(env, order);
            } catch {
              // ignore push failures
            }
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
          try {
            await updateOrderStatusInFirestore(env, order);
          } catch {
            // ignore firestore failure
          }
          try {
            await sendOrderStatusPush(env, order);
          } catch {
            // ignore push failures
          }
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
        try {
          await updateOrderStatusInFirestore(env, order);
        } catch {
          // ignore firestore failure
        }

        try {
          await sendOrderStatusPush(env, order);
        } catch {
          // ignore push failures
        }

        return json(
          { ok: true, status: order.status },
          200,
          cors
        );
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/orders/")) {
        if (!getAdminPin(env)) {
          return json({ error: "ADMIN_PIN_MISSING", message: "ADMIN_PIN not configured." }, 500, cors);
        }
        const match = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
        const orderId = match?.[1];
        if (!orderId) return json({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        const pin = extractAdminPin(request, url);
        if (!isAdminPinValid(env, pin)) {
          return json({ error: "UNAUTHORIZED", message: "Admin PIN required." }, 401, cors);
        }

        const order = await readOrder(env, orderId);
        if (!order) return json({ error: "ORDER_NOT_FOUND" }, 404, cors);

        if (order.userUid) {
          await removeUserOrder(env, order.userUid, orderId);
        }
        try {
          await deleteOrderFromFirestore(env, orderId);
        } catch {
          // ignore firestore failure
        }
        if (order.stripeCheckoutSessionId) {
          await env.ORDERS_KV!.delete(`order:session:${order.stripeCheckoutSessionId}`);
        }
        await env.ORDERS_KV!.delete(`order:${orderId}`);

        return json({ ok: true }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/api/my-orders") {
        const token = extractBearerToken(request);
        if (!token) {
          return json({ error: "UNAUTHORIZED", message: "Authorization Bearer requis." }, 401, cors);
        }
        const apiKey = getFirebaseApiKey(env);
        if (!apiKey) {
          return json({ error: "SERVER_MISCONFIGURED", message: "FIREBASE_API_KEY manquant." }, 500, cors);
        }
        const uid = await lookupFirebaseUid(token, apiKey);
        if (!uid) {
          return json({ error: "UNAUTHORIZED", message: "Token Firebase invalide." }, 401, cors);
        }

        const orderIds = await readUserOrders(env, uid);
        if (orderIds.length === 0) {
          return json({ orders: [] }, 200, cors);
        }

        const records = await Promise.all(orderIds.map((id) => readOrder(env, id)));
        const orders = records
          .filter((order): order is OrderRecord => Boolean(order))
          .map((order) => {
            const normalized = normalizeOrderStatus(order);
            return {
              id: normalized.id,
              status: normalized.status,
              createdAt: normalized.createdAt,
              total: normalized.total,
              paymentMethod: normalized.paymentMethod,
              deliveryAddress: normalized.deliveryAddress,
              desiredDeliveryAt: normalized.desiredDeliveryAt ?? null,
              desiredDeliverySlotLabel: normalized.desiredDeliverySlotLabel ?? null,
            };
          })
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

        return json({ orders }, 200, cors);
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
            desiredDeliveryAt: order.desiredDeliveryAt,
            desiredDeliverySlotLabel: order.desiredDeliverySlotLabel,
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
            desiredDeliveryAt: order.desiredDeliveryAt,
            desiredDeliverySlotLabel: order.desiredDeliverySlotLabel,
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
