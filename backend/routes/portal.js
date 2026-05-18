// Stripe Billing Portal — lets users update card, change plan, cancel,
// download receipts. Stripe handles the UI; we just create the session.

const express = require('express');
const { stripe } = require('../lib/stripe');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

router.post('/create', requireAuth, async (req, res) => {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: req.user.stripe_customer_id,
      return_url: `${process.env.PUBLIC_BASE_URL}/billing/back`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('[portal/create]', e);
    res.status(500).json({ error: e.message });
  }
});

// Friendly redirect target so users coming back from the portal land on a
// page that tells them what just happened, rather than a 404.
router.get('/back', (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>WebAble · Billing updated</title>
<style>
  html, body { margin: 0; background: #0B1220; color: #F4F6FA; font: 15px/1.55 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 480px; margin: 80px auto; padding: 32px; background: #131C2E; border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; text-align: center; }
  h1 { margin: 0 0 8px; font-size: 22px; font-weight: 500; letter-spacing: -0.01em; }
  p { color: #9AA4B8; margin: 0; }
  .mark { width: 48px; height: 48px; border-radius: 12px; background: rgba(31,203,138,0.16); border: 1px solid rgba(31,203,138,0.32); color: #1FCB8A; display: grid; place-items: center; margin: 0 auto 16px; }
</style></head><body>
<main>
  <div class="mark">✓</div>
  <h1>Billing updated</h1>
  <p>Your subscription changes will sync into the WebAble extension within a minute. You can close this tab.</p>
</main>
</body></html>`);
});

module.exports = router;
