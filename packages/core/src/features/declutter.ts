/**
 * Mainstream "give me back the page" tools. All three are reversible and
 * scoped: they hide containers via flag-gated CSS (auto-removed on disable) and
 * record any inline mutations under data attributes that disable() restores.
 * None remove DOM nodes or call preventDefault, so a site never breaks.
 */
import type { FeatureContext, FeatureModule, FeatureSetting } from '../types';

function getStyle(el: Element, prop: string): string {
  try {
    return (el.ownerDocument.defaultView || window).getComputedStyle(el).getPropertyValue(prop);
  } catch {
    return '';
  }
}

// ─── Wall Breaker ────────────────────────────────────────────────────────────
// Peels off "sign up to keep reading" overlays, unlocks the scroll/blur they
// leave behind. It NEVER bypasses a real paywall payment or hides a real login
// form (text-gate match + password-field guard).

// Known soft-gate containers, safe to hide whenever the tool is on.
const GATE = [
  '[class*="regwall" i]', '[class*="reg-wall" i]', '[class*="paywall" i]', '[id*="paywall" i]',
  '[class*="metering" i]', '[class*="piano" i]', '.tp-modal', '.tp-backdrop', '[class*="poool" i]',
  '#poool-widget', '[class*="gate-overlay" i]', '[class*="article-gate" i]', '[class*="content-gate" i]',
  '[class*="subscribe-wall" i]', '[class*="signup-wall" i]', '[class*="login-wall" i]',
  '[class*="register-wall" i]', '[class*="gated-overlay" i]',
];

// Generic overlays we only hide when their TEXT proves they are a content gate.
const OVERLAY_SEL = '[role="dialog"],[aria-modal="true"],[class*="modal" i],[class*="overlay" i],[class*="popup" i]';
const GATE_RE =
  /\b(sign[ -]?in|sign[ -]?up|log[ -]?in|create (a |an )?(free )?account|subscribe to (read|continue)|keep reading|to continue reading|register to (read|continue))\b/i;

function unlockScroll(ctx: FeatureContext) {
  for (const el of [ctx.html, ctx.body]) {
    if (!el) continue;
    if (getStyle(el, 'overflow') === 'hidden' && el.style.overflow === 'hidden') {
      if (el.getAttribute('data-wa-ovf') == null) el.setAttribute('data-wa-ovf', el.style.overflow || '');
      el.style.overflow = 'visible';
    }
  }
}

function hideTextGates(ctx: FeatureContext) {
  let count = 0;
  ctx.doc.querySelectorAll<HTMLElement>(OVERLAY_SEL).forEach((el) => {
    if (count > 40) return;
    if (el.getAttribute('data-wa-wall') != null) return;
    // Never touch a real login/checkout: a password field means it's the
    // genuine thing, not a teaser gate.
    if (el.querySelector('input[type="password"]')) return;
    const txt = (el.textContent || '').slice(0, 400);
    if (!GATE_RE.test(txt)) return;
    const pos = getStyle(el, 'position');
    if (pos !== 'fixed' && pos !== 'absolute' && el.getAttribute('aria-modal') !== 'true' && el.getAttribute('role') !== 'dialog') return;
    el.setAttribute('data-wa-wall', el.style.display || '');
    el.style.display = 'none';
    count += 1;
  });
}

export const wallBreaker: FeatureModule = {
  id: 'wallBreaker',
  defaults: { active: false },
  meta: {
    id: 'wallBreaker',
    label: 'Break sign-up walls',
    description: 'Peels off "sign up to keep reading" overlays and un-blurs the article underneath.',
    category: 'power',
    icon: 'unlock',
    keywords: ['wall', 'register', 'signup', 'sign up', 'gate', 'blur', 'keep reading', 'modal', 'overlay'],
    dynamic: true,
  },
  apply(_s, ctx) {
    ctx.setFlag('wallbreaker', true);
    ctx.injectCSS(
      'root',
      `${GATE.map((s) => `html[data-webable-wallbreaker] ${s}`).join(',')}{display:none !important}
       html[data-webable-wallbreaker],html[data-webable-wallbreaker] body{overflow:visible !important}
       html[data-webable-wallbreaker] :where([class*="fade" i],[class*="teaser" i],[class*="gated" i],[class*="gradient-mask" i],[class*="content-blur" i],[class*="paywall-blur" i]){
         filter:none !important;-webkit-mask:none !important;mask:none !important;
         max-height:none !important;-webkit-line-clamp:unset !important;overflow:visible !important;
       }`,
    );
    unlockScroll(ctx);
    hideTextGates(ctx);
  },
  disable(ctx) {
    ctx.doc.querySelectorAll<HTMLElement>('[data-wa-ovf]').forEach((el) => {
      el.style.overflow = el.getAttribute('data-wa-ovf') || '';
      el.removeAttribute('data-wa-ovf');
    });
    ctx.doc.querySelectorAll<HTMLElement>('[data-wa-wall]').forEach((el) => {
      el.style.display = el.getAttribute('data-wa-wall') || '';
      el.removeAttribute('data-wa-wall');
    });
  },
};

// ─── Feed Off ────────────────────────────────────────────────────────────────
// Hides the addictive home/recommended feed on big sites while search, the
// video/post you came for, and your subscriptions keep working. Pure flag-gated
// CSS per host, so disable() is free.

interface FeedSetting extends FeatureSetting {
  active: boolean;
  /** balanced = hide feed + shorts + suggestions; strict = also hide comments */
  mode: string;
}

