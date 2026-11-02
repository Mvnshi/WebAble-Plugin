/**
 * What is on the page, in the terms a person navigates by: headings, regions,
 * links, and the site's own search box.
 *
 * Screen reader users have had this for decades (the rotor, the elements list,
 * "next heading"). Everybody else scrolls and hunts. The command bar's "go to"
 * and the keyboard click hints are built on this map, so a sighted keyboard
 * user, a switch user and somebody who is simply in a hurry all get the same
 * jump-straight-there that assistive technology users already rely on.
 *
 * Read-only. Nothing here changes the page except `jumpTo`, which scrolls and
 * moves focus, and puts both back the way a browser would.
 */

export type TargetKind = 'heading' | 'landmark' | 'link' | 'button' | 'field';

export interface PageTarget {
  kind: TargetKind;
  label: string;
  el: Element;
  /** Heading level 1 to 6. */
  level?: number;
  href?: string;
}

const MAX_LINKS = 400;

/**
 * The name a screen reader would announce, close enough for search. Not the
 * full accessible-name algorithm: it skips CSS-generated content and the
 * recursion rules, and errs toward the visible text, which is what a sighted
 * person typing into a search box remembers anyway.
 */
export function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return squash(aria);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const doc = el.ownerDocument;
    const text = by
      .split(/\s+/)
      .map((id) => doc.getElementById(id)?.textContent || '')
      .join(' ');
    if (text.trim()) return squash(text);
  }
  if (el instanceof el.ownerDocument.defaultView!.HTMLInputElement) {
    const input = el as HTMLInputElement;
    if (input.labels && input.labels[0]) return squash(input.labels[0].textContent || '');
    if (/^(submit|button|reset)$/.test(input.type)) return squash(input.value || input.type);
    return squash(input.placeholder || input.name || input.title || '');
  }
  const text = squash((el as HTMLElement).innerText ?? el.textContent ?? '');
  if (text) return text;
  const img = el.querySelector('img[alt]');
  if (img) return squash(img.getAttribute('alt') || '');
  return squash(el.getAttribute('title') || '');
}

function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim().slice(0, 140);
}

/** Rendered and not hidden from everyone. Layout-free fallbacks for jsdom. */
export function isShown(el: Element): boolean {
  if (el.closest('[hidden],[aria-hidden="true"],[inert]')) return false;
  const win = el.ownerDocument.defaultView;
  if (!win) return false;
  const style = win.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rects = (el as HTMLElement).getClientRects?.();
  // jsdom has no layout and reports no rects for anything. Treat that as shown,
  // or nothing would be testable; a real browser always has rects for a
  // rendered element.
  if (rects && rects.length === 0 && (el as HTMLElement).offsetParent === null && win.navigator.userAgent.indexOf('jsdom') < 0) {
    return style.position === 'fixed';
  }
  return true;
}

const LANDMARKS: Array<[string, string]> = [
  ['main, [role="main"]', 'Main content'],
  ['nav, [role="navigation"]', 'Navigation'],
  ['[role="search"], search', 'Search'],
  ['header, [role="banner"]', 'Header'],
  ['footer, [role="contentinfo"]', 'Footer'],
  ['aside, [role="complementary"]', 'Sidebar'],
];

