// Gemini proxy. Same shape as the extension's gemini.js, but server-side and
// using the OPERATOR's API key (not the user's). Pro subscribers' AI calls
// flow through these functions.
//
// We intentionally mirror the extension's surface so the extension can swap
// between BYOK (direct browser → Google) and Pro (browser → us → Google) by
// just flipping the URL it calls.

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TEXT_MODEL = 'gemini-2.0-flash';
const VISION_MODEL = 'gemini-2.0-flash';

const OP_KEY = process.env.GEMINI_API_KEY;
if (!OP_KEY) {
  console.warn('[gemini] GEMINI_API_KEY missing in .env — AI proxy will return 503 until set.');
}

const DEBUG = process.env.DEBUG_GEMINI === '1';

async function rawCall(path, body, opts = {}) {
  if (!OP_KEY) {
    throw Object.assign(new Error('Server is not configured for AI (operator key missing).'), { code: 'NO_OPERATOR_KEY', status: 503 });
  }
  const url = `${API_BASE}/${path}?key=${encodeURIComponent(OP_KEY)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 30000);
  try {
    if (DEBUG) console.log('[gemini] →', path, JSON.stringify(body).slice(0, 200));
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = `Gemini API error ${res.status}`;
      try { msg = JSON.parse(text)?.error?.message || msg; } catch {}
      throw Object.assign(new Error(msg), { code: 'GEMINI_ERROR', status: res.status });
    }
    const json = await res.json();
    if (DEBUG) console.log('[gemini] ←', JSON.stringify(json).slice(0, 200));
    return json;
  } finally { clearTimeout(t); }
}

// Generic generation. Mirrors the extension's gemini.js.generate signature
// so the extension can call /api/ai/generate with the same params shape.
async function generate({ prompt, system, image, json, temperature = 0.4, maxTokens = 1024 }) {
  const parts = [{ text: prompt || '' }];
  if (image) parts.push({ inline_data: image });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: json ? 'application/json' : 'text/plain',
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const model = image ? VISION_MODEL : TEXT_MODEL;
  const res = await rawCall(`models/${model}:generateContent`, body);
  const text = res?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (json) {
    try { return JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (m) try { return JSON.parse(m[0]); } catch {}
      throw Object.assign(new Error('Gemini returned non-JSON output.'), { code: 'BAD_JSON', raw: text });
    }
  }
  return text.trim();
}

// Feature-specific helpers. The extension calls these via /api/ai/<kind>.
async function altText({ image, context }) {
  const system = `You are an accessibility expert writing alt text for screen reader users.
Rules:
- Maximum 125 characters.
- No "Image of" / "Picture of" / "Photo of" prefixes.
- Describe what's IN the image AND why it matters in this context.
- Plain language. Active voice. End with a period.
- If the image is purely decorative, reply with the literal string "DECORATIVE".`;
  const prompt = `Page title: ${context?.title || '(unknown)'}
Surrounding paragraph: ${(context?.paragraph || '(none)').slice(0, 800)}
Page URL: ${context?.url || ''}

Generate the alt text now.`;
  return generate({ system, prompt, image, maxTokens: 100, temperature: 0.4 });
}

async function summarize({ text, context }) {
  const system = `You are a plain-language editor. You rewrite content at a B2 / 8th-grade reading level (Flesch reading ease 60-70).
Rules:
- Lead with what the page is and what the reader can do here. One sentence.
- Then 3 short paragraphs. No bullet lists. No marketing tone.
- Use short sentences and common words. Avoid jargon.
- Do not add information that isn't in the source.`;
  const prompt = `Page title: ${context?.title || '(untitled)'}
Page URL: ${context?.url || ''}

Page content:
${(text || '').slice(0, 14000)}`;
  return generate({ system, prompt, maxTokens: 700, temperature: 0.3 });
}

async function pageQA({ question, snapshot }) {
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
  return generate({ system, prompt, maxTokens: 300, temperature: 0.2, json: true });
}

async function ocr({ image }) {
  const prompt = `Extract ALL text visible in this image, in natural reading order. Preserve line breaks and paragraph structure. If there is no text, reply with literally "(no text detected)".`;
  return generate({ prompt, image, maxTokens: 2048, temperature: 0.1 });
}

async function remediationGuide({ reportMarkdown }) {
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
  return generate({ system, prompt: reportMarkdown, maxTokens: 4096, temperature: 0.3 });
}

module.exports = { generate, altText, summarize, pageQA, ocr, remediationGuide };
