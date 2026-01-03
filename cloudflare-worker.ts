// cloudflare-worker.ts
// Cloudflare Worker (NO SDK, NO import) -> Stripe Checkout via fetch
// Règles: minimum 20€ (hors livraison) + livraison 2.50€ + livraison max 10km + adresse + position obligatoires

interface Env {
  ORDERS_KV?: KVNamespace;
  STRIPE_SECRET_KEY?: string;
  STRIPE_API_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  DEFAULT_ORIGIN?: string;
  ADMIN_PIN?: string;
  ADMIN_SIGNING_SECRET?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?: string;
  FIREBASE_SERVICE_ACCOUNT_BASE64?: string;
  FIREBASE_SERVICE_ACCOUNT?: string | Record<string, unknown>;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_MESSAGING_SENDER_ID?: string;
  FIREBASE_APP_ID?: string;
  NODE_ENV?: string;
  ENVIRONMENT?: string;
}

const FALLBACK_ORIGIN = "https://snackfamily2.eu";
const STORE_SETTINGS_PATH = "settings/store";
const MENU_AVAILABILITY_PATH = "settings/menuAvailability";
const BRUSSELS_TIME_ZONE = "Europe/Brussels";
const WORKER_BUILD_ID = "build-2026-01-02-21-00";

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

type RequestInfo = {
  host: string;
  url: string;
};

function getRequestInfo(request: Request): RequestInfo {
  const url = new URL(request.url);
  return {
    host: request.headers.get("Host") || url.host,
    url: `${url.origin}${url.pathname}`,
  };
}

function json(data: any, status = 200, headers: Record<string, string> = {}, requestInfo?: RequestInfo) {
  const workerHeaders = {
    "X-Worker-Build": WORKER_BUILD_ID,
    "X-Worker-Host": requestInfo?.host ?? "",
    "X-Worker-Url": requestInfo?.url ?? "",
  };
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
      ...workerHeaders,
    },
  });
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

function sanitizeNotes(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 500);
}

function hasOrdersKv(env: Env) {
  return Boolean(env.ORDERS_KV);
}

function isEnvAvailable(env: Env | undefined | null): env is Env {
  return Boolean(env);
}

const KNOWN_ENV_KEYS = [
  "ORDERS_KV",
  "STRIPE_SECRET_KEY",
  "STRIPE_API_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "DEFAULT_ORIGIN",
  "ADMIN_PIN",
  "ADMIN_SIGNING_SECRET",
  "FIREBASE_API_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "FIREBASE_SERVICE_ACCOUNT_JSON_BASE64",
  "FIREBASE_SERVICE_ACCOUNT_BASE64",
  "FIREBASE_SERVICE_ACCOUNT",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
  "NODE_ENV",
  "ENVIRONMENT",
];

type EnvKeysSummary = {
  keys: string[];
  presence: Record<string, boolean>;
};

