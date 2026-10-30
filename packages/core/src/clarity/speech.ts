/**
 * Adjusting the Standard by talking.
 *
 * "Make the text bigger." "Too wide." "Get rid of the images." "Keep the tables
 * but lose the sidebar."
 *
 * A settings panel with this many dimensions is unusable, so speech is the
 * primary way the Standard gets tuned. Three rules shape this file:
 *
 *   - A spoken adjustment edits the STANDARD, not this one page, unless the
 *     reader says "just here". The whole point is that it persists: someone who
 *     asks for bigger text wants bigger text everywhere, not on this article.
 *   - Every adjustment is reversible in one step, so `interpret` returns the
 *     previous values alongside the new ones and the caller keeps one undo.
 *   - The model maps speech to Standard FIELDS. It never emits CSS. A model
 *     writing arbitrary CSS into someone's page is a security and a quality
 *     problem with no upside, and there is no field in this protocol that
 *     carries any.
 *
 * The rule table runs first and handles the common phrasings with no model, no
 * key and no network, which is a non-negotiable for this feature: the reader
 * has to work offline at stage-one quality, and adjusting it is part of that.
 * The model is the fallback for everything the table does not recognise.
 */
import type { AIProvider } from '../types';
import { coerceEdit, type Standard } from './standard';

export interface Adjustment {
  /** Fields to change, already validated and clamped. */
  patch: Partial<Standard>;
  /** The same fields at their previous values, so one step undoes it. */
  undo: Partial<Standard>;
  /** True when the reader said "just here" and meant this page only. */
  pageOnly: boolean;
  /** What changed, in the reader's terms, so the UI can show it. */
  said: string;
}

/** Step sizes. Chosen so one "bigger" is noticeable and three are not absurd. */
const STEP = { size: 2, measure: 8, lineHeight: 0.15, gap: 0.25 };

type Rule = { re: RegExp; apply: (s: Standard) => Partial<Standard>; say: string };

/**
 * The rule table.
 *
 * Ordered: the first match wins, so the more specific phrasings come first.
 * Each entry is a plain function of the current Standard, which is what makes
 * "bigger" relative rather than absolute.
 */
const RULES: Rule[] = [
  { re: /\b(?:smaller|less big|reduce|shrink)\b.*\btext\b|\btext\b.*\bsmaller\b|\bsmaller\b/i,
    apply: (s) => ({ size: s.size - STEP.size }), say: 'Made the text smaller.' },
  { re: /\b(?:bigger|larger|increase|enlarge)\b/i,
    apply: (s) => ({ size: s.size + STEP.size }), say: 'Made the text bigger.' },
  { re: /\btoo wide\b|\bnarrower\b|\bshorter lines?\b|\bnarrow\b/i,
    apply: (s) => ({ measure: s.measure - STEP.measure }), say: 'Narrowed the column.' },
  { re: /\btoo narrow\b|\bwider\b|\blonger lines?\b/i,
    apply: (s) => ({ measure: s.measure + STEP.measure }), say: 'Widened the column.' },
  { re: /\b(?:more|extra)\b.*\b(?:space|spacing|air|room)\b|\bmore spaced\b/i,
    apply: (s) => ({ lineHeight: s.lineHeight + STEP.lineHeight, paragraphGap: s.paragraphGap + STEP.gap }),
    say: 'Opened up the spacing.' },
  { re: /\b(?:less|tighter?|tighten)\b.*\b(?:space|spacing)\b|\btighter\b|\bcompact\b/i,
    apply: (s) => ({ lineHeight: s.lineHeight - STEP.lineHeight, paragraphGap: s.paragraphGap - STEP.gap }),
    say: 'Tightened the spacing.' },
  { re: /\b(?:get rid of|remove|hide|lose|no|without)\b.*\b(?:images?|pictures?|photos?)\b/i,
    apply: () => ({ dropImages: true }), say: 'Hid the images.' },
  { re: /\b(?:show|keep|bring back|restore)\b.*\b(?:images?|pictures?|photos?)\b/i,
    apply: () => ({ dropImages: false }), say: 'Showing the images.' },
  { re: /\b(?:get rid of|remove|hide|lose|no)\b.*\b(?:related|sidebar|more from|recommend)/i,
    apply: () => ({ dropRelated: true }), say: 'Dropped the related links.' },
  { re: /\b(?:get rid of|remove|hide|lose|no)\b.*\b(?:comments?)\b/i,
    apply: () => ({ dropComments: true }), say: 'Dropped the comments.' },
  { re: /\b(?:get rid of|remove|hide|lose|no)\b.*\b(?:bio|author)\b/i,
    apply: () => ({ dropBio: true }), say: 'Dropped the author bio.' },
  { re: /\bkeep\b.*\btables?\b|\btables? as tables?\b/i,
    apply: () => ({ tables: 'table' as const }), say: 'Keeping tables as tables.' },
  { re: /\bstack(?:ed)?\b.*\btables?\b|\btables?\b.*\bstack/i,
    apply: () => ({ tables: 'stacked' as const }), say: 'Stacked the tables.' },
  { re: /\b(?:collect|gather|move)\b.*\b(?:figures?|images?)\b.*\b(?:end|bottom|after)\b/i,
    apply: () => ({ figures: 'collected' as const }), say: 'Collected the figures at the end.' },
  { re: /\b(?:outline|contents|navigat)/i,
    apply: (s) => ({ outline: !s.outline }), say: 'Toggled the outline.' },
  { re: /\bnumber(?:ed|ing)?\b.*\b(?:figures?|tables?)\b|\bnumber them\b/i,
    apply: (s) => ({ numbered: !s.numbered }), say: 'Toggled figure and table numbering.' },
  { re: /\bindent/i, apply: () => ({ paragraph: 'indent' as const }), say: 'Indenting paragraphs.' },
  { re: /\b(?:dark|night)\b/i,
    apply: () => ({ followSystem: false, bg: '#10161f', fg: '#dbe3ee', link: '#87adff' }), say: 'Switched to dark.' },
  { re: /\b(?:light|day|white)\b/i,
    apply: () => ({ followSystem: false, bg: '#ffffff', fg: '#111111', link: '#0b3ea8' }), say: 'Switched to light.' },
  { re: /\bhigh contrast\b|\bmore contrast\b/i,
    apply: () => ({ followSystem: false, bg: '#ffffff', fg: '#000000', link: '#0b3ea8' }), say: 'Raised the contrast.' },
];

