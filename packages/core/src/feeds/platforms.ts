/**
 * Per-platform DOM knowledge for YouTube, TikTok, Instagram and X.
 *
 * Everything the feed guard needs to know about a page that is specific to the
 * site it is on lives here: how to find the cards in a feed, how to read a
 * card's title and author, how to tell a Short from a video from an ad from a
 * live stream, and which containers a switch hides wholesale. Nothing else in
 * the subsystem is allowed to name a site, so when a platform ships a redesign
 * this is the only file that moves.
 *
 * The rule, carried over from feedSelectorsFor in ../features/declutter.ts and
 * binding on everything below: only ever target specific feed containers, never
 * nav, never search, never the video or post the user came here for. A selector
 * that has drifted must degrade to "hides nothing", never to "breaks the site".
 * That is why there is no geometry-based or text-similarity-based card finder
 * here, and why several lists below are deliberately empty: an empty list hides
 * nothing, and a guess at a `div` hides the page.
 *
 * Honesty note, because the rest of this file reads like it was measured.
 *
 * What it is NOT: no selector here has been run against a live page. Chromium
 * in this environment cannot reach these four hosts (its TLS handshakes die
 * inside the egress tunnel; the proxy's own status endpoint records them, and
 * plain curl to the same hosts succeeds). So nothing below has been seen
 * matching a real card in a real browser.
 *
 * What it IS: every selector was diffed, on 2026-08-30, against the shipped
 * Firefox build of an independently maintained product that filters the same
 * four sites (algoright_ai_social_media-5.14.xpi, sha256
 * 6685347750a6e2a1024905d5a2602ac8d229fd318c50fab2d30117afb143c6bc). 27 of the
 * load-bearing hooks appear in both, including every card selector on YouTube,
 * the title and channel readers, the comment and sidebar containers, and the
 * TikTok and X data attributes. That is corroboration by a build somebody keeps
 * working, which is worth more than one author's memory and less than a live
 * page.
 *
 * The diff also found four real gaps, each fixed here and commented where it
 * sits: the Shorts player item (so "hide short-form" did nothing on /shorts),
 * the three compact sidebar card variants, TikTok's entire explore grid, and a
 * TikTok messages hook that was the wrong plural. Nothing was copied from that
 * build: a CSS selector naming a public custom element is a fact about
 * YouTube's DOM, and the comparison was of facts, not of code.
 *
 * So treat an unmarked selector as "corroborated, not seen"; the ones marked
 * "best guess" individually are not even that. QA.md carries the eight-step
 * run that would close the difference.
 *
 * items() reads one data attribute it never writes: `data-wa-feed`. The content
 * script stamps a card once it has judged it, and this file skips anything
 * already stamped, so a second pass over a grown feed reports only what is new.
 */
import type { PlatformId } from './settings';
import { PLATFORM_LABELS } from './settings';

export type ItemKind = 'video' | 'short' | 'post' | 'ad' | 'live';

export interface FeedItem {
  /** The card element to hide, blur or badge. Never a descendant of it. */
  el: HTMLElement;
  title: string;
  /** Channel, account or author. Empty string when the card does not show one. */
  channel: string;
  /** Badges, hashtags, duration, anything else readable on the card. */
  meta: string;
  kind: ItemKind;
}

export interface ChromeSelectors {
  /** The Shorts/Reels shelves and entries, and the short-form feed itself. */
  shorts: string[];
  comments: string[];
  /** Left nav and the up-next rail. */
  sidebar: string[];
  live: string[];
  /** Cards the platform itself marks as promoted. */
  sponsored: string[];
  /** The DM inbox entry point and any inbox panel. */
  messages: string[];
}

