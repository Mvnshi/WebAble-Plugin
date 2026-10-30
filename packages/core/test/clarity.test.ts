/**
 * ClarityView: the rules the reader is built to keep.
 *
 * The reader this replaces shipped untested, which is why nobody knew what it
 * did badly. The rule that matters most is the one about provenance, so it is
 * tested first and from both ends: a block cannot be constructed without a
 * pointer to a real node, and a model reply that invents structure is dropped
 * rather than shown.
 *
 * The rest is a corpus. Each fixture stands in for one of the page shapes a
 * reader has to survive, and each test states the promise rather than the
 * implementation. These are hand-built fixtures, not twenty saved pages: they
 * are faithful to the shapes they name, but they are not evidence about any
 * particular real site. Real-page behaviour was checked separately in a real
 * browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { FEATURE_MAP, nullProvider, type FeatureContext, type FeatureModule, type FeatureSetting } from '@webable/core';
import { extract, isDataTable } from '../src/clarity/extract';
import { sourceBlock, noteBlock, pathOf, nodeAt, isBlock } from '../src/clarity/blocks';
import { parseRepairs, applyRepairs, outlineOf } from '../src/clarity/repair';
import { resolveStandard, coerceEdit, standardVars, STANDARDS } from '../src/clarity/standard';
import { interpretLocal } from '../src/clarity/speech';

function dom(body: string): Document {
  return new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    pretendToBeVisual: true,
    url: 'https://example.com/article',
  }).window.document;
}

/** A paragraph long enough to clear the extractor's 25-character scoring gate,
 *  and long enough that two of them clear the 250 characters of prose below
 *  which a page is honestly not an article. */
const PARA = 'A real paragraph of article text that is long enough to score properly. '.repeat(3);

// ─── the rule that cannot be broken ─────────────────────────────────────────

// The user believes they are reading the page. A block with no source is a
// sentence nobody can trace back, so it must be impossible to make one.
test('a block cannot be built from a node that is not in the document', () => {
  const doc = dom('<article><p>Real</p></article>');
  const orphan = doc.createElement('p');
  orphan.textContent = 'Never appeared on the page';

  assert.equal(sourceBlock(orphan, 'paragraph', orphan.textContent || ''), null, 'a detached node yields no block');
  assert.equal(noteBlock(orphan, 'invented description'), null, 'and no generated note either');

  const real = doc.querySelector('p') as Element;
  const block = sourceBlock(real, 'paragraph', 'Real');
  assert.ok(block, 'a node that is really on the page does yield a block');
  assert.ok(block.sourcePath.length > 0, 'and it carries a path back to that node');
});

test('a block with empty text is refused, so nothing renders as a blank line of article', () => {
  const doc = dom('<article><p>   </p></article>');
  const p = doc.querySelector('p') as Element;
  assert.equal(sourceBlock(p, 'paragraph', '   '), null);
});

test('a source path resolves back to the node it came from', () => {
  const doc = dom('<article><h2>Heading</h2><p>Body</p></article>');
  const p = doc.querySelector('p') as Element;
  const path = pathOf(p);
  assert.equal(nodeAt(doc, path), p, 'the path round-trips');
  assert.equal(nodeAt(doc, '9/9/9'), null, 'a path that no longer matches resolves to nothing, not to a guess');
});

// The model may classify, order, group, label and describe. It may not author
// body content, and the protocol has no field that would let it.
test('a model reply that invents a block index is dropped rather than shown', () => {
  const reply = JSON.stringify([
    { i: 0, level: 3 },
    { i: 99, drop: true },
    { i: -1, kind: 'table' },
  ]);
  const repairs = parseRepairs(reply, 3);
  assert.equal(repairs.length, 1, 'only the block that actually exists survives');
  assert.equal(repairs[0].i, 0);
  assert.equal(repairs[0].level, 3);
});

test('a model reply carrying prose is stripped of it, because there is no field to put it in', () => {
  const reply = JSON.stringify([{ i: 0, text: 'A sentence the page never contained.', kind: 'paragraph' }]);
  const repairs = parseRepairs(reply, 1);
  assert.equal(repairs.length, 1);
  assert.equal((repairs[0] as unknown as Record<string, unknown>).text, undefined, 'the invented sentence is gone');
  assert.equal(repairs[0].kind, 'paragraph', 'the decision it was allowed to make survives');
});

test('a reclassified block keeps the page’s own words, not the model’s', () => {
  const doc = dom(`<article><div class="looks-like-a-heading">The Real Heading</div><p>${PARA}</p></article>`);
  const div = doc.querySelector('.looks-like-a-heading') as Element;
  const block = sourceBlock(div, 'paragraph', 'The Real Heading');
  assert.ok(block);
  const [repaired] = applyRepairs([block], [{ i: 0, kind: 'heading', level: 2 }]);
  assert.equal(repaired.kind, 'heading', 'the model may say what it is');
  assert.equal(repaired.text, 'The Real Heading', 'but the words are still the page’s');
  assert.equal(repaired.sourcePath, block.sourcePath, 'and it still points at the same node');
});

