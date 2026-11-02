/**
 * DOM plumbing for features. Each feature gets its own scoped context so its
 * injected styles, created nodes, and event listeners are tracked and torn
 * down cleanly on disable, that is what makes every effect reversible.
 */
import type { AIProvider, FeatureContext, SettingValue } from './types';
import type { TTSController } from './tts';

export interface ScopedContext extends FeatureContext {
  /** Remove every style/node/listener this feature created. */
  destroy(): void;
}

/** Engine-owned services every feature context exposes. */
export interface FeatureServices {
  provider: AIProvider;
  tts: TTSController;
  /** See FeatureContext.framed. */
  framed?: boolean;
}

const HEAD = (doc: Document): Element => doc.head || doc.documentElement;

export function createFeatureContext(doc: Document, featureId: string, services: FeatureServices): ScopedContext {
  const win = (doc.defaultView || (typeof window !== 'undefined' ? window : undefined)) as Window;
  const html = doc.documentElement as HTMLElement;
  const styleIds = new Set<string>();
  const flags = new Set<string>();
  const vars = new Set<string>();
  const owned = new Set<Node>();
  const cleanups: Array<() => void> = [];
  const listeners: Array<{
    target: EventTarget;
    type: string;
    handler: EventListenerOrEventListenerObject;
    options?: boolean | AddEventListenerOptions;
  }> = [];

  const fullStyleId = (id: string) => `wa-feat-${featureId}${id ? '-' + id : ''}`;

  const ctx: ScopedContext = {
    doc,
    win,
    html,
    provider: services.provider,
    tts: services.tts,
    framed: !!services.framed,
    get body() {
      return (doc.body || doc.documentElement) as HTMLElement;
    },

    injectCSS(id, css) {
      const elId = fullStyleId(id);
      styleIds.add(elId);
      let el = doc.getElementById(elId) as HTMLStyleElement | null;
      if (!el) {
        el = doc.createElement('style');
        el.id = elId;
        el.setAttribute('data-webable', 'feature');
        HEAD(doc).appendChild(el);
      }
      if (el.textContent !== css) el.textContent = css;
    },
    removeCSS(id) {
      const elId = fullStyleId(id);
      styleIds.delete(elId);
      doc.getElementById(elId)?.remove();
    },

    setFlag(flag, on) {
      const name = `data-webable-${flag}`;
      if (on) {
        html.setAttribute(name, '');
        flags.add(flag);
      } else {
        html.removeAttribute(name);
        flags.delete(flag);
      }
    },

    setVar(name, value) {
      const prop = `--wa-${name}`;
      if (value == null) {
        html.style.removeProperty(prop);
        vars.delete(prop);
      } else {
        html.style.setProperty(prop, String(value));
        vars.add(prop);
      }
    },

    own(node) {
      owned.add(node);
      return node;
    },

    on(target, type, handler, options) {
      target.addEventListener(type as string, handler, options);
      listeners.push({ target, type: type as string, handler, options });
    },

    store: {},

    onCleanup(fn) {
      cleanups.push(fn);
    },

    // Overridden by the engine to toggle this feature off; no-op standalone.
    disableSelf() {},

    destroy() {
      for (const fn of cleanups) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
      cleanups.length = 0;
      for (const id of styleIds) doc.getElementById(id)?.remove();
      styleIds.clear();
      for (const f of flags) html.removeAttribute(`data-webable-${f}`);
      flags.clear();
      for (const p of vars) html.style.removeProperty(p);
      vars.clear();
      for (const n of owned) {
        try {
          (n as ChildNode).parentNode?.removeChild(n);
        } catch {
          /* already detached */
        }
      }
      owned.clear();
      for (const l of listeners) {
        try {
          l.target.removeEventListener(l.type, l.handler, l.options);
        } catch {
          /* ignore */
        }
      }
      listeners.length = 0;
    },
  };

  return ctx;
}