export interface PlatformAdapter {
  id: PlatformId;
  label: string;
  /** Host match, www and m subdomains included. */
  matches(hostname: string): boolean;
  chrome: ChromeSelectors;
  /** Where "following only" sends the user. Absolute path on the platform. */
  followingPath: string | null;
  /** True when this URL is itself a short-form surface (Shorts, Reels, For You). */
  isShortForm(url: { pathname: string; hostname: string }): boolean;
  /** True when this URL is the algorithmic feed rather than a chosen page. */
  isAlgorithmicFeed(url: { pathname: string; hostname: string }): boolean;
  /** Every candidate card in the document, deduplicated, capped at 400. */
  items(doc: Document): FeedItem[];
}

// ─── Shared plumbing ─────────────────────────────────────────────────────────

/**
 * The caller's "I have already judged this card" stamp. Read, never written:
 * items() is a query, and a query that mutates the page would double-count on
 * the next pass if the caller decided to keep a card after all.
 */
const MARK_ATTR = 'data-wa-feed';

/**
 * One pass reports at most this many cards.
 *
 * An hour of scrolling leaves several thousand cards in a YouTube grid, and
 * every reported item costs a classification on the main thread. The cap keeps
 * one pass bounded and costs nothing in coverage: the caller stamps what it has
 * judged, so the next pass starts past the stamped ones and the window walks
 * down the feed as the user does.
 */
const MAX_ITEMS = 400;

function clean(s: string | null | undefined): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function textOf(el: Element | null | undefined): string {
  return el ? clean(el.textContent) : '';
}

/**
 * All matches for a group of selectors, in document order, from a single query.
 *
 * Joining the group is what keeps document order right and keeps the query
 * count at one per group. The fallback exists because one selector the browser
 * does not understand (`:has`, an `i` attribute flag on an old engine) throws
 * for the whole joined string, and losing every card because of one unsupported
 * selector is the "breaks the site" failure this file is written to avoid. The
 * fallback returns per-selector order rather than document order; dedup still
 * holds, and only the ordering of a degraded browser suffers.
 */
function findAll(root: ParentNode, selectors: readonly string[]): HTMLElement[] {
  if (!selectors.length) return [];
  try {
    return Array.from(root.querySelectorAll<HTMLElement>(selectors.join(',')));
  } catch {
    const out: HTMLElement[] = [];
    for (const sel of selectors) {
      try {
        out.push(...Array.from(root.querySelectorAll<HTMLElement>(sel)));
      } catch {
        /* a selector this engine cannot parse contributes nothing */
      }
    }
    return out;
  }
}

function findOne(root: ParentNode, selectors: readonly string[]): HTMLElement | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector<HTMLElement>(sel);
      if (el) return el;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** First non-empty of text, title, aria-label across a selector group. Never throws. */
function pickText(root: ParentNode, selectors: readonly string[]): string {
  for (const sel of selectors) {
    let el: HTMLElement | null = null;
    try {
      el = root.querySelector<HTMLElement>(sel);
    } catch {
      continue;
    }
    if (!el) continue;
    const t = textOf(el) || clean(el.getAttribute('title')) || clean(el.getAttribute('aria-label'));
    if (t) return t;
  }
  return '';
}

function attrOf(root: ParentNode, selectors: readonly string[], name: string): string {
  const el = findOne(root, selectors);
  return el ? clean(el.getAttribute(name)) : '';
}

/** Readable scraps from a card: badges, durations, hashtags. Bounded, deduplicated. */
function gatherText(root: ParentNode, selectors: readonly string[], limit = 6): string[] {
  const parts: string[] = [];
  for (const el of findAll(root, selectors)) {
    const t = (textOf(el) || clean(el.getAttribute('aria-label'))).slice(0, 120);
    if (t && !parts.includes(t)) parts.push(t);
    if (parts.length >= limit) break;
  }
  return parts;
}

/**
 * Whole-label match against a small word list, the way power.ts matches consent
 * buttons: "Ad" is an ad badge, "Ad Astra reviewed" is a title. Bounded because
 * a card can hold a hundred spans and this runs per card per pass.
 */
function hasExactText(
  root: ParentNode,
  selectors: readonly string[],
  words: readonly string[],
  limit = 60,
): boolean {
  const nodes = findAll(root, selectors);
  const n = Math.min(nodes.length, limit);
  for (let i = 0; i < n; i += 1) {
    const t = textOf(nodes[i]).toLowerCase();
    if (t.length <= 24 && words.includes(t)) return true;
  }
  return false;
}

