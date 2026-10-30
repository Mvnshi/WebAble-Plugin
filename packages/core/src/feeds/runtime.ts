/**
 * The page side of the feed guard: look at the cards a platform just rendered,
 * decide which ones the user asked not to see, and act on that decision.
 *
 * Three rules this file is built around, all of them learned from what breaks
 * when a filter is written the obvious way:
 *
 *   1. Nothing is ever removed from the DOM. A hidden card keeps its node, its
 *      size in the platform's virtual list, and its event handlers; only its
 *      visibility changes, through one attribute and one stylesheet rule.
 *      Removing nodes from a virtualised feed is how a filter turns into a
 *      crash on somebody else's site.
 *   2. Every mutation is recorded on the element that received it, so stop()
 *      can put the page back exactly as the site built it. Same idiom the
 *      feature modules use (data-wa-*), for the same reason.
 *   3. Nothing this file inserts is inserted INTO the platform's own lists.
 *      The review chip and the overlays are children of <body> and are marked
 *      data-webable so the rest of the extension skips them.
 *
 * The decision itself is a pure function (see `decide`), because "why was this
 * hidden" is the question a user asks most and a question a test should be able
 * to ask without a browser.
 */
import type { AIProvider } from '../types';
import { CATEGORY_IDS, DEEP_WORK_CATEGORIES, categoryLabel } from './categories';
import { classify, fingerprint, LOW_CONFIDENCE, type Verdict } from './classify';
import { platformFor, type FeedItem, type PlatformAdapter } from './platforms';
import type { FeedRules, FeedSession } from './settings';
import type { FeedStore } from './store';

/** Marks everything this subsystem puts on the page, so teardown is total. */
const OWNED = 'data-webable';
/** Set on a card once judged, so a re-scan only looks at what is new. */
const MARK = 'data-wa-feed';
/** Set on a card that is being hidden. The value is the mode, so CSS can branch. */
const HIDE = 'data-wa-feed-hide';
/** Records a card's own `position` before the badge forced it to relative. */
const POS = 'data-wa-feed-pos';
const STYLE_ID = 'wa-feed-style';
const CHIP_ID = 'wa-feed-chip';
const OVERLAY_ID = 'wa-feed-overlay';
const POPOVER_ID = 'wa-feed-popover';

/** Below the panel and the launcher, above everything a site is likely to draw. */
const Z = 2147483630;

/**
 * The id list the AI-assist prompt sends. Built from the taxonomy rather than
 * retyped, so a category added to categories.ts reaches the prompt without
 * anybody remembering this file exists.
 */
const CATEGORY_LIST = CATEGORY_IDS.join(', ');

export type HideReason = 'shorts' | 'sponsored' | 'live' | 'clickbait' | 'blocked' | 'focus' | 'pass';

export interface Decision {
  hide: boolean;
  reason: HideReason;
  category: string;
}

/**
 * Which categories are allowed through right now.
 *
 * A running session narrows only if the user picked categories for it. The
 * reference product says both "runs on all content, pick categories above to
 * narrow it" and "runs a timed session on productive content" in different
 * places, which cannot both be true; this is the first reading, because it is
 * the one printed next to the button people actually press. A session with no
 * picks is a timer and a score, not a hidden extra filter nobody asked for.
 *
 * An empty result means everything is allowed, which is not the same as
 * nothing being allowed. That distinction is the whole allowlist.
 */
export function allowedCategories(rules: FeedRules, session: FeedSession | null): string[] {
  if (session && session.categories.length) return session.categories;
  if (rules.deepWork) return DEEP_WORK_CATEGORIES.slice();
  return rules.focus;
}

/**
 * The whole decision, in one pure function.
 *
 * Order matters and is deliberate. The three platform-marked kinds are settled
 * before any classification, because "this card is an ad" is something the site
 * told us and no keyword should be able to argue with it. The denylist beats
 * the allowlist, because a person who blocked Gossip and allowed Entertainment
 * meant the block.
 *
 * The honest sharp edge: when an allowlist is in force, a card the classifier
 * could not place is NOT in the list, so it is hidden. That is what "show only
 * the types you pick, everything else is hidden" means, and on short captions
 * the classifier cannot place a lot. It is why the review chip exists, why the
 * count is always on screen, and why AI assist is offered. It is stated in the
 * panel rather than left to be discovered.
 */
