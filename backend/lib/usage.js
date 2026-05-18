// Daily rate-limit guard. Wraps Pro AI handlers so a bad token / leaked key
// can't run up an unbounded Gemini bill.

const db = require('./db');

const DAILY_LIMIT = parseInt(process.env.PRO_DAILY_LIMIT || '500', 10);

function check(userId) {
  const used = db.getUsageToday(userId);
  return {
    used,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - used),
    over: used >= DAILY_LIMIT,
  };
}

// Returns { ok, count, remaining } after incrementing. Throws 429-like if over.
function bumpOrFail(userId, kind) {
  const before = check(userId);
  if (before.over) {
    const err = new Error(`Daily limit reached (${DAILY_LIMIT}/day). Resets at UTC midnight.`);
    err.status = 429;
    err.code = 'DAILY_LIMIT';
    throw err;
  }
  const newCount = db.bumpUsage(userId, kind);
  return {
    count: newCount,
    limit: DAILY_LIMIT,
    remaining: Math.max(0, DAILY_LIMIT - newCount),
  };
}

module.exports = { check, bumpOrFail, DAILY_LIMIT };