test('a described figure is marked as generated, so it can never be read as page content', () => {
  const doc = dom('<article><figure><img src="/x.png"></figure></article>');
  const fig = doc.querySelector('figure') as Element;
  const block = sourceBlock(fig, 'figure', ' ');
  assert.ok(block);
  const out = applyRepairs([block], [{ i: 0, describe: 'A bar chart of quarterly revenue' }]);
  const note = out.find((b) => b.generated);
  assert.ok(note, 'the description is added');
  assert.equal(note.generated, true, 'and it is flagged as generated');
  assert.ok(note.sourcePath, 'it is still anchored to the figure it describes');
});

test('malformed model output is dropped without taking the page down', () => {
  assert.deepEqual(parseRepairs('not json at all', 5), []);
  assert.deepEqual(parseRepairs('', 5), []);
  assert.deepEqual(parseRepairs('{"i":0}', 5), [], 'an object where an array was asked for is refused');
  assert.deepEqual(parseRepairs('[{"i":0}]', 5), [], 'a repair that decides nothing is not a repair');
});

test('the outline sent to the model carries snippets, never the article body', () => {
  const long = 'x'.repeat(4000);
  const doc = dom(`<article><p>${long}</p></article>`);
  const p = doc.querySelector('p') as Element;
  const block = sourceBlock(p, 'paragraph', long);
  assert.ok(block);
  const [line] = outlineOf([block]);
  assert.ok(line.s.length <= 90, `the snippet is capped, got ${line.s.length}`);
  assert.ok(JSON.stringify(outlineOf([block])).length < 300, 'so the whole outline stays small');
});

// ─── the skeleton ───────────────────────────────────────────────────────────

test('the first and last real sentence of an article both survive extraction', () => {
  const doc = dom(
    `<nav>Home About Contact</nav>
     <article>
       <h1>The Headline</h1>
       <p>FIRST SENTENCE of the article. ${PARA}</p>
       <p>${PARA}</p>
       <p>${PARA} LAST SENTENCE of the article.</p>
     </article>
     <footer>Copyright notice</footer>`,
  );
  const out = extract(doc);
  assert.ok(out.ok, 'this is recognised as an article');
  const text = out.blocks.map((b) => b.text).join(' ');
  assert.match(text, /FIRST SENTENCE/, 'the opening survives');
  assert.match(text, /LAST SENTENCE/, 'and so does the close');
});

test('navigation and footer text does not leak into the article', () => {
  const doc = dom(
    `<nav>Home About Contact</nav>
     <div class="sidebar"><a href="/a">Related story</a></div>
     <article><p>KEPT PROSE. ${PARA}</p><p>${PARA}</p></article>
     <footer>Copyright notice</footer>`,
  );
  const text = extract(doc)
    .blocks.map((b) => b.text)
    .join(' ');
  // The control, first and deliberately: a test that only proves an absence
  // passes just as happily when extraction returned nothing at all. This one
  // has to be able to see something before its absences mean anything.
  assert.match(text, /KEPT PROSE/, 'the article itself came through');
  assert.doesNotMatch(text, /Home About Contact/, 'the nav is gone');
  assert.doesNotMatch(text, /Copyright notice/, 'the footer is gone');
  assert.doesNotMatch(text, /Related story/, 'and so is the related-links rail');
});

test('a data table survives as a table, with its caption', () => {
  const doc = dom(
    `<article><p>${PARA}</p><p>${PARA}</p>
      <table><caption>Population by year</caption>
        <tr><th>Year</th><th>People</th></tr>
        <tr><td>1990</td><td>4,000</td></tr>
        <tr><td>2000</td><td>5,200</td></tr>
      </table></article>`,
  );
  const out = extract(doc);
  const table = out.blocks.find((b) => b.kind === 'table');
  assert.ok(table, 'the table is kept, which is the thing reader modes lose');
  assert.equal(table.caption, 'Population by year', 'and its caption comes with it');
});

test('a layout table becomes its contents rather than a one-cell grid', () => {
  const doc = dom(
    `<article><table role="presentation"><tr><td><p>${PARA}</p><p>${PARA}</p></td></tr></table></article>`,
  );
  const out = extract(doc);
  assert.equal(out.blocks.filter((b) => b.kind === 'table').length, 0, 'no table block');
  assert.ok(
    out.blocks.filter((b) => b.kind === 'paragraph').length >= 2,
    'but the paragraphs inside it are kept, because losing them is the real failure',
  );
});

test('a table is judged data or layout by its markings, not by its size', () => {
  const doc = dom('<div></div>');
  const make = (html: string) => {
    const holder = doc.querySelector('div') as Element;
    holder.innerHTML = html;
    return holder.firstElementChild as Element;
  };
  assert.equal(isDataTable(make('<table><tr><th>a</th></tr><tr><td>b</td></tr></table>')), true, 'a th means data');
  assert.equal(isDataTable(make('<table><caption>c</caption><tr><td>b</td></tr></table>')), true, 'so does a caption');
  assert.equal(isDataTable(make('<table role="presentation"><tr><td>b</td></tr></table>')), false, 'role wins');
  assert.equal(isDataTable(make('<table><tr><td><table><tr><td>x</td></tr></table></td></tr></table>')), false,
    'a table inside a table is scaffolding');
});

