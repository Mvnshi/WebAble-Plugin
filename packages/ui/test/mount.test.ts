/**
 * UI integration under jsdom. Proves the shared menu mounts into a Shadow DOM
 * root on <html>, the launcher renders, opening shows the panel, profile/feature
 * controls drive the engine (which alters the host document), and close/destroy
 * tear everything down. Preact renders against the jsdom globals set up here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { options } from 'preact';
// Safe to import statically: none of these touch the DOM at module-eval time;
// the jsdom globals below are installed before any test (and any render) runs.
import { createEngine, memoryAdapter } from '@webable/core';
import { mountWidget, HOST_ID } from '@webable/ui';

// Preact captures `typeof requestAnimationFrame` at load (before our globals
// exist), so point its effect scheduler at a fast timer for deterministic flush.
options.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);

const dom = new JSDOM('<!doctype html><html><head></head><body><h1>Hi</h1><p>Body text here for testing.</p></body></html>', {
  url: 'https://example.test/',
  pretendToBeVisual: true,
});
const w = dom.window as unknown as Record<string, unknown>;
const g = globalThis as unknown as Record<string, unknown>;
for (const k of [
  'window', 'document', 'HTMLElement', 'Node', 'ShadowRoot', 'Event', 'KeyboardEvent',
  'MouseEvent', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'DOMParser',
  // `location` is not optional: panels.tsx reads location.href when summarizing,
  // and without it the AI actions throw "location is not defined" and reset
  // before any busy state is observable. That looked exactly like the feature
  // working and cost real time to find.
  'location',
]) {
  g[k] = w[k];
}
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);

const tick = () => new Promise((r) => setTimeout(r, 10));
/*
 * How long a poll is willing to wait, in milliseconds of wall clock.
 *
 * It used to be a count of 80 iterations, and a count is the wrong bound. What
 * these polls are waiting for is a dynamic `import()` of the panel chunk plus a
 * Preact render, and on a loaded machine that gets slower without the loop
 * getting more patient in any related way: the budget was fixed at whatever 80
 * turns of a 10ms timer happened to come to, while the thing being waited for
 * stretched.
 *
 * The effect was two tests in this file failing intermittently on a clean tree.
 * Reproduced independently by four sessions; measured here by running the core
 * suite four times at one commit and getting 436, 438, 437 and 438 passing.
 * They are not the same two tests every time, which is the signature of a
 * timeout rather than a defect.
 *
 * It cost more than the reruns. A red `mount.test.ts` was read as a genuine
 * interaction with another thread's in-flight work and nearly debugged as one,
 * because a poll that gives up quietly produces an assertion failure about
 * content rather than a message about time.
 *
 * A wall-clock deadline is a real upper bound on patience and is unaffected by
 * how the timer behaves under contention. Five seconds is far past anything a
 * healthy render needs, so reaching it is now evidence of a real failure rather
 * than of a busy machine, and the common path is unchanged: these return the
 * moment the condition holds.
 *
 * Verified rather than assumed, and the first attempt at verifying it was
 * worthless: five clean runs after the change proved nothing, because by then
 * the machine was idle and the flake cannot appear on an idle machine. Shown by
 * dropping this constant to 40ms, where the suite still passed.
 *
 * So it was measured against real load, 20 busy processes on 10 cores:
 *   40ms budget   -> "a feature switch toggles and reverts the page" failed
 *   5000ms budget -> three runs, 477 passing, zero failures
 * Same load, same commit, only this number different.
 */
const POLL_BUDGET_MS = 5000;
// Poll for the lazily-imported panel rather than racing a fixed delay: the
// dynamic import() of the panel chunk plus its Preact render lands a few
// event-loop turns after open(), and a single fixed tick loses that race
// (more so as the panel grows). Fails only if it never settles.
const untilPanel = async (shadow: ShadowRoot, present = true) => {
  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    if (!!shadow.querySelector('.wa-panel') === present) return;
    await tick();
  }
};
// Poll for any condition (a tab switch re-render, an aria state) rather than
// racing a single fixed tick. Returns as soon as it holds; gives up quietly so
// the assertion that follows reports the real failure.
const until = async (fn: () => boolean) => {
  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    if (fn()) return;
    await tick();
  }
};

