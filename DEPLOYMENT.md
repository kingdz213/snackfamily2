# Cloudflare Workers Builds deployment notes

## Why the builds failed
Cloudflare Workers Builds can override `wrangler.toml` bindings with the bindings configured in the Cloudflare Dashboard. If the Dashboard has a stale binding (for example an `ORDERS_KV` namespace pointing to `000000...`), the build logs will show `env.ORDERS_KV` bound to the zero namespace and fail with `KV namespace not found (code: 10041)`.

## Required Dashboard fixes (production + preview)

### A. Fix the KV namespace binding (root cause)
1. Open **Cloudflare → Worker `delicate-meadow-9436snackfamily2payments`**.
2. Go to **Settings → Bindings → KV namespace bindings**.
3. If an `ORDERS_KV` binding exists and points to an invalid namespace (e.g. `000000...`), **delete it**.
4. Re-create the binding with the correct namespaces:
   - **Production** → `orders_kv_prod`
   - **Preview** → `orders_kv_preview` (if Cloudflare Workers Builds uses Preview for PRs)

This removes the phantom binding and ensures Workers Builds uses the correct KV namespaces.

### B. Stripe secrets in both environments
Workers Builds can run in **Preview** for PRs. Ensure these secrets exist in **both Production and Preview**:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

If they are only defined in Production, Preview deployments can fail.

## Repo configuration (reference)
`wrangler.toml` already defines the KV namespace IDs and preview IDs. This should be kept aligned with the namespaces above:

```toml
kv_namespaces = [
  { binding = "ORDERS_KV", id = "<prod_id>", preview_id = "<preview_id>" }
]
```

## Validation checklist
- ✅ Workers Builds no longer logs `KV namespace '0000...' not found`.
- ✅ `GET /health` returns `{ ok: true, hasOrdersKV: true, hasStripeSecret: true, origin: "https://snackfamily2.eu" }`.
- ✅ Checkout endpoints do not fail due to missing `ORDERS_KV`.
