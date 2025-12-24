import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { getFirestore, FieldValue, type DocumentSnapshot, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import * as admin from "firebase-admin";
import Stripe from "stripe";

setGlobalOptions({ region: "europe-west1" });
admin.initializeApp();

const stripe = new Stripe(process.env.STRIPE_API_KEY ?? "", {
  apiVersion: "2024-06-20",
});

const db = getFirestore();
const messaging = getMessaging();

type OrderItem = {
  name: string;
  quantity: number;
  price: number;
};

type CustomerInfo = {
  name: string;
  phone: string;
  address: string;
  postalCode: string;
  city: string;
};

type OrderStatus = "PENDING_PAYMENT" | "PAID_ONLINE" | "CASH_ON_DELIVERY";

type OrderPaymentMethod = "STRIPE" | "CASH";

type OrderRecord = {
  id: string;
  createdAt: FieldValue;
  items: OrderItem[];
  total: number;
  deliveryFee: number;
  customer: CustomerInfo;
  paymentMethod: OrderPaymentMethod;
  status: OrderStatus;
  stripeCheckoutSessionId?: string | null;
  note?: string | null;
  paidAt?: FieldValue;
};

function parseOrderPayload(body: any) {
  const itemsRaw = Array.isArray(body?.items) ? body.items : null;
  if (!itemsRaw || itemsRaw.length === 0) {
    return { error: "Missing items" };
  }

  const items: OrderItem[] = [];
  for (const raw of itemsRaw) {
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    const quantity = Number(raw?.quantity);
    const price = Number(raw?.price);

    if (!name) return { error: "Item name missing" };
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Item quantity invalid" };
    if (!Number.isFinite(price) || price <= 0) return { error: "Item price invalid" };

    items.push({ name, quantity: Math.trunc(quantity), price });
  }

  const total = Number(body?.total);
  const deliveryFee = Number(body?.deliveryFee);
  if (!Number.isFinite(total) || total <= 0) return { error: "Total invalid" };
  if (!Number.isFinite(deliveryFee) || deliveryFee < 0) return { error: "Delivery fee invalid" };

  const customerRaw = body?.customer ?? {};
  const customer: CustomerInfo = {
    name: String(customerRaw?.name ?? "").trim(),
    phone: String(customerRaw?.phone ?? "").trim(),
    address: String(customerRaw?.address ?? "").trim(),
    postalCode: String(customerRaw?.postalCode ?? "").trim(),
    city: String(customerRaw?.city ?? "").trim(),
  };

  if (!customer.name || !customer.phone || !customer.address || !customer.postalCode || !customer.city) {
    return { error: "Customer info missing" };
  }

  const note = typeof body?.note === "string" ? body.note.trim() : "";

  return { items, total, deliveryFee, customer, note: note || null };
}

function formatItemsForNotification(items: OrderItem[]) {
  return items
    .filter((i) => i.name)
    .map((i) => `${i.name} x${i.quantity}`)
    .join(" • ");
}

export const createCheckoutSession = onRequest(
  {
    cors: true,
    maxInstances: 1,
    secrets: ["STRIPE_API_KEY"],
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const { items, successUrl, cancelUrl } = body ?? {};

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "Missing items" });
        return;
      }

      if (!successUrl || !cancelUrl) {
        res.status(400).json({ error: "Missing success/cancel URLs" });
        return;
      }

      const lineItems = items.map((item: any, idx: number) => {
        const name = typeof item?.name === "string" ? item.name.trim() : "";
        const price = Math.round(Number(item?.price));
        const quantity = Math.round(Number(item?.quantity ?? 1));

        if (!name) throw new Error(`ITEM_${idx}_NAME`);
        if (!Number.isFinite(price) || price <= 0) throw new Error(`ITEM_${idx}_PRICE`);
        if (!Number.isFinite(quantity) || quantity < 1) throw new Error(`ITEM_${idx}_QTY`);

        return {
          price_data: {
            currency: "eur",
            product_data: { name },
            unit_amount: price,
          },
          quantity,
        } satisfies Stripe.Checkout.SessionCreateParams.LineItem;
      });

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      res.set("Access-Control-Allow-Origin", "*");
      res.status(200).json({ url: session.url, sessionId: session.id });
    } catch (error) {
      console.error("createCheckoutSession error", error);
      res.status(500).json({ error: "create session failed" });
    }
  }
);

export const createOrderCash = onRequest(
  {
    cors: true,
    maxInstances: 1,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    let body: any = req.body;
    try {
      if (typeof body === "string") {
        body = JSON.parse(body);
      }
    } catch (error) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }

    const payload = parseOrderPayload(body);
    if ("error" in payload) {
      res.status(400).json({ error: payload.error });
      return;
    }

    const orderRef = db.collection("orders").doc();
    const orderId = orderRef.id;

    const record: OrderRecord = {
      id: orderId,
      createdAt: FieldValue.serverTimestamp(),
      items: payload.items,
      total: payload.total,
      deliveryFee: payload.deliveryFee,
      customer: payload.customer,
      paymentMethod: "CASH",
      status: "CASH_ON_DELIVERY",
      note: payload.note ?? null,
    };

    await orderRef.set(record);

    res.status(200).json({ orderId });
  }
);

