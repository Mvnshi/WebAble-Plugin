# `backend/` — WebAble Pro server

Self-hostable Node.js service that powers the **WebAble Pro** subscription tier of the Chrome extension. Provides Stripe Checkout, Customer Portal, webhook handling, and a Gemini API proxy so paying users don't manage their own keys.

> **The extension works without this server.** WebAble's 21 Phase 1 tools work offline. AI features work via BYOK (the user pastes their own Gemini key). This backend is only required if you want to *charge users* for the AI features.

## Stack

- **Node 18+** with native `fetch`
- **Express 4** for routing
- **better-sqlite3** for users + usage tracking
- **stripe** for Checkout, Billing Portal, webhooks
- **jsonwebtoken** for user session tokens

Total dependency tree: ~50 packages, install in under 30 seconds.

## File layout

```
backend/
├── package.json
├── .env.example          → copy to .env and fill in
├── .gitignore
├── server.js             → entrypoint
├── migrations.sql        → SQLite schema, applied on boot (idempotent)
├── lib/
│   ├── db.js             → better-sqlite3 wrapper + prepared stmts
│   ├── stripe.js         → Stripe SDK + plan-id mapping
│   ├── auth.js           → JWT issue / verify / Express middleware
│   ├── gemini.js         → Gemini API proxy (text + vision)
│   └── usage.js          → daily rate-limit guard
├── routes/
│   ├── checkout.js       → POST /api/checkout/create + GET /checkout/success
│   ├── portal.js         → POST /api/billing/create (Stripe Customer Portal)
│   ├── ai.js             → POST /api/ai/* (Gemini proxy, JWT-gated)
│   └── webhook.js        → POST /api/webhooks/stripe (signature-verified)
├── views/
│   ├── landing.html      → / — operator status page
│   ├── success.html      → activates the extension via runtime.sendMessage
│   └── cancel.html       → friendly "no card charged" page
└── data/
    └── webable.db        → SQLite (created on first boot, .gitignored)
```

## Quick start (5 minutes, local)

```bash
# 1. Install
cd backend
npm install

# 2. Configure
cp .env.example .env
# … then edit .env with your Stripe + Gemini keys
# (see ../STRIPE_SETUP.md for getting them)

# 3. Run
npm start
# → WebAble backend listening on http://localhost:8787

# 4. In another terminal, forward Stripe webhooks
stripe login
stripe listen --forward-to localhost:8787/api/webhooks/stripe
# Copy the whsec_… it prints, paste it into .env as STRIPE_WEBHOOK_SECRET
# Restart `npm start`.

# 5. In the WebAble extension Options page:
#    Account → Backend URL: http://localhost:8787 → Subscribe Monthly
```

## Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/healthz` | GET | none | Liveness + config check (used by `views/landing.html`). |
| `/` | GET | none | Operator landing page with config status. |
| `/api/checkout/plans` | GET | none | Public price IDs the extension renders pricing for. |
| `/api/checkout/create` | POST | none | Create a Stripe Checkout Session. Body: `{ plan, extensionId }`. Returns `{ url }`. |
| `/checkout/success` | GET | session_id | Lands the user post-checkout, mints a JWT, activates the extension via `chrome.runtime.sendMessage`. |
| `/checkout/cancel` | GET | none | Friendly cancel page. |
| `/api/billing/create` | POST | JWT | Open Stripe Customer Portal. Returns `{ url }`. |
| `/billing/back` | GET | none | Friendly redirect target after portal. |
| `/api/ai/me` | GET | JWT | Token sanity check + current usage quota. |
| `/api/ai/refresh` | POST | JWT | Token rotation. |
| `/api/ai/alt-text` | POST | JWT + active sub | Vision: generate alt text. |
| `/api/ai/summarize` | POST | JWT + active sub | Plain-language page summary. |
| `/api/ai/page-qa` | POST | JWT + active sub | DOM-aware Q&A. |
| `/api/ai/ocr` | POST | JWT + active sub | Vision: extract text from image. |
| `/api/ai/remediation-guide` | POST | JWT + active sub | Convert audit findings to dev tickets. |
| `/api/ai/generate` | POST | JWT + active sub | Generic prompt fall-through. |
| `/api/ai/logout` | POST | JWT | Revoke the calling token. |
| `/api/webhooks/stripe` | POST | Stripe signature | Subscription lifecycle events. |

