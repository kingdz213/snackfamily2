# Snack Family 2

## Cloudflare Worker secrets
Set the following secrets in your Worker configuration:
- `STRIPE_SECRET_KEY` (Stripe API secret key)
- `STRIPE_WEBHOOK_SECRET` (required for webhook verification)

Webhook destination URLs:
- Prefer `https://<worker-domain>/webhook`
- Root `https://<worker-domain>/` also works when Stripe is configured to post there.

Health check:
- `https://<worker-domain>/health` returns `{ ok: true }`.

Checkout endpoint:
- `POST https://<worker-domain>/create-checkout-session` returns `{ url }` for Stripe Checkout redirection.
