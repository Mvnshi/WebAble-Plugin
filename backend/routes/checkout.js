// Checkout routes — create a Stripe Checkout Session, handle the success page.

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { stripe, planFromPriceId, publicPlans } = require('../lib/stripe');
const auth = require('../lib/auth');
const db = require('../lib/db');

const router = express.Router();

// Public — extension reads this on Options page load to render the pricing UI.
router.get('/plans', (_req, res) => res.json(publicPlans()));

// POST /api/checkout/create
// Body: { plan: 'monthly' | 'annual', extensionId: string }
// Returns: { url } — open in a new tab.
router.post('/create', express.json(), async (req, res) => {
  try {
    const { plan, extensionId } = req.body || {};
    const plans = publicPlans();
    const priceId = plan === 'annual' ? plans.annual.priceId : plans.monthly.priceId;
    if (!priceId) {
      return res.status(500).json({ error: 'Operator has not configured Stripe prices yet. See STRIPE_SETUP.md.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Free trial period is configured on the *price* in Stripe, not here,
      // so the operator can flip it on/off without a code change.
      success_url: `${process.env.PUBLIC_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.PUBLIC_BASE_URL}/checkout/cancel`,
      automatic_tax: { enabled: false },
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
      metadata: {
        // We pass the calling extension's runtime ID so the success page can
        // message back into the right install. Random per dev install; stable
        // once published to the Web Store.
        extensionId: String(extensionId || ''),
      },
      subscription_data: {
        metadata: { extensionId: String(extensionId || '') },
      },
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('[checkout/create]', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /checkout/success?session_id=cs_xxx
// Lands the user on a static page that messages the extension to activate Pro.
// We retrieve the Checkout Session, find/create the user, issue a JWT, and
// inject token + extensionId into the success template.
router.get('/success', async (req, res) => {
  try {
    const sessionId = String(req.query.session_id || '');
    if (!sessionId) return res.status(400).send('Missing session_id.');

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription', 'customer'],
    });
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(400).send('Checkout not completed.');
    }

    const sub = session.subscription;
    const customer = session.customer;
    const priceId = sub?.items?.data?.[0]?.price?.id || '';
    const plan = planFromPriceId(priceId);

    const userId = db.upsertUser({
      stripeCustomerId: typeof customer === 'string' ? customer : customer.id,
      email: (typeof customer === 'object' ? customer.email : null) || session.customer_details?.email || null,
      plan,
      status: sub?.status === 'trialing' ? 'active' : (sub?.status || 'active'),
      currentPeriodEnd: sub?.current_period_end || null,
      cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
      stripeSubscriptionId: sub?.id || null,
    });
    const user = db.getUserById(userId);
    const { token, expiresAt } = auth.issueToken(user);

    const extensionId = session.metadata?.extensionId || '';
    const html = renderSuccess({ token, expiresAt, extensionId, email: user.email, plan: user.plan });
    res.set('Content-Type', 'text/html; charset=utf-8').send(html);
  } catch (e) {
    console.error('[checkout/success]', e);
    res.status(500).send('Activation failed: ' + e.message);
  }
});

// Cancel — Stripe sends here if the user backs out of Checkout.
router.get('/cancel', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'views', 'cancel.html'), 'utf8');
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

function renderSuccess({ token, expiresAt, extensionId, email, plan }) {
  const tpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'success.html'), 'utf8');
  return tpl
    .replaceAll('{{TOKEN}}',      escapeJs(token))
    .replaceAll('{{EXPIRES_AT}}', String(expiresAt))
    .replaceAll('{{EXTENSION_ID}}', escapeJs(extensionId))
    .replaceAll('{{EMAIL}}',      escapeHtml(email || ''))
    .replaceAll('{{PLAN}}',       escapeHtml(plan || ''));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeJs(s) {
  return String(s ?? '').replace(/[\\'"<>\n\r  ]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

module.exports = router;
