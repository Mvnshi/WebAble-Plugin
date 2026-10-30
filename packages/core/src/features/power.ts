/**
 * Power tools: annoyance killers and quality-of-life controls that appeal to
 * everyone, not just people with access needs. Hide cookie banners, dismiss
 * newsletter popups, unpin sticky bars and hide chat widgets, unlock copy and
 * right-click, force pinch-zoom, speed and volume for media. All are
 * reversible; the ones that touch live, late-injected DOM are marked `dynamic`
 * so the engine re-applies them after the page mutates.
 *
 * The rule these tools are held to: a tool may change how the page LOOKS on
 * its own, but anything that acts on the user's behalf (submits a choice,
 * clicks a control, transmits content) is either opt-in or tied to a press.
 * Several of them broke that rule and are commented individually where they
 * did.
 */
import type { FeatureContext, FeatureModule, FeatureSetting } from '../types';
import { num, queryDeep } from '../dom';

// ─── Cookie banners ──────────────────────────────────────────────────────
/**
 * Two separate things, deliberately not one.
 *
 * Hiding a banner is a display preference: nothing is submitted, and the site
 * behaves as if you never answered. Clicking "reject" is a legally meaningful
 * consent choice recorded against you. This feature used to do both the moment
 * you switched it on, and picked the button by testing a loose regex against
 * the text, aria-label and value of anything inside anything that merely looked
 * like a consent container. A regex should not answer a consent dialog on
 * someone's behalf without being asked.
 *
 * So: hiding is the default, clicking is off until the user turns it on, and
 * when it is on the click is confined to the named CMP roots below where the
 * markup is known, never the heuristic selectors.
 */
const CMP_KNOWN = [
  '#onetrust-banner-sdk', '#onetrust-consent-sdk', '.onetrust-pc-dark-filter',
  '#CybotCookiebotDialog', '#CybotCookiebotDialogBodyUnderlay',
  '.qc-cmp2-container', '.qc-cmp2-bg',
  '#didomi-host', '.didomi-popup-open',
  '#usercentrics-root', '#usercentrics-cmp-ui',
  '[id^="sp_message_container"]', '.sp_veil',
  '.fc-consent-root',
  '#truste-consent-track', '.truste_overlay', '.truste_box_overlay',
  '.osano-cm-window', '.osano-cm-dialog',
  '#hs-eu-cookie-confirmation',
  '#cookiescript_injected', '#cookie-law-info-bar', '.cli-modal-backdrop',
  '#gdpr-cookie-message', '#gdpr-consent-tool-wrapper',
  '.cc-window', '.cc-banner', '.termsfeed-com---nb',
];
/** Heuristics. Safe to hide something that matches these, never safe to click. */
const CMP_LOOSE = [
  '[aria-label*="cookie" i]', '[class*="cookie-consent" i]', '[class*="cookie-banner" i]',
  '[class*="cookie-notice" i]', '[id*="cookie-banner" i]', '[class*="consent-banner" i]',
];
const CMP_ALL = [...CMP_KNOWN, ...CMP_LOOSE];

/**
 * Whole-label match, not a substring search. "Reject all" qualifies;
 * "We never reject your data" does not, and neither does a Save button whose
 * aria-label happens to contain the word "necessary". English plus the
 * DE/FR/IT/ES phrases carried over from the legacy extension.
 */
const REJECT_RE =
  /^(reject|reject all|reject cookies|reject all cookies|decline|decline all|decline cookies|refuse|refuse all|deny|deny all|disagree|no thanks|no, thanks|opt out|only necessary|necessary only|necessary cookies only|only essential|essential only|use necessary cookies only|continue without accepting|nur notwendige|nur essenzielle|alles ablehnen|ablehnen|tout refuser|refuser|continuer sans accepter|rifiuta tutto|rifiuta|rechazar todo|rechazar)$/i;

