import Stripe from 'stripe';

interface Env {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  PUBLIC_BASE_URL?: string;
  ALLOWED_ORIGIN?: string;
}

interface CheckoutItem {
  id?: string;
  quantity?: number;
}

const DEFAULT_BASE_URL = 'https://snackfamily2.eu';
const DEFAULT_ALLOWED_ORIGINS = [DEFAULT_BASE_URL, 'https://www.snackfamily2.eu'];

const PRICE_MAP: Record<string, { priceId?: string; currency: string; unit_amount: number; name: string }> = {
  'menu-item': {
    currency: 'eur',
    unit_amount: 1000,
    name: 'Snack Family Order',
  },
};

const API_VERSION: Stripe.StripeConfig['apiVersion'] = '2024-06-20';

const normalizeBase = (input: string) => input.replace(/\/+$/, '');

const getBaseUrl = (env: Env) => {
  const base = env.PUBLIC_BASE_URL && env.PUBLIC_BASE_URL.trim().length > 0
    ? env.PUBLIC_BASE_URL
    : DEFAULT_BASE_URL;

  return normalizeBase(base);
};

const normalizeOrigin = (origin: string | null) => (origin ? origin.replace(/\/+$/, '').toLowerCase() : null);

const getAllowedOrigin = (request: Request, env: Env) => {
  const requestOriginRaw = request.headers.get('origin');
  const requestOrigin = normalizeOrigin(requestOriginRaw);

  const allowlist = env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN.trim().length > 0
    ? [normalizeOrigin(env.ALLOWED_ORIGIN)]
    : DEFAULT_ALLOWED_ORIGINS.map((o) => normalizeOrigin(o));

  const isAllowed = allowlist.some((entry) => entry && entry === requestOrigin);
  return isAllowed ? requestOriginRaw ?? undefined : undefined;
};

const buildCorsHeaders = (origin?: string) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature',
  };

  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
};

const jsonResponse = (body: unknown, status: number, corsHeaders: Record<string, string>) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
};

const normalizeUrl = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.href;
  } catch {
    return null;
  }
};

const getStripeSecret = (env: Env, corsHeaders: Record<string, string>) => {
  const secret = env.STRIPE_SECRET_KEY;

  if (!secret) {
    return {
      error: jsonResponse(
        { error: 'Missing STRIPE_SECRET_KEY (Cloudflare Worker secret)' },
        500,
        corsHeaders,
      ),
    };
  }

  return { secret };
};

const getWebhookSecret = (env: Env, corsHeaders: Record<string, string>) => {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return {
      error: jsonResponse(
        { error: 'Missing STRIPE_WEBHOOK_SECRET (Cloudflare Worker secret)' },
        500,
        corsHeaders,
      ),
    };
  }

  return { webhookSecret };
};

const buildLineItem = (item: CheckoutItem, index: number) => {
  if (!item || typeof item.id !== 'string') {
    throw new Error(`Item ${index + 1} is missing a valid id.`);
  }

  const mapping = PRICE_MAP[item.id];
  if (!mapping) {
    throw new Error(`Item ${index + 1} has unknown id "${item.id}".`);
  }

  const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
    ? Math.trunc(item.quantity)
    : null;

  if (!quantity) {
    throw new Error(`Item ${index + 1} has an invalid quantity.`);
  }

  if (mapping.priceId) {
    return {
      price: mapping.priceId,
      quantity,
    } satisfies Stripe.Checkout.SessionCreateParams.LineItem;
  }

  const productName = mapping.name || 'Order Item';

  return {
    price_data: {
      currency: mapping.currency,
      unit_amount: mapping.unit_amount,
      product_data: {
        name: productName,
      },
    },
    quantity,
  } satisfies Stripe.Checkout.SessionCreateParams.LineItem;
};

const handleCreateCheckoutSession = async (request: Request, env: Env, corsHeaders: Record<string, string>) => {
  const secretResult = getStripeSecret(env, corsHeaders);
  if ('error' in secretResult) return secretResult.error;

  let payload: { items?: CheckoutItem[]; successUrl?: string; cancelUrl?: string };
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400, corsHeaders);
  }

  if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
    return jsonResponse({ error: 'Request must include at least one item.' }, 400, corsHeaders);
  }

  const successUrl = normalizeUrl(payload.successUrl) ?? `${getBaseUrl(env)}/success`;
  const cancelUrl = normalizeUrl(payload.cancelUrl) ?? `${getBaseUrl(env)}/cancel`;

  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  try {
    lineItems = payload.items.map((item, index) => buildLineItem(item, index));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid line items.';
    return jsonResponse({ error: message }, 400, corsHeaders);
  }

  const stripe = new Stripe(secretResult.secret, { apiVersion: API_VERSION });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return jsonResponse({ url: session.url }, 200, corsHeaders);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe session creation failed.';
    return jsonResponse({ error: message }, 500, corsHeaders);
  }
};

const handleWebhook = async (
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  stripeSignature: string | null,
) => {
  const secretResult = getStripeSecret(env, corsHeaders);
  if ('error' in secretResult) return secretResult.error;

  const webhookSecretResult = getWebhookSecret(env, corsHeaders);
  if ('error' in webhookSecretResult) return webhookSecretResult.error;

  const payload = await request.text();

  if (!stripeSignature) {
    return jsonResponse({ error: 'Missing stripe-signature header.' }, 400, corsHeaders);
  }

  const stripe = new Stripe(secretResult.secret, { apiVersion: API_VERSION });

  try {
    const event = stripe.webhooks.constructEvent(payload, stripeSignature, webhookSecretResult.webhookSecret);

    if (event.type === 'checkout.session.completed') {
      // add any future fulfillment here
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook signature verification failed.';
    return jsonResponse({ error: message }, 400, corsHeaders);
  }

  return jsonResponse({ received: true }, 200, corsHeaders);
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const allowedOrigin = getAllowedOrigin(request, env);
    const corsHeaders = buildCorsHeaders(allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const stripeSignature = request.headers.get('stripe-signature');

    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ ok: true }, 200, corsHeaders);
    }

    if (url.pathname === '/create-checkout-session' && request.method === 'POST') {
      return handleCreateCheckoutSession(request, env, corsHeaders);
    }

    if (request.method === 'POST' && (url.pathname === '/webhook' || (url.pathname === '/' && stripeSignature))) {
      return handleWebhook(request, env, corsHeaders, stripeSignature);
    }

    return new Response('Not found', { status: 404, headers: corsHeaders });
  },
};
