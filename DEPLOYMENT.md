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