const DURATION_RE = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/;

/** Seconds from a "1:02:03" or "0:58" badge, or null when it is not a duration. */
function durationSeconds(raw: string): number | null {
  const m = DURATION_RE.exec(raw.trim());
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Whether a card is present but not on screen for the user.
 *
 * Deliberately attribute-only. The obvious guard is geometry (offsetParent null
 * and offsetWidth zero), but jsdom reports zero width and a null offsetParent
 * for every element it has ever laid out, which is none of them, so a geometry
 * guard does not thin a test fixture, it empties it. The attributes catch the
 * real cases anyway: YouTube marks exhausted continuation shelves `hidden`, and
 * carousels mark their off-screen slides aria-hidden.
 */
function isSuppressed(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  try {
    return el.style.display === 'none';
  } catch {
    return false;
  }
}

function hasTakenAncestor(el: HTMLElement, taken: Set<HTMLElement>): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (taken.has(p)) return true;
  }
  return false;
}

/**
 * The shared card walk. Each adapter supplies its selectors and a reader, and
 * a reader returning null means "this matched the selector but is not a card",
 * which is how the looser selectors (Instagram's `div[role="button"]`) are kept
 * honest.
 *
 * The ancestor check is what upholds FeedItem.el's promise of never being a
 * descendant of another item: cards nest on YouTube, where a
 * ytd-rich-item-renderer wraps the newer yt-lockup-view-model and both match.
 * Document order puts the outer one first, so the inner one is dropped.
 */
function collect(
  doc: Document,
  selectors: readonly string[],
  read: (el: HTMLElement) => FeedItem | null,
): FeedItem[] {
  const out: FeedItem[] = [];
  const taken = new Set<HTMLElement>();
  for (const el of findAll(doc, selectors)) {
    if (out.length >= MAX_ITEMS) break;
    if (taken.has(el)) continue;
    if (el.getAttribute(MARK_ATTR) != null) continue;
    if (isSuppressed(el)) continue;
    if (hasTakenAncestor(el, taken)) continue;
    const item = read(el);
    if (!item) continue;
    taken.add(el);
    out.push(item);
  }
  return out;
}

/** Lower-cased host with the port and any trailing dot removed. */
function hostOf(hostname: string): string {
  return (hostname || '').toLowerCase().trim().replace(/\.$/, '').replace(/:\d+$/, '');
}

/**
 * The same site's desktop, mobile and legacy-mobile hosts collapse to one name.
 * Only these three prefixes: music.youtube.com and studio.youtube.com are
 * different products and must not collapse into youtube.com, and they do not,
 * because nothing here strips them.
 */
function bareHost(hostname: string): string {
  return hostOf(hostname).replace(/^(www|m|mobile)\./, '');
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

const YT_CARDS = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-grid-video-renderer',
  'ytd-reel-item-renderer',
  // The Shorts PLAYER item, as opposed to the shelf entry above it. Without
  // this, "hide short-form" did nothing once somebody was actually inside
  // /shorts, which is the surface the switch exists for. Found by diffing this
  // list against an independently maintained shipping build (see the note on
  // verification in the header).
  'ytd-reel-video-renderer',
  // The up-next rail is not only videos. A movie, a playlist and a radio mix
  // are cards a person asked to have sorted too, and all three were slipping
  // through unjudged.
  'ytd-compact-movie-renderer',
  'ytd-compact-playlist-renderer',
  'ytd-compact-radio-renderer',
  'ytd-ad-slot-renderer',
  'ytd-promoted-video-renderer',
  // Mobile web ships its own element set with the same shape.
  'ytm-video-with-context-renderer',
  'ytm-compact-video-renderer',
  'ytm-reel-item-renderer',
  'ytm-shorts-lockup-view-model',
  // The 2024 rewrite. Appears inside ytd-rich-item-renderer on home and alone
  // in some rails, hence the ancestor dedup in collect().
  'yt-lockup-view-model',
];