function labelOf(el: HTMLElement): string {
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const aria = (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  const value = ((el as HTMLInputElement).value || '').replace(/\s+/g, ' ').trim();
  // Prefer the visible label; a control's own text is what the user would read.
  return text || aria || value;
}

function clickRejects(ctx: FeatureContext) {
  for (const sel of CMP_KNOWN) {
    let nodes: NodeListOf<Element>;
    try {
      nodes = ctx.doc.querySelectorAll(sel);
    } catch {
      continue;
    }
    nodes.forEach((container) => {
      // Deep, because several of the named CMPs render their dialog into a
      // shadow root (usercentrics is the clearest). The outer selector finds
      // the host, so hiding the banner always worked, and this inner query
      // returned nothing, so "click reject" silently did nothing on exactly
      // the consent managers it names. Confined to CMP_KNOWN, as before: the
      // heuristic selectors are still only ever hidden, never clicked.
      const btns = queryDeep<HTMLElement>(container, 'button,a,[role="button"],input[type="button"],input[type="submit"]');
      for (const b of btns) {
        if (b.getAttribute('data-wa-clicked') != null) continue;
        const label = labelOf(b);
        // A reject control is a short, plain label. Anything longer is prose,
        // and prose inside a consent dialog is the explanation, not the button.
        if (label.length > 40 || !REJECT_RE.test(label)) continue;
        b.setAttribute('data-wa-clicked', '1');
        try {
          b.click();
        } catch {
          /* ignore */
        }
        break;
      }
    });
  }
}

interface CookieSetting extends FeatureSetting {
  active: boolean;
  /** Click the banner's reject button. Opt-in: it answers on the user's behalf. */
  reject: boolean;
}

export const cookieKill: FeatureModule<CookieSetting> = {
  id: 'cookieKill',
  defaults: { active: false, reject: false },
  meta: {
    id: 'cookieKill',
    label: 'Hide cookie banners',
    description:
      'Hides the consent banner and gives you the page back. Nothing is submitted unless you also turn on "answer for me".',
    category: 'power',
    icon: 'cookie',
    keywords: ['cookie', 'consent', 'gdpr', 'banner', 'privacy', 'reject', 'decline'],
    dynamic: true,
    controls: [
      {
        key: 'reject',
        type: 'segmented',
        label: 'Answer for me',
        options: [
          { value: false, label: 'Just hide it' },
          { value: true, label: 'Click reject' },
        ],
      },
    ],
  },
  apply(s, ctx) {
    ctx.setFlag('cookiekill', true);
    // `visible`, not `auto`. Both defeat the banner's `overflow:hidden` scroll
    // lock, but `auto` on <html> stops <body>'s overflow propagating to the
    // viewport, so on a site whose body carries its own height the document
    // stops being the scroller and body silently becomes one instead: the page
    // renders and then will not scroll at all. Found by driving this against
    // web.dev, where the page froze the moment the banner blocker was on.
    // `visible` is the initial value and cannot create a scroll container.
    ctx.injectCSS(
      'hide',
      `${CMP_ALL.map((sel) => `html[data-webable-cookiekill] ${sel}`).join(',')}{display:none !important}
       html[data-webable-cookiekill],html[data-webable-cookiekill] body{overflow:visible !important}`,
    );
    if (s.reject) clickRejects(ctx);
  },
  disable() {},
};

// ─── Dismiss popups ──────────────────────────────────────────────────────
const POPUP = [
  '[class*="newsletter" i][class*="modal" i]', '[class*="newsletter" i][class*="popup" i]',
  '[class*="signup" i][class*="modal" i]', '[class*="subscribe" i][class*="modal" i]',
  '[class*="email" i][class*="popup" i]', '[id*="newsletter" i][class*="popup" i]',
  '[class*="popup-overlay" i]', '[class*="modal-overlay" i][class*="newsletter" i]',
  '.sailthru-overlay-container', '.popupmodal', '[data-testid*="newsletter" i]',
  '[class*="interstitial" i]', '[class*="welcome-mat" i]', '[class*="exit-intent" i]',
];

export const popupKill: FeatureModule = {
  id: 'popupKill',
  defaults: { active: false },
  meta: {
    id: 'popupKill',
    label: 'Dismiss popups',
    description: 'Hides newsletter and promo overlays and restores scrolling.',
    category: 'power',
    icon: 'popup',
    keywords: ['popup', 'newsletter', 'modal', 'overlay', 'subscribe', 'interstitial'],
    dynamic: true,
  },
  apply(_s, ctx) {
    ctx.setFlag('popupkill', true);
    ctx.injectCSS(
      'hide',
      `${POPUP.map((s) => `html[data-webable-popupkill] ${s}`).join(',')}{display:none !important}
       html[data-webable-popupkill],html[data-webable-popupkill] body{overflow:visible !important}`,
    );
    // Many popups lock scrolling on <body>; clear the common inline lock.
    const b = ctx.body;
    if (b && getStyle(b, 'overflow') === 'hidden' && b.style.overflow === 'hidden') {
      if (b.getAttribute('data-wa-ovf') == null) b.setAttribute('data-wa-ovf', '1');
      b.style.overflow = 'visible';
    }
  },
  disable(ctx) {
    ctx.doc.querySelectorAll<HTMLElement>('[data-wa-ovf]').forEach((el) => {
      el.style.overflow = '';
      el.removeAttribute('data-wa-ovf');
    });
  },
};

// ─── Unpin sticky bars + hide chat widgets ───────────────────────────────
const CHAT = [
  '#intercom-container', '.intercom-lightweight-app', '#intercom-frame',
  '#hubspot-messages-iframe-container',
  '#drift-frame-controller', '#drift-frame-chat',
  '.crisp-client', '#crisp-chatbox',
  '#tawkchat-container', '.tawk-min-container', 'iframe[title*="chat" i]',
  '#chat-widget-container', '[class*="chat-widget" i]', '[class*="livechat" i]',
  '[id*="livechat" i]', '[aria-label*="open chat" i]', '[class*="messenger-launcher" i]',
  '#fb-root + div [role="dialog"]',
];
/**
 * A pre-filter, not the condition. Nothing is unpinned unless its COMPUTED
 * position is sticky or fixed, so a broad selector here costs a computed-style
 * read and never a wrong change.
 *
 * `[class*="header" i]` rather than the `-header` / `header-` pair it replaces:
 * BEM writes `left-sidebar__header`, which matches neither, so on MDN a sticky
 * element with the word "header" in its own class name stayed pinned. That is
 * a naming convention, not an edge case.
 *
 * Sticky SIDEBARS are deliberately not in here. A table of contents that
 * follows you is content someone may want, and this tool's promise is bars that
 * follow you, not every element that does. Recorded in QA.md instead.
 */
const STICKY_SEL =
  'header,nav,[role="banner"],[class*="sticky" i],[class*="navbar" i],[class*="topbar" i],[class*="fixed-top" i],[class*="header" i],[id*="header" i],[class*="masthead" i],[class*="toolbar" i],[class*="announcement" i]';

function getStyle(el: Element, prop: string): string {
  try {
    return (el.ownerDocument.defaultView || window).getComputedStyle(el).getPropertyValue(prop);
  } catch {
    return '';
  }
}

export const stickyKill: FeatureModule = {
  id: 'stickyKill',
  defaults: { active: false },
  meta: {
    id: 'stickyKill',
    label: 'Unpin sticky bars',
    description: 'Stops headers from following you and hides chat bubbles.',
    category: 'power',
    icon: 'sticky',
    keywords: ['sticky', 'fixed', 'header', 'chat', 'bubble', 'floating', 'unpin'],
    dynamic: true,
  },
  apply(_s, ctx) {
    ctx.setFlag('stickykill', true);
    ctx.injectCSS('chat', `html[data-webable-stickykill] :where(${CHAT.join(',')}){display:none !important}`);
    ctx.doc.querySelectorAll<HTMLElement>(STICKY_SEL).forEach((el) => {
      if (el.getAttribute('data-wa-stick') != null) return;
      const pos = getStyle(el, 'position');
      if (pos === 'sticky' || pos === 'fixed') {
        el.setAttribute('data-wa-stick', el.style.position || '');
        el.style.position = 'static';
      }
    });
  },
  disable(ctx) {
    ctx.doc.querySelectorAll<HTMLElement>('[data-wa-stick]').forEach((el) => {
      el.style.position = el.getAttribute('data-wa-stick') || '';
      el.removeAttribute('data-wa-stick');
    });
  },
};

// ─── Unlock copy / right-click ───────────────────────────────────────────
/**
 * True when the event happened inside somewhere the page is legitimately
 * handling copy, cut, or selection itself: a form field, a rich text editor, or
 * anything that has declared itself editable. Google Docs, CodeMirror, Monaco,
 * ProseMirror and every comment box in the world land here.
 */
function inEditableContext(target: EventTarget | null): boolean {
  // Duck-typed rather than `instanceof Element`: this runs against the host
  // page's document, which in tests (and in odd embedding contexts) is not the
  // realm this module was loaded in, so the constructor identity does not
  // match and the check would throw inside the listener.
  const node = target as Node | null;
  const el = node && node.nodeType === 1 ? (node as Element) : null;
  if (!el) return false;
  if (el.closest('input,textarea,select,option,[contenteditable="true"],[contenteditable=""]')) return true;
  // Editors that put the caret in a hidden field and paint their own surface
  // (Docs, Sheets, some IDEs) mark the surrounding region instead.
  if (el.closest('[role="textbox"],[role="grid"],[role="application"],[aria-multiline="true"]')) return true;
  const doc = el.ownerDocument;
  return !!doc && doc.designMode === 'on';
}

export const copyUnlock: FeatureModule = {
  id: 'copyUnlock',
  defaults: { active: false },
  meta: {
    id: 'copyUnlock',
    label: 'Unlock selection',
    description:
      'Re-enables text selection everywhere, and defeats most copy and right-click blockers. Editors and form fields keep their own behaviour, so rich text editors still work.',
    category: 'power',
    icon: 'unlock',
    keywords: ['copy', 'select', 'right click', 'context menu', 'paste', 'text selection'],
  },
  apply(_s, ctx) {
    ctx.setFlag('copyunlock', true);
    ctx.injectCSS(
      'css',
      `html[data-webable-copyunlock] *{user-select:text !important;-webkit-user-select:text !important;-webkit-touch-callout:default !important}`,
    );
    // Capture-phase listeners that stop the page's blockers from running, without
    // calling preventDefault, so the default copy / context menu still works.
    //
    // Known limit, measured in a browser rather than assumed:
    // stopImmediatePropagation only stops listeners registered AFTER ours on
    // the same node. A site that bound its blocker to `document` before this
    // feature was switched on still runs. In the extension that is usually
    // fine, because the content script runs at document_start and a persisted
    // setting is applied before the page's own scripts; it bites when the user
    // toggles the feature mid-visit, and it always bites in the widget, which
    // loads async. Selection itself is unaffected either way: that is CSS with
    // !important, and it always wins. Hence "most" in the description above
    // rather than a promise the code cannot keep.
    // See examples/test-site/editors.html for the harness that shows both cases.
    //
    // Two rules learned the hard way. First, skip editable contexts: running
    // before the page's own handler and killing it is exactly what breaks
    // Google Docs, where the editor's copy handler IS the copy. Second,
    // 'dragstart' is not in this list. Blocking it stopped every drag on the
    // page (sortable lists, sliders, file drops, canvas apps) to defeat the
    // much rarer trick of disabling image drag. That is not a trade worth
    // making for a feature called "unlock selection".
    //
    // Third rule, and the reason this reads composedPath rather than target:
    // an event that crosses a shadow boundary is retargeted, so `e.target` on
    // the document is the component's HOST, not the control inside it. An
    // editor built as a web component therefore looked like a plain <div> to
    // the guard above, the guard passed, and the editor's own copy handler was
    // killed: precisely the Google Docs breakage the guard exists to prevent,
    // reintroduced for every editor written as a custom element. composedPath
    // reports the real originating node.
    // `closest` also stops at a shadow boundary, so the whole path is checked
    // rather than just its first entry: an editor may mark itself on the inner
    // control, on the host, or on a wrapper above it.
    const stop = (e: Event) => {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (!path.length) {
        if (inEditableContext(e.target)) return;
      } else {
        for (const node of path) if (inEditableContext(node)) return;
      }
      e.stopImmediatePropagation();
    };
    (['copy', 'cut', 'contextmenu', 'selectstart'] as const).forEach((t) =>
      ctx.on(ctx.doc, t, stop as EventListener, true),
    );
  },
  disable() {},
};

// ─── Force pinch-zoom ────────────────────────────────────────────────────
export const forceZoom: FeatureModule = {
  id: 'forceZoom',
  defaults: { active: false },
  meta: {
    id: 'forceZoom',
    label: 'Force zoom',
    description: 'Re-enables pinch-to-zoom on sites that block it.',
    category: 'power',
    icon: 'zoom',
    wcag: ['1.4.4', '1.4.10'],
    keywords: ['zoom', 'pinch', 'scale', 'viewport', 'magnify'],
    dynamic: true,
  },
  apply(_s, ctx) {
    let meta = ctx.doc.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = ctx.doc.createElement('meta');
      meta.setAttribute('name', 'viewport');
      meta.setAttribute('content', 'width=device-width, initial-scale=1');
      meta.setAttribute('data-wa-vp-created', '1');
      (ctx.doc.head || ctx.html).appendChild(meta);
      ctx.own(meta);
    }
    if (meta.getAttribute('data-wa-vp-orig') == null) {
      meta.setAttribute('data-wa-vp-orig', meta.getAttribute('content') || '');
    }
    let c = (meta.getAttribute('content') || '')
      .replace(/,?\s*user-scalable\s*=\s*(no|0)/gi, '')
      .replace(/,?\s*maximum-scale\s*=\s*[0-9.]+/gi, '')
      .replace(/^[,\s]+/, '');
    if (!/maximum-scale/i.test(c)) c += (c ? ', ' : '') + 'maximum-scale=10';
    meta.setAttribute('content', c);
  },
  disable(ctx) {
    ctx.doc.querySelectorAll<HTMLMetaElement>('meta[name="viewport"][data-wa-vp-orig]').forEach((meta) => {
      if (meta.getAttribute('data-wa-vp-created') === '1') {
        meta.remove();
      } else {
        meta.setAttribute('content', meta.getAttribute('data-wa-vp-orig') || '');
        meta.removeAttribute('data-wa-vp-orig');
      }
    });
  },
};