/**
 * Debounced MutationObserver. Used by the engine to re-apply dynamic features
 * (hide images, reading mask) after the page mutates: infinite scroll, route
 * changes, late-loaded content, without thrashing on every DOM write.
 *
 * `maxWait` is the important half. A plain trailing debounce starves: any page
 * that mutates faster than `delay` pushes the timer forward forever and the
 * callback never runs. Live sports scores, chat, tickers, and ad carousels all
 * do this, and those are pages where someone who needs dark mode or hidden
 * images needs it most. With maxWait the callback is guaranteed to run at
 * least every maxWait ms while mutations continue.
 */
export function createMutationManager(doc: Document, cb: () => void, delay = 200, maxWait = 1000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let obs: MutationObserver | undefined;
  let firstPending = 0;

  const now = () => Date.now();
  const run = () => {
    timer = undefined;
    firstPending = 0;
    cb();
  };
  const schedule = () => {
    if (!firstPending) firstPending = now();
    const waited = now() - firstPending;
    if (waited >= maxWait) {
      if (timer) clearTimeout(timer);
      run();
      return;
    }
    if (timer) clearTimeout(timer);
    // Never let the trailing debounce push past the deadline.
    timer = setTimeout(run, Math.min(delay, maxWait - waited));
  };

  return {
    start() {
      if (obs) return;
      const Ctor =
        (doc.defaultView as (Window & { MutationObserver?: typeof MutationObserver }) | null)?.MutationObserver ||
        (typeof MutationObserver === 'undefined' ? undefined : MutationObserver);
      if (!Ctor) return;
      obs = new Ctor(schedule);
      const target = doc.body || doc.documentElement;
      if (target) obs.observe(target, { childList: true, subtree: true });
    },
    stop() {
      obs?.disconnect();
      obs = undefined;
      if (timer) clearTimeout(timer);
      timer = undefined;
      firstPending = 0;
    },
  };
}

/**
 * Notices when a single-page app changes route.
 *
 * There was no SPA support at all: no popstate, no pushState, no hashchange
 * listener anywhere. The only re-application path was the MutationObserver,
 * which re-runs `meta.dynamic` features only, so on any SPA the reader mode and
 * most of the rest were simply wrong after the first route change and stayed
 * wrong.
 *
 * Three signals, because none of them covers everything:
 *   - popstate / hashchange are DOM events, so they reach a content script's
 *     isolated world as well as the widget's own world.
 *   - the Navigation API's `navigate` event covers programmatic same-document
 *     navigation where it exists.
 *   - patching history.pushState/replaceState catches the rest, but ONLY in
 *     the widget, which shares a realm with the page. A content script's patch
 *     cannot see the page's own call, which is why the URL is re-checked from
 *     the mutation path too (see the engine).
 */
export interface RouteWatcher {
  /** Current href as last seen. */
  href(): string;
  /** True (and updates the stored href) when the URL changed since last asked. */
  changed(): boolean;
  stop(): void;
}

export function createRouteWatcher(win: Window, onChange: () => void): RouteWatcher {
  const read = () => {
    try {
      return win.location.href;
    } catch {
      return '';
    }
  };
  let current = read();

  const check = () => {
    const next = read();
    if (next === current) return false;
    current = next;
    return true;
  };
  const fire = () => {
    // A same-document navigation updates location before or after the event
    // depending on the signal, so settle a frame before comparing.
    setTimeout(() => {
      if (check()) onChange();
    }, 0);
  };

  const cleanups: Array<() => void> = [];
  const listen = (target: EventTarget | undefined, type: string) => {
    if (!target) return;
    target.addEventListener(type, fire);
    cleanups.push(() => target.removeEventListener(type, fire));
  };

  listen(win, 'popstate');
  listen(win, 'hashchange');
  listen((win as unknown as { navigation?: EventTarget }).navigation, 'navigate');

  // Same-realm only. Wrapped in try/catch because some pages freeze history.
  try {
    const h = win.history as History & { __wa?: boolean };
    if (h && !h.__wa) {
      h.__wa = true;
      for (const name of ['pushState', 'replaceState'] as const) {
        const orig = h[name];
        if (typeof orig !== 'function') continue;
        h[name] = function patched(this: History, ...args: Parameters<History['pushState']>) {
          const out = orig.apply(this, args);
          fire();
          return out;
        };
        cleanups.push(() => {
          h[name] = orig;
          h.__wa = false;
        });
      }
    }
  } catch {
    /* history is not patchable here; the other signals still apply */
  }

  return {
    href: () => current,
    changed: check,
    stop() {
      for (const fn of cleanups) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
      cleanups.length = 0;
    },
  };
}