test('a figure keeps its caption, and an unlabelled one is left for stage two', () => {
  const doc = dom(
    `<article><p>${PARA}</p><p>${PARA}</p>
      <figure><img src="/a.png" alt=""><figcaption>Figure caption text</figcaption></figure>
      <figure><img src="/b.png" alt=""></figure></article>`,
  );
  const figures = extract(doc).blocks.filter((b) => b.kind === 'figure');
  assert.equal(figures.length, 2, 'both figures are kept');
  assert.equal(figures[0].caption, 'Figure caption text');
  assert.equal(figures[1].text.trim(), '', 'the unlabelled one carries no invented text');
});

test('a code block keeps its own whitespace, because that is its meaning', () => {
  const doc = dom(`<article><p>${PARA}</p><p>${PARA}</p><pre>function a() {\n  return 1;\n}</pre></article>`);
  const code = extract(doc).blocks.find((b) => b.kind === 'code');
  assert.ok(code, 'the code block survives');
  assert.match(code.text, /\n {2}return 1;/, 'indentation and newlines are intact');
});

// Found on a real blog, not in a fixture: every one of its 62 "figures" was a
// <pre> wrapped for styling. Read as figures they rendered as empty boxes and
// every line of code on the page was lost.
test('a figure that is really a wrapped code block is read as code, not as an empty figure', () => {
  const doc = dom(
    `<article><p>${PARA}</p><p>${PARA}</p>
      <figure><pre>const x = 1;\n  return x;</pre><figcaption>example.js</figcaption></figure></article>`,
  );
  const blocks = extract(doc).blocks;
  assert.equal(blocks.filter((b) => b.kind === 'figure').length, 0, 'it is not a figure');
  const code = blocks.find((b) => b.kind === 'code');
  assert.ok(code, 'it is code');
  assert.match(code.text, /const x = 1;\n {2}return x;/, 'with its indentation intact');
  assert.equal(code.caption, 'example.js', 'and the caption the page gave it');
});

// Found on MDN, which renders its code examples inside web components. A walk
// that stops at the shadow boundary reports a page with no code on it.
test('content inside an open shadow root is extracted, and carries a resolvable path', () => {
  const doc = dom(`<article><p>${PARA}</p><p>${PARA}</p><div id="host"></div></article>`);
  const host = doc.getElementById('host') as HTMLElement;
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<pre>inside a component</pre><p>Shadow prose that is long enough to count.</p>';

  const blocks = extract(doc).blocks;
  const code = blocks.find((b) => b.kind === 'code');
  assert.ok(code, 'the component’s code block is found');
  assert.match(code.text, /inside a component/);
  assert.ok(
    blocks.some((b) => b.text.includes('Shadow prose')),
    'and so is its prose',
  );
  // Provenance has to survive the boundary too, or the block could not exist.
  assert.ok(code.sourcePath.includes('s'), 'the path records where it crossed into the shadow root');
  assert.equal(nodeAt(doc, code.sourcePath), shadow.querySelector('pre'), 'and it resolves back to the real node');
});

// Found on Wikipedia, which renders each section's edit affordance as a span
// nested inside a link. Descending into the link found the inner span, saw no
// link inside THAT, and emitted the word "edit" as a paragraph. Sixty-nine of
// them on one article, plus every hatnote link as a stray line above the lede.
test('a link is inline, so its text joins its paragraph instead of becoming one', () => {
  const doc = dom(
    `<article>
       <h2>Definition</h2><span class="editsection"><a href="/edit"><span>edit</span></a></span>
       <div>Body text that runs on for a while and <a href="/x">carries a link</a> inside it, as prose does.</div>
       <p>${PARA}</p><p>${PARA}</p>
     </article>`,
  );
  const blocks = extract(doc).blocks;
  const texts = blocks.map((b) => b.text);
  assert.ok(texts.some((t) => t.includes('carries a link')), 'the linked words stay with their paragraph');
  assert.ok(!texts.includes('edit'), 'and the edit affordance is not a paragraph of its own');
  assert.equal(
    blocks.filter((b) => b.text.trim() === 'carries a link').length,
    0,
    'the link did not also become a block in its own right',
  );
});

// Found on Substack, which names every section heading `header-anchor-post`.
// That contains "header", which is in Readability's unlikely-candidate list, so
// judging a leaf by its class deleted all five section headings on the article
// and left it as one undivided run of prose.
test('a heading is a heading because of its tag, whatever the site calls its class', () => {
  const doc = dom(
    `<article>
       <h2 class="header-anchor-post">Introduction</h2>
       <p>${PARA}</p>
       <h2 class="comment-header sidebar-ish">What Is Hope?</h2>
       <p>${PARA}</p>
     </article>`,
  );
  const blocks = extract(doc).blocks;
  const headings = blocks.filter((b) => b.kind === 'heading').map((b) => b.text);
  assert.deepEqual(headings, ['Introduction', 'What Is Hope?'], 'both survive their unlucky class names');
});

