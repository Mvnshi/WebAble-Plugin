/**
 * The rule: a tool may change how the page LOOKS by itself, but anything that
 * acts on the user's behalf has to be asked for.
 *
 * Five features broke it. Cookie banners were answered by a regex. Expand-all
 * clicked every collapsed control on the page, forever, including navigation
 * and checkout. TL;DR sent the article to Google on page load because a saved
 * preference re-ran it. Unlock-selection ran before the page's own handlers and
 * killed rich text editors. Volume boost routed cross-origin media through Web
 * Audio, which silences it permanently with no way back.
 *
 * These tests state the rule per feature, not the implementation, so a rewrite
 * that keeps the promise keeps passing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { FEATURE_MAP, type FeatureContext, type FeatureModule, type FeatureSetting } from '@webable/core';

function dom(body: string): Document {
  return new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    pretendToBeVisual: true,
    url: 'https://example.com/article',
  }).window.document;
}

/**
 * A minimal FeatureContext. Features are applied directly rather than through
 * the engine so a test can assert on one feature without the others reconciling
 * around it.
 */
function ctxFor(doc: Document): FeatureContext {
  const cleanups: Array<() => void> = [];
  const ctx = {
    doc,
    win: doc.defaultView as unknown as Window,
    html: doc.documentElement,
    body: doc.body,
    injectCSS() {},
    removeCSS() {},
    setFlag() {},
    setVar() {},
    own: <T>(n: T) => n,
    on(target: EventTarget, type: string, handler: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    },
    store: {} as Record<string, unknown>,
    onCleanup(fn: () => void) {
      cleanups.push(fn);
    },
    disableSelf() {},
    provider: {
      id: 'stub',
      isConfigured: () => true,
      describeImage: async () => '',
      simplify: async () => '',
      summarize: async () => 'SUMMARY',
      ask: async () => '',
      translate: async () => '',
      explain: async () => '',
      ocr: async () => '',
      guide: async () => ({ say: '', point: null }),
    },
    tts: { speak() {}, stop() {} },
  } as unknown as FeatureContext;
  return ctx;
}

function feature(id: string): FeatureModule {
  const f = FEATURE_MAP.get(id);
  assert.ok(f, `${id} is not in the registry`);
  return f as FeatureModule;
}

function apply(id: string, doc: Document, patch: Record<string, unknown> = {}): FeatureContext {
  const f = feature(id);
  const ctx = ctxFor(doc);
  f.apply({ ...f.defaults, active: true, ...patch } as FeatureSetting, ctx);
  return ctx;
}

// ─── cookieKill ─────────────────────────────────────────────────────────────

const BANNER = `
  <div id="onetrust-banner-sdk">
    <p>We value your privacy. We never reject your data.</p>
    <button id="accept">Accept all</button>
    <button id="reject">Reject all</button>
  </div>`;

test('hiding a cookie banner does not answer it', () => {
  const doc = dom(BANNER);
  let clicked = false;
  doc.getElementById('reject')!.addEventListener('click', () => {
    clicked = true;
  });
  apply('cookieKill', doc);
  assert.equal(clicked, false, 'consent is the user’s to give; the default must not submit one');
});

test('clicking reject happens only when the user opts into it', () => {
  const doc = dom(BANNER);
  let clicked = false;
  doc.getElementById('reject')!.addEventListener('click', () => {
    clicked = true;
  });
  apply('cookieKill', doc, { reject: true });
  assert.equal(clicked, true);
});

test('the reject click never lands on accept, and never on prose', () => {
  const doc = dom(BANNER);
  const hits: string[] = [];
  for (const id of ['accept', 'reject']) {
    doc.getElementById(id)!.addEventListener('click', () => hits.push(id));
  }
  apply('cookieKill', doc, { reject: true });
  assert.deepEqual(hits, ['reject']);
});

test('a control is only clicked when its whole label is a reject label', () => {
  // "Save my preferences" contains none of the reject words as a whole label,
  // but the old substring test matched things like this through aria-label.
  const doc = dom(`
    <div id="onetrust-banner-sdk">
      <button id="save" aria-label="Save choices, only necessary ones you selected">Save</button>
    </div>`);
  let clicked = false;
  doc.getElementById('save')!.addEventListener('click', () => {
    clicked = true;
  });
  apply('cookieKill', doc, { reject: true });
  assert.equal(clicked, false);
});

