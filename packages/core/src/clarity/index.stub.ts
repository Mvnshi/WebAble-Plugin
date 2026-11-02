/**
 * The widget's stand-in for ../clarity.
 *
 * THIS IS NOT A NO-OP AND MUST NOT BE "SIMPLIFIED" INTO ONE. It is a working
 * reader: it extracts an article, strips the page furniture, and renders a
 * clean centred column with a close control, which is exactly what the widget
 * shipped before ClarityView existed. A widget visitor loses the Standard, the
 * typed block model and the model-assisted repair; they do not lose reader
 * mode. Replacing this with stubs that return nothing would silently delete a
 * shipped feature from one of the two surfaces.
 *
 * Why it exists at all is arithmetic, measured rather than guessed. The widget
 * has a hard 65 KB gzip budget (scripts/bundle-gate.mjs) and sits at 64.6 KB.
 * The real ../clarity measures 7.8 KB gzipped, so it is roughly twenty times
 * the available headroom. Lazy loading does not help: the gate sums eager and
 * lazy chunks alike. The extension has no size ceiling and is where a reader
 * this thorough actually matters, so the split is by surface, using the
 * mechanism already used twice in apps/widget/build.mjs for extensionBlocks
 * and tools/patches.
 *
 * Keep the exported names in step with index.ts. The typecheck does not compare
 * the two, so a rename that misses this file surfaces as a widget build error,
 * not a type error.
 */
import type { FeatureContext } from '../types';
import type { ClarityHandle } from './index';

/**
 * Driven by custom properties, like the real one, for the same reason: the
 * three Standards then cost three short blocks rather than three stylesheets.
 * This is what lets the widget honour the Standard control at all. Shipping a
 * control that silently did nothing on one of the two surfaces would be a worse
 * bug than the bytes it saved.
 */
export const READER_CSS = `
#wa-reader{position:fixed;inset:0;z-index:2147483610;overflow-y:auto;
  --cv-bg:#fbfbfa;--cv-fg:#1a2233;--cv-link:#1e40af;--cv-size:20px;--cv-measure:68ch;--cv-line:1.7;
  background:var(--cv-bg);color:var(--cv-fg);font-size:var(--cv-size);line-height:var(--cv-line);
  font-family:'Atkinson Hyperlegible','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
#wa-reader[data-s=study]{--cv-size:19px;--cv-measure:74ch;--cv-line:1.55}
#wa-reader[data-s=plain]{--cv-size:22px;--cv-measure:58ch;--cv-line:1.8;--cv-bg:#fff;--cv-fg:#111;--cv-link:#0b3ea8}
#wa-reader .wa-reader-col{max-width:var(--cv-measure);margin:0 auto;padding:72px 24px 120px}
#wa-reader .wa-reader-title{font-size:1.7em;line-height:1.15;letter-spacing:-.02em;margin:0 0 .7em}
#wa-reader p{margin:0 0 1.1em}
#wa-reader h2{font-size:1.25em;margin:1.6em 0 .5em}
#wa-reader h3{font-size:1.05em;margin:1.4em 0 .4em}
#wa-reader a{color:var(--cv-link);text-underline-offset:2px}
#wa-reader img{max-width:100%;height:auto;border-radius:8px;margin:1.2em 0}
#wa-reader ul,#wa-reader ol{margin:0 0 1.1em 1.4em}
#wa-reader blockquote{margin:1.2em 0;padding-left:1em;border-left:3px solid var(--cv-link);opacity:.8}
#wa-reader .wa-reader-close{position:fixed;top:18px;right:20px;z-index:1;font:600 14px/1 'Inter',sans-serif;
  color:var(--cv-bg);background:var(--cv-link);border:0;border-radius:9px;padding:11px 16px;cursor:pointer}
#wa-reader .wa-reader-close:focus-visible{outline:3px solid var(--cv-fg);outline-offset:3px}
@media (prefers-color-scheme:dark){
  #wa-reader:not([data-s=plain]){--cv-bg:#0f1722;--cv-fg:#d9e2ee;--cv-link:#7da9ff}
}`;

const STRIP =
  'script,style,noscript,iframe,nav,aside,form,button,input,svg,video,[role="navigation"],[class*="share" i],[class*="related" i],[class*="comment" i],[class*="promo" i],[class*="ad-" i],[id*="comment" i]';

function textLen(el: Element): number {
  return ((el as HTMLElement).innerText || el.textContent || '').trim().length;
}

/** The light paragraph-scoring heuristic the widget shipped before this split. */
function pickContent(doc: Document): Element {
  const direct = doc.querySelector('article') || doc.querySelector('[role="main"]') || doc.querySelector('main');
  if (direct && textLen(direct) > 500) return direct;

  let best: Element | null = null;
  let bestScore = 0;
  doc.querySelectorAll('article, main, section, div').forEach((el) => {
    if ((el as HTMLElement).closest('#wa-reader')) return;
    let score = 0;
    el.querySelectorAll('p').forEach((p) => {
      const t = (p.textContent || '').trim().length;
      if (t > 40) score += t;
    });
    if (el.matches('nav,aside,header,footer')) score *= 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  });
  return best || doc.body;
}

export function open(ctx: FeatureContext, preset: string, _custom: string, onExit: () => void): ClarityHandle {
  const doc = ctx.doc;
  const overlay = doc.createElement('div');
  overlay.id = 'wa-reader';
  overlay.setAttribute('data-webable', 'reader');
  overlay.setAttribute('data-s', preset);
  overlay.setAttribute('role', 'document');
  overlay.setAttribute('aria-label', 'Reader mode');
  overlay.tabIndex = -1;

  const close = doc.createElement('button');
  close.className = 'wa-reader-close';
  close.type = 'button';
  close.textContent = 'Close reader';
  close.setAttribute('aria-label', 'Close reader mode');
  close.addEventListener('click', onExit);

  const col = doc.createElement('div');
  col.className = 'wa-reader-col';

  const title = doc.createElement('h1');
  title.className = 'wa-reader-title';
  title.textContent = ((doc.querySelector('h1')?.textContent || doc.title || '') as string).trim();
  col.appendChild(title);

  const content = pickContent(doc).cloneNode(true) as HTMLElement;
  content.querySelectorAll(STRIP).forEach((n) => n.remove());
  content.querySelectorAll('h1').forEach((h) => h.remove());
  col.appendChild(content);

  overlay.appendChild(close);
  overlay.appendChild(col);
  ctx.html.appendChild(overlay);
  ctx.own(overlay);

  // A Standard change is one attribute here, same as in the real renderer.
  // Teardown is the engine removing the node it was handed.
  return {
    update(next) {
      overlay.setAttribute('data-s', next);
    },
    destroy() {},
  };
}
