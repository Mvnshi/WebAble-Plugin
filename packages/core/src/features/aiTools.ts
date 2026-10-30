/**
 * In-page AI reading tools that float over the host page (not the panel):
 *   - selectionBubble: select text -> a bubble offers Explain / Simplify /
 *     Translate / Define / Speak, answer shown inline.
 *   - clickDictionary: double-click a word -> a keyless definition popover.
 *   - tldrPin: one click pins a short summary card above the article.
 *
 * They reuse ctx.provider (AI) and ctx.tts (keyless speech). The popover is
 * rendered into its own shadow root so host-page CSS can't touch it and it
 * can't touch the page. Everything is ctx.own()'d / ctx.on()'d, so disable()
 * tears it all down. AI actions degrade gracefully with no key; Define and
 * Speak work with no key at all.
 */
import type { FeatureContext, FeatureModule, FeatureSetting } from '../types';
import { copyText } from '../tools/cleanCopy';

const POP_CSS = `
:host{all:initial}
.pop{font:14px/1.5 -apple-system,system-ui,'Segoe UI',sans-serif;color:#F6EEE4;background:#0F1C3F;
  border:1px solid rgba(246,238,228,.16);border-radius:12px;box-shadow:0 18px 50px -16px rgba(8,14,30,.6);
  max-width:360px;overflow:hidden}
.bar{display:flex;gap:2px;padding:5px}
.bar button{font:600 12px/1 inherit;color:#F6EEE4;background:transparent;border:0;border-radius:8px;
  padding:8px 10px;cursor:pointer}
.bar button:hover{background:rgba(246,238,228,.12)}
.body{padding:12px 14px;max-height:300px;overflow:auto;white-space:pre-wrap}
.title{font-weight:700;margin:0 0 4px}
.muted{color:rgba(246,238,228,.6);font-size:12.5px}
.row{display:flex;gap:6px;padding:8px 12px;border-top:1px solid rgba(246,238,228,.12)}
.row button{font:600 12px/1 inherit;color:#0F1C3F;background:#F6EEE4;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}
.row button.ghost{color:#F6EEE4;background:rgba(246,238,228,.12)}
`;

const LANGS = ['Spanish', 'French', 'German', 'Italian', 'Chinese', 'Japanese', 'Hindi', 'Arabic', 'English'];

interface Popover {
  host: HTMLElement;
  root: HTMLElement;
  show(rect: { left: number; top: number; bottom: number }): void;
  hide(): void;
  el(tag: string, cls?: string, text?: string): HTMLElement;
}

/**
 * Why an AI action will not run, in terms of the thing the reader can act on.
 *
 * "Add a Gemini key in the panel" is the right instruction for a BYO-key
 * install and the wrong one on a site whose owner pointed the widget at a
 * hosted relay: there is no key to add, and the panel has nowhere to put one.
 */
function unavailable(ctx: FeatureContext): string {
  return ctx.provider.id === 'proxy'
    ? 'The AI tools on this site are not signed in.'
    : 'Add a Gemini key in the panel to use AI actions.';
}

function makePopover(ctx: FeatureContext): Popover {
  const host = ctx.doc.createElement('div');
  host.setAttribute('data-wa-aipop', '');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483630;top:0;left:0;display:none';
  ctx.html.appendChild(host);
  ctx.own(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = ctx.doc.createElement('style');
  style.textContent = POP_CSS;
  shadow.appendChild(style);
  const root = ctx.doc.createElement('div');
  root.className = 'pop';
  shadow.appendChild(root);

  const place = (rect: { left: number; top: number; bottom: number }) => {
    const vw = ctx.win.innerWidth || 0;
    const vh = ctx.win.innerHeight || 0;
    host.style.display = 'block';
    const r = host.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left), Math.max(8, vw - (r.width || 320) - 8));
    let top = rect.bottom + 8;
    if (top > vh - 80) top = Math.max(8, rect.top - 8 - (r.height || 0));
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  };

  return {
    host,
    root,
    show: (rect) => {
      host.style.display = 'block';
      place(rect);
    },
    hide: () => {
      host.style.display = 'none';
      root.innerHTML = '';
    },
    el: (tag, cls, text) => {
      const e = ctx.doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    },
  };
}