test('mounts into a shadow root on <html> with a launcher', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();

  const host = document.getElementById(HOST_ID);
  assert.ok(host, 'host element exists');
  assert.equal(host!.parentElement, document.documentElement, 'host is a child of <html>, not <body>');
  assert.ok(host!.shadowRoot, 'shadow root attached');
  const launcher = host!.shadowRoot!.querySelector('.wa-launcher');
  assert.ok(launcher, 'launcher rendered inside shadow root');
  assert.equal(host!.shadowRoot!.querySelector('.wa-panel'), null, 'panel closed initially');
  api.destroy();
});

test('opening shows the panel; a profile drives the host page; close tears down', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;

  api.open();
  await untilPanel(shadow);
  const panel = shadow.querySelector('.wa-panel');
  assert.ok(panel, 'panel visible after open');
  // Categorized nav: Profiles is the default tab; categories switch in.
  assert.ok(shadow.querySelector('.wa-rail[role="tablist"]'), 'category rail rendered');
  assert.ok(shadow.querySelectorAll('.wa-profile').length >= 6, 'profiles rendered on the default tab');

  // Switching to a category tab reveals that category's feature cards only.
  (shadow.querySelector('[data-tab="reading"]') as HTMLElement).click();
  await until(() => shadow.querySelectorAll('.wa-card').length >= 5);
  assert.ok(shadow.querySelectorAll('.wa-card').length >= 5, 'reading cards rendered after tab switch');
  assert.equal(shadow.querySelector('[data-tab="reading"]')!.getAttribute('aria-selected'), 'true');

  // Back to Profiles, click "Vision impaired" and confirm it reaches the page.
  (shadow.querySelector('[data-tab="profiles"]') as HTMLElement).click();
  await until(() => Array.from(shadow.querySelectorAll('.wa-profile')).some((b) => b.textContent?.includes('Vision')));
  const visionBtn = Array.from(shadow.querySelectorAll<HTMLElement>('.wa-profile')).find((b) =>
    b.textContent?.includes('Vision'),
  );
  assert.ok(visionBtn, 'vision profile button found');
  visionBtn!.click();
  // applyProfile reaches the engine synchronously; the button's aria-pressed
  // follows on the next render.
  assert.equal(engine.getState().activeProfile, 'vision');
  assert.ok(document.documentElement.hasAttribute('data-webable-fontsize'), 'font scaling applied to host');
  await until(() => visionBtn!.getAttribute('aria-pressed') === 'true');
  assert.ok(visionBtn!.getAttribute('aria-pressed') === 'true', 'profile shows active');

  api.close();
  await untilPanel(shadow, false);
  assert.equal(shadow.querySelector('.wa-panel'), null, 'panel removed on close');

  api.destroy();
  assert.equal(document.getElementById(HOST_ID), null, 'host removed on destroy');
  assert.ok(!document.documentElement.hasAttribute('data-webable-fontsize'), 'effects cleaned on destroy');
});

test('a feature switch toggles and reverts the page', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await untilPanel(shadow);

  // Invert lives in the Color & contrast tab.
  (shadow.querySelector('[data-tab="color"]') as HTMLElement).click();
  await until(() =>
    Array.from(shadow.querySelectorAll<HTMLElement>('.wa-card')).some((c) => c.textContent?.includes('Invert / dark')),
  );
  const card = Array.from(shadow.querySelectorAll<HTMLElement>('.wa-card')).find((c) =>
    c.textContent?.includes('Invert / dark'),
  );
  assert.ok(card, 'invert card found');
  const sw = card!.querySelector<HTMLElement>('.wa-switch')!;
  sw.click();
  await until(() => engine.getState().settings.invertColors.active === true);
  assert.equal(engine.getState().settings.invertColors.active, true);
  assert.match(document.documentElement.style.getPropertyValue('--wa-f-invert'), /invert/);

  sw.click();
  await until(() => engine.getState().settings.invertColors.active === false);
  assert.equal(engine.getState().settings.invertColors.active, false);
  assert.equal(document.documentElement.style.getPropertyValue('--wa-f-invert'), '');
  api.destroy();
});

