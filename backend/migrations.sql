-- WebAble Pro — schema
-- Run automatically by lib/db.js on startup. Idempotent — safe to run repeatedly.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Users keyed by Stripe customer. Email comes from Stripe Checkout.
-- We never collect or store passwords; the Stripe customer record IS the
-- account, and we issue JWTs on top of it.
CREATE TABLE IF NOT EXISTS users (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email              TEXT,
  plan               TEXT NOT NULL DEFAULT 'free',           -- free | pro_monthly | pro_annual
  status             TEXT NOT NULL DEFAULT 'inactive',       -- inactive | active | past_due | canceled
  current_period_end INTEGER,                                -- unix epoch from Stripe subscription
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,           -- 0/1
  stripe_subscription_id TEXT,
  created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_subscription ON users(stripe_subscription_id);

-- Daily usage counter for rate limiting. One row per user per UTC day.
-- The composite primary key prevents duplicate rows from races.
CREATE TABLE IF NOT EXISTS usage (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     TEXT    NOT NULL,                                  -- YYYY-MM-DD (UTC)
  count   INTEGER NOT NULL DEFAULT 0,
  last_kind TEXT,                                            -- last feature called: 'summary' | 'qa' | 'alt' | 'ocr' | 'guide'
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_usage_day ON usage(day);

-- Webhook event log. Stripe re-delivers events on failure, so we track which
-- ones we've already processed to make the handler idempotent.
CREATE TABLE IF NOT EXISTS stripe_events (
  id              TEXT PRIMARY KEY,                           -- evt_xxx from Stripe
  type            TEXT NOT NULL,
  processed_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- Audit log of every token issued. Lets us revoke per-token if needed.
CREATE TABLE IF NOT EXISTS auth_tokens (
  jti        TEXT PRIMARY KEY,                                -- random JWT id
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id);