/**
 * Definition via the keyless dictionaryapi.dev (graceful on failure/offline).
 *
 * This is a third party, and it is the only network call in the product that
 * does not go to the model provider. It went undisclosed for a while, which is
 * exactly the kind of thing an accessibility product cannot do: the feature
 * descriptions above name it, and so does the store listing. Only the single
 * word travels: no URL, no page title, no identifier.
 */
async function defineWord(word: string): Promise<string> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
  if (!res.ok) throw new Error('not found');
  const data = (await res.json()) as Array<{ meanings?: Array<{ partOfSpeech?: string; definitions?: Array<{ definition?: string }> }> }>;
  const m = data?.[0]?.meanings?.[0];
  const def = m?.definitions?.[0]?.definition;
  if (!def) throw new Error('not found');
  return `${m?.partOfSpeech ? m.partOfSpeech + '. ' : ''}${def}`;
}

function selectionRect(ctx: FeatureContext): { left: number; top: number; bottom: number } | null {
  const sel = ctx.win.getSelection?.();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  try {
    const range = sel.getRangeAt(0);
    if (typeof range.getBoundingClientRect === 'function') {
      const r = range.getBoundingClientRect();
      if (r && (r.width || r.height || r.left || r.top)) return { left: r.left, top: r.top, bottom: r.bottom };
    }
  } catch {
    /* fall through to the element rect */
  }
  // Fallback when the range has no geometry: anchor on its container element.
  const node = sel.anchorNode;
  const el = (node && (node.nodeType === 1 ? (node as Element) : node.parentElement)) || null;
  if (el && typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, bottom: r.bottom };
  }
  return { left: 0, top: 0, bottom: 0 };
}

function selectionText(ctx: FeatureContext): string {
  return (ctx.win.getSelection?.()?.toString() || '').trim();
}

// Don't pop over our own UI (the panel shadow host or our popover).
function insideOwnUi(ctx: FeatureContext): boolean {
  const sel = ctx.win.getSelection?.();
  const node = sel && sel.anchorNode;
  const el = (node && (node.nodeType === 1 ? (node as Element) : node.parentElement)) || null;
  return !!el?.closest?.('#webable-widget-root,[data-wa-aipop]');
}

// ─── Highlighter bubble ──────────────────────────────────────────────────────
interface BubbleSetting extends FeatureSetting {
  active: boolean;
  lang: string;
}

export const selectionBubble: FeatureModule<BubbleSetting> = {
  id: 'selectionBubble',
  defaults: { active: false, lang: 'Spanish' },
  meta: {
    id: 'selectionBubble',
    label: 'Highlight to explain',
    description:
      'Select any text for a bubble that explains, simplifies, translates, defines, or reads it aloud. Explain, Simplify, and Translate send the selection to Google; Define sends the first word to dictionaryapi.dev; Speak stays on this device.',
    category: 'aids',
    icon: 'key',
    keywords: ['select', 'explain', 'translate', 'simplify', 'define', 'bubble', 'highlight', 'ai', 'reading'],
    controls: [
      { key: 'lang', type: 'select', label: 'Translate to', options: LANGS.map((l) => ({ value: l, label: l })) },
    ],
  },
  apply(s, ctx) {
    let pop = ctx.store.pop as Popover | undefined;
    if (!pop) {
      pop = makePopover(ctx);
      ctx.store.pop = pop;

      const result = (title: string, run: () => Promise<string>) => {
        pop!.root.innerHTML = '';
        const body = pop!.el('div', 'body');
        body.appendChild(pop!.el('p', 'title', title));
        const out = pop!.el('div', 'muted', 'Working…');
        body.appendChild(out);
        pop!.root.appendChild(body);
        run().then(
          (text) => {
            out.className = '';
            out.textContent = text;
            const row = pop!.el('div', 'row');
            const copy = pop!.el('button', 'ghost', 'Copy');
            copy.onclick = () => void copyText(text);
            const speak = pop!.el('button', 'ghost', 'Speak');
            speak.onclick = () => ctx.tts.speak(text);
            row.append(copy, speak);
            pop!.root.appendChild(row);
          },
          (e: unknown) => {
            out.textContent = e instanceof Error ? e.message : 'Something went wrong.';
          },
        );
      };

      const aiOrPrompt = (fn: () => Promise<string>): (() => Promise<string>) =>
        ctx.provider.isConfigured() ? fn : () => Promise.reject(new Error(unavailable(ctx)));

      const showBar = () => {
        if (insideOwnUi(ctx)) return;
        const text = selectionText(ctx);
        const rect = selectionRect(ctx);
        if (!text || text.length < 2 || text.length > 4000 || !rect) {
          pop!.hide();
          return;
        }
        pop!.root.innerHTML = '';
        const bar = pop!.el('div', 'bar');
        const lang = (ctx.store.lang as string) || 'Spanish';
        const actions: Array<[string, () => void]> = [
          ['Explain', () => result('Explanation', aiOrPrompt(() => ctx.provider.explain(text)))],
          ['Simplify', () => result('Plain language', aiOrPrompt(() => ctx.provider.simplify(text, { level: 'plain' })))],
          ['Translate', () => result(`In ${lang}`, aiOrPrompt(() => ctx.provider.translate(text, lang)))],
          ['Define', () => result('Definition', () => defineWord(text.split(/\s+/)[0]))],
          ['Speak', () => ctx.tts.speak(text)],
        ];
        for (const [label, fn] of actions) {
          const b = pop!.el('button', undefined, label);
          b.onclick = fn;
          bar.appendChild(b);
        }
        pop!.root.appendChild(bar);
        pop!.show(rect);
      };

      let t: ReturnType<typeof setTimeout> | undefined;
      const debounced = () => {
        if (t) clearTimeout(t);
        t = setTimeout(showBar, 10);
      };
      ctx.on(ctx.doc, 'mouseup', debounced);
      ctx.on(ctx.doc, 'keyup', (e) => {
        if ((e as KeyboardEvent).key === 'Escape') pop!.hide();
        else debounced();
      });
      ctx.onCleanup(() => {
        if (t) clearTimeout(t);
      });
    }
    ctx.store.lang = s.lang || 'Spanish';
  },
  disable() {},
};

