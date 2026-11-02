/**
 * Nothing this engine does used to cross a shadow boundary, so any site built
 * out of web components was untreated inside its components: no larger text, no
 * spacing, no focus ring, no bigger click targets. Silently, because a document
 * stylesheet simply does not apply in there.
 *
 * The fix is to adopt the same rules into each open shadow root, and the whole
 * difficulty is that every rule the engine writes is gated on a flag on <html>,
 * which is unreachable from inside a shadow root. An unrewritten copy of the
 * sheet matches nothing at all, which is a no-op that looks like a fix.
 *
 * These tests state what the rewrite must do, and then check that a real
 * component on a real page actually ends up with the rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { shadowScopedCSS, createEngine, memoryAdapter } from '@webable/core';

function html(attrs: string[] = []): Element {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { pretendToBeVisual: true });
  const el = dom.window.document.documentElement;
  for (const a of attrs) el.setAttribute(a, '');
  return el;
}

test('an open gate is evaluated here and then stripped, because a shadow root cannot see <html>', () => {
  const el = html(['data-webable-readable']);
  assert.equal(
    shadowScopedCSS('html[data-webable-readable] :where(p,li){font-family:X !important}', el),
    ':where(p,li){font-family:X !important}',
    'the gate is removed and the content half survives',
  );
});

test('a closed gate drops the rule, so the sheet only ever holds what is on', () => {
  // The gate is what makes a feature reversible. Keeping the rule and losing
  // the gate would mean a feature that can be turned on inside components and
  // never off.
  const el = html([]);
  assert.equal(shadowScopedCSS('html[data-webable-readable] :where(p){font-family:X}', el), '');
});

test('body is stripped as well, because a shadow root is not inside it either', () => {
  const el = html(['data-webable-colors']);
  assert.equal(
    shadowScopedCSS('html[data-webable-colors] body :where(div,section){color:red}', el),
    ':where(div,section){color:red}',
  );
});

test('a rule aimed at <html> or <body> themselves is dropped rather than un-anchored', () => {
  // The font-size scale sets `html{font-size:...}`, which shadow content
  // already inherits through rem. Stripping the anchor would turn it into a
  // bare `{...}`, and dark mode's backdrop would repaint every component.
  const el = html(['data-webable-fontsize', 'data-webable']);
  assert.equal(shadowScopedCSS('html[data-webable-fontsize]{font-size:2em}', el), '');
  assert.equal(shadowScopedCSS('html[data-webable] body{filter:invert(1)}', el), '');
});

test('a comma inside :is() and a space inside :where() are not selector punctuation', () => {
  // The re-invert rule is exactly this shape, and a naive split on commas or
  // whitespace mangles it into something that matches nothing.
  const el = html(['data-webable-reinvert-dark']);
  assert.equal(
    shadowScopedCSS(
      'html:is([data-webable-reinvert],[data-webable-reinvert-dark]) body :where(img,video,svg image){filter:invert(1)}',
      el,
    ),
    ':where(img,video,svg image){filter:invert(1)}',
    'media inside a component is flipped back too',
  );
});

test('a space inside an attribute selector is not a combinator either', () => {
  const el = html(['data-webable-declutter']);
  assert.equal(
    shadowScopedCSS('html[data-webable-declutter] :where([aria-label*="advertisement" i]){display:none}', el),
    ':where([aria-label*="advertisement" i]){display:none}',
  );
});

test('a selector list keeps the parts whose gate is open and drops the rest', () => {
  const el = html(['data-webable-cursor']);
  assert.equal(
    shadowScopedCSS('html[data-webable-cursor],html[data-webable-cursor] *{cursor:X}', el),
    '*{cursor:X}',
    'the <html> half is dropped, the descendant half survives',
  );
});

test('@media is carried through, and @font-face is not duplicated into every root', () => {
  // A font face registers against the document and shadow content resolves it
  // by name from there, so copying it into two hundred roots is bytes for
  // nothing. A media query genuinely gates the rules inside it.
  const el = html(['data-webable-focusmode']);
  assert.equal(
    shadowScopedCSS(
      '@font-face{font-family:OpenDyslexic;src:url(x.woff2)}\nhtml[data-webable-focusmode] :where(p){opacity:.25}',
      el,
    ),
    ':where(p){opacity:.25}',
  );
  assert.equal(
    shadowScopedCSS('@media (prefers-reduced-motion:reduce){html[data-webable-focusmode] :where(p){transition:none}}', el),
    '@media (prefers-reduced-motion:reduce){:where(p){transition:none}}',
  );
});

test('@media whose every rule is gated shut collapses instead of shipping an empty block', () => {
  const el = html([]);
  assert.equal(
    shadowScopedCSS('@media (prefers-reduced-motion:reduce){html[data-webable-focusmode] :where(p){transition:none}}', el),
    '',
  );
});

// ---------------------------------------------------------------------------

function page(): Document {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><p>light</p><my-card></my-card></body></html>',
    { pretendToBeVisual: true },
  );
  const doc = dom.window.document;
  const host = doc.querySelector('my-card')!;
  host.attachShadow({ mode: 'open' }).innerHTML = '<h2>Inside</h2><p>shadow copy</p><a href="#">link</a>';
  return doc;
}

/** What the engine put into this shadow root, whichever mechanism it used. */
function adopted(doc: Document): string {
  const root = doc.querySelector('my-card')!.shadowRoot!;
  const el = root.querySelector('style[data-webable="shadow"]');
  return el ? el.textContent || '' : '';
}

