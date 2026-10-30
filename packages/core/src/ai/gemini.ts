/**
 * Gemini provider: bring-your-own key. Talks to the Generative Language REST
 * API directly so we never ship a heavy SDK into the host page. The key is read
 * lazily through a getter (so it is never captured/closed-over at construction)
 * and is only ever sent to Google; it is never logged.
 *
 * Client-side keys are exposed by nature. `createProxyProvider` is the seam for
 * a hosted gateway (the existing Express proxy, or a Cloudflare Worker) so that
 * hosted customers never ship a key in the browser. Default stays BYO key.
 */
import type { AIProvider } from '../types';
import {
  companionSystemPrompt,
  companionUserPrompt,
  createTagStream,
  geminiChunkText,
  parseCompanionReply,
  readSseStream,
  type CompanionEvent,
} from '@webable/companion';
import { toGuideReply } from '../tools/companion-bridge';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Ordered fallbacks for when a dated Gemini model id is retired ("no longer
 * available" / 404). The chosen model is tried first, then the floating
 * "-latest" alias (always the newest flash), then the cheapest lite model, so
 * a single deprecation degrades instead of breaking every AI action.
 */
const GEMINI_MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];

function isModelUnavailable(status: number, message: string): boolean {
  return status === 404 || /no longer available|not found|not supported|deprecated|does not exist/i.test(message);
}

export interface GeminiOptions {
  model?: string;
}

interface InlineImage {
  mimeType: string;
  data: string; // base64, no data: prefix
}