function isEnvValuePresent(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function listEnvKeys(env: Env): EnvKeysSummary {
  const keys = Object.keys(env).sort();
  const presence: Record<string, boolean> = {};
  KNOWN_ENV_KEYS.forEach((key) => {
    presence[key] = isEnvValuePresent((env as Record<string, unknown>)[key]);
  });
  return { keys, presence };
}

type FirebasePresence = {
  FIREBASE_PROJECT_ID: boolean;
  FIREBASE_SERVICE_ACCOUNT_JSON: boolean;
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: boolean;
  FIREBASE_CLIENT_EMAIL: boolean;
  FIREBASE_PRIVATE_KEY: boolean;
};

function getFirebasePresence(env: Env): FirebasePresence {
  return {
    FIREBASE_PROJECT_ID: isEnvValuePresent(env.FIREBASE_PROJECT_ID),
    FIREBASE_SERVICE_ACCOUNT_JSON: isEnvValuePresent(env.FIREBASE_SERVICE_ACCOUNT_JSON),
    FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: isEnvValuePresent(env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64),
    FIREBASE_CLIENT_EMAIL: isEnvValuePresent(env.FIREBASE_CLIENT_EMAIL),
    FIREBASE_PRIVATE_KEY: isEnvValuePresent(env.FIREBASE_PRIVATE_KEY),
  };
}

function isDevEnvironment(env: Env) {
  const environment = env.ENVIRONMENT?.toLowerCase();
  const nodeEnv = env.NODE_ENV?.toLowerCase();
  return environment === "development" || environment === "preview" || nodeEnv === "development";
}

function isServiceJsonVisible(env: Env) {
  return Boolean(
    (env.FIREBASE_SERVICE_ACCOUNT_JSON && env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) ||
      (env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 && env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64.trim()) ||
      (env.FIREBASE_SERVICE_ACCOUNT_BASE64 && env.FIREBASE_SERVICE_ACCOUNT_BASE64.trim()) ||
      (typeof env.FIREBASE_SERVICE_ACCOUNT === "string" && env.FIREBASE_SERVICE_ACCOUNT.trim()) ||
      (env.FIREBASE_SERVICE_ACCOUNT && typeof env.FIREBASE_SERVICE_ACCOUNT === "object")
  );
}

function requireOrdersKv(env: Env, cors?: Record<string, string>, requestInfo?: RequestInfo) {
  if (!env.ORDERS_KV) {
    return json(
      { ok: false, error: "KV_NOT_CONFIGURED", message: "ORDERS_KV non configuré." },
      500,
      cors ?? {},
      requestInfo
    );
  }
  return null;
}

function getStripeSecret(env: Env) {
  const primary = env.STRIPE_SECRET_KEY?.trim();
  if (primary) return primary;
  const fallback = env.STRIPE_API_KEY?.trim();
  return fallback || null;
}

function hasStripeSecret(env: Env) {
  return Boolean(getStripeSecret(env));
}

function hasWebhookSecret(env: Env) {
  return Boolean(env.STRIPE_WEBHOOK_SECRET);
}

function getFirebaseApiKey(env: Env) {
  const key = env.FIREBASE_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

type ServiceAccountJson = {
  client_email?: string;
  clientEmail?: string;
  private_key?: string;
  privateKey?: string;
  project_id?: string;
  projectId?: string;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

type ResolvedFirebaseCreds = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
  serviceJsonParsed: boolean;
  source: {
    usedServiceJson: boolean;
    usedBase64: boolean;
    usedEnvProjectId: boolean;
  };
  missing: {
    projectId: boolean;
    clientEmail: boolean;
    privateKey: boolean;
    serviceJson: boolean;
  };
};

type FirebaseDebugInfo = {
  requestHost?: string | null;
  workerBuild: string;
  envKeys: string[];
  firebasePresence: FirebasePresence;
  flags: {
    usedServiceJson: boolean;
    usedBase64: boolean;
    usedEnvProjectId: boolean;
  };
};

type FirebaseConfigErrorPayload = {
  error: "FIRESTORE_ERROR";
  code?: string;
  message: string;
  hint?: string;
  workerBuild: string;
  requestHost?: string | null;
  missing: {
    projectId: boolean;
    clientEmail: boolean;
    privateKey: boolean;
    serviceJson: boolean;
  };
  debug: FirebaseDebugInfo;
};

class FirebaseConfigError extends Error {
  payload: FirebaseConfigErrorPayload;

  constructor(payload: FirebaseConfigErrorPayload) {
    super(payload.message);
    this.payload = payload;
  }
}

function normalizeFirebasePrivateKey(raw: string) {
  let normalized = raw.replace(/\\n/g, "\n").trim();
  const hasBegin = normalized.includes("BEGIN PRIVATE KEY");
  const hasEnd = normalized.includes("END PRIVATE KEY");
  if (!hasBegin) {
    normalized = `-----BEGIN PRIVATE KEY-----\n${normalized}`;
  }
  if (!hasEnd) {
    normalized = `${normalized}\n-----END PRIVATE KEY-----`;
  }
  if (!normalized.includes("\n")) {
    normalized = normalized.replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----\n");
    normalized = normalized.replace("-----END PRIVATE KEY-----", "\n-----END PRIVATE KEY-----");
  }
  return normalized.trim();
}

function normalizeEnvString(value?: string | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function looksLikeBase64(value: string) {
  if (!value) return false;
  if (!/^[A-Za-z0-9+/=]+$/.test(value)) return false;
  return value.length % 4 === 0 && value.length >= 40;
}

function safeBase64Decode(value: string) {
  try {
    return atob(value);
  } catch {
    return null;
  }
}

function parseServiceAccountCandidate(raw: string): { json: ServiceAccountJson | null; usedBase64: boolean } {
  const queue: Array<{ value: string; usedBase64: boolean }> = [
    { value: raw.replace(/^\uFEFF/, "").trim(), usedBase64: false },
  ];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const value = current.value.replace(/^\uFEFF/, "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);

    if (value.startsWith("{")) {
      try {
        const parsed = JSON.parse(value) as ServiceAccountJson;
        if (parsed && typeof parsed === "object") {
          return { json: parsed, usedBase64: current.usedBase64 };
        }
      } catch {}
    }

    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        const inner = JSON.parse(value);
        if (typeof inner === "string") {
          queue.push({ value: inner, usedBase64: current.usedBase64 });
        }
      } catch {}
    }

    if (looksLikeBase64(value)) {
      const decoded = safeBase64Decode(value);
      if (decoded) {
        queue.push({ value: decoded, usedBase64: true });
      }
    }
  }

  return { json: null, usedBase64: false };
}

function resolveFirebaseCredentials(env: Env): ResolvedFirebaseCreds {
  const envProjectId = normalizeEnvString(env.FIREBASE_PROJECT_ID) ?? undefined;
  const envClientEmail = normalizeEnvString(env.FIREBASE_CLIENT_EMAIL) ?? undefined;
  const envPrivateKey = normalizeEnvString(env.FIREBASE_PRIVATE_KEY) ?? undefined;

  const rawServiceJson = normalizeEnvString(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const rawServiceJsonBase64 =
    normalizeEnvString(env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) || normalizeEnvString(env.FIREBASE_SERVICE_ACCOUNT_BASE64);
  const rawServiceAccount =
    typeof env.FIREBASE_SERVICE_ACCOUNT === "string" ? normalizeEnvString(env.FIREBASE_SERVICE_ACCOUNT) : null;

  const serviceJsonPresent = Boolean(
    rawServiceJson ||
      rawServiceJsonBase64 ||
      rawServiceAccount ||
      (env.FIREBASE_SERVICE_ACCOUNT && typeof env.FIREBASE_SERVICE_ACCOUNT === "object")
  );

  let serviceJson: ServiceAccountJson | null = null;
  let usedBase64 = false;
  let usedServiceJson = false;

  if (env.FIREBASE_SERVICE_ACCOUNT && typeof env.FIREBASE_SERVICE_ACCOUNT === "object") {
    serviceJson = env.FIREBASE_SERVICE_ACCOUNT as ServiceAccountJson;
    usedServiceJson = true;
  }

  if (!serviceJson && rawServiceJson) {
    const parsed = parseServiceAccountCandidate(rawServiceJson);
    serviceJson = parsed.json;
    usedBase64 = parsed.usedBase64;
    usedServiceJson = Boolean(serviceJson);
  }

  if (!serviceJson && rawServiceJsonBase64) {
    const parsed = parseServiceAccountCandidate(rawServiceJsonBase64);
    serviceJson = parsed.json;
    usedBase64 = parsed.usedBase64 || Boolean(serviceJson);
    usedServiceJson = Boolean(serviceJson);
  }

  if (!serviceJson && rawServiceAccount) {
    const parsed = parseServiceAccountCandidate(rawServiceAccount);
    serviceJson = parsed.json;
    usedBase64 = parsed.usedBase64 || Boolean(serviceJson);
    usedServiceJson = Boolean(serviceJson);
  }

  const jsonProjectId = serviceJson?.project_id ?? serviceJson?.projectId ?? undefined;
  const jsonClientEmail = serviceJson?.client_email ?? serviceJson?.clientEmail ?? undefined;
  const jsonPrivateKey = serviceJson?.private_key ?? serviceJson?.privateKey ?? undefined;

  let projectId = jsonProjectId || envProjectId;
  let clientEmail = jsonClientEmail || envClientEmail;
  let privateKey = jsonPrivateKey || envPrivateKey;

  if (privateKey) {
    privateKey = normalizeFirebasePrivateKey(privateKey);
  }

  const hasProjectId = Boolean(projectId);
  const hasClientEmail = Boolean(clientEmail);
  const hasPrivateKey = Boolean(privateKey);

  return {
    projectId,
    clientEmail,
    privateKey,
    serviceJsonParsed: Boolean(serviceJson),
    source: {
      usedServiceJson,
      usedBase64,
      usedEnvProjectId: Boolean(envProjectId && projectId === envProjectId),
    },
    missing: {
      projectId: !hasProjectId,
      clientEmail: !hasClientEmail,
      privateKey: !hasPrivateKey,
      serviceJson: !serviceJsonPresent,
    },
  };
}

function getFirebaseProjectId(env: Env) {
  return resolveFirebaseCredentials(env)?.projectId ?? null;
}

function getServiceAccount(env: Env): ServiceAccount | null {
  const credentials = resolveFirebaseCredentials(env);
  if (!credentials?.clientEmail || !credentials.privateKey) return null;
  return {
    client_email: credentials.clientEmail,
    private_key: credentials.privateKey,
    project_id: credentials.projectId || undefined,
  };
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

type FirestoreErrorPayload = FirebaseConfigErrorPayload;

function getFirebaseMissingFlags(env: Env) {
  return (
    resolveFirebaseCredentials(env)?.missing ?? {
      projectId: true,
      clientEmail: true,
      privateKey: true,
      serviceJson: true,
    }
  );
}

function buildFirebaseDebugInfo(
  env: Env,
  credentials: ResolvedFirebaseCreds,
  requestHost?: string
): FirebaseDebugInfo {
  const envSummary = listEnvKeys(env);
  return {
    requestHost: requestHost ?? null,
    workerBuild: WORKER_BUILD_ID,
    envKeys: envSummary.keys,
    firebasePresence: getFirebasePresence(env),
    flags: {
      usedServiceJson: credentials.source.usedServiceJson,
      usedBase64: credentials.source.usedBase64,
      usedEnvProjectId: credentials.source.usedEnvProjectId,
    },
  };
}

function buildFirestoreError(
  env: Env,
  params: {
    code?: string;
    message: string;
    hint?: string;
    requestHost?: string;
    credentials?: ResolvedFirebaseCreds;
  }
): FirestoreErrorPayload {
  const credentials = params.credentials ?? resolveFirebaseCredentials(env);
  return {
    error: "FIRESTORE_ERROR",
    code: params.code,
    message: params.message,
    hint: params.hint,
    workerBuild: WORKER_BUILD_ID,
    requestHost: params.requestHost ?? null,
    missing: credentials.missing,
    debug: buildFirebaseDebugInfo(env, credentials, params.requestHost),
  };
}

function isFirebaseConfigError(err: unknown): err is FirebaseConfigError {
  return err instanceof FirebaseConfigError;
}

function buildFirebaseConfigError(
  env: Env,
  credentials: ResolvedFirebaseCreds,
  params: { code: string; message: string; hint?: string; requestHost?: string }
) {
  return new FirebaseConfigError(
    buildFirestoreError(env, {
      code: params.code,
      message: params.message,
      hint: params.hint,
      requestHost: params.requestHost,
      credentials,
    })
  );
}

function ensureFirebaseCredentials(env: Env, requestHost?: string): ResolvedFirebaseCreds {
  const credentials = resolveFirebaseCredentials(env);
  const firebasePresence = getFirebasePresence(env);
  const noVarsVisible = Object.values(firebasePresence).every((value) => !value);

  if (noVarsVisible) {
    throw buildFirebaseConfigError(env, credentials, {
      code: "NO_FIREBASE_VARS_VISIBLE",
      message: "Aucune variable Firebase visible au runtime.",
      hint: "Vous avez probablement configuré les variables dans Preview et pas Production.",
      requestHost,
    });
  }

  if (credentials.missing.projectId) {
    throw buildFirebaseConfigError(env, credentials, {
      code: "MISSING_PROJECT_ID",
      message: "Firebase projectId manquant.",
      hint: "Ajoutez project_id dans le service account ou la variable FIREBASE_PROJECT_ID.",
      requestHost,
    });
  }

  if (credentials.missing.clientEmail || credentials.missing.privateKey) {
    throw buildFirebaseConfigError(env, credentials, {
      code: "MISSING_CREDENTIALS",
      message: "Identifiants Firebase manquants.",
      hint: "Configurez FIREBASE_SERVICE_ACCOUNT_JSON(_BASE64) ou FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.",
      requestHost,
    });
  }

  return credentials;
}

function getAdminApp(
  env: Env,
  requestHost?: string
): { ok: true; app: { creds: ResolvedFirebaseCreds } } | { ok: false; error: FirestoreErrorPayload } {
  try {
    const credentials = ensureFirebaseCredentials(env, requestHost);
    return { ok: true, app: { creds: credentials } };
  } catch (err) {
    if (isFirebaseConfigError(err)) {
      return { ok: false, error: err.payload };
    }
    return {
      ok: false,
      error: buildFirestoreError(env, {
        code: "FIREBASE_CONFIG_ERROR",
        message: "Erreur de configuration Firebase.",
        hint: err instanceof Error ? err.message : String(err),
        requestHost,
      }),
    };
  }
}

function requireFirestoreCredentials(env: Env, cors: Record<string, string>, requestInfo?: RequestInfo) {
  try {
    ensureFirebaseCredentials(env, requestInfo?.host);
    return null;
  } catch (err) {
    if (isFirebaseConfigError(err)) {
      return json(err.payload, 500, cors, requestInfo);
    }
    const fallback = buildFirestoreError(env, {
      code: "FIREBASE_CONFIG_ERROR",
      message: "Erreur de configuration Firebase.",
      hint: err instanceof Error ? err.message : String(err),
      requestHost: requestInfo?.host,
    });
    return json(fallback, 500, cors, requestInfo);
  }
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

type FirebaseJwksCache = {
  exp: number;
  keys: Record<string, JsonWebKey>;
};

let firebaseJwksCache: FirebaseJwksCache | null = null;

function base64UrlToUint8Array(input: string) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtPart(input: string) {
  const bytes = base64UrlToUint8Array(input);
  return new TextDecoder().decode(bytes);
}

function parseCacheMaxAge(header: string | null) {
  if (!header) return 0;
  const match = header.match(/max-age=(\\d+)/);
  return match ? Number(match[1]) : 0;
}

async function getFirebaseJwks(): Promise<Record<string, JsonWebKey> | null> {
  const now = Date.now();
  if (firebaseJwksCache && firebaseJwksCache.exp > now) {
    return firebaseJwksCache.keys;
  }
  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!response.ok) return null;
  const data: any = await response.json().catch(() => null);
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  const mapped: Record<string, JsonWebKey> = {};
  keys.forEach((key: JsonWebKey) => {
    if (key.kid) mapped[key.kid] = key;
  });
  const maxAge = parseCacheMaxAge(response.headers.get("Cache-Control"));
  firebaseJwksCache = {
    keys: mapped,
    exp: now + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge * 1000 : 60 * 60 * 1000),
  };
  return mapped;
}

async function verifyFirebaseIdToken(env: Env, idToken: string): Promise<string | null> {
  const projectId = getFirebaseProjectId(env) || getServiceAccount(env)?.project_id || null;
  if (!projectId) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  let header: any = null;
  let payload: any = null;
  try {
    header = JSON.parse(decodeJwtPart(headerPart));
    payload = JSON.parse(decodeJwtPart(payloadPart));
  } catch {
    return null;
  }

  if (!header || header.alg !== "RS256" || !header.kid) return null;
  const jwks = await getFirebaseJwks();
  const jwk = jwks?.[header.kid];
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signature = base64UrlToUint8Array(signaturePart);
  const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const verified = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    key,
    signature,
    data
  );
  if (!verified) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.exp !== "number" || payload.exp < nowSeconds) return null;
  if (typeof payload.iat !== "number" || payload.iat > nowSeconds) return null;

  const uid = typeof payload.user_id === "string" ? payload.user_id : typeof payload.sub === "string" ? payload.sub : null;
  return uid && uid.length > 0 ? uid : null;
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

type MenuAvailabilityOverride = {
  unavailable: boolean;
  until?: string | null;
};

type MenuAvailabilityState = {
  overrides: Record<string, MenuAvailabilityOverride>;
  updatedAt?: string | null;
};

function normalizeAvailabilityOverride(raw: unknown): MenuAvailabilityOverride | null {
  if (typeof raw === "boolean") return { unavailable: raw, until: null };
  if (!raw || typeof raw !== "object") return null;
  const data = raw as { unavailable?: unknown; until?: unknown };
  if (typeof data.unavailable !== "boolean") return null;
  let until: string | null | undefined;
  if (data.until === null) {
    until = null;
  } else if (typeof data.until === "string") {
    until = data.until;
  }
  return { unavailable: data.unavailable, ...(until !== undefined ? { until } : {}) };
}

function normalizeAvailabilityMap(raw: unknown): Record<string, MenuAvailabilityOverride> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .map(([key, value]) => {
        const normalized = normalizeAvailabilityOverride(value);
        return normalized ? [key, normalized] : null;
      })
      .filter((entry): entry is [string, MenuAvailabilityOverride] => Boolean(entry))
  );
}

