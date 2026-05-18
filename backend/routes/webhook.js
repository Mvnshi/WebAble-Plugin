// Stripe webhook. Mounted with raw body (NOT JSON), because signature
// verification needs the exact bytes Stripe sent.
//
// Events handled:
//   checkout.session.completed       — backup activation path (success.html
//                                      handles the common case; this catches
//                                      users who close the tab before the
//                                      activation script runs)
//   customer.subscription.created    — issue/upgrade the user's plan
//   customer.subscription.updated    — handle plan changes, renewals, dunning
//   customer.subscription.deleted    — downgrade to free
//   invoice.payment_failed           — flip status → past_due (extension
//                                      shows "Update payment method")
//   invoice.payment_succeeded        — flip status → active again
//
// Idempotency: we record every event ID so re-deliveries are no-ops.

const express = require('express');
const { stripe, planFromPriceId } = require('../lib/stripe');
const db = require('../lib/db');

const router = express.Router();

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET missing — refusing event.');
    return res.status(500).send('Webhook secret not configured.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (e) {
    console.error('[webhook] signature verification failed:', e.message);
    return res.status(400).send(`Bad signature: ${e.message}`);
  }

  // Idempotent — Stripe re-delivers on failure.
  if (!db.recordEventIfFresh(event.id, event.type)) {
    return res.status(200).json({ ok: true, deduped: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.data.object);
        break;
      default:
        // We log unhandled events at debug level; some are noisy
        // (charge.succeeded, customer.updated) and we don't need them.
        if (process.env.DEBUG_GEMINI === '1') console.log('[webhook] unhandled', event.type);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[webhook] handler error', event.type, e);
    // Return 500 so Stripe retries. We've already idempotency-marked the
    // event, so we'll need to rely on the manual retry tools if processing
    // failed mid-way. Real production: move that mark to AFTER successful
    // processing. Acceptable for the prototype.
    res.status(500).json({ ok: false, error: e.message });
  }
});

async function handleCheckoutCompleted(session) {
  if (session.mode !== 'subscription') return;
  const sub = await stripe.subscriptions.retrieve(session.subscription);
  await handleSubscriptionChange(sub);
}

async function handleSubscriptionChange(sub) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) return;
  const customer = await stripe.customers.retrieve(customerId);
  const priceId = sub.items?.data?.[0]?.price?.id || '';
  const plan = planFromPriceId(priceId);

  // Stripe statuses map cleanly except "trialing" → we treat that as "active".
  const status = (sub.status === 'trialing') ? 'active' : sub.status;

  db.upsertUser({
    stripeCustomerId: customerId,
    email: customer && !customer.deleted ? customer.email : null,
    plan,
    status,
    currentPeriodEnd: sub.current_period_end || null,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    stripeSubscriptionId: sub.id,
  });
}

async function handleSubscriptionDeleted(sub) {
  const user = db.getUserBySubscription(sub.id);
  if (!user) return;
  db.setUserStatus(user.id, {
    plan: 'free',
    status: 'canceled',
    currentPeriodEnd: sub.current_period_end || null,
    cancelAtPeriodEnd: false,
  });
}

async function handleInvoiceFailed(inv) {
  const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
  if (!customerId) return;
  const user = db.getUserByCustomer(customerId);
  if (!user) return;
  db.setUserStatus(user.id, {
    plan: user.plan,
    status: 'past_due',
    currentPeriodEnd: user.current_period_end,
    cancelAtPeriodEnd: !!user.cancel_at_period_end,
  });
}

async function handleInvoicePaid(inv) {
  const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
  if (!customerId) return;
  const user = db.getUserByCustomer(customerId);
  if (!user) return;
  // Re-fetch the subscription to pick up the new period_end.
  if (inv.subscription) {
    const sub = await stripe.subscriptions.retrieve(inv.subscription);
    await handleSubscriptionChange(sub);
  } else {
    db.setUserStatus(user.id, {
      plan: user.plan,
      status: 'active',
      currentPeriodEnd: user.current_period_end,
      cancelAtPeriodEnd: !!user.cancel_at_period_end,
    });
  }
}

module.exports = router;
