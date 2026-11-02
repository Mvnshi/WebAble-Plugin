/**
 * Turning blocks into the page the reader asked for.
 *
 * Every element written here comes from a Block, and a Block cannot exist
 * without a source pointer (see blocks.ts). There is no path through this file
 * that can put an unsourced word on screen. The `generated` blocks a model did
 * author are drawn as a labelled aside with their own rule and colour, never as
 * body type, so a reader can always tell the page's words from a model's.
 *
 * ── Why this renders into the light DOM, when the brief asked for shadow ─────
 *
 * The brief's isolation requirement is real and the reasoning behind it is
 * right: a Standard that a site's `!important` can overrule is a suggestion,
 * not an opinion. But a shadow root was measured against what it would cost and
 * it loses on three counts, two of them verified in a real browser rather than
 * assumed:
 *
 *   1. Read aloud. `extractMainText` (../tts.ts) reads `innerText` from
 *      `#wa-reader .wa-reader-col`. Checked in Chromium: `innerText` on a
 *      shadow host returns "", so the `||` in that function falls through and
 *      read-aloud speaks `document.body` instead, which is the whole untreated
 *      page including the navigation and cookie banner the reader just removed.
 *      That is a regression of a bug the comment above that function says was
 *      already fixed once.
 *   2. Every selection tool. The selection bubble, the click dictionary and the
 *      TL;DR pin all go through `win.getSelection()`, which does not return
 *      ranges inside a shadow root. Rendering the article into one silently
 *      turns off the three AI reading aids on the only text the reader is
 *      actually looking at.
 *   3. The engine's own tests assert `.wa-reader-title` and `.wa-reader-close`
 *      through `querySelector` and read `overlay.textContent`; none of those
 *      cross a shadow boundary.
 *
 * Losing CSS isolation costs some fidelity on hostile pages. Losing read-aloud
 * and text selection costs the accessibility features this product exists for.
 * So isolation is bought the other way instead: the sheet below is scoped under
 * `#wa-reader`, which beats the engine's own `:where()` rules (specificity
 * zero) outright, and marks the properties the Standard owns `!important` so a
 * host page cannot take them back. The overlay is also appended to <html>
 * rather than <body>, which keeps it out of the colour features' composed
 * `filter`.
 */
import type { Block } from './blocks';
import { standardVars, type Standard } from './standard';

/**
 * The sheet. Fixed, and full of `var()`.
 *
 * This is what lets the Standard be expressive inside a hard gzip budget: the
 * stylesheet does not grow when a field is added to the schema, because every
 * field arrives as a custom property. Applying a changed Standard is one
 * attribute write, which is what makes an adjustment instant and reversible.
 *
 * The z-index is deliberate and is covered by a test in engine.test.ts: the
 * reader sits BELOW the widget host at 2147483640. It used to sit above, so
 * opening it from the panel painted an opaque layer over a panel that still
 * had focus and was still trapping Tab.
 *
 * No comments inside this template literal: esbuild strips JS comments, but a
 * template literal is opaque to it, so CSS comments here would ship as bytes.
 */