// ─── Media speed ─────────────────────────────────────────────────────────
interface MediaSpeedSetting extends FeatureSetting {
  active: boolean;
  rate: number;
}

export const mediaSpeed: FeatureModule<MediaSpeedSetting> = {
  id: 'mediaSpeed',
  defaults: { active: false, rate: 1.5 },
  meta: {
    id: 'mediaSpeed',
    label: 'Media speed',
    description: 'Set the playback speed for every video and audio on the page.',
    category: 'power',
    icon: 'gauge',
    keywords: ['speed', 'playback', 'video', 'audio', 'faster', 'slower', 'rate', '2x'],
    dynamic: true,
    controls: [
      { key: 'rate', type: 'slider', label: 'Speed', min: 0.5, max: 3, step: 0.25, unit: '×', format: (v) => `${v}×` },
    ],
  },
  apply(s, ctx) {
    const rate = num(s.rate, 1.5);
    ctx.store.rate = rate;
    ctx.doc.querySelectorAll<HTMLMediaElement>('video,audio').forEach((m) => {
      if (m.getAttribute('data-wa-rate-orig') == null) m.setAttribute('data-wa-rate-orig', String(m.playbackRate || 1));
      try {
        m.playbackRate = rate;
      } catch {
        /* ignore */
      }
    });
    if (!ctx.store.bound) {
      ctx.store.bound = true;
      const onStart = (e: Event) => {
        const t = e.target as HTMLMediaElement;
        if (t && 'playbackRate' in t) {
          try {
            t.playbackRate = (ctx.store.rate as number) || rate;
          } catch {
            /* ignore */
          }
        }
      };
      ctx.on(ctx.doc, 'play', onStart, true);
      ctx.on(ctx.doc, 'loadeddata', onStart, true);
    }
  },
  disable(ctx) {
    ctx.doc.querySelectorAll<HTMLMediaElement>('[data-wa-rate-orig]').forEach((m) => {
      try {
        m.playbackRate = parseFloat(m.getAttribute('data-wa-rate-orig') || '1') || 1;
      } catch {
        /* ignore */
      }
      m.removeAttribute('data-wa-rate-orig');
    });
  },
};