// The class heuristic still has to work where it belongs, on containers.
test('a container that looks like page furniture is still not walked into', () => {
  const doc = dom(
    `<article><p>KEPT. ${PARA}</p><p>${PARA}</p>
      <div class="related"><h2>More from us</h2><p>A teaser for another story entirely.</p></div>
     </article>`,
  );
  const text = extract(doc)
    .blocks.map((b) => b.text)
    .join(' ');
  assert.match(text, /KEPT/, 'the article came through');
  assert.doesNotMatch(text, /More from us/, 'and the related rail did not');
});

// Found on the Python docs, which write a heading as
// `<span>9. </span>Classes<a href="#classes">the pilcrow</a>`. Two bugs in one
// line: the permalink glyph is not part of the heading, and trimming each
// inline child before joining glued the section number to the title.
test('a heading keeps its spacing and loses the permalink glyph', () => {
  const doc = dom(
    `<article>
       <h2 id="classes"><span class="section-number">9. </span>Classes<a class="headerlink" href="#classes">¶</a></h2>
       <p>${PARA}</p><p>${PARA}</p>
     </article>`,
  );
  const heading = extract(doc).blocks.find((b) => b.kind === 'heading');
  assert.ok(heading);
  assert.equal(heading.text, '9. Classes', 'the number keeps its space and the pilcrow is gone');
});

test('a same-page link that is a real word is still kept', () => {
  // The permalink rule keys on having no letters or digits, so a footnote
  // marker or an in-page cross-reference must not be caught by it.
  const doc = dom(
    `<article><p>See <a href="#note-1">note 1</a> for detail. ${PARA}</p><p>${PARA}</p></article>`,
  );
  const text = extract(doc)
    .blocks.map((b) => b.text)
    .join(' ');
  assert.match(text, /See note 1 for detail/, 'the words of a same-page link stay in the sentence');
});

test('a stylesheet inlined mid-article is never read as prose', () => {
  // Wikipedia does exactly this, per article. Reading textContent flat put
  // `.mw-parser-output .navbox{display:none!important}` on screen as a sentence.
  const doc = dom(
    `<article><p>REAL PROSE. ${PARA}</p><p>${PARA}</p>
      <div><style>.navbox{display:none!important}</style></div></article>`,
  );
  const text = extract(doc)
    .blocks.map((b) => b.text)
    .join(' ');
  assert.match(text, /REAL PROSE/, 'the article came through');
  assert.doesNotMatch(text, /display:none/, 'and the stylesheet did not');
});

test('footnotes are gathered even when they live outside the article', () => {
  const doc = dom(
    `<article><p>${PARA}</p><p>${PARA}</p></article>
     <div class="footnotes"><li id="fn1">The first note.</li><li id="fn2">The second note.</li></div>`,
  );
  const notes = extract(doc).blocks.filter((b) => b.kind === 'footnote');
  assert.equal(notes.length, 2, 'both notes are collected, which reader modes routinely drop');
  assert.match(notes[0].text, /first note/);
});

test('a pull quote and a definition list are kept as themselves', () => {
  const doc = dom(
    `<article><p>${PARA}</p><p>${PARA}</p>
      <blockquote><p>A quoted line.</p></blockquote>
      <dl><dt>Term</dt><dd>Definition</dd></dl></article>`,
  );
  const kinds = extract(doc).blocks.map((b) => b.kind);
  assert.ok(kinds.includes('quote'), 'the quote keeps its kind');
  assert.ok(kinds.includes('definitions'), 'and so does the definition list');
});

test('an article whose headings are styled divs still extracts its prose', () => {
  const doc = dom(
    `<article>
       <div class="h">Looks like a heading</div>
       <p>${PARA}</p><p>${PARA}</p>
     </article>`,
  );
  const out = extract(doc);
  assert.ok(out.ok, 'the article is found');
  // The skeleton does not guess the level; that is stage two's job, and a
  // wrong guess made deterministically is one nobody can correct.
  assert.equal(out.blocks.filter((b) => b.kind === 'heading').length, 0, 'no level is invented');
  assert.ok(out.blocks.some((b) => b.text.includes('Looks like a heading')), 'but the text is not lost');
});

test('a page that is mostly adverts is reported as having no article', () => {
  const junk = `<div class="ad-break">Buy now</div><div class="promo">Sponsored</div>
     <div class="sidebar"><a href="/x">Link</a><a href="/y">Link</a></div>`;
  // The control: the same shell with a real article in it must come back ok,
  // or "not an article" is just the extractor being broken.
  assert.equal(extract(dom(`${junk}<article><p>${PARA}</p><p>${PARA}</p></article>`)).ok, true,
    'the same page shape with real prose in it IS an article');
  assert.equal(extract(dom(`${junk}<p>Short.</p>`)).ok, false,
    'without it, the reader says so rather than rendering a confident-looking half-page');
});

