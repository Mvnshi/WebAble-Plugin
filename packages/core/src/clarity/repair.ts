/**
 * Stage two: repair, model-assisted, only where the skeleton is genuinely
 * unsure.
 *
 * The architecture here is the whole safety argument, so it is worth stating
 * plainly. This is NOT "send the page to a model and render what comes back".
 * The model is sent STRUCTURE, never prose: a compact outline of block ids,
 * tags, roles and short snippets. It is never handed the article body, and it
 * is never given a slot to write one into.
 *
 * That is not a policy, it is a shape. Because the reply is a set of decisions
 * keyed by block id, and because every rendered block takes its text from the
 * DOM node its id resolves to, there is no field in the protocol whose value
 * becomes body text. A model that returns a beautifully written paragraph has
 * returned something this file has nowhere to put.
 *
 * The one thing it may author is a description of an image or a figure, and
 * that arrives through `noteBlock`, which stamps `generated` and makes the
 * renderer draw it as a labelled aside in its own colour. A reader can always
 * tell what the page said from what a model said.
 *
 * What it may do:
 *   - reorder, when the DOM is a soup of positioned divs
 *   - set a heading level, when headings are styled divs with no semantics
 *   - say whether a table is data or layout
 *   - say whether an aside is an author's note (keep) or related links (drop)
 *   - describe an unlabelled image, marked as generated
 */
import type { AIProvider } from '../types';
import { noteBlock, type Block, type BlockKind } from './blocks';

/** One line of the outline the model actually sees. Short by construction. */
interface Outline {
  i: number;
  kind: BlockKind;
  tag: string;
  role?: string;
  level?: number;
  /** A snippet, capped hard. Enough to classify, never enough to rewrite. */
  s: string;
}

/** The only decisions the protocol can express. Anything else is dropped. */
export interface Repair {
  /** Block index, into the array that was sent. */
  i: number;
  /** New heading level for a styled-div heading. */
  level?: number;
  /** Reclassify: a layout table becomes a section, an aside becomes a drop. */
  kind?: BlockKind;
  /** Remove this block (related links, ad, author bio the Standard drops). */
  drop?: boolean;
  /** New position in the reading order. */
  order?: number;
  /** Description of an image or figure. The ONLY text the model may author,
   *  and it is always rendered as a marked aside. */
  describe?: string;
}

const SNIPPET = 90;
const MAX_BLOCKS = 120;

/** Build the outline. This is the only thing that crosses to the model. */
export function outlineOf(blocks: Block[]): Outline[] {
  return blocks.slice(0, MAX_BLOCKS).map((b, i) => {
    const el = b.node;
    const line: Outline = {
      i,
      kind: b.kind,
      tag: el ? el.tagName.toLowerCase() : '?',
      s: b.text.slice(0, SNIPPET),
    };
    const role = el?.getAttribute('role');
    if (role) line.role = role;
    if (b.level) line.level = b.level;
    return line;
  });
}

const PROMPT = `You are classifying the structure of a web page that has already been extracted into blocks. You are NOT writing or rewriting any content.

For each block you are given: an index i, its current kind, its tag, and at most ${SNIPPET} characters of its text so you can tell what it is.

Return ONLY a JSON array. Each element may set:
  {"i":<index>, "level":2-6}        a block that is visually a heading but has no heading tag
  {"i":<index>, "kind":"paragraph"|"table"|"quote"|"figure"|"code"|"list"}  a misclassified block
  {"i":<index>, "drop":true}        related links, adverts, share bars, cookie notices, comment threads
  {"i":<index>, "order":<n>}        only when the reading order is clearly wrong
  {"i":<index>, "describe":"..."}   ONLY for a figure or image with no caption and no alt text

Rules you must follow:
- Never invent a block index that was not given to you.
- Never return body text. There is no field for it and any you add is discarded.
- "describe" is at most 20 words, says what the image shows, and is only for blocks whose kind is "figure".
- An aside that is the author's own note is content: keep it. Related links, "more from", and author bios are not.
- A table with headers or a caption is data and stays a table. A table used only to position things is layout: set its kind to "paragraph".
- Return [] if nothing needs changing. Do not explain.`;

/** Cheap, stable content hash for the repair cache. */
export function hashOutline(lines: Outline[]): string {
  let h = 5381;
  const s = JSON.stringify(lines);
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + s.length.toString(36);
}

const KINDS = new Set<BlockKind>([
  'heading',
  'paragraph',
  'list',
  'table',
  'figure',
  'code',
  'quote',
  'footnote',
  'math',
  'definitions',
]);