/* -------------------------------------------------------------------------
 * Shadow DOM
 *
 * Every feature is a stylesheet in the document's <head>, and a document
 * stylesheet does not apply inside a shadow root. So on any site built out of
 * web components (and that is a lot of them now, including most design-system
 * shells) larger text, spacing, link highlighting, focus rings, bigger click
 * targets and hidden images all stopped at the component's edge, silently.
 *
 * The colour features were the exception and still are: they compose a
 * `filter` on <body>, and a filter composites the whole rendered subtree,
 * shadow content included. Nothing here is needed for those.
 *
 * The fix is to adopt the same rules into each open shadow root. The catch is
 * that every rule this engine writes is gated on a flag on <html>:
 *
 *     html[data-webable-readable] :where(p,li,...){font-family:... }
 *
 * and from inside a shadow root <html> is unreachable, so an unmodified copy
 * of that sheet matches nothing at all. Not an error: a silent no-op, which is
 * the worst kind. The rules have to be rewritten on the way in, which is what
 * shadowScopedCSS does.
 *
 * Closed shadow roots cannot be reached at all. `element.shadowRoot` is null
 * for them by design and there is no way around it, so a site that closes its
 * roots is untreated inside them and always will be.
 * ---------------------------------------------------------------------- */

/** Index of the first top-level whitespace, or -1. Ignores brackets and quotes,
 *  which matter: `:where(svg image,...)` and `[class*="x" i]` both contain a
 *  space that is not a descendant combinator. */
function firstGap(s: string): number {
  let depth = 0;
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote && s[i - 1] !== '\\') quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (depth === 0 && (c === ' ' || c === '\n' || c === '\t' || c === '\r')) return i;
  }
  return -1;
}