test('a right-to-left article extracts the same way a left-to-right one does', () => {
  const arabic = 'هذا نص عربي طويل بما فيه الكفاية للقياس، ويحتوي على فواصل، وجمل متعددة. ';
  const doc = dom(`<article dir="rtl"><p>${arabic.repeat(3)}</p><p>${arabic.repeat(3)}</p></article>`);
  const out = extract(doc);
  assert.ok(out.ok, 'Arabic prose scores as prose');
  assert.ok(out.blocks.length >= 2, 'and its paragraphs are kept');
});

test('the title comes from the page, and falls back to the document title', () => {
  const withH1 = dom(`<article><h1>The Headline</h1><p>${PARA}</p><p>${PARA}</p></article>`);
  assert.equal(extract(withH1).title, 'The Headline');
  const noH1 = dom(`<article><p>${PARA}</p><p>${PARA}</p></article>`);
  noH1.title = 'Fallback Title';
  assert.equal(extract(noH1).title, 'Fallback Title');
});

// The rule: a paginated article says where it continues.
//
// Reader modes drop this silently, so you get part one, formatted beautifully,
// with no sign that parts two onward exist. The brief lists multi-page article
// links among the things to keep.
test('a paginated article carries the link to its next page', () => {
  const doc = dom(
    `<article><p>${PARA}</p><p>${PARA}</p></article>
     <nav class="pagination"><a href="/story/2">Next</a></nav>`,
  );
  const out = extract(doc);
  assert.ok(out.next, 'the continuation is found');
  assert.match(out.next.href, /\/story\/2$/);
  assert.equal(out.next.label, 'Next');
});

test('rel="next" is taken on its own, because it is unambiguous', () => {
  const doc = dom(`<article><p>${PARA}</p><p>${PARA}</p></article><a rel="next" href="/part-two">Keep going</a>`);
  assert.match(extract(doc).next?.href || '', /\/part-two$/);
});

// The false positives are what matter here: a "Continue" that goes somewhere
// unrelated is a broken promise, whereas no link is just what every other
// reader mode does.
test('an ordinary "More" in a menu is not mistaken for a continuation', () => {
  const doc = dom(
    `<article><p>${PARA}</p><p>${PARA}</p></article>
     <nav class="site-menu"><a href="/more">More</a><a href="/next-steps">Next steps</a></nav>`,
  );
  assert.equal(extract(doc).next, undefined, 'a menu is not a pager');
});

test('a cross-origin next link is refused, because it leaves the article', () => {
  const doc = dom(
    `<article><p>${PARA}</p><p>${PARA}</p></article>
     <div class="pagination"><a href="https://elsewhere.example/story">Next</a></div>`,
  );
  assert.equal(extract(doc).next, undefined);
});

test('a page with no article looks for no continuation', () => {
  const doc = dom('<p>Short.</p><nav class="pagination"><a href="/2">Next</a></nav>');
  const out = extract(doc);
  assert.equal(out.ok, false);
  assert.equal(out.next, undefined, 'on a non-article a "next" link is just navigation');
});

test('the continuation is rendered as navigation the reader can follow', () => {
  const doc = dom(
    `<article><h1>Part One</h1><p>${PARA}</p><p>${PARA}</p></article>
     <nav class="pagination"><a href="/story/2">Next</a></nav>`,
  );
  applyReader(doc);
  const link = doc.getElementById('wa-reader')?.querySelector('.cv-next') as HTMLAnchorElement | null;
  assert.ok(link, 'the reader shows where the article continues');
  assert.match(link.getAttribute('href') || '', /\/story\/2$/);
  assert.equal(link.getAttribute('rel'), 'next');
});

// ─── the Standard ───────────────────────────────────────────────────────────

test('the starting standards are real and distinct, so the first run is not an empty form', () => {
  assert.ok(STANDARDS.length >= 3, 'there are several to start from');
  const ids = STANDARDS.map((s) => s.id);
  assert.deepEqual([...new Set(ids)], ids, 'the ids are unique');
  const study = STANDARDS.find((s) => s.id === 'study');
  const plain = STANDARDS.find((s) => s.id === 'plain');
  assert.ok(study && plain);
  assert.equal(study.outline, true, 'study makes structure loud');
  assert.equal(study.numbered, true);
  assert.equal(plain.outline, false, 'plain makes it quiet and uniform');
  assert.ok(plain.lineHeight > study.lineHeight, 'and gives it more air');
});

// The panel control lists the presets by id. It is written out rather than
// mapped so the widget's stub does not have to ship the preset table, which
// means a literal that could drift. This is the test that will not let it.
test('the reader’s Standard control offers exactly the standards that exist', () => {
  const reader = FEATURE_MAP.get('readerMode') as FeatureModule;
  const control = reader.meta.controls?.find((c) => c.key === 'standard');
  assert.ok(control, 'the control exists');
  const offered = (control.options || []).map((o) => o.value);
  assert.deepEqual(offered, STANDARDS.map((s) => s.id), 'every offered id is a real preset, and none is missing');
});

