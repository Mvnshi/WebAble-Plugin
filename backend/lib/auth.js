// JWT issue/verify + Express middleware for /api/ai/* routes.

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const db = require('./db');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET === 'replace_me_with_a_real_random_secret') {
  console.error('FATAL: JWT_SECRET missing or default. Set a real secret in .env.');
  process.exit(1);
}

const TTL_DAYS = parseInt(process.env.JWT_TTL_DAYS || '30', 10);
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

function issueToken(user) {
  const jti = crypto.randomBytes(16).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + TTL_SECONDS;
  const token = jwt.sign(
    {
      sub: String(user.id),
      cus: user.stripe_customer_id,
      email: user.email || null,
      plan: user.plan,
      status: user.status,
      jti,
    },
    SECRET,
    { algorithm: 'HS256', expiresIn: TTL_SECONDS }
  );
  db.recordToken(jti, user.id, exp);
  return { token, expiresAt: exp };
}

function verifyToken(token) {
  try {
    const payload = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
    if (db.isTokenRevoked(payload.jti)) return { ok: false, error: 'Token revoked' };
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Express middleware. Sets req.user on success, returns 401 on failure.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: 'Missing Bearer token' });
  const out = verifyToken(match[1]);
  if (!out.ok) return res.status(401).json({ error: out.error });

  const user = db.getUserById(parseInt(out.payload.sub, 10));
  if (!user) return res.status(401).json({ error: 'User not found' });

  // Plan check is handled per route — some routes (e.g. /me) work for any
  // authenticated user; the AI routes additionally require an active sub.
  req.user = user;
  req.tokenPayload = out.payload;
  next();
}

// Stricter — requires an active Pro subscription.
function requireActiveSub(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (req.user.status !== 'active') {
    return res.status(402).json({
      error: 'Subscription not active',
      status: req.user.status,
      plan: req.user.plan,
      hint: 'Re-activate your subscription in the Stripe billing portal.',
    });
  }
  next();
}

module.exports = { issueToken, verifyToken, requireAuth, requireActiveSub };
