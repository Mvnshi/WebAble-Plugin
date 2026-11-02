/**
 * Accent colour handling for the launcher and panel.
 *
 * Two bugs lived here. The accent a site owner passes in `data-webable-color`
 * went straight into a CSS custom property with no validation, so a typo
 * silently produced an invalid value and the launcher lost its background
 * entirely. And `--on-accent` was hard-coded to white, so a light brand colour
 * gave white text on a light button: an accessibility product failing contrast
 * on its own launcher, which is the one thing it cannot do.
 *
 * So: parse it, reject what cannot be parsed, and pick the foreground that
 * actually contrasts.
 */

const BRAND_ACCENT = '#1e40af';

/** Named colours worth accepting; anything else has to be hex or rgb(). */
const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  navy: '#000080',
  teal: '#008080',
  purple: '#800080',
  orange: '#ffa500',
  gray: '#808080',
  grey: '#808080',
};

/** Parse to 0-255 RGB, or null when the value is not a colour we understand. */
export function parseColor(input: string | undefined | null): [number, number, number] | null {
  if (!input) return null;
  const v = String(input).trim().toLowerCase();

  const named = NAMED[v];
  if (named) return parseColor(named);

  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v);
  if (hex) {
    let h = hex[1];
    // #rgb and #rgba expand by doubling each digit; the alpha channel is
    // dropped because the launcher paints over the host page and a
    // semi-transparent button is a contrast problem we cannot reason about.
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    h = h.slice(0, 6);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (rgb) {
    const nums = [rgb[1], rgb[2], rgb[3]].map((n) => Math.round(Number(n)));
    if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
    return nums as [number, number, number];
  }

  return null;
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG contrast ratio between two parsed colours. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE: [number, number, number] = [255, 255, 255];
/** Not pure black: near-black reads better on a saturated colour and still
 *  clears 4.5:1 anywhere white does not. */
const INK: [number, number, number] = [10, 27, 46];

/** Mix two colours by `t` (0 = a, 1 = b). */
function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Darken (or lighten) a colour until it clears `target` against `bg`.
 *
 * `--accent-text` was a plain alias of the raw accent in the light theme, and
 * it is the outline colour for the icon buttons, profiles, gear, switch,
 * segmented control, colour input, buttons, reset and rail tabs, as well as a
 * text colour. A site owner passing a pale brand colour therefore made every
 * focus ring in the panel invisible, in the default theme, on an accessibility
 * product. Dark and glass were always safe because they mix the accent toward
 * white; light passed it straight through.
 */
export function readableOn(
  color: [number, number, number],
  bg: [number, number, number],
  target = 4.5,
): [number, number, number] {
  if (contrastRatio(color, bg) >= target) return color;
  // Walk toward whichever end of the scale is further from the background.
  const toward: [number, number, number] = luminance(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 12; i++) {
    const t = (lo + hi) / 2;
    if (contrastRatio(mix(color, toward, t), bg) >= target) hi = t;
    else lo = t;
  }
  return mix(color, toward, hi);
}

const rgbCss = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;

export interface Accent {
  /** The accent to use, falling back to the brand colour when unparseable. */
  color: string;
  /** Foreground that contrasts with it. */
  onColor: string;
  /**
   * The accent as a text and outline colour on the light surface, darkened
   * until it clears 4.5:1. Dark and glass themes override this in CSS.
   */
  textColor: string;
  /** Contrast ratio of onColor against color. */
  ratio: number;
  /** False when the supplied value could not be parsed and was replaced. */
  valid: boolean;
}

/**
 * Resolve an accent to a usable pair. Whichever of white or near-black
 * contrasts better wins, so a pale brand colour gets dark text instead of the
 * hard-coded white that made it unreadable.
 */
export function resolveAccent(input: string | undefined | null): Accent {
  const parsed = parseColor(input);
  const valid = !!parsed;
  const rgb = parsed || (parseColor(BRAND_ACCENT) as [number, number, number]);
  const color = valid ? String(input).trim() : BRAND_ACCENT;

  const onWhite = contrastRatio(rgb, WHITE);
  const onInk = contrastRatio(rgb, INK);
  const useInk = onInk > onWhite;

  return {
    color,
    onColor: useInk ? 'rgb(10,27,46)' : '#ffffff',
    // 4.5:1 rather than 3:1: this is a text colour as well as an outline one
    // (.wa-ctl-val shows the live slider value in it).
    textColor: rgbCss(readableOn(rgb, WHITE, 4.5)),
    ratio: useInk ? onInk : onWhite,
    valid,
  };
}