export function decide(
  item: Pick<FeedItem, 'kind'>,
  verdict: Verdict,
  rules: FeedRules,
  session: FeedSession | null,
): Decision {
  const category = verdict.category;

  if (rules.hideShorts && item.kind === 'short') return { hide: true, reason: 'shorts', category };
  // Acted on the platform's own marking, not on the classifier's confidence: a
  // card the site labelled "Sponsored" is sponsored whether or not the words in
  // its title score.
  if (rules.hideSponsored && (item.kind === 'ad' || category === 'AD')) {
    return { hide: true, reason: 'sponsored', category };
  }
  if (rules.hideLive && item.kind === 'live') return { hide: true, reason: 'live', category };
  if (rules.hideClickbait && category === 'CLICKBAIT') return { hide: true, reason: 'clickbait', category };
  if (rules.blocked.includes(category)) return { hide: true, reason: 'blocked', category };

  const allowed = allowedCategories(rules, session);
  if (allowed.length && !allowed.includes(category)) return { hide: true, reason: 'focus', category };

  return { hide: false, reason: 'pass', category };
}

/** Human sentence for a decision, used by the badge title and the log row. */
export function reasonText(reason: HideReason, category: string): string {
  switch (reason) {
    case 'shorts':
      return 'Short-form video, hidden by your filters.';
    case 'sponsored':
      return 'Sponsored or promoted, hidden by your filters.';
    case 'live':
      return 'Live stream, hidden by your filters.';
    case 'clickbait':
      return 'The title reads as clickbait.';
    case 'blocked':
      return `${categoryLabel(category)} is on your blocked list.`;
    case 'focus':
      return `${categoryLabel(category)} is not one of the categories you picked.`;
    default:
      return `${categoryLabel(category)}, allowed through.`;
  }
}

export interface FeedGuardOptions {
  doc: Document;
  win: Window;
  store: FeedStore;
  /**
   * Used only for cards the on-device pass could not place, and only when the
   * user turned aiAssist on. Absent means the on-device answer is final.
   */
  provider?: AIProvider | null;
  /** Injectable clock, so tests can pin a day boundary or a session expiry. */
  now?: () => number;
}

export interface FeedGuard {
  readonly platform: PlatformAdapter | null;
  start(): void;
  stop(): void;
  /**
   * Judge only what is new. This is the scroll path, so it must stay cheap:
   * cards already marked are skipped by the adapter and never reclassified.
   */
  sweep(): void;
  /**
   * Re-judge everything from scratch. For a rules change or a route change,
   * where a card's old verdict is no longer the answer.
   */
  refresh(): void;
  /** Show what was hidden on this page, until the next navigation. */
  reveal(on: boolean): void;
  revealed(): boolean;
  hiddenCount(): number;
  subscribe(fn: () => void): () => void;
  destroy(): void;
}

/** How often the clock accrues. Short enough to be fair, long enough to be cheap. */
const TICK_MS = 15000;
/** How many unplaced cards one AI-assist round will ask about. */
const ASSIST_BATCH = 12;