export const READER_CSS = `
#wa-reader{position:fixed;inset:0;z-index:2147483610;overflow-y:auto;-webkit-overflow-scrolling:touch;
  background:var(--cv-bg);color:var(--cv-fg);
  font-family:var(--cv-family);font-size:var(--cv-size);font-weight:var(--cv-weight);line-height:var(--cv-line);
  text-align:left;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
#wa-reader *{margin:0;padding:0;border:0;background:none;font:inherit;color:inherit;text-align:inherit;
  max-width:100%;float:none;position:static;box-sizing:border-box}
#wa-reader .wa-reader-col{max-width:var(--cv-measure);margin:0 auto;
  padding:calc(var(--cv-pad)*2.6) var(--cv-pad) calc(var(--cv-pad)*4)}
#wa-reader :where(h1,h2,h3,h4,h5,h6){font-family:var(--cv-heading-family) !important;
  font-weight:var(--cv-heading-weight) !important;line-height:1.2;
  margin:var(--cv-heading-gap) 0 calc(var(--cv-heading-gap)*.3);letter-spacing:-.01em}
#wa-reader .wa-reader-title{font-size:1.75em;margin:0 0 .7em;line-height:1.12}
#wa-reader h2{font-size:1.35em}
#wa-reader h3{font-size:1.15em}
#wa-reader p{margin:0 0 var(--cv-para-gap) !important;text-indent:var(--cv-indent);font-size:1em !important}
#wa-reader a{color:var(--cv-link) !important;text-decoration:underline;text-underline-offset:2px}
#wa-reader ul,#wa-reader ol{margin:0 0 var(--cv-para-gap);padding-left:1.5em}
#wa-reader li{margin:.25em 0;display:list-item}
#wa-reader ul li{list-style:disc}
#wa-reader ol li{list-style:decimal}
#wa-reader blockquote{margin:var(--cv-para-gap) 0;padding-left:1em;border-left:3px solid var(--cv-link);opacity:.85}
#wa-reader pre{margin:0 0 var(--cv-para-gap);padding:.9em 1em;overflow-x:auto;border-radius:8px;
  background:var(--cv-code-bg);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:.85em;line-height:1.5;text-indent:0;white-space:pre}
#wa-reader figure{margin:calc(var(--cv-para-gap)*1.4) 0}
#wa-reader figure img{max-width:100%;height:auto;border-radius:8px;display:block}
#wa-reader figcaption{margin-top:.5em;font-size:.85em;opacity:.75}
#wa-reader table{width:100%;border-collapse:collapse;margin:0 0 var(--cv-para-gap);font-size:.9em;display:table}
#wa-reader th,#wa-reader td{border:1px solid rgba(128,128,128,.34);padding:.45em .6em;text-align:left}
#wa-reader th{font-weight:600;background:var(--cv-code-bg)}
#wa-reader caption{caption-side:top;text-align:left;font-size:.85em;opacity:.75;margin-bottom:.4em}
#wa-reader dt{font-weight:600;margin-top:.6em}
#wa-reader dd{margin:0 0 .4em 1.2em}
#wa-reader .cv-stack table,#wa-reader .cv-stack thead{display:block}
#wa-reader .cv-stack th{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
#wa-reader .cv-stack tr{display:block;margin:0 0 .8em;border:1px solid rgba(128,128,128,.34);border-radius:8px;padding:.4em .6em}
#wa-reader .cv-stack td{display:flex;justify-content:space-between;gap:1em;border:0;
  border-bottom:1px solid rgba(128,128,128,.18);padding:.35em 0}
#wa-reader .cv-stack td:last-child{border-bottom:0}
#wa-reader .cv-stack td::before{content:attr(data-th);font-weight:600;opacity:.7}
#wa-reader .cv-note{margin:0 0 var(--cv-para-gap);padding:.55em .8em;border-left:3px dashed var(--cv-link);
  border-radius:0 6px 6px 0;background:rgba(128,128,128,.09);font-size:.85em;font-style:italic;text-indent:0}
#wa-reader .cv-note b{font-style:normal;text-transform:uppercase;letter-spacing:.06em;
  font-size:.78em;opacity:.7;display:block;margin-bottom:.15em}
#wa-reader .cv-fn{font-size:.85em;opacity:.85;margin:0 0 .5em;text-indent:0}
#wa-reader .cv-fns{margin-top:calc(var(--cv-heading-gap)*1.5);padding-top:1em;border-top:1px solid rgba(128,128,128,.28)}
#wa-reader .cv-num{opacity:.6;font-variant-numeric:tabular-nums}
#wa-reader .cv-bar{position:fixed;top:0;left:0;right:0;display:flex;gap:.5em;align-items:center;
  justify-content:flex-end;padding:10px 14px;background:var(--cv-bg);
  border-bottom:1px solid rgba(128,128,128,.22);z-index:2}
#wa-reader .wa-reader-close{font:inherit;font-size:13px;font-weight:600;color:var(--cv-bg);
  background:var(--cv-link);border-radius:8px;padding:9px 14px;cursor:pointer}
#wa-reader .wa-reader-close:hover{filter:brightness(1.12)}
#wa-reader .wa-reader-close:focus-visible{outline:3px solid var(--cv-fg);outline-offset:3px}
#wa-reader .cv-outline{position:fixed;top:54px;left:12px;max-height:70vh;overflow-y:auto;
  font-size:13px;line-height:1.45;
  width:min(200px,calc(50vw - var(--cv-measure)/2 - 24px))}
#wa-reader .cv-outline a{display:block;padding:3px 6px;border-radius:5px;color:var(--cv-fg) !important;
  opacity:.7;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#wa-reader .cv-outline a:hover,#wa-reader .cv-outline a:focus-visible{opacity:1;background:rgba(128,128,128,.16)}
#wa-reader .cv-outline a[data-l="3"]{padding-left:18px;font-size:.94em}
@media(max-width:1180px){#wa-reader .cv-outline{display:none}}
#wa-reader .cv-next{display:block;margin:calc(var(--cv-heading-gap)*1.2) 0 0;padding:.7em .9em;
  border:1px solid color-mix(in srgb,var(--cv-link) 45%,transparent);border-radius:9px;
  color:var(--cv-link) !important;text-decoration:none;font-size:.92em;font-weight:600}
#wa-reader .cv-next:hover{background:color-mix(in srgb,var(--cv-link) 9%,transparent)}
#wa-reader .cv-next:focus-visible{outline:3px solid var(--cv-fg);outline-offset:3px}
#wa-reader .cv-skip{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
#wa-reader .cv-skip:focus{position:fixed;top:8px;left:8px;width:auto;height:auto;clip-path:none;
  padding:10px 14px;background:var(--cv-link);color:var(--cv-bg) !important;border-radius:8px;z-index:3}
@media(prefers-color-scheme:dark){
  #wa-reader[data-follow="1"]{--cv-bg:#10161f;--cv-fg:#dbe3ee;--cv-link:#87adff;--cv-code-bg:#1b2432}
}`;

