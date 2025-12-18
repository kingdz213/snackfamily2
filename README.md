# Stripe / Cloudflare Worker Setup (quick note)

Supported Cloudflare secrets:
- `STRIPE_SECRET_KEY` (preferred) or `STRIPE_SECRET2` (supported)
- `STRIPE_WEBHOOK_SECRET` (and `STRIPE_WEBHOOK_SECRET2` / `STRIPE-WEBHOOK-SECRET2` supported)

Stripe webhook destination:
- Prefer `https://<worker-domain>/webhook` (root `POST /` with `stripe-signature` is also supported).
