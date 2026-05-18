// Stripe SDK wrapper + small helpers.

const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('FATAL: STRIPE_SECRET_KEY missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: false,
  appInfo: { name: 'WebAble Pro Backend', version: '1.0.0' },
});

// Resolve a Stripe price object → human plan name. We map by env vars rather
// than nicknames so the operator just pastes price IDs in .env and we figure
// out the rest.
function planFromPriceId(priceId) {
  if (priceId === process.env.STRIPE_PRICE_MONTHLY) return 'pro_monthly';
  if (priceId === process.env.STRIPE_PRICE_ANNUAL)  return 'pro_annual';
  return 'free';
}

// All available plans, used to populate the extension's pricing UI.
function publicPlans() {
  return {
    monthly: {
      priceId: process.env.STRIPE_PRICE_MONTHLY || '',
      label: 'WebAble Pro · Monthly',
    },
    annual: {
      priceId: process.env.STRIPE_PRICE_ANNUAL || '',
      label: 'WebAble Pro · Annual',
    },
  };
}

module.exports = { stripe, planFromPriceId, publicPlans };