## Environment variables

See `.env.example` for the full list. Required ones:

- `STRIPE_SECRET_KEY` — `sk_test_…` or `sk_live_…`
- `STRIPE_WEBHOOK_SECRET` — `whsec_…`
- `STRIPE_PRICE_MONTHLY` — `price_…` for the monthly plan
- `STRIPE_PRICE_ANNUAL` — `price_…` for the annual plan
- `GEMINI_API_KEY` — your Gemini API key (the operator's, billed by Google)
- `JWT_SECRET` — random 64-char string (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`)
- `PUBLIC_BASE_URL` — where this server lives publicly (Stripe redirect target)

## Deploying

The server is a vanilla Node Express app with one SQLite file. Pretty much anywhere works:

### Railway

1. Push the `backend/` directory to a Git repo.
2. <https://railway.app> → New Project → Deploy from GitHub.
3. Railway auto-detects Node, runs `npm install && npm start`.
4. Add a **persistent volume** at `/app/data` so the SQLite file survives redeploys.
5. Set env vars in Railway dashboard.
6. Add your Railway URL to the extension's `manifest.json` `externally_connectable.matches`.

### Fly.io

```bash
fly launch --no-deploy
# Edit fly.toml: add a volume mount at /app/data
fly secrets set STRIPE_SECRET_KEY=sk_live_… ...
fly deploy
```

### Vercel

Vercel's serverless model doesn't fit SQLite — there's no persistent disk between invocations. If you want Vercel, swap `lib/db.js` to use [Vercel KV](https://vercel.com/docs/storage/vercel-kv) or [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres). The schema in `migrations.sql` translates 1:1 to Postgres.

### Self-host on a VPS

```bash
# Tested on Ubuntu 22.04
sudo apt install nodejs npm
git clone <repo> /opt/webable-backend
cd /opt/webable-backend/backend
npm install
cp .env.example .env && vim .env

# Use systemd or pm2 to keep it running
pm2 start server.js --name webable
pm2 save && pm2 startup
```

Put nginx / Caddy in front for TLS termination.

## What lives in SQLite

```
users           — one row per Stripe customer
usage           — daily generation count per user (rate limit)
stripe_events   — webhook idempotency log
auth_tokens    — issued JWT IDs (for revocation)
```

Browse with the standard CLI:

```bash
sqlite3 backend/data/webable.db "select email, plan, status, current_period_end from users"
```

## Security notes

- **Never commit `.env`.** `.gitignore` already excludes it.
- **Webhook signature verification** is enforced — unsigned requests to `/api/webhooks/stripe` return 400.
- **JWTs are HS256** signed with `JWT_SECRET`. Treat the secret like a password. Rotate by changing the secret + bumping the JWT version (in code). All existing tokens become invalid.
- **CORS allowlist** defaults to `chrome-extension://*`. Tighten this in production by setting `ALLOWED_ORIGINS=chrome-extension://YOUR_PUBLISHED_ID`.
- **Rate limit** is per-user (default 500/day). The DB table makes this enforced even across server restarts.
- **`gemini.js` proxy** logs nothing about request *content* by default. The extension's debug flag in `.env` (`DEBUG_GEMINI=1`) prints first 200 bytes of each request — never enable in production.
- **No user-controlled SSRF.** The proxy only ever calls `generativelanguage.googleapis.com`; the extension cannot redirect us elsewhere.

## Costs

Back-of-envelope, US-only:

- Stripe processing: 2.9% + $0.30 per transaction.
- Gemini Flash 2.0: ~$0.075 / 1M input tokens, $0.30 / 1M output. A typical Pro user (50 generations/day, ~2K input + 500 output each) costs you ~$0.04/month in API fees, vs. $4.99 in subscription revenue.
- This server: $5–10/mo on Railway / Fly hobby tier comfortably handles thousands of users (it's mostly a thin proxy + SQLite).

## What this code does NOT do (yet)

Listed in `STRIPE_SETUP.md` § 14. TL;DR: no email sending, no admin UI, no analytics SDK, no team/seat plans. Add when needed; don't add speculatively.

## License

Proprietary prototype.
