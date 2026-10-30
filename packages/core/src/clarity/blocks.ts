/**
 * ClarityView's block model, and the one rule the whole feature is built to
 * keep: nothing reaches the screen that was not on the page.
 *
 * The user believes they are reading the page. If a model paraphrases a
 * sentence, smooths an awkward heading, or writes a summary that reads like
 * body text, then they have been lied to about a document they think they
 * read. A broken layout is recoverable; that is not. So provenance is not a
 * field somebody remembers to fill in, it is the only way a Block can exist.
 *
 * The enforcement is a branded symbol. `Block` carries a property whose key is
 * a symbol this module does not export, so an object literal written anywhere
 * else, in this repo or in a model's JSON, cannot be assigned to `Block`: it is
 * a type error at compile time and it fails `isBlock` at runtime. The only
 * doors in are `sourceBlock`, which needs a real DOM node, and `noteBlock`,
 * which is for model-authored text and marks it as generated so the renderer
 * can never style it as page content.
 *
 * Types are erased, so the compile-time half of this costs nothing to ship.
 */

/** The brand. Deliberately not exported: that is what makes the rule hold. */
declare const PROVENANCE: unique symbol;

export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'figure'
  | 'code'
  | 'quote'
  | 'footnote'
  | 'math'
  | 'definitions';

/**
 * Where a block came from, as a structural path of child indices from the
 * document element ("1/3/0/2").
 *
 * A path rather than only a node reference, for three reasons that all matter:
 * it survives being written to a cache and read back on the next visit, it can
 * be compared against the live DOM to detect that the page moved underneath us,
 * and it is what the model is given to point at, so a model reply naming a path
 * that does not resolve is rejected rather than rendered.
 */
export type SourcePath = string;

export interface Block {
  /** Present only on blocks this module made. See the note above. */
  readonly [PROVENANCE]: true;
  readonly kind: BlockKind;
  /** The node this came from. Empty for generated notes, which is why a note
   *  can never be mistaken for content: the renderer keys off `generated`. */
  readonly sourcePath: SourcePath;
  /** Live node, when the block was built against a document still in memory. */
  readonly node?: Element;
  /** The page's own text, untouched. Never rewritten, never trimmed of meaning. */
  readonly text: string;
  /** Heading level 1-6, list ordered-ness, table column count, and so on. */
  readonly level?: number;
  readonly ordered?: boolean;
  /** True when a model wrote this text. Always rendered as a visible aside. */
  readonly generated?: true;
  /** For figures: the caption the page gave, if it gave one. */
  readonly caption?: string;
  /** For footnotes: the reference id that points here. */
  readonly ref?: string;
}

/**
 * Child-index path from the document element down to `el`.
 *
 * Crosses open shadow boundaries, and says so in the path: a segment written
 * `s3` means "into this element's shadow root, child 3", where a bare `3`
 * means "child 3". Without this, content inside a web component could not
 * produce a block at all, because the top node of a shadow root has no
 * `parentElement` and the walk would give up and return no path. That is not
 * hypothetical: MDN renders its code examples inside shadow roots, so a reader
 * that stops at the boundary loses every example on the page.
 */
export function pathOf(el: Element): SourcePath {
  const parts: string[] = [];
  let node: Element | null = el;
  const root = el.ownerDocument?.documentElement;
  while (node && node !== root) {
    const parent: Element | null = node.parentElement;
    if (parent) {
      parts.push(String(Array.prototype.indexOf.call(parent.children, node)));
      node = parent;
      continue;
    }
    // No element parent: either a shadow root above us, or a detached node.
    const above = node.parentNode as ShadowRoot | null;
    const host = above && (above as ShadowRoot).host;
    if (!host) {
      // Detached, or a closed root we cannot address. There is no honest path,
      // so it gets none and the caller drops the block rather than inventing a
      // pointer to a node nobody can find again.
      return '';
    }
    parts.push(`s${Array.prototype.indexOf.call(above.children, node)}`);
    node = host;
  }
  return parts.reverse().join('/');
}

/** Resolve a path back to a node, or null when the page no longer matches. */
export function nodeAt(doc: Document, path: SourcePath): Element | null {
  if (!path) return null;
  let node: Element | null = doc.documentElement;
  for (const part of path.split('/')) {
    if (!node) return null;
    if (part.charCodeAt(0) === 115 /* s */) {
      const shadow: ShadowRoot | null = node.shadowRoot;
      const i = Number(part.slice(1));
      if (!shadow || !Number.isInteger(i)) return null;
      node = shadow.children[i] || null;
      continue;
    }
    const i = Number(part);
    if (!Number.isInteger(i)) return null;
    node = node.children[i] || null;
  }
  return node;
}

/**
 * The only way to make a block that renders as page content.
 *
 * Returns null rather than throwing when there is no usable source, because
 * this runs over whatever the page happens to be and one unreachable node must
 * not take the article down with it. A null is simply a block that does not
 * exist, which is the safe direction.
 */
export function sourceBlock(
  el: Element,
  kind: BlockKind,
  text: string,
  extra?: Partial<Pick<Block, 'level' | 'ordered' | 'caption' | 'ref'>>,
): Block | null {
  const sourcePath = pathOf(el);
  if (!sourcePath) return null;
  const body = text.trim();
  // A figure is the one kind that legitimately has no text of its own: an
  // image with no caption and no alt is exactly the case stage two exists to
  // describe, so dropping it here would delete the thing we mean to fix.
  if (!body && kind !== 'figure') return null;
  return { kind, sourcePath, node: el, text: body, ...extra } as Block;
}

/**
 * Model-authored text: an image description, a one-line note on what a figure
 * shows. Allowed, because a blind reader getting no description is worse than
 * getting a marked one, but `generated` is not optional and the renderer draws
 * these as a labelled aside, never as body type.
 *
 * It still needs the node it is about, so a note can never float free of the
 * thing it describes.
 */
export function noteBlock(el: Element, text: string): Block | null {
  const sourcePath = pathOf(el);
  const body = text.trim();
  if (!sourcePath || !body) return null;
  return { kind: 'paragraph', sourcePath, node: el, text: body, generated: true } as Block;
}

/** Runtime half of the brand, for anything crossing a trust boundary. */
export function isBlock(v: unknown): v is Block {
  if (!v || typeof v !== 'object') return false;
  const b = v as { sourcePath?: unknown; text?: unknown; kind?: unknown };
  return typeof b.sourcePath === 'string' && !!b.sourcePath && typeof b.text === 'string' && typeof b.kind === 'string';
}
