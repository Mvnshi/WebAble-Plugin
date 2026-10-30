/**
 * Smoke-tests the SHIPPED widget bundle (public/webable/boot.js), not the
 * source, proves the minified artifact a site owner actually loads will boot,
 * re-apply a persisted setting on load, mount the launcher in a shadow root,
 * and respond to the public window.WebAble API. Run after `npm run build:widget`.
 */
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bootUrl = pathToFileURL(join(root, 'dist/webable/boot.js')).href;

const dom = new JSDOM('<!doctype html><html><head></head><body><h1>Hi</h1><p>Some readable text.</p></body></html>', {
  url: 'https://shipped.test/',
  pretendToBeVisual: true,
});
const w = dom.window;
const g = globalThis;
for (const k of ['window', 'document', 'HTMLElement', 'Node', 'ShadowRoot', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'localStorage', 'navigator', 'DOMParser']) {
  try { g[k] = w[k]; } catch { /* read-only globals (navigator), ignore */ }
}
// Define rAF BEFORE importing the bundle so the bundled Preact uses it.
g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id) => clearTimeout(id);
g.fetch = w.fetch || (() => Promise.reject(new Error('no fetch')));

// Pre-seed a persisted setting; the bundle must re-apply it on load.
w.localStorage.setItem(
  'webable:settings:v1',
  JSON.stringify({ version: 1, settings: { highContrast: { active: true, level: 1.5 } }, activeProfile: null, ui: { theme: 'auto', accent: '#1e40af', position: 'bottom-right', launcherOffset: null, language: 'en' } }),
);

w.WebAbleConfig = {};
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
// Poll a predicate until it holds (the panel is a lazily-imported chunk, so its
// render lands several event-loop turns after open(), a single fixed wait races
// the dynamic import on slower machines). Fails only if it never appears.
const waitFor = async (msg, fn, timeout = 4000) => {
  const start = Date.now();
  for (;;) {
    if (fn()) return;
    if (Date.now() - start > timeout) { assert.ok(false, msg); return; }
    await tick(25);
  }
};

await import(bootUrl);
const api = w.WebAble;
assert.ok(api, 'window.WebAble exposed by the bundle');
await api.engine.ready;
await tick();

// 1) launcher mounted in a shadow root on <html>
const host = w.document.getElementById('webable-widget-root');
assert.ok(host && host.shadowRoot, 'shadow host mounted');
assert.ok(host.shadowRoot.querySelector('.wa-launcher'), 'launcher rendered');

// 2) persisted high-contrast re-applied to the page on load
assert.match(w.document.documentElement.style.getPropertyValue('--wa-f-contrast'), /contrast\(/, 'persisted setting re-applied on load');

// 3) public API drives features + opens the panel
api.applyProfile('dyslexia');
await tick();
assert.ok(w.document.documentElement.hasAttribute('data-webable-spacing'), 'applyProfile() reached the page');
api.open();
await waitFor('open() shows the panel', () => host.shadowRoot.querySelector('.wa-panel'));
api.reset();
await tick();
assert.ok(!w.document.documentElement.hasAttribute('data-webable-spacing'), 'reset() reverted the page');

console.log('✓ shipped bundle smoke test passed (mount, persist-on-load, API, revert)');
process.exit(0);
