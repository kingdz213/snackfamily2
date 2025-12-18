# Stripe / Cloudflare Worker Setup (quick note)

Supported Cloudflare secrets:
- `STRIPE_SECRET_KEY` (preferred)
- `STRIPE_SECRET2` (fallback)
- `STRIPE_WEBHOOK_SECRET`

Stripe webhook destination:
- Prefer `https://<worker-domain>/webhook` (root `POST /` with `stripe-signature` is also supported).
