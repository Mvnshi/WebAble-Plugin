/**
 * The loader's contract with a site owner. Everything here failed silently
 * before, which for an embedded widget means "the accessibility tools are
 * missing and nobody knows".
 *
 * The loader is an IIFE that runs on import, so each test builds a fresh jsdom,
 * installs it as the ambient globals, and re-imports the module with a cache
 * buster. That is the only way to exercise a script whose whole job is to run
 * once against the document it finds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';

// scripts/test-core.mjs builds the loader here with the same esbuild settings
// the real widget build uses, so this exercises the file that ships rather
// than the TypeScript source.
const LOADER = join(process.cwd(), '.test-dist/widget-loader.js');
if (!existsSync(LOADER)) {
  throw new Error(`${LOADER} is missing. Run the tests through scripts/test-core.mjs.`);
}
const LOADER_SRC = readFileSync(LOADER, 'utf8');

interface Loaded {
  win: Window & typeof globalThis & Record<string, unknown>;
  doc: Document;
  errors: string[];
}

/** Run the loader against a fresh document carrying the given script tag. */
function runLoader(tag: string, opts: { modules?: boolean } = {}): Loaded {
  const dom = new JSDOM(`<!doctype html><html><head>${tag}</head><body><p>host page</p></body></html>`, {
    url: 'https://host.example/page',
    // Gives window.eval a real jsdom global scope. Without it, eval runs in
    // Node's context and the loader cannot see `window` at all.
    runScripts: 'outside-only',
  });
  const win = dom.window as unknown as Window & typeof globalThis & Record<string, unknown>;
  const doc = dom.window.document;

  // jsdom does not run <script src>, so point currentScript at the tag the way
  // a browser would while the loader executes.
  const tagEl = doc.querySelector('script[src]') as HTMLScriptElement | null;
  Object.defineProperty(doc, 'currentScript', { value: tagEl, configurable: true });
  // An async script runs once the document is parsed. jsdom leaves readyState
  // at 'loading' until its own load event, which would send the loader down the
  // DOMContentLoaded path and inject nothing during this call.
  Object.defineProperty(doc, 'readyState', { value: 'complete', configurable: true });

  // jsdom does not implement `noModule`, which is the standard feature check
  // for ES module support, so every browser would look ancient to the loader.
  // Add it unless the test is deliberately simulating an old one.
  const proto = (dom.window as unknown as { HTMLScriptElement: { prototype: object } }).HTMLScriptElement.prototype;
  if (opts.modules !== false) {
    Object.defineProperty(proto, 'noModule', { value: false, configurable: true, writable: true });
  } else {
    delete (proto as Record<string, unknown>).noModule;
  }

  const errors: string[] = [];
  (win as unknown as { console: Console }).console = {
    ...console,
    error: (...args: unknown[]) => errors.push(args.map(String).join(' ')),
  } as unknown as Console;

  (dom.window as unknown as { eval(code: string): void }).eval(LOADER_SRC);
  return { win, doc, errors };
}

const TAG = '<script src="https://cdn.example/widget.js" async></script>';

test('the documented API exists before the module lands', () => {
  // `<button onclick="WebAble.open()">` is the snippet on the widget page. It
  // used to throw, because window.WebAble does not exist until an async module
  // has finished loading, so an early press did nothing but log an error.
  const { win } = runLoader(TAG);
  const api = win.WebAble as Record<string, unknown>;
  assert.ok(api, 'window.WebAble is present immediately');
  for (const name of ['open', 'close', 'toggle', 'destroy', 'apply', 'set', 'applyProfile', 'reset']) {
    assert.equal(typeof api[name], 'function', `${name} is callable`);
  }
  assert.doesNotThrow(() => (api.open as () => void)());
});

test('calls made before the module lands are queued for replay', () => {
  const { win } = runLoader(TAG);
  const api = win.WebAble as Record<string, (...a: unknown[]) => void>;
  api.open();
  api.set('readableFont', true);
  // Structural compare: the arrays are built in the jsdom realm, so deepEqual
  // would fail on prototype identity alone.
  assert.deepEqual(JSON.parse(JSON.stringify(win.__WEBABLE_QUEUE__)), [
    ['open', []],
    ['set', ['readableFont', true]],
  ]);
});

test('the module URL is derived from the loader, with the query carried over', () => {
  // `widget.js?v=...` used to bust the cache for the 1.8 KB loader only, while
  // the 50 KB behind it kept coming from cache, so a site owner who bumped the
  // version had not actually shipped anything.
  const { doc } = runLoader('<script src="https://cdn.example/widget.js?v=2.6.0" async></script>');
  const boot = doc.querySelector('script[data-webable-boot]') as HTMLScriptElement;
  assert.ok(boot, 'boot module injected');
  assert.equal(boot.src, 'https://cdn.example/webable/boot.js?v=2.6.0');
  assert.equal(boot.type, 'module');
});

test('a CSP nonce on the loader is copied to the module it injects', () => {
  // Without this the module is blocked by a nonce-based policy and the widget
  // is simply absent, with nothing in the console to say why.
  const { doc } = runLoader('<script src="https://cdn.example/widget.js" nonce="r4nd0m" async></script>');
  const boot = doc.querySelector('script[data-webable-boot]') as HTMLScriptElement;
  assert.equal(boot.getAttribute('nonce'), 'r4nd0m');
});

test('a module that fails to load says so', () => {
  const { doc, errors } = runLoader(TAG);
  const boot = doc.querySelector('script[data-webable-boot]') as HTMLScriptElement;
  assert.equal(typeof boot.onerror, 'function', 'an error handler is attached');
  boot.onerror!(new (doc.defaultView as unknown as { Event: typeof Event }).Event('error'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\[WebAble\]/);
  assert.match(errors[0], /Content-Security-Policy/, 'names the most likely cause');
  assert.match(errors[0], /boot\.js/, 'and the URL it tried');
});

test('a browser without ES modules is told, instead of nothing happening', () => {
  const { doc, errors } = runLoader(TAG, { modules: false });
  assert.equal(doc.querySelector('script[data-webable-boot]'), null, 'no module is injected');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /does not support ES modules/);
});

test('data attributes map to config, and the dead site key is gone', () => {
  // `data-webable-key` was advertised as the primary attribute and read into a
  // `siteId` that nothing consumed. There is no account system to identify
  // against, so it is not read at all rather than pretending.
  const { win } = runLoader(
    '<script src="https://cdn.example/widget.js" data-webable-name="Acme" ' +
      'data-webable-color="#ff0000" data-webable-attribution="false" ' +
      'data-webable-key="SITE_ID" async></script>',
  );
  const cfg = win.WebAbleConfig as Record<string, unknown>;
  assert.equal(cfg.name, 'Acme');
  assert.equal(cfg.color, '#ff0000');
  assert.equal(cfg.attribution, false);
  assert.equal('siteId' in cfg, false, 'no dead siteId in the config');
});

test('the loader runs once, however many tags a page has', () => {
  const { doc } = runLoader(TAG + TAG);
  assert.equal(doc.querySelectorAll('script[data-webable-boot]').length, 1);
});
