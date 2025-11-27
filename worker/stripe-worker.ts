import Stripe from 'stripe';

interface Env {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
  ADMIN_PHONE?: string; // e.g. +32465671893
  ORDERS_KV: KVNamespace;
}

interface CheckoutPayload {
  items?: { name: string; price: number; quantity: number }[];
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}

type OrderRecord = {
  id: string;
  status: string;
  amountTotal: number;
  currency: string;
  items: { name: string; price: number; quantity: number }[];
  customer?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    instructions?: string;
  };
  createdAt: string;
};

const allowedOrigins = ['https://snackfamily2.com', 'https://www.snackfamily2.com', 'http://localhost:5173'];

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'access-control-allow-origin': '*',
      ...extraHeaders,
    },
  });
}

function sanitizeText(value: string, max = 200) {
  const withoutControls = value.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F<>]/g, ' ');
  const cleaned = withoutControls.replace(/\s{2,}/g, ' ').trim();
  return cleaned.slice(0, max);
}

function ensureHttps(url: string) {
  const parsed = new URL(url);
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) {
    throw new Error('Les URLs de redirection doivent être en HTTPS (ou localhost en dev).');
  }
  return parsed.toString();
}

async function handleCreateCheckout(request: Request, env: Env, stripe: Stripe) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      },
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let payload: CheckoutPayload;
  try {
    payload = await request.json();
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    return jsonResponse({ error: 'No items provided' }, 400);
  }

  if (items.length > 100) {
    return jsonResponse({ error: 'Too many items' }, 400);
  }

  const lineItems = items.map((item, index) => {
    const name = sanitizeText(String(item.name || 'Article')) || `Article ${index + 1}`;
    const price = Math.trunc(Number(item.price));
    const quantity = Math.max(1, Math.trunc(Number(item.quantity)) || 1);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid item price');
    }
    return {
      price_data: {
        currency: 'eur',
        product_data: { name },
        unit_amount: price,
      },
      quantity,
    };
  });

  const successUrl = payload.successUrl ? ensureHttps(payload.successUrl) : undefined;
  const cancelUrl = payload.cancelUrl ? ensureHttps(payload.cancelUrl) : undefined;
  if (!successUrl || !cancelUrl) {
    return jsonResponse({ error: 'Missing successUrl/cancelUrl' }, 400);
  }

  const metadata: Record<string, string> = {};
  Object.entries(payload.metadata || {}).forEach(([key, value]) => {
    if (!value) return;
    const cleaned = sanitizeText(String(value), 240);
    if (cleaned) metadata[key] = cleaned;
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });

  return jsonResponse({ url: session.url });
}

async function storeOrder(env: Env, record: OrderRecord) {
  await env.ORDERS_KV.put(record.id, JSON.stringify(record));
}

async function sendEmail(env: Env, record: OrderRecord) {
  if (!env.RESEND_API_KEY || !record.customer?.email) return;
  const from = env.RESEND_FROM || 'orders@snackfamily2.com';
  const subject = `Commande SnackFamily2 #${record.id}`;
  const body = `Merci pour votre commande !\nTotal: ${(record.amountTotal / 100).toFixed(2)} €\nAdresse: ${record.customer.address || ''}`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: record.customer.email, subject, text: body }),
  });
}

async function sendSms(env: Env, record: OrderRecord) {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) return;
  const adminPhone = env.ADMIN_PHONE || '+32465671893';
  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const basicAuth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);

  const summary = record.items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
  const textClient = `Commande SnackFamily2 confirmée. Total ${(record.amountTotal / 100).toFixed(2)}€.`;
  const textOwner = `Nouvelle commande ${(record.amountTotal / 100).toFixed(2)}€ - ${record.customer?.firstName || ''} ${record.customer?.lastName || ''} - ${record.customer?.address || ''} - ${summary}`;

  const send = async (to: string, body: string) => {
    await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: env.TWILIO_FROM!, To: to, Body: body }),
    });
  };

  if (record.customer?.phone) {
    await send(record.customer.phone, textClient);
  }
  await send(adminPhone, textOwner);
}

async function handleWebhook(request: Request, env: Env, stripe: Stripe) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let event: Stripe.Event;
  if (env.STRIPE_WEBHOOK_SECRET) {
    const signature = request.headers.get('stripe-signature');
    const rawBody = await request.text();
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature || '', env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return new Response('Invalid signature', { status: 400 });
    }
  } else {
    try {
      event = await request.json();
    } catch (err) {
      return new Response('Invalid JSON', { status: 400 });
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
    const items = lineItems.data.map((li) => ({
      name: li.description || li.price?.product?.toString() || 'Article',
      price: li.amount_total || li.price?.unit_amount || 0,
      quantity: li.quantity || 1,
    }));

    const record: OrderRecord = {
      id: session.id,
      status: session.payment_status || 'paid',
      amountTotal: session.amount_total || 0,
      currency: session.currency || 'eur',
      items,
      customer: {
        firstName: session.metadata?.firstName,
        lastName: session.metadata?.lastName,
        email: session.customer_details?.email || session.metadata?.email,
        phone: session.customer_details?.phone || session.metadata?.phone,
        address: session.metadata?.address,
        city: session.metadata?.city,
        postalCode: session.metadata?.postalCode,
        instructions: session.metadata?.instructions,
      },
      createdAt: new Date().toISOString(),
    };

    await storeOrder(env, record);
    await sendEmail(env, record);
    await sendSms(env, record);
  }

  return new Response('ok', { status: 200 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    if (origin && allowedOrigins.includes(origin)) {
      // CORS handled in jsonResponse
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    if (url.pathname.endsWith('/create-checkout-session')) {
      try {
        return await handleCreateCheckout(request, env, stripe);
      } catch (err) {
        return jsonResponse({ error: err instanceof Error ? err.message : 'Checkout failed' }, 400);
      }
    }

    if (url.pathname.endsWith('/webhook')) {
      return handleWebhook(request, env, stripe);
    }

    return new Response('Not Found', { status: 404 });
  },
};