test('panel is a modal dialog; Escape closes it and returns focus to the launcher', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;

  api.open();
  await untilPanel(shadow);
  const panel = shadow.querySelector('.wa-panel') as HTMLElement;
  assert.ok(panel, 'panel open');
  assert.equal(panel.getAttribute('role'), 'dialog', 'role=dialog');
  assert.equal(panel.getAttribute('aria-modal'), 'true', 'aria-modal=true (Tab is trapped)');

  // Escape from inside the panel closes it.
  panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await untilPanel(shadow, false);
  assert.equal(shadow.querySelector('.wa-panel'), null, 'Escape closed the panel');
  // Focus returns to the launcher (close()'s rAF focus-restore).
  await until(() => shadow.activeElement === shadow.querySelector('.wa-launcher'));
  assert.equal(shadow.activeElement, shadow.querySelector('.wa-launcher'), 'focus returned to launcher');
  api.destroy();
});

test('toggle() closing also returns focus to the launcher (not just close())', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await untilPanel(shadow);
  api.toggle(); // closes
  await untilPanel(shadow, false);
  await until(() => shadow.activeElement === shadow.querySelector('.wa-launcher'));
  assert.equal(shadow.querySelector('.wa-panel'), null, 'toggle closed the panel');
  assert.equal(shadow.activeElement, shadow.querySelector('.wa-launcher'), 'toggle-close restored focus');
  api.destroy();
});

test('UI chrome strings come from the i18n layer (search, reset, close)', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await untilPanel(shadow);
  const search = shadow.querySelector('.wa-search input') as HTMLInputElement;
  assert.equal(search.getAttribute('aria-label'), 'Search tools');
  assert.equal(search.placeholder, 'Search tools…');
  assert.ok((shadow.querySelector('.wa-reset')?.textContent || '').includes('Reset all'));
  assert.ok(shadow.querySelector('[aria-label="Close"]'), 'close button labeled via i18n');
  api.destroy();
});

test('launcher exposes the active-feature count to assistive tech', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  const launcher = () => shadow.querySelector('.wa-launcher') as HTMLElement;
  assert.match(launcher().getAttribute('aria-label') || '', /Open .* accessibility menu$/, 'no count when idle');
  engine.applyProfile('vision');
  await tick();
  assert.match(launcher().getAttribute('aria-label') || '', /\d+ active/, 'count announced when features are on');
  api.destroy();
});

test('launcher remembers a dragged position and anchors the panel', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;

  engine.setUiPref('launcherOffset', { x: 40, y: 60 });
  await tick();
  const launcher = shadow.querySelector('.wa-launcher') as HTMLElement;
  assert.equal(launcher.style.left, '40px', 'launcher at saved offset');
  assert.equal(launcher.style.top, '60px');

  api.open();
  await untilPanel(shadow);
  const panel = shadow.querySelector('.wa-panel') as HTMLElement;
  // launcher in the top-left quadrant -> panel opens down and to the left
  assert.ok(panel.style.left, 'panel anchored horizontally to the launcher');
  assert.ok(panel.style.top, 'panel opens below the launcher');

  // Double-click reset clears the offset (back to the configured corner).
  engine.setUiPref('launcherOffset', null);
  await tick();
  assert.equal((shadow.querySelector('.wa-launcher') as HTMLElement).style.left, '', 'offset cleared on reset');
  api.destroy();
});