export interface Rendered {
  /** The overlay appended to <html>. Removing it removes everything. */
  host: HTMLElement;
  /** Swap the Standard without rebuilding the document. */
  restyle(next: Standard): void;
}

/**
 * Inline elements worth keeping. Everything else contributes its text and
 * loses its box, so a paragraph wrapped in six tracking spans reads as a
 * paragraph.
 */
const INLINE_KEEP = /^(?:A|EM|STRONG|B|I|CODE|SUP|SUB|ABBR|CITE|Q|MARK|SMALL|U|S|BR|SPAN|TIME|DFN|KBD|VAR|SAMP)$/;

/**
 * Rebuild a node's inline content: the page's own links and emphasis kept,
 * everything that could execute, load, or reposition dropped.
 *
 * A rebuild rather than `cloneNode`, because a clone carries the page's class
 * names, inline styles, event-handler attributes and `<script>`s straight into
 * a surface the reader believes is clean. Nothing is copied here that was not
 * explicitly asked for.
 */
function inline(doc: Document, src: Element, into: HTMLElement, dropLinks: boolean): void {
  for (const node of Array.from(src.childNodes)) {
    if (node.nodeType === 3) {
      into.appendChild(doc.createTextNode(node.nodeValue || ''));
      continue;
    }
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.tagName === 'BR') {
      into.appendChild(doc.createElement('br'));
      continue;
    }
    // The permalink glyph docs generators put after every heading (a pilcrow
    // on Sphinx, a hash on MDN, an icon on GitHub). It is navigation chrome,
    // and with links dropped inside headings it would otherwise render as a
    // stray symbol on the end of every heading on the page.
    if (
      el.tagName === 'A' &&
      (el.getAttribute('href') || '').charCodeAt(0) === 35 &&
      !/[\p{L}\p{N}]/u.test(el.textContent || '')
    ) {
      continue;
    }
    if (!INLINE_KEEP.test(el.tagName)) {
      // Never fold a style or script tag's contents in as text. Real pages
      // inline them mid-article (Wikipedia does it per article), and reading
      // them flat puts a stylesheet on screen as a sentence.
      if (/^(?:STYLE|SCRIPT|TEMPLATE|NOSCRIPT)$/.test(el.tagName)) continue;
      const text = (el.textContent || '').trim();
      if (text) into.appendChild(doc.createTextNode(text));
      continue;
    }
    const isLink = el.tagName === 'A' && !dropLinks;
    const out = doc.createElement(isLink ? 'a' : el.tagName === 'A' ? 'span' : el.tagName.toLowerCase());
    if (isLink) {
      const href = el.getAttribute('href') || '';
      // Only navigable schemes. A `javascript:` href inside a surface the
      // reader has been told is clean is the whole attack in one line.
      if (/^(?:https?:|mailto:|#)/i.test(href)) out.setAttribute('href', href);
      out.setAttribute('rel', 'noopener noreferrer');
    }
    inline(doc, el, out, dropLinks);
    into.appendChild(out);
  }
}

const anchorId = (b: Block) => `cv-s-${b.sourcePath.replace(/\//g, '-')}`;

function renderBlock(doc: Document, b: Block, s: Standard, n: { fig: number; tab: number }): HTMLElement | null {
  // The only branch that may carry words the page did not say, and it is always
  // drawn as a marked aside.
  if (b.generated) {
    const p = doc.createElement('p');
    p.className = 'cv-note';
    const tag = doc.createElement('b');
    tag.textContent = 'Described by AI';
    p.appendChild(tag);
    p.appendChild(doc.createTextNode(b.text));
    return p;
  }

  const src = b.node;
  switch (b.kind) {
    case 'heading': {
      const h = doc.createElement(`h${Math.min(6, Math.max(2, b.level || 2))}`);
      if (src) inline(doc, src, h, true);
      else h.textContent = b.text;
      h.id = anchorId(b);
      return h;
    }
    case 'paragraph': {
      const p = doc.createElement('p');
      if (src) inline(doc, src, p, false);
      else p.textContent = b.text;
      return p.textContent?.trim() ? p : null;
    }
    case 'list': {
      const list = doc.createElement(b.ordered ? 'ol' : 'ul');
      for (const li of Array.from(src?.children || [])) {
        if (li.tagName !== 'LI') continue;
        const item = doc.createElement('li');
        inline(doc, li, item, false);
        list.appendChild(item);
      }
      return list.children.length ? list : null;
    }
    case 'quote': {
      const q = doc.createElement('blockquote');
      for (const child of Array.from(src?.children || [])) {
        const p = doc.createElement('p');
        inline(doc, child, p, false);
        if (p.textContent?.trim()) q.appendChild(p);
      }
      if (!q.children.length) q.appendChild(doc.createTextNode(b.text));
      return q;
    }
    case 'code': {
      const pre = doc.createElement('pre');
      // textContent on purpose: code is the one place where the page's inline
      // markup is noise and its exact characters are the meaning.
      pre.textContent = b.text;
      return pre;
    }
    case 'math': {
      const p = doc.createElement('p');
      p.textContent = b.text;
      p.setAttribute('role', 'math');
      return p;
    }
    case 'figure': {
      if (s.dropImages) return null;
      const fig = doc.createElement('figure');
      const img = src?.querySelector('img');
      const url = img?.getAttribute('src') || img?.getAttribute('data-src') || '';
      if (img && /^(?:https?:|data:image\/|\/|\.)/i.test(url)) {
        const out = doc.createElement('img');
        out.setAttribute('src', url);
        out.setAttribute('alt', img.getAttribute('alt') || '');
        out.setAttribute('loading', 'lazy');
        out.setAttribute('decoding', 'async');
        fig.appendChild(out);
      }
      const capText = b.caption || (b.text.trim() ? b.text : '');
      if (capText) {
        const cap = doc.createElement('figcaption');
        if (s.numbered) {
          const num = doc.createElement('span');
          num.className = 'cv-num';
          num.textContent = `Figure ${++n.fig}. `;
          cap.appendChild(num);
        }
        cap.appendChild(doc.createTextNode(capText));
        fig.appendChild(cap);
      }
      return fig.children.length ? fig : null;
    }
    case 'table': {
      if (!src) return null;
      const wrap = doc.createElement('div');
      if (s.tables === 'stacked') wrap.className = 'cv-stack';
      const t = doc.createElement('table');
      const headers: string[] = [];
      for (const th of Array.from(src.querySelectorAll('thead th,tr:first-child th'))) {
        headers.push((th.textContent || '').trim());
      }
      const capText = s.numbered ? `Table ${++n.tab}.${b.caption ? ` ${b.caption}` : ''}` : b.caption || '';
      if (capText) {
        const cap = doc.createElement('caption');
        cap.textContent = capText;
        t.appendChild(cap);
      }
      for (const tr of Array.from(src.querySelectorAll('tr'))) {
        const row = doc.createElement('tr');
        let i = 0;
        for (const cell of Array.from(tr.children)) {
          if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue;
          const out = doc.createElement(cell.tagName === 'TH' ? 'th' : 'td');
          // The page's own header text, so a stacked row stays labelled.
          if (cell.tagName === 'TD' && headers[i]) out.setAttribute('data-th', headers[i]);
          inline(doc, cell, out, false);
          row.appendChild(out);
          i++;
        }
        if (row.children.length) t.appendChild(row);
      }
      wrap.appendChild(t);
      return t.querySelector('tr') ? wrap : null;
    }
    case 'definitions': {
      const dl = doc.createElement('dl');
      for (const child of Array.from(src?.children || [])) {
        if (child.tagName !== 'DT' && child.tagName !== 'DD') continue;
        const out = doc.createElement(child.tagName.toLowerCase());
        inline(doc, child, out, false);
        dl.appendChild(out);
      }
      return dl.children.length ? dl : null;
    }
    default:
      return null; // Footnotes are collected where the Standard asks for them.
  }
}

function shell(doc: Document, s: Standard, onExit: () => void): { host: HTMLElement; col: HTMLElement } {
  const host = doc.createElement('div');
  host.id = 'wa-reader';
  // Marks the subtree as ours, so the engine's shadow-style adoption and its
  // own traversals skip it (see collectRoots in ../dom.ts).
  host.setAttribute('data-webable', 'reader');
  host.setAttribute('role', 'document');
  host.setAttribute('aria-label', 'Reader');
  host.setAttribute('style', standardVars(s));
  host.setAttribute('data-follow', s.followSystem ? '1' : '0');
  // Focusable so a screen reader lands in the clean column rather than
  // wherever it happened to be when the reader opened.
  host.tabIndex = -1;

  const skip = doc.createElement('a');
  skip.className = 'cv-skip';
  skip.href = '#wa-reader-col';
  skip.textContent = 'Skip to article';
  host.appendChild(skip);

  const bar = doc.createElement('div');
  bar.className = 'cv-bar';
  const close = doc.createElement('button');
  close.className = 'wa-reader-close';
  close.type = 'button';
  close.textContent = 'Close reader';
  close.setAttribute('aria-label', 'Close reader and return to the page');
  close.addEventListener('click', onExit);
  bar.appendChild(close);
  host.appendChild(bar);

  const col = doc.createElement('div');
  col.className = 'wa-reader-col';
  col.id = 'wa-reader-col';
  host.appendChild(col);

  return { host, col };
}

/** Build the reading surface from the skeleton. */
export function render(
  doc: Document,
  title: string,
  blocks: Block[],
  s: Standard,
  onExit: () => void,
  next?: { href: string; label: string },
): Rendered {
  const { host, col } = shell(doc, s, onExit);

  if (title) {
    const h1 = doc.createElement('h1');
    h1.className = 'wa-reader-title';
    h1.textContent = title;
    col.appendChild(h1);
  }

  const n = { fig: 0, tab: 0 };
  const collected: HTMLElement[] = [];
  const footnotes = blocks.filter((b) => b.kind === 'footnote');

  for (const b of blocks) {
    if (b.kind === 'footnote') continue;
    const el = renderBlock(doc, b, s, n);
    if (!el) continue;
    if (b.kind === 'figure' && s.figures === 'collected') {
      collected.push(el);
      continue;
    }
    col.appendChild(el);
  }

  if (collected.length) {
    const h = doc.createElement('h2');
    h.textContent = 'Figures';
    col.appendChild(h);
    for (const f of collected) col.appendChild(f);
  }

  if (footnotes.length) {
    const wrap = doc.createElement('div');
    wrap.className = 'cv-fns';
    const h = doc.createElement('h2');
    h.textContent = 'Notes';
    wrap.appendChild(h);
    footnotes.forEach((b, i) => {
      const p = doc.createElement('p');
      p.className = 'cv-fn';
      p.id = b.ref ? `cv-fn-${b.ref}` : `cv-fn-${i + 1}`;
      const num = doc.createElement('span');
      num.className = 'cv-num';
      num.textContent = `${i + 1}. `;
      p.appendChild(num);
      if (b.node) inline(doc, b.node, p, false);
      else p.appendChild(doc.createTextNode(b.text));
      wrap.appendChild(p);
    });
    col.appendChild(wrap);
  }

  /* Where the article continues, when it is paginated. Reader modes drop this
   * silently: you get part one, beautifully formatted, with no sign that parts
   * two onward exist. Rendered as navigation rather than as body type, and
   * after the notes, because it is the end of this page rather than part of
   * the argument. */
  if (next) {
    const more = doc.createElement('a');
    more.className = 'cv-next';
    more.setAttribute('href', next.href);
    more.setAttribute('rel', 'next');
    more.textContent = `Continue: ${next.label}`;
    col.appendChild(more);
  }

  if (s.outline) {
    const nav = doc.createElement('nav');
    nav.className = 'cv-outline';
    nav.setAttribute('aria-label', 'Document outline');
    for (const b of blocks) {
      if (b.kind !== 'heading' || (b.level || 2) > 3) continue;
      const a = doc.createElement('a');
      a.href = `#${anchorId(b)}`;
      a.setAttribute('data-l', String(b.level || 2));
      a.textContent = b.text;
      nav.appendChild(a);
    }
    if (nav.children.length) host.appendChild(nav);
  }

  return {
    host,
    restyle(next) {
      host.setAttribute('style', standardVars(next));
      host.setAttribute('data-follow', next.followSystem ? '1' : '0');
    },
  };
}

/**
 * What the reader sees when the page has no article in it.
 *
 * A page ClarityView cannot parse says so and offers the original. Rendering a
 * confident-looking half-page is the one outcome worse than not running at all.
 */
export function renderFailure(doc: Document, s: Standard, onExit: () => void): Rendered {
  const { host, col } = shell(doc, s, onExit);

  const h = doc.createElement('h1');
  h.className = 'wa-reader-title';
  h.textContent = 'No article found here';
  const p = doc.createElement('p');
  p.textContent =
    'ClarityView could not find an article on this page, so it has not tried to reformat one. The page underneath is unchanged.';
  const back = doc.createElement('button');
  back.className = 'wa-reader-close';
  back.type = 'button';
  back.textContent = 'Back to the page';
  back.addEventListener('click', onExit);
  col.appendChild(h);
  col.appendChild(p);
  col.appendChild(back);

  return {
    host,
    restyle(next) {
      host.setAttribute('style', standardVars(next));
    },
  };
}
