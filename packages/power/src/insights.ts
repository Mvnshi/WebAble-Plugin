/**
 * Suggestions for the page that is open right now.
 *
 * Forty tools is a lot to choose from, and the people who would gain most from
 * them are the least likely to go looking. So the page is read for the handful
 * of problems that are actually on it (a cookie banner covering the article, a
 * white page while the system is set to dark, text under 14px, a 3,000 word
 * article) and each one is offered with the one tool that fixes it. Nothing is
 * changed until the person says so.
 *
 * Local and cheap: one pass over computed styles, sampled and capped, run only
 * when the popup or the command bar asks. Nothing leaves the page.
 */
import type { Intent } from './intents';
import { platformFor } from '@webable/core/feeds';

export interface Insight {
  id: string;
  /** What was noticed, said to a person. */
  title: string;
  /** Why the fix helps, one line. */
  why: string;
  /** Label for the button that applies it. */
  action: string;
  fix: Intent;
  /** Higher shows first. */
  weight: number;
}

export interface InsightInput {
  doc: Document;
  win: Window;
  /** Tools already on, so a suggestion is never "turn on what is on". */
  active: ReadonlySet<string>;
}

/** sRGB relative luminance of a CSS colour string. Null for transparent. */
export function luminance(css: string): number | null {
  const m = css.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/);
  if (!m) return null;
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (alpha < 0.5) return null;
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]);
}

export function contrast(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** The colour actually behind an element: the first opaque ancestor background. */
export function backgroundOf(el: Element | null, win: Window): number {
  let node: Element | null = el;
  while (node) {
    const l = luminance(win.getComputedStyle(node).backgroundColor);
    if (l !== null) return l;
    node = node.parentElement;
  }
  return 1; // the canvas default is white
}

/** Words of readable prose on the page, roughly. */
export function proseWords(doc: Document): number {
  const root = doc.querySelector('article, main, [role="main"]') || doc.body;
  if (!root) return 0;
  let n = 0;
  for (const p of Array.from(root.querySelectorAll('p, li, blockquote'))) {
    if (p.closest('nav, header, footer, aside, [data-webable-ui]')) continue;
    n += (p.textContent || '').split(/\s+/).filter(Boolean).length;
  }
  return n;
}

const COOKIE_WORDS = /\b(cookies?|consent|gdpr|privacy preferences|we use cookies|tracking technologies)\b/i;
const ACCEPT_WORDS = /\b(accept|agree|allow all|got it|ok|i understand)\b/i;
const WALL_WORDS = /\b(sign up|sign in|log in|create (a |an )?(free )?account|register) to (continue|keep reading|read more|view)|keep reading\b/i;

/** Big things fixed over the page: banners, modals, docked chat. */
function overlays(doc: Document, win: Window): Array<{ el: Element; area: number; text: string; top: number; height: number }> {
  const out: Array<{ el: Element; area: number; text: string; top: number; height: number }> = [];
  const vw = win.innerWidth || 1;
  const vh = win.innerHeight || 1;
  let checked = 0;
  for (const el of Array.from(doc.body ? doc.body.querySelectorAll('*') : [])) {
    if (checked++ > 4000) break;
    if (el.closest('[data-webable-ui]')) continue;
    const s = win.getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.1) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 20) continue;
    const area = (Math.min(r.right, vw) - Math.max(r.left, 0)) * (Math.min(r.bottom, vh) - Math.max(r.top, 0));
    if (area <= 0) continue;
    out.push({ el, area: area / (vw * vh), text: (el.textContent || '').slice(0, 600), top: r.top, height: r.height });
  }
  return out;
}

/** Median font size of body copy, in CSS px. */
function bodyTextSize(doc: Document, win: Window): number | null {
  const sizes: number[] = [];
  for (const p of Array.from(doc.querySelectorAll('p, li')).slice(0, 80)) {
    if (!(p.textContent || '').trim() || p.closest('nav, footer, [data-webable-ui]')) continue;
    sizes.push(parseFloat(win.getComputedStyle(p).fontSize));
  }
  if (sizes.length < 3) return null;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)];
}

