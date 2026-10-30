/**
 * Highlight features, make structure and interactive targets pop. Pure CSS,
 * keyed off `data-webable-*` flags on <html>, so new content picked up by the
 * MutationObserver is styled automatically without re-running JS.
 */
import type { FeatureModule, FeatureSetting } from '../types';
import { queryDeep } from '../dom';

export const highlightLinks: FeatureModule = {
  id: 'highlightLinks',
  defaults: { active: false },
  meta: {
    id: 'highlightLinks',
    label: 'Highlight links',
    description: 'Underline and outline every link so they stop hiding in text.',
    category: 'reading',
    icon: 'highlightLinks',
    wcag: ['1.4.1'],
    keywords: ['links', 'anchors', 'underline'],
  },
  apply(_s, ctx) {
    ctx.setFlag('hl-links', true);
    ctx.injectCSS(
      'root',
      `html[data-webable-hl-links] a[href]{
        text-decoration:underline !important;
        text-underline-offset:2px !important;
        outline:2px solid #1e40af !important;
        outline-offset:1px !important;
        background:rgba(30,64,175,0.08) !important;
        border-radius:2px;
      }`,
    );
  },
  disable() {},
};

export const highlightHeadings: FeatureModule = {
  id: 'highlightHeadings',
  defaults: { active: false },
  meta: {
    id: 'highlightHeadings',
    label: 'Highlight titles',
    description: 'Box and label headings so the page outline is obvious.',
    category: 'reading',
    icon: 'highlightHeadings',
    wcag: ['1.3.1', '2.4.6'],
    keywords: ['headings', 'titles', 'h1', 'structure', 'outline'],
    // Tags headings with data-wa-tag for the ::before label; dynamic so
    // headings added by SPA routes / infinite scroll get labeled too.
    dynamic: true,
  },
  apply(_s, ctx) {
    ctx.setFlag('hl-head', true);
    ctx.injectCSS(
      'root',
      `html[data-webable-hl-head] :where(h1,h2,h3,h4,h5,h6){
        outline:2px dashed rgba(30,64,175,0.55) !important;
        outline-offset:3px !important;
        scroll-margin-top:1rem;
      }
      html[data-webable-hl-head] :where(h1,h2,h3,h4,h5,h6)::before{
        content:attr(data-wa-tag);
        display:inline-block;
        margin-right:.5em;
        padding:0 .35em;
        border-radius:3px;
        font:700 .6em/1.6 ui-monospace,monospace;
        letter-spacing:.04em;
        color:#fff;
        background:#1e40af;
        vertical-align:middle;
      }`,
    );
    // Tag each heading with its level for the ::before label. Deep, because the
    // rule above is adopted into shadow roots: without the matching pass, a
    // heading inside a component gets the outline and an empty label.
    for (const h of queryDeep<HTMLElement>(ctx.doc, 'h1,h2,h3,h4,h5,h6')) {
      h.setAttribute('data-wa-tag', h.tagName.toUpperCase());
    }
  },
  disable(ctx) {
    for (const h of queryDeep<HTMLElement>(ctx.doc, '[data-wa-tag]')) h.removeAttribute('data-wa-tag');
  },
};

interface FocusSetting extends FeatureSetting {
  active: boolean;
  width: number;
  /** electric | amber | green | white (palette from the legacy extension). */
  color: string;
}

const FOCUS_COLORS: Record<string, string> = {
  electric: '#2F80FF',
  amber: '#F2B340',
  green: '#1FCB8A',
  white: '#FFFFFF',
};

export const highlightFocus: FeatureModule<FocusSetting> = {
  id: 'highlightFocus',
  defaults: { active: false, width: 3, color: 'electric' },
  meta: {
    id: 'highlightFocus',
    label: 'Visible focus',
    description: 'Force a high-contrast ring on whatever has keyboard focus.',
    category: 'motion',
    icon: 'highlightFocus',
    wcag: ['2.4.7'],
    keywords: ['focus', 'keyboard', 'outline', 'tab ring'],
    controls: [
      { key: 'width', type: 'slider', label: 'Ring width', min: 2, max: 6, step: 1, unit: 'px', format: (v) => `${v}px` },
      {
        key: 'color',
        type: 'segmented',
        label: 'Color',
        options: [
          { value: 'electric', label: 'Blue' },
          { value: 'amber', label: 'Amber' },
          { value: 'green', label: 'Green' },
          { value: 'white', label: 'White' },
        ],
      },
    ],
  },
  apply(s, ctx) {
    ctx.setFlag('focus', true);
    ctx.setVar('focusw', `${s.width || 3}px`);
    ctx.setVar('focusc', FOCUS_COLORS[s.color] || FOCUS_COLORS.electric);
    ctx.injectCSS(
      'root',
      `html[data-webable-focus] :focus,
       html[data-webable-focus] :focus-visible{
        outline:var(--wa-focusw,3px) solid var(--wa-focusc,#2F80FF) !important;
        outline-offset:2px !important;
        box-shadow:0 0 0 calc(var(--wa-focusw,3px) + 2px) color-mix(in srgb, var(--wa-focusc,#2F80FF) 45%, transparent) !important;
        border-radius:2px;
      }`,
    );
  },
  disable() {},
};
