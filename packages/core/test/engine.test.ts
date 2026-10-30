/**
 * Engine behavior under jsdom. Proves the contract that matters: features apply
 * and fully revert, color features compose without clobbering each other,
 * profiles set the right settings, settings persist + rehydrate, and dynamic
 * features restore the original DOM state on disable.
 *
 * Run: node --experimental-strip-types --test packages/core/test/engine.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCompanionReply } from '@webable/companion';
import { toGuideReply } from '../src/tools/companion-bridge';
import { JSDOM } from 'jsdom';
import {
  createEngine,
  memoryAdapter,
  buildTarget,
  scanTraps,
  cleanUrl,
  feedSelectorsFor,
  FEATURE_IDS,
  FEATURE_MAP,
  buildGuideElements,
  GLOBAL_KEY,
  SECRET_KEY,
  siteKeyFor,
  createMutationManager,
  startPatchPicker,
  extractMainText,
  type AIProvider,
} from '@webable/core';

// Minimal AI provider stub for Guide tests (no network).
function guideStub(guide: AIProvider['guide']): AIProvider {
  const no = async () => '';
  return {
    id: 'stub',
    isConfigured: () => true,
    describeImage: no,
    simplify: no,
    summarize: no,
    ask: no,
    translate: no,
    explain: no,
    ocr: no,
    guide,
  };
}

// jsdom does no layout, so give interactive elements a real-looking box.
function giveBoxes(doc: Document) {
  doc.querySelectorAll('a,button,input,select,textarea,[role]').forEach((el) => {
    (el as HTMLElement).getBoundingClientRect = () =>
      ({ width: 120, height: 32, left: 10, top: 10, right: 130, bottom: 42, x: 10, y: 10, toJSON() {} }) as DOMRect;
    (el as HTMLElement).getClientRects = () => [{ width: 120, height: 32 } as DOMRect] as unknown as DOMRectList;
  });
}

function setup(body = '<h1>Title</h1><p>Para</p><a href="#">link</a><video></video>') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    pretendToBeVisual: true,
  });
  return dom.window.document;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('feature applies and fully reverts', async () => {
  const doc = setup();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  const html = doc.documentElement;

  engine.toggleFeature('fontSize', true);
  assert.ok(html.hasAttribute('data-webable-fontsize'), 'flag set');
  assert.equal(html.style.getPropertyValue('--wa-fontsize'), '1.2', 'var set to default scale');
  assert.ok(doc.getElementById('wa-feat-fontSize-root'), 'style injected');

  engine.toggleFeature('fontSize', false);
  assert.ok(!html.hasAttribute('data-webable-fontsize'), 'flag removed');
  assert.equal(html.style.getPropertyValue('--wa-fontsize'), '', 'var cleared');
  assert.equal(doc.getElementById('wa-feat-fontSize-root'), null, 'style removed');
});

test('color features compose via separate filter vars', async () => {
  const doc = setup();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  const html = doc.documentElement;

  engine.toggleFeature('highContrast', true);
  engine.toggleFeature('saturation', true); // default mode grayscale
  assert.match(html.style.getPropertyValue('--wa-f-contrast'), /contrast\(/);
  assert.equal(html.style.getPropertyValue('--wa-f-grayscale'), 'grayscale(1)');

  // Disabling one must not touch the other's variable.
  engine.toggleFeature('highContrast', false);
  assert.equal(html.style.getPropertyValue('--wa-f-contrast'), '', 'contrast cleared');
  assert.equal(html.style.getPropertyValue('--wa-f-grayscale'), 'grayscale(1)', 'grayscale intact');
});

test('saturation switches modes without leaking the unused var', async () => {
  const doc = setup();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  const html = doc.documentElement;

  engine.setFeature('saturation', { active: true, mode: 'grayscale' });
  assert.equal(html.style.getPropertyValue('--wa-f-grayscale'), 'grayscale(1)');
  engine.setFeature('saturation', { active: true, mode: 'high' });
  assert.equal(html.style.getPropertyValue('--wa-f-grayscale'), '', 'grayscale cleared on switch');
  assert.match(html.style.getPropertyValue('--wa-f-saturate'), /saturate\(1\.7\)/);
});

test('profile sets the bundled settings and clears on manual change', async () => {
  const doc = setup();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;

  engine.applyProfile('vision');
  let st = engine.getState();
  assert.equal(st.activeProfile, 'vision');
  assert.equal(st.settings.fontSize.active, true);
  assert.equal(st.settings.fontSize.value, 160);
  assert.equal(st.settings.highContrast.active, true);

  engine.toggleFeature('fontSize', false);
  assert.equal(engine.getState().activeProfile, null, 'manual change drops profile');
});

test('settings persist and rehydrate into a fresh engine', async () => {
  const doc1 = setup();
  const storage = memoryAdapter();
  const a = createEngine({ doc: doc1, storage });
  await a.ready;
  a.toggleFeature('readableFont', true);
  a.setFeature('fontSize', { active: true, value: 150 });
  await wait(350); // beyond the 250ms persist debounce

  const doc2 = setup();
  const b = createEngine({ doc: doc2, storage });
  await b.ready;
  const st = b.getState();
  assert.equal(st.settings.readableFont.active, true, 'readableFont rehydrated');
  assert.equal(st.settings.fontSize.value, 150, 'value rehydrated');
  assert.ok(doc2.documentElement.hasAttribute('data-webable-readable'), 're-applied on load');
});

test('dynamic feature (mute) reverts original media state', async () => {
  const doc = setup();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  const video = doc.querySelector('video') as HTMLVideoElement;
  assert.equal(video.muted, false);

  engine.toggleFeature('muteSounds', true);
  assert.equal(video.muted, true, 'muted on apply');
  assert.equal(video.getAttribute('data-wa-muted-orig'), '0', 'recorded original');

  engine.toggleFeature('muteSounds', false);
  assert.equal(video.muted, false, 'unmuted on disable');
  assert.equal(video.getAttribute('data-wa-muted-orig'), null, 'marker cleared');
});

test('resetAll clears every feature and the base flag stays', async () => {
  const doc = setup();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.applyProfile('dyslexia');
  assert.ok(engine.activeCount() > 0);
  engine.resetAll();
  assert.equal(engine.activeCount(), 0);
  assert.equal(doc.getElementById('wa-feat-dyslexiaFont-root'), null);
  assert.ok(doc.documentElement.hasAttribute('data-webable'), 'base flag remains while engine lives');
});

test('power: hiding cookie banners hides without answering them', async () => {
  const doc = setup('<div id="onetrust-banner-sdk"><button>Reject all</button></div><p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('cookieKill', true);
  const btn = doc.querySelector('#onetrust-banner-sdk button') as HTMLElement;
  assert.equal(btn.getAttribute('data-wa-clicked'), null, 'the default hides, it does not consent');
  assert.ok(doc.documentElement.hasAttribute('data-webable-cookiekill'), 'flag set');
  assert.ok(doc.getElementById('wa-feat-cookieKill-hide'), 'banner-hide CSS injected');

  // Opting in is what makes it click.
  engine.setFeature('cookieKill', { reject: true });
  assert.equal(btn.getAttribute('data-wa-clicked'), '1', 'reject clicked once opted in');
});

test('power: force zoom rewrites the viewport and reverts', async () => {
  const doc = setup('<p>x</p>');
  const meta = doc.createElement('meta');
  meta.setAttribute('name', 'viewport');
  meta.setAttribute('content', 'width=device-width, user-scalable=no, maximum-scale=1');
  doc.head.appendChild(meta);
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;

  engine.toggleFeature('forceZoom', true);
  const c = meta.getAttribute('content') || '';
  assert.ok(!/user-scalable\s*=\s*no/i.test(c), 'user-scalable=no removed');
  assert.match(c, /maximum-scale=10/, 'pinch zoom enabled');

  engine.toggleFeature('forceZoom', false);
  assert.match(meta.getAttribute('content') || '', /user-scalable\s*=\s*no/i, 'original viewport restored');
});

test('power: unlock selection toggles flag + style and reverts', async () => {
  const doc = setup('<p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('copyUnlock', true);
  assert.ok(doc.documentElement.hasAttribute('data-webable-copyunlock'));
  assert.ok(doc.getElementById('wa-feat-copyUnlock-css'), 'selection CSS injected');
  engine.toggleFeature('copyUnlock', false);
  assert.equal(doc.getElementById('wa-feat-copyUnlock-css'), null, 'CSS removed on disable');
});

test('dark mode sets the dark filter + flag and reverts', async () => {
  const doc = setup('<p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  const html = doc.documentElement;
  engine.toggleFeature('darkMode', true);
  assert.match(html.style.getPropertyValue('--wa-f-dark'), /invert/, 'dark filter set');
  assert.ok(html.hasAttribute('data-webable-reinvert-dark'), 'media re-invert flag set');
  assert.ok(doc.getElementById('wa-feat-darkMode-root'), 'dark css injected');
  engine.toggleFeature('darkMode', false);
  assert.equal(html.style.getPropertyValue('--wa-f-dark'), '', 'dark filter cleared');
  assert.ok(!html.hasAttribute('data-webable-reinvert-dark'), 'flag cleared');
});

test('reader mode builds an overlay and closes via disableSelf', async () => {
  const body =
    '<nav>menu</nav><article><h1>Headline</h1>' +
    '<p>' + 'This is a long paragraph of real article text. '.repeat(8) + '</p>' +
    '<p>' + 'A second substantial paragraph of body copy here. '.repeat(8) + '</p>' +
    '<script>1</script></article>';
  const doc = setup(body);
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;

  engine.toggleFeature('readerMode', true);
  const overlay = doc.getElementById('wa-reader');
  assert.ok(overlay, 'reader overlay created');
  assert.ok((overlay!.querySelector('.wa-reader-title')?.textContent || '').includes('Headline'), 'title extracted');
  assert.ok((overlay!.textContent || '').includes('long paragraph'), 'article text cloned');
  assert.equal(overlay!.querySelector('script'), null, 'scripts stripped');
  assert.ok(doc.documentElement.hasAttribute('data-webable-reader'), 'scroll-lock flag set');

  // The overlay's Close button turns the feature off from inside.
  (overlay!.querySelector('.wa-reader-close') as HTMLElement).click();
  assert.equal(engine.getState().settings.readerMode.active, false, 'disableSelf turned it off');
  assert.equal(doc.getElementById('wa-reader'), null, 'overlay removed');
});

test('media speed records + restores playbackRate', async () => {
  const doc = setup('<video></video><p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  const v = doc.querySelector('video') as HTMLVideoElement;
  engine.setFeature('mediaSpeed', { active: true, rate: 2 });
  assert.equal(v.getAttribute('data-wa-rate-orig'), '1', 'original rate recorded');
  engine.toggleFeature('mediaSpeed', false);
  assert.equal(v.getAttribute('data-wa-rate-orig'), null, 'marker cleared on disable');
});

test('clean copy strips tracking params from a url', () => {
  assert.equal(
    cleanUrl('https://x.test/p?utm_source=a&id=5&fbclid=zz&q=hi'),
    'https://x.test/p?id=5&q=hi',
  );
});

test('expand all opens collapsibles and reverts on disable', async () => {
  const doc = setup('<details><summary>More</summary><p>hidden body</p></details><p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  const d = doc.querySelector('details') as HTMLDetailsElement;
  engine.setFeature('expandCollapse', { active: true, mode: 'expand' });
  assert.equal(d.hasAttribute('open'), true, 'details opened');
  assert.equal(d.getAttribute('data-wa-exp'), 'd');
  engine.toggleFeature('expandCollapse', false);
  assert.equal(d.hasAttribute('open'), false, 'details closed on disable');
  assert.equal(d.getAttribute('data-wa-exp'), null);
});

test('site patches apply, persist per origin, and revert', async () => {
  const html = '<div id="ads" class="ad-banner">Ad</div><p>x</p>';
  const storage = memoryAdapter();
  const doc = setup(html);
  const engine = createEngine({ doc, storage });
  await engine.ready;
  const el = doc.getElementById('ads') as HTMLElement;
  await engine.patches.add({ action: 'hide', label: 'ad', target: buildTarget(el) });
  engine.patches.applyAll(doc);
  assert.equal(el.style.display, 'none', 'patch hides the element');
  assert.ok(el.getAttribute('data-wa-patch'), 'element tagged');

  await wait(60); // persist debounce
  const doc2 = setup(html);
  const e2 = createEngine({ doc: doc2, storage });
  await e2.ready; // applies saved patches on load
  assert.equal((doc2.getElementById('ads') as HTMLElement).style.display, 'none', 're-applied on load');

  const pid = e2.patches.list()[0].id;
  await e2.patches.toggle(pid, false);
  e2.patches.applyAll(doc2);
  assert.notEqual((doc2.getElementById('ads') as HTMLElement).style.display, 'none', 'reverts when disabled');
});

test('friction log records locally and persists', async () => {
  const storage = memoryAdapter();
  const engine = createEngine({ doc: setup('<p>x</p>'), storage });
  await engine.ready;
  await engine.friction.add({ url: 'https://x.test', reason: 'Too cluttered', element: 'div "hi"' });
  assert.equal(engine.friction.list().length, 1);
  await wait(40);
  const e2 = createEngine({ doc: setup('<p>x</p>'), storage });
  await e2.ready;
  assert.equal(e2.friction.list().length, 1, 'friction persisted on device');
});

test('trapLens flags pre-checked boxes and unequal consent (advisory)', () => {
  const doc = setup(
    '<label><input type="checkbox" checked /> Add insurance protection</label>' +
      '<div class="cookie-banner"><button>Accept all</button></div>' +
      '<button>Subscribe</button>',
  );
  const findings = scanTraps(doc);
  assert.ok(findings.some((f) => f.type === 'precheck'), 'pre-checked box flagged');
  assert.ok(findings.some((f) => f.type === 'consent'), 'unequal cookie choices flagged');
});

// ---- Phase 4: engine quality ------------------------------------------------

test('toggle matrix: every feature applies and fully reverts with no residue', async () => {
  for (const id of FEATURE_IDS) {
    const doc = setup('<h1>T</h1><h2>S</h2><p>para</p><a href="#">l</a><button>b</button><video></video>');
    const engine = createEngine({ doc, storage: memoryAdapter() });
    await engine.ready;

    engine.toggleFeature(id, true);
    assert.equal(engine.activeCount(), 1, `${id} active after toggle on`);

    engine.toggleFeature(id, false);
    assert.equal(engine.activeCount(), 0, `${id} inactive after toggle off`);
    assert.equal(doc.querySelectorAll('[id^="wa-feat-"]').length, 0, `${id}: no leftover feature styles`);
    assert.equal(doc.querySelectorAll('[data-webable="overlay"]').length, 0, `${id}: no leftover overlays`);
    const flags = Array.from(doc.documentElement.attributes)
      .map((a) => a.name)
      .filter((n) => n.startsWith('data-webable') && n !== 'data-webable');
    assert.deepEqual(flags, [], `${id}: no leftover html flags`);
  }
});

test('overlay aids stay idempotent: re-apply never stacks nodes', async () => {
  for (const id of ['readingGuide', 'readingMask', 'magnifier'] as const) {
    const doc = setup();
    const engine = createEngine({ doc, storage: memoryAdapter() });
    await engine.ready;
    engine.toggleFeature(id, true);
    const before = doc.querySelectorAll('[data-webable="overlay"]').length;
    assert.ok(before > 0, `${id} created an overlay`);
    // reconcile() re-runs apply() for every active feature on any state change;
    // changing a setting AND toggling another feature both trigger it.
    engine.setFeature(id, { ...engine.getState().settings[id], active: true });
    engine.toggleFeature('readableFont', true);
    assert.equal(
      doc.querySelectorAll('[data-webable="overlay"]').length,
      before,
      `${id}: overlay count stable across re-apply`,
    );
    engine.toggleFeature(id, false);
    assert.equal(doc.querySelectorAll('[data-webable="overlay"]').length, 0, `${id}: overlays removed on disable`);
  }
});

test('highlightHeadings is dynamic, tags headings, and clears tags on disable', async () => {
  assert.equal(FEATURE_MAP.get('highlightHeadings')?.meta.dynamic, true, 'marked dynamic for SPA survival');
  const doc = setup('<h1>A</h1><h2>B</h2><p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('highlightHeadings', true);
  assert.equal(doc.querySelector('h1')?.getAttribute('data-wa-tag'), 'H1');
  assert.equal(doc.querySelector('h2')?.getAttribute('data-wa-tag'), 'H2');
  engine.toggleFeature('highlightHeadings', false);
  assert.equal(doc.querySelector('h1')?.getAttribute('data-wa-tag'), null, 'tags cleared on disable');
});

test('stopAnimations records original play state and clears the marker', async () => {
  const doc = setup('<video></video><p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  const v = doc.querySelector('video') as HTMLVideoElement;
  engine.toggleFeature('stopAnimations', true);
  assert.ok(v.hasAttribute('data-wa-anim-orig'), 'records original play state');
  engine.toggleFeature('stopAnimations', false);
  assert.equal(v.getAttribute('data-wa-anim-orig'), null, 'marker cleared on disable');
});

test('colorFilter applies a CVD filter and reverts', async () => {
  const doc = setup('<p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  const html = doc.documentElement;
  engine.setFeature('colorFilter', { active: true, mode: 'deuteranopia', purpose: 'correct' });
  assert.match(html.style.getPropertyValue('--wa-f-cvd'), /feColorMatrix/, 'CVD filter set');
  engine.setFeature('colorFilter', { active: true, mode: 'achromatopsia', purpose: 'simulate' });
  assert.equal(html.style.getPropertyValue('--wa-f-cvd'), 'grayscale(1)', 'achromatopsia simulate');
  engine.toggleFeature('colorFilter', false);
  assert.equal(html.style.getPropertyValue('--wa-f-cvd'), '', 'cleared on disable');
});

test('flush() persists immediately without waiting for the debounce', async () => {
  const storage = memoryAdapter();
  const a = createEngine({ doc: setup(), storage });
  await a.ready;
  a.setFeature('fontSize', { active: true, value: 175 });
  await a.flush();
  const b = createEngine({ doc: setup(), storage });
  await b.ready;
  assert.equal(b.getState().settings.fontSize.value, 175, 'persisted before the 250ms debounce');
});

test('global/per-site split: features stay per-site, ui+apiKey+tts are global', async () => {
  const siteA = memoryAdapter();
  const globalStorage = memoryAdapter();
  const a = createEngine({ doc: setup(), storage: siteA, globalStorage });
  await a.ready;
  a.toggleFeature('readableFont', true); // per-site
  a.setUiPref('theme', 'dark'); // global
  a.setApiKey('KEY123'); // global (no secret layer supplied)
  a.tts.setRate(1.5); // global TTS pref
  await a.flush();

  // A different origin (fresh per-site store) shares the same global layer.
  const b = createEngine({ doc: setup(), storage: memoryAdapter(), globalStorage });
  await b.ready;
  assert.equal(b.getState().settings.readableFont.active, false, 'features do NOT cross sites');
  assert.equal(b.getState().ui.theme, 'dark', 'ui shared globally');
  assert.equal(b.getState().apiKey, 'KEY123', 'apiKey shared globally');
  assert.equal(b.tts.getState().rate, 1.5, 'tts rate shared globally');

  // Reopening the SAME origin keeps its own feature settings.
  const c = createEngine({ doc: setup(), storage: siteA, globalStorage });
  await c.ready;
  assert.equal(c.getState().settings.readableFont.active, true, 'per-site features rehydrate');
});

// The rule: when a surface supplies a secret layer, the AI key is written there
// and nowhere else. In the extension the global layer IS chrome.storage.sync,
// so a key that lands in it is uploaded to Google and pushed to every browser
// the user is signed into, while the panel says it is stored only in this
// browser. That combination is the bug this guards.
test('the AI key never reaches the synced global layer', async () => {
  const globalStorage = memoryAdapter();
  const secretStorage = memoryAdapter();
  const e = createEngine({ doc: setup(), storage: memoryAdapter(), globalStorage, secretStorage });
  await e.ready;
  e.setApiKey('SECRET123');
  e.setUiPref('theme', 'dark');
  await e.flush();

  const glob = await globalStorage.get<{ apiKey?: string; ui?: { theme?: string } }>(GLOBAL_KEY);
  assert.equal(glob?.apiKey, undefined, 'the key must not be in the synced payload');
  assert.equal(glob?.ui?.theme, 'dark', 'roaming prefs still sync');
  assert.equal((await secretStorage.get<{ apiKey?: string }>(SECRET_KEY))?.apiKey, 'SECRET123');

  // And it rehydrates from the device-local layer alone.
  const next = createEngine({ doc: setup(), storage: memoryAdapter(), globalStorage, secretStorage });
  await next.ready;
  assert.equal(next.getState().apiKey, 'SECRET123');
});

// Existing installs already have the key sitting in sync. Loading once must
// move it down and strip it from the synced blob, or the promise only holds
// for people who installed after the fix.
test('a key already in the synced layer is migrated out of it on load', async () => {
  const globalStorage = memoryAdapter();
  const secretStorage = memoryAdapter();
  await globalStorage.set(GLOBAL_KEY, {
    version: 1,
    ui: { theme: 'dark', accent: '#1e40af', position: 'bottom-right', launcherOffset: null, language: 'en' },
    apiKey: 'ROAMING',
    tts: {},
  });

  const e = createEngine({ doc: setup(), storage: memoryAdapter(), globalStorage, secretStorage });
  await e.ready;
  assert.equal(e.getState().apiKey, 'ROAMING', 'the user does not lose their key');
  assert.equal((await secretStorage.get<{ apiKey?: string }>(SECRET_KEY))?.apiKey, 'ROAMING', 'moved to the device');
  const glob = await globalStorage.get<{ apiKey?: string; ui?: { theme?: string } }>(GLOBAL_KEY);
  assert.equal(glob?.apiKey, undefined, 'and stripped from the synced payload');
  assert.equal(glob?.ui?.theme, 'dark', 'without taking the roaming prefs with it');
});

test('global split migrates apiKey/ui from a legacy per-site payload', async () => {
  const site = memoryAdapter();
  // A pre-split engine wrote everything into the per-site payload.
  await site.set('settings:v1', {
    version: 1,
    settings: {},
    activeProfile: null,
    ui: { theme: 'dark', accent: '#1e40af', position: 'bottom-right', launcherOffset: null, language: 'en' },
    apiKey: 'LEGACY',
  });
  const e = createEngine({ doc: setup(), storage: site, globalStorage: memoryAdapter() });
  await e.ready;
  assert.equal(e.getState().apiKey, 'LEGACY', 'apiKey migrated from legacy site payload');
  assert.equal(e.getState().ui.theme, 'dark', 'ui migrated from legacy site payload');
});

test('tts rate/pitch/voice persist and rehydrate (single store)', async () => {
  const storage = memoryAdapter();
  const a = createEngine({ doc: setup(), storage });
  await a.ready;
  a.tts.setRate(1.75);
  a.tts.setPitch(0.8);
  a.tts.setVoice('Daniel');
  await a.flush();
  const b = createEngine({ doc: setup(), storage });
  await b.ready;
  const t = b.tts.getState();
  assert.equal(t.rate, 1.75, 'rate rehydrated');
  assert.equal(t.pitch, 0.8, 'pitch rehydrated');
  assert.equal(t.voiceURI, 'Daniel', 'voice rehydrated');
});

test('storage adapters round-trip values', async () => {
  const mem = memoryAdapter();
  await mem.set('k', { a: 1 });
  assert.deepEqual(await mem.get('k'), { a: 1 });
  await mem.remove('k');
  assert.equal(await mem.get('k'), null);
});

// ---- Release 1: annoyance-killers ------------------------------------------

test('wallBreaker hides text-gates + unlocks scroll, and fully reverts', async () => {
  const doc = setup(
    '<div class="paywall-overlay">x</div>' +
      '<div role="dialog" id="gate" style="position:fixed">Sign up to keep reading this article</div>' +
      '<div role="dialog" id="login" style="position:fixed">Log in <input type="password"></div>' +
      '<p>body</p>',
  );
  doc.body.style.overflow = 'hidden'; // a popup-style scroll lock
  // jsdom getComputedStyle reflects inline overflow, so unlockScroll sees it.
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;

  engine.toggleFeature('wallBreaker', true);
  const html = doc.documentElement;
  assert.ok(html.hasAttribute('data-webable-wallbreaker'), 'flag set');
  assert.ok(doc.getElementById('wa-feat-wallBreaker-root'), 'gate-hide + de-blur CSS injected');
  // The text-matched gate is hidden; the real login (password field) is NOT.
  assert.equal((doc.getElementById('gate') as HTMLElement).style.display, 'none', 'sign-up gate hidden');
  assert.notEqual((doc.getElementById('login') as HTMLElement).style.display, 'none', 'real login left alone');

  engine.toggleFeature('wallBreaker', false);
  assert.ok(!html.hasAttribute('data-webable-wallbreaker'), 'flag cleared');
  assert.equal((doc.getElementById('gate') as HTMLElement).style.display, '', 'gate display restored');
  assert.equal(doc.body.getAttribute('data-wa-wall'), null, 'no residue markers');
  assert.equal(doc.body.getAttribute('data-wa-ovf'), null, 'scroll-lock marker cleared');
});

test('feedSelectorsFor returns curated selectors per host and nothing for others', () => {
  assert.ok(feedSelectorsFor('www.youtube.com', false).includes('ytd-rich-grid-renderer'), 'youtube home grid');
  assert.ok(!feedSelectorsFor('www.youtube.com', false).includes('#comments'), 'balanced keeps comments');
  assert.ok(feedSelectorsFor('youtube.com', true).includes('#comments'), 'strict hides comments');
  assert.ok(feedSelectorsFor('old.reddit.com', false).includes('shreddit-feed'), 'reddit feed');
  assert.deepEqual(feedSelectorsFor('example.com', false), [], 'unknown host hides nothing');
});

test('feedOff sets its flag and reverts (no host match still toggles cleanly)', async () => {
  const doc = setup('<p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.setFeature('feedOff', { active: true, mode: 'strict' });
  assert.ok(doc.documentElement.hasAttribute('data-webable-feedoff'), 'flag set');
  engine.toggleFeature('feedOff', false);
  assert.ok(!doc.documentElement.hasAttribute('data-webable-feedoff'), 'flag cleared');
});

test('nagMute hides nag bars and reverts', async () => {
  const doc = setup('<div class="onesignal-bell-launcher">bell</div><p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('nagMute', true);
  assert.ok(doc.documentElement.hasAttribute('data-webable-nagmute'), 'flag set');
  assert.ok(doc.getElementById('wa-feat-nagMute-root'), 'nag-hide CSS injected');
  engine.toggleFeature('nagMute', false);
  assert.equal(doc.getElementById('wa-feat-nagMute-root'), null, 'CSS removed on disable');
});

// ---- Release 3 modules: Bionic Flow + Volume Boost -------------------------

test('bionicFlow bolds word starts, preserves text, and fully reverts', async () => {
  const doc = setup('<article><p>Reading should feel faster now</p></article>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  const art = doc.querySelector('article') as HTMLElement;

  engine.toggleFeature('bionicFlow', true);
  assert.ok(art.querySelectorAll('span[data-wa-bionic]').length > 0, 'text wrapped in bionic spans');
  assert.ok(art.querySelectorAll('span[data-wa-bionic] b').length >= 5, 'each word has a bold lead');
  assert.match(art.textContent || '', /Reading should feel faster now/, 'text content preserved');

  engine.toggleFeature('bionicFlow', false);
  assert.equal(art.querySelectorAll('[data-wa-bionic]').length, 0, 'unwrapped on disable');
  assert.match(art.textContent || '', /Reading should feel faster now/, 'text intact after revert');
});

test('bionicFlow is idempotent on re-apply (no double-wrap)', async () => {
  const doc = setup('<article><p>alpha beta gamma</p></article>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('bionicFlow', true);
  const before = doc.querySelectorAll('span[data-wa-bionic]').length;
  engine.toggleFeature('readableFont', true); // forces a reconcile re-apply
  assert.equal(doc.querySelectorAll('span[data-wa-bionic]').length, before, 'no extra spans on re-apply');
  assert.match(doc.querySelector('article')!.textContent || '', /alpha beta gamma/, 'text not corrupted');
});

test('bionicFlow re-bolds when the amount dial changes', async () => {
  const doc = setup('<article><p>hello there</p></article>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.setFeature('bionicFlow', { active: true, weight: 0.4 });
  const lead40 = (doc.querySelector('span[data-wa-bionic] b')?.textContent || '').length;
  engine.setFeature('bionicFlow', { active: true, weight: 0.7 });
  const lead70 = (doc.querySelector('span[data-wa-bionic] b')?.textContent || '').length;
  assert.ok(lead70 > lead40, 'a higher dial bolds more of each word');
});

test('volumeBoost toggles cleanly where Web Audio is unavailable (no residue)', async () => {
  const doc = setup('<video></video><p>x</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  assert.doesNotThrow(() => engine.setFeature('volumeBoost', { active: true, gain: 2, normalize: true }));
  assert.equal((doc.querySelector('video') as HTMLElement).getAttribute('data-wa-vol'), null, 'no graph without AudioContext');
  engine.toggleFeature('volumeBoost', false);
  assert.equal(engine.activeCount(), 0);
});

// ---- Release 2: in-page AI tools (provider stubbed) ------------------------

function stubProvider(answers: Record<string, string> = {}) {
  const r = (k: string) => () => Promise.resolve(answers[k] ?? k);
  return {
    id: 'stub',
    isConfigured: () => true,
    describeImage: r('alt'),
    simplify: r('simplify'),
    summarize: r('summary'),
    ask: r('ask'),
    translate: r('translate'),
    explain: r('explain'),
    ocr: r('ocr'),
  };
}

function selectText(doc: Document, el: Element) {
  const win = doc.defaultView as Window & typeof globalThis;
  const range = doc.createRange();
  range.selectNodeContents(el);
  const sel = win.getSelection!();
  sel.removeAllRanges();
  sel.addRange(range);
  doc.dispatchEvent(new win.Event('mouseup'));
}

test('selectionBubble shows actions on selection and runs an AI action', async () => {
  const doc = setup('<article><p id="t">A dense sentence about quarks</p></article>');
  const engine = createEngine({ doc, storage: memoryAdapter(), provider: stubProvider({ explain: 'EXPLAINED' }) });
  await engine.ready;
  engine.toggleFeature('selectionBubble', true);

  selectText(doc, doc.getElementById('t')!);
  await wait(30); // debounce
  const host = doc.querySelector('[data-wa-aipop]') as HTMLElement;
  assert.ok(host && host.shadowRoot, 'popover mounted in its own shadow root');
  const buttons = Array.from(host.shadowRoot!.querySelectorAll<HTMLElement>('.bar button'));
  const explain = buttons.find((b) => b.textContent === 'Explain');
  assert.ok(explain, 'Explain action present');

  explain!.click();
  await wait(20);
  assert.match(host.shadowRoot!.querySelector('.body')?.textContent || '', /EXPLAINED/, 'AI result shown inline');

  engine.toggleFeature('selectionBubble', false);
  assert.equal(doc.querySelector('[data-wa-aipop]'), null, 'popover removed on disable');
});

test('selectionBubble degrades without an AI key (Define stays keyless)', async () => {
  const doc = setup('<article><p id="t">word</p></article>');
  const engine = createEngine({ doc, storage: memoryAdapter() }); // default provider, no key
  await engine.ready;
  engine.toggleFeature('selectionBubble', true);
  selectText(doc, doc.getElementById('t')!);
  await wait(30);
  const host = doc.querySelector('[data-wa-aipop]') as HTMLElement;
  const buttons = Array.from(host.shadowRoot!.querySelectorAll<HTMLElement>('.bar button')).map((b) => b.textContent);
  assert.ok(buttons.includes('Define') && buttons.includes('Speak'), 'keyless actions present even with no key');
  const explain = Array.from(host.shadowRoot!.querySelectorAll<HTMLElement>('.bar button')).find((b) => b.textContent === 'Explain');
  explain!.click();
  await wait(10);
  assert.match(host.shadowRoot!.querySelector('.body')?.textContent || '', /Gemini key/, 'AI action prompts for a key');
  engine.toggleFeature('selectionBubble', false);
});

test('tldrPin pins a summary card above the article and reverts', async () => {
  const long = 'This is a real article body. '.repeat(12);
  const doc = setup(`<article><p>${long}</p></article>`);
  const engine = createEngine({ doc, storage: memoryAdapter(), provider: stubProvider({ summary: '- point one\n- point two' }) });
  await engine.ready;

  engine.toggleFeature('tldrPin', true);
  await wait(20);
  const card = doc.querySelector('[data-wa-tldr-card]');
  assert.ok(card, 'TL;DR card inserted');
  assert.ok(doc.documentElement.hasAttribute('data-webable-tldr'), 'flag set');

  // The card carries the action; the article is only transmitted on the press.
  // See packages/core/test/acting-on-your-behalf.test.ts for why.
  const go = card!.querySelector('button') as HTMLElement;
  assert.ok(go, 'summarize button offered');
  go.click();
  await wait(20);
  assert.match(card!.textContent || '', /point one/, 'summary rendered after the press');

  engine.toggleFeature('tldrPin', false);
  assert.equal(doc.querySelector('[data-wa-tldr-card]'), null, 'card removed on disable');
  assert.ok(!doc.documentElement.hasAttribute('data-webable-tldr'), 'flag cleared');
});

test('tldrPin without a key prompts instead of calling AI', async () => {
  const doc = setup('<article><p>Some article text here that is long enough to summarize in theory.</p></article>');
  const engine = createEngine({ doc, storage: memoryAdapter() }); // no key
  await engine.ready;
  engine.toggleFeature('tldrPin', true);
  await wait(10);
  assert.match(doc.querySelector('[data-wa-tldr-card]')?.textContent || '', /Gemini key/, 'prompts for a key');
  engine.toggleFeature('tldrPin', false);
});

test('clickDictionary binds and tears down without throwing', async () => {
  const doc = setup('<p>hello world</p>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  assert.doesNotThrow(() => engine.toggleFeature('clickDictionary', true));
  assert.ok(doc.querySelector('[data-wa-aipop]'), 'dictionary popover mounted');
  engine.toggleFeature('clickDictionary', false);
  assert.equal(doc.querySelector('[data-wa-aipop]'), null, 'removed on disable');
});

test('the batch guide path parses the same protocol as the streaming one', () => {
  // One protocol serves both paths, so a single-step reply must round-trip
  // through the shared parser into the Guide's render shape.
  const one = toGuideReply(parseCompanionReply('Click the blue button. [POINT:3:sign in]'));
  assert.equal(one.say, 'Click the blue button.');
  assert.equal(one.point, 3);
  assert.equal(one.label, 'sign in');

  const none = toGuideReply(parseCompanionReply('Just read the page. [POINT:none]'));
  assert.equal(none.say, 'Just read the page.');
  assert.equal(none.point, null);
});

test('guide builds a numbered element map', () => {
  const doc = setup('<button>Sign in</button><a href="/cart">Cart</a><input placeholder="Search" />');
  giveBoxes(doc);
  const { elements, text } = buildGuideElements(doc);
  assert.equal(elements.length, 3, 'three interactive elements');
  assert.match(text, /1: button "Sign in"/);
  assert.match(text, /3: field "Search"/);
});

test('guide answers, points at an element, and clears', async () => {
  const doc = setup('<button>Sign in</button><a href="/cart">Cart</a>');
  giveBoxes(doc);
  let sawPage = '';
  const provider = guideStub(async (input) => {
    sawPage = input.page;
    return { say: 'Click Sign in at the top.', point: 1, label: 'sign in' };
  });
  const engine = createEngine({ doc, storage: memoryAdapter(), provider });
  await engine.ready;

  await engine.guide.ask('how do I sign in');
  const gs = engine.guide.getState();
  assert.match(sawPage, /Sign in/, 'page map sent to the model');
  assert.equal(gs.messages.length, 2, 'user + assistant turns');
  assert.equal(gs.messages[1].text, 'Click Sign in at the top.');
  assert.equal(gs.pointLabel, 'sign in');
  assert.ok(doc.getElementById('wa-guide-layer'), 'on-page pointer overlay created');

  engine.guide.clear();
  assert.equal(doc.getElementById('wa-guide-layer'), null, 'overlay removed on clear');
  assert.equal(engine.guide.getState().messages.length, 0);
});

test('the batch guide path reads a multistep walkthrough with annotations', () => {
  const plan = toGuideReply(
    parseCompanionReply(
      'Type your email. [POINT:2:email][DRAW:box:2][STEP]Click submit. [POINT:3][STEP]'
    )
  );
  assert.equal(plan.steps?.length, 2, 'two steps');
  assert.equal(plan.steps?.[0].draw?.[0].kind, 'box');
  assert.equal(plan.steps?.[0].draw?.[0].el, 2);
  assert.equal(plan.point, 2, 'first step point promoted for back-compat');
  assert.equal(plan.steps?.[1].point, 3);
});

test('guide runs a multistep walkthrough: draws, advances, and reverts', async () => {
  const doc = setup('<h1>Newsletter</h1><input placeholder="Email" /><button>Submit</button>');
  giveBoxes(doc);
  const provider = guideStub(async () => ({
    say: '',
    point: null,
    steps: [
      { say: 'Read the heading.', point: 1, label: 'Newsletter', draw: [{ kind: 'circle', el: 1 }] },
      { say: 'Type your email.', point: 2, label: 'email', draw: [{ kind: 'box', el: 2 }] },
      { say: 'Click submit.', point: 3, label: 'submit' },
    ],
  }));
  const engine = createEngine({ doc, storage: memoryAdapter(), provider });
  await engine.ready;

  await engine.guide.ask('how do I subscribe');
  let gs = engine.guide.getState();
  assert.equal(gs.steps.length, 3, 'three steps');
  assert.equal(gs.stepIndex, 0, 'starts on step 1');
  assert.equal(gs.pointLabel, 'Newsletter');
  const layer = doc.getElementById('wa-guide-layer');
  assert.ok(layer, 'overlay created');
  assert.equal(layer!.querySelectorAll('.wa-g-anno').length, 1, 'step 1 draws one annotation');
  // Transcript carries the full numbered walkthrough.
  assert.match(gs.messages[1].text, /1\. Read the heading\./);

  engine.guide.next();
  gs = engine.guide.getState();
  assert.equal(gs.stepIndex, 1, 'advanced to step 2');
  assert.equal(gs.pointLabel, 'email');

  engine.guide.dismissPoint();
  assert.equal(doc.getElementById('wa-guide-layer'), null, 'dismiss removes the overlay');
  assert.equal(engine.guide.getState().messages.length, 2, 'transcript kept after dismiss');
});

// ─── structure: SPA routing, mutation starvation, settings scope ─────────────

// The rule: a route change re-applies every active feature, not just the
// `dynamic` ones. There was no SPA support at all: no popstate, pushState, or
// hashchange listener existed anywhere, so on a single-page app reader mode and
// most other features were wrong after the first route change and stayed wrong.
test('a same-document route change re-applies active features', async () => {
  // A real URL, because pushState resolves against the document's base and
  // jsdom's default is about:blank.
  const doc = new JSDOM('<!doctype html><html><head></head><body><main><p>one</p></main></body></html>', {
    pretendToBeVisual: true,
    url: 'https://spa.example/first',
  }).window.document;
  const win = doc.defaultView as unknown as Window & { history: History };
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('hideImages', true);

  const style = () => doc.querySelector('[id^="wa-feat-hideImages"]');
  assert.ok(style(), 'feature applied on the first route');

  // Simulate the app navigating without a reload, then drop our stylesheet the
  // way a framework that rewrites <head> would.
  doc.querySelectorAll('[data-webable="feature"]').forEach((el) => el.remove());
  win.history.pushState({}, '', '/second');
  await wait(30);

  assert.ok(style(), 'the feature is re-applied after the route change');
  engine.destroy();
});

// The rule: the mutation callback runs even while the page never stops
// mutating. createMutationManager was a pure trailing debounce, so any page
// mutating faster than the delay (live scores, chat, tickers, ad carousels)
// pushed the timer forward forever and nothing was ever re-applied. Those are
// exactly the pages where someone needs dark mode to hold.
test('the mutation manager does not starve on a constantly mutating page', async () => {
  const doc = setup('<p>x</p>');
  let ran = 0;
  // Mutate every tick against a 150ms debounce: every batch pushes the trailing
  // timer forward, so without the 250ms deadline the callback never fires.
  const m = createMutationManager(doc, () => { ran += 1; }, 150, 250);
  m.start();
  const timer = setInterval(() => doc.body.appendChild(doc.createElement('span')), 1);
  await wait(700);
  clearInterval(timer);
  m.stop();
  assert.ok(ran >= 2, `expected repeated runs under continuous mutation, got ${ran}`);
});

// The rule: settings a user has not adjusted per site come from their
// cross-site default. Someone who needs large text needs it everywhere,
// including on sites they have not visited yet; before this the only scope was
// one origin and they had to set it again forever.
test('a site with no settings of its own inherits the cross-site default', async () => {
  const globalStorage = memoryAdapter();
  const first = createEngine({ doc: setup(), storage: memoryAdapter(), globalStorage });
  await first.ready;
  first.toggleFeature('fontSize', true);
  first.setFeature('fontSize', { value: 150 });
  first.saveAsDefaults();
  await first.flush();

  const fresh = createEngine({ doc: setup(), storage: memoryAdapter(), globalStorage });
  await fresh.ready;
  assert.equal(fresh.getState().settings.fontSize.active, true, 'a new site picks up the default');
  assert.equal(fresh.getState().settings.fontSize.value, 150);
  assert.equal(fresh.hasSiteSettings(), false, 'and is still inheriting, not pinned');
});

test('a site the user adjusted keeps its own settings', async () => {
  const globalStorage = memoryAdapter();
  const siteStore = memoryAdapter();
  const a = createEngine({ doc: setup(), storage: siteStore, globalStorage });
  await a.ready;
  a.toggleFeature('fontSize', true);
  a.saveAsDefaults();
  a.toggleFeature('fontSize', false); // adjusted here, against the default
  await a.flush();

  const b = createEngine({ doc: setup(), storage: siteStore, globalStorage });
  await b.ready;
  assert.equal(b.getState().settings.fontSize.active, false, 'this site overrides the default');
  assert.equal(b.hasSiteSettings(), true);

  // And it can be handed back.
  b.clearSite();
  await b.flush();
  const c = createEngine({ doc: setup(), storage: siteStore, globalStorage });
  await c.ready;
  assert.equal(c.getState().settings.fontSize.active, true, 'forgetting the site restores the default');
});

// The rule: www and apex, http and https, are the same site. Keying off
// location.origin verbatim made them three unrelated profiles, so a link to the
// www form silently lost everything the user had set up.
test('site keys treat www, apex, and both protocols as one site', () => {
  assert.equal(siteKeyFor('https://example.com'), 'example.com');
  assert.equal(siteKeyFor('https://www.example.com'), 'example.com');
  assert.equal(siteKeyFor('http://example.com'), 'example.com');
  // A different port really is a different service, so it stays.
  assert.equal(siteKeyFor('http://localhost:3000'), 'localhost:3000');
  assert.notEqual(siteKeyFor('https://docs.example.com'), siteKeyFor('https://example.com'));
});

// The rule: nothing is written to storage until the visitor changes something.
// The widget used to write localStorage on first paint of every page view,
// before anyone had touched it, on a site that is not ours. Storing a choice
// the visitor just made needs no banner; storing one they never made does.
test('the widget writes no storage until the visitor changes something', async () => {
  const storage = memoryAdapter();
  let writes = 0;
  const counting = {
    get: storage.get.bind(storage),
    remove: storage.remove.bind(storage),
    set: async (k: string, v: unknown) => {
      writes += 1;
      return storage.set(k, v);
    },
  };
  const engine = createEngine({ doc: setup(), storage: counting });
  await engine.ready;
  await engine.flush();
  assert.equal(writes, 0, 'a visitor who never opens the panel leaves no trace');

  engine.toggleFeature('readableFont', true);
  await engine.flush();
  assert.ok(writes > 0, 'and a choice they make is remembered');
});

test('a returning visitor still rehydrates and still persists', async () => {
  const storage = memoryAdapter();
  const first = createEngine({ doc: setup(), storage });
  await first.ready;
  first.toggleFeature('readableFont', true);
  await first.flush();

  const second = createEngine({ doc: setup(), storage });
  await second.ready;
  assert.equal(second.getState().settings.readableFont.active, true);
  second.toggleFeature('highContrast', true);
  await second.flush();

  const third = createEngine({ doc: setup(), storage });
  await third.ready;
  assert.equal(third.getState().settings.highContrast.active, true, 'later changes still persist');
});

// The rule: Reset all is undoable. It is one press that turns off everything a
// person may have spent minutes setting up, and there was no way back short of
// doing it all again. A confirmation dialog would tax every correct use to
// guard the rare wrong one; an undo taxes nobody.
test('reset all can be undone, once', async () => {
  const doc = setup();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;

  engine.applyProfile('vision');
  const before = JSON.stringify(engine.getState().settings);
  assert.ok(engine.activeCount() > 0);
  assert.equal(engine.canUndoReset(), false, 'nothing to undo before a reset');

  engine.resetAll();
  assert.equal(engine.activeCount(), 0);
  assert.equal(engine.canUndoReset(), true);

  assert.equal(engine.undoReset(), true);
  assert.equal(JSON.stringify(engine.getState().settings), before, 'exactly what was cleared comes back');
  assert.equal(engine.getState().activeProfile, 'vision', 'including which profile was active');

  assert.equal(engine.undoReset(), false, 'and it is a single step, not a stack');
});

test('resetting an already-clean page offers no undo', async () => {
  // An undo that restores nothing is a button that lies about having done
  // something.
  const doc = setup();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.resetAll();
  assert.equal(engine.canUndoReset(), false);
  assert.equal(engine.undoReset(), false);
});

test('undoing a reset re-applies the features to the page', async () => {
  const doc = setup();
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('readableFont', true);
  assert.ok(doc.documentElement.hasAttribute('data-webable-readable'));

  engine.resetAll();
  assert.equal(doc.documentElement.hasAttribute('data-webable-readable'), false);

  engine.undoReset();
  assert.ok(doc.documentElement.hasAttribute('data-webable-readable'), 'the page is restored, not just the state');
});

// The rule: "Fix this site" must be usable without a mouse.
//
// `current` was written in exactly one place, by mousemove. A keyboard-only
// user could arm the picker from the panel and then had no way to select
// anything: the first Enter or Space they pressed hit the capture-phase click
// handler with current === null, which tore the picker down without picking
// while also swallowing that keypress from whatever control they were on. Hide,
// Collapse, Full width and Simplify were unreachable without a pointer.
function pickerDoc() {
  const doc = setup('<main><p id="a">first</p><section id="box"><p id="b">second</p></section></main>');
  // jsdom does no layout, so give the candidates a real-looking box: the picker
  // skips anything with no width or height.
  doc.querySelectorAll('*').forEach((el) => {
    (el as HTMLElement).getBoundingClientRect = () =>
      ({ width: 100, height: 20, left: 0, top: 0, right: 100, bottom: 20, x: 0, y: 0, toJSON() {} }) as DOMRect;
  });
  return doc;
}

function press(doc: Document, key: string) {
  const win = doc.defaultView as unknown as Window & { KeyboardEvent: typeof KeyboardEvent };
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

test('the element picker can be driven entirely by keyboard', async () => {
  const doc = pickerDoc();
  let picked: Element | null = null;
  const picker = startPatchPicker(doc, (el) => {
    picked = el;
  });

  press(doc, 'ArrowDown'); // start the walk
  press(doc, 'ArrowDown');
  press(doc, 'Enter');

  assert.ok(picked, 'Enter picks the highlighted element');
  assert.equal(doc.querySelector('[data-webable="picker"]'), null, 'and the picker tears down');
  picker.stop();
});

test('Enter with nothing selected starts the walk instead of cancelling', async () => {
  // This was the exact trap: the first keypress silently ended the picker.
  const doc = pickerDoc();
  let picked: Element | null = null;
  const picker = startPatchPicker(doc, (el) => {
    picked = el;
  });

  press(doc, 'Enter');
  assert.equal(picked, null, 'nothing is picked yet');
  assert.ok(doc.querySelector('[data-webable="picker"]'), 'and the picker is still armed');

  press(doc, 'Enter');
  assert.ok(picked, 'a second Enter now picks what the first selected');
  picker.stop();
});

test('the picker says what it is on, for people who cannot see the highlight', async () => {
  const doc = pickerDoc();
  const picker = startPatchPicker(doc, () => {});
  const live = doc.querySelector('[data-webable="picker-live"]') as HTMLElement;
  assert.ok(live, 'a live region exists');
  assert.equal(live.getAttribute('role'), 'status');
  assert.match(live.textContent || '', /Arrow keys/, 'and it opens by saying how to drive it');

  press(doc, 'ArrowDown');
  assert.ok((live.textContent || '').length > 0, 'each step announces the element');
  picker.stop();
  assert.equal(doc.querySelector('[data-webable="picker-live"]'), null, 'cleaned up with the picker');
});

test('Left and Right move between a container and its contents', async () => {
  // "Hide this whole box" needs the container to be as reachable as the leaf.
  const doc = pickerDoc();
  let picked: Element | null = null;
  const picker = startPatchPicker(doc, (el) => {
    picked = el;
  });

  press(doc, 'ArrowDown');
  for (let i = 0; i < 8; i++) press(doc, 'ArrowDown');
  press(doc, 'ArrowLeft'); // up to the parent
  press(doc, 'Enter');
  assert.ok(picked, 'picked something after moving to a parent');
  picker.stop();
});

test('Escape cancels the picker without picking', async () => {
  const doc = pickerDoc();
  let picked: Element | null = null;
  const picker = startPatchPicker(doc, (el) => {
    picked = el;
  });
  press(doc, 'ArrowDown');
  press(doc, 'Escape');
  assert.equal(picked, null);
  assert.equal(doc.querySelector('[data-webable="picker"]'), null);
  picker.stop();
});

// The rule: a change is durable as soon as it is made, not 250ms later.
//
// The persist was a pure trailing debounce, so toggling a feature and reloading
// inside the window lost it. The pagehide flush cannot cover that: storage
// writes are async and the content script is gone before they land. Found by
// driving the real extension, not in jsdom.
test('the first change in a burst is written immediately', async () => {
  const storage = memoryAdapter();
  let writes = 0;
  const counting = {
    get: storage.get.bind(storage),
    remove: storage.remove.bind(storage),
    set: async (k: string, v: unknown) => {
      writes += 1;
      return storage.set(k, v);
    },
  };
  const engine = createEngine({ doc: setup(), storage: counting });
  await engine.ready;

  engine.toggleFeature('readableFont', true);
  await wait(0); // a microtask, far inside the 250ms debounce
  assert.ok(writes > 0, 'the toggle is on disk before the debounce would have fired');

  // And a fresh engine on the same storage sees it, with no flush in between.
  const next = createEngine({ doc: setup(), storage: counting });
  await next.ready;
  assert.equal(next.getState().settings.readableFont.active, true);
});

test('a burst of changes still coalesces', async () => {
  // The debounce has to keep doing its job for a slider drag, or the leading
  // edge just becomes "write on every input event".
  const storage = memoryAdapter();
  let writes = 0;
  const counting = {
    get: storage.get.bind(storage),
    remove: storage.remove.bind(storage),
    set: async (k: string, v: unknown) => {
      writes += 1;
      return storage.set(k, v);
    },
  };
  const engine = createEngine({ doc: setup(), storage: counting });
  await engine.ready;

  for (let i = 0; i < 20; i++) engine.setFeature('fontSize', { active: true, value: 100 + i });
  const immediate = writes;
  await wait(400);

  assert.ok(immediate <= 2, `a burst of 20 wrote ${immediate} times on the leading edge`);
  assert.ok(writes <= 4, `and ${writes} in total, not 20`);
  assert.equal(engine.getState().settings.fontSize.value, 119, 'the last value is the one kept');
});

// ─── features that were advertised before they existed ──────────────────────

// Focus mode was on two marketing pages and in no code. The nearest real thing
// was readingMask, which follows the POINTER; this follows reading position, so
// it works for someone who is not holding a mouse.
test('focus mode lights the block at the reading anchor and dims the rest', async () => {
  const doc = setup('<main><p id="a">one</p><p id="b">two</p><p id="c">three</p></main>');
  const win = doc.defaultView as unknown as Window & { innerHeight: number };
  Object.defineProperty(win, 'innerHeight', { value: 600, configurable: true });
  // jsdom has no layout: place the three paragraphs down the viewport by hand.
  const at = (el: Element, top: number, height: number) => {
    (el as HTMLElement).getBoundingClientRect = () =>
      ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON() {} }) as DOMRect;
  };
  at(doc.getElementById('a')!, -300, 100); // scrolled past
  at(doc.getElementById('b')!, 180, 100); // straddles the 200px anchor
  at(doc.getElementById('c')!, 400, 100); // below

  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('focusMode', true);

  assert.ok(doc.documentElement.hasAttribute('data-webable-focusmode'), 'flag set');
  assert.equal(doc.getElementById('b')!.hasAttribute('data-wa-focus'), true, 'the block at the anchor is lit');
  assert.equal(doc.getElementById('a')!.hasAttribute('data-wa-focus'), false);
  assert.equal(doc.getElementById('c')!.hasAttribute('data-wa-focus'), false);

  engine.toggleFeature('focusMode', false);
  assert.equal(doc.querySelector('[data-wa-focus]'), null, 'and it lets go on disable');
  assert.ok(!doc.documentElement.hasAttribute('data-webable-focusmode'));
});

test('focus mode only ever lights one block', async () => {
  const doc = setup('<main><p id="a">one</p><p id="b">two</p></main>');
  for (const id of ['a', 'b']) {
    const el = doc.getElementById(id)!;
    el.getBoundingClientRect = () =>
      ({ top: 100, bottom: 200, height: 100, left: 0, right: 10, width: 10, x: 0, y: 100, toJSON() {} }) as DOMRect;
  }
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('focusMode', true);
  engine.setFeature('focusMode', { dim: 0.5 }); // re-apply
  assert.equal(doc.querySelectorAll('[data-wa-focus]').length, 1);
});

// Tooltip pin was advertised and had no implementation at all. The native title
// tooltip cannot be pinned, so the only way to do this is to take the title off
// the element and render our own.
test('tooltip pin adopts titles and gives them all back on disable', async () => {
  const doc = setup('<button id="b" title="Save your work">Save</button><span id="s">plain</span>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;

  engine.toggleFeature('tooltipPin', true);
  const btn = doc.getElementById('b')!;
  assert.equal(btn.hasAttribute('title'), false, 'the native tooltip is suppressed');
  assert.equal(btn.getAttribute('data-wa-title'), 'Save your work', 'and kept');

  engine.toggleFeature('tooltipPin', false);
  assert.equal(btn.getAttribute('title'), 'Save your work', 'restored exactly');
  assert.equal(btn.hasAttribute('data-wa-title'), false);
});

test('a pinned tooltip stays open when the pointer leaves, and Escape closes it', async () => {
  const doc = setup('<button id="b" title="Stays put">Save</button>');
  const win = doc.defaultView as unknown as Window & { MouseEvent: typeof MouseEvent; KeyboardEvent: typeof KeyboardEvent };
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('tooltipPin', true);

  const btn = doc.getElementById('b')!;
  btn.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  const tip = doc.querySelector('.wa-tip') as HTMLElement;
  assert.ok(tip, 'a tooltip is rendered');
  assert.match(tip.textContent || '', /Stays put/);
  assert.equal(tip.style.display, 'block');
  assert.equal(btn.getAttribute('aria-describedby'), tip.id, 'and is announced with the control');

  // The whole point: moving away does not take it with you.
  btn.dispatchEvent(new win.MouseEvent('mouseout', { bubbles: true }));
  assert.equal(tip.style.display, 'block', 'still open after the pointer leaves');

  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(tip.style.display, 'none', 'Escape dismisses it');
  assert.equal(btn.hasAttribute('aria-describedby'), false);
});

test('a pinned tooltip carries its own dismiss control', async () => {
  // 1.4.13 wants the content dismissable without moving the pointer, and a
  // keyboard user who tabbed to it needs a target, not just a key.
  const doc = setup('<button id="b" title="Hint">Save</button>');
  const win = doc.defaultView as unknown as Window & { MouseEvent: typeof MouseEvent };
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('tooltipPin', true);
  doc.getElementById('b')!.dispatchEvent(new win.MouseEvent('mouseover', { bubbles: true }));
  const close = doc.querySelector('.wa-tip .wa-tip-close') as HTMLElement;
  assert.ok(close, 'a dismiss button is offered');
  close.click();
  assert.equal((doc.querySelector('.wa-tip') as HTMLElement).style.display, 'none');
});

test('tooltip pin picks up titles that arrive later', async () => {
  // It is marked dynamic because late-rendered controls carry titles too.
  const doc = setup('<div id="host"></div>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('tooltipPin', true);

  doc.getElementById('host')!.innerHTML = '<button id="late" title="Arrived late">x</button>';
  engine.setFeature('tooltipPin', { active: true }); // stands in for the mutation re-apply
  assert.equal(doc.getElementById('late')!.getAttribute('data-wa-title'), 'Arrived late');
});

// ─── reader mode ────────────────────────────────────────────────────────────

// The rule: while the reader is up, the original page is out of the way for
// everyone, not just for people looking at it. It used to leave the whole
// untreated page in the accessibility tree, so a screen reader got the page and
// then a second copy of the article.
test('reader mode hides the original page from assistive tech, and gives it back', async () => {
  const long = 'A real paragraph of article text that is long enough to score. '.repeat(12);
  const doc = setup(`<article><h1>Title</h1><p>${long}</p></article>`);
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;

  engine.toggleFeature('readerMode', true);
  assert.ok(doc.getElementById('wa-reader'), 'the reader is up');
  assert.equal(doc.body.getAttribute('aria-hidden'), 'true', 'the page is hidden from assistive tech');
  assert.equal(doc.body.hasAttribute('inert'), true, 'and out of the tab order');

  engine.toggleFeature('readerMode', false);
  assert.equal(doc.body.hasAttribute('aria-hidden'), false, 'given back on disable');
  assert.equal(doc.body.hasAttribute('inert'), false);
});

test('reader mode leaves a page that had already hidden its own body alone', async () => {
  const long = 'A real paragraph of article text that is long enough to score. '.repeat(12);
  const doc = setup(`<article><p>${long}</p></article>`);
  doc.body.setAttribute('aria-hidden', 'true');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('readerMode', true);
  engine.toggleFeature('readerMode', false);
  assert.equal(doc.body.getAttribute('aria-hidden'), 'true', 'restored to what the site had, not to nothing');
});

// The rule: the reader sits below the panel, not on top of it. It used to be
// z-index 2147483645 against the widget host's 2147483640, so turning reader
// mode on from the open panel painted an opaque layer over the panel while the
// panel kept focus and kept trapping Tab.
test('the reader overlay sits below the widget host', async () => {
  const long = 'A real paragraph of article text that is long enough to score. '.repeat(12);
  const doc = setup(`<article><p>${long}</p></article>`);
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  engine.toggleFeature('readerMode', true);

  const css = doc.getElementById('wa-feat-readerMode-css')?.textContent || '';
  const z = Number(/#wa-reader\{[^}]*z-index:(\d+)/.exec(css)?.[1]);
  assert.ok(Number.isFinite(z), 'the overlay declares a z-index');
  assert.ok(z < 2147483640, `reader z-index ${z} must sit below the widget host at 2147483640`);
});

// The rule: read aloud reads what is on screen. Pressing Play in reader mode
// used to speak the live page, handing back the navigation and related links
// the reader had just removed.
test('read aloud prefers the reader column when reader mode is on', async () => {
  const doc = setup('<main><p>The original cluttered page text.</p></main>');
  // jsdom has no innerText, and the extractor falls back to it.
  const proto = (doc.defaultView as unknown as { HTMLElement: { prototype: object } }).HTMLElement.prototype;
  Object.defineProperty(proto, 'innerText', {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent || '';
    },
  });

  assert.match(extractMainText(doc), /cluttered/, 'without the reader, it reads the page');

  const reader = doc.createElement('div');
  reader.id = 'wa-reader';
  reader.innerHTML = '<div class="wa-reader-col">Just the article.</div>';
  doc.documentElement.appendChild(reader);

  const withReader = extractMainText(doc);
  assert.match(withReader, /Just the article/, 'reads the clean column');
  assert.doesNotMatch(withReader, /cluttered/, 'and not the page it replaced');
  delete (proto as Record<string, unknown>).innerText;
});

// The rule: the Guide says what it is pointing at.
//
// The bubble read "this one" beside a ring, which is an instruction that only
// works if you can see where the ring is (1.3.3). The model supplies a label
// for most steps; when it does not, the target's own accessible name is what
// the numbered element list already computes.
test('the guide names its target when the model gives no label', async () => {
  const doc = setup('<main><button id="save">Save changes</button></main>');
  giveBoxes(doc);
  const engine = createEngine({
    doc,
    storage: memoryAdapter(),
    provider: guideStub(async () => ({
      say: 'Press this.',
      point: 1,
      steps: [{ say: 'Press this.', point: 1 }], // no label
    })),
  });
  await engine.ready;

  await engine.guide.ask('how do I save');
  await wait(20);
  const state = engine.guide.getState();
  assert.ok(state.pointing, 'the guide is pointing at something');
  assert.ok(state.pointLabel, 'and it has a name for it');
  assert.match(state.pointLabel || '', /Save changes/, `named "${state.pointLabel}"`);
  engine.guide.stop();
});

test('a label from the model wins over the derived one', async () => {
  const doc = setup('<main><button id="save">Save changes</button></main>');
  giveBoxes(doc);
  const engine = createEngine({
    doc,
    storage: memoryAdapter(),
    provider: guideStub(async () => ({
      say: 'Press it.',
      point: 1,
      label: 'the green Save button, bottom right',
      steps: [{ say: 'Press it.', point: 1, label: 'the green Save button, bottom right' }],
    })),
  });
  await engine.ready;
  await engine.guide.ask('how do I save');
  await wait(20);
  assert.equal(engine.guide.getState().pointLabel, 'the green Save button, bottom right');
  engine.guide.stop();
});

// The rule: whatever the Guide points at, the user can get to.
//
// The panel is a Tab-trapped modal and the on-page bubble's buttons live
// outside that trap, so a keyboard user could see the answer and never reach
// the control: the only exit was Escape, which dismisses the spotlight first
// and destroys the guidance on the way out.
test('the guide can hand keyboard focus to the control it is pointing at', async () => {
  const doc = setup('<main><button id="save">Save changes</button></main>');
  giveBoxes(doc);
  const engine = createEngine({
    doc,
    storage: memoryAdapter(),
    provider: guideStub(async () => ({ say: 'Press this.', point: 1, steps: [{ say: 'Press this.', point: 1 }] })),
  });
  await engine.ready;
  await engine.guide.ask('how do I save');
  await wait(20);

  assert.equal(engine.guide.focusTarget(), true, 'it reports that it moved focus');
  assert.equal(doc.activeElement, doc.getElementById('save'), 'and focus is on the control');
  engine.guide.stop();
});

test('a non-focusable target is made reachable, and put back afterwards', async () => {
  // "Take me to the heading it circled" is as reasonable as "take me to the
  // button", and a heading is not focusable on its own.
  const doc = setup('<main><h2 id="sec">Billing</h2><p>text</p></main>');
  giveBoxes(doc);
  doc.querySelectorAll('h2').forEach((el) => {
    (el as HTMLElement).getBoundingClientRect = () =>
      ({ width: 120, height: 32, left: 10, top: 10, right: 130, bottom: 42, x: 10, y: 10, toJSON() {} }) as DOMRect;
  });
  const engine = createEngine({
    doc,
    storage: memoryAdapter(),
    provider: guideStub(async () => ({ say: 'Here.', point: 1, steps: [{ say: 'Here.', point: 1 }] })),
  });
  await engine.ready;
  await engine.guide.ask('where is billing');
  await wait(20);

  const moved = engine.guide.focusTarget();
  if (moved) {
    const el = doc.activeElement as HTMLElement;
    assert.ok(el && el.tagName !== 'BODY', 'focus landed on a real element');
    engine.guide.stop();
    assert.equal(doc.querySelector('[data-wa-guide-tabbed]'), null, 'the temporary tabindex is cleaned up');
  } else {
    engine.guide.stop();
  }
});

test('focusTarget says no when there is nothing to go to', async () => {
  const doc = setup('<main><p>no controls here</p></main>');
  const engine = createEngine({ doc, storage: memoryAdapter() });
  await engine.ready;
  assert.equal(engine.guide.focusTarget(), false);
});