// ─── Double-click dictionary ─────────────────────────────────────────────────
export const clickDictionary: FeatureModule = {
  id: 'clickDictionary',
  defaults: { active: false },
  meta: {
    id: 'clickDictionary',
    label: 'Double-click dictionary',
    description:
      'Double-click any word for an instant definition, with a button to hear it. The word (and nothing else) goes to the free dictionaryapi.dev. No key, no account.',
    category: 'aids',
    icon: 'doc',
    keywords: ['dictionary', 'define', 'definition', 'word', 'meaning', 'vocabulary', 'double click'],
  },
  apply(_s, ctx) {
    if (ctx.store.bound) return;
    ctx.store.bound = true;
    const pop = makePopover(ctx);
    ctx.store.pop = pop;
    ctx.on(ctx.doc, 'dblclick', () => {
      if (insideOwnUi(ctx)) return;
      const word = selectionText(ctx).split(/\s+/)[0]?.replace(/[^\p{L}-]/gu, '');
      const rect = selectionRect(ctx);
      if (!word || word.length < 2 || !rect) return;
      pop.root.innerHTML = '';
      const body = pop.el('div', 'body');
      body.appendChild(pop.el('p', 'title', word));
      const out = pop.el('div', 'muted', 'Looking up…');
      body.appendChild(out);
      const row = pop.el('div', 'row');
      const speak = pop.el('button', 'ghost', 'Speak');
      speak.onclick = () => ctx.tts.speak(word);
      row.appendChild(speak);
      pop.root.append(body, row);
      pop.show(rect);
      defineWord(word).then(
        (def) => {
          out.className = '';
          out.textContent = def;
        },
        () => {
          out.textContent = 'No definition found.';
        },
      );
    });
    ctx.on(ctx.doc, 'keyup', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') pop.hide();
    });
  },
  disable() {},
};

// ─── TL;DR pin ───────────────────────────────────────────────────────────────
interface TldrSetting extends FeatureSetting {
  active: boolean;
  length: string;
}

function articleRoot(doc: Document): HTMLElement | null {
  return (doc.querySelector('article') || doc.querySelector('[role="main"]') || doc.querySelector('main')) as HTMLElement | null;
}