const YT_TITLE = [
  '#video-title',
  'a#video-title-link',
  'yt-formatted-string#video-title',
  'h3 a',
  '.yt-lockup-metadata-view-model__title',
  'a[title]',
];

const YT_CHANNEL = [
  'ytd-channel-name a',
  '#channel-name a',
  '.ytd-channel-name a',
  'ytd-channel-name',
  '#channel-name',
  'ytm-badge-and-byline-renderer',
  '.yt-content-metadata-view-model__metadata-row a',
];

const YT_BADGE = [
  'ytd-badge-supported-renderer',
  'badge-shape',
  '.badge-shape-wiz__text',
  'ytd-thumbnail-overlay-time-status-renderer',
  '#time-status',
  '.ytd-thumbnail-overlay-time-status-renderer',
  '#metadata-line',
];

const YT_SHORT = [
  'a[href*="/shorts/"]',
  '[aria-label*="Shorts" i]',
  'ytd-reel-item-renderer',
  'ytm-shorts-lockup-view-model',
  '[overlay-style="SHORTS"]',
];

/**
 * Elements that ARE a Short, rather than elements that contain a marker saying
 * so.
 *
 * Checked by tag like YT_AD_TAGS, and for the same reason the ad path does it:
 * inside /shorts the player item carries no href to /shorts/ and no overlay,
 * because the page is already the Shorts page. Adding the element to YT_SHORT
 * alone found the card and then called it a video, so the switch found the
 * right node and did nothing with it. A test caught that; the selector list and
 * the kind detector are two separate things and adding to one is half a fix.
 */
const YT_SHORT_TAGS = new Set(['ytd-reel-item-renderer', 'ytd-reel-video-renderer', 'ytm-reel-item-renderer']);

const YT_LIVE = [
  '.badge-style-type-live-now',
  '[class*="live-now" i]',
  'ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"]',
  '[overlay-style="LIVE"]',
];

const YT_AD = ['ytd-ad-slot-renderer', 'ytd-promoted-video-renderer', 'ad-slot-renderer'];
const YT_AD_TAGS = new Set(YT_AD);

function ytKind(el: HTMLElement, badges: string[]): ItemKind {
  const exact = badges.map((b) => b.toLowerCase());
  // Ad first, always. A promoted Short is an ad the user asked to stop seeing,
  // and answering "short" would route it past the sponsored switch.
  if (YT_AD_TAGS.has(el.tagName.toLowerCase())) return 'ad';
  if (findOne(el, YT_AD)) return 'ad';
  if (exact.includes('ad') || exact.includes('sponsored') || exact.includes('promoted')) return 'ad';

  if (exact.includes('live') || exact.includes('live now') || findOne(el, YT_LIVE)) return 'live';

  if (YT_SHORT_TAGS.has(el.tagName.toLowerCase())) return 'short';
  if (findOne(el, YT_SHORT)) return 'short';
  // Duration last, and only after the href and overlay checks have failed: a
  // 45 second regular upload is indistinguishable from a Short by length
  // alone, so this signal is allowed to decide only when nothing better said.
  for (const b of badges) {
    const secs = durationSeconds(b);
    if (secs !== null && secs > 0 && secs < 61) return 'short';
  }
  return 'video';
}