/** Split a selector list on its top-level commas. */
function topSplit(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote && s[i - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

/**
 * Rewrite one selector list so it means the same thing from inside a shadow
 * root.
 *
 * The leading `html[data-webable-x]` is a gate, not a target: it decides
 * whether the rule is live. From inside a shadow root it can neither be matched
 * nor evaluated, so it is evaluated HERE, against the real <html>, and then
 * dropped. A rule whose gate is closed is left out of the sheet entirely, which
 * is why this has to re-run whenever the flags change.
 *
 * `body` goes the same way for the same reason. What is left over is the part
 * that describes page content, and that is the part a shadow root can match.
 * If nothing is left over the rule was aimed at <html> or <body> themselves
 * (the font-size scale, dark mode's backdrop) and has no meaning inside a
 * shadow root, so it is dropped.
 */
function reScope(selector: string, html: Element): string {
  const kept: string[] = [];
  for (const raw of topSplit(selector)) {
    let part = raw.trim();
    if (!part) continue;
    // Anything not anchored to <html> is the engine's own overlay chrome; it
    // carries no gate, so it passes through unchanged and matches nothing
    // inside a shadow root, which is correct.
    if (part.slice(0, 4) !== 'html') {
      kept.push(part);
      continue;
    }
    const gap = firstGap(part);
    const gate = gap < 0 ? part : part.slice(0, gap);
    let live = false;
    try {
      live = html.matches(gate);
    } catch {
      /* a selector this engine did not write, or an old parser: drop it */
    }
    if (!live) continue;
    part = gap < 0 ? '' : part.slice(gap).trim();
    if (part.slice(0, 4) === 'body') {
      const g2 = firstGap(part);
      if ((g2 < 0 ? part : part.slice(0, g2)) === 'body') part = g2 < 0 ? '' : part.slice(g2).trim();
    }
    if (part) kept.push(part);
  }
  return kept.join(',');
}

/** Index of the matching `}` for the `{` at `open`, or -1. */
function matchBrace(css: string, open: number): number {
  let depth = 0;
  let quote = '';
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === quote && css[i - 1] !== '\\') quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/**
 * Rewrite a whole document stylesheet for use inside a shadow root.
 *
 * Deliberately a text pass over CSS this repo wrote, not a CSSOM read. Going
 * through `styleEl.sheet.cssRules` would be more general and would also mean
 * the result depends on the host's CSS parser, which in jsdom drops `:where()`
 * and `:is()` on the floor: the transform would then be untestable in the test
 * environment and quietly different from what ships. A text pass gives the same
 * answer everywhere and is a pure function, so it can be tested directly.
 */
export function shadowScopedCSS(css: string, html: Element): string {
  const out: string[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const close = matchBrace(css, open);
    if (close < 0) break;
    const prelude = css.slice(i, open).trim();
    const body = css.slice(open + 1, close);
    if (prelude[0] === '@') {
      // @media and @supports wrap rules, so recurse. Everything else at-rule
      // shaped (@font-face, @keyframes) registers against the document and is
      // already visible to shadow content by name, so copying it into every
      // root would be bytes for nothing.
      if (/^@(?:media|supports)\b/.test(prelude)) {
        const inner = shadowScopedCSS(body, html);
        if (inner) out.push(`${prelude}{${inner}}`);
      }
    } else {
      const sel = reScope(prelude, html);
      if (sel) out.push(`${sel}{${body}}`);
    }
    i = close + 1;
  }
  return out.join('');
}

export interface ShadowStyles {
  /**
   * Re-read the engine's stylesheets and push the rewritten copy to every root
   * already known. Cheap by design: no DOM walk, because a constructed
   * stylesheet is shared and one `replaceSync` updates every root at once.
   */
  sync(): void;
  /** Look for shadow roots that have appeared since the last look. */
  rescan(): void;
  /** Take the styles back out of every root. */
  stop(): void;
}

/** Every open shadow root under `root`, depth first. */
function collectRoots(root: ParentNode, out: ShadowRoot[], depth: number): void {
  // Components nest, but not fifty deep; a bound keeps a pathological page from
  // turning a page load into a tree walk.
  if (depth > 12) return;
  const els = root.querySelectorAll('*');
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    // Our own panel, the AI popovers and the reading overlays all live in
    // shadow roots of their own. Treating them with the page treatment would
    // mean the panel someone is using to turn off hide-images has its own icons
    // hidden.
    if (el.hasAttribute('data-webable')) continue;
    const sr = el.shadowRoot;
    if (!sr) continue;
    out.push(sr);
    collectRoots(sr, out, depth + 1);
  }
}

/**
 * Open shadow roots in this document, memoised for the rest of the task.
 *
 * There is no API that hands you the shadow roots of a page, so finding them
 * costs a `querySelectorAll('*')` per root. That is affordable once, and not
 * once per interested caller: the engine re-adopts styles and three dynamic
 * features re-run their traversals in the same synchronous batch, which without
 * this would be four walks of the whole page every time the DOM settles. The
 * memo is released on the next microtask, so nothing is ever read from a stale
 * list across a turn.
 */
let rootMemo: { doc: Document; roots: ShadowRoot[] } | null = null;

function shadowRootsOf(doc: Document): ShadowRoot[] {
  if (rootMemo && rootMemo.doc === doc) return rootMemo.roots;
  const roots: ShadowRoot[] = [];
  collectRoots(doc, roots, 0);
  rootMemo = { doc, roots };
  Promise.resolve().then(() => {
    if (rootMemo && rootMemo.doc === doc) rootMemo = null;
  });
  return roots;
}

/**
 * `querySelectorAll` that also descends into open shadow roots.
 *
 * The stylesheet side of shadow support is not enough on its own for the
 * features that pair CSS with a pass over the DOM. Heading labels are the clear
 * case: the rule draws `content:attr(data-wa-tag)`, and adopting that rule into
 * a shadow root without also tagging the headings in there gives every shadow
 * heading an outline and an empty label.
 *
 * Closed roots are absent by construction and cannot be reached.
 */
export function queryDeep<T extends Element = Element>(root: ParentNode, selector: string): T[] {
  const out = Array.from(root.querySelectorAll<T>(selector));
  const doc = (root as Element).ownerDocument || (root as Document);
  const whole = root === doc || root === doc.documentElement;
  for (const sr of shadowRootsOf(doc)) {
    if (!whole && !(root as Element).contains(sr.host)) continue;
    const found = sr.querySelectorAll<T>(selector);
    for (let i = 0; i < found.length; i++) out.push(found[i]);
  }
  return out;
}

export function createShadowStyles(doc: Document): ShadowStyles {
  type SheetCtor = { new (): CSSStyleSheet; prototype: CSSStyleSheet };
  type Realm = Window & { CSSStyleSheet?: SheetCtor; ShadowRoot?: { prototype: ShadowRoot } };
  const win = doc.defaultView as Realm | null;
  const known = new Set<ShadowRoot>();
  const tags = new WeakMap<ShadowRoot, HTMLStyleElement>();
  let sheet: CSSStyleSheet | null = null;
  let text = '';

  // One constructed stylesheet shared by every root is the whole reason this
  // is affordable: a page with two hundred components gets one object and one
  // update, rather than two hundred copies of the CSS. The <style> fallback is
  // for older engines (and jsdom).
  const constructable = (() => {
    try {
      return (
        !!win &&
        typeof win.CSSStyleSheet === 'function' &&
        'replaceSync' in win.CSSStyleSheet.prototype &&
        !!win.ShadowRoot &&
        'adoptedStyleSheets' in win.ShadowRoot.prototype
      );
    } catch {
      return false;
    }
  })();

  function write(root: ShadowRoot): void {
    if (constructable) {
      if (!sheet) {
        sheet = new (win as Realm & { CSSStyleSheet: SheetCtor }).CSSStyleSheet();
        sheet.replaceSync(text);
      }
      const list = root.adoptedStyleSheets;
      if (list.indexOf(sheet) < 0) root.adoptedStyleSheets = list.concat(sheet);
      return;
    }
    let el = tags.get(root);
    if (!el) {
      el = doc.createElement('style');
      el.setAttribute('data-webable', 'shadow');
      root.appendChild(el);
      tags.set(root, el);
    }
    if (el.textContent !== text) el.textContent = text;
  }

  function collect(): string {
    const styles = doc.querySelectorAll('style[data-webable="base"],style[data-webable="feature"]');
    if (!styles.length) return '';
    let css = '';
    for (let i = 0; i < styles.length; i++) css += `${styles[i].textContent || ''}\n`;
    return shadowScopedCSS(css, doc.documentElement);
  }

  function rescan(): void {
    // Nothing to hand out means nothing to look for. This is the common case:
    // on a page where the user has turned nothing on, the walk never runs.
    if (!text) return;
    for (const r of shadowRootsOf(doc)) {
      write(r);
      known.add(r);
    }
  }

  return {
    sync() {
      const next = collect();
      if (next === text) return;
      const wasEmpty = !text;
      text = next;
      if (sheet) sheet.replaceSync(text);
      else if (!constructable) {
        for (const r of known) {
          const el = tags.get(r);
          if (el) el.textContent = text;
        }
      }
      // Turning the first feature on has to find the roots itself; after that
      // the mutation path is what notices new ones.
      if (wasEmpty) rescan();
    },
    rescan,
    stop() {
      for (const r of known) {
        const el = tags.get(r);
        if (el) {
          el.remove();
          tags.delete(r);
        }
        if (sheet) {
          try {
            r.adoptedStyleSheets = r.adoptedStyleSheets.filter((s) => s !== sheet);
          } catch {
            /* ignore */
          }
        }
      }
      known.clear();
      text = '';
    },
  };
}

/** Clamp + round a numeric setting to a sane CSS value. */
export function num(v: SettingValue | undefined, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