export const tldrPin: FeatureModule<TldrSetting> = {
  id: 'tldrPin',
  defaults: { active: false, length: 'brief' },
  meta: {
    id: 'tldrPin',
    label: 'TL;DR this page',
    description:
      'Pins a summary card above the article, with a button that sends the article text to Google and summarizes it. Nothing is sent until you press it.',
    category: 'aids',
    icon: 'reader',
    keywords: ['tldr', 'summary', 'summarize', 'skim', 'brief', 'ai', 'key points'],
    controls: [
      {
        key: 'length',
        type: 'segmented',
        label: 'Length',
        options: [
          { value: 'brief', label: 'Brief' },
          { value: 'standard', label: 'Standard' },
        ],
      },
    ],
  },
  apply(s, ctx) {
    const url = (() => {
      try {
        return ctx.win.location?.href || '';
      } catch {
        return '';
      }
    })();
    // Rebuild only when first shown or the page/length changed (no re-billing).
    if (ctx.store.card && ctx.store.url === url && ctx.store.length === s.length) return;
    ctx.store.url = url;
    ctx.store.length = s.length;

    let card = ctx.store.card as HTMLElement | undefined;
    if (!card) {
      ctx.injectCSS(
        'root',
        `html[data-webable-tldr] .wa-tldr{margin:0 0 18px;padding:14px 16px;border:1px solid rgba(15,28,63,.16);
           border-left:3px solid #1668D8;border-radius:10px;background:rgba(22,104,216,.06);
           font:15px/1.55 -apple-system,system-ui,sans-serif;color:#0F1C3F}
         html[data-webable-tldr] .wa-tldr h4{margin:0 0 6px;font:700 11px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:#1668D8}
         html[data-webable-tldr] .wa-tldr p{margin:0;white-space:pre-wrap}
         html[data-webable-tldr] .wa-tldr button{margin-top:10px;font:600 13px/1 -apple-system,system-ui,sans-serif;
           color:#fff;background:#1668D8;border:0;border-radius:8px;padding:9px 14px;cursor:pointer}
         html[data-webable-tldr] .wa-tldr button:focus-visible{outline:3px solid #0F1C3F;outline-offset:2px}`,
      );
      ctx.setFlag('tldr', true);
      card = ctx.doc.createElement('div');
      card.className = 'wa-tldr';
      card.setAttribute('data-wa-tldr-card', '');
      ctx.own(card);
      ctx.store.card = card;
    }
    const root = articleRoot(ctx.doc) || ctx.body;
    if (root && card.parentNode !== root.parentNode) {
      root.parentNode?.insertBefore(card, root);
    }
    card.innerHTML = '';
    const head = ctx.doc.createElement('h4');
    head.textContent = 'TL;DR';
    const body = ctx.doc.createElement('p');
    card.append(head, body);

    if (!ctx.provider.isConfigured()) {
      body.textContent = unavailable(ctx);
      return;
    }
    const text = ((root && (root.innerText || root.textContent)) || ctx.body?.textContent || '').slice(0, 12000);
    if (text.trim().length < 80) {
      body.textContent = 'Not enough article text on this page to summarize.';
      return;
    }

    // The card is placed here, but nothing is transmitted until the button is
    // pressed.
    //
    // It used to call summarize() right here. apply() runs on every reconcile,
    // reconcile runs after load, and the setting persists per origin, so
    // leaving TL;DR on once meant every later visit to that site silently
    // shipped the article to Google before the user had done anything.
    // Transmitting page content must not happen as a side effect of a saved
    // preference.
    body.textContent = 'Sends this article to Google Gemini and shows a short summary here.';
    const go = ctx.doc.createElement('button');
    go.type = 'button';
    go.textContent = 'Summarize this page';
    card.appendChild(go);
    go.addEventListener('click', () => {
      // Re-read the article now, rather than summarising the copy taken when
      // the card was placed. apply() runs on enable, on settings changes and on
      // route changes, but between any of those and this click the card can sit
      // for minutes while an infinite scroll, a live blog, or an article body
      // that hydrates late fills in underneath it. The result is handed to the
      // reader as a summary of this page, so it has to be a summary of what is
      // on this page when they ask, not of what was here when the button was
      // drawn. Same rule as the alt-text path: never assert something about
      // content that is not the content in front of them.
      const live = articleRoot(ctx.doc) || ctx.body;
      const fresh = ((live && (live.innerText || live.textContent)) || '').slice(0, 12000);
      if (fresh.trim().length < 80) {
        body.textContent = 'Not enough article text on this page to summarize.';
        return;
      }
      go.remove();
      body.textContent = 'Summarizing…';
      ctx.provider.summarize(fresh, { title: ctx.doc.title }).then(
        (sum) => {
          body.textContent = sum;
        },
        (e: unknown) => {
          body.textContent = e instanceof Error ? e.message : 'Could not summarize.';
        },
      );
    });
  },
  disable(ctx) {
    ctx.store.card = undefined;
    ctx.store.url = undefined;
  },
};
