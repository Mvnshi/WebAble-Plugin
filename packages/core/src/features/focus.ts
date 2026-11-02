/**
 * Focus mode: dims the page except the block you are reading, and follows the
 * page as you scroll.
 *
 * Distinct from `readingMask` in cursor.ts, which dims a horizontal band that
 * tracks the POINTER. This tracks reading position instead, which is what
 * someone who is not holding a mouse (or is reading with the keyboard, or on a
 * phone) actually needs. Both were advertised; only the mask existed.
 *
 * Cheap by construction. Dimming is one stylesheet keyed off a flag on <html>,
 * and following the page is a single attribute moved between blocks, so a
 * scroll costs one attribute write rather than a class churn over hundreds of
 * elements. The choice of block is the candidate nearest the vertical anchor,
 * which is a third of the way down the viewport rather than the middle: that is
 * roughly where people read.
 */
import type { FeatureContext, FeatureModule, FeatureSetting } from '../types';
import { num, queryDeep } from '../dom';

/** Blocks worth focusing. Structural containers are excluded on purpose: the
 *  point is a paragraph, not the article that holds it. */
const BLOCKS = 'p,li,blockquote,pre,h1,h2,h3,h4,h5,h6,dd,figcaption,td';

interface FocusSetting extends FeatureSetting {
  active: boolean;
  /** How much the rest of the page is dimmed, 0.1 to 0.9. */
  dim: number;
}

function candidates(ctx: FeatureContext): HTMLElement[] {
  const root =
    (ctx.doc.querySelector('article') ||
      ctx.doc.querySelector('[role="main"]') ||
      ctx.doc.querySelector('main') ||
      ctx.body) as HTMLElement | null;
  if (!root) return [];
  // Deep, and not optionally so. The dimming rule is adopted into shadow roots,
  // so a shallow picker would dim every paragraph inside a component and then
  // never be able to choose one of them as the lit block: shadow content would
  // go permanently dark, which is worse than the untreated state it replaced.
  return queryDeep<HTMLElement>(root, BLOCKS).filter((el) => {
    // Skip our own UI and anything with no text of its own.
    if (el.closest('#webable-widget-root')) return false;
    const text = (el.textContent || '').trim();
    return text.length > 1;
  });
}

export const focusMode: FeatureModule<FocusSetting> = {
  id: 'focusMode',
  defaults: { active: false, dim: 0.75 },
  meta: {
    id: 'focusMode',
    label: 'Focus mode',
    description: 'Dims the page except the paragraph you are reading, and moves with you as you scroll.',
    category: 'aids',
    icon: 'focusMode',
    wcag: ['1.4.8', '2.2.2'],
    keywords: ['focus', 'dim', 'concentrate', 'adhd', 'reading', 'spotlight', 'one line', 'distraction'],
    controls: [
      { key: 'dim', type: 'slider', label: 'How dim', min: 0.3, max: 0.9, step: 0.05, format: (v) => `${Math.round((v as number) * 100)}%` },
    ],
  },

  apply(s, ctx) {
    const dim = num(s.dim, 0.75);
    ctx.setFlag('focusmode', true);
    ctx.setVar('focus-dim', String(Math.max(0.05, 1 - dim)));
    ctx.injectCSS(
      'root',
      `html[data-webable-focusmode] :where(${BLOCKS}){
         opacity:var(--wa-focus-dim,.25) !important;
         transition:opacity .18s ease-out;
       }
       html[data-webable-focusmode] [data-wa-focus]{opacity:1 !important}
       @media (prefers-reduced-motion:reduce){
         html[data-webable-focusmode] :where(${BLOCKS}){transition:none !important}
       }`,
    );

    if (ctx.store.bound) {
      // A re-apply (setting change, DOM mutation, route change) only needs the
      // current block re-picked; the listeners are already in place.
      (ctx.store.pick as () => void)?.();
      return;
    }
    ctx.store.bound = true;

    let current: HTMLElement | null = null;
    let raf = 0;

    const pick = () => {
      const list = candidates(ctx);
      if (!list.length) return;
      // A third down the viewport: where the eye actually sits while reading,
      // rather than the geometric middle.
      const anchor = (ctx.win.innerHeight || 0) / 3;
      let best: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const el of list) {
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue;
        // Distance from the anchor to the block, zero while the anchor is
        // inside it, so a long paragraph stays lit the whole way down.
        const d = r.top > anchor ? r.top - anchor : r.bottom < anchor ? anchor - r.bottom : 0;
        if (d < bestDist) {
          bestDist = d;
          best = el;
          if (d === 0) break;
        }
      }
      if (!best || best === current) return;
      current?.removeAttribute('data-wa-focus');
      best.setAttribute('data-wa-focus', '');
      current = best;
    };
    ctx.store.pick = pick;

    const schedule = () => {
      if (raf) return;
      raf = ctx.win.requestAnimationFrame(() => {
        raf = 0;
        pick();
      });
    };

    ctx.on(ctx.win, 'scroll', schedule, true);
    ctx.on(ctx.win, 'resize', schedule);
    // Keyboard reading moves focus, not the scroll position, on a page that is
    // already scrolled to the right place.
    ctx.on(ctx.doc, 'focusin', schedule, true);
    ctx.onCleanup(() => {
      if (raf) ctx.win.cancelAnimationFrame(raf);
      current?.removeAttribute('data-wa-focus');
    });
    pick();
  },

  disable(ctx) {
    queryDeep(ctx.doc, '[data-wa-focus]').forEach((el) => el.removeAttribute('data-wa-focus'));
    ctx.store.bound = false;
    ctx.store.pick = undefined;
  },
};
