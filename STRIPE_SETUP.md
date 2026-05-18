# Stripe setup — WebAble Pro

Step-by-step guide to wiring up paid AI features. **End-to-end, you should hit your first test charge in under 20 minutes.**

This is the operator-side guide (you, the seller). End users never see any of this — they just click "Subscribe" in the WebAble extension and pay you.

> **Important framing.** WebAble Pro doesn't change what the AI features are or who they help. It's just a different way to pay for the Gemini API calls — instead of every user managing their own Google API key, they pay you a flat monthly fee and you handle the Gemini billing. The privacy posture stays identical: requests are still browser → Google's API, with your backend as the proxy.

---

## 1. Create a Stripe account

If you don't have one: <https://dashboard.stripe.com/register>

You'll start in **test mode** by default (the toggle in the top-left says "Test mode"). Keep it that way until you're ready to take real money — every step below works in test mode.

---

## 2. Get your secret key

1. <https://dashboard.stripe.com/apikeys>
2. Reveal the **Secret key** (`sk_test_…`) and copy it.
3. Paste into `backend/.env` as `STRIPE_SECRET_KEY=sk_test_…`.

---

## 3. Create the Product

1. <https://dashboard.stripe.com/test/products>
2. **Add product**.
3. Name: `WebAble Pro`.
4. Description: `Unlimited AI features in the WebAble accessibility browser extension. Plain Language Summarizer, Smart Page Q&A, Context-Aware Alt Text, OCR, AI Remediation Guide.`
5. Image: optional — upload `icons/icon128.png`.

Don't add a price yet from this screen — we'll add two of them in step 4.

---

## 4. Create the two prices

Inside the product you just made, click **Add another price** twice:

### Monthly
- **Amount**: `$4.99`
- **Billing period**: Recurring monthly
- **Currency**: USD
- *(optional)* **Free trial**: 7 days

### Annual
- **Amount**: `$49.00`
- **Billing period**: Recurring yearly
- **Currency**: USD

After saving each, click into the price to copy its **Price ID** (starts with `price_`). These are NOT product IDs.

Paste both into `backend/.env`:

```bash
STRIPE_PRICE_MONTHLY=price_1Q...your_monthly_id
STRIPE_PRICE_ANNUAL=price_1Q...your_annual_id
```

---

## 5. Set up the webhook

The webhook is how Stripe tells your backend about subscription events (renewal succeeded, payment failed, customer cancelled, etc.).

### For local development

Install the Stripe CLI: <https://stripe.com/docs/stripe-cli>

Then in one terminal:

```bash
stripe login
stripe listen --forward-to localhost:8787/api/webhooks/stripe
```

The CLI prints a `whsec_…` secret — paste it into `backend/.env` as `STRIPE_WEBHOOK_SECRET`.

Leave the `stripe listen` process running while you develop. Every event Stripe fires gets forwarded to your local backend, including the signature.

### For production

1. <https://dashboard.stripe.com/webhooks>
2. **Add endpoint**.
3. **URL**: `https://your-deployed-backend.com/api/webhooks/stripe`
4. **Events to send**, select these six:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
   - `invoice.payment_succeeded`
5. **Add endpoint**.
6. Click into the new endpoint, reveal the **Signing secret** (`whsec_…`), copy it.
7. Set it as `STRIPE_WEBHOOK_SECRET` on your deploy host (Railway / Fly / Vercel / etc.).

---

## 6. Configure the Customer Portal

The Customer Portal is the page Stripe hosts where users update their card, change plans, or cancel. We turn this on so users don't ever need to email you.

1. <https://dashboard.stripe.com/test/settings/billing/portal>
2. **Activate** the portal.
3. Under **Functionality**, enable:
   - ✅ Update payment methods
   - ✅ Update billing address
   - ✅ View invoice history
   - ✅ Cancel subscriptions
   - ✅ Update subscriptions (so users can switch monthly ↔ annual)
4. Under **Subscription cancellation**:
   - Set "Cancellation behavior" to **Cancel at end of billing period** (kinder than immediate cancel).
   - *(optional)* Add a cancellation reason survey — useful churn signal.