test('an unknown or wrong-typed saved edit is ignored rather than trusted', () => {
  const base = resolveStandard('article');
  const out = resolveStandard('article', JSON.stringify({ size: 26, nonsense: 1, measure: 'wide' }));
  assert.equal(out.size, 26, 'a valid edit is taken');
  assert.equal(out.measure, base.measure, 'a wrong-typed one is refused');
  assert.equal((out as unknown as Record<string, unknown>).nonsense, undefined, 'an unknown key never gets in');
});

test('corrupt saved settings fall back to the preset instead of breaking the reader', () => {
  const base = resolveStandard('article');
  assert.deepEqual(resolveStandard('article', '{not json'), base);
  assert.deepEqual(resolveStandard('no-such-preset'), STANDARDS[0], 'an unknown preset falls back too');
});

test('a spoken value is clamped to the schema rather than refused outright', () => {
  const base = resolveStandard('article');
  assert.equal(coerceEdit('size', 999, base), 40, 'much bigger means as big as the schema allows');
  assert.equal(coerceEdit('size', 2, base), 12);
  assert.equal(coerceEdit('bogusField', 1, base), undefined, 'a field the schema does not have is refused');
});

// A type-scale change has to be visible in a diff, or nobody can review one.
test('the Standard renders to custom properties, so a type change shows up as data', () => {
  const article = standardVars(resolveStandard('article'));
  const plain = standardVars(resolveStandard('plain'));
  assert.match(article, /--cv-size:20px/);
  assert.match(plain, /--cv-size:22px/);
  assert.match(plain, /--cv-measure:58ch/);
  assert.notEqual(article, plain, 'two standards produce two different variable sets');
});

test('density scales the rhythm without touching the type size', () => {
  const compact = standardVars(resolveStandard('article', JSON.stringify({ density: 'compact' })));
  const generous = standardVars(resolveStandard('article', JSON.stringify({ density: 'generous' })));
  assert.match(compact, /--cv-size:20px/, 'the type size is untouched');
  assert.match(generous, /--cv-size:20px/);
  const gap = (s: string) => Number(/--cv-para-gap:([\d.]+)em/.exec(s)?.[1]);
  assert.ok(gap(generous) > gap(compact), 'but the spacing moves');
});

// ─── talking to it ──────────────────────────────────────────────────────────

test('the common adjustments work with no key and no network', () => {
  const base = resolveStandard('article');
  const bigger = interpretLocal('make the text bigger', base);
  assert.ok(bigger, 'no model was needed');
  assert.equal(bigger.patch.size, base.size + 2);
  assert.equal(bigger.undo.size, base.size, 'and it is reversible in one step');

  assert.equal(interpretLocal('too wide', base)?.patch.measure, base.measure - 8);
  assert.equal(interpretLocal('get rid of the images', base)?.patch.dropImages, true);
  // From a Standard that stacks tables, asking to keep them is a real change.
  const stacked = resolveStandard('plain');
  assert.equal(interpretLocal('keep the tables', stacked)?.patch.tables, 'table');
});

test('an adjustment that asks for what is already true changes nothing', () => {
  // Not a no-op for its own sake: it is what stops the one-step undo being
  // spent on a request that did not move anything.
  const base = resolveStandard('article');
  assert.equal(base.tables, 'table');
  assert.equal(interpretLocal('keep the tables', base), null);
});

test('an adjustment edits the standard unless the reader says "just here"', () => {
  const base = resolveStandard('article');
  assert.equal(interpretLocal('make the text bigger', base)?.pageOnly, false, 'the point is that it persists');
  assert.equal(interpretLocal('make the text bigger, just here', base)?.pageOnly, true);
});

test('a spoken adjustment can never reach past the fields the schema declares', () => {
  const base = resolveStandard('article');
  // Every rule's output goes through coerceEdit, so even a rule that tried to
  // set something arbitrary could not.
  const out = interpretLocal('switch to dark', base);
  assert.ok(out);
  for (const key of Object.keys(out.patch)) {
    assert.notEqual(coerceEdit(key, (out.patch as Record<string, unknown>)[key], base), undefined,
      `${key} is a declared field`);
  }
});

test('a request that is not about appearance changes nothing', () => {
  const base = resolveStandard('article');
  // Control first: the same interpreter must be capable of returning something.
  assert.ok(interpretLocal('make the text bigger', base), 'the interpreter is working');
  assert.equal(interpretLocal('what is the capital of France', base), null, 'and it still declines this');
});

// ─── the feature, end to end ────────────────────────────────────────────────

