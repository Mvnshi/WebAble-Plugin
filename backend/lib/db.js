// WebAble Pro — SQLite database wrapper.
// Single file: data/webable.db. WAL mode enabled by migrations.sql for
// concurrent reads while a writer is open.

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'webable.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply migrations on every startup. Idempotent.
const migrations = fs.readFileSync(path.join(__dirname, '..', 'migrations.sql'), 'utf8');
db.exec(migrations);

// ─── Prepared statements ──────────────────────────────────────
const stmts = {
  upsertUser: db.prepare(`
    INSERT INTO users (stripe_customer_id, email, plan, status, current_period_end, cancel_at_period_end, stripe_subscription_id, updated_at)
    VALUES (@stripe_customer_id, @email, @plan, @status, @current_period_end, @cancel_at_period_end, @stripe_subscription_id, strftime('%s','now'))
    ON CONFLICT(stripe_customer_id) DO UPDATE SET
      email = excluded.email,
      plan = excluded.plan,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      stripe_subscription_id = excluded.stripe_subscription_id,
      updated_at = strftime('%s','now')
    RETURNING id
  `),
  getUserByCustomer: db.prepare(`SELECT * FROM users WHERE stripe_customer_id = ?`),
  getUserById: db.prepare(`SELECT * FROM users WHERE id = ?`),
  getUserBySubscription: db.prepare(`SELECT * FROM users WHERE stripe_subscription_id = ?`),
  setUserStatus: db.prepare(`
    UPDATE users
       SET plan = @plan,
           status = @status,
           current_period_end = @current_period_end,
           cancel_at_period_end = @cancel_at_period_end,
           updated_at = strftime('%s','now')
     WHERE id = @id
  `),

  getUsage: db.prepare(`SELECT count FROM usage WHERE user_id = ? AND day = ?`),
  bumpUsage: db.prepare(`
    INSERT INTO usage (user_id, day, count, last_kind, updated_at)
    VALUES (@user_id, @day, 1, @kind, strftime('%s','now'))
    ON CONFLICT(user_id, day) DO UPDATE SET
      count = count + 1,
      last_kind = excluded.last_kind,
      updated_at = strftime('%s','now')
    RETURNING count
  `),

  recordEvent: db.prepare(`INSERT OR IGNORE INTO stripe_events (id, type) VALUES (?, ?)`),
  haveEvent:   db.prepare(`SELECT 1 FROM stripe_events WHERE id = ?`),

  saveToken:   db.prepare(`INSERT INTO auth_tokens (jti, user_id, expires_at) VALUES (?, ?, ?)`),
  revokeToken: db.prepare(`UPDATE auth_tokens SET revoked_at = strftime('%s','now') WHERE jti = ?`),
  isRevoked:   db.prepare(`SELECT 1 FROM auth_tokens WHERE jti = ? AND revoked_at IS NOT NULL`),
};

// ─── Public API ────────────────────────────────────────────────
function upsertUser(input) {
  const out = stmts.upsertUser.get({
    stripe_customer_id: input.stripeCustomerId,
    email: input.email || null,
    plan: input.plan || 'free',
    status: input.status || 'inactive',
    current_period_end: input.currentPeriodEnd || null,
    cancel_at_period_end: input.cancelAtPeriodEnd ? 1 : 0,
    stripe_subscription_id: input.stripeSubscriptionId || null,
  });
  return out.id;
}

function getUserByCustomer(customerId) {
  return stmts.getUserByCustomer.get(customerId);
}

function getUserById(id) {
  return stmts.getUserById.get(id);
}

function getUserBySubscription(subId) {
  return stmts.getUserBySubscription.get(subId);
}

function setUserStatus(id, { plan, status, currentPeriodEnd, cancelAtPeriodEnd }) {
  stmts.setUserStatus.run({
    id,
    plan,
    status,
    current_period_end: currentPeriodEnd || null,
    cancel_at_period_end: cancelAtPeriodEnd ? 1 : 0,
  });
}

// Returns the *new* count after incrementing.
function bumpUsage(userId, kind) {
  const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const out = stmts.bumpUsage.get({ user_id: userId, day, kind: kind || null });
  return out.count;
}

function getUsageToday(userId) {
  const day = new Date().toISOString().slice(0, 10);
  const row = stmts.getUsage.get(userId, day);
  return row?.count || 0;
}

// Stripe webhook idempotency. Returns true if this event is fresh.
function recordEventIfFresh(eventId, type) {
  if (stmts.haveEvent.get(eventId)) return false;
  stmts.recordEvent.run(eventId, type);
  return true;
}

function recordToken(jti, userId, expiresAt) {
  stmts.saveToken.run(jti, userId, expiresAt);
}

function revokeToken(jti) {
  stmts.revokeToken.run(jti);
}

function isTokenRevoked(jti) {
  return !!stmts.isRevoked.get(jti);
}

module.exports = {
  db,
  upsertUser,
  getUserByCustomer,
  getUserById,
  getUserBySubscription,
  setUserStatus,
  bumpUsage,
  getUsageToday,
  recordEventIfFresh,
  recordToken,
  revokeToken,
  isTokenRevoked,
};

// Allow `node lib/db.js` to bootstrap the schema without starting the server.
if (require.main === module) {
  console.log('Schema applied at', DB_PATH);
  process.exit(0);
}
