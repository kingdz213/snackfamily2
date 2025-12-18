# Stripe / Cloudflare Worker Setup (quick note)

Supported Cloudflare secrets:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Stripe webhook destination:
- Prefer `https://<worker-domain>/webhook` (root `POST /` with `stripe-signature` is also supported).

## Release checklist
- Merge PR into `main`
- Confirm `main` contains the expected commits
- Trigger frontend deploy from `main`
- Deploy the Cloudflare Worker (via Git integration or manual dashboard publish)