function splitDataUrl(dataUrl: string): InlineImage | null {
  const m = /^data:([^;]+);base64,(.*)$/i.exec(dataUrl);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

export function createGeminiProvider(getKey: () => string, opts: GeminiOptions = {}): AIProvider {
  const chosen = opts.model || 'gemini-2.5-flash';
  const models = [chosen, ...GEMINI_MODEL_FALLBACKS.filter((m) => m !== chosen)];

  async function generate(parts: unknown[], genConfig?: Record<string, unknown>): Promise<string> {
    const key = getKey();
    if (!key) throw new Error('No Gemini key set.');
    const payload = JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024, ...genConfig },
    });

    let res: Response | null = null;
    for (let i = 0; i < models.length; i++) {
      // Key goes in a header, never the URL: query strings leak into proxy
      // logs, browser history, and Referer headers.
      res = await fetch(`${ENDPOINT}/${models[i]}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: payload,
      });
      if (res.ok) break;
      // Retry on the next model only when this id is gone; a bad key or quota
      // fails identically on every model, so surface it immediately.
      const body = await res.text().catch(() => '');
      if (i < models.length - 1 && isModelUnavailable(res.status, body)) continue;
      const detail = res.status === 400 || res.status === 403 ? ' (check the key)' : '';
      throw new Error(`Gemini request failed: ${res.status}${detail}`);
    }
    if (!res || !res.ok) throw new Error('Gemini request failed.');
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text) throw new Error('Gemini returned no text.');
    return text.trim();
  }

  /**
   * Streaming Guide over Gemini's SSE endpoint. Model output is fed straight
   * through the companion tag parser, so a [POINT:...] reaches the overlay the
   * instant its closing bracket arrives rather than after the whole answer.
   * The model fallback list applies here too: a retired model id rolls to the
   * next one before any bytes are consumed.
   */
  async function streamGuide(
    input: { question: string; page: string; history?: Array<{ role: string; text: string }> },
    onEvent: (event: CompanionEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const key = getKey();
    if (!key) throw new Error('No Gemini key set.');
    const payload = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: companionUserPrompt({ question: input.question, surface: input.page, history: input.history }) }] }],
      systemInstruction: { parts: [{ text: companionSystemPrompt({ anchors: 'element' }) }] },
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    });

    let res: Response | null = null;
    for (let i = 0; i < models.length; i++) {
      res = await fetch(`${ENDPOINT}/${models[i]}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: payload,
        signal,
      });
      if (res.ok) break;
      const body = await res.text().catch(() => '');
      if (i < models.length - 1 && isModelUnavailable(res.status, body)) continue;
      const detail = res.status === 400 || res.status === 403 ? ' (check the key)' : '';
      throw new Error(`Gemini request failed: ${res.status}${detail}`);
    }
    if (!res || !res.ok || !res.body) throw new Error('Gemini returned no stream.');

    const tags = createTagStream();
    await readSseStream(
      res.body,
      (ev) => {
        const text = geminiChunkText(ev.data);
        if (text) for (const out of tags.push(text)) onEvent(out);
      },
      signal,
    );
    for (const out of tags.end()) onEvent(out);
  }

  return {
    id: 'gemini',
    isConfigured: () => !!getKey(),
    guideStream: streamGuide,

    async describeImage(input) {
      const parts: unknown[] = [
        {
          text:
            'Write concise, useful alt text for this image for a screen-reader user. ' +
            'One sentence, no "image of" preamble. Do not use em dashes.' +
            (input.context ? ` Page context: ${input.context.slice(0, 200)}` : ''),
        },
      ];
      const img = input.dataUrl ? splitDataUrl(input.dataUrl) : null;
      if (img) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      } else if (input.url) {
        parts.push({ text: `Image URL: ${input.url}` });
      } else {
        throw new Error('No image provided.');
      }
      return generate(parts);
    },

    async simplify(text, simplifyOpts) {
      const level = simplifyOpts?.level === 'plain' ? 'a 6th-grade reading level' : 'a clear, plain style';
      return generate([
        {
          text:
            `Rewrite the following text at ${level}. Keep the meaning and any key facts. ` +
            `Use short sentences. Do not use em dashes. Return only the rewritten text.\n\n${text.slice(0, 6000)}`,
        },
      ]);
    },

    async summarize(text, sumOpts) {
      const head = sumOpts?.title ? `Title: ${sumOpts.title}\n` : '';
      return generate([
        {
          text:
            'Summarize the following article in 3 to 5 short bullet points a reader can scan quickly. ' +
            'Return plain text bullets starting with "- ". Do not use em dashes.\n\n' +
            head +
            text.slice(0, 8000),
        },
      ]);
    },

    async ask(question, context) {
      return generate([
        {
          text:
            'Answer the question using only the article text below. If the answer is not in the text, ' +
            'say so briefly. Keep it short and plain. Do not use em dashes.\n\n' +
            `Question: ${question}\n\nArticle:\n${context.slice(0, 9000)}`,
        },
      ]);
    },

    async translate(text, targetLang) {
      return generate([
        {
          text: `Translate the following text into ${targetLang}. Return only the translation, with no notes, labels, or quotation marks.\n\n${text.slice(0, 6000)}`,
        },
      ]);
    },

    async explain(text) {
      return generate([
        {
          text:
            'Explain the following in plain, simple language for a general reader, in 2 to 3 short sentences. ' +
            'Do not use em dashes.\n\n' +
            text.slice(0, 4000),
        },
      ]);
    },

    async ocr(input) {
      const img = splitDataUrl(input.dataUrl);
      if (!img) throw new Error('No image provided.');
      return generate([
        {
          text:
            'Extract ALL text visible in this image, in natural reading order. ' +
            'Preserve line breaks and paragraph structure. If there is no text, reply with literally "(no text detected)".',
        },
        { inlineData: { mimeType: img.mimeType, data: img.data } },
      ]);
    },

    // Non-streaming fallback. Same protocol as the streaming path, so there is
    // one prompt and one parser rather than two that can drift apart.
    async guide(input) {
      const text = await generate(
        [
          {
            text:
              `${companionSystemPrompt({ anchors: 'element' })}\n\n` +
              companionUserPrompt({ question: input.question, surface: input.page, history: input.history }),
          },
        ],
        { maxOutputTokens: 2048 },
      );
      return toGuideReply(parseCompanionReply(text));
    },
  };
}

/** How a proxy provider authenticates. See createProxyProvider. */
export interface ProxyAuth {
  /** The subscriber JWT, or null when nobody is signed in. */
  getToken?: () => string | null;
  /**
   * The relay needs no bearer token: it is same-origin and authenticates by
   * cookie, or it is IP-allowlisted, or it is open. Deliberate, because the
   * default has to be the answer that is true of the WebAble relay.
   */
  anonymous?: boolean;
}

/**
 * Hosted proxy provider. Talks to the WebAble API (apps/api), which holds the
 * operator's Gemini key server-side: no key ever reaches the browser. The
 * token getter supplies the subscriber JWT; without one the provider reports
 * unconfigured and the UI shows its key/upgrade prompt.
 *
 * That last sentence has been in this comment all along and the code did the
 * opposite: `isConfigured` returned true whenever no getToken was passed at
 * all. `apps/widget/src/boot.ts` constructs exactly that on
 * `data-webable-ai-proxy`, so the widget announced working AI, sent no
 * Authorization header, and every request met `requireAuth` in
 * `apps/api/src/routes/ai.ts` and came back 401 after a round trip. The user
 * pressed a button that said it would work and waited for a failure.
 *
 * A relay that genuinely needs no token is a real configuration (a site owner
 * hosting their own, same-origin, behind a cookie), so it is still reachable.
 * It just has to be said out loud rather than being what silence means.
 */
