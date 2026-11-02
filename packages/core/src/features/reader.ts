/**
 * ClarityView, the reader.
 *
 * Reader mode has exactly one opinion and Apple chose it: one column, one type
 * scale, one set of decisions about what to throw away, and no way to
 * disagree. ClarityView's product is that the READER owns the opinion. You
 * describe once how you want pages to look, and every page you visit is
 * brought to that standard.
 *
 * This file is the thin part: the feature contract, the page's teardown and
 * restoration, focus, keyboard, and the SPA check. Everything with judgement in
 * it lives in ../clarity:
 *
 *   blocks.ts    the block model, and the rule that nothing renders without a
 *                pointer to the DOM node it came from
 *   extract.ts   stage one, deterministic, Readability-derived scoring
 *   repair.ts    stage two, model-assisted, structurally unable to write prose
 *   standard.ts  the Standard schema and its presets
 *   render.ts    blocks to DOM, under the reader's Standard
 *   speech.ts    "make the text bigger", mapped onto Standard fields
 *
 * That split is also the bundle seam: `../clarity` is one module specifier, so
 * a surface that cannot afford it resolves it to index.stub.ts instead.
 *
 * KEEP IT TO THAT ONE IMPORT. apps/widget/build.mjs matches the specifier
 * `/\/clarity$/`, so anything reaching into `../clarity/extract` or
 * `../clarity/standard` directly would slip past the stub and land 7.7 KB in a
 * widget bundle that measures 65.0 KB of a fixed 65. There is no headroom left
 * to absorb a mistake here, and the failure is a red build for every thread,
 * not a warning. Everything the feature needs is re-exported from index.ts.
 *
 * Four names in here are load-bearing beyond this file and must not be renamed
 * without updating their other readers: the overlay id `wa-reader` and the
 * class `wa-reader-col` are read by `extractMainText` in ../tts.ts so read
 * aloud speaks the clean column; `wa-reader-title` and `wa-reader-close`, the
 * `data-webable-reader` flag and the injected style id `wa-feat-readerMode-css`
 * are asserted by packages/core/test/engine.test.ts, which this thread does not
 * own.
 */
import type { FeatureContext, FeatureModule, FeatureSetting } from '../types';
import { open, READER_CSS, type ClarityHandle } from '../clarity';

interface ReaderSetting extends FeatureSetting {
  active: boolean;
  /** Which starting Standard this reader is working from. */
  standard: string;
  /**
   * The reader's own edits to that Standard, as JSON.
   *
   * A string rather than a nested object because `FeatureSetting` is flat and
   * JSON-safe by contract, which is what lets the whole settings payload
   * round-trip through localStorage and chrome.storage.sync unchanged.
   */
  custom: string;
}

interface Store {
  handle?: ClarityHandle;
  /** The href the current view was built for, so an SPA route change rebuilds. */
  href?: string;
  /** Standard identity, so a settings change restyles instead of rebuilding. */
  key?: string;
  /** Where focus was when the reader opened, so it can be given back. */
  returnTo?: Element | null;
  /** apply() runs on every settings change; Escape is bound only the once. */
  escBound?: boolean;
}

/**
 * Take the original page out of the accessibility tree and out of the tab order
 * for as long as the reader is up.
 *
 * Marking <body> is enough and is one attribute: the overlay and the widget
 * host are both children of <html>, so neither is affected. Anything the page
 * had already marked is recorded and left exactly as found on the way out, so a
 * site that had hidden its own body stays that way.
 */
function takePage(ctx: FeatureContext): void {
  const body = ctx.body;
  if (!body) return;
  if (!body.hasAttribute('aria-hidden')) {
    body.setAttribute('aria-hidden', 'true');
    body.setAttribute('data-wa-reader-hid', '');
  }
  if (!body.hasAttribute('inert')) {
    body.setAttribute('inert', '');
    body.setAttribute('data-wa-reader-inert', '');
  }
}