const PAGE_ONLY = /\bjust (?:here|this page|this one)\b|\bonly (?:here|this page)\b|\bthis page only\b/i;

/** Build a validated Adjustment from a set of proposed field changes. */
function build(base: Standard, proposed: Record<string, unknown>, said: string, pageOnly: boolean): Adjustment | null {
  const patch: Record<string, unknown> = {};
  const undo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(proposed)) {
    // Every field goes through the schema's own validator: unknown keys are
    // refused and numbers are clamped to the bounds the schema declares.
    const clean = coerceEdit(k, v, base);
    if (clean === undefined) continue;
    const cur = (base as unknown as Record<string, unknown>)[k];
    if (clean === cur) continue;
    patch[k] = clean;
    undo[k] = cur;
  }
  if (!Object.keys(patch).length) return null;
  return { patch: patch as Partial<Standard>, undo: undo as Partial<Standard>, pageOnly, said };
}

/** The offline half: no model, no key, no network, no latency. */
export function interpretLocal(text: string, base: Standard): Adjustment | null {
  const pageOnly = PAGE_ONLY.test(text);
  for (const rule of RULES) {
    if (!rule.re.test(text)) continue;
    return build(base, rule.apply(base) as Record<string, unknown>, rule.say, pageOnly);
  }
  return null;
}

const PROMPT = `You map a reader's request onto fields of a document-style schema. You never write CSS and you never write prose for the page.

Return ONLY a JSON object whose keys are a subset of these fields:
size (12-40, px), measure (40-110, characters per line), lineHeight (1.1-2.4), paragraphGap (0.4-3, em), headingGap (0.4-3, em), weight (300-700), headingWeight (400-900), density ("compact"|"comfortable"|"generous"), paragraph ("space"|"indent"), figures ("inline"|"collected"), footnotes ("inline"|"end"|"hover"), tables ("table"|"stacked"), numbered (bool), outline (bool), followSystem (bool), dropImages (bool), dropEmbeds (bool), dropRelated (bool), dropBio (bool), dropComments (bool), bg / fg / link (CSS hex colour).

Rules:
- Values are ABSOLUTE, not deltas. You are given the current values; compute the new one.
- Only include fields the request actually asks to change.
- Return {} if the request is not about how the page looks.
- No explanation, no other keys.`;

/**
 * The model half. Only reached when the rule table did not recognise the
 * phrasing, so the common cases never pay for a round trip.
 */
export async function interpret(text: string, base: Standard, provider?: AIProvider): Promise<Adjustment | null> {
  const local = interpretLocal(text, base);
  if (local || !provider?.isConfigured()) return local;
  try {
    const reply = await provider.ask(
      `${PROMPT}\n\nCurrent values: ${JSON.stringify(base)}`,
      text,
    );
    const start = reply.indexOf('{');
    const end = reply.lastIndexOf('}');
    if (start < 0 || end < start) return null;
    const parsed = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return build(base, parsed, 'Adjusted.', PAGE_ONLY.test(text));
  } catch {
    return null;
  }
}