export function createProxyProvider(
  baseUrl: string,
  auth?: (() => string | null) | ProxyAuth,
): AIProvider {
  const base = baseUrl.replace(/\/$/, '');
  const getToken = typeof auth === 'function' ? auth : auth?.getToken;
  const anonymous = typeof auth === 'function' ? false : !!auth?.anonymous;

  async function call(path: string, payload: Record<string, unknown>): Promise<string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}/ai/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string; code?: string };
    if (!res.ok) {
      // The server's own code is carried on the error, because callers have to
      // tell "the operator paused hosted AI" apart from "your subscription
      // lapsed". Both arrive as 503 and 402 respectively today, but the status
      // alone already conflates two different 503s: a paused relay and a server
      // with no operator key configured.
      const fail = (message: string): Error =>
        Object.assign(new Error(message), { code: json.code || `HTTP_${res.status}` });
      if (json.code === 'DAILY_LIMIT') throw fail('Daily AI limit reached. Resets at UTC midnight.');
      if (res.status === 401) throw fail('Sign in to use hosted AI.');
      if (res.status === 402) throw fail('Your subscription is not active.');
      throw fail(json.error || `AI request failed (${res.status}).`);
    }
    const out = json.result;
    return (typeof out === 'string' ? out : JSON.stringify(out ?? '')).trim();
  }

  // The API wants { mime_type, data }; the engine passes data URLs around.
  const toImage = (dataUrl: string | undefined) => {
    const img = dataUrl ? splitDataUrl(dataUrl) : null;
    if (!img) throw new Error('No image provided.');
    return { mime_type: img.mimeType, data: img.data };
  };

  /**
   * Streaming Guide through the hosted relay. The server holds the operator
   * key and re-emits Gemini's stream as SSE, so the browser gets the same
   * mid-sentence pointer movement without ever seeing a key.
   */
  async function streamGuide(
    input: { question: string; page: string; history?: Array<{ role: string; text: string }> },
    onEvent: (event: CompanionEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
    const token = getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}/ai/guide/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
      signal,
    });
    if (!res.ok || !res.body) {
      const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (json.code === 'DAILY_LIMIT') throw new Error('Daily AI limit reached. Resets at UTC midnight.');
      if (res.status === 401) throw new Error('Sign in to use hosted AI.');
      if (res.status === 402) throw new Error('Your subscription is not active.');
      throw new Error(json.error || `AI request failed (${res.status}).`);
    }

    const tags = createTagStream();
    let failure: string | null = null;
    await readSseStream(
      res.body,
      (ev) => {
        // The relay signals upstream failures in-band, since headers are long gone.
        if (ev.event === 'error') {
          failure = ev.data || 'The guide stream failed.';
          return;
        }
        if (!ev.data || ev.data === '[DONE]') return;
        // Deltas arrive JSON-encoded so newlines in narration cannot break framing.
        let text: string;
        try {
          const parsed: unknown = JSON.parse(ev.data);
          text = typeof parsed === 'string' ? parsed : '';
        } catch {
          text = ev.data;
        }
        if (text) for (const out of tags.push(text)) onEvent(out);
      },
      signal,
    );
    for (const out of tags.end()) onEvent(out);
    if (failure) throw new Error(failure);
  }

  return {
    id: 'proxy',
    isConfigured: () => (anonymous ? true : !!getToken?.()),
    guideStream: streamGuide,
    describeImage: (input) =>
      call('describe-image', {
        image: toImage(input.dataUrl),
        context: input.context ? { paragraph: input.context } : undefined,
      }),
    simplify: (text, opts) => call('simplify', { text, level: opts?.level }),
    summarize: (text, opts) => call('summarize', { text, title: opts?.title, url: opts?.url }),
    ask: (question, context) => call('ask', { question, context }),
    translate: (text, targetLang) => call('translate', { text, targetLang }),
    explain: (text) => call('explain', { text }),
    ocr: (input) => call('ocr', { image: toImage(input.dataUrl) }),
    guide: async (input) => {
      // The hosted route returns a structured object; `call` stringifies it.
      const s = await call('guide', input as unknown as Record<string, unknown>);
      return toGuideReply(parseCompanionReply(s));
    },
  };
}