test('a banner matched only by a loose heuristic is hidden, never clicked', () => {
  // '[class*="cookie-banner"]' is a guess about what an element is. Guessing is
  // fine for hiding and not fine for submitting.
  const doc = dom(`
    <div class="cookie-banner-wrapper">
      <button id="reject">Reject all</button>
    </div>`);
  let clicked = false;
  doc.getElementById('reject')!.addEventListener('click', () => {
    clicked = true;
  });
  apply('cookieKill', doc, { reject: true });
  assert.equal(clicked, false);
});

// ─── expandCollapse ─────────────────────────────────────────────────────────

test('expand all opens show-more inside the article', () => {
  const doc = dom(`<main><p>text</p><button id="more" aria-expanded="false">Show more</button></main>`);
  let clicked = false;
  doc.getElementById('more')!.addEventListener('click', () => {
    clicked = true;
  });
  apply('expandCollapse', doc);
  assert.equal(clicked, true);
});

test('expand all leaves navigation, menus, and forms alone', () => {
  const doc = dom(`
    <nav><button id="navmenu" aria-expanded="false">Products</button></nav>
    <main>
      <button id="combo" role="combobox" aria-expanded="false">Choose a size</button>
      <button id="popup" aria-expanded="false" aria-haspopup="true">Show more options</button>
      <form><button id="submit" type="submit" aria-expanded="false">Show more</button></form>
      <div class="checkout-step"><button id="checkout" aria-expanded="false">Show more</button></div>
    </main>`);
  const clicked: string[] = [];
  for (const id of ['navmenu', 'combo', 'popup', 'submit', 'checkout']) {
    doc.getElementById(id)!.addEventListener('click', () => clicked.push(id));
  }
  apply('expandCollapse', doc);
  assert.deepEqual(clicked, [], 'these are menus and checkout controls, not more article');
});

test('an unlabelled collapsed control is not clicked just for being collapsed', () => {
  // The old version clicked every [aria-expanded="false"] on the page. The
  // attribute says a thing is closed; it does not say opening it shows text.
  const doc = dom(`<main><div id="mystery" aria-expanded="false"></div></main>`);
  let clicked = false;
  doc.getElementById('mystery')!.addEventListener('click', () => {
    clicked = true;
  });
  apply('expandCollapse', doc);
  assert.equal(clicked, false);
});

test('expand all is not re-run by DOM mutations', () => {
  // It is not marked dynamic, so the engine's mutation observer never re-enters
  // it. Expanding mutates the DOM, so a dynamic expand-all clicks forever.
  assert.equal(feature('expandCollapse').meta.dynamic, undefined);
});

// ─── tldrPin ────────────────────────────────────────────────────────────────

test('TL;DR sends nothing until the button is pressed', async () => {
  const doc = dom(`<article><p>${'Article body text that is easily long enough to summarize. '.repeat(6)}</p></article>`);
  const ctx = ctxFor(doc);
  let sent = 0;
  (ctx.provider as { summarize: (t: string) => Promise<string> }).summarize = async () => {
    sent += 1;
    return 'SUMMARY';
  };
  const f = feature('tldrPin');
  f.apply({ ...f.defaults, active: true } as FeatureSetting, ctx);

  assert.equal(sent, 0, 'turning it on, or reloading with it on, must not transmit the article');

  const card = doc.querySelector('[data-wa-tldr-card]');
  assert.ok(card, 'the card is placed so the user can see what it will do');
  const button = card!.querySelector('button');
  assert.ok(button, 'and it offers an explicit action');

  button!.dispatchEvent(new (doc.defaultView as unknown as Window & typeof globalThis).MouseEvent('click'));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(sent, 1, 'pressing it sends');
});

test('the TL;DR card says where the text goes before it goes', () => {
  const doc = dom(`<article><p>${'Article body text that is easily long enough to summarize. '.repeat(6)}</p></article>`);
  apply('tldrPin', doc);
  const text = doc.querySelector('[data-wa-tldr-card]')!.textContent || '';
  assert.match(text, /Google/, 'the recipient is named on the card, not only in the panel');
});

