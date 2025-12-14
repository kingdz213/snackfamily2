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
