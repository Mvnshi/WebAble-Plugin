// WebAble Gemini wrapper — shared across content script, options page, and analyzer.
//
// Two modes:
//   BYOK — user pasted their own Gemini key. Calls go directly browser → Google.
//   Pro  — user is subscribed via the WebAble backend. Calls go browser →
//          backend → Google. Backend uses the operator's key + tracks usage.
//
// Mode is decided per-call: if a Pro session token is present, use Pro;
// else if a Gemini key is present, use BYOK; else throw NO_KEY.

(() => {
  if (window.WebAbleGemini) return;

  // ─── BYOK direct-to-Google config ────────────────────────────
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const TEXT_MODEL = 'gemini-2.0-flash';
  const VISION_MODEL = 'gemini-2.0-flash';

  // ─── Storage helpers ─────────────────────────────────────────
  async function readStore() {
    try {
      const { webable } = await chrome.storage.local.get('webable');
      return webable || {};
    } catch { return {}; }
  }

  async function getKey() {
    return ((await readStore()).apiKey || '').trim();
  }
  async function getProSession() {
    const s = await readStore();
    return s.pro && s.pro.token ? s.pro : null;
  }
  async function getMode() {
    const pro = await getProSession();
    if (pro && pro.status === 'active') return 'pro';
    if (await getKey()) return 'byok';
    return 'none';
  }
  async function hasKey() {
    return (await getMode()) !== 'none';
  }

  function backendBase(session) {
    return (session?.backendUrl || '').replace(/\/$/, '');
  }

  // ─── Pro path — call our backend ──────────────────────────────
  async function proCall(endpoint, body, opts = {}) {
    const session = await getProSession();
    if (!session) throw Object.assign(new Error('Pro session missing.'), { code: 'NO_SESSION' });
    const base = backendBase(session);
    if (!base) throw Object.assign(new Error('Pro backend URL missing.'), { code: 'NO_BACKEND' });
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs || 60000);
    try {
      const res = await fetch(`${base}/api/ai/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.token,
        },
        body: JSON.stringify(body || {}),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data?.error || `Backend error ${res.status}`);
        err.code = data?.code || (res.status === 402 ? 'INACTIVE_SUB' : res.status === 401 ? 'BAD_TOKEN' : res.status === 429 ? 'DAILY_LIMIT' : 'BACKEND_ERROR');
        err.status = res.status;
        throw err;
      }
      // Side-channel: backend returns updated usage with each call. Cache it
      // so the Options panel can reflect quota without an extra request.
      if (data.usage) {
        try {
          const cur = await readStore();
          cur.proUsage = { ...data.usage, at: Date.now() };
          await chrome.storage.local.set({ webable: cur });
        } catch (_) {}
      }
      return data.result;
    } finally { clearTimeout(timeout); }
  }

  // Used by Options page to validate token + get current quota.
  async function proMe() {
    const session = await getProSession();
    if (!session) return { ok: false, error: 'no-session' };
    const base = backendBase(session);
    if (!base) return { ok: false, error: 'no-backend' };
    try {
      const res = await fetch(`${base}/api/ai/me`, {
        headers: { 'Authorization': 'Bearer ' + session.token },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}`, status: res.status };
      return { ok: true, ...data };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // Open Stripe Customer Portal in a new tab.
  async function proPortal() {
    const session = await getProSession();
    if (!session) throw Object.assign(new Error('Not signed in to Pro.'), { code: 'NO_SESSION' });
    const res = await fetch(`${backendBase(session)}/api/billing/create`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + session.token, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || 'Portal error');
    return data.url;
  }

  // Start checkout — backend creates a Stripe Checkout session and returns the URL.
  async function proCheckout({ backendUrl, plan }) {
    const base = (backendUrl || '').replace(/\/$/, '');
    if (!base) throw new Error('Backend URL is required.');
    const res = await fetch(`${base}/api/checkout/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: plan || 'monthly',
        extensionId: chrome.runtime?.id || '',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data.url;
  }

  // Logout — revoke token on backend, wipe locally.
  async function proLogout() {
    const session = await getProSession();
    if (session) {
      try {
        await fetch(`${backendBase(session)}/api/ai/logout`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + session.token },
        });
      } catch (_) {}
    }
    const cur = await readStore();
    delete cur.pro;
    delete cur.proUsage;
    await chrome.storage.local.set({ webable: cur });
  }

  // ─── BYOK path — call Google directly ────────────────────────
  async function rawCall(path, body, opts = {}) {
    const key = opts.key || await getKey();
    if (!key) throw Object.assign(new Error('No Gemini API key. Add one in WebAble Settings, or upgrade to Pro.'), { code: 'NO_KEY' });
    const url = `${API_BASE}/${path}?key=${encodeURIComponent(key)}`;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs || 30000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let msg = `Gemini API error ${res.status}`;
        try { msg = JSON.parse(errText)?.error?.message || msg; } catch {}
        throw Object.assign(new Error(msg), { code: res.status === 401 || res.status === 403 ? 'BAD_KEY' : 'API_ERROR', status: res.status });
      }
      return res.json();
    } finally { clearTimeout(timeout); }
  }

  async function byokGenerate(prompt, opts = {}) {
    const parts = [{ text: prompt }];
    if (opts.image) parts.push({ inline_data: opts.image });
    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxTokens ?? 1024,
        responseMimeType: opts.json ? 'application/json' : 'text/plain',
      },
    };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    const model = opts.image ? VISION_MODEL : TEXT_MODEL;
    const res = await rawCall(`models/${model}:generateContent`, body, opts);
    const text = res?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (opts.json) {
      try { return JSON.parse(text); }
      catch {
        const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (m) try { return JSON.parse(m[0]); } catch {}
        throw Object.assign(new Error('Gemini returned non-JSON output.'), { code: 'BAD_JSON', raw: text });
      }
    }
    return text.trim();
  }

  // ─── Public helpers — auto-pick mode per call ────────────────
  async function generate(prompt, opts = {}) {
    const mode = await getMode();
    if (mode === 'pro') {
      return proCall('generate', { prompt, ...opts });
    }
    return byokGenerate(prompt, opts);
  }

  // Validate a BYOK key by listing models.
  async function testKey(key) {
    if (!key || !key.trim()) return { ok: false, error: 'Key is empty.' };
    try {
      const res = await fetch(`${API_BASE}/models?key=${encodeURIComponent(key.trim())}`);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let msg = `${res.status} ${res.statusText}`;
        try { msg = JSON.parse(errText)?.error?.message || msg; } catch {}
        return { ok: false, error: msg, status: res.status };
      }
      const data = await res.json();
      const geminiModels = (data.models || []).filter((m) => /gemini/i.test(m.name || ''));
      return { ok: geminiModels.length > 0, models: geminiModels.length, error: geminiModels.length ? '' : 'No Gemini models accessible.' };
    } catch (e) {
      return { ok: false, error: e.message || 'Network error.' };
    }
  }

  async function imageToInlineData(imgEl) {
    const src = imgEl?.currentSrc || imgEl?.src;
    if (!src) throw new Error('No image source on this element.');
    try {
      const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 4 * 1024 * 1024) throw new Error('Image larger than 4 MB.');
        return await blobToInline(blob);
      }
    } catch (_) {}
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imgEl.naturalWidth || imgEl.width || 256;
      canvas.height = imgEl.naturalHeight || imgEl.height || 256;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imgEl, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const [meta, b64] = dataUrl.split(',');
      const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
      return { mime_type: mime, data: b64 };
    } catch (_) {}
    throw Object.assign(new Error('This image refused both fetch() and canvas access (cross-origin).'), { code: 'CORS_BLOCKED' });
  }

  function blobToInline(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        const [meta, b64] = dataUrl.split(',');
        const mime = (meta.match(/data:([^;]+)/) || [])[1] || blob.type || 'image/jpeg';
        resolve({ mime_type: mime, data: b64 });
      };
      reader.onerror = () => reject(new Error('Could not read image bytes.'));
      reader.readAsDataURL(blob);
    });
  }

  // ─── Per-feature wrappers ────────────────────────────────────
  // Each chooses Pro or BYOK at call time. Same surface as v1.2 so the
  // calling code in content.js doesn't change.
  async function generateAltText(imgEl, ctx = {}) {
    const inline = await imageToInlineData(imgEl);
    if (await getMode() === 'pro') {
      return proCall('alt-text', { image: inline, context: ctx });
    }
    const system = `You are an accessibility expert writing alt text for screen reader users.
Rules:
- Maximum 125 characters.
- No "Image of" / "Picture of" / "Photo of" prefixes.
- Describe what's IN the image AND why it matters in this context.
- Plain language. Active voice. End with a period.
- If the image is purely decorative, reply with the literal string "DECORATIVE".`;
    const prompt = `Page title: ${ctx.title || '(unknown)'}
Surrounding paragraph: ${(ctx.paragraph || '(none)').slice(0, 800)}
Page URL: ${ctx.url || ''}

Generate the alt text now.`;
    return byokGenerate(prompt, { system, image: inline, maxTokens: 100, temperature: 0.4 }).then((s) => s.replace(/^["']|["']$/g, '').trim());
  }

  async function summarize(text, ctx = {}) {
    if (await getMode() === 'pro') {
      return proCall('summarize', { text, context: ctx });
    }
    const system = `You are a plain-language editor. You rewrite content at a B2 / 8th-grade reading level (Flesch reading ease 60-70).
Rules:
- Lead with what the page is and what the reader can do here. One sentence.
- Then 3 short paragraphs. No bullet lists. No marketing tone.
- Use short sentences and common words. Avoid jargon.
- Do not add information that isn't in the source.`;
    const prompt = `Page title: ${ctx.title || '(untitled)'}
Page URL: ${ctx.url || ''}

Page content:
${(text || '').slice(0, 14000)}`;
    return byokGenerate(prompt, { system, maxTokens: 700, temperature: 0.3 });
  }

  async function pageQA(question, snapshot) {
    if (await getMode() === 'pro') {
      return proCall('page-qa', { question, snapshot });
    }
    const system = `You help users find things on web pages. Given a list of clickable elements and headings, return the single best match for the user's question.
Reply ONLY in JSON with this exact schema:
{ "id": "<the id field of the matching item, or null>",
  "label": "<the visible label of that item>",
  "confidence": <0..1 number>,
  "explanation": "<one short sentence>" }`;
    const prompt = `User's question: "${question}"

Page elements (JSON):
${snapshot}

Return JSON now.`;
    return byokGenerate(prompt, { system, maxTokens: 300, temperature: 0.2, json: true });
  }

  async function ocrImage(imgEl) {
    const inline = await imageToInlineData(imgEl);
    if (await getMode() === 'pro') {
      return proCall('ocr', { image: inline });
    }
    const prompt = `Extract ALL text visible in this image, in natural reading order. Preserve line breaks and paragraph structure. If there is no text, reply with literally "(no text detected)".`;
    return byokGenerate(prompt, { image: inline, maxTokens: 2048, temperature: 0.1 });
  }

  async function remediationGuide(reportSummary) {
    if (await getMode() === 'pro') {
      return proCall('remediation-guide', { reportMarkdown: reportSummary });
    }
    const system = `You are a senior accessibility engineer writing a developer-facing remediation ticket.
For each finding, write:
## <Finding title> — WCAG <SC>
**Severity:** <severity>
**Who this hurts:** <one sentence, real users>
**Why automated overlays can't fix this:** <one sentence — context is needed>
**Fix:**
\`\`\`html
<!-- Before -->
<!-- After -->
\`\`\`
**Acceptance criteria:** <bullet list>

Markdown only. Be terse and useful.`;
    return byokGenerate(reportSummary, { system, maxTokens: 4096, temperature: 0.3 });
  }

  window.WebAbleGemini = {
    // Mode + auth
    getKey,
    hasKey,
    getMode,
    getProSession,
    proMe,
    proCheckout,
    proPortal,
    proLogout,
    // BYOK helpers
    testKey,
    // Generic + per-feature
    generate,
    generateAltText,
    summarize,
    pageQA,
    ocrImage,
    remediationGuide,
    imageToInlineData,
  };
})();
