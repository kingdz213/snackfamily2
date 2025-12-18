# Snack Family 2

## Cloudflare Worker secrets
Set the following secrets in your Worker configuration:
- `STRIPE_SECRET_KEY` (optional if `STRIPE_SECRET2` is set)
- `STRIPE_SECRET2` (optional if `STRIPE_SECRET_KEY` is set)
- `STRIPE_WEBHOOK_SECRET` (required for webhook verification)

Webhook destination URLs:
- Prefer `https://<worker-domain>/webhook`
- Root `https://<worker-domain>/` also works when Stripe is configured to post there.