// ─── Volume boost + normalize ────────────────────────────────────────────
interface VolumeSetting extends FeatureSetting {
  active: boolean;
  /** gain multiplier, 0–3 (300%) */
  gain: number;
  /** tame loud spikes through a compressor */
  normalize: boolean;
}

interface VolNodes {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  comp: DynamicsCompressorNode;
}

/**
 * Whether it is safe to route this element through Web Audio.
 *
 * `createMediaElementSource` on a cross-origin resource that was not fetched
 * with CORS taints the graph and outputs SILENCE, permanently: the call cannot
 * be undone, the element cannot be given a second source, and disable() has no
 * way back. A user turning on a hearing aid feature and permanently muting the
 * video they were watching is the worst possible failure for this feature, so
 * anything that is not provably routable is skipped and left playing normally.
 *
 * Same-origin, blob: and data: (which is how MSE players like YouTube feed a
 * <video>, and they are same-origin by construction) are safe. Otherwise the
 * page must have opted into CORS via the crossorigin attribute.
 */
function canRouteAudio(el: HTMLMediaElement, ctx: FeatureContext): boolean {
  const src = el.currentSrc || el.src;
  if (!src) return false; // nothing loaded yet: do not gamble, catch it on 'loadeddata'
  if (src.startsWith('blob:') || src.startsWith('data:')) return true;
  try {
    if (new URL(src, ctx.doc.baseURI).origin === ctx.win.location.origin) return true;
  } catch {
    return false;
  }
  return !!el.crossOrigin;
}

