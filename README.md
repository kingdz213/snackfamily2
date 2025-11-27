<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1lwpn6AJ8-E7OCm7TxNgbanRPDFlkm-lw

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create a `.env.local` file with your Stripe worker endpoint so Checkout knows where to send orders **(mandatory)**:
   ```
   VITE_STRIPE_WORKER_URL=https://<your-worker>.workers.dev/create-checkout-session
   ```
   > The endpoint must live on your server/Worker and use your **secret** Stripe key to create Checkout sessions.
3. Run the app:
   `npm run dev`

## Stripe Checkout configuration

The frontend never stores your Stripe secret. Instead it POSTs the cart to a secure backend (Cloudflare Worker, serverless function, etc.) defined by `VITE_STRIPE_WORKER_URL`. The backend must:

1. Receive `{ items, successUrl, cancelUrl }` from the frontend.
2. Call `stripe.checkout.sessions.create` with your Stripe **secret** key and return `{ url: session.url }`.
3. Respond with a non-2xx status and error body when session creation fails so the UI can display a meaningful error.

If `VITE_STRIPE_WORKER_URL` is missing, the checkout button blocks with an explicit alert so you can fix the configuration before users try to pay.

### Checklist rapide (fr)

Pour que le bouton **« Commander »** redirige correctement vers Stripe :

1. **Créez un backend sécurisé** (Cloudflare Worker, Netlify/ Vercel function, petit serveur Node/Express…). Placez-y votre **clé secrète Stripe**.
2. **Exposez un endpoint POST** (ex. `/create-checkout-session`) qui reçoit `{ items, successUrl, cancelUrl }` et renvoie `{ url: session.url }` après avoir appelé `stripe.checkout.sessions.create`.
3. **Mettez l’URL de cet endpoint** dans `.env.local` :
   ```
   VITE_STRIPE_WORKER_URL=https://<votre-worker>.workers.dev/create-checkout-session
   ```
4. **Vérifiez les URLs de redirection**. Le frontend utilise `window.location.origin`; assurez-vous que votre domaine déployé correspond bien aux URLs `https://…/success` et `https://…/cancel` attendues par Stripe.
5. **Testez en local** : lancez `npm run dev`, ouvrez l’app, puis cliquez sur **« Test paiement (DEV) »** ou ajoutez un article et cliquez sur **« Payer avec Stripe »**. Vous devez voir une URL Stripe dans la console ou être redirigé vers Checkout.

### Cloudflare Worker complet (Stripe + KV + Emails + SMS)

Un worker TypeScript prêt pour la production est fourni dans `worker/stripe-worker.ts`. Il :

* crée des sessions Checkout via Stripe (HTTPS uniquement, localhost autorisé en dev) ;
* valide les items, nettoie les métadonnées et renvoie `{ url }` ;
* expose un endpoint `/webhook` pour `checkout.session.completed` ;
* enregistre chaque commande dans une base JSON (KV Cloudflare) ;
* peut envoyer un email (Resend) et deux SMS (client + propriétaire via Twilio) ;
* protège contre les payloads invalides, les redirects non sûrs et les JSON mal formés.

Variables d’environnement à fournir côté Worker :

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=...
RESEND_FROM=orders@snackfamily2.com
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+12025550123
ADMIN_PHONE=+32465671893
```

KV à lier : `ORDERS_KV` (stocke chaque commande au format JSON, indexée par session Stripe).

Pour déployer :

1) Créez un Worker, attachez `ORDERS_KV`, configurez les variables ci-dessus.
2) Déployez `worker/stripe-worker.ts` (via Wrangler/Pages Functions).
3) Configurez `VITE_STRIPE_WORKER_URL` avec l’URL publique du Worker (terminant par `/create-checkout-session`).
4) Ajoutez le webhook Stripe pointant vers `/webhook` avec la clé `STRIPE_WEBHOOK_SECRET`.

> ⚠️ Ne committez jamais votre clé secrète. Conservez-la dans les variables d’environnement de votre Worker/serveur.