// The rule: aria-modal="true" has to be true. The panel has always declared
// itself a modal dialog while leaving the entire page behind it reachable, so
// a screen reader user could keep arrowing through a document the dialog
// claimed to have taken away. Tab was trapped; virtual cursors, rotors, and
// touch exploration were not.
test('opening the panel makes the rest of the page inert, and closing gives it back', async () => {
  document.body.innerHTML = '<header id="site-head">nav</header><main id="site-main"><a href="#x">link</a></main>';
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();

  const head = document.getElementById('site-head') as HTMLElement;
  const main = document.getElementById('site-main') as HTMLElement;
  const host = document.getElementById(HOST_ID) as HTMLElement;

  assert.equal(head.hasAttribute('inert'), false, 'nothing is inert while closed');

  api.open();
  await tick();
  for (const el of [head, main]) {
    assert.equal(el.getAttribute('inert'), '', 'page content is inert while the dialog is open');
    assert.equal(el.getAttribute('aria-hidden'), 'true', 'and hidden from assistive tech');
  }
  assert.equal(host.hasAttribute('inert'), false, 'our own host stays reachable');
  assert.equal(host.hasAttribute('aria-hidden'), false);

  api.close();
  await tick();
  for (const el of [head, main]) {
    assert.equal(el.hasAttribute('inert'), false, 'the page comes back on close');
    assert.equal(el.hasAttribute('aria-hidden'), false);
  }
  api.destroy();
});

// The barrier used to be one snapshot taken at open. A cookie banner, a chat
// widget, or an SPA re-render that mounted a top-level element while the panel
// was open sat outside it: fully reachable behind a dialog calling itself modal.
test('content the page mounts while the panel is open is covered too', async () => {
  document.body.innerHTML = '<main id="m">x</main>';
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  api.open();
  await tick();

  const late = document.createElement('div');
  late.id = 'late-banner';
  late.textContent = 'Cookie banner that arrived after the panel opened';
  document.body.appendChild(late);
  await until(() => late.hasAttribute('inert'));

  assert.equal(late.getAttribute('inert'), '', 'the late arrival is inert too');
  assert.equal(late.getAttribute('aria-hidden'), 'true');

  api.close();
  await tick();
  assert.equal(late.hasAttribute('inert'), false, 'and is released with everything else');
  api.destroy();
});

test('content the site had already hidden stays hidden after the panel closes', async () => {
  // Restoring blindly would reveal something the site deliberately hid, which
  // is a worse bug than the one being fixed.
  document.body.innerHTML = '<div id="site-modal" aria-hidden="true" inert>their overlay</div><main id="m">x</main>';
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const theirs = document.getElementById('site-modal') as HTMLElement;

  api.open();
  await tick();
  api.close();
  await tick();
  assert.equal(theirs.getAttribute('aria-hidden'), 'true', 'left exactly as found');
  assert.equal(theirs.hasAttribute('inert'), true);
  api.destroy();
});

test('destroying the widget never leaves the page inert', async () => {
  // Locking a visitor out of the site because our teardown ran while the panel
  // was open would be the worst possible failure mode for an embed.
  document.body.innerHTML = '<main id="m">content</main>';
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  api.open();
  await tick();
  api.destroy();
  await tick();
  assert.equal((document.getElementById('m') as HTMLElement).hasAttribute('inert'), false);
});

// The rule: a control must not disable itself under the user's focus.
//
// Inside a shadow root the browser sends focus to document.body when the
// focused element is disabled, leaving shadowRoot.activeElement null. The
// panel's Escape and Tab handling both read activeElement from the root, so
// pressing Enter on an AI action dropped focus out of an aria-modal dialog:
// Escape stopped closing it and Tab walked the host page behind it.
test('an AI action keeps focus inside the dialog while it runs', async () => {
  // A provider whose call never settles, so the busy state is observable.
  const hang = () => new Promise<string>(() => {});
  const provider = {
    id: 'hang',
    isConfigured: () => true,
    describeImage: hang,
    simplify: hang,
    summarize: hang,
    ask: hang,
    translate: hang,
    explain: hang,
    ocr: hang,
    guide: () => new Promise<never>(() => {}),
  } as unknown as Parameters<typeof createEngine>[0]['provider'];

  // jsdom does not implement innerText, and summarize() bails out before it
  // ever gets busy when the page reads as empty. Shim it for this test only.
  // (The other half of that trap was a missing `location` global; see above.)
  const proto = (window as unknown as { HTMLElement: { prototype: object } }).HTMLElement.prototype;
  const hadInnerText = Object.getOwnPropertyDescriptor(proto, 'innerText');
  Object.defineProperty(proto, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent || '';
    },
  });
  document.body.innerHTML = `<main>${'An article with enough text in it to summarize. '.repeat(4)}</main>`;

  const engine = createEngine({ storage: memoryAdapter(), provider });
  await engine.ready;
  engine.setApiKey('k'); // shows the actions rather than the key prompt
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await untilPanel(shadow);

  (shadow.querySelector('[data-tab="ai"]') as HTMLElement).click();
  await until(() => shadow.querySelectorAll('.wa-panel-block .wa-btn').length > 0);

  const summarize = Array.from(shadow.querySelectorAll('.wa-panel-block .wa-btn')).find((b) =>
    b.textContent?.includes('Summarize'),
  ) as HTMLButtonElement;
  assert.ok(summarize, 'the summarize action is present');

  summarize.focus();
  assert.equal(shadow.activeElement, summarize, 'focus starts on the button');
  summarize.click();
  await until(() => summarize.getAttribute('aria-disabled') === 'true');

  assert.equal(summarize.getAttribute('aria-disabled'), 'true', 'it reports itself unavailable');
  assert.equal(summarize.hasAttribute('disabled'), false, 'but is not the disabled attribute');
  assert.equal(shadow.activeElement, summarize, 'so focus is still inside the dialog');

  api.destroy();
  if (hadInnerText) Object.defineProperty(proto, 'innerText', hadInnerText);
  else delete (proto as Record<string, unknown>).innerText;
});