export const volumeBoost: FeatureModule<VolumeSetting> = {
  id: 'volumeBoost',
  defaults: { active: false, gain: 1, normalize: false },
  meta: {
    id: 'volumeBoost',
    label: 'Volume boost',
    description:
      'Make quiet videos louder (up to 300%) and tame loud spikes, without touching system volume. Media the browser will not let it process safely is left alone.',
    category: 'power',
    icon: 'volume',
    wcag: ['1.4.2'],
    keywords: ['volume', 'louder', 'boost', 'amplify', 'normalize', 'quiet', 'hard of hearing', 'audio'],
    dynamic: true,
    controls: [
      { key: 'gain', type: 'slider', label: 'Volume', min: 0, max: 3, step: 0.1, format: (v) => `${Math.round((v as number) * 100)}%` },
      {
        key: 'normalize',
        type: 'segmented',
        label: 'Even out loud parts',
        options: [
          { value: false, label: 'Off' },
          { value: true, label: 'On' },
        ],
      },
    ],
  },
  apply(s, ctx) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext | undefined =
      (ctx.win as any).AudioContext || (ctx.win as any).webkitAudioContext;
    if (!Ctor) return; // no Web Audio (e.g. jsdom), nothing to do, stays reversible

    // Unity gain with no compression is what the page already does. Routing
    // media through the graph for no change is pure downside, because the
    // routing is the irreversible part.
    if (num(s.gain, 1) === 1 && !s.normalize) return;

    let ac = ctx.store.ac as AudioContext | undefined;
    if (!ac) {
      ac = new Ctor();
      ctx.store.ac = ac;
      ctx.store.nodes = new WeakMap<HTMLMediaElement, VolNodes>();
    }
    const map = ctx.store.nodes as WeakMap<HTMLMediaElement, VolNodes>;
    const gain = num(s.gain, 1);
    ctx.store.gain = gain;
    ctx.store.normalize = !!s.normalize;

    const wire = (el: HTMLMediaElement) => {
      let n = map.get(el);
      if (!n) {
        if (el.getAttribute('data-wa-vol') != null) return; // captured elsewhere
        if (!canRouteAudio(el, ctx)) return;
        try {
          const source = ac!.createMediaElementSource(el);
          const g = ac!.createGain();
          const comp = ac!.createDynamicsCompressor();
          n = { source, gain: g, comp };
          map.set(el, n);
          el.setAttribute('data-wa-vol', '1');
        } catch {
          return; // a source can only be created once per element
        }
      }
      // (Re)connect graph: source -> [compressor] -> gain -> destination.
      try {
        n.source.disconnect();
        n.comp.disconnect();
        n.gain.disconnect();
      } catch {
        /* ignore */
      }
      n.gain.gain.value = gain;
      if (s.normalize) {
        n.source.connect(n.comp);
        n.comp.connect(n.gain);
      } else {
        n.source.connect(n.gain);
      }
      n.gain.connect(ac!.destination);
    };

    ctx.doc.querySelectorAll<HTMLMediaElement>('video,audio').forEach(wire);

    if (!ctx.store.bound) {
      ctx.store.bound = true;
      const onStart = (e: Event) => {
        const t = e.target as HTMLMediaElement;
        if (t && 'play' in t) {
          try {
            (ctx.store.ac as AudioContext | undefined)?.resume();
          } catch {
            /* ignore */
          }
          wire(t);
        }
      };
      ctx.on(ctx.doc, 'play', onStart, true);
      ctx.on(ctx.doc, 'loadeddata', onStart, true);
    }
  },
  disable(ctx) {
    // Reset to transparent unity passthrough (createMediaElementSource is
    // one-way, so we can't fully un-route; unity gain is audibly identical) and
    // drop our markers. The AudioContext is left open so captured media still
    // plays.
    const map = ctx.store.nodes as WeakMap<HTMLMediaElement, VolNodes> | undefined;
    ctx.doc.querySelectorAll<HTMLMediaElement>('[data-wa-vol]').forEach((el) => {
      const n = map?.get(el);
      if (n) {
        try {
          n.source.disconnect();
          n.comp.disconnect();
          n.gain.disconnect();
          n.gain.gain.value = 1;
          n.source.connect(n.gain);
          n.gain.connect((ctx.store.ac as AudioContext).destination);
        } catch {
          /* ignore */
        }
      }
      el.removeAttribute('data-wa-vol');
    });
  },
};

