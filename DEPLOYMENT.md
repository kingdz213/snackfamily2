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

## Manual UI checks (mobile)
- iOS Safari: CTA glow/pulse visible without hover, hero embers visible, cards have premium depth.
- Chrome iOS: CTA glow/pulse visible without hover, hero embers visible, cards have premium depth.