async function readMenuAvailability(env: Env): Promise<MenuAvailabilityState> {
  const response = await firestoreRequest(env, MENU_AVAILABILITY_PATH, { method: "GET" });
  if (!response) {
    return { overrides: {}, updatedAt: null };
  }
  if (response.status === 404) {
    return { overrides: {}, updatedAt: null };
  }
  if (!response.ok) {
    return { overrides: {}, updatedAt: null };
  }
  const doc: any = await response.json().catch(() => null);
  const parsed = fromFirestoreValue({ mapValue: { fields: doc?.fields ?? {} } });
  const overrides = normalizeAvailabilityMap(parsed?.overrides ?? parsed?.availability ?? {});
  const updatedAt = typeof parsed?.updatedAt === "string" ? parsed.updatedAt : null;
  return { overrides, updatedAt };
}

async function writeMenuAvailability(env: Env, map: Record<string, MenuAvailabilityOverride>) {
  const updatedAt = nowIso();
  const payload = {
    overrides: normalizeAvailabilityMap(map),
    updatedAt,
  };
  const encoded = toFirestoreValue(payload);
  const fields = encoded.mapValue?.fields ?? {};
  const response = await firestoreRequest(env, MENU_AVAILABILITY_PATH, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  if (!response || !response.ok) return null;
  return updatedAt;
}

function normalizePrivateKey(key: string) {
  return normalizeFirebasePrivateKey(key);
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
  const adminApp = getAdminApp(env);
  if (!adminApp.ok) return null;
  const serviceAccount: ServiceAccount = {
    client_email: adminApp.app.creds.clientEmail!,
    private_key: adminApp.app.creds.privateKey!,
    project_id: adminApp.app.creds.projectId || undefined,
  };

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

async function getGoogleAccessTokenDetailed(
  env: Env,
  scope: string,
  requestHost?: string
): Promise<{ ok: true; token: string } | { ok: false; error: { code?: string; message: string; hint?: string } }> {
  const adminApp = getAdminApp(env, requestHost);
  if (!adminApp.ok) {
    return {
      ok: false,
      error: {
        code: adminApp.error.code,
        message: adminApp.error.message,
        hint: adminApp.error.hint,
      },
    };
  }
  const serviceAccount: ServiceAccount = {
    client_email: adminApp.app.creds.clientEmail!,
    private_key: adminApp.app.creds.privateKey!,
    project_id: adminApp.app.creds.projectId || undefined,
  };

  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);
  if (cached && cached.exp - 60 > now) {
    return { ok: true, token: cached.token };
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

  if (!response.ok) {
    const payload: any = await response.json().catch(() => null);
    const errorCode = payload?.error ? String(payload.error) : `HTTP_${response.status}`;
    const errorMessage = payload?.error_description
      ? String(payload.error_description)
      : payload?.error
      ? String(payload.error)
      : `OAuth token request failed (${response.status}).`;
    const hint =
      errorCode === "invalid_grant"
        ? "Clé privée invalide ou expirée."
        : errorCode === "unauthorized_client"
        ? "Compte de service non autorisé."
        : undefined;
    return { ok: false, error: { code: errorCode, message: errorMessage, hint } };
  }

  const data: any = await response.json().catch(() => null);
  const token = data?.access_token;
  const expiresIn = Number(data?.expires_in ?? 0);
  if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return {
      ok: false,
      error: {
        code: "TOKEN_INVALID",
        message: "Réponse OAuth invalide.",
      },
    };
  }
  tokenCache.set(scope, { token, exp: now + expiresIn });
  return { ok: true, token };
}

function statusNotificationCopy(status: OrderStatus) {
  switch (status) {
    case "RECEIVED":
      return "Commande reçue";
    case "IN_PREPARATION":
      return "En préparation";
    case "OUT_FOR_DELIVERY":
      return "En livraison";
    case "DELIVERED":
      return "Livrée — merci !";
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

async function firestoreRequestDetailed(
  env: Env,
  path: string,
  init?: RequestInit,
  requestHost?: string
): Promise<{ ok: true; response: Response } | { ok: false; error: FirestoreErrorPayload }> {
  const adminApp = getAdminApp(env, requestHost);
  if (!adminApp.ok) {
    return { ok: false, error: adminApp.error };
  }
  const projectId = adminApp.app.creds.projectId || null;
  const accessTokenResult = await getGoogleAccessTokenDetailed(
    env,
    "https://www.googleapis.com/auth/datastore",
    requestHost
  );
  if (!accessTokenResult.ok) {
    return {
      ok: false,
      error: buildFirestoreError(env, {
        code: accessTokenResult.error.code,
        message: accessTokenResult.error.message,
        hint: accessTokenResult.error.hint,
        requestHost,
      }),
    };
  }
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  return {
    ok: true,
    response: await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessTokenResult.token}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    }),
  };
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

function fromFirestoreValue(value: any): any {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("nullValue" in value) return null;
  if ("mapValue" in value) {
    const fields = value.mapValue?.fields ?? {};
    return Object.fromEntries(
      Object.entries(fields).map(([key, child]) => [key, fromFirestoreValue(child)])
    );
  }
  if ("arrayValue" in value) {
    const values = value.arrayValue?.values ?? [];
    return values.map((child: any) => fromFirestoreValue(child));
  }
  return null;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (value: number) => String(value).padStart(2, "0");

function formatIsoDate(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function getBrusselsParts(date: Date) {
  const parts = brusselsFormatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  const hour = Number(lookup.hour);
  const minute = Number(lookup.minute);
  const isoDate = formatIsoDate(year, month, day);
  const utcDate = new Date(Date.UTC(year, month - 1, day, 12, 0));
  return {
    year,
    month,
    day,
    hour,
    minute,
    isoDate,
    dayOfWeek: utcDate.getUTCDay(),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const utcDate = Date.UTC(
    Number(lookup.year),
    Number(lookup.month) - 1,
    Number(lookup.day),
    Number(lookup.hour),
    Number(lookup.minute),
    Number(lookup.second)
  );
  return utcDate - date.getTime();
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string
) {
  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  const offset = timeZoneOffsetMs(utcDate, timeZone);
  return new Date(utcDate.getTime() - offset);
}

function getBrusselsEndOfDayIso(now: Date = new Date()) {
  const parts = getBrusselsParts(now);
  const endUtc = zonedTimeToUtc(parts.year, parts.month, parts.day, 23, 59, 59, 999, BRUSSELS_TIME_ZONE);
  return endUtc.toISOString();
}

function getDayLabel(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0));
  return brusselsWeekdayFormatter.format(date);
}

function minutesFromTime(time: string) {
  const [hour, minute] = time.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function computeEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function addDays(year: number, month: number, day: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0));
  date.setUTCDate(date.getUTCDate() + offset);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getBelgianHolidays(year: number) {
  const easter = computeEasterSunday(year);
  const easterMonday = addDays(year, easter.month, easter.day, 1);
  const ascension = addDays(year, easter.month, easter.day, 39);
  const pentecostMonday = addDays(year, easter.month, easter.day, 50);

  return new Set([
    formatIsoDate(year, 1, 1),
    formatIsoDate(year, 5, 1),
    formatIsoDate(year, 7, 21),
    formatIsoDate(year, 8, 15),
    formatIsoDate(year, 11, 1),
    formatIsoDate(year, 11, 11),
    formatIsoDate(year, 12, 25),
    formatIsoDate(easterMonday.year, easterMonday.month, easterMonday.day),
    formatIsoDate(ascension.year, ascension.month, ascension.day),
    formatIsoDate(pentecostMonday.year, pentecostMonday.month, pentecostMonday.day),
  ]);
}

const belgianHolidayCache = new Map<number, Set<string>>();

function getBelgianHolidaySet(year: number) {
  const cached = belgianHolidayCache.get(year);
  if (cached) return cached;
  const set = getBelgianHolidays(year);
  belgianHolidayCache.set(year, set);
  return set;
}

function isBelgianHoliday(isoDate: string) {
  if (!DATE_RE.test(isoDate)) return false;
  const year = Number(isoDate.slice(0, 4));
  if (!Number.isFinite(year)) return false;
  return getBelgianHolidaySet(year).has(isoDate);
}

function normalizeWeeklyHours(input: any): WeeklyHours {
  const result: WeeklyHours = { ...DEFAULT_WEEKLY_HOURS };
  for (let day = 0; day <= 6; day += 1) {
    const raw = input?.[day] ?? input?.[String(day)];
    if (raw === null) {
      result[day] = null;
      continue;
    }
    if (raw && typeof raw === "object") {
      const start = typeof raw.start === "string" ? raw.start : "";
      const end = typeof raw.end === "string" ? raw.end : "";
      if (TIME_RE.test(start) && TIME_RE.test(end)) {
        result[day] = { start, end };
      }
    }
  }
  return result;
}

function normalizeStoreSettings(input: Partial<StoreSettings> | null): StoreSettings {
  if (!input) {
    return { ...DEFAULT_STORE_SETTINGS, updatedAt: nowIso() };
  }
  const mode = input.mode === "OPEN" || input.mode === "CLOSED" ? input.mode : "AUTO";
  const weeklyHours = normalizeWeeklyHours(input.weeklyHours ?? DEFAULT_WEEKLY_HOURS);
  const autoHolidaysBE = typeof input.autoHolidaysBE === "boolean" ? input.autoHolidaysBE : true;
  const exceptions = Array.isArray(input.exceptions)
    ? input.exceptions
        .map((exception) => ({
          date: String((exception as StoreException).date ?? "").trim(),
          closed: Boolean((exception as StoreException).closed),
        }))
        .filter((exception) => DATE_RE.test(exception.date))
    : [];
  const updatedAt = typeof input.updatedAt === "string" && input.updatedAt ? input.updatedAt : nowIso();
  return {
    mode,
    weeklyHours,
    autoHolidaysBE,
    exceptions,
    updatedAt,
  };
}

async function writeStoreSettings(env: Env, settings: StoreSettings) {
  const result = await writeStoreSettingsDetailed(env, settings);
  if (!result.ok) return null;
  return result.settings;
}

async function writeStoreSettingsDetailed(
  env: Env,
  settings: StoreSettings,
  requestHost?: string
): Promise<{ ok: true; settings: StoreSettings } | { ok: false; error: FirestoreErrorPayload }> {
  const updated = { ...settings, updatedAt: nowIso() };
  const encoded = toFirestoreValue(updated);
  const fields = encoded.mapValue?.fields ?? {};
  const result = await firestoreRequestDetailed(env, STORE_SETTINGS_PATH, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  }, requestHost);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  if (!result.response.ok) {
    const cloned = result.response.clone();
    let message = `Firestore ${result.response.status}`;
    let code: string | undefined;
    try {
      const payload: any = await cloned.json();
      if (payload?.error) {
        code = payload.error.status
          ? String(payload.error.status)
          : payload.error.code
          ? String(payload.error.code)
          : undefined;
        message = payload.error.message ? String(payload.error.message) : JSON.stringify(payload.error);
      } else if (payload) {
        message = JSON.stringify(payload);
      }
    } catch {
      const text = await cloned.text().catch(() => "");
      if (text) message = text;
    }
    return {
      ok: false,
      error: buildFirestoreError(env, {
        code,
        message,
        hint: "Vérifiez les permissions du compte de service Firestore.",
        requestHost,
      }),
    };
  }
  return { ok: true, settings: updated };
}

async function getOrInitStoreSettings(env: Env): Promise<StoreSettings> {
  const response = await firestoreRequest(env, STORE_SETTINGS_PATH, { method: "GET" });
  if (!response) {
    return { ...DEFAULT_STORE_SETTINGS, updatedAt: nowIso() };
  }
  if (response.status === 404) {
    const created = await writeStoreSettings(env, { ...DEFAULT_STORE_SETTINGS, updatedAt: nowIso() });
    return created ?? { ...DEFAULT_STORE_SETTINGS, updatedAt: nowIso() };
  }
  if (!response.ok) {
    return { ...DEFAULT_STORE_SETTINGS, updatedAt: nowIso() };
  }
  const doc: any = await response.json().catch(() => null);
  const parsed = fromFirestoreValue({ mapValue: { fields: doc?.fields ?? {} } });
  return normalizeStoreSettings(parsed ?? null);
}

function isDateClosed(settings: StoreSettings, isoDate: string) {
  if (settings.exceptions.some((exception) => exception.closed && exception.date === isoDate)) {
    return true;
  }
  if (settings.autoHolidaysBE && isBelgianHoliday(isoDate)) {
    return true;
  }
  return false;
}

function getNextOpenSlot(
  settings: StoreSettings,
  nowParts: ReturnType<typeof getBrusselsParts>,
  nowMinutes: number
) {
  const todaySchedule = settings.weeklyHours[nowParts.dayOfWeek];
  if (todaySchedule && !isDateClosed(settings, nowParts.isoDate)) {
    const startMinutes = minutesFromTime(todaySchedule.start);
    if (startMinutes != null && nowMinutes < startMinutes) {
      return { dayOffset: 0, schedule: todaySchedule, parts: nowParts };
    }
  }

  const baseDate = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day, 12, 0));
  for (let offset = 1; offset <= 7; offset += 1) {
    const nextDate = new Date(baseDate);
    nextDate.setUTCDate(baseDate.getUTCDate() + offset);
    const nextParts = getBrusselsParts(nextDate);
    if (isDateClosed(settings, nextParts.isoDate)) continue;
    const schedule = settings.weeklyHours[nextParts.dayOfWeek];
    if (!schedule) continue;
    return { dayOffset: offset, schedule, parts: nextParts };
  }

  return null;
}