/** A FeatureContext good enough to apply one feature in isolation. */
function ctxFor(doc: Document): FeatureContext {
  const cleanups: Array<() => void> = [];
  return {
    doc,
    win: doc.defaultView as Window,
    html: doc.documentElement as HTMLElement,
    get body() {
      return doc.body as HTMLElement;
    },
    injectCSS() {},
    removeCSS() {},
    setFlag(flag: string, on: boolean) {
      if (on) doc.documentElement.setAttribute(`data-webable-${flag}`, '');
      else doc.documentElement.removeAttribute(`data-webable-${flag}`);
    },
    setVar() {},
    own<T>(n: T) {
      return n;
    },
    on(target: EventTarget, type: string, handler: EventListenerOrEventListenerObject) {
      target.addEventListener(type, handler);
      cleanups.push(() => target.removeEventListener(type, handler));
    },
    store: {},
    onCleanup(fn: () => void) {
      cleanups.push(fn);
    },
    disableSelf() {},
    provider: nullProvider,
    tts: { getState: () => ({}) } as unknown as FeatureContext['tts'],
    framed: false,
  } as unknown as FeatureContext;
}

function applyReader(doc: Document, patch: Partial<FeatureSetting> = {}) {
  const f = FEATURE_MAP.get('readerMode') as FeatureModule;
  const ctx = ctxFor(doc);
  f.apply({ ...f.defaults, active: true, ...patch } as FeatureSetting, ctx);
  return { f, ctx };
}

test('the reader renders the article, and the original page is left underneath', () => {
  const doc = dom(`<article><h1>The Headline</h1><p>${PARA}</p><p>${PARA}</p></article>`);
  applyReader(doc);

  const overlay = doc.getElementById('wa-reader');
  assert.ok(overlay, 'the reader is up');
  assert.match(overlay.querySelector('.wa-reader-title')?.textContent || '', /The Headline/, 'the title is the page’s');
  assert.match(overlay.textContent || '', /real paragraph of article text/, 'and so is the body');
  assert.ok(doc.querySelector('article'), 'the page itself is untouched, so leaving is instant');
});

test('nothing executable is carried into the reader', () => {
  const doc = dom(
    `<article><p>${PARA}</p><p>${PARA}</p>
      <p><a href="javascript:alert(1)">click</a> and <a href="https://ok.example">fine</a></p>
      <script>window.x=1</script></article>`,
  );
  applyReader(doc);
  const overlay = doc.getElementById('wa-reader') as HTMLElement;
  const hrefs = Array.from(overlay.querySelectorAll('a')).map((a) => a.getAttribute('href'));
  // The control comes first: prove the reader rendered links at all, otherwise
  // "no javascript: href" is satisfied by an empty document.
  assert.ok(hrefs.includes('https://ok.example'), 'ordinary links came through');
  assert.equal(overlay.querySelector('script'), null, 'scripts never cross');
  assert.ok(!hrefs.some((h) => (h || '').startsWith('javascript:')), 'and neither do javascript: hrefs');
});

test('the reader hides the original page from assistive tech, and gives it back', () => {
  const doc = dom(`<article><p>${PARA}</p><p>${PARA}</p></article>`);
  const { f, ctx } = applyReader(doc);
  assert.equal(doc.body.getAttribute('aria-hidden'), 'true', 'the page is hidden while the reader is up');
  assert.equal(doc.body.hasAttribute('inert'), true, 'and out of the tab order');
  f.disable(ctx);
  assert.equal(doc.body.hasAttribute('aria-hidden'), false, 'given back on disable');
  assert.equal(doc.body.hasAttribute('inert'), false);
});

test('a page that had already hidden its own body is left exactly as found', () => {
  const doc = dom(`<article><p>${PARA}</p><p>${PARA}</p></article>`);
  doc.body.setAttribute('aria-hidden', 'true');
  const { f, ctx } = applyReader(doc);
  f.disable(ctx);
  assert.equal(doc.body.getAttribute('aria-hidden'), 'true', 'restored to what the site had, not to nothing');
});

test('a page with no article says so instead of rendering half of one', () => {
  const doc = dom('<div class="promo">Buy</div><p>Short.</p>');
  applyReader(doc);
  const overlay = doc.getElementById('wa-reader') as HTMLElement;
  assert.match(overlay.textContent || '', /No article found/, 'it is honest about failing');
  assert.match(overlay.textContent || '', /unchanged/, 'and it offers the page back');
});

// A change to type or colour cannot change which blocks exist, so it must not
// cost a rebuild: that is what makes "make the text bigger" feel instant and
// what stops it throwing away the reader's scroll position.
test('a change to type restyles in place rather than rebuilding the document', () => {
  const doc = dom(`<article><h1>T</h1><p>${PARA}</p><p>${PARA}</p></article>`);
  const f = FEATURE_MAP.get('readerMode') as FeatureModule;
  const ctx = ctxFor(doc);
  f.apply({ ...f.defaults, active: true } as FeatureSetting, ctx);
  const first = doc.getElementById('wa-reader') as HTMLElement;
  assert.match(first.getAttribute('style') || '', /--cv-size:20px/);

  f.apply({ ...f.defaults, active: true, custom: '{"size":26}' } as FeatureSetting, ctx);
  const after = doc.getElementById('wa-reader') as HTMLElement;
  assert.equal(after, first, 'the same node is still there, so the reader keeps its place');
  assert.match(after.getAttribute('style') || '', /--cv-size:26px/, 'but it is wearing the new Standard');
});

