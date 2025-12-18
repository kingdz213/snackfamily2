# Stripe / Cloudflare Worker Setup (quick note)

Required Cloudflare secrets:
- `STRIPE_SECRET2` (current) **or** `STRIPE_SECRET_KEY` (preferred)
- `STRIPE_WEBHOOK_SECRET`

Stripe webhook destination:
- Prefer `https://<worker-domain>/webhook` (root `POST /` with `stripe-signature` is also supported).