export function createFeedGuard(opts: FeedGuardOptions): FeedGuard {
  const { doc, win, store } = opts;
  const now = opts.now || (() => Date.now());
  const host = (() => {
    try {
      return (win.location?.hostname || '').toLowerCase();
    } catch {
      return '';
    }
  })();
  const platform = platformFor(host);

  const owned: Element[] = [];
  const listeners = new Set<() => void>();
  let tick: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let showAll = false;
  let hidden = 0;
  /** Re-judging a card must not count the same content as another exposure. */
  const counted = new WeakMap<HTMLElement, string>();
  /** Titles the provider settled, kept for this document only. */
  const assisted = new Map<string, string>();
  /** Fingerprints already sent, so a scroll cannot ask about the same card twice. */
  const asked = new Set<string>();
  let assistInFlight = false;

  const notify = () => {
    for (const fn of Array.from(listeners)) {
      try {
        fn();
      } catch {
        /* one bad subscriber must not stop the rest */
      }
    }
  };

  const own = <T extends Element>(el: T): T => {
    el.setAttribute(OWNED, '');
    owned.push(el);
    return el;
  };

  const rules = (): FeedRules => store.rulesFor(platform ? platform.id : null);
  const session = () => store.activeSession(now());

  // ── Styles ────────────────────────────────────────────────────────────────
  // One stylesheet, injected once, keyed off attributes rather than classes so
  // a site's own class churn cannot fight it.
  function css(): string {
    return `
[${HIDE}="remove"]{display:none !important}
[${HIDE}="blur"]{filter:blur(14px) saturate(.35) !important;pointer-events:none !important;user-select:none !important}
html[data-webable-feedreveal] [${HIDE}]{display:revert !important;filter:none !important;pointer-events:auto !important;outline:2px dashed rgba(30,64,175,.65) !important;outline-offset:-2px}
.wa-fbadge{position:absolute;top:6px;left:6px;z-index:9;display:inline-flex;align-items:center;gap:5px;
  padding:3px 7px;border-radius:999px;font:600 11px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;
  color:#fff;background:rgba(15,23,42,.86);box-shadow:0 1px 4px rgba(0,0,0,.28);pointer-events:auto;max-width:calc(100% - 12px)}
.wa-fbadge-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wa-fdot{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
.wa-fdot[data-tone="go"]{background:#22c55e}
.wa-fdot[data-tone="maybe"]{background:#f59e0b}
.wa-fdot[data-tone="stop"]{background:#ef4444}
.wa-fbtn{all:unset;cursor:pointer;padding:0 3px;border-radius:4px;line-height:1;font-size:11px}
.wa-fbtn:hover{background:rgba(255,255,255,.22)}
.wa-fbtn:focus-visible{outline:2px solid #fff;outline-offset:1px}
#${CHIP_ID}{position:fixed;left:16px;bottom:16px;z-index:${Z};display:flex;align-items:center;gap:10px;
  padding:9px 13px;border-radius:12px;border:1px solid rgba(15,23,42,.14);background:#fff;color:#0a1b2e;
  font:500 12.5px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif;box-shadow:0 8px 26px rgba(15,23,42,.18)}
#${CHIP_ID} button{all:unset;cursor:pointer;font-weight:650;color:#1e40af;padding:2px 4px;border-radius:5px}
#${CHIP_ID} button:focus-visible{outline:2px solid #1e40af;outline-offset:1px}
#${OVERLAY_ID}{position:fixed;inset:0;z-index:${Z};display:grid;place-items:center;padding:24px;
  background:rgba(9,14,24,.94);color:#f3f7fc;font:400 15px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif}
#${OVERLAY_ID} .wa-fo-card{max-width:460px;text-align:center}
#${OVERLAY_ID} h2{font:650 22px/1.3 inherit;margin:0 0 10px}
#${OVERLAY_ID} p{margin:0 0 18px;color:#c7d3e4}
#${OVERLAY_ID} .wa-fo-row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
#${OVERLAY_ID} button{all:unset;cursor:pointer;padding:10px 16px;border-radius:10px;font:600 13px/1 inherit;
  background:#5b8cff;color:#08111f}
#${OVERLAY_ID} button.ghost{background:transparent;color:#f3f7fc;box-shadow:inset 0 0 0 1px rgba(255,255,255,.32)}
#${OVERLAY_ID} button:focus-visible{outline:2px solid #fff;outline-offset:2px}
#${POPOVER_ID}{position:fixed;z-index:${Z};max-width:260px;padding:10px;border-radius:12px;background:#fff;
  color:#0a1b2e;border:1px solid rgba(15,23,42,.14);box-shadow:0 12px 32px rgba(15,23,42,.22);
  font:400 12.5px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif}
#${POPOVER_ID} .wa-fp-title{font-weight:650;margin-bottom:7px}
#${POPOVER_ID} button{all:unset;cursor:pointer;display:block;width:100%;box-sizing:border-box;padding:6px 8px;
  border-radius:7px;margin-bottom:3px}
#${POPOVER_ID} button:hover{background:#eef1f5}
#${POPOVER_ID} button:focus-visible{outline:2px solid #1e40af;outline-offset:-2px}
@media (prefers-reduced-motion:reduce){#${CHIP_ID},#${OVERLAY_ID}{transition:none !important}}
`;
  }

  function injectStyle(): void {
    if (doc.getElementById(STYLE_ID)) return;
    const el = doc.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css();
    (doc.head || doc.documentElement)?.appendChild(own(el));
  }

  // ── Wholesale containers ──────────────────────────────────────────────────
  // Comments, the sidebar, the shorts shelf and the DM inbox are not cards to
  // be judged, they are regions to be gone. One flag-gated rule per switch, so
  // turning a switch off is a stylesheet edit rather than a DOM walk.
  function chromeCSS(r: FeedRules): string {
    if (!platform) return '';
    const c = platform.chrome;
    const out: string[] = [];
    const add = (on: boolean, sels: string[]) => {
      if (!on || !sels.length) return;
      // Each selector gets its own rule. A selector an engine rejects (`:has`
      // on an old build) invalidates only its own rule this way, instead of
      // taking every other selector in the list down with it.
      for (const s of sels) out.push(`${s}{display:none !important}`);
    };
    add(r.hideComments, c.comments);
    add(r.hideSidebar, c.sidebar);
    add(r.hideShorts, c.shorts);
    add(r.hideLive, c.live);
    add(r.hideSponsored, c.sponsored);
    add(r.hideMessages, c.messages);
    return out.join('\n');
  }

  let chromeStyle: HTMLStyleElement | null = null;
  function applyChrome(r: FeedRules): void {
    const text = chromeCSS(r);
    if (!text) {
      chromeStyle?.remove();
      chromeStyle = null;
      return;
    }
    if (!chromeStyle) {
      chromeStyle = doc.createElement('style');
      chromeStyle.id = 'wa-feed-chrome';
      (doc.head || doc.documentElement)?.appendChild(own(chromeStyle));
    }
    if (chromeStyle.textContent !== text) chromeStyle.textContent = text;
  }

  // ── Badges ────────────────────────────────────────────────────────────────
  function tone(v: Verdict, d: Decision): 'go' | 'maybe' | 'stop' {
    if (d.hide) return 'stop';
    return v.confidence >= LOW_CONFIDENCE ? 'go' : 'maybe';
  }

  function badge(item: FeedItem, v: Verdict, d: Decision, r: FeedRules): void {
    if (!r.showLabel && !r.showDot) return;
    const card = item.el;
    // Absolute positioning needs a positioned ancestor. Recorded first, so
    // stop() can hand the card's own layout back rather than guess at it.
    const style = card.style;
    if (card.getAttribute(POS) == null) {
      card.setAttribute(POS, style.position || '');
      if (!style.position) style.position = 'relative';
    }
    const el = doc.createElement('span');
    el.className = 'wa-fbadge';
    el.setAttribute('data-wa-feed-badge', '');
    el.title = reasonText(d.reason, d.category);
    if (r.showDot) {
      const dot = doc.createElement('span');
      dot.className = 'wa-fdot';
      dot.setAttribute('data-tone', tone(v, d));
      el.appendChild(dot);
    }
    if (r.showLabel) {
      const text = doc.createElement('span');
      text.className = 'wa-fbadge-text';
      text.textContent = categoryLabel(d.category);
      el.appendChild(text);
      if (r.showConfirm) {
        const fp = fingerprint({ title: item.title, channel: item.channel });
        const yes = doc.createElement('button');
        yes.className = 'wa-fbtn';
        yes.type = 'button';
        yes.textContent = '✓';
        yes.setAttribute('aria-label', `Confirm ${categoryLabel(d.category)}`);
        yes.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          store.correct(fp, d.category);
          el.remove();
        });
        const no = doc.createElement('button');
        no.className = 'wa-fbtn';
        no.type = 'button';
        no.textContent = '✕';
        no.setAttribute('aria-label', `Correct the category for ${item.title || 'this item'}`);
        no.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openPopover(no, fp, v);
        });
        el.appendChild(yes);
        el.appendChild(no);
      }
    }
    own(el);
    card.appendChild(el);
  }

  /**
   * The correction popover. Offers the runners-up first, because a wrong badge
   * is almost always wrong in a way the classifier already considered.
   */
  function openPopover(anchor: HTMLElement, fp: string, v: Verdict): void {
    doc.getElementById(POPOVER_ID)?.remove();
    const box = doc.createElement('div');
    box.id = POPOVER_ID;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Correct this category');
    const head = doc.createElement('div');
    head.className = 'wa-fp-title';
    head.textContent = 'What is this really?';
    box.appendChild(head);

    const choices = [...v.alternates, 'EDU', 'ENTERTAINMENT', 'MUSIC', 'NEWS']
      .filter((c, i, a) => c !== v.category && a.indexOf(c) === i)
      .slice(0, 6);
    for (const id of choices) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = categoryLabel(id);
      b.addEventListener('click', () => {
        store.correct(fp, id);
        box.remove();
        refresh(true);
      });
      box.appendChild(b);
    }
    own(box);
    (doc.body || doc.documentElement)?.appendChild(box);
    // Positioned against the viewport because the anchor may sit inside a
    // clipped, scrolling list that would hide an absolutely positioned child.
    try {
      const r = anchor.getBoundingClientRect();
      box.style.left = `${Math.max(8, Math.min(r.left, (win.innerWidth || 800) - 272))}px`;
      box.style.top = `${Math.min(r.bottom + 6, (win.innerHeight || 600) - 40)}px`;
    } catch {
      box.style.left = '16px';
      box.style.top = '16px';
    }
    const away = (e: Event) => {
      if (!box.contains(e.target as Node)) {
        box.remove();
        doc.removeEventListener('pointerdown', away, true);
      }
    };
    doc.addEventListener('pointerdown', away, true);
  }

  // ── The review chip ───────────────────────────────────────────────────────
  function paintChip(): void {
    const existing = doc.getElementById(CHIP_ID);
    if (!hidden || !running) {
      existing?.remove();
      return;
    }
    const label = `${hidden} item${hidden === 1 ? '' : 's'} hidden`;
    const buttonText = showAll ? 'Hide again' : 'Review';
    // The page's MutationObserver sees this chip too. A sweep that changes
    // nothing must not rebuild it and schedule the next sweep itself.
    if (
      existing &&
      existing.firstElementChild?.textContent === label &&
      existing.lastElementChild?.textContent === buttonText
    ) {
      return;
    }
    const box = existing || own(doc.createElement('div'));
    if (!existing) {
      box.id = CHIP_ID;
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      (doc.body || doc.documentElement)?.appendChild(box);
    }
    box.textContent = '';
    const text = doc.createElement('span');
    text.textContent = label;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.textContent = buttonText;
    btn.addEventListener('click', () => reveal(!showAll));
    box.appendChild(text);
    box.appendChild(btn);
  }

  // ── Overlays ──────────────────────────────────────────────────────────────
  function overlay(title: string, body: string, actions: Array<{ label: string; ghost?: boolean; run: () => void }>): void {
    doc.getElementById(OVERLAY_ID)?.remove();
    const box = own(doc.createElement('div'));
    box.id = OVERLAY_ID;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'false');
    box.setAttribute('aria-label', title);
    const card = doc.createElement('div');
    card.className = 'wa-fo-card';
    const h = doc.createElement('h2');
    h.textContent = title;
    const p = doc.createElement('p');
    p.textContent = body;
    const row = doc.createElement('div');
    row.className = 'wa-fo-row';
    for (const a of actions) {
      const b = doc.createElement('button');
      b.type = 'button';
      if (a.ghost) b.className = 'ghost';
      b.textContent = a.label;
      b.addEventListener('click', a.run);
      row.appendChild(b);
    }
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(row);
    box.appendChild(card);
    (doc.body || doc.documentElement)?.appendChild(box);
    try {
      (row.firstElementChild as HTMLElement | null)?.focus();
    } catch {
      /* focus is a nicety here, not a requirement */
    }
  }

  function clearOverlay(): void {
    doc.getElementById(OVERLAY_ID)?.remove();
  }

  function paintOverlay(r: FeedRules): boolean {
    if (!platform) return false;
    if (r.blockSite) {
      if (!doc.getElementById(OVERLAY_ID)) {
        overlay(
          `${platform.label} is on your focus list`,
          'You asked WebAble to cover this site rather than filter it. Open the WebAble panel from the toolbar to lift it.',
          [],
        );
      }
      return true;
    }
    const limit = store.limitFor(platform.id, now());
    if (limit.over) {
      if (!doc.getElementById(OVERLAY_ID)) {
        overlay(
          `Your ${platform.label} time is up`,
          `You set a ${limit.limit} minute limit for today and it is spent. Leaving now is the point of the limit, and if you genuinely need longer you can say so.`,
          [
            { label: 'Leave this site', run: () => goBack() },
            {
              label: 'Give me 10 more minutes',
              ghost: true,
              run: () => {
                store.grantExtra(platform.id, 10, now());
                clearOverlay();
                notify();
              },
            },
          ],
        );
        store.addLog({ at: now(), platform: platform.id, kind: 'limit', category: '', title: 'Daily limit reached' });
      }
      return true;
    }
    clearOverlay();
    return false;
  }

  function goBack(): void {
    try {
      if (win.history.length > 1) win.history.back();
      else win.location.href = 'about:blank';
    } catch {
      /* a site that froze history keeps its overlay, which is still the limit working */
    }
  }

  // ── Following only ────────────────────────────────────────────────────────
  // A redirect, not a hide: there is nothing to hide on a For You page, the
  // whole surface is the recommendation. Fired once per navigation so a user
  // who deliberately goes back is not fought with.
  let redirected = '';
  function followingOnly(r: FeedRules): void {
    if (!platform || !r.followingOnly || !platform.followingPath) return;
    let url: { pathname: string; hostname: string; href: string };
    try {
      url = { pathname: win.location.pathname, hostname: win.location.hostname, href: win.location.href };
    } catch {
      return;
    }
    if (!platform.isAlgorithmicFeed(url) && !platform.isShortForm(url)) return;
    if (url.pathname === platform.followingPath) return;
    if (redirected === url.href) return;
    redirected = url.href;
    try {
      win.location.assign(platform.followingPath);
    } catch {
      /* a blocked navigation leaves the feed filtered, which is the fallback */
    }
  }

  // ── AI assist ─────────────────────────────────────────────────────────────
  /**
   * Ask the configured provider about the cards the on-device pass could not
   * place. One request per scan at most, capped, and only for titles never sent
   * before in this document. Off unless the user turned it on: this is the only
   * part of the subsystem that transmits anything, so it follows the same rule
   * as the rest of the extension's AI, which is that nothing goes out without
   * being asked for.
   */
  function assist(unsure: Array<{ fp: string; title: string; channel: string }>): void {
    const provider = opts.provider;
    if (!provider || !provider.isConfigured() || assistInFlight || !unsure.length) return;
    const batch = unsure.filter((u) => !asked.has(u.fp)).slice(0, ASSIST_BATCH);
    if (!batch.length) return;
    for (const b of batch) asked.add(b.fp);
    assistInFlight = true;
    const list = batch.map((b, i) => `${i + 1}. ${b.title}${b.channel ? ` (${b.channel})` : ''}`).join('\n');
    provider
      .ask(
        `Classify each numbered item into exactly one category id from this list: ${CATEGORY_LIST}. ` +
          `Answer with one line per item in the form "<number>=<CATEGORY_ID>" and nothing else. ` +
          `Use GENERAL when none fits.`,
        list,
      )
      .then((answer) => {
        for (const line of String(answer || '').split('\n')) {
          const m = /^\s*(\d+)\s*=\s*([A-Z_]+)/.exec(line);
          if (!m) continue;
          const item = batch[Number(m[1]) - 1];
          if (item) assisted.set(item.fp, m[2]);
        }
        refresh(true);
      })
      .catch(() => {
        /* a provider that is down leaves the on-device answer standing */
      })
      .then(() => {
        assistInFlight = false;
      });
  }

  // ── The scan ──────────────────────────────────────────────────────────────
  function scan(): void {
    if (!platform || !running) return;
    const state = store.getState();
    if (!state.enabled) {
      clearPage();
      return;
    }
    injectStyle();
    const r = rules();
    applyChrome(r);
    if (paintOverlay(r)) return;
    followingOnly(r);

    const s = session();
    const corrections = state.corrections;
    const items = platform.items(doc);
    if (!items.length) return;

    const unsure: Array<{ fp: string; title: string; channel: string }> = [];
    let newlyHidden = 0;
    let newlyCounted = 0;
    let sample = '';
    let sampleCat = '';
    let sampleReason: HideReason = 'pass';

    for (const item of items) {
      const input = { title: item.title, channel: item.channel, meta: item.meta };
      const fp = fingerprint(input);
      let verdict = classify(input, corrections);
      const helped = assisted.get(fp);
      if (helped && verdict.confidence < LOW_CONFIDENCE) {
        verdict = { category: helped, confidence: LOW_CONFIDENCE, matched: ['ai assist'], alternates: verdict.alternates };
      }
      const d = decide(item, verdict, r, s);

      item.el.setAttribute(MARK, d.reason);
      if (d.hide) {
        item.el.setAttribute(HIDE, r.cleanScroll === 'blur' ? 'blur' : 'remove');
        newlyHidden += 1;
        if (counted.get(item.el) !== fp) {
          counted.set(item.el, fp);
          newlyCounted += 1;
          if (!sample) {
            sample = item.title;
            sampleCat = d.category;
            sampleReason = d.reason;
          }
        }
      } else {
        item.el.removeAttribute(HIDE);
        badge(item, verdict, d, r);
      }

      if (r.aiAssist && verdict.confidence < LOW_CONFIDENCE && item.title) {
        unsure.push({ fp, title: item.title, channel: item.channel });
      }
    }

    hidden += newlyHidden;
    if (newlyCounted) {
      store.countHidden(platform.id, newlyCounted, now());
      store.addLog({
        at: now(),
        platform: platform.id,
        kind: sampleReason === 'shorts' ? 'shorts' : sampleReason === 'sponsored' ? 'sponsored' : 'hidden',
        category: sampleCat,
        // The log records one title per batch, not every one. A row per card on
        // an infinite feed is not a log, it is the feed again.
        title: newlyCounted > 1 ? `${sample} and ${newlyCounted - 1} more` : sample,
      });
    }
    if (newlyHidden) {
      paintChip();
      notify();
    }

    if (unsure.length) assist(unsure);
  }

  function refresh(clearMarks = false): void {
    if (clearMarks) {
      for (const el of Array.from(doc.querySelectorAll(`[${MARK}]`))) {
        el.removeAttribute(MARK);
        el.removeAttribute(HIDE);
      }
      for (const el of Array.from(doc.querySelectorAll('[data-wa-feed-badge]'))) el.remove();
      hidden = 0;
    }
    scan();
    paintChip();
  }

  function reveal(on: boolean): void {
    showAll = on;
    doc.documentElement?.toggleAttribute('data-webable-feedreveal', on);
    paintChip();
    notify();
  }

  // ── The clock ─────────────────────────────────────────────────────────────
  // Counts only while this document is both visible and focused, which is what
  // "active browsing time" has to mean: a YouTube tab left open behind a text
  // editor is not time spent on YouTube, and counting it would make every limit
  // a lie by lunchtime.
  function active(): boolean {
    try {
      if (doc.visibilityState && doc.visibilityState !== 'visible') return false;
      return typeof doc.hasFocus === 'function' ? doc.hasFocus() : true;
    } catch {
      return false;
    }
  }

  function onTick(): void {
    if (!platform || !running) return;
    if (!store.getState().enabled) return;
    if (!active()) return;
    const r = rules();
    store.addSeconds(platform.id, TICK_MS / 1000, r.deepWork, now());
    // The overlay is not painted by the clock alone: a limit reached while the
    // user is mid-scroll should land on the next scan, not a frame later, so
    // the check runs here and the paint runs through the same function scan
    // uses.
    if (paintOverlay(r)) notify();
  }

  /** Restore the page both on stop() and when only Feed guard is switched off. */
  function clearPage(): void {
    clearOverlay();
    doc.getElementById(CHIP_ID)?.remove();
    doc.getElementById(POPOVER_ID)?.remove();
    doc.getElementById(STYLE_ID)?.remove();
    chromeStyle?.remove();
    chromeStyle = null;
    for (const el of Array.from(doc.querySelectorAll(`[${MARK}]`))) {
      el.removeAttribute(MARK);
      el.removeAttribute(HIDE);
    }
    for (const el of Array.from(doc.querySelectorAll(`[${POS}]`))) {
      const prev = el.getAttribute(POS) || '';
      (el as HTMLElement).style.position = prev;
      el.removeAttribute(POS);
    }
    for (const el of Array.from(doc.querySelectorAll('[data-wa-feed-badge]'))) el.remove();
    doc.documentElement?.removeAttribute('data-webable-feedreveal');
    hidden = 0;
    showAll = false;
  }

  return {
    platform,
    start() {
      if (running || !platform) return;
      running = true;
      injectStyle();
      tick = setInterval(onTick, TICK_MS);
      scan();
      paintChip();
    },
    stop() {
      running = false;
      if (tick) clearInterval(tick);
      tick = null;
      // Hand every card back exactly as the site built it.
      clearPage();
      notify();
    },
    sweep: () => refresh(false),
    refresh: () => refresh(true),
    reveal,
    revealed: () => showAll,
    hiddenCount: () => hidden,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      this.stop();
      for (const el of owned) el.remove();
      owned.length = 0;
      listeners.clear();
    },
  };
}