// A change to what is kept does have to rebuild, because the blocks differ.
test('a change to structure rebuilds, and the new document reflects it', () => {
  const doc = dom(
    `<article><h1>T</h1><p>${PARA}</p><p>${PARA}</p>
      <figure><img src="/a.png" alt=""><figcaption>A caption</figcaption></figure></article>`,
  );
  const f = FEATURE_MAP.get('readerMode') as FeatureModule;
  const ctx = ctxFor(doc);
  f.apply({ ...f.defaults, active: true } as FeatureSetting, ctx);
  assert.ok(doc.getElementById('wa-reader')?.querySelector('img'), 'the figure is shown to begin with');

  f.apply({ ...f.defaults, active: true, custom: '{"dropImages":true}' } as FeatureSetting, ctx);
  assert.equal(doc.getElementById('wa-reader')?.querySelector('img'), null, 'and dropped when the Standard says so');
  assert.equal(doc.querySelectorAll('#wa-reader').length, 1, 'with exactly one reader left behind');
});

// The rule: a route change means the page under us was replaced. The old
// reader held an article that no longer existed and stayed wrong until reload.
test('an SPA route change rebuilds the reader against the new page', () => {
  const doc = dom(`<article><h1>First</h1><p>FIRST ARTICLE. ${PARA}</p><p>${PARA}</p></article>`);
  const f = FEATURE_MAP.get('readerMode') as FeatureModule;
  const ctx = ctxFor(doc);
  f.apply({ ...f.defaults, active: true } as FeatureSetting, ctx);
  assert.match(doc.getElementById('wa-reader')?.textContent || '', /FIRST ARTICLE/);

  // The route changes and the page is replaced under the reader.
  doc.body.innerHTML = `<article><h1>Second</h1><p>SECOND ARTICLE. ${PARA}</p><p>${PARA}</p></article>`;
  doc.defaultView?.history.pushState({}, '', '/second');
  f.apply({ ...f.defaults, active: true } as FeatureSetting, ctx);

  const text = doc.getElementById('wa-reader')?.textContent || '';
  assert.match(text, /SECOND ARTICLE/, 'the new article is showing');
  assert.doesNotMatch(text, /FIRST ARTICLE/, 'and the one that no longer exists is gone');
});

// The rule: a reader that opened before the article existed has to notice when
// it arrives.
//
// The content script runs at document_start and the engine applies features as
// soon as storage resolves, which on a JS-rendered site is routinely before the
// article is in the DOM. `readerMode` is deliberately not `meta.dynamic`,
// because re-extracting on every mutation would rebuild the document under
// someone who is reading it. So nothing else is going to come back for this: if
// the first look finds nothing, the reader has to recover on its own or it says
// "no article" for as long as the page is open, on a page that has one.
test('a reader opened before the article hydrates picks it up when it arrives', async () => {
  const doc = dom('<div id="app"></div>');
  const { ctx } = applyReader(doc);
  assert.match(
    doc.getElementById('wa-reader')?.textContent || '',
    /No article found/,
    'with an empty shell it is honest about finding nothing',
  );

  (doc.getElementById('app') as HTMLElement).innerHTML =
    `<article><h1>The Headline</h1><p>${PARA}</p><p>${PARA}</p></article>`;
  // Past the watcher's 150ms settle, and with no re-apply from the engine:
  // nothing but the reader's own recovery is going to do this.
  await new Promise((r) => setTimeout(r, 300));

  const text = doc.getElementById('wa-reader')?.textContent || '';
  assert.match(text, /The Headline/, 'the article it was waiting for is now on screen');
  assert.doesNotMatch(text, /No article found/, 'and the failure surface is gone');
  assert.equal(doc.querySelectorAll('#wa-reader').length, 1, 'with one reader, not two');
  void ctx;
});

test('applying twice on the same page does not build two readers', () => {
  const doc = dom(`<article><p>${PARA}</p><p>${PARA}</p></article>`);
  const f = FEATURE_MAP.get('readerMode') as FeatureModule;
  const ctx = ctxFor(doc);
  const setting = { ...f.defaults, active: true } as FeatureSetting;
  f.apply(setting, ctx);
  f.apply(setting, ctx);
  assert.equal(doc.querySelectorAll('#wa-reader').length, 1, 'apply is idempotent');
});

test('a block survives the trust boundary check, an arbitrary object does not', () => {
  const doc = dom('<article><p>Real</p></article>');
  const block = sourceBlock(doc.querySelector('p') as Element, 'paragraph', 'Real');
  assert.equal(isBlock(block), true);
  assert.equal(isBlock({ kind: 'paragraph', text: 'Invented' }), false, 'no source path, not a block');
  assert.equal(isBlock({ kind: 'paragraph', text: 'Invented', sourcePath: '' }), false, 'an empty path is not one either');
});
