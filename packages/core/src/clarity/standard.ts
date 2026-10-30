/**
 * The Standard: a saved description of how this reader wants pages to look.
 *
 * This is the product, and it is why ClarityView is not "reader mode with AI".
 * Reader mode has exactly one opinion and Apple chose it; you cannot disagree
 * with it. Here the reader owns the opinion, defines it once, and every page
 * they visit is brought to it.
 *
 * Two design rules hold the schema down to something a person can actually
 * hold in their head:
 *
 *   - Every field is a decision somebody would plausibly want to make
 *     differently, not a knob that exists because CSS has a property for it.
 *     Forty knobs is not configurability, it is a settings panel nobody opens.
 *   - The whole thing renders through CSS custom properties, so the stylesheet
 *     is one fixed sheet full of `var()` and does not grow when a field is
 *     added. That is what keeps a feature this expressive inside a hard gzip
 *     budget.
 *
 * Persistence rides on the flat `FeatureSetting` the engine already stores:
 * a preset id plus a JSON string of the reader's own edits. Flat and JSON-safe,
 * so it round-trips through localStorage and chrome.storage.sync unchanged.
 */

/** How much air the layout gets. Scales spacing without touching type size. */
export type Density = 'compact' | 'comfortable' | 'generous';

/** Where figures land. `collected` gathers them at the end, for people who
 *  want the argument first and the pictures after. */
export type FigureMode = 'inline' | 'collected';

/** Footnotes are the thing reader modes lose most often, so they get a field. */
export type FootnoteMode = 'inline' | 'end' | 'hover';

/** A data table on a narrow screen is unreadable as a grid; `stacked` turns
 *  each row into a labelled record instead. */
export type TableMode = 'table' | 'stacked';

/** Paragraphs separated by a blank line, or by a first-line indent. */
export type ParagraphMode = 'space' | 'indent';

export interface Standard {
  id: string;
  label: string;
  /** Type. `measure` is line length in characters, which is the control people
   *  actually mean when they say "too wide". */
  family: string;
  headingFamily: string;
  size: number;
  measure: number;
  lineHeight: number;
  weight: number;
  headingWeight: number;
  /** Rhythm. */
  paragraph: ParagraphMode;
  paragraphGap: number;
  headingGap: number;
  density: Density;
  /** Colour. `followSystem` lets one Standard serve day and night rather than
   *  making the reader keep two. */
  followSystem: boolean;
  bg: string;
  fg: string;
  link: string;
  codeBg: string;
  /** Structure. */
  figures: FigureMode;
  footnotes: FootnoteMode;
  tables: TableMode;
  /** Numbered figures and tables, and a navigable outline. The difference
   *  between reading and studying. */
  numbered: boolean;
  outline: boolean;
  /** What to drop. Each is a thing a real page has that a reader may not want. */
  dropImages: boolean;
  dropEmbeds: boolean;
  dropRelated: boolean;
  dropBio: boolean;
  dropComments: boolean;
}

/**
 * Starting standards, so the first run is not an empty form.
 *
 * The two intents the product is for are not two products and not two code
 * paths; they are two sets of values over this one schema. `study` makes
 * structure loud: numbering, an outline, tables kept as tables. `plain` makes
 * it quiet and uniform: one rhythm, generous measure, high contrast, nothing
 * that surprises a screen reader or a dyslexic reader. `article` is the
 * middle, and is what someone who just wants the page to be readable gets.
 */
const BASE: Omit<Standard, 'id' | 'label'> = {
  family: "'Atkinson Hyperlegible','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  headingFamily: 'inherit',
  size: 20,
  measure: 68,
  lineHeight: 1.65,
  weight: 400,
  headingWeight: 700,
  paragraph: 'space',
  paragraphGap: 1.1,
  headingGap: 1.6,
  density: 'comfortable',
  followSystem: true,
  bg: '#fbfbfa',
  fg: '#1a2233',
  link: '#1e40af',
  codeBg: '#eef1f6',
  figures: 'inline',
  footnotes: 'end',
  tables: 'table',
  numbered: false,
  outline: false,
  dropImages: false,
  dropEmbeds: true,
  dropRelated: true,
  dropBio: false,
  dropComments: true,
};