const youtube: PlatformAdapter = {
  id: 'youtube',
  label: PLATFORM_LABELS.youtube,
  matches(hostname) {
    // music. and studio. survive bareHost, so they never equal youtube.com and
    // are excluded without a special case. Neither is a feed, and Studio is
    // somebody's workplace.
    return bareHost(hostname) === 'youtube.com';
  },
  chrome: {
    shorts: [
      'ytd-reel-shelf-renderer',
      'ytd-rich-shelf-renderer[is-shorts]',
      // A shorts shelf sits inside a plain section renderer, and CSS cannot
      // climb from the shelf to its section without :has. Callers must emit
      // this one as its own rule: an engine that does not know :has throws out
      // the entire rule it appears in, which would take the two above with it.
      'ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)',
      'a[title="Shorts"]',
      'ytm-pivot-bar-item-renderer[tab-identifier="FEshorts"]',
      // The Shorts surface itself. Hiding the shelves on the home feed and
      // leaving /shorts fully working was a switch that kept half its promise.
      'ytd-shorts',
      'ytd-reel-video-renderer',
    ],
    comments: ['#comments', 'ytd-comments'],
    sidebar: [
      '#secondary',
      'ytd-watch-next-secondary-results-renderer',
      '#related',
      'tp-yt-app-drawer#guide',
      'ytd-mini-guide-renderer',
    ],
    // Same :has caveat as above, and the same fallback: items() reports these
    // cards as kind 'live' regardless, so an engine without :has still hides
    // them, by the item pass instead of by CSS.
    live: [
      'ytd-rich-item-renderer:has(.badge-style-type-live-now)',
      'ytd-video-renderer:has(.badge-style-type-live-now)',
      'ytd-compact-video-renderer:has(.badge-style-type-live-now)',
    ],
    sponsored: [
      'ytd-ad-slot-renderer',
      'ytd-promoted-video-renderer',
      'ad-slot-renderer',
      'ytd-display-ad-renderer',
      'ytd-in-feed-ad-layout-renderer',
      '#player-ads',
      '#masthead-ad',
    ],
    // Empty because YouTube has no DM inbox: messaging was removed in 2019.
    // This is "there is nothing to hide", not "we could not find it".
    messages: [],
  },
  followingPath: '/feed/subscriptions',
  isShortForm(url) {
    return url.pathname === '/shorts' || url.pathname.startsWith('/shorts/');
  },
  isAlgorithmicFeed(url) {
    const p = url.pathname;
    return p === '/' || p === '' || p === '/feed/trending' || p === '/feed/explore';
  },
  items(doc) {
    return collect(doc, YT_CARDS, (el) => {
      const badges = gatherText(el, YT_BADGE);
      const title = pickText(el, YT_TITLE) || attrOf(el, ['a[title]'], 'title');
      const channel = pickText(el, YT_CHANNEL);
      return { el, title, channel, meta: badges.join(' '), kind: ytKind(el, badges) };
    });
  },
};

// ─── TikTok ──────────────────────────────────────────────────────────────────

const TT_CARDS = [
  '[data-e2e="recommend-list-item-container"]',
  '[data-e2e="search_top-item"]',
  '[data-e2e="user-post-item"]',
  // Explore is its own grid with its own hooks, and it was missed entirely:
  // every card on tiktok.com/explore went unjudged.
  '[data-e2e="explore-item"]',
];

const TT_CAPTION = [
  '[data-e2e="video-desc"]',
  '[data-e2e="search-card-video-caption"]',
  '[data-e2e="explore-card-desc"]',
];
// uniqueid is the @handle and is what a channel lexicon term would match, so it
// stays first. The nickname is the display name and is the fallback for a card
// that shows one and not the other.
const TT_AUTHOR = [
  '[data-e2e="video-author-uniqueid"]',
  '[data-e2e="search-card-user-link"]',
  '[data-e2e="explore-card-user-unique-id"]',
  '[data-e2e="video-author-nickname"]',
];
const TT_META = ['[data-e2e="video-desc"] a', '[data-e2e="video-views"]', '[data-e2e="ad-tag"]'];

