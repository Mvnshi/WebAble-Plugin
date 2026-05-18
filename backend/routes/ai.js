// AI proxy. The extension's gemini.js calls these endpoints when WebAble Pro
// mode is active. Each endpoint is rate-limited per-user and gated on an
// active subscription.

const express = require('express');
const { requireAuth, requireActiveSub, issueToken } = require('../lib/auth');
const usage = require('../lib/usage');
const gemini = require('../lib/gemini');
const db = require('../lib/db');

const router = express.Router();
router.use(express.json({ limit: '12mb' })); // images can be sizable

// /api/ai/me — sanity-check token + return current quota.
router.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  const q = usage.check(u.id);
  res.json({
    user: {
      id: u.id,
      email: u.email,
      plan: u.plan,
      status: u.status,
      currentPeriodEnd: u.current_period_end,
      cancelAtPeriodEnd: !!u.cancel_at_period_end,
    },
    usage: q,
  });
});

// Token rotation. Extension calls this when remaining TTL < 7d.
router.post('/refresh', requireAuth, (req, res) => {
  const next = issueToken(req.user);
  res.json({ token: next.token, expiresAt: next.expiresAt });
});

// ─── Per-feature endpoints ────────────────────────────────────
// Each one mirrors the extension's gemini.js helper signature, but the
// body fields are wrapped in an outer object so we can track which feature
// was called for usage analytics.

function aiHandler(kind, fn) {
  return async (req, res) => {
    try {
      const u = usage.bumpOrFail(req.user.id, kind);
      const out = await fn(req.body || {});
      res.json({ result: out, usage: u });
    } catch (e) {
      const status = e.status || 500;
      res.status(status).json({ error: e.message, code: e.code || 'AI_ERROR' });
    }
  };
}

router.post('/alt-text',          requireAuth, requireActiveSub, aiHandler('alt',     ({ image, context }) => gemini.altText({ image, context })));
router.post('/summarize',         requireAuth, requireActiveSub, aiHandler('summary', ({ text, context })  => gemini.summarize({ text, context })));
router.post('/page-qa',           requireAuth, requireActiveSub, aiHandler('qa',      ({ question, snapshot }) => gemini.pageQA({ question, snapshot })));
router.post('/ocr',               requireAuth, requireActiveSub, aiHandler('ocr',     ({ image }) => gemini.ocr({ image })));
router.post('/remediation-guide', requireAuth, requireActiveSub, aiHandler('guide',   ({ reportMarkdown }) => gemini.remediationGuide({ reportMarkdown })));

// Generic catch-all — for forward-compat, lets the extension call any prompt
// directly. Same auth + rate limit + usage tracking.
router.post('/generate', requireAuth, requireActiveSub, aiHandler('generate', (b) => gemini.generate(b)));

// Logout — revoke this token. Future requests with it return 401.
router.post('/logout', requireAuth, (req, res) => {
  db.revokeToken(req.tokenPayload.jti);
  res.json({ ok: true });
});

module.exports = router;