function buildNextOpenLabel(nextOpen: ReturnType<typeof getNextOpenSlot>) {
  if (!nextOpen) return "Ouvre prochainement";
  const { dayOffset, schedule, parts } = nextOpen;
  if (dayOffset === 0) {
    return `Ouvre aujourd'hui à ${schedule.start}`;
  }
  if (dayOffset === 1) {
    return `Ouvre demain à ${schedule.start}`;
  }
  return `Ouvre ${getDayLabel(parts.year, parts.month, parts.day)} à ${schedule.start}`;
}

function resolveStoreStatus(settings: StoreSettings, now: Date = new Date()): StoreStatusResponse {
  const parts = getBrusselsParts(now);
  const schedule = settings.weeklyHours[parts.dayOfWeek];
  const nowMinutes = parts.hour * 60 + parts.minute;
  const isHolidayToday = settings.autoHolidaysBE && isBelgianHoliday(parts.isoDate);
  const isExceptionClosed = settings.exceptions.some(
    (exception) => exception.closed && exception.date === parts.isoDate
  );

  if (settings.mode === "OPEN") {
    return { isOpen: true, statusLabel: "Ouvert", detail: "Override gérant", mode: settings.mode };
  }

  if (settings.mode === "CLOSED") {
    const nextOpen = getNextOpenSlot(settings, parts, nowMinutes);
    const detail = nextOpen ? buildNextOpenLabel(nextOpen) : "Fermé actuellement";
    return { isOpen: false, statusLabel: "Fermé", detail, mode: settings.mode };
  }

  if (isExceptionClosed) {
    const nextOpen = getNextOpenSlot(settings, parts, nowMinutes);
    return {
      isOpen: false,
      statusLabel: "Fermé",
      detail: nextOpen ? buildNextOpenLabel(nextOpen) : "Fermé actuellement",
      mode: settings.mode,
    };
  }

  if (isHolidayToday) {
    return {
      isOpen: false,
      statusLabel: "Fermé",
      detail: "Férié",
      mode: settings.mode,
    };
  }

  const startMinutes = schedule ? minutesFromTime(schedule.start) : null;
  const endMinutes = schedule ? minutesFromTime(schedule.end) : null;
  const isOpen =
    Boolean(schedule) &&
    startMinutes != null &&
    endMinutes != null &&
    nowMinutes >= startMinutes &&
    nowMinutes < endMinutes;

  if (isOpen && schedule) {
    return {
      isOpen: true,
      statusLabel: "Ouvert",
      detail: `Ferme à ${schedule.end}`,
      mode: settings.mode,
    };
  }

  const nextOpen = getNextOpenSlot(settings, parts, nowMinutes);
  return {
    isOpen: false,
    statusLabel: "Fermé",
    detail: nextOpen ? buildNextOpenLabel(nextOpen) : "Fermé actuellement",
    mode: settings.mode,
  };
}

