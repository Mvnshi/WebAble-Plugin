/**
 * Stage one: the deterministic skeleton.
 *
 * No model. Fast, offline, free, and good enough on its own that ClarityView
 * works with the network down and with no key. Stage two only ever refines what
 * this produced; it never replaces it, and it can never add prose.
 *
 * The scoring is Mozilla Readability's, adapted rather than reinvented. Ours
 * was a much cruder version of the same idea (sum <p> lengths, multiply
 * nav/aside by 0.2, take the max) and it was missing exactly the three parts
 * that separate "usually right" from "right": the class/id weighting, the
 * link-density penalty, and sibling gathering. Readability is Apache-2.0, so
 * the algorithm is used directly and credited in NOTICE.
 *
 * What is NOT Readability is the output. Readability hands back a blob of HTML
 * and, on the way, `_prepArticle` throws away the things study actually needs:
 * data tables, figures split from their captions, code blocks, footnotes and
 * their back-references, math, pull quotes. This emits an ordered list of typed
 * blocks instead, each carrying a pointer to the node it came from, and it
 * keeps all of the above.
 *
 * Shadow roots: every query goes through `queryDeep` from ../dom, which
 * memoises its root walk for the task. There is exactly one traversal in this
 * package and this file does not add a second.
 */
import { queryDeep } from '../dom';
import { sourceBlock, type Block } from './blocks';

/* Readability's regexes, copied verbatim. The oddities are load-bearing and
 * are deliberately not "cleaned up": `okMaybeItsACandidate` matching bare `and`
 * rescues any class containing that substring, and NEGATIVE's four `hid`
 * alternations are word-boundary hacks around a space-joined string that a
 * tidier \bhid\b would silently change the results of. */
const UNLIKELY =
  /-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote/i;
const MAYBE = /and|article|body|column|content|main|shadow/i;
const POSITIVE = /article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story/i;
const NEGATIVE =
  /-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|footer|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|widget/i;
/** Multi-script, so CJK and Arabic prose scores like Latin prose does. */
const COMMAS = /,|،|﹐|︐|︑|⹁|⸴|⸲|，/g;

/** Readability's DEFAULT_TAGS_TO_SCORE. h1 is deliberately absent: a page's
 *  title is not evidence of where its body is. */
const SCORABLE = 'section,h2,h3,h4,h5,h6,p,td,pre';

/**
 * Whitespace-normalised text, which is what every threshold below is measured
 * against (Readability collapses runs of whitespace before counting).
 *
 * Skips the noise subtrees rather than reading `textContent` flat, because
 * `textContent` includes `<style>` and `<script>`. Readability gets this for
 * free by deleting those nodes from a cloned document in `_prepDocument`; this
 * extractor works against the live DOM and must not mutate it, so it steps
 * around them instead. Found on real pages: Wikipedia inlines per-article
 * `<style>` blocks, and reading them flat put `.mw-parser-output .navbox
 * {display:none!important}` into the article as a paragraph.
 */
function innerText(el: Element): string {
  return collectText(el).replace(/\s{2,}/g, ' ').trim();
}

/** Inline by nature, so its text runs on with its neighbours' rather than
 *  being a separate run. See collectText. */
const INLINE_TAG = /^(?:A|SPAN|EM|STRONG|B|I|CODE|SUP|SUB|ABBR|CITE|Q|MARK|SMALL|U|S|TIME|DFN|KBD|VAR|SAMP|BDI|BDO|RUBY|WBR)$/;

/**
 * A permalink anchor: the little glyph docs generators put after a heading so
 * you can link to it.
 *
 * Sphinx uses a pilcrow, GitHub a link icon, MDN a hash. They are navigation
 * chrome, not part of the heading, and every heading on every page of a
 * Sphinx-built site carries one. Recognised by shape rather than by class,
 * because each generator names it differently: a same-page anchor whose text
 * contains no letter and no digit is not a word.
 */