export const createOrderStripe = onRequest(
  {
    cors: true,
    maxInstances: 1,
    secrets: ["STRIPE_API_KEY"],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    if (!process.env.STRIPE_API_KEY) {
      res.status(500).json({ error: "Missing Stripe API key" });
      return;
    }

    let body: any = req.body;
    try {
      if (typeof body === "string") {
        body = JSON.parse(body);
      }
    } catch (error) {
      res.status(400).json({ error: "Invalid JSON body" });
      return;
    }
    const payload = parseOrderPayload(body);
    if ("error" in payload) {
      res.status(400).json({ error: payload.error });
      return;
    }

    const successUrl = typeof body?.successUrl === "string" ? body.successUrl : "";
    const cancelUrl = typeof body?.cancelUrl === "string" ? body.cancelUrl : "";
    if (!successUrl || !cancelUrl) {
      res.status(400).json({ error: "Missing success or cancel URL" });
      return;
    }

    const orderRef = db.collection("orders").doc();
    const orderId = orderRef.id;

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = payload.items.map((item) => ({
      price_data: {
        currency: "eur",
        product_data: { name: item.name },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    if (payload.deliveryFee > 0) {
      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: { name: "Livraison" },
          unit_amount: Math.round(payload.deliveryFee * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: orderId,
      metadata: {
        orderId,
      },
    });

    const record: OrderRecord = {
      id: orderId,
      createdAt: FieldValue.serverTimestamp(),
      items: payload.items,
      total: payload.total,
      deliveryFee: payload.deliveryFee,
      customer: payload.customer,
      paymentMethod: "STRIPE",
      status: "PENDING_PAYMENT",
      stripeCheckoutSessionId: session.id,
      note: payload.note ?? null,
    };

    await orderRef.set(record);

    res.status(200).json({ url: session.url, sessionId: session.id, orderId });
  }
);

export const getOrder = onRequest(
  {
    cors: true,
    maxInstances: 1,
  },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).send("Method not allowed");
      return;
    }

    const requiredPin = process.env.ORDER_STATUS_PIN;
    if (requiredPin) {
      const providedPin = String(req.query.pin ?? req.header("x-order-pin") ?? "");
      if (!providedPin || providedPin !== requiredPin) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    const orderId = typeof req.query.orderId === "string" ? req.query.orderId : "";
    const sessionId = typeof req.query.sessionId === "string" ? req.query.sessionId : "";

    let docSnap: DocumentSnapshot | QueryDocumentSnapshot | null = null;

    if (orderId) {
      docSnap = await db.collection("orders").doc(orderId).get();
    } else if (sessionId) {
      const match = await db.collection("orders").where("stripeCheckoutSessionId", "==", sessionId).limit(1).get();
      docSnap = match.empty ? null : match.docs[0];
    } else {
      res.status(400).json({ error: "Missing orderId or sessionId" });
      return;
    }

    if (!docSnap || !docSnap.exists) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const data = docSnap.data() as OrderRecord;
    res.status(200).json({
      order: {
        ...data,
        createdAt: (data.createdAt as any)?.toDate?.()?.toISOString?.() ?? null,
      },
    });
  }
);

export const webhookStripeUpdateOrder = onRequest({
  maxInstances: 1,
  cors: true,
  secrets: ["STRIPE_API_KEY", "STRIPE_WEBHOOK_SECRET"],
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const signature = req.header("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    res.status(400).send("Missing Stripe signature or secret");
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("❌ Stripe signature verification failed", error);
    res.status(400).send(`Webhook Error: ${(error as Error).message}`);
    return;
  }

  if (event.type !== "checkout.session.completed") {
    res.status(200).send({ received: true, ignored: true });
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const sessionId = session.id;

  const match = await db.collection("orders").where("stripeCheckoutSessionId", "==", sessionId).limit(1).get();

  if (match.empty) {
    res.status(200).send({ received: true, updated: false });
    return;
  }

  const orderDoc = match.docs[0];
  const orderData = orderDoc.data() as OrderRecord;

  await orderDoc.ref.update({
    status: "PAID_ONLINE",
    paidAt: FieldValue.serverTimestamp(),
  });

  const tokensSnapshot = await db.collection("admin_tokens").get();
  const tokens = tokensSnapshot.docs
    .map((doc) => doc.get("token") as string | undefined)
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) {
    res.status(200).send({ received: true, notified: false });
    return;
  }

  const body = formatItemsForNotification(orderData.items);
  const title = `🛎️ Nouvelle commande – ${orderData.total.toFixed(2)}€`;

  await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      fcmOptions: { link: "/admin" },
      notification: {
        vibrate: [200, 100, 200, 100, 200],
        renotify: true,
        tag: "new-order",
      },
    },
    data: {
      url: "/admin",
    },
  });

  res.status(200).send({ received: true, notified: true });
});

export const stripeWebhook = webhookStripeUpdateOrder;
