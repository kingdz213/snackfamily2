import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2/options";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
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

function formatItems(items: Stripe.LineItem[]) {
  return items.map((item) => ({
    name: item.description ?? item.price?.nickname ?? "Article",
    qty: item.quantity ?? 1,
    price: item.amount_total ? item.amount_total / 100 : undefined,
  }));
}

function formatBody(items: { name?: string | null; qty?: number | null }[]) {
  return items
    .filter((i) => i.name)
    .map((i) => `${i.name} x${i.qty ?? 1}`)
    .join(" • ");
}

export const stripeWebhook = onRequest({
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
  const lineItems = session.id
    ? await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 })
    : { data: [] } as Stripe.ApiList<Stripe.LineItem>;

  const items = formatItems(lineItems.data);
  const totalAmount = (session.amount_total ?? 0) / 100;

  await db.collection("orders").add({
    status: "paid",
    total: totalAmount,
    items,
    createdAt: FieldValue.serverTimestamp(),
    stripeSessionId: session.id,
    customerEmail: session.customer_details?.email ?? null,
  });

  const tokensSnapshot = await db.collection("admin_tokens").get();
  const tokens = tokensSnapshot.docs
    .map((doc) => doc.get("token") as string | undefined)
    .filter((t): t is string => Boolean(t));

  if (tokens.length === 0) {
    res.status(200).send({ received: true, notified: false });
    return;
  }

  const body = formatBody(items);
  const title = `🛎️ Nouvelle commande – ${totalAmount.toFixed(2)}€`;

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