function isPermalink(el: Element): boolean {
  return (
    el.tagName === 'A' &&
    (el.getAttribute('href') || '').charCodeAt(0) === 35 &&
    !/[\p{L}\p{N}]/u.test(el.textContent || '')
  );
}

/**
 * Text, with the whitespace the markup actually implies.
 *
 * Trimming each child before joining loses the spaces that separate inline
 * runs: Python's docs write a heading as `<span>9. </span>Classes<a>¶</a>`, and
 * trimming the span turned that into "9.Classes ¶". So inline children
 * contribute their text raw and block-level ones are padded, which is what
 * separates two adjacent paragraphs without gluing a number to its heading.
 */
function collectText(el: Element): string {
  let out = '';
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      out += node.nodeValue || '';
      continue;
    }
    if (node.nodeType !== 1) continue;
    const child = node as Element;
    if (isNoise(child) || isPermalink(child)) continue;
    out += INLINE_TAG.test(child.tagName) ? collectText(child) : ` ${collectText(child)} `;
  }
  return out;
}

/** Share of a node's text that sits inside links. Navigation is nearly all
 *  link; prose is nearly none, which is why this is the strongest single
 *  signal Readability has. */
function linkDensity(el: Element): number {
  const len = innerText(el).length;
  if (!len) return 0;
  let linked = 0;
  for (const a of Array.from(el.querySelectorAll('a'))) {
    // A same-page anchor is a footnote marker or a heading permalink, not
    // navigation, so it only counts a fraction. This is Readability's
    // coefficient and it is what stops a heavily footnoted paper reading as nav.
    const href = a.getAttribute('href') || '';
    linked += innerText(a).length * (/^#/.test(href) ? 0.3 : 1);
  }
  return linked / len;
}

/** ±25 per regex per attribute, className and id scored independently, so the
 *  range is -50..+50 and a node matching both nets zero. */
function classWeight(el: Element): number {
  let w = 0;
  const cls = typeof el.className === 'string' ? el.className : '';
  if (cls) {
    if (NEGATIVE.test(cls)) w -= 25;
    if (POSITIVE.test(cls)) w += 25;
  }
  const id = el.id || '';
  if (id) {
    if (NEGATIVE.test(id)) w -= 25;
    if (POSITIVE.test(id)) w += 25;
  }
  return w;
}

function tagBase(el: Element): number {
  switch (el.tagName) {
    case 'DIV':
      return 5;
    case 'PRE':
    case 'TD':
    case 'BLOCKQUOTE':
      return 3;
    case 'ADDRESS':
    case 'OL':
    case 'UL':
    case 'DL':
    case 'DD':
    case 'DT':
    case 'LI':
    case 'FORM':
      return -3;
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
    case 'TH':
      return -5;
    default:
      return 0;
  }
}

/** ARIA roles that are structurally not article body, whatever they are called. */
const SKIP_ROLES = /^(?:menu|menubar|navigation|complementary|dialog|alert|banner|search|form|tablist)$/i;

function unlikely(el: Element): boolean {
  const role = el.getAttribute('role');
  if (role && SKIP_ROLES.test(role)) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.hasAttribute('hidden')) return true;
  const sig = `${typeof el.className === 'string' ? el.className : ''} ${el.id}`;
  return UNLIKELY.test(sig) && !MAYBE.test(sig) && el.tagName !== 'BODY' && el.tagName !== 'A';
}

/**
 * Cheap gate, Readability's `isProbablyReaderable`. Answering "there is no
 * article here" quickly matters as much as extracting well: a page this cannot
 * parse must say so and offer the original rather than render a confident
 * looking half-page.
 */
export function isReaderable(doc: Document): boolean {
  let score = 0;
  for (const el of queryDeep(doc, 'p,pre,article')) {
    if (unlikely(el)) continue;
    const len = innerText(el).length;
    if (len < 140) continue;
    score += Math.sqrt(len - 140);
    if (score > 20) return true;
  }
  return false;
}