// ─── Auto-scroll ─────────────────────────────────────────────────────────
interface AutoScrollSetting extends FeatureSetting {
  active: boolean;
  speed: number;
}

export const autoScroll: FeatureModule<AutoScrollSetting> = {
  id: 'autoScroll',
  defaults: { active: false, speed: 1 },
  meta: {
    id: 'autoScroll',
    label: 'Auto-scroll',
    description: 'Scroll the page slowly, hands-free. Move the mouse to pause.',
    category: 'power',
    icon: 'scroll',
    keywords: ['scroll', 'auto', 'reading', 'hands free', 'teleprompter'],
    controls: [
      { key: 'speed', type: 'slider', label: 'Speed', min: 0.3, max: 5, step: 0.3, unit: '×', format: (v) => `${v}×` },
    ],
  },
  apply(s, ctx) {
    ctx.store.speed = num(s.speed, 1);
    if (ctx.store.running) return; // loop already running; just updated speed
    ctx.store.running = true;
    let paused = false;
    let pt: ReturnType<typeof setTimeout> | undefined;
    const pause = () => {
      paused = true;
      if (pt) clearTimeout(pt);
      pt = setTimeout(() => {
        paused = false;
      }, 1400);
    };
    ctx.on(ctx.win, 'mousemove', pause);
    ctx.on(ctx.win, 'wheel', pause, true);
    ctx.on(ctx.win, 'keydown', pause);
    let raf = 0;
    const tick = () => {
      if (!paused) {
        try {
          ctx.win.scrollBy(0, Math.max(0.3, (ctx.store.speed as number) || 1));
        } catch {
          /* ignore */
        }
      }
      raf = ctx.win.requestAnimationFrame(tick);
    };
    raf = ctx.win.requestAnimationFrame(tick);
    ctx.onCleanup(() => {
      try {
        ctx.win.cancelAnimationFrame(raf);
      } catch {
        /* ignore */
      }
      if (pt) clearTimeout(pt);
    });
  },
  disable() {},
};