/** Share of sampled body text that fails WCAG AA contrast (4.5:1). */
export function lowContrastShare(doc: Document, win: Window): number {
  let total = 0;
  let failing = 0;
  for (const el of Array.from(doc.querySelectorAll('p, li, span, a, td')).slice(0, 160)) {
    const text = (el.textContent || '').trim();
    if (text.length < 12 || el.closest('[data-webable-ui]')) continue;
    const s = win.getComputedStyle(el);
    const fg = luminance(s.color);
    if (fg === null) continue;
    const size = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight, 10) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    total++;
    if (contrast(fg, backgroundOf(el, win)) < need) failing++;
  }
  return total >= 8 ? failing / total : 0;
}

export function readInsights({ doc, win, active }: InsightInput): Insight[] {
  const out: Insight[] = [];
  const add = (i: Insight, tool?: string) => {
    if (tool && active.has(tool)) return;
    out.push(i);
  };
  const fixed = overlays(doc, win);

  const cookie = fixed.find((o) => COOKIE_WORDS.test(o.text) && ACCEPT_WORDS.test(o.text));
  if (cookie) {
    add(
      {
        id: 'cookies',
        title: 'A cookie banner is covering the page',
        why: 'Hides it without clicking anything. Your consent is not answered for you.',
        action: 'Hide cookie banners',
        fix: { kind: 'toggle', feature: 'cookieKill', on: true },
        weight: 90,
      },
      'cookieKill',
    );
  }

  const modal = fixed.find((o) => o !== cookie && o.area > 0.3);
  if (modal) {
    const wall = WALL_WORDS.test(modal.text);
    add(
      wall
        ? {
            id: 'wall',
            title: 'A sign-up wall is blocking the article',
            why: 'Lifts the overlay and unlocks scrolling. Real paywalls and logins are left alone.',
            action: 'Break sign-up walls',
            fix: { kind: 'toggle', feature: 'wallBreaker', on: true },
            weight: 88,
          }
        : {
            id: 'popup',
            title: 'A pop-up is covering most of the page',
            why: 'Dismisses newsletter and promo overlays and gives you scrolling back.',
            action: 'Dismiss pop-ups',
            fix: { kind: 'toggle', feature: 'popupKill', on: true },
            weight: 85,
          },
      wall ? 'wallBreaker' : 'popupKill',
    );
  }

  const vh = win.innerHeight || 1;
  const stickyShare = fixed
    .filter((o) => o !== cookie && o !== modal && o.area < 0.3)
    .reduce((sum, o) => sum + Math.min(o.height, vh) / vh, 0);
  if (stickyShare > 0.18) {
    add(
      {
        id: 'sticky',
        title: `Pinned bars take up ${Math.round(stickyShare * 100)}% of the screen`,
        why: 'Unpins headers and floating chat so you can see more of the page.',
        action: 'Unpin sticky bars',
        fix: { kind: 'toggle', feature: 'stickyKill', on: true },
        weight: 60,
      },
      'stickyKill',
    );
  }

  let systemDark = false;
  try {
    systemDark = win.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    /* no matchMedia (tests) */
  }
  const pageBg = backgroundOf(doc.body, win);
  if (systemDark && pageBg > 0.75 && !active.has('invertColors')) {
    add(
      {
        id: 'bright',
        title: 'Bright page, but your system is in dark mode',
        why: 'A tuned dark theme for this site, with images left as they are.',
        action: 'Turn on dark mode',
        fix: { kind: 'toggle', feature: 'darkMode', on: true },
        weight: 80,
      },
      'darkMode',
    );
  }

  const size = bodyTextSize(doc, win);
  if (size && size < 14.5) {
    add(
      {
        id: 'small-text',
        title: `Body text is small (${Math.round(size)}px)`,
        why: 'Scales the text up while keeping the layout readable.',
        action: 'Make text bigger',
        fix: { kind: 'set', feature: 'fontSize', patch: { value: size < 13 ? 140 : 125 } },
        weight: 70,
      },
      'fontSize',
    );
  }

  const share = lowContrastShare(doc, win);
  if (share > 0.2) {
    add(
      {
        id: 'contrast',
        title: `${Math.round(share * 100)}% of the text is hard to read against its background`,
        why: 'It fails the WCAG minimum contrast. High contrast makes it legible.',
        action: 'Raise contrast',
        fix: { kind: 'toggle', feature: 'highContrast', on: true },
        weight: 72,
      },
      'highContrast',
    );
  }

  const words = proseWords(doc);
  if (words > 900) {
    const minutes = Math.max(1, Math.round(words / 230));
    add(
      {
        id: 'article',
        title: `Long read, about ${minutes} minutes`,
        why: 'Reader mode strips everything but the article. Or have it read to you.',
        action: 'Open reader mode',
        fix: { kind: 'toggle', feature: 'readerMode', on: true },
        weight: 55,
      },
      'readerMode',
    );
    add({
      id: 'listen',
      title: `Listen instead (${minutes} min read)`,
      why: 'Reads the article aloud with your device voice. No account needed.',
      action: 'Read aloud',
      fix: { kind: 'action', id: 'readAloud' },
      weight: 40,
    });
  }

  let moving = 0;
  try {
    moving = (doc as Document & { getAnimations?: () => Animation[] }).getAnimations?.().filter((a) => a.playState === 'running').length || 0;
  } catch {
    /* older engines */
  }
  const autoplay = Array.from(doc.querySelectorAll('video')).filter((v) => !v.paused).length;
  if (moving > 6 || autoplay > 0) {
    add(
      {
        id: 'motion',
        title: autoplay ? 'Video is playing on its own' : `${moving} things are animating`,
        why: 'Freezes animation and autoplay, which helps with focus, migraine and vestibular disorders.',
        action: 'Stop animations',
        fix: { kind: 'toggle', feature: 'stopAnimations', on: true },
        weight: 50,
      },
      'stopAnimations',
    );
  }

  if (doc.querySelector('video') && !active.has('mediaSpeed')) {
    add({
      id: 'video',
      title: 'Video on this page',
      why: 'Watch at your pace: speed it up, or float it while you read.',
      action: 'Play at 1.5x',
      fix: { kind: 'set', feature: 'mediaSpeed', patch: { rate: 1.5 } },
      weight: 30,
    });
  }

  try {
    const body = doc.body && win.getComputedStyle(doc.body);
    if (body && (body.userSelect === 'none' || (body as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect === 'none')) {
      add(
        {
          id: 'copy',
          title: 'This site blocks selecting and copying text',
          why: 'Turns selection, copy and right-click back on.',
          action: 'Unlock selection',
          fix: { kind: 'toggle', feature: 'copyUnlock', on: true },
          weight: 45,
        },
        'copyUnlock',
      );
    }
  } catch {
    /* ignore */
  }

  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
  if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(viewport)) {
    add(
      {
        id: 'zoom',
        title: 'This site blocks pinch-zoom',
        why: 'Gives zoom back. Blocking it fails WCAG 1.4.4.',
        action: 'Allow zoom',
        fix: { kind: 'toggle', feature: 'forceZoom', on: true },
        weight: 35,
      },
      'forceZoom',
    );
  }

  let host = '';
  try {
    host = win.location.hostname;
  } catch {
    /* opaque origin */
  }
  if (platformFor(host) && !active.has('feedOff')) {
    add({
      id: 'feed',
      title: 'Endless feed detected',
      why: 'Hides the recommended feed. Search and subscriptions keep working.',
      action: 'Turn the feed off',
      fix: { kind: 'toggle', feature: 'feedOff', on: true },
      weight: 50,
    });
  }

  return out.sort((a, b) => b.weight - a.weight);
}