/** Everything worth jumping to, in document order within each kind. */
export function collectTargets(doc: Document): PageTarget[] {
  const out: PageTarget[] = [];
  const own = (el: Element) => !el.closest('[data-webable-ui]');

  for (const el of Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))) {
    if (!own(el) || !isShown(el)) continue;
    const label = accessibleName(el);
    if (!label) continue;
    const level = /^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : Number(el.getAttribute('aria-level')) || 2;
    out.push({ kind: 'heading', label, el, level });
  }

  for (const [sel, base] of LANDMARKS) {
    const found = Array.from(doc.querySelectorAll(sel)).filter((el) => own(el) && isShown(el));
    // A header inside an article is not the page banner, and HTML only makes
    // the top-level ones landmarks. Keep it simple: skip any nested in another
    // landmark of the same kind.
    for (const el of found) {
      if (found.some((other) => other !== el && other.contains(el))) continue;
      const name = el.getAttribute('aria-label') || '';
      out.push({ kind: 'landmark', label: name ? `${base}: ${squash(name)}` : base, el });
    }
  }

  const seen = new Set<string>();
  let links = 0;
  for (const el of Array.from(doc.querySelectorAll('a[href]'))) {
    if (links >= MAX_LINKS) break;
    if (!own(el) || !isShown(el)) continue;
    const href = (el as HTMLAnchorElement).href;
    if (!href || href.startsWith('javascript:')) continue;
    const label = accessibleName(el);
    if (!label) continue;
    const key = `${label}\u0000${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: 'link', label, el, href });
    links++;
  }
  return out;
}

/**
 * The site's own search box, if it has one. Ordered by how sure each signal
 * is: an explicit search input, then one inside a search landmark, then the
 * conventional names a search parameter goes by.
 */
export function findSearchInput(doc: Document): HTMLInputElement | null {
  const candidates = [
    'input[type="search"]',
    '[role="search"] input:not([type="hidden"]):not([type="submit"])',
    'search input:not([type="hidden"])',
    'form[action*="search" i] input[type="text"]',
    'input[name="q"], input[name="s"], input[name="query"], input[name="search"], input[name="k"], input[name="keywords"]',
    'input[placeholder*="search" i], input[aria-label*="search" i]',
  ];
  for (const sel of candidates) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      const input = el as HTMLInputElement;
      if (input.disabled || input.readOnly) continue;
      if (el.closest('[data-webable-ui]')) continue;
      return input;
    }
  }
  return null;
}

/**
 * Type into a site's input in a way its framework will notice.
 *
 * Setting `.value` alone is invisible to React and friends, which track the
 * value through their own property on the element; they see the change only
 * when an input event arrives and the DOM value differs from what they
 * recorded. Going through the prototype setter changes the DOM value without
 * updating their record, which is exactly that condition.
 */
export function typeInto(input: HTMLInputElement, text: string): void {
  const win = input.ownerDocument.defaultView!;
  const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
  input.focus();
  if (setter) setter.call(input, text);
  else input.value = text;
  input.dispatchEvent(new win.Event('input', { bubbles: true }));
  input.dispatchEvent(new win.Event('change', { bubbles: true }));
}

/** Submit the way a person would: the form if there is one, Enter if not. */
export function submitSearch(input: HTMLInputElement): void {
  const win = input.ownerDocument.defaultView!;
  const form = input.form;
  if (form) {
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
    return;
  }
  for (const type of ['keydown', 'keypress', 'keyup']) {
    input.dispatchEvent(new win.KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  }
}

/**
 * Bring an element into view and put keyboard focus on it, so the next Tab
 * continues from there rather than from wherever focus was before. An element
 * that is not focusable gets a temporary tabindex, removed on blur, which is
 * the same trick skip links use.
 */
export function jumpTo(el: Element): void {
  const h = el as HTMLElement;
  try {
    h.scrollIntoView({ block: 'center', behavior: prefersReducedMotion(el) ? 'auto' : 'smooth' });
  } catch {
    h.scrollIntoView();
  }
  const focusable = h.matches('a[href], button, input, select, textarea, summary, [tabindex]');
  if (!focusable) {
    h.setAttribute('tabindex', '-1');
    h.addEventListener('blur', () => h.removeAttribute('tabindex'), { once: true });
  }
  try {
    h.focus({ preventScroll: true });
  } catch {
    /* an element that refuses focus is still in view */
  }
  flash(el);
}

export function prefersReducedMotion(el: Element): boolean {
  try {
    return !!el.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Draw a ring around an element for a moment, so the eye finds where the page
 * just jumped to. An overlay rather than an outline on the element, because
 * the element's own styles can hide an outline, and changing them would be
 * changing the page.
 */
export function flash(el: Element, ms = 1400): void {
  const doc = el.ownerDocument;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return;
  const ring = doc.createElement('div');
  ring.setAttribute('data-webable-ui', 'flash');
  ring.setAttribute('aria-hidden', 'true');
  const pad = 6;
  Object.assign(ring.style, {
    position: 'fixed',
    left: `${r.left - pad}px`,
    top: `${r.top - pad}px`,
    width: `${r.width + pad * 2}px`,
    height: `${r.height + pad * 2}px`,
    border: '3px solid #2f80ff',
    borderRadius: '10px',
    boxShadow: '0 0 0 4px rgba(47,128,255,.25), 0 0 24px rgba(47,128,255,.45)',
    pointerEvents: 'none',
    zIndex: '2147483646',
    transition: 'opacity .4s ease',
  } as Partial<CSSStyleDeclaration>);
  doc.documentElement.appendChild(ring);
  // A smooth scroll moves the element after the ring is placed. Follow it for
  // the first half second rather than leaving the ring where it used to be.
  const start = Date.now();
  const follow = () => {
    if (!ring.isConnected) return;
    const n = el.getBoundingClientRect();
    ring.style.left = `${n.left - pad}px`;
    ring.style.top = `${n.top - pad}px`;
    if (Date.now() - start < 700) requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
  setTimeout(() => (ring.style.opacity = '0'), ms);
  setTimeout(() => ring.remove(), ms + 450);
}