// The rule: the settings gear may not claim to have expanded something it did
// not. It reports aria-expanded, and the controls used to render only when the
// feature was ALSO active, so on an inactive feature it said expanded and
// showed nothing.
test('the settings gear expands its controls even when the feature is off', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await untilPanel(shadow);

  (shadow.querySelector('[data-tab="reading"]') as HTMLElement).click();
  await until(() => shadow.querySelectorAll('.wa-card-gear').length > 0);

  const gear = shadow.querySelector('.wa-card-gear') as HTMLButtonElement;
  assert.ok(gear, 'a card with controls is present');
  const card = gear.closest('.wa-card') as HTMLElement;
  assert.equal(card.getAttribute('data-on'), 'false', 'and its feature is off');

  gear.click();
  await until(() => gear.getAttribute('aria-expanded') === 'true');
  assert.equal(gear.getAttribute('aria-expanded'), 'true');
  assert.ok(card.querySelector('.wa-card-controls'), 'so something is actually expanded');
  api.destroy();
});

// The rule: a status region has to exist before the message lands in it. A
// role="status" node inserted together with its text is a new element, not a
// changed one, and screen readers do not announce it.
test('status regions pre-exist their messages', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  // The extension surface, because Friction and TrapLens are extension-only and
  // each carries one of these regions.
  const api = mountWidget({ engine, config: { surface: 'extension' } });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await untilPanel(shadow);

  (shadow.querySelector('[data-tab="power"]') as HTMLElement).click();
  await until(() => shadow.querySelectorAll('.wa-panel-block').length > 0);

  const regions = shadow.querySelectorAll('.wa-panel-block [role="status"]');
  assert.ok(regions.length >= 3, `expected Clean Copy, Friction and TrapLens status regions before any action, found ${regions.length}`);
  for (const r of Array.from(regions)) {
    assert.equal(r.textContent, '', 'empty, but present');
  }
  api.destroy();
});

// The rule: two controls may not share an id. Control keys repeat across
// features ("size", "value", "rate"), so with two cards open the label's `for`
// bound to the first slider and the second had no accessible name.
test('sliders in different features get different ids', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await untilPanel(shadow);

  (shadow.querySelector('[data-tab="aids"]') as HTMLElement).click();
  await until(() => shadow.querySelectorAll('.wa-card-gear').length > 1);
  for (const gear of Array.from(shadow.querySelectorAll('.wa-card-gear')) as HTMLElement[]) gear.click();
  await until(() => shadow.querySelectorAll('input[type="range"]').length > 1);

  const ids = Array.from(shadow.querySelectorAll('input[type="range"]')).map((el) => el.id);
  assert.ok(ids.length > 1, `expected several sliders, found ${ids.length}`);
  assert.equal(new Set(ids).size, ids.length, `duplicate slider ids: ${ids.join(', ')}`);
  for (const id of ids) {
    assert.ok(shadow.querySelector(`label[for="${id}"]`), `${id} has a label bound to it`);
  }
  api.destroy();
});