// ─── Picture-in-picture ──────────────────────────────────────────────────
export const pictureInPicture: FeatureModule = {
  id: 'pictureInPicture',
  defaults: { active: false },
  meta: {
    id: 'pictureInPicture',
    label: 'Picture-in-picture',
    description: 'Pops the page video into a floating, always-on-top window.',
    category: 'power',
    icon: 'pip',
    keywords: ['pip', 'picture in picture', 'float', 'video', 'popout', 'mini player'],
  },
  apply(_s, ctx) {
    const vids = Array.from(ctx.doc.querySelectorAll<HTMLVideoElement>('video')).filter(
      (v) => (v.readyState > 0 || v.currentSrc || v.src) && !v.disablePictureInPicture,
    );
    if (!vids.length) return;
    // Prefer a playing video, then the largest by area.
    vids.sort(
      (a, b) =>
        Number(!b.paused) - Number(!a.paused) ||
        b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight,
    );
    // requestPictureInPicture needs transient activation; the toggle click provides it.
    try {
      void vids[0].requestPictureInPicture?.().catch(() => undefined);
    } catch {
      /* unsupported */
    }
  },
  disable(ctx) {
    try {
      if (ctx.doc.pictureInPictureElement) void ctx.doc.exitPictureInPicture?.().catch(() => undefined);
    } catch {
      /* ignore */
    }
  },
};

// ─── Expand / collapse all ───────────────────────────────────────────────
const EXPAND_TEXT = /\b(show|view|read|see|load)\s+(more|all|details?|comments?|replies)\b|\bexpand\b|\bshow more\b|\bread more\b|\bsee more\b|\bread the rest\b/i;

/**
 * Where the article lives. Expansion is confined to this, because outside it
 * every `[aria-expanded="false"]` is a menu, a combobox, a filter, or a step in
 * a checkout flow. The old version clicked all of them, everywhere, on every
 * DOM mutation.
 */
function contentRoot(ctx: FeatureContext): HTMLElement {
  const doc = ctx.doc;
  return (doc.querySelector('article') ||
    doc.querySelector('[role="main"]') ||
    doc.querySelector('main') ||
    ctx.body) as HTMLElement;
}

/** Chrome that lives inside an article but is not part of it. */
const EXPAND_DENY_ANCESTORS =
  'nav,header,footer,form,dialog,[role="navigation"],[role="menu"],[role="menubar"],[role="dialog"],[role="toolbar"],[role="tablist"],[role="search"],[class*="nav" i],[class*="menu" i],[class*="cookie" i],[class*="consent" i],[class*="checkout" i],[class*="cart" i]';

/** Roles whose "expanded" state opens a menu or a listbox, not more text. */
const EXPAND_DENY_ROLES = new Set(['combobox', 'listbox', 'menu', 'menuitem', 'tab', 'treeitem', 'switch']);

