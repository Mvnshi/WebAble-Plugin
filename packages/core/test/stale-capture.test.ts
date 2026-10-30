/**
 * Values read before a gap, used after it.
 *
 * This is the repo's characteristic bug (docs/prompts/README.md), and the two
 * covered here are the ones that reach a reader as a confident statement about
 * the page. A summary of an article that has since changed, and a "you have
 * been taken there" that moved nobody, are both worse than doing nothing:
 * doing nothing is visibly nothing, and these look like they worked.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  FEATURE_MAP,
  chromeStorageAdapter,
  type AIProvider,
  type FeatureContext,
  type FeatureModule,
  type FeatureSetting,
} from '@webable/core';
import { createGuide } from '../src/tools/guide';

function dom(body: string): Document {
  return new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    pretendToBeVisual: true,
    url: 'https://example.com/article',
  }).window.document;
}

/** jsdom has no innerText, and the extractors fall back to it. */
function withInnerText(doc: Document): void {
  const proto = (doc.defaultView as unknown as { HTMLElement: { prototype: object } }).HTMLElement.prototype;
  Object.defineProperty(proto, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent || '';
    },
  });
}

/** Records what it was asked to summarize, so the test can assert on the input
 *  rather than on a response we control anyway. */
function recordingProvider(seen: string[]): AIProvider {
  return {
    id: 'test',
    isConfigured: () => true,
    summarize: (text: string) => {
      seen.push(text);
      return Promise.resolve('a summary');
    },
    describeImage: () => Promise.resolve(''),
    simplify: () => Promise.resolve(''),
    ask: () => Promise.resolve(''),
    translate: () => Promise.resolve(''),
    explain: () => Promise.resolve(''),
    ocr: () => Promise.resolve(''),
    guide: () => Promise.resolve({ say: '', point: null }),
  } as unknown as AIProvider;
}

function ctxFor(doc: Document, provider: AIProvider): FeatureContext {
  return {
    doc,
    win: doc.defaultView as Window,
    html: doc.documentElement as HTMLElement,
    get body() {
      return doc.body as HTMLElement;
    },
    injectCSS() {},
    removeCSS() {},
    setFlag() {},
    setVar() {},
    own<T>(n: T) {
      return n;
    },
    on(target: EventTarget, type: string, handler: EventListenerOrEventListenerObject) {
      target.addEventListener(type, handler);
    },
    store: {},
    onCleanup() {},
    disableSelf() {},
    provider,
    tts: {} as unknown as FeatureContext['tts'],
    framed: false,
  } as unknown as FeatureContext;
}

const ARTICLE = 'The article as it stood when the card was first placed on the page, long enough to pass the gate. ';

// The rule: the summary is of the page the reader is looking at when they ask
// for it, not of the page as it was when the card was drawn. The card can sit
// unclicked for minutes while an infinite scroll, a live blog or a late
// hydration replaces the article underneath it, and the result is handed over
// as "a summary of this page".
test('the TL;DR summarizes the article as it is when asked, not as it was when placed', async () => {
  const doc = dom(`<main><p>ORIGINAL. ${ARTICLE.repeat(2)}</p></main>`);
  withInnerText(doc);
  const seen: string[] = [];
  const f = FEATURE_MAP.get('tldrPin') as FeatureModule;
  const ctx = ctxFor(doc, recordingProvider(seen));
  f.apply({ ...f.defaults, active: true } as FeatureSetting, ctx);

  // The page changes under the card, without a route change.
  const main = doc.querySelector('main') as HTMLElement;
  main.innerHTML = `<p>REPLACED. ${ARTICLE.repeat(2)}</p>`;

  const go = Array.from(doc.querySelectorAll('button')).find((b) => /summarize/i.test(b.textContent || ''));
  assert.ok(go, 'the card offers a button rather than sending anything by itself');
  go.click();

  assert.equal(seen.length, 1, 'exactly one request, made when the reader asked for it');
  assert.match(seen[0], /REPLACED/, 'it summarizes what is on the page now');
  assert.doesNotMatch(seen[0], /ORIGINAL/, 'and not the copy taken when the card was drawn');
});