/**
 * Curated per-host feed/recommendation selectors. We only ever hide specific
 * feed containers, never nav/search/content, so a drifted selector degrades to
 * "doesn't hide", never "breaks the site". Easy to extend.
 */
export function feedSelectorsFor(hostname: string, strict: boolean): string[] {
  const h = hostname.replace(/^www\.|^m\./, '');
  const out: string[] = [];
  if (h.endsWith('youtube.com')) {
    out.push(
      'ytd-rich-grid-renderer', // home feed grid
      'ytd-rich-section-renderer', // home shelves
      'ytd-reel-shelf-renderer', // shorts shelves
      'ytd-rich-shelf-renderer[is-shorts]',
      '#related', // watch-page up-next sidebar
      'ytd-watch-next-secondary-results-renderer',
      'ytd-reel-shelf-renderer',
    );
    if (strict) out.push('#comments', 'ytd-comments');
  } else if (h.endsWith('reddit.com')) {
    out.push('shreddit-feed', '[data-testid="frontpage-feed"]', 'div[data-scroller-first]');
  } else if (h.endsWith('tiktok.com')) {
    out.push('[data-e2e="recommend-list-item-container"]', '[class*="DivForYouRecommend" i]');
  } else if (h.endsWith('facebook.com')) {
    out.push('[role="feed"]');
    if (strict) out.push('[aria-label*="Stories" i]');
  } else if (h.endsWith('linkedin.com')) {
    out.push('div[data-finite-scroll-hotkey-context="FEED"]', '.scaffold-finite-scroll__content');
  }
  return out;
}

export const feedOff: FeatureModule<FeedSetting> = {
  id: 'feedOff',
  defaults: { active: false, mode: 'balanced' },
  meta: {
    id: 'feedOff',
    label: 'Feed off (stop the scroll)',
    description: 'Hides the addictive feed on YouTube, Reddit, TikTok, Facebook, and LinkedIn. Search and your subscriptions still work.',
    category: 'power',
    icon: 'focusMode',
    keywords: ['feed', 'doomscroll', 'focus', 'youtube', 'reddit', 'tiktok', 'recommended', 'homepage', 'distraction'],
    dynamic: true,
    controls: [
      {
        key: 'mode',
        type: 'segmented',
        label: 'How much',
        options: [
          { value: 'balanced', label: 'Balanced' },
          { value: 'strict', label: 'Strict' },
        ],
      },
    ],
  },
  apply(s, ctx) {
    ctx.setFlag('feedoff', true);
    let host = '';
    try {
      host = (ctx.win.location?.hostname || '').toLowerCase();
    } catch {
      /* ignore */
    }
    const sels = feedSelectorsFor(host, s.mode === 'strict');
    if (sels.length) {
      ctx.injectCSS('root', `${sels.map((x) => `html[data-webable-feedoff] ${x}`).join(',')}{display:none !important}`);
    } else {
      ctx.removeCSS('root');
    }
  },
  disable() {},
};

// ─── Nag Mute ────────────────────────────────────────────────────────────────
// Silences "Allow notifications?" bribes: hides the in-page bell/alert bars
// (works everywhere) and, where the code runs in the page's own context (the
// widget), auto-denies Notification.requestPermission so nothing steals a click.

const NAG = [
  '[class*="push-prompt" i]', '[class*="onesignal" i]', '#onesignal-slidedown-container',
  '[class*="webpush" i]', '[class*="web-push" i]', '[class*="notification-bar" i]',
  '[class*="notification-prompt" i]', '[class*="subscribe-bell" i]', '[id*="pushcrew" i]',
  '[class*="izooto" i]', '[class*="notifix" i]', '[class*="pushengage" i]', '[class*="vwo-push" i]',
];

export const nagMute: FeatureModule = {
  id: 'nagMute',
  defaults: { active: false },
  meta: {
    id: 'nagMute',
    label: 'Mute notification nags',
    description: 'Hides "enable alerts" bars and pre-answers browser notification prompts as no.',
    category: 'power',
    icon: 'popup',
    keywords: ['notification', 'allow', 'permission', 'push', 'alerts', 'bell', 'nag', 'prompt'],
    dynamic: true,
  },
  apply(_s, ctx) {
    ctx.setFlag('nagmute', true);
    ctx.injectCSS('root', `${NAG.map((s) => `html[data-webable-nagmute] ${s}`).join(',')}{display:none !important}`);

    // Best-effort: auto-deny Notification permission. Works when our code shares
    // the page's window (widget); a no-op in an isolated content-script world.
    if (!ctx.store.notifPatched) {
      try {
        const w = ctx.win as Window & { Notification?: { requestPermission?: unknown } };
        const N = w.Notification;
        if (N && typeof N.requestPermission === 'function') {
          ctx.store.notifPatched = true;
          ctx.store.notifOrig = N.requestPermission;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          N.requestPermission = function patched(cb?: (p: string) => void) {
            if (typeof cb === 'function') cb('denied');
            return Promise.resolve('denied');
          } as unknown as typeof N.requestPermission;
        }
      } catch {
        /* property not configurable, CSS half still applies */
      }
    }
  },
  disable(ctx) {
    if (ctx.store.notifPatched) {
      try {
        const w = ctx.win as Window & { Notification?: { requestPermission?: unknown } };
        if (w.Notification) w.Notification.requestPermission = ctx.store.notifOrig as never;
      } catch {
        /* ignore */
      }
      ctx.store.notifPatched = false;
      ctx.store.notifOrig = undefined;
    }
  },
};