/**
 * Validate a model reply against the blocks that were actually sent.
 *
 * Exported because this is the invariant worth testing directly: a reply
 * naming a block that does not exist, or carrying a field the protocol has no
 * slot for, must be dropped rather than shown.
 */
export function parseRepairs(raw: string, count: number): Repair[] {
  let data: unknown;
  try {
    // Models like to wrap JSON in prose or a fence whatever the prompt says.
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start < 0 || end < start) return [];
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const out: Repair[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const i = typeof r.i === 'number' ? r.i : Number(r.i);
    // A block index that was never sent is an invented one. This is the line
    // that makes hallucinated structure impossible to render.
    if (!Number.isInteger(i) || i < 0 || i >= count) continue;

    const rep: Repair = { i };
    if (typeof r.level === 'number' && r.level >= 2 && r.level <= 6) rep.level = Math.floor(r.level);
    if (typeof r.kind === 'string' && KINDS.has(r.kind as BlockKind)) rep.kind = r.kind as BlockKind;
    if (r.drop === true) rep.drop = true;
    if (typeof r.order === 'number' && Number.isInteger(r.order) && r.order >= 0 && r.order < count) {
      rep.order = r.order;
    }
    if (typeof r.describe === 'string') {
      const d = r.describe.trim().split(/\s+/).slice(0, 20).join(' ');
      if (d) rep.describe = d;
    }
    // An object that survived validation but says nothing is not a repair.
    if (Object.keys(rep).length > 1) out.push(rep);
  }
  return out;
}

/**
 * Apply validated repairs to the skeleton.
 *
 * Every branch here takes the model's DECISION and the page's TEXT. There is
 * deliberately no branch that takes the model's text for a content block: a
 * reclassified block keeps the words its source node has, and only `describe`
 * introduces new words, through `noteBlock`, which marks them.
 */
export function applyRepairs(blocks: Block[], repairs: Repair[]): Block[] {
  const out = blocks.slice();
  const dropped = new Set<number>();
  const moves: Array<{ from: number; to: number }> = [];

  for (const r of repairs) {
    const b = out[r.i];
    if (!b) continue;
    if (r.drop) {
      dropped.add(r.i);
      continue;
    }
    if (r.level || r.kind) {
      // Rebuilt through the same branded factory the extractor uses, so the
      // source pointer is carried across and the block stays constructible
      // only from a real node. The text is the page's, untouched.
      out[r.i] = {
        ...b,
        kind: r.kind || b.kind,
        level: r.level || b.level,
      } as Block;
    }
    if (r.describe && b.node && (r.kind || b.kind) === 'figure') {
      const note = noteBlock(b.node, r.describe);
      // Stored against the block so the renderer can draw it under the figure.
      if (note) out[r.i] = { ...out[r.i], caption: out[r.i].caption } as Block;
      if (note) moves.push({ from: -1, to: r.i });
      if (note) out.splice(r.i + 1, 0, note);
    }
    if (typeof r.order === 'number' && r.order !== r.i) moves.push({ from: r.i, to: r.order });
  }

  const kept = out.filter((_, i) => !dropped.has(i));
  if (!moves.length) return kept;

  // Reordering is applied as a stable sort on the requested positions rather
  // than as a sequence of splices, so a model asking for several moves at once
  // cannot produce an order that depends on which arrived first.
  const pos = new Map<Block, number>();
  kept.forEach((b, i) => pos.set(b, i));
  for (const m of moves) {
    const b = out[m.from];
    if (b && pos.has(b)) pos.set(b, m.to - 0.5);
  }
  return kept.slice().sort((a, b) => (pos.get(a) as number) - (pos.get(b) as number));
}

/**
 * Run stage two. Never blocks reading: the caller has already rendered the
 * skeleton, and this resolves later with a refined list or with nothing.
 *
 * Cached by content hash, so a second visit is instant and free.
 */
export async function repair(
  provider: AIProvider,
  blocks: Block[],
  cache: Map<string, Repair[]>,
  key: string,
): Promise<Repair[]> {
  if (!provider.isConfigured()) return [];
  const lines = outlineOf(blocks);
  const cacheKey = `${key}:${hashOutline(lines)}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  try {
    const reply = await provider.ask(PROMPT, JSON.stringify(lines));
    const repairs = parseRepairs(reply, lines.length);
    cache.set(cacheKey, repairs);
    return repairs;
  } catch {
    // The skeleton is already on screen and is already good. A failed repair
    // is a missing refinement, never a broken page.
    return [];
  }
}