// The rule: extension-only copy still resolves on the extension surface.
//
// Those strings were moved out of the shared dictionary and into
// extensionBlocks.tsx so the widget does not ship strings it can never use.
// The risk that creates is the opposite one: if the registration is ever
// tree-shaken or the module stops being evaluated, t() falls back to returning
// the key and the panel renders "panel.saveDefaults" at the user.
test('extension-only strings resolve to copy, not to their keys', async () => {
  const engine = createEngine({ storage: memoryAdapter(), globalStorage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine, config: { surface: 'extension' } });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await untilPanel(shadow);
  // Not `.wa-scope` alone: the launcher position block shares that class.
  await until(() => !!shadow.querySelector('.wa-scope:not(.wa-position)'));

  const scope = shadow.querySelector('.wa-scope:not(.wa-position)') as HTMLElement;
  assert.ok(scope, 'the scope block renders on the extension surface');
  const text = scope.textContent || '';
  assert.doesNotMatch(text, /panel\.|announce\./, `raw i18n keys leaked into the UI: ${text}`);
  assert.match(text, /Use everywhere/);
  assert.match(text, /Where these settings apply/);
  api.destroy();
});

// The rule: closing the panel puts you back where you were, not at the end of
// the document.
//
// Focus return always went to the launcher, discarding the element captured on
// open. Someone who opens the panel with the keyboard shortcut from the middle
// of an article and closes it again was thrown to the launcher, which is the
// last thing on the page, and had to tab all the way back.
test('closing returns focus to whatever the panel was opened from', async () => {
  document.body.innerHTML = '<p>text</p><a id="deep" href="#x">a link deep in the page</a>';
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;

  const deep = document.getElementById('deep') as HTMLElement;
  deep.focus();
  assert.equal(document.activeElement, deep, 'focus starts in the page');

  api.open();
  await untilPanel(shadow);
  api.close();
  await untilPanel(shadow, false);
  await until(() => document.activeElement === deep);
  assert.equal(document.activeElement, deep, 'and comes back to it');
  api.destroy();
});

test('opening from the launcher still returns focus to the launcher', async () => {
  // The common case must not regress: opened from the launcher, the captured
  // element IS the launcher.
  document.body.innerHTML = '<p>text</p>';
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  const launcher = shadow.querySelector('.wa-launcher') as HTMLElement;

  launcher.focus();
  api.open();
  await untilPanel(shadow);
  api.close();
  await untilPanel(shadow, false);
  await until(() => shadow.activeElement === launcher);
  assert.equal(shadow.activeElement, launcher);
  api.destroy();
});

test('a return target that has left the document falls back to the launcher', async () => {
  document.body.innerHTML = '<button id="gone">temporary</button>';
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;

  (document.getElementById('gone') as HTMLElement).focus();
  api.open();
  await untilPanel(shadow);
  document.getElementById('gone')!.remove(); // an SPA re-render while the panel was open
  api.close();
  await untilPanel(shadow, false);
  await until(() => shadow.activeElement === shadow.querySelector('.wa-launcher'));
  assert.equal(shadow.activeElement, shadow.querySelector('.wa-launcher'), 'focus still lands somewhere real');
  api.destroy();
});

// The rule: the check that the return target is still real has to happen in the
// frame the focus does, not a frame earlier.
//
// The test above removes the element before close(), so the guard on the way in
// catches it. This one removes it during the gap: restoreFocus() validates the
// target, waits a frame for the panel to unmount, and focuses afterwards, and
// closing the panel is itself what makes a framework re-render. Focusing a
// detached node silently does nothing and drops focus to <body>, which is a
// keyboard user landing at the top of the document.
test('a return target that leaves during the closing frame still lands on the launcher', async () => {
  document.body.innerHTML = '<button id="gone">temporary</button>';
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  const launcher = () => shadow.querySelector('.wa-launcher');

  (document.getElementById('gone') as HTMLElement).focus();
  api.open();
  await untilPanel(shadow);
  api.close(); // schedules the focus return one frame out
  document.getElementById('gone')!.remove(); // ... and the page re-renders inside it
  await untilPanel(shadow, false);
  await until(() => shadow.activeElement === launcher());
  assert.equal(shadow.activeElement, launcher(), 'focus still lands somewhere real');
  api.destroy();
});