const tiktok: PlatformAdapter = {
  id: 'tiktok',
  label: PLATFORM_LABELS.tiktok,
  matches(hostname) {
    return bareHost(hostname) === 'tiktok.com';
  },
  chrome: {
    // On TikTok "hide shorts" can only mean the For You feed, because every
    // video on the site is short form. Search and profile grids stay: those
    // are pages the user chose, and hiding them would be hiding the content
    // they came for.
    shorts: ['[data-e2e="recommend-list-item-container"]', '[class*="DivForYouRecommend" i]'],
    comments: ['[data-e2e="comment-list"]', '[data-e2e="browse-comment"]'],
    // Best guess: the left rail's own hook has changed name more than once and
    // was not checked against a live page.
    sidebar: ['[data-e2e="nav-sidebar"]'],
    // Best guess. The link form hides an entry point rather than a card, which
    // is the harmless direction to be wrong in.
    live: ['[data-e2e="live-card"]', 'a[href^="/live"]'],
    // The tag, not the card: TikTok puts no marker on the card itself, so the
    // card is caught by items() reporting kind 'ad'.
    sponsored: ['[data-e2e="ad-tag"]', '[data-e2e="ad-item"]'],
    // Both spellings. Which one TikTok ships has changed, and a nav hook that
    // is merely the wrong plural silently turns "hide messages" into a switch
    // that does nothing.
    messages: ['a[href^="/messages"]', '[data-e2e="nav-messages"]', '[data-e2e="nav-message"]'],
  },
  followingPath: '/following',
  isShortForm(_url) {
    // Not a URL test at all on this platform. Every TikTok video is short form,
    // so a person who turned Shorts off has turned TikTok off, and saying so
    // here is more honest than pretending some path is the safe one.
    return true;
  },
  isAlgorithmicFeed(url) {
    const p = url.pathname;
    return p === '/' || p === '' || p.startsWith('/foryou') || p.startsWith('/explore');
  },
  items(doc) {
    return collect(doc, TT_CARDS, (el) => {
      const title = pickText(el, TT_CAPTION);
      const channel = pickText(el, TT_AUTHOR);
      const meta = gatherText(el, TT_META).join(' ');
      const sponsored =
        !!findOne(el, ['[data-e2e="ad-tag"]', '[data-e2e="ad-item"]']) ||
        hasExactText(el, ['span', 'div'], ['sponsored', 'promoted', 'ad']);
      return { el, title, channel, meta, kind: sponsored ? 'ad' : 'short' };
    });
  },
};

// ─── Instagram ───────────────────────────────────────────────────────────────

/**
 * `div[role="button"]` is the explore grid's card, and it is also every other
 * button on the page. It stays in the list because there is no better hook,
 * and the reader below rejects anything without media, which is the structural
 * check that keeps the loose selector from reporting the nav.
 */
const IG_CARDS = ['article', 'main div[role="button"]'];

const IG_MEDIA = ['img', 'a[href*="/p/"]', 'a[href*="/reel/"]', 'video'];
// Not a bare `span` fallback: on a post the first span is usually the like
// count, and a like count is not a caption.
const IG_CAPTION = ['h1', 'span[dir="auto"]'];
const IG_AUTHOR = ['header a[role="link"]', 'header a', 'a[role="link"]'];

const instagram: PlatformAdapter = {
  id: 'instagram',
  label: PLATFORM_LABELS.instagram,
  matches(hostname) {
    return bareHost(hostname) === 'instagram.com';
  },
  chrome: {
    // The nav entry only. An individual reel card carries no class or attribute
    // that survives a build, so reels in a grid are hidden through items()
    // reporting kind 'short' rather than through a selector.
    shorts: ['a[href^="/reels/"]', 'a[href="/reels/"]'],
    // Structural, not semantic, and knowingly imprecise. Instagram's class
    // names are generated per build (`x1i10hfl`, and a different one tomorrow),
    // so there is nothing stable to match on and the comment list is described
    // by where it sits: the list inside a post. Scoped to the article so that
    // being wrong costs a list inside a post, not the page.
    comments: ['article ul'],
    // Best guess, not verified against a live page.
    sidebar: ['nav', 'div[role="navigation"]'],
    // Empty on purpose. Live sits inside the stories tray with no hook of its
    // own, and the guess that would catch it would take the whole tray.
    live: [],
    // Empty on purpose, and this one is not a gap in research: Instagram marks
    // an ad with the word "Sponsored" in a span and nothing else, and CSS has
    // no text matcher. items() carries the signal as kind 'ad'.
    sponsored: [],
    messages: ['a[href^="/direct/"]'],
  },
  // Instagram has no separate following URL: the chronological sort lives
  // behind a menu on the home feed, so the most "following only" can do is put
  // the user back on home and off explore.
  followingPath: '/',
  isShortForm(url) {
    return url.pathname.startsWith('/reels') || url.pathname.startsWith('/reel/');
  },
  isAlgorithmicFeed(url) {
    const p = url.pathname;
    return p === '/' || p === '' || p.startsWith('/explore');
  },
  items(doc) {
    return collect(doc, IG_CARDS, (el) => {
      if (!findOne(el, IG_MEDIA)) return null;
      const title = pickText(el, IG_CAPTION);
      const channel = pickText(el, IG_AUTHOR);
      // The alt text is worth having: Instagram writes "Photo by X on ... May
      // be an image of ..." into it, which is often the only readable
      // description a wordless post has.
      const alt = attrOf(el, ['img[alt]'], 'alt').slice(0, 200);
      const sponsored = hasExactText(el, ['span'], ['sponsored']);
      const isReel = !!findOne(el, ['a[href*="/reel/"]', 'a[href*="/reels/"]']);
      const kind: ItemKind = sponsored ? 'ad' : isReel ? 'short' : 'post';
      return { el, title, channel, meta: alt, kind };
    });
  },
};