function givePageBack(ctx: FeatureContext): void {
  const body = ctx.body;
  if (!body) return;
  if (body.hasAttribute('data-wa-reader-hid')) {
    body.removeAttribute('aria-hidden');
    body.removeAttribute('data-wa-reader-hid');
  }
  if (body.hasAttribute('data-wa-reader-inert')) {
    body.removeAttribute('inert');
    body.removeAttribute('data-wa-reader-inert');
  }
}

export const readerMode: FeatureModule<ReaderSetting> = {
  id: 'readerMode',
  defaults: { active: false, standard: 'article', custom: '' },
  meta: {
    id: 'readerMode',
    label: 'Reader mode',
    description: 'Rebuilds the article to your own standard, keeping the tables, figures and footnotes.',
    category: 'reading',
    icon: 'reader',
    wcag: ['1.4.8', '1.4.12'],
    keywords: ['reader', 'read mode', 'declutter', 'article', 'clarity'],
    controls: [
      // Written out rather than mapped from STANDARDS so the widget's stub does
      // not have to ship the preset table to render one control. The ids are
      // held to the real presets by a test, which is the cheaper half of the
      // trade: a literal that can drift, plus a test that will not let it.
      {
        key: 'standard',
        type: 'segmented',
        label: 'Standard',
        options: [
          { value: 'article', label: 'Article' },
          { value: 'study', label: 'Study' },
          { value: 'plain', label: 'Plain' },
        ],
      },
    ],
  },

  apply(s, ctx) {
    const store = ctx.store as Store;
    const doc = ctx.doc;
    const href = doc.location?.href || '';
    const key = `${s.standard}|${s.custom}`;

    // The engine calls apply on enable, on every setting change, and on every
    // route change, so this has to be idempotent and has to tell those apart.
    if (store.handle && doc.getElementById('wa-reader')) {
      if (store.href === href) {
        // Same page, so a settings change: restyle rather than rebuild, which
        // is what makes an adjustment instant and keeps the reader's place.
        if (store.key !== key) {
          store.key = key;
          store.handle.update(s.standard, s.custom);
        }
        return;
      }
      // The page underneath was replaced. The reader is holding an article
      // that no longer exists, so it is torn down and built again.
      store.handle.destroy();
      doc.getElementById('wa-reader')?.remove();
      store.handle = undefined;
    }

    ctx.setFlag('reader', true);
    ctx.injectCSS('css', `${READER_CSS}\nhtml[data-webable-reader] body{overflow:hidden !important}`);

    if (store.returnTo === undefined) store.returnTo = doc.activeElement;

    store.handle = open(ctx, s.standard, s.custom, () => ctx.disableSelf());
    store.href = href;
    store.key = key;
    takePage(ctx);

    // Escape leaves, from anywhere. Registered on the document rather than on
    // the overlay so it works even if focus never reached the column, and bound
    // once per context because apply() runs again on every settings change.
    if (!store.escBound) {
      store.escBound = true;
      ctx.on(doc, 'keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Escape') ctx.disableSelf();
      });
    }

    try {
      (doc.getElementById('wa-reader') as HTMLElement | null)?.focus({ preventScroll: true });
    } catch {
      /* older engines: the close button is still the first tab stop */
    }
  },

  disable(ctx) {
    const store = ctx.store as Store;
    store.handle?.destroy();
    store.handle = undefined;
    store.href = undefined;
    store.key = undefined;
    givePageBack(ctx);

    // Give focus back to whatever had it. A reader that drops you at the top of
    // the document when you leave is a reader you have to re-navigate every
    // time you use it.
    const back = store.returnTo as HTMLElement | null | undefined;
    store.returnTo = undefined;
    if (back && typeof back.focus === 'function' && ctx.doc.contains(back)) {
      try {
        back.focus({ preventScroll: true });
      } catch {
        /* the element went away with the page it was on */
      }
    }
  },
};