// The rule: the launcher can be moved without a mouse.
//
// Dragging is bound to pointer events and explicitly skipped for touch, so a
// keyboard or switch user had no way to move it at all. On a site whose own
// controls sit in the bottom right, it sat on top of them permanently.
test('the launcher position can be changed from the keyboard', async () => {
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await untilPanel(shadow);
  await until(() => !!shadow.querySelector('.wa-position'));

  const block = shadow.querySelector('.wa-position') as HTMLElement;
  const buttons = Array.from(block.querySelectorAll('button')) as HTMLButtonElement[];
  assert.equal(buttons.length, 4, 'four corners');
  for (const b of buttons) {
    assert.ok((b.textContent || '').trim().length > 3, 'each corner is named, not an icon');
  }

  const topLeft = buttons.find((b) => /top left/i.test(b.textContent || ''))!;
  topLeft.click();
  await until(() => engine.getState().ui.position === 'top-left');
  assert.equal(engine.getState().ui.position, 'top-left');
  await until(() => topLeft.getAttribute('aria-pressed') === 'true');
  assert.equal(topLeft.getAttribute('aria-pressed'), 'true', 'and the state is exposed');
  api.destroy();
});

test('choosing a corner clears a dragged position', async () => {
  // Otherwise the corner reads as selected and the launcher does not move.
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  engine.setUiPref('launcherOffset', { x: 400, y: 300 });
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await untilPanel(shadow);
  await until(() => !!shadow.querySelector('.wa-position'));

  const block = shadow.querySelector('.wa-position') as HTMLElement;
  // While dragged, no corner claims to be the current one.
  assert.equal(block.querySelectorAll('[aria-pressed="true"]').length, 0);

  const btn = Array.from(block.querySelectorAll('button')).find((b) =>
    /bottom left/i.test(b.textContent || ''),
  ) as HTMLButtonElement;
  btn.click();
  await until(() => engine.getState().ui.launcherOffset === null);
  assert.equal(engine.getState().ui.launcherOffset, null, 'the custom position is cleared');
  assert.equal(engine.getState().ui.position, 'bottom-left');
  api.destroy();
});

test('a first-time user is told what this is, and a returning one is not', async () => {
  // The panel used to open onto eight unlabelled icons and eight cards, with
  // nothing saying what it does, where the settings go, or that any of it can
  // be taken back. Someone who has just installed an accessibility tool
  // because a page is unreadable should not have to infer that.
  //
  // The condition is "nothing is turned on", not a stored flag: a returning
  // user with settings never sees it, and nobody's storage is written to
  // record that they have read a paragraph.
  const engine = createEngine({ storage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;

  api.open();
  await untilPanel(shadow);
  const intro = shadow.querySelector('.wa-intro');
  assert.ok(intro, 'a first-time user gets an explanation');
  assert.ok(
    (intro!.textContent || '').includes('Reset all'),
    'and is told how to take it all back, which is the part that makes trying things safe',
  );

  // Turning anything on answers the question the intro was answering.
  engine.toggleFeature('readableFont', true);
  await until(() => !shadow.querySelector('.wa-intro'));
  assert.equal(shadow.querySelector('.wa-intro'), null, 'it steps out of the way once anything is on');

  engine.toggleFeature('readableFont', false);
  await until(() => !!shadow.querySelector('.wa-intro'));
  assert.ok(shadow.querySelector('.wa-intro'), 'and an empty panel explains itself again rather than sitting blank');

  // Dismissing is for this panel session only, so it costs no storage write.
  (shadow.querySelector('.wa-intro button') as HTMLElement).click();
  await until(() => !shadow.querySelector('.wa-intro'));
  assert.equal(shadow.querySelector('.wa-intro'), null, 'dismissed on request');

  api.destroy();
});