export const STANDARDS: ReadonlyArray<Standard> = [
  { ...BASE, id: 'article', label: 'Article' },
  {
    ...BASE,
    id: 'study',
    label: 'Study',
    size: 19,
    measure: 74,
    lineHeight: 1.55,
    density: 'compact',
    footnotes: 'hover',
    numbered: true,
    outline: true,
    dropBio: true,
  },
  {
    ...BASE,
    id: 'plain',
    label: 'Plain',
    size: 22,
    measure: 58,
    lineHeight: 1.8,
    paragraphGap: 1.4,
    headingGap: 1.8,
    density: 'generous',
    followSystem: false,
    bg: '#ffffff',
    fg: '#111111',
    link: '#0b3ea8',
    figures: 'collected',
    footnotes: 'end',
    tables: 'stacked',
    dropImages: true,
    dropRelated: true,
    dropBio: true,
  },
];

export const STANDARD_MAP: ReadonlyMap<string, Standard> = new Map(STANDARDS.map((s) => [s.id, s]));

/** Spacing multiplier for the three densities. One number, three layouts. */
const DENSITY: Record<Density, number> = { compact: 0.82, comfortable: 1, generous: 1.25 };

/**
 * Resolve a preset id plus the reader's own edits into one Standard.
 *
 * Unknown keys and wrong-typed values are dropped rather than trusted: this
 * parses a string that has been through storage, and on the extension through
 * chrome.storage.sync, so it is not necessarily what this build wrote.
 */
export function resolveStandard(presetId: string, customJson?: string): Standard {
  const base = STANDARD_MAP.get(presetId) || STANDARDS[0];
  if (!customJson) return base;
  let patch: Record<string, unknown>;
  try {
    patch = JSON.parse(customJson) as Record<string, unknown>;
  } catch {
    return base;
  }
  if (!patch || typeof patch !== 'object') return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const cur = (base as unknown as Record<string, unknown>)[k];
    // Same key, same type as the preset's value, or it does not get in.
    if (cur === undefined || typeof v !== typeof cur) continue;
    (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

/**
 * The Standard as custom properties.
 *
 * Everything the sheet needs is here, so applying a changed Standard is one
 * string swap on one element rather than a re-render: that is what makes "make
 * the text bigger" instant, and what makes it reversible in one step.
 */
export function standardVars(s: Standard): string {
  const d = DENSITY[s.density] || 1;
  return [
    `--cv-family:${s.family}`,
    `--cv-heading-family:${s.headingFamily === 'inherit' ? 'var(--cv-family)' : s.headingFamily}`,
    `--cv-size:${s.size}px`,
    `--cv-measure:${s.measure}ch`,
    `--cv-line:${s.lineHeight}`,
    `--cv-weight:${s.weight}`,
    `--cv-heading-weight:${s.headingWeight}`,
    `--cv-para-gap:${(s.paragraphGap * d).toFixed(3)}em`,
    `--cv-heading-gap:${(s.headingGap * d).toFixed(3)}em`,
    `--cv-indent:${s.paragraph === 'indent' ? '1.6em' : '0'}`,
    `--cv-pad:${(28 * d).toFixed(0)}px`,
    `--cv-bg:${s.bg}`,
    `--cv-fg:${s.fg}`,
    `--cv-link:${s.link}`,
    `--cv-code-bg:${s.codeBg}`,
  ].join(';');
}

/** Fields a spoken adjustment is allowed to touch, with their bounds. Anything
 *  outside this table cannot be reached by talking, which is deliberate: the
 *  model maps speech onto these, and never writes CSS. */
export const ADJUSTABLE: Readonly<Record<string, { min: number; max: number } | null>> = {
  size: { min: 12, max: 40 },
  measure: { min: 40, max: 110 },
  lineHeight: { min: 1.1, max: 2.4 },
  paragraphGap: { min: 0.4, max: 3 },
  headingGap: { min: 0.4, max: 3 },
  weight: { min: 300, max: 700 },
  headingWeight: { min: 400, max: 900 },
  density: null,
  paragraph: null,
  figures: null,
  footnotes: null,
  tables: null,
  numbered: null,
  outline: null,
  followSystem: null,
  dropImages: null,
  dropEmbeds: null,
  dropRelated: null,
  dropBio: null,
  dropComments: null,
  bg: null,
  fg: null,
  link: null,
};

/**
 * Validate one field of a proposed edit.
 *
 * The model proposes `{size: 24}`; this is what decides whether that becomes
 * part of the Standard. Numbers are clamped rather than rejected, because a
 * model asked for "much bigger" and answering with nothing is worse than
 * answering with the largest size the schema allows. Unknown fields are
 * refused outright.
 */
export function coerceEdit(key: string, value: unknown, base: Standard): unknown | undefined {
  if (!(key in ADJUSTABLE)) return undefined;
  const bound = ADJUSTABLE[key];
  const cur = (base as unknown as Record<string, unknown>)[key];
  if (bound) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(bound.max, Math.max(bound.min, n));
  }
  if (typeof value !== typeof cur) return undefined;
  return value;
}