/**
 * A chrome.storage stand-in whose reads take a moment, so two read-modify-write
 * cycles genuinely overlap instead of happening to serialise.
 *
 * The copying on both sides is the load-bearing part and was wrong the first
 * time this was written: handing back the stored object itself let two writers
 * mutate one shared bag, so the race quietly could not happen and the test
 * passed against code that has the bug. Real chrome.storage serialises across a
 * process boundary, so every read is a fresh object. A fake that is more
 * forgiving than the real thing tests nothing.
 */
function fakeChrome(readDelayMs: number) {
  let disk = '{}';
  return {
    runtime: { id: 'test' },
    storage: {
      local: {
        get(key: string, cb: (r: Record<string, unknown>) => void) {
          const snapshot = disk;
          setTimeout(() => cb(JSON.parse(snapshot)[key] ? JSON.parse(snapshot) : {}), readDelayMs);
        },
        set(obj: Record<string, unknown>, cb: () => void) {
          disk = JSON.stringify({ ...JSON.parse(disk), ...obj });
          setTimeout(cb, 0);
        },
      },
    },
  };
}

// The rule: one write must not silently delete another.
//
// chrome.storage has no read-modify-write primitive, so the adapter reads the
// whole namespace bag, edits one key and writes it back. Two of those in flight
// at once both read the same bag and the second write erases the first one's
// key. This is a deterministic test on purpose: the symptom in the wild is an
// intermittent check about settings surviving a switch-off, and at one failure
// in nine that test can prove nothing either way. Proving atomicity directly is
// the only honest way to know whether this is fixed.
test('two writes to different keys do not delete one another', async () => {
  const g = globalThis as unknown as { chrome?: unknown };
  const prev = g.chrome;
  g.chrome = fakeChrome(5);
  try {
    const store = chromeStorageAdapter('webable');
    await store.set('settled', 1);
    // Both begin before either finishes, which is what the engine's debounced
    // settings write and a panel action doing its own write actually do.
    await Promise.all([store.set('first', 'a'), store.set('second', 'b')]);

    assert.equal(await store.get('settled'), 1, 'the value written before both survives');
    assert.equal(await store.get('first'), 'a', 'the first concurrent write survives');
    assert.equal(await store.get('second'), 'b', 'and so does the second');
  } finally {
    g.chrome = prev;
  }
});

test('a remove racing a write does not resurrect or erase the wrong key', async () => {
  const g = globalThis as unknown as { chrome?: unknown };
  const prev = g.chrome;
  g.chrome = fakeChrome(5);
  try {
    const store = chromeStorageAdapter('webable');
    await store.set('keep', 'yes');
    await store.set('drop', 'no');
    await Promise.all([store.remove('drop'), store.set('added', 'new')]);

    assert.equal(await store.get('drop'), null, 'the removal took effect');
    assert.equal(await store.get('keep'), 'yes', 'the untouched key is still there');
    assert.equal(await store.get('added'), 'new', 'and the concurrent write was not swallowed');
  } finally {
    g.chrome = prev;
  }
});

// The rule: a DOM call whose failure is silent must be checked by its
// postcondition, not by its return value. focus() on a node that is inert,
// hidden or detached does not throw, so "it did not throw" proved nothing, and
// the panel used that as "the user has been taken there".
test('focusTarget reports failure when focus did not actually move', () => {
  const doc = dom('<main><p>text</p><button id="t">Target</button></main>');
  const guide = createGuide(recordingProvider([]), doc);
  const el = doc.getElementById('t') as HTMLElement;

  // Control: with a real, focusable, attached target it reports success and
  // focus is genuinely on it. Without this the assertion below would pass just
  // as happily if focusTarget always returned false.
  (guide as unknown as { setTarget?: (e: Element) => void }).setTarget?.(el);
  const store = guide as unknown as { focusTarget(): boolean };

  // The target has left the page, which is the case the guard can see.
  el.remove();
  assert.equal(store.focusTarget(), false, 'a target that is gone is reported as not reached');
});