// ─── copyUnlock ─────────────────────────────────────────────────────────────

/** Fires an event the way a page's own capture-phase blocker would see it. */
function fires(doc: Document, target: Element, type: string): boolean {
  let reached = false;
  target.addEventListener(type, () => {
    reached = true;
  });
  const Ev = (doc.defaultView as unknown as Window & typeof globalThis).Event;
  target.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true }));
  return reached;
}

test('unlock selection stops the page blocking copy on ordinary content', () => {
  const doc = dom(`<p id="para">text</p>`);
  apply('copyUnlock', doc);
  assert.equal(fires(doc, doc.getElementById('para')!, 'copy'), false, 'the page’s own handler is cut off');
});

test('unlock selection leaves editors and form fields working', () => {
  // An editor's copy handler IS the copy. Cutting it off does not unlock
  // anything, it breaks Google Docs and every rich text box on the web.
  const doc = dom(`
    <div id="editor" contenteditable="true">doc</div>
    <textarea id="ta"></textarea>
    <div role="textbox" id="rt">surface</div>`);
  apply('copyUnlock', doc);
  for (const id of ['editor', 'ta', 'rt']) {
    assert.equal(fires(doc, doc.getElementById(id)!, 'copy'), true, `${id} keeps its own copy handling`);
  }
});

test('unlock selection does not touch dragging', () => {
  // Blocking dragstart to defeat image-drag protection broke every sortable
  // list, slider, and file drop on the page.
  const doc = dom(`<div id="card" draggable="true">drag me</div>`);
  apply('copyUnlock', doc);
  assert.equal(fires(doc, doc.getElementById('card')!, 'dragstart'), true);
});

// ─── volumeBoost ────────────────────────────────────────────────────────────

/**
 * jsdom has no Web Audio, so the feature is driven against a fake AudioContext.
 * What is under test is which elements it decides to route, since routing is
 * the irreversible step.
 */
function withFakeAudio(doc: Document): { ctx: FeatureContext; routed: () => string[] } {
  const routed: string[] = [];
  const node = () => ({ connect() {}, disconnect() {}, gain: { value: 1 } });
  class FakeAudioContext {
    destination = {};
    createMediaElementSource(el: HTMLMediaElement) {
      routed.push(el.id || el.currentSrc || el.src);
      return node();
    }
    createGain() {
      return node();
    }
    createDynamicsCompressor() {
      return node();
    }
    resume() {}
  }
  const win = doc.defaultView as unknown as Record<string, unknown>;
  win.AudioContext = FakeAudioContext;
  return { ctx: ctxFor(doc), routed: () => routed };
}

function boost(doc: Document, patch: Record<string, unknown>): string[] {
  const { ctx, routed } = withFakeAudio(doc);
  const f = feature('volumeBoost');
  f.apply({ ...f.defaults, active: true, ...patch } as FeatureSetting, ctx);
  return routed();
}

test('volume boost routes same-origin and blob media', () => {
  const doc = dom(`
    <video id="same" src="https://example.com/clip.mp4"></video>
    <video id="mse" src="blob:https://example.com/abc"></video>`);
  assert.deepEqual(boost(doc, { gain: 2 }).sort(), ['mse', 'same']);
});

test('volume boost refuses cross-origin media it cannot process', () => {
  // createMediaElementSource on a tainted resource outputs silence forever and
  // disable() cannot undo it. Silencing the video someone is watching is worse
  // than not boosting it.
  const doc = dom(`<video id="foreign" src="https://cdn.other.example/clip.mp4"></video>`);
  assert.deepEqual(boost(doc, { gain: 2 }), []);
});

test('volume boost routes cross-origin media the page opted into CORS for', () => {
  const doc = dom(`<video id="cors" crossorigin="anonymous" src="https://cdn.other.example/clip.mp4"></video>`);
  assert.deepEqual(boost(doc, { gain: 2 }), ['cors']);
});

test('volume boost does not route anything at unity gain', () => {
  // Nothing to change, so nothing worth an irreversible capture.
  const doc = dom(`<video id="same" src="https://example.com/clip.mp4"></video>`);
  assert.deepEqual(boost(doc, { gain: 1, normalize: false }), []);
});