// ─── X ───────────────────────────────────────────────────────────────────────

const X_CARDS = ['article[data-testid="tweet"]'];
const X_TEXT = ['[data-testid="tweetText"]'];
const X_AUTHOR = ['[data-testid="User-Name"]'];
const X_META = ['[data-testid="socialContext"]', 'time', '[data-testid="card.wrapper"]'];

const x: PlatformAdapter = {
  id: 'x',
  label: PLATFORM_LABELS.x,
  matches(hostname) {
    const h = bareHost(hostname);
    return h === 'x.com' || h === 'twitter.com';
  },
  chrome: {
    // X has no short-form surface. The list stays empty rather than being
    // filled with "hide every video", which is not what the switch says.
    shorts: [],
    // Best guess: the conversation timeline's aria-label is the only thing
    // separating replies from the tweet they answer, and both are the same
    // article element.
    comments: ['[aria-label^="Timeline: Conversation" i]'],
    sidebar: ['[data-testid="sidebarColumn"]'],
    // Best guess: Spaces is the closest thing X has to live.
    live: ['a[href*="/i/spaces/"]'],
    // Best guess. The reliable signal is the "Ad" or "Promoted" label, which is
    // text, so items() is what actually catches these.
    sponsored: ['[data-testid="placementTracking"]'],
    messages: ['a[href^="/messages"]', '[data-testid="DMDrawer"]'],
  },
  followingPath: '/home',
  isShortForm(_url) {
    return false;
  },
  isAlgorithmicFeed(url) {
    // Approximate, and cannot be made exact. For You and Following are two tabs
    // on the same /home URL, and which one is selected is client state that
    // never reaches the address bar, so this answers true for both and the
    // caller gets a false positive on the half the user actually chose.
    return url.pathname === '/home';
  },
  items(doc) {
    return collect(doc, X_CARDS, (el) => {
      const title = pickText(el, X_TEXT);
      const channel = pickText(el, X_AUTHOR);
      const meta = gatherText(el, X_META).join(' ');
      const promoted =
        hasExactText(el, ['span'], ['ad', 'promoted']) || !!findOne(el, ['[data-testid="placementTracking"]']);
      // Everything else is 'post': a tweet with a video attached is still a
      // tweet, and there is no card type that says otherwise.
      return { el, title, channel, meta, kind: promoted ? 'ad' : 'post' };
    });
  },
};

export const ADAPTERS: readonly PlatformAdapter[] = [youtube, tiktok, instagram, x];

export function platformFor(hostname: string): PlatformAdapter | null {
  const h = hostOf(hostname);
  if (!h) return null;
  for (const a of ADAPTERS) {
    if (a.matches(h)) return a;
  }
  return null;
}