function validateStoreSettingsPayload(body: any):
  | { ok: true; settings: StoreSettings }
  | { ok: false; error: string; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "INVALID_JSON", message: "Body invalide." };
  }
  const mode = body.mode === "OPEN" || body.mode === "CLOSED" ? body.mode : body.mode === "AUTO" ? "AUTO" : null;
  if (!mode) {
    return { ok: false, error: "MODE_INVALID", message: "Mode invalide." };
  }
  if (body.weeklyHours != null && typeof body.weeklyHours !== "object") {
    return { ok: false, error: "WEEKLY_HOURS_INVALID", message: "Horaires hebdomadaires invalides." };
  }
  const holidayEnabled =
    typeof body.autoHolidaysBE === "boolean"
      ? body.autoHolidaysBE
      : typeof body.holidayEnabled === "boolean"
      ? body.holidayEnabled
      : null;
  if (holidayEnabled === null) {
    return { ok: false, error: "HOLIDAYS_INVALID", message: "Champ holidayEnabled invalide." };
  }
  const weeklyHours: WeeklyHours = { ...DEFAULT_WEEKLY_HOURS };
  for (let day = 0; day <= 6; day += 1) {
    const raw = body.weeklyHours?.[day] ?? body.weeklyHours?.[String(day)];
    if (raw === undefined) {
      weeklyHours[day] = DEFAULT_WEEKLY_HOURS[day];
      continue;
    }
    if (raw === null) {
      weeklyHours[day] = null;
      continue;
    }
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "WEEKLY_HOURS_INVALID", message: "Horaires hebdomadaires invalides." };
    }
    const start = typeof raw.start === "string" ? raw.start.trim() : "";
    const end = typeof raw.end === "string" ? raw.end.trim() : "";
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) {
      return { ok: false, error: "WEEKLY_HOURS_INVALID", message: "Format horaire invalide." };
    }
    weeklyHours[day] = { start, end };
  }
  if (body.exceptions != null && !Array.isArray(body.exceptions)) {
    return { ok: false, error: "EXCEPTIONS_INVALID", message: "Liste d'exceptions invalide." };
  }
  const exceptionsInput = Array.isArray(body.exceptions) ? body.exceptions : [];
  const exceptions: StoreException[] = [];
  for (const entry of exceptionsInput) {
    const date = typeof entry?.date === "string" ? entry.date.trim() : "";
    const closed = typeof entry?.closed === "boolean" ? entry.closed : false;
    if (!DATE_RE.test(date)) {
      return { ok: false, error: "EXCEPTION_DATE_INVALID", message: "Date d'exception invalide." };
    }
    exceptions.push({ date, closed });
  }
  return {
    ok: true,
    settings: {
      mode,
      weeklyHours,
      autoHolidaysBE: holidayEnabled,
      exceptions,
      updatedAt: nowIso(),
    },
  };
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
        notes: toFirestoreValue(order.notes ?? null),
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