test('a real component gets the rules, and gets them taken away again', async () => {
  const doc = page();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;

  assert.equal(adopted(doc), '', 'nothing is pushed into a component before anything is turned on');

  engine.toggleFeature('highlightLinks', true);
  assert.match(adopted(doc), /a\[href\]/, 'the link rule reached the component');
  assert.doesNotMatch(adopted(doc), /html\[/, 'and it is not still waiting on a flag it cannot see');

  engine.toggleFeature('highlightLinks', false);
  assert.equal(adopted(doc), '', 'turning it off empties the sheet in there too');
  engine.destroy();
});

test('a component that renders later still gets them', async () => {
  // The common case on a real page: components upgrade after first paint, and
  // an SPA route change replaces the lot. Driven through the engine's real
  // MutationObserver rather than by calling the rescan directly, because the
  // question is whether anything ever calls it.
  const doc = page();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('clickTargets', true);

  const late = doc.createElement('late-card');
  doc.body.appendChild(late);
  late.attachShadow({ mode: 'open' }).innerHTML = '<button>press</button>';

  await new Promise((r) => setTimeout(r, 400));
  assert.match(
    late.shadowRoot!.querySelector('style[data-webable="shadow"]')?.textContent || '',
    /min-height/,
    'the late component has the rules',
  );
  engine.destroy();
});

test('the panel is never restyled by the page treatment it is being used to set', async () => {
  const doc = page();
  const host = doc.createElement('div');
  // Every piece of WebAble's own UI carries this attribute.
  host.setAttribute('data-webable', 'host');
  doc.documentElement.appendChild(host);
  host.attachShadow({ mode: 'open' }).innerHTML = '<button>Hide images</button>';

  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('hideImages', true);

  assert.equal(
    host.shadowRoot!.querySelector('style[data-webable="shadow"]'),
    null,
    'hide-images must not hide the icons in the panel that turns it off',
  );
  engine.destroy();
});

test('headings inside a component are tagged, or the adopted label rule prints nothing', async () => {
  // The rule draws `content:attr(data-wa-tag)`. Adopting it without the pass
  // that sets the attribute gives every shadow heading an outline and an empty
  // label, which is worse than leaving them alone.
  const doc = page();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;

  engine.toggleFeature('highlightHeadings', true);
  const h = doc.querySelector('my-card')!.shadowRoot!.querySelector('h2')!;
  assert.equal(h.getAttribute('data-wa-tag'), 'H2', 'the heading in the component is labelled');

  engine.toggleFeature('highlightHeadings', false);
  assert.equal(h.hasAttribute('data-wa-tag'), false, 'and cleaned up again');
  engine.destroy();
});

test('the cookie reject click reaches a button inside the CMP\'s shadow root', async () => {
  // Several of the named consent managers render their dialog into a shadow
  // root; usercentrics is the clearest. The outer selector found the host, so
  // hiding the banner always worked, while the inner query returned nothing, so
  // "Click reject" silently did nothing on exactly the CMPs it names by id.
  //
  // Opt-in throughout: the default hides and submits nothing, and the click is
  // still confined to CMP_KNOWN. Reaching deeper does not widen WHICH banners
  // may be clicked, only whether the named ones can be reached at all.
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="usercentrics-root"></div><p>page</p></body></html>',
    { pretendToBeVisual: true },
  );
  const doc = dom.window.document;
  const host = doc.getElementById('usercentrics-root')!;
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<div><p>We value your privacy and would never reject your data.</p>' +
    '<button id="accept">Accept all</button><button id="deny">Deny all</button></div>';

  let clicked = '';
  for (const id of ['accept', 'deny']) {
    root.querySelector(`#${id}`)!.addEventListener('click', () => {
      clicked = id;
    });
  }

  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.setFeature('cookieKill', { active: true, reject: true });

  assert.equal(clicked, 'deny', 'the reject button inside the shadow root was the one pressed');
  engine.destroy();
});

test('hiding a banner never presses anything, shadow root or not', () => {
  // The half that must not change. Hiding is a display preference; clicking is
  // a consent choice recorded against the user, and reaching into shadow roots
  // must not blur that line.
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="usercentrics-root"></div></body></html>',
    { pretendToBeVisual: true },
  );
  const doc = dom.window.document;
  const root = doc.getElementById('usercentrics-root')!.attachShadow({ mode: 'open' });
  root.innerHTML = '<button id="deny">Deny all</button>';
  let pressed = false;
  root.querySelector('#deny')!.addEventListener('click', () => {
    pressed = true;
  });

  const engine = createEngine({ doc, storage: memoryAdapter() });
  engine.toggleFeature('cookieKill', true); // default: reject stays false
  assert.equal(pressed, false, 'the default hides the banner and answers nothing');
  engine.destroy();
});
