# Cloudflare Workers Builds deployment

## Recommended deploy command
Use the npm script below as the Workers Builds Deploy command:

```bash
npm run deploy:worker:versions
```

## Why this repository config is authoritative
This repo pins the Worker configuration in `wrangler.toml` (and a minimal `wrangler.json` fallback). Both files define the Worker name, entrypoint, KV bindings, and `DEFAULT_ORIGIN` so the build always uses the intended bindings.

## Quick verification
- `GET /health` should return:

```json
{
  "ok": true,
  "hasOrdersKV": true,
  "hasStripeSecret": true,
  "origin": "https://snackfamily2.eu"
}
```

## Animations
- Premium animation pack is always enabled in production and respects `prefers-reduced-motion`.

## Admin order hub (WhatsApp)
- Configure Worker secrets: `ADMIN_PIN` (required) + `ADMIN_SIGNING_SECRET`.
- WhatsApp message contains a single admin hub link that requires the PIN and allows marking orders as delivered.

## Firebase Auth (clients)
- Configure Worker secret: `FIREBASE_API_KEY` (same value as `VITE_FIREBASE_API_KEY`).
- Frontend (Vercel): expose `VITE_FIREBASE_*` keys (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`).

## Firebase Cloud Messaging (push)
- Worker secrets: `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON`.
- Worker vars: `FIREBASE_AUTH_DOMAIN`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`.
- Frontend (Vercel): `VITE_FIREBASE_VAPID_KEY` + keep the existing `VITE_FIREBASE_*` config values.

## Routes utiles
- `GET /firebase-config` : configuration publique Firebase pour le service worker.
- `DELETE /admin/orders/:id` (token admin) et `DELETE /api/admin/orders/:id` (PIN) : suppression d’une commande (KV + Firestore).

## Firestore rules
- `firestore.rules` doit être déployé pour autoriser uniquement les lectures/écritures sur `users/{uid}` et les lectures des commandes de l’utilisateur (`orders/{orderId}`).

## Manual UI checks (mobile)
- iOS Safari: CTA glow/pulse visible without hover, hero embers visible, cards have premium depth.
- Chrome iOS: CTA glow/pulse visible without hover, hero embers visible, cards have premium depth.
