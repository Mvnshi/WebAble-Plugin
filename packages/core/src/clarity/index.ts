/**
 * ClarityView, assembled.
 *
 * The pipeline is three stages and the boundary between them is the design:
 *
 *   1. Skeleton   deterministic, always runs, no model, no key, no network.
 *   2. Repair     model-assisted, only the cases a heuristic genuinely cannot
 *                 do, and structurally incapable of authoring prose.
 *   3. Standard   the reader's own document, applied last.
 *
 * Stage one renders immediately. Stage two arrives later and refines what is
 * already on screen. A spinner where the article should be is a failure, so
 * there is deliberately no await between opening the reader and seeing it.
 *
 * This module is the single entry point the feature imports, which is also the
 * seam the widget build can swap for a stub. See index.stub.ts.
 */
import type { FeatureContext } from '../types';
import { createMutationManager } from '../dom';
import { extract } from './extract';
import { render, renderFailure, type Rendered } from './render';
import { resolveStandard, type Standard } from './standard';
import { applyRepairs, repair, type Repair } from './repair';
import type { Block } from './blocks';

export { READER_CSS } from './render';
export { resolveStandard, STANDARDS, type Standard } from './standard';
export { interpret, interpretLocal, type Adjustment } from './speech';
export type { Block } from './blocks';

/**
 * Repairs, kept for the life of the page and keyed by URL plus a content hash,
 * so a second visit to the same article is instant and free. Module scope
 * rather than per-mount, because an SPA route change tears the reader down and
 * builds a new one, and paying twice for the same article would be the most
 * visible possible waste.
 */
const REPAIR_CACHE = new Map<string, Repair[]>();

/** Class and id signatures for the things a Standard can choose to drop. */
const DROPS: Record<string, RegExp> = {
  dropRelated: /related|more-from|recirc|recommend|read-?next|outbrain|taboola/i,
  dropComments: /comment|disqus|discussion|replies/i,
  dropBio: /author-?bio|byline-?bio|about-?the-?author|contributor-?bio/i,
  dropEmbeds: /embed|video-?player|youtube|vimeo|twitter-?tweet|instagram-?media/i,
};

/**
 * Apply the Standard's "what to drop" list.
 *
 * Runs over the block's source node rather than its text, because these are
 * structural decisions: an author bio and a paragraph read the same as prose
 * and differ only in where they sit and what they are called.
 */
function applyDrops(blocks: Block[], s: Standard): Block[] {
  const active = Object.keys(DROPS).filter((k) => (s as unknown as Record<string, boolean>)[k]);
  if (!active.length) return blocks;
  return blocks.filter((b) => {
    const el = b.node;
    if (!el) return true;
    for (const key of active) {
      const re = DROPS[key];
      // Walk a short way up: the signature is usually on a wrapper, not on the
      // paragraph itself. Bounded, because an unbounded walk reaches <body> and
      // would drop the article on any site whose shell is called "comments".
      let node: Element | null = el;
      for (let i = 0; node && i < 3; i++, node = node.parentElement) {
        const sig = `${typeof node.className === 'string' ? node.className : ''} ${node.id}`;
        if (re.test(sig)) return false;
      }
    }
    return true;
  });
}

export interface ClarityHandle {
  /**
   * Re-apply a changed Standard. Takes the persisted setting rather than a
   * resolved Standard, so the feature never has to know how one is built and
   * the widget's stub does not have to ship a resolver it has no use for.
   *
   * One attribute write when only type or colour moved; a rebuild when the
   * change affects which blocks exist at all.
   */
  update(presetId: string, customJson: string): void;
  destroy(): void;
}

/** Fields whose change needs the document rebuilt rather than restyled. */
const STRUCTURAL = new Set([
  'figures',
  'footnotes',
  'tables',
  'numbered',
  'outline',
  'dropImages',
  'dropEmbeds',
  'dropRelated',
  'dropBio',
  'dropComments',
]);

function structuralChange(a: Standard, b: Standard): boolean {
  for (const k of STRUCTURAL) {
    if ((a as unknown as Record<string, unknown>)[k] !== (b as unknown as Record<string, unknown>)[k]) return true;
  }
  return false;
}

/**
 * Open the reader over the current document.
 *
 * `onExit` is what the close control and Escape call; the feature turns itself
 * off through it, so there is exactly one way out and it is reversible.
 */
export function open(ctx: FeatureContext, presetId: string, customJson: string, onExit: () => void): ClarityHandle {
  const doc = ctx.doc;
  let standard = resolveStandard(presetId, customJson);

  let skeleton = extract(doc);
  let blocks = skeleton.blocks;
  let live = true;
  let view: Rendered;

  const draw = () =>
    skeleton.ok
      ? render(doc, skeleton.title, applyDrops(blocks, standard), standard, onExit, skeleton.next)
      : // Honest about failure: say so and offer the original rather than
        // render a confident-looking half-page.
        renderFailure(doc, standard, onExit);

  view = draw();
  ctx.html.appendChild(view.host);
  ctx.own(view.host);

  const rebuild = () => {
    const scroll = view.host.scrollTop;
    const next = draw();
    view.host.replaceWith(next.host);
    ctx.own(next.host);
    next.host.scrollTop = scroll;
    view = next;
  };

  /* Stage two, fired and not awaited. The skeleton is already readable; this
   * only ever refines it, and if it fails or never returns, nothing is worse
   * than it was. */
  const refine = () => {
    void repair(ctx.provider, blocks, REPAIR_CACHE, doc.location?.href || '')
      .then((repairs) => {
        if (!live || !repairs.length) return;
        blocks = applyRepairs(blocks, repairs);
        rebuild();
      })
      .catch(() => {
        /* the page is already on screen and already good */
      });
  };

  /**
   * Wait for an article that has not rendered yet.
   *
   * A page with nothing in it may simply not have built itself: the content
   * script runs at document_start and the engine applies as soon as storage
   * resolves, which on a JS-rendered site is routinely before the article
   * exists. Without this the reader says "no article" for as long as the page
   * is open, on a page that has one, and nothing comes back for it: the engine
   * only re-applies on a route change, and `readerMode` is deliberately not
   * `meta.dynamic` because re-extracting on every mutation would rebuild the
   * document under someone who is reading it.
   *
   * Only ever runs while the reader is showing the failure surface, and stops
   * the moment it finds something. Recovering from "nothing here" can only
   * improve on what is on screen, which is what makes it safe to do
   * automatically when a mid-read rebuild would not be.
   *
   * The engine's own mutation manager, so this is not a second observer with
   * its own debounce: the same 150ms settle and 2s deadline the rest of the
   * engine uses, which matters on a page that mutates continuously while it
   * hydrates.
   */
  let watcher: ReturnType<typeof createMutationManager> | undefined;
  if (!skeleton.ok) {
    watcher = createMutationManager(
      doc,
      () => {
        if (!live) return;
        const next = extract(doc);
        if (!next.ok) return;
        watcher?.stop();
        skeleton = next;
        blocks = next.blocks;
        rebuild();
        refine();
      },
      150,
      2000,
    );
    watcher.start();
  } else {
    refine();
  }

  return {
    update(preset, custom) {
      const next = resolveStandard(preset, custom);
      const wasStructural = structuralChange(standard, next);
      standard = next;
      if (wasStructural) rebuild();
      else view.restyle(next);
    },
    destroy() {
      live = false;
      watcher?.stop();
    },
  };
}