function safeToExpand(el: HTMLElement, root: HTMLElement): boolean {
  if (el.getAttribute('data-wa-exp') != null) return false;
  if (!root.contains(el)) return false;
  if (el.closest(EXPAND_DENY_ANCESTORS)) return false;
  // aria-haspopup means the control opens an overlay, which is never "more of
  // the article". Same for anything that submits.
  if (el.hasAttribute('aria-haspopup')) return false;
  const role = el.getAttribute('role');
  if (role && EXPAND_DENY_ROLES.has(role)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'select') return false;
  // Not a `type === 'submit'` check: that is the DEFAULT for a bare <button>,
  // so it rejected every plain button on the page. A submit button that can
  // actually submit belongs to a form, and forms are denied above.
  return true;
}

/** A pass never clicks more than this. Anything beyond it is not an article. */
const EXPAND_LIMIT = 40;

function expandAll(ctx: FeatureContext) {
  const root = contentRoot(ctx);
  let clicks = 0;

  // <details> is declarative: opening it is a state change, not a click, so it
  // cannot trigger a handler and is safe anywhere inside the content root.
  root.querySelectorAll('details:not([open])').forEach((d) => {
    d.setAttribute('open', '');
    if (d.getAttribute('data-wa-exp') == null) d.setAttribute('data-wa-exp', 'd');
  });

  // Everything below synthesises a real click, so each candidate has to both
  // sit in the article and read like a "show more" control. An unlabelled
  // aria-expanded=false is not enough on its own; that was the whole bug.
  const click = (el: HTMLElement, kind: string) => {
    if (clicks >= EXPAND_LIMIT) return;
    clicks += 1;
    el.setAttribute('data-wa-exp', kind);
    try {
      el.click();
    } catch {
      /* ignore */
    }
  };

  root.querySelectorAll<HTMLElement>('[aria-expanded="false"]').forEach((el) => {
    if (!safeToExpand(el, root)) return;
    const t = labelOf(el);
    if (!t || t.length > 48 || !EXPAND_TEXT.test(t) || /\bless\b/i.test(t)) return;
    click(el, 'a');
  });

  root.querySelectorAll<HTMLElement>('button,a,[role="button"],summary').forEach((el) => {
    if (el.hasAttribute('aria-expanded') || !safeToExpand(el, root)) return;
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t.length > 1 && t.length < 36 && EXPAND_TEXT.test(t) && !/\bless\b/i.test(t)) click(el, 'b');
  });
}

interface ExpandSetting extends FeatureSetting {
  active: boolean;
  mode: string; // 'expand' | 'collapse'
}

export const expandCollapse: FeatureModule<ExpandSetting> = {
  id: 'expandCollapse',
  defaults: { active: false, mode: 'expand' },
  meta: {
    id: 'expandCollapse',
    label: 'Expand all',
    description:
      'Opens the "show more" and FAQ blocks inside the article, once, when you switch it on. It stays out of navigation, forms, and checkout.',
    category: 'power',
    icon: 'expand',
    surfaces: 'both',
    keywords: ['expand', 'collapse', 'show more', 'read more', 'load more', 'faq', 'accordion'],
    // Deliberately NOT dynamic. Expanding mutates the DOM, which would wake the
    // mutation observer, which would expand again: the feature would keep
    // clicking things for as long as it was on. One pass per user action.
    controls: [
      {
        key: 'mode',
        type: 'segmented',
        label: 'Mode',
        options: [
          { value: 'expand', label: 'Expand all' },
          { value: 'collapse', label: 'To main' },
        ],
      },
    ],
  },
  apply(s, ctx) {
    if (s.mode === 'collapse') {
      ctx.setFlag('collapse', true);
      ctx.injectCSS(
        'collapse',
        `html[data-webable-collapse] :where(nav,aside,[role="navigation"],[role="complementary"],
          [class*="sidebar" i],[class*="comments" i],[class*="related" i],[class*="recirc" i],
          [class*="newsletter" i],[class*="promo" i],[data-testid*="sidebar" i]){display:none !important}`,
      );
    } else {
      ctx.removeCSS('collapse');
      ctx.setFlag('collapse', false);
      expandAll(ctx);
    }
  },
  disable(ctx) {
    ctx.doc.querySelectorAll<HTMLElement>('[data-wa-exp]').forEach((el) => {
      const k = el.getAttribute('data-wa-exp');
      if (k === 'd') el.removeAttribute('open');
      else if (k === 'a' && el.getAttribute('aria-expanded') === 'true') {
        try {
          el.click();
        } catch {
          /* ignore */
        }
      }
      el.removeAttribute('data-wa-exp');
    });
  },
};