/**
 * Pick the element that most looks like the article body.
 *
 * Scores paragraph-ish nodes, propagates each score up its first five
 * ancestors, then multiplies by (1 - linkDensity) so a high-scoring navigation
 * column cannot win.
 */
function pickRoot(doc: Document): Element {
  const scores = new Map<Element, number>();
  const bump = (el: Element, by: number) => {
    if (!scores.has(el)) scores.set(el, tagBase(el) + classWeight(el));
    scores.set(el, (scores.get(el) as number) + by);
  };

  for (const el of queryDeep(doc, SCORABLE)) {
    if (unlikely(el)) continue;
    const text = innerText(el);
    // Readability's two gates: 25 characters of real text, and an ancestor to
    // give the score to.
    if (text.length < 25 || !el.parentElement) continue;
    // The off-by-one here is Readability's and is load-bearing: `split().length`
    // means a comma-free paragraph still contributes 1, so the floor is 2.
    const score = 1 + text.split(COMMAS).length + Math.min(Math.floor(text.length / 100), 3);

    let node: Element | null = el.parentElement;
    for (let level = 0; node && level < 5; level++, node = node.parentElement) {
      // Dividers by level are 1, 2, 6, 9, 12. The jump from 2 to 6 at level two
      // is the single most common reimplementation error, and getting it wrong
      // systematically favours containers that are too high up the tree.
      const divider = level === 0 ? 1 : level === 1 ? 2 : level * 3;
      bump(node, score / divider);
    }
  }

  let best: Element | null = null;
  let bestScore = 0;
  for (const [el, raw] of scores) {
    const score = raw * (1 - linkDensity(el));
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (!best) return doc.body || doc.documentElement;

  /* Sibling gathering. A lead paragraph, a pull quote or a figure often sits
   * outside the winning container; anything scoring above max(10, 0.2 * top)
   * belongs with it. Rather than move nodes, the common parent is taken when it
   * holds enough of them, which keeps every source path valid. */
  const parent = best.parentElement;
  if (parent && parent !== doc.body) {
    const bar = Math.max(10, bestScore * 0.2);
    let kept = 0;
    for (const sib of Array.from(parent.children)) {
      const s = (scores.get(sib) || 0) * (1 - linkDensity(sib));
      if (s > bar) kept++;
    }
    if (kept > 1) return parent;
  }
  return best;
}

/**
 * Is this table data, or is it layout?
 *
 * Layout tables must become plain sections or the reader is full of invisible
 * one-cell grids; data tables must stay tables or half the product (study) is
 * gone. The heuristic below is deliberate about which way it errs: a table with
 * any real tabular marking is kept as data, because rendering data as prose
 * destroys information, while rendering layout as a table only looks odd.
 *
 * The genuinely ambiguous cases (no th, no caption, several rows and columns,
 * no role) are what stage two exists for.
 */
export function isDataTable(t: Element): boolean {
  const role = t.getAttribute('role');
  if (role === 'presentation' || role === 'none') return false;
  if (role === 'grid' || role === 'table') return true;
  if (t.querySelector('th,caption,thead,tfoot')) return true;
  // A table containing another table is layout scaffolding, near always.
  if (t.querySelector('table')) return false;
  const rows = t.querySelectorAll('tr').length;
  const cols = t.querySelector('tr')?.children.length || 0;
  return rows > 1 && cols > 1;
}

/** Elements that end the walk: whatever they contain is emitted as one block. */
const LEAF =
  'p,h1,h2,h3,h4,h5,h6,ul,ol,dl,table,figure,pre,blockquote,math,li[id^="fn"],[role="doc-footnote"],.footnote,.katex,.MathJax';

/**
 * Inline elements. These are never containers of blocks: their text belongs to
 * whatever block encloses them.
 *
 * Descending into them was a real bug, found on Wikipedia. Its section edit
 * links are `<span class=mw-editsection><a><span>edit</span></a></span>`, so a
 * walk that treats `<a>` as a container reaches the inner span, finds a text
 * leaf with no link inside IT, and emits the word "edit" as a paragraph. The
 * article got sixty-nine of those. The same walk turned hatnote links into
 * stray one-line paragraphs above the lede. Skipping inline elements outright
 * fixes both, because the enclosing element then has nothing that emitted and
 * becomes the text leaf itself, carrying its full text including the link's,
 * which is what it should have been all along.
 */
const INLINE =
  'a,span,em,strong,b,i,code,sup,sub,abbr,cite,q,mark,small,u,s,time,dfn,kbd,var,samp,label,br,wbr,bdi,bdo,ruby';

/** Things that are never content, whatever they score. */
const NOISE =
  'script,style,noscript,template,link,meta,nav,aside,form,button,input,select,textarea,svg,iframe,object,embed,[role="navigation"],[aria-hidden="true"]';

function isNoise(el: Element): boolean {
  return el.matches(NOISE);
}

/** Heading level, from the tag when it has one. Styled `div`s that look like
 *  headings have no level here on purpose: guessing is stage two's job, and a
 *  wrong guess made deterministically is a wrong guess nobody can correct. */
function headingLevel(el: Element): number | undefined {
  const m = /^H([1-6])$/.exec(el.tagName);
  return m ? Number(m[1]) : undefined;
}

function figureOf(el: Element): Block | null {
  const cap = el.querySelector('figcaption');
  const img = el.querySelector('img');
  /* A <figure> wrapping a <pre> with no image is a code block that has been
   * given a caption, which is how a good many static site generators emit
   * code. Found on a real blog: all 62 of its "figures" were code, and reading
   * them as figures rendered 62 empty boxes and lost every line of it. The
   * block is sourced from the <pre> rather than the <figure>, because that is
   * the node the text actually came from. */
  const pre = el.querySelector('pre');
  if (pre && !img) {
    return sourceBlock(pre, 'code', pre.textContent || '', { caption: cap ? innerText(cap) : undefined });
  }
  const caption = cap ? innerText(cap) : '';
  // The page's own alt text is the page's words, so it is content, not a
  // generated note. An unlabelled image is left for stage two to describe.
  const alt = img?.getAttribute('alt')?.trim() || '';
  const text = caption || alt;
  if (!text) return sourceBlock(el, 'figure', ' ', { caption: '' });
  return sourceBlock(el, 'figure', text, { caption });
}

function tableBlock(el: Element): Block | null {
  if (!isDataTable(el)) return null;
  const cap = el.querySelector('caption');
  return sourceBlock(el, 'table', innerText(el), { caption: cap ? innerText(cap) : undefined });
}

function blockFor(el: Element): Block | null {
  const tag = el.tagName;
  if (tag === 'FIGURE') return figureOf(el);
  if (tag === 'TABLE') return tableBlock(el);
  if (tag === 'PRE') {
    // Code keeps its own whitespace: collapsing it is the difference between
    // readable code and a wall of tokens.
    return sourceBlock(el, 'code', el.textContent || '');
  }
  if (tag === 'BLOCKQUOTE') return sourceBlock(el, 'quote', innerText(el));
  if (tag === 'UL' || tag === 'OL') {
    return sourceBlock(el, 'list', innerText(el), { ordered: tag === 'OL' });
  }
  if (tag === 'DL') return sourceBlock(el, 'definitions', innerText(el));
  if (tag === 'MATH' || el.classList.contains('katex') || el.classList.contains('MathJax')) {
    return sourceBlock(el, 'math', innerText(el));
  }
  const level = headingLevel(el);
  if (level) return sourceBlock(el, 'heading', innerText(el), { level });
  const id = el.id || '';
  if (/^fn/i.test(id) || el.getAttribute('role') === 'doc-footnote' || el.classList.contains('footnote')) {
    return sourceBlock(el, 'footnote', innerText(el), { ref: id });
  }
  return sourceBlock(el, 'paragraph', innerText(el));
}

export interface Skeleton {
  title: string;
  blocks: Block[];
  /** False when the page has no article worth showing. The caller offers the
   *  original page rather than rendering a confident-looking half-page. */
  ok: boolean;
  /** The container the blocks came from, for stage two's outline. */
  root: Element;
  /** Where this article continues, when it is paginated. See findNext. */
  next?: { href: string; label: string };
}

/** Words a continuation control uses, and the bare glyphs that stand in for
 *  them. Anchored so "nextdoor" and "read more about our privacy policy" do
 *  not match. */
const NEXT_TEXT = /^(?:next|older|continue|more|forward)\b|^(?:>|›|»|→|next\s*(?:page|part)?)$/i;
/** Containers that mean "this is pagination" rather than "this is a menu". */
const PAGER = /pag(?:e|er|ination)|next-?page|continue|multi-?page/i;

/**
 * Where this article continues.
 *
 * Reader modes drop paginated articles silently: you get part one, formatted
 * beautifully, with no sign that parts two through five exist. The brief lists
 * multi-page article links among the things to keep, and this is the honest
 * minimum, which is to say where it continues rather than to fetch and stitch
 * it. Stitching means issuing requests the reader did not ask for, on a page
 * they may be about to leave, and getting it wrong means silently splicing the
 * wrong document into something they believe they are reading whole.
 *
 * Deliberately conservative, because a wrong answer is worse than none: a
 * "Continue" that goes somewhere unrelated is a broken promise, while no link
 * is merely the behaviour every other reader mode has. `rel="next"` is
 * standardised and unambiguous, so it wins outright; otherwise the anchor has
 * to both read like a continuation and sit in something that reads like a
 * pager.
 */
export function findNext(doc: Document, root: Element): { href: string; label: string } | undefined {
  const here = doc.location?.href || '';
  // No base URL means no way to resolve a relative href or to check its
  // origin, and offering a continuation we cannot verify is the exact thing
  // this function refuses to do everywhere else. A placeholder base would also
  // put a hostname in the bundle that the privacy page does not name, which
  // apps/extension/test guards against and rightly caught.
  if (!here) return undefined;
  const origin = new URL(here).origin;
  const ok = (a: Element): { href: string; label: string } | undefined => {
    const raw = a.getAttribute('href') || '';
    if (!raw || raw.charCodeAt(0) === 35) return undefined;
    let url: URL;
    try {
      url = new URL(raw, here);
    } catch {
      return undefined;
    }
    // Same origin only. A cross-origin "next" is a syndication link or an ad,
    // and following it would take the reader off the article entirely.
    if (url.origin !== origin || url.href === here) return undefined;
    return { href: url.href, label: innerText(a).slice(0, 60) || 'Next page' };
  };

  const declared = doc.querySelector('link[rel="next"],a[rel="next"]');
  if (declared) {
    const hit = ok(declared);
    if (hit) return hit;
  }

  for (const a of queryDeep(root.parentElement || doc, 'a[href]')) {
    if (!NEXT_TEXT.test(innerText(a))) continue;
    // The anchor alone is not enough: "More" is a nav item on half the web.
    let node: Element | null = a;
    let paged = false;
    for (let i = 0; node && i < 4 && !paged; i++, node = node.parentElement) {
      paged = PAGER.test(`${typeof node.className === 'string' ? node.className : ''} ${node.id}`);
    }
    if (!paged) continue;
    const hit = ok(a);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Extract the ordered, typed skeleton.
 *
 * Walks the chosen root once, emitting one block per leaf. Order is DOM order,
 * which is right far more often than it is wrong; fixing the cases where the
 * DOM is a soup of positioned divs is stage two's first job.
 */
export function extract(doc: Document): Skeleton {
  const root = pickRoot(doc);
  const blocks: Block[] = [];
  const seen = new Set<Element>();

  /**
   * Returns how many blocks came out of this subtree, which is what makes the
   * text-leaf case below work at any depth.
   */
  const walk = (el: ParentNode): number => {
    let emitted = 0;
    for (const child of Array.from(el.children)) {
      if (isNoise(child) || seen.has(child)) continue;
      // Inline: not a container, so it is neither descended into nor emitted.
      // Its enclosing element picks the text up as one block. See INLINE.
      if (child.matches(INLINE)) continue;
      /* The class-and-id heuristic decides whether to walk INTO a container.
       * It must not decide whether a content LEAF is content: a heading is a
       * heading because of its tag, whatever the site calls it. Found on
       * Substack, which names every section heading `header-anchor-post`. That
       * contains "header", so judging leaves by class silently deleted all
       * five section headings and left the article as one undivided run. */
      if (!child.matches(LEAF) && unlikely(child)) continue;
      /* Web components hold their content in a shadow root, and `children`
       * stops at the boundary, so a site built out of them extracts as an
       * empty page. Following the edge here rather than collecting roots
       * separately keeps this to one traversal: `queryDeep` in ../dom.ts stays
       * the only thing that walks the document looking for roots. Our own
       * surfaces are marked `data-webable` and are skipped. */
      const shadow = child.shadowRoot;
      if (shadow && !child.hasAttribute('data-webable')) {
        emitted += walk(shadow);
        // The host may also have light-DOM children worth taking.
      }
      if (child.matches(LEAF)) {
        seen.add(child);
        const block = blockFor(child);
        // A leaf we refuse (a layout table) is not dropped, it is descended
        // into: its cells hold real paragraphs and losing them would be the
        // exact failure this whole file exists to avoid.
        if (block) {
          blocks.push(block);
          emitted++;
        } else emitted += walk(child);
        continue;
      }
      const inner = walk(child);
      if (inner) {
        emitted += inner;
        continue;
      }
      /* Nothing inside this container was a block of any kind, so its text
       * belongs to it directly. This is the styled-`div` case, and it is
       * extremely common: sites built out of utility classes write headings,
       * standfirsts and whole paragraphs as bare divs. Without this the text is
       * not misclassified, it is silently gone, which is the worst outcome
       * available. The link-density guard keeps a leftover row of links from
       * arriving as a paragraph. */
      const text = innerText(child);
      if (text.length > 1 && linkDensity(child) < 0.5) {
        seen.add(child);
        const block = sourceBlock(child, 'paragraph', text);
        if (block) {
          blocks.push(block);
          emitted++;
        }
      }
    }
    return emitted;
  };
  walk(root);

  // Footnotes usually live outside the article container, in their own list at
  // the end of the document. Reader modes lose them precisely because they are
  // outside, so they are gathered on purpose rather than by luck.
  for (const fn of queryDeep(doc, '[role="doc-endnotes"] li,[role="doc-footnote"],.footnotes li')) {
    if (seen.has(fn) || root.contains(fn)) continue;
    seen.add(fn);
    const block = sourceBlock(fn, 'footnote', innerText(fn), { ref: fn.id || undefined });
    if (block) blocks.push(block);
  }

  const h1 = doc.querySelector('h1');
  const title = (h1 ? innerText(h1) : '') || (doc.title || '').trim();

  // Measured in characters of real prose rather than in block count, because a
  // single long essay paragraph is an article and a listing page of twenty
  // one-line teasers is not. Below the floor the honest answer is that this
  // page is not an article, and the caller says so instead of rendering a
  // confident-looking half-page.
  let prose = 0;
  for (const b of blocks) if (b.kind === 'paragraph') prose += b.text.length;
  const ok = prose >= 250;
  // Only worth looking when there is an article to continue from. On a page
  // that is not an article, a "next" link is just navigation.
  return { title, blocks, ok, root, next: ok ? findNext(doc, root) : undefined };
}