async function upsertUserFcmToken(env: Env, uid: string, token: string, userAgent?: string | null) {
  const response = await firestoreRequest(env, `users/${uid}/fcmTokens/${token}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        createdAt: toFirestoreValue(nowIso()),
        platform: toFirestoreValue("web"),
        userAgent: toFirestoreValue(userAgent ?? ""),
      },
    }),
  });
  if (!response || response.ok) return;
  throw new Error("Firestore token upsert failed");
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

function validateItemsCents(items: any): { items: NormalizedItem[] } | { error: string; message: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: "ITEMS_INVALID", message: "items must be a non-empty array" };
  }

  const normalized: NormalizedItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const name = String(it?.name ?? "").trim();
    const quantity = Number(it?.quantity ?? 1);
    const price = Number(it?.price);

    if (!name) return { error: "ITEM_NAME_MISSING", message: `items[${i}].name missing` };
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
      return { error: "ITEM_QTY_INVALID", message: `items[${i}].quantity must be integer > 0` };
    }
    if (!Number.isFinite(price) || price <= 0) {
      return { error: "ITEM_PRICE_INVALID", message: `items[${i}].price must be integer cents > 0` };
    }
    if (!Number.isInteger(price)) {
      if (price < 100) {
        return { error: "INVALID_PRICE_UNITS", message: "Prices must be cents integers" };
      }
      return { error: "ITEM_PRICE_INVALID", message: `items[${i}].price must be integer cents > 0` };
    }

    normalized.push({ name, quantity, cents: price });
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

type StoreMode = "AUTO" | "OPEN" | "CLOSED";

type WeeklyHours = Record<number, { start: string; end: string } | null>;

type StoreException = {
  date: string;
  closed: boolean;
};

type StoreSettings = {
  mode: StoreMode;
  weeklyHours: WeeklyHours;
  autoHolidaysBE: boolean;
  exceptions: StoreException[];
  updatedAt: string;
};

type StoreStatusResponse = {
  isOpen: boolean;
  statusLabel: "Ouvert" | "Fermé";
  detail: string;
  nextChangeAt?: string;
  mode: StoreMode;
};

const DEFAULT_WEEKLY_HOURS: WeeklyHours = {
  0: { start: "16:30", end: "23:00" },
  1: null,
  2: { start: "11:30", end: "23:00" },
  3: { start: "11:30", end: "23:00" },
  4: { start: "11:30", end: "23:00" },
  5: { start: "11:30", end: "23:00" },
  6: { start: "11:30", end: "23:00" },
};

const DEFAULT_STORE_SETTINGS: StoreSettings = {
  mode: "AUTO",
  weeklyHours: DEFAULT_WEEKLY_HOURS,
  autoHolidaysBE: true,
  exceptions: [],
  updatedAt: "",
};

const brusselsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BRUSSELS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const brusselsWeekdayFormatter = new Intl.DateTimeFormat("fr-BE", {
  timeZone: BRUSSELS_TIME_ZONE,
  weekday: "short",
});

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
  notes?: string;
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
    notes: normalized.notes || undefined,
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

async function handleRequest(request: Request, env: Env | undefined, ctx: ExecutionContext | undefined) {
  const requestInfo = getRequestInfo(request);
  const jsonResponse = (data: any, status = 200, headers: Record<string, string> = {}) =>
    json(data, status, headers, requestInfo);
  const requestOriginHeader = request.headers.get("Origin");
  const requestOrigin = normalizeOrigin(requestOriginHeader);
  const cors = corsHeadersFor(requestOrigin);
  if (!isEnvAvailable(env)) {
    return jsonResponse(
      {
        error: "ENV_NOT_PASSED_TO_WORKER",
        message: "Env non transmis au Worker.",
      },
      500,
      cors
    );
  }
  const origin = env.DEFAULT_ORIGIN ?? FALLBACK_ORIGIN;
  const envSummary = listEnvKeys(env);
  const firebasePresence = getFirebasePresence(env);
  console.log("WORKER_ENV_DIAGNOSTIC", {
    workerBuildId: WORKER_BUILD_ID,
    requestHost: requestInfo.host,
    firebasePresence,
    envKeysCount: envSummary.keys.length,
  });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
      const credentials = resolveFirebaseCredentials(env);
      const hasProjectId = Boolean(credentials?.projectId);
      const hasServiceAccount = Boolean(credentials?.clientEmail && credentials?.privateKey);
      const firebaseEnvPresence = {
        hasProjectId: isEnvValuePresent(env.FIREBASE_PROJECT_ID),
        hasClientEmail: isEnvValuePresent(env.FIREBASE_CLIENT_EMAIL),
        hasPrivateKey: isEnvValuePresent(env.FIREBASE_PRIVATE_KEY),
        hasServiceJson: isEnvValuePresent(env.FIREBASE_SERVICE_ACCOUNT_JSON),
        hasServiceJsonB64: Boolean(
          isEnvValuePresent(env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64) || isEnvValuePresent(env.FIREBASE_SERVICE_ACCOUNT_BASE64)
        ),
        resolvedProjectId: credentials?.projectId ?? null,
        source: credentials.source,
        missing: credentials.missing,
      };
      return jsonResponse(
        {
          ok: true,
          hasOrdersKV: hasOrdersKv(env),
          hasStripeSecret: hasStripeSecret(env),
          hasWebhookSecret: hasWebhookSecret(env),
          hasFirebaseProjectId: hasProjectId,
          hasFirebaseServiceAccount: hasServiceAccount,
          origin,
          workerBuild: WORKER_BUILD_ID,
          workerBuildId: WORKER_BUILD_ID,
          requestHost: requestInfo.host,
          requestUrl: requestInfo.url,
          requestOriginHeader,
          normalizedOrigin: requestOrigin,
          envKeys: envSummary.keys,
          firebasePresence,
          firebaseEnvPresence,
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
        return jsonResponse({ error: "FIREBASE_CONFIG_MISSING" }, 500, cors);
      }
      return jsonResponse(
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

    if (request.method === "GET" && url.pathname === "/public/store-status") {
      const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
      if (firestoreGuard) return firestoreGuard;
      const settings = await getOrInitStoreSettings(env);
      const status = resolveStoreStatus(settings);
      return jsonResponse(status, 200, cors);
    }

    if (request.method === "GET" && url.pathname === "/__/debug/firebase") {
      const isDev = isDevEnvironment(env);
      const adminPin = extractAdminPin(request, url);
      if (!isDev && !isAdminPinValid(env, adminPin)) {
        return jsonResponse({ error: "UNAUTHORIZED", message: "Accès refusé." }, 401, cors);
      }
      const credentials = resolveFirebaseCredentials(env);
      const ok =
        !credentials.missing.projectId && !credentials.missing.clientEmail && !credentials.missing.privateKey;
      const diagnosis = (() => {
        const noVarsVisible = Object.values(firebasePresence).every((value) => !value);
        if (noVarsVisible) return "NO_FIREBASE_VARS_VISIBLE";
        if (isServiceJsonVisible(env) && !credentials.serviceJsonParsed) return "SERVICE_JSON_VISIBLE_BUT_INVALID";
        if (credentials.missing.clientEmail || credentials.missing.privateKey) return "PARTIAL_CREDS";
        return "OK";
      })();
      return jsonResponse(
        {
          ok,
          missing: credentials.missing,
          source: credentials.source,
          envKeys: envSummary.keys,
          firebasePresence,
          workerBuild: WORKER_BUILD_ID,
          requestHost: requestInfo.host,
          debug: buildFirebaseDebugInfo(env, credentials, requestInfo.host),
          firebaseCredentialsResolved: {
            projectId: credentials.projectId ?? null,
            clientEmail: credentials.clientEmail ?? null,
            missing: credentials.missing,
            source: credentials.source,
            diagnosis,
          },
          resolvedFirebaseCreds: {
            source: credentials.source,
            missing: credentials.missing,
            diagnosis,
          },
        },
        200,
        cors
      );
    }

    if (request.method === "GET" && url.pathname === "/admin/store-settings") {
      const auth = await verifyAdminRequest(request, env);
      if (!auth.ok) {
        return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
      }
      const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
      if (firestoreGuard) return firestoreGuard;
      const settings = await getOrInitStoreSettings(env);
      return jsonResponse(settings, 200, cors);
    }

    if (request.method === "GET" && url.pathname === "/admin/debug/firebase-env") {
      const auth = await verifyAdminRequest(request, env);
      if (!auth.ok) {
        return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
      }
      const credentials = resolveFirebaseCredentials(env);
      const hasServiceJson = !credentials.missing.serviceJson;
      const hasClientEmail = Boolean(credentials?.clientEmail);
      const hasPrivateKey = Boolean(credentials?.privateKey);
      const hasProjectId = Boolean(credentials?.projectId);
      return jsonResponse(
        {
          ok: true,
          receivedEnv: true,
          hasProjectId,
          hasClientEmail,
          hasPrivateKey,
          hasServiceJson,
        },
        200,
        cors
      );
    }

    if (request.method === "POST" && url.pathname === "/admin/store-settings") {
      const auth = await verifyAdminRequest(request, env);
      if (!auth.ok) {
        return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
      }
      const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
      if (firestoreGuard) return firestoreGuard;
      try {
        let body: any = null;
        try {
          body = await request.json();
        } catch (err) {
          return jsonResponse(
            { message: "Body invalide.", details: serializeError(err) },
            400,
            cors
          );
        }
        const validation = validateStoreSettingsPayload(body);
        if (!validation.ok) {
          return jsonResponse(
            { message: validation.message, details: { error: validation.error } },
            400,
            cors
          );
        }
        const saved = await writeStoreSettingsDetailed(env, validation.settings, requestInfo.host);
        if (!saved.ok) {
          console.error("Firestore store settings write failed", saved);
          return jsonResponse(
            saved.error,
            500,
            cors
          );
        }
        return jsonResponse(saved.settings, 200, cors);
      } catch (err) {
        console.error("Firestore store settings error", err);
        const details = err instanceof Error ? `${err.message}${err.stack ? `\n${err.stack}` : ""}` : String(err);
        return jsonResponse(
          buildFirestoreError(env, {
            code: "FIRESTORE_EXCEPTION",
            message: "Erreur Firestore",
            hint: details,
            requestHost: requestInfo.host,
          }),
          500,
          cors
        );
      }
    }

    try {
      if (!hasOrdersKv(env)) {
        return jsonResponse({ error: "SERVER_MISCONFIGURED", details: "ORDERS_KV not bound" }, 500, cors);
      }

      if (request.method === "POST" && url.pathname === "/create-cash-order") {
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const body: any = await request.json().catch(() => null);
        if (!body) return jsonResponse({ error: "INVALID_JSON" }, 400, cors);

        const storeStatus = resolveStoreStatus(await getOrInitStoreSettings(env));
        if (!storeStatus.isOpen) {
          return jsonResponse(
            { error: "STORE_CLOSED", message: `Snack fermé actuellement. ${storeStatus.detail}` },
            403,
            cors
          );
        }

        const validation = validateItems(body.items);
        if ("error" in validation) return jsonResponse(validation, 400, cors);

        const desiredDeliveryAtRaw = typeof body.desiredDeliveryAt === "string" ? body.desiredDeliveryAt : null;
        const desiredDeliverySlotLabelRaw =
          typeof body.desiredDeliverySlotLabel === "string" ? body.desiredDeliverySlotLabel.trim() : null;
        if (desiredDeliveryAtRaw && Number.isNaN(Date.parse(desiredDeliveryAtRaw))) {
          return jsonResponse({ error: "INVALID_SCHEDULE", message: "desiredDeliveryAt invalide." }, 400, cors);
        }
        const notes = sanitizeNotes(body.notes);

        const firebaseIdToken =
          (typeof body.firebaseIdToken === "string" && body.firebaseIdToken.trim()) || extractBearerToken(request);
        let userUid: string | undefined;
        if (firebaseIdToken) {
          const apiKey = getFirebaseApiKey(env);
          if (!apiKey) {
            return jsonResponse({ error: "SERVER_MISCONFIGURED", message: "FIREBASE_API_KEY manquant." }, 500, cors);
          }
          const uid = await lookupFirebaseUid(firebaseIdToken, apiKey);
          if (!uid) {
            return jsonResponse({ error: "UNAUTHORIZED", message: "Token Firebase invalide." }, 401, cors);
          }
          userUid = uid;
        }

        // Minimum 20€ hors livraison
        const sub = subtotalCents(validation.items);
        if (sub < MIN_ORDER_CENTS) {
          return jsonResponse(
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
          return jsonResponse({ error: "DELIVERY_ADDRESS_REQUIRED", message: "Adresse de livraison obligatoire." }, 400, cors);
        }
        if (!Number.isFinite(deliveryLat) || !Number.isFinite(deliveryLng)) {
          return jsonResponse(
            { error: "DELIVERY_POSITION_REQUIRED", message: "Position obligatoire (géolocalisation)." },
            400,
            cors
          );
        }

        // Zone 10km
        const km = distanceKm(SHOP_LAT, SHOP_LNG, deliveryLat, deliveryLng);
        if (km > MAX_DELIVERY_KM) {
          return jsonResponse(
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
          notes,
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
        return jsonResponse({ orderId, publicOrderUrl, adminHubUrl }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/create-checkout-session") {
        const requestId = crypto.randomUUID();
        try {
          const stripeSecret = getStripeSecret(env);
          if (!stripeSecret) {
            return jsonResponse({ error: "MISSING_STRIPE_SECRET", message: "Stripe secret missing" }, 500, cors);
          }
          const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
          if (firestoreGuard) return firestoreGuard;

          const body: any = await request.json().catch(() => null);
          if (!body) return jsonResponse({ error: "INVALID_JSON" }, 400, cors);

          const storeStatus = resolveStoreStatus(await getOrInitStoreSettings(env));
          if (!storeStatus.isOpen) {
            return jsonResponse(
              { error: "STORE_CLOSED", message: `Snack fermé actuellement. ${storeStatus.detail}` },
              403,
              cors
            );
          }

          const validation = validateItemsCents(body.items);
          if ("error" in validation) return jsonResponse(validation, 400, cors);

          const desiredDeliveryAtRaw = typeof body.desiredDeliveryAt === "string" ? body.desiredDeliveryAt : null;
          const desiredDeliverySlotLabelRaw =
            typeof body.desiredDeliverySlotLabel === "string" ? body.desiredDeliverySlotLabel.trim() : null;
          if (desiredDeliveryAtRaw && Number.isNaN(Date.parse(desiredDeliveryAtRaw))) {
            return jsonResponse({ error: "INVALID_SCHEDULE", message: "desiredDeliveryAt invalide." }, 400, cors);
          }
          const notes = sanitizeNotes(body.notes);

          const firebaseIdToken =
            (typeof body.firebaseIdToken === "string" && body.firebaseIdToken.trim()) || extractBearerToken(request);
          let userUid: string | undefined;
          if (firebaseIdToken) {
            const apiKey = getFirebaseApiKey(env);
            if (!apiKey) {
              return jsonResponse({ error: "SERVER_MISCONFIGURED", message: "FIREBASE_API_KEY manquant." }, 500, cors);
            }
            const uid = await lookupFirebaseUid(firebaseIdToken, apiKey);
            if (!uid) {
              return jsonResponse({ error: "UNAUTHORIZED", message: "Token Firebase invalide." }, 401, cors);
            }
            userUid = uid;
          }

          // Minimum 20€ hors livraison
          const sub = subtotalCents(validation.items);
          if (sub < MIN_ORDER_CENTS) {
            return jsonResponse(
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
            return jsonResponse(
              { error: "DELIVERY_ADDRESS_REQUIRED", message: "Adresse de livraison obligatoire." },
              400,
              cors
            );
          }
          if (!Number.isFinite(deliveryLat) || !Number.isFinite(deliveryLng)) {
            return jsonResponse(
              { error: "DELIVERY_POSITION_REQUIRED", message: "Position obligatoire (géolocalisation)." },
              400,
              cors
            );
          }

          // Zone 10km
          const km = distanceKm(SHOP_LAT, SHOP_LNG, deliveryLat, deliveryLng);
          if (km > MAX_DELIVERY_KM) {
            return jsonResponse(
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
            notes,
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
            stripeSecretKey: stripeSecret,
            orderId,
            deliveryAddress,
            deliveryLat,
            deliveryLng,
            distance: km,
          });

          if (!result.ok) {
            return jsonResponse({ error: "STRIPE_API_ERROR", status: result.status, details: result.stripe }, 502, cors);
          }

          if (!result.session?.url) {
            return jsonResponse({ error: "STRIPE_NO_URL", details: result.session }, 502, cors);
          }

          order.stripeCheckoutSessionId = result.session.id;
          await saveOrder(env, order);
          await env.ORDERS_KV!.put(`order:session:${result.session.id}`, orderId);

          return jsonResponse(
            { url: result.session.url, sessionId: result.session.id, orderId, publicOrderUrl, adminHubUrl },
            200,
            cors
          );
        } catch (error: unknown) {
          const serialized = serializeError(error);
          const errorObj = error as { type?: string; code?: string; statusCode?: number; message?: string } | null;
          const type = errorObj?.type;
          const code = errorObj?.code;
          const statusCode = errorObj?.statusCode;
          const isStripeError = Boolean(type && String(type).toLowerCase().includes("stripe"));
          console.error("CHECKOUT_SESSION_ERROR", { requestId, error: serialized });

          if (isStripeError) {
            const message = errorObj?.message || serialized.message || "Stripe error";
            return jsonResponse(
              { error: "STRIPE_ERROR", message, details: { type, code, statusCode } },
              Number.isInteger(statusCode) ? Number(statusCode) : 502,
              cors
            );
          }

          return jsonResponse(
            { error: "WORKER_ERROR", message: "Internal worker error", requestId },
            500,
            cors
          );
        }
      }

      if (request.method === "POST" && url.pathname === "/stripe-webhook") {
        if (!hasWebhookSecret(env)) {
          return jsonResponse({ error: "SERVER_MISCONFIGURED", details: "Missing STRIPE_WEBHOOK_SECRET" }, 500, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;

        const signature = request.headers.get("Stripe-Signature") || "";
        const rawBody = await request.text();
        const isValid = await verifyStripeSignature(rawBody, signature, String(env.STRIPE_WEBHOOK_SECRET));
        if (!isValid) {
          return jsonResponse({ error: "INVALID_SIGNATURE" }, 400, cors);
        }

        let event: any = null;
        try {
          event = JSON.parse(rawBody);
        } catch {
          return jsonResponse({ error: "INVALID_PAYLOAD" }, 400, cors);
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

        return jsonResponse({ ok: true }, 200, cors);
      }

      if (request.method === "GET" && (url.pathname === "/menu/availability" || url.pathname === "/store/menu-availability")) {
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const state = await readMenuAvailability(env);
        return jsonResponse(
          {
            ok: true,
            availability: state.overrides,
            updatedAt: state.updatedAt ?? undefined,
          },
          200,
          cors
        );
      }

      if (request.method === "POST" && url.pathname === "/admin/login") {
        const adminPin = getAdminPin(env);
        const secret = getAdminSigningSecret(env);
        if (!adminPin || !secret) {
          return jsonResponse({ error: "ADMIN_DISABLED", message: "Admin PIN or signing secret not configured." }, 403, cors);
        }

        const rate = await registerLoginAttempt(env, getClientIp(request));
        if (!rate.allowed) {
          return jsonResponse(
            { error: "RATE_LIMITED", message: "Trop de tentatives. Réessayez plus tard." },
            429,
            { ...cors, "Retry-After": String(rate.retryAfter ?? 30) }
          );
        }

        const body: any = await request.json().catch(() => null);
        if (!body) return jsonResponse({ error: "INVALID_JSON" }, 400, cors);
        const pin = String(body.pin ?? "").trim();
        if (!pin || !isAdminPinValid(env, pin)) {
          return jsonResponse({ error: "UNAUTHORIZED", message: "Code gérant invalide." }, 401, cors);
        }

        const token = await createAdminToken(secret);
        return jsonResponse({ token, expiresIn: ADMIN_TOKEN_TTL_MS }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/admin/menu/availability") {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const state = await readMenuAvailability(env);
        return jsonResponse(
          {
            ok: true,
            availability: state.overrides,
            updatedAt: state.updatedAt ?? undefined,
          },
          200,
          cors
        );
      }

      if (request.method === "POST" && url.pathname === "/admin/menu-availability") {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const body: any = await request.json().catch(() => null);
        const itemKey = typeof body?.itemKey === "string" ? body.itemKey.trim() : "";
        const mode = typeof body?.mode === "string" ? body.mode.trim().toUpperCase() : "";
        if (!itemKey) {
          return jsonResponse({ error: "ITEM_KEY_REQUIRED", message: "Item key requis." }, 400, cors);
        }
        if (mode !== "AVAILABLE" && mode !== "TODAY" && mode !== "MANUAL") {
          return jsonResponse({ error: "INVALID_MODE", message: "Mode invalide." }, 400, cors);
        }
        const state = await readMenuAvailability(env);
        const nextMap = { ...state.overrides };
        if (mode === "AVAILABLE") {
          delete nextMap[itemKey];
        } else if (mode === "TODAY") {
          nextMap[itemKey] = { unavailable: true, until: getBrusselsEndOfDayIso() };
        } else {
          nextMap[itemKey] = { unavailable: true, until: null };
        }
        const updatedAt = await writeMenuAvailability(env, nextMap);
        return jsonResponse(
          {
            ok: true,
            itemKey,
            mode,
            updatedAt: updatedAt ?? undefined,
          },
          200,
          cors
        );
      }

      if (request.method === "POST" && url.pathname.startsWith("/admin/menu/items/")) {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const match = url.pathname.match(/^\/admin\/menu\/items\/(.+)$/);
        const itemId = match?.[1] ? decodeURIComponent(match[1]) : "";
        if (!itemId) return jsonResponse({ error: "ITEM_ID_REQUIRED", message: "Item id requis." }, 400, cors);

        const body: any = await request.json().catch(() => null);
        if (!body || typeof body.unavailable !== "boolean") {
          return jsonResponse({ error: "INVALID_JSON", message: "Champ unavailable requis." }, 400, cors);
        }

        const state = await readMenuAvailability(env);
        const nextMap = { ...state.overrides };
        if (body.unavailable) {
          nextMap[itemId] = { unavailable: true, until: null };
        } else {
          delete nextMap[itemId];
        }
        const updatedAt = await writeMenuAvailability(env, nextMap);
        return jsonResponse({ ok: true, itemId, unavailable: body.unavailable, updatedAt: updatedAt ?? undefined }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/admin/menu/reset") {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const updatedAt = await writeMenuAvailability(env, {});
        return jsonResponse({ ok: true, availability: {}, updatedAt: updatedAt ?? undefined }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/admin/orders") {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
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

        return jsonResponse({ orders: summaries, cursor: listing.cursor }, 200, cors);
      }

      if (request.method === "GET" && url.pathname.startsWith("/admin/orders/")) {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
        }
        const match = url.pathname.match(/^\/admin\/orders\/([^/]+)$/);
        const orderId = match?.[1];
        if (!orderId) return jsonResponse({ error: "ORDER_ID_REQUIRED" }, 400, cors);

        const order = await readOrder(env, orderId);
        if (!order) return jsonResponse({ error: "ORDER_NOT_FOUND" }, 404, cors);
        normalizeOrderStatus(order);

        return jsonResponse(
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
          return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const match = url.pathname.match(/^\/admin\/orders\/([^/]+)\/status$/);
        const orderId = match?.[1];
        if (!orderId) return jsonResponse({ error: "ORDER_ID_REQUIRED" }, 400, cors);

        const body: any = await request.json().catch(() => null);
        if (!body) return jsonResponse({ error: "INVALID_JSON" }, 400, cors);

        const status = String(body.status ?? "").trim() as OrderStatus;
        const allowed: OrderStatus[] = ["IN_PREPARATION", "OUT_FOR_DELIVERY", "DELIVERED"];
        if (!allowed.includes(status)) {
          return jsonResponse({ error: "INVALID_STATUS" }, 400, cors);
        }

        const order = await readOrder(env, orderId);
        if (!order) return jsonResponse({ error: "ORDER_NOT_FOUND" }, 404, cors);

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

        return jsonResponse({ ok: true, summary: buildOrderSummary(order) }, 200, cors);
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/admin/orders/")) {
        const auth = await verifyAdminRequest(request, env);
        if (!auth.ok) {
          return jsonResponse({ error: auth.error, message: auth.message }, 401, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const match = url.pathname.match(/^\/admin\/orders\/([^/]+)$/);
        const orderId = match?.[1];
        if (!orderId) return jsonResponse({ error: "ORDER_ID_REQUIRED" }, 400, cors);

        const order = await readOrder(env, orderId);
        if (!order) return jsonResponse({ error: "ORDER_NOT_FOUND" }, 404, cors);

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

        return jsonResponse({ ok: true }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/admin/order-action") {
        const secret = getAdminSigningSecret(env);
        const pinSecret = getAdminPin(env);
        if (!pinSecret || !secret) {
          return jsonResponse({ error: "ADMIN_DISABLED", message: "Admin PIN or signing secret not configured." }, 403, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;

        const body: any = await request.json().catch(() => null);
        if (!body) return jsonResponse({ error: "INVALID_JSON" }, 400, cors);

        const orderId = String(body.orderId ?? "").trim();
        const action = String(body.action ?? "").trim() as "OPEN" | "DELIVERED";
        const exp = Number(body.exp);
        const sig = String(body.sig ?? "").trim();
        const pin = String(body.pin ?? "").trim();

        if (!orderId) return jsonResponse({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        if (!Number.isFinite(exp)) return jsonResponse({ error: "EXP_INVALID" }, 400, cors);
        if (!sig) return jsonResponse({ error: "SIG_REQUIRED" }, 400, cors);
        if (Date.now() > exp) return jsonResponse({ error: "LINK_EXPIRED" }, 400, cors);
        if (!pin || pin !== pinSecret) return jsonResponse({ error: "PIN_INVALID" }, 403, cors);
        if (action !== "OPEN" && action !== "DELIVERED") return jsonResponse({ error: "INVALID_ACTION" }, 400, cors);

        const purpose = action === "OPEN" ? "ADMIN_HUB" : "ADMIN_DELIVER";
        const isValidSig = await verifyAdmin(secret, orderId, exp, sig, purpose);
        if (!isValidSig) return jsonResponse({ error: "INVALID_SIGNATURE" }, 401, cors);

        const order = await readOrder(env, orderId);
        if (!order) return jsonResponse({ error: "ORDER_NOT_FOUND" }, 404, cors);

        normalizeOrderStatus(order);
        const rank = statusRank(order.status);

        if (action === "OPEN") {
          if (rank > 1) {
            return jsonResponse({ error: "STATUS_LOCKED", message: "Commande déjà en cours de livraison ou livrée." }, 409, cors);
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

          return jsonResponse(
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
          return jsonResponse({ error: "STATUS_NOT_READY", message: "Commande pas encore en préparation." }, 409, cors);
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

        return jsonResponse(
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
          return jsonResponse({ error: "ADMIN_PIN_MISSING", message: "ADMIN_PIN not configured." }, 500, cors);
        }
        const pin = extractAdminPin(request, url);
        if (!isAdminPinValid(env, pin)) {
          return jsonResponse({ error: "UNAUTHORIZED", message: "Admin PIN required." }, 401, cors);
        }
        const limit = Number(url.searchParams.get("limit") ?? "30");
        const orders = await listOrders(env, Number.isFinite(limit) ? Math.max(1, Math.min(limit, 50)) : 30);
        return jsonResponse(
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
          return jsonResponse({ error: "ADMIN_PIN_MISSING", message: "ADMIN_PIN not configured." }, 500, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const match = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/status$/);
        const orderId = match?.[1];
        if (!orderId) return jsonResponse({ error: "ORDER_ID_REQUIRED" }, 400, cors);

        const body: any = await request.json().catch(() => null);
        if (!body) return jsonResponse({ error: "INVALID_JSON" }, 400, cors);
        const pin = extractAdminPin(request, url) || body.pin;
        if (!isAdminPinValid(env, pin)) {
          return jsonResponse({ error: "UNAUTHORIZED", message: "Admin PIN required." }, 401, cors);
        }

        const status = String(body.status ?? "").trim() as OrderStatus;
        const allowed: OrderStatus[] = ["IN_PREPARATION", "OUT_FOR_DELIVERY", "DELIVERED"];
        if (!allowed.includes(status)) {
          return jsonResponse({ error: "INVALID_STATUS" }, 400, cors);
        }

        const order = await readOrder(env, orderId);
        if (!order) return jsonResponse({ error: "ORDER_NOT_FOUND" }, 404, cors);

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

        return jsonResponse(
          { ok: true, status: order.status },
          200,
          cors
        );
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/api/admin/orders/")) {
        if (!getAdminPin(env)) {
          return jsonResponse({ error: "ADMIN_PIN_MISSING", message: "ADMIN_PIN not configured." }, 500, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const match = url.pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
        const orderId = match?.[1];
        if (!orderId) return jsonResponse({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        const pin = extractAdminPin(request, url);
        if (!isAdminPinValid(env, pin)) {
          return jsonResponse({ error: "UNAUTHORIZED", message: "Admin PIN required." }, 401, cors);
        }

        const order = await readOrder(env, orderId);
        if (!order) return jsonResponse({ error: "ORDER_NOT_FOUND" }, 404, cors);

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

        return jsonResponse({ ok: true }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/api/my-orders") {
        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({ error: "UNAUTHORIZED", message: "Authorization Bearer requis." }, 401, cors);
        }
        const apiKey = getFirebaseApiKey(env);
        if (!apiKey) {
          return jsonResponse({ error: "SERVER_MISCONFIGURED", message: "FIREBASE_API_KEY manquant." }, 500, cors);
        }
        const uid = await lookupFirebaseUid(token, apiKey);
        if (!uid) {
          return jsonResponse({ error: "UNAUTHORIZED", message: "Token Firebase invalide." }, 401, cors);
        }

        const orderIds = await readUserOrders(env, uid);
        if (orderIds.length === 0) {
          return jsonResponse({ orders: [] }, 200, cors);
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

        return jsonResponse({ orders }, 200, cors);
      }

      if (request.method === "GET" && url.pathname === "/me/orders") {
        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({ error: "UNAUTHORIZED", message: "Authorization Bearer requis." }, 401, cors);
        }
        const uid = await verifyFirebaseIdToken(env, token);
        if (!uid) {
          return jsonResponse({ error: "UNAUTHORIZED", message: "Token Firebase invalide." }, 401, cors);
        }

        const rawLimit = Number(url.searchParams.get("limit") ?? "30");
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 30)) : 30;
        const orderIds = await readUserOrders(env, uid);
        if (orderIds.length === 0) {
          return jsonResponse({ orders: [] }, 200, cors);
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
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, limit);

        return jsonResponse({ orders }, 200, cors);
      }

      if (request.method === "POST" && url.pathname === "/me/push/subscribe") {
        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({ error: "UNAUTHORIZED", message: "Authorization Bearer requis." }, 401, cors);
        }
        const firestoreGuard = requireFirestoreCredentials(env, cors, requestInfo);
        if (firestoreGuard) return firestoreGuard;
        const uid = await verifyFirebaseIdToken(env, token);
        if (!uid) {
          return jsonResponse({ error: "UNAUTHORIZED", message: "Token Firebase invalide." }, 401, cors);
        }
        const body: any = await request.json().catch(() => null);
        const fcmToken = typeof body?.token === "string" ? body.token.trim() : "";
        if (!fcmToken) {
          return jsonResponse({ error: "TOKEN_REQUIRED", message: "Token requis." }, 400, cors);
        }

        await upsertUserFcmToken(env, uid, fcmToken, request.headers.get("User-Agent"));
        return jsonResponse({ ok: true }, 200, cors);
      }

      if (request.method === "GET" && url.pathname.startsWith("/api/orders/")) {
        const orderId = url.pathname.replace("/api/orders/", "").trim();
        if (!orderId) return jsonResponse({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        const order = await readOrder(env, orderId);
        if (!order) return jsonResponse({ error: "ORDER_NOT_FOUND" }, 404, cors);
        normalizeOrderStatus(order);

        return jsonResponse(
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
            notes: order.notes ?? null,
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
        if (!orderId) return jsonResponse({ error: "ORDER_ID_REQUIRED" }, 400, cors);
        const order = await readOrder(env, orderId);
        if (!order) return jsonResponse({ error: "ORDER_NOT_FOUND" }, 404, cors);
        normalizeOrderStatus(order);

        return jsonResponse(
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
            notes: order.notes ?? null,
            desiredDeliveryAt: order.desiredDeliveryAt,
            desiredDeliverySlotLabel: order.desiredDeliverySlotLabel,
          },
          200,
          cors
        );
      }

      if (request.method === "GET" && url.pathname === "/order-by-session") {
        const sessionId = url.searchParams.get("session_id");
        if (!sessionId) return jsonResponse({ error: "SESSION_ID_REQUIRED" }, 400, cors);
        const orderId = await env.ORDERS_KV!.get(`order:session:${sessionId}`);
        if (!orderId) return jsonResponse({ error: "ORDER_NOT_FOUND" }, 404, cors);
        const order = await readOrder(env, orderId);
        if (!order) return jsonResponse({ error: "ORDER_NOT_FOUND" }, 404, cors);
        normalizeOrderStatus(order);
        return jsonResponse({ orderId, status: order.status }, 200, cors);
      }

      return jsonResponse({ error: "NOT_FOUND" }, 404, cors);
    } catch (e: any) {
      return jsonResponse({ error: "WORKER_ERROR", details: e?.message ?? String(e) }, 500, cors);
    }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handleRequest(request, env, ctx);
  },
};