5. Under **Branding**: upload your logo, set brand color to `#2F80FF` (WebAble's accent).
6. **Save**.

---

## 7. Get a Gemini API key

1. <https://aistudio.google.com/app/apikey>
2. **Create API key in new project** (or pick an existing one).
3. Copy the key.
4. Paste into `backend/.env` as `GEMINI_API_KEY=…`.

This is *your* (operator's) key. Every paying user's AI requests get billed against this key. **Set up Google Cloud billing alerts** on the project so a leaked token can't run up an unbounded bill — see the rate-limit hardening in `lib/usage.js` (default 500 generations/user/day).

---

## 8. Generate a JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Paste the output as `JWT_SECRET` in `backend/.env`. Treat this like a password — anyone with this can mint valid tokens for your service.

---

## 9. Run the backend

```bash
cd backend
npm install
npm start
```

You should see:

```
WebAble backend listening on http://localhost:8787
Stripe configured:      true
Webhook secret set:     true
Gemini key set:         true
```

Visit `http://localhost:8787/healthz` in a browser — you should get `{ "ok": true, ... }` with all five flags `true`.

---

## 10. Test the full flow end-to-end

1. Load WebAble extension unpacked: `chrome://extensions` → Developer mode → Load unpacked.
2. Open the **Options** page (right-click WebAble icon → Options).
3. Scroll to **Account** → **WebAble Pro**.
4. **Backend URL**: `http://localhost:8787`
5. Click **Subscribe — Monthly**.
6. Stripe Checkout opens in a new tab. Use the test card:

   ```
   Card:    4242 4242 4242 4242
   Expiry:  any future date
   CVC:     any 3 digits
   ZIP:     any
   Email:   anything@example.com
   ```

7. Complete checkout. You'll land on the success page (`/checkout/success`).
8. The page automatically messages the extension via `chrome.runtime.sendMessage`. Within a second, the message **"✓ Activated. You can close this tab."** should appear.
9. Switch back to Options → Account section now shows **WebAble Pro · Monthly**, status **active**, usage `0 / 500`.
10. Try a Pro feature — open the panel on any page, **AI** tab → **Summarize this page**. The AI call goes through your backend; check the backend log to see the request fly through.
11. Refresh the Options page after the call — usage updates to `1 / 500`.

If activation didn't happen automatically (e.g. browser blocked the `runtime.sendMessage`), the success page falls back to showing the activation token. Copy it, open Options → Account → "Have an activation token?" → paste → Activate.

---

## 11. Test the cancellation flow

1. In Options → Account, click **Manage billing** → opens the Stripe Customer Portal.
2. Cancel the subscription.
3. Stripe fires `customer.subscription.updated` (with `cancel_at_period_end: true`) → your webhook updates the user record.
4. Stripe fires `customer.subscription.deleted` at period end → user's `status` flips to `canceled`, `plan` goes back to `free`.
5. Next AI call returns 402 — the extension shows "Subscription not active. Reactivate in billing portal."

---

## 12. Going to production

1. Flip the Stripe dashboard from **Test mode** to **Live mode** (top-left toggle).
2. **Recreate** the product, prices, and webhook endpoint in live mode (test-mode prices don't carry over).
3. Update `backend/.env` (or your deploy host's env vars) with:
   - `sk_live_…` instead of `sk_test_…`
   - Live `price_…` IDs
   - Live `whsec_…` webhook secret
4. Update `PUBLIC_BASE_URL` to your real domain.
5. Update the extension's `manifest.json` `externally_connectable.matches` to include your production domain. **Reload the extension** so the new manifest takes effect.
6. **Test once with a real $0.50 / 0.99 sandbox amount** before announcing — Stripe Test Mode behavior diverges from live in subtle ways (capture timing, anti-fraud rules, dunning emails).

---

## 13. Operational checklist

- **Google Cloud budget alert** on your Gemini project, with auto-disable at $50/$100/$500 thresholds.
- **Stripe receipts** turned on (Settings → Emails → "Successful payments").
- **Customer notifications** turned on (Settings → Customer emails → "Send finalized invoices and credit notes").
- **Failed payment retries** configured (Settings → Subscriptions → "Manage failed payments"). Default is 4 attempts over 3 weeks — fine.
- **Tax** — if you sell across borders, enable Stripe Tax (Settings → Tax). Or run with `automatic_tax: false` (current code default) and consult an accountant.
- **Webhook monitoring** — Stripe will email you if a webhook endpoint starts failing. Set up a dedicated alert email or a PagerDuty integration if this is your livelihood.

---

## 14. What this code does NOT do (yet)

The MVP backend in `backend/` is intentionally minimal:

- **No email sending.** No magic-link auth, no welcome emails, no "your card is about to expire" notices. Stripe sends payment-failure emails by default which covers the most important case.
- **No admin dashboard.** Inspect users with `sqlite3 backend/data/webable.db "select * from users"`.
- **No analytics SDK.** Pull metrics directly from Stripe + the SQLite file.
- **No proration UI.** The Stripe Customer Portal handles plan changes correctly with proration; we don't reinvent that.
- **No team / multi-seat plans.** Single-seat only. Multi-seat would need a `teams` table and a join.

These are all intentional simplifications. Add them if you need them; don't add them speculatively.
