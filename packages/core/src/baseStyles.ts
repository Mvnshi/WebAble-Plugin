/**
 * Engine base stylesheet, injected once into the host <head> while WebAble is
 * active. It composes the color-filter custom properties (set by the color
 * features) into a single `filter` on <body>, and flips media back when an
 * inverting filter is on. When no color feature is active every custom prop is
 * empty, the value parses to nothing, and no filter is applied, harmless.
 */
export const BASE_STYLE_ID = 'webable-base';

/**
 * Media flipped back out of an inverting filter, so a photograph stays a
 * photograph on a dark page.
 *
 * `iframe` used to be in this set and has been removed. It was the one entry
 * that could not be right from here: the parent has no way to know whether a
 * frame holds a video (flip it back) or a comment thread, a checkout, or a map
 * (do not). Flipping every frame back meant a light embed rendered as a bright
 * white rectangle in an otherwise dark page, which is the exact thing a
 * light-sensitive person turns dark mode on to avoid.
 *
 * So a frame is now dimmed along with the page, and the extension treats what
 * is inside it instead: the content script runs in every frame and each frame
 * applies the user's settings to its own document while leaving the composed
 * filter to its parent (see FRAME_CSS). That is a decision only the frame can
 * make correctly, because only the frame can see what it holds.
 *
 * The widget cannot do that at all: it is a page script, and a cross-origin
 * frame is closed to it by the same-origin policy. On a widget-equipped site a
 * frame is dimmed with the page and untreated inside. See ARCHITECTURE.md.
 */
const REINVERT_CSS = `
html:is([data-webable-reinvert],[data-webable-reinvert-dark]) body :where(img,video,picture,canvas,svg image,embed,object){
  filter: invert(1) hue-rotate(180deg) !important;
}
`;

export const BASE_CSS = `
html[data-webable] body{
  filter:
    var(--wa-f-invert,)
    var(--wa-f-dark,)
    var(--wa-f-contrast,)
    var(--wa-f-grayscale,)
    var(--wa-f-saturate,)
    var(--wa-f-cvd,);
}
${REINVERT_CSS}`;

/**
 * Base stylesheet for a sub-frame (`createEngine({ frame: true })`).
 *
 * A frame is painted into its parent's layer, so the parent's `filter` on
 * <body> already covers every pixel the frame draws. A frame that applied the
 * same filter to its own <body> would be filtered twice: two inversions cancel
 * and the embed comes out light inside a dark page, contrast(1.35) becomes
 * ~1.8, and a colour-blindness matrix applied twice is a daltonization of
 * nothing.
 *
 * So the frame drops the composed filter and keeps everything else, including
 * the media flip-back above: its own <img> and <video> need the same rescue
 * from the parent's inversion that the top document's do.
 */
export const FRAME_CSS = REINVERT_CSS;
