# Snack Family 2

## Cloudflare Worker secrets
Set the following secrets in your Worker configuration:
- `STRIPE_SECRET_KEY` (preferred; `STRIPE_SECRET2` is allowed as a fallback)
- `STRIPE_SECRET2` (fallback if `STRIPE_SECRET_KEY` is not set)
- `STRIPE_WEBHOOK_SECRET` (required for webhook verification)

Webhook destination URLs:
- Prefer `https://<worker-domain>/webhook`
- Root `https://<worker-domain>/` also works when Stripe is configured to post there.
