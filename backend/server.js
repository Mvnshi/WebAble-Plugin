// WebAble Pro backend entrypoint.
// Order matters: webhook MUST be mounted with raw body BEFORE the JSON parser.

require('dotenv').config();

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

const checkoutRoutes = require('./routes/checkout');
const portalRoutes   = require('./routes/portal');
const aiRoutes       = require('./routes/ai');
const webhookRoutes  = require('./routes/webhook');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ─── CORS for the extension ────────────────────────────────────
// Chrome extension origins look like `chrome-extension://abcdef...`. Origin
// IDs are random in dev and stable in production. We match a wildcard list
// from ALLOWED_ORIGINS. Set `*` to disable CORS check entirely (not advised).
const allowList = (process.env.ALLOWED_ORIGINS || 'chrome-extension://*')
  .split(',').map((s) => s.trim()).filter(Boolean);
function originAllowed(origin) {
  if (!origin) return false;
  return allowList.some((rule) => {
    if (rule === '*') return true;
    if (rule.endsWith('/*')) return origin.startsWith(rule.slice(0, -1));
    if (rule.endsWith('*'))  return origin.startsWith(rule.slice(0, -1));
    return origin === rule;
  });
}
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// ─── Webhook FIRST (raw body) ──────────────────────────────────
app.use('/api/webhooks', webhookRoutes);

// ─── Health ─────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => {
  res.json({
    ok: true,
    name: 'webable-backend',
    version: '1.0.0',
    publicUrl: process.env.PUBLIC_BASE_URL || '',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    pricesConfigured: !!(process.env.STRIPE_PRICE_MONTHLY && process.env.STRIPE_PRICE_ANNUAL),
    webhookConfigured: !!process.env.STRIPE_WEBHOOK_SECRET,
  });
});

// ─── API routes ────────────────────────────────────────────────
app.use('/api/checkout', checkoutRoutes);
app.use('/api/billing',  portalRoutes);
app.use('/api/ai',       aiRoutes);

// ─── Public pages ──────────────────────────────────────────────
// /checkout/success and /checkout/cancel are served from the checkout router
// for convenience (they share state with the API). Also expose a tiny landing
// page at /, so the operator can sanity-check "is the server up" by browser.
app.get('/checkout/:rest', (req, res, next) => {
  // Forward to /api/checkout/<rest>
  req.url = '/api/checkout/' + req.params.rest;
  next('route');
});
app.use((req, res, next) => {
  if (req.url.startsWith('/api/checkout/')) return next();
  next();
});
app.use('/api/checkout', checkoutRoutes);
app.get('/billing/back', (req, res) => {
  req.url = '/api/billing/back';
  portalRoutes.handle(req, res);
});

app.get('/', (_req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'views', 'landing.html'), 'utf8');
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

// ─── 404 ────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Listen ─────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '8787', 10);
app.listen(PORT, () => {
  console.log(`WebAble backend listening on http://localhost:${PORT}`);
  console.log(`Public base URL:        ${process.env.PUBLIC_BASE_URL || '(unset)'}`);
  console.log(`Stripe configured:      ${!!process.env.STRIPE_SECRET_KEY}`);
  console.log(`Webhook secret set:     ${!!process.env.STRIPE_WEBHOOK_SECRET}`);
  console.log(`Gemini key set:         ${!!process.env.GEMINI_API_KEY}`);
  console.log(`Pro daily limit:        ${process.env.PRO_DAILY_LIMIT || 500}`);
});
