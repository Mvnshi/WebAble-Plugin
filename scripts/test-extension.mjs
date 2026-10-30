/**
 * Runs the built extension in a real Chromium and checks the things that only
 * a browser can answer.
 *
 * This existed as a line in QA.md that said "load the unpacked extension and
 * try it", which is not a test and had never been done for any of: the
 * document_start move, the three-way storage split, the credential migration
 * off chrome.storage.sync, the normalised per-site key, or the popup and
 * options pages. jsdom cannot answer any of them: there is no extension
 * runtime, no chrome.storage, no separate isolated world, and no paint.
 *
 * Isolated by construction: a throwaway user-data-dir under the OS temp
 * directory, so it never touches a real browser profile, and a local static
 * server, so it never touches a real site.
 *
 * Run: node scripts/test-extension.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'extension');

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('extension: extension/ is missing. Run `npm run build:extension` first.');
  process.exit(1);
}

// ---- a static server for the fixtures -------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };
const siteRoot = join(root, 'examples/test-site');

function serve() {
  return new Promise((ready) => {
    const server = createServer(async (req, res) => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0]);
      const file = join(siteRoot, rel === '/' ? '/index.html' : rel);
      try {
        await stat(file);
        res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
        res.end(await readFile(file));
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => ready({ server, port: server.address().port }));
  });
}

// ---- the tiniest test harness ---------------------------------------------
let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`);
  }
}
const eq = (actual, expected, msg) => {
  if (actual !== expected) throw new Error(`${msg || 'not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const ok = (v, msg) => {
  if (!v) throw new Error(msg || 'expected truthy');
};

const { server, port } = await serve();
const origin = `http://127.0.0.1:${port}`;
const profile = mkdtempSync(join(tmpdir(), 'webable-ext-'));

const context = await chromium.launchPersistentContext(profile, {
  // `channel: 'chromium'` is load-bearing: Playwright's default headless is the
  // headless shell, which cannot load extensions at all, and the failure looks
  // exactly like the content script not injecting. The full Chromium build in
  // new-headless mode does support them. WEBABLE_HEADED=1 to watch it.
  channel: 'chromium',
  // For machines whose preinstalled Chromium is not the revision this Playwright
  // pins (CI containers, cloud sandboxes). Unset, Playwright picks its own.
  ...(process.env.WEBABLE_CHROMIUM_PATH ? { executablePath: process.env.WEBABLE_CHROMIUM_PATH } : {}),
  headless: !process.env.WEBABLE_HEADED,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

/**
 * The id of an unpacked extension is derived from the absolute path it was
 * loaded from: sha256 of the path, first 32 hex digits, each mapped 0-f to a-p.
 * Derived rather than read from the service worker because an MV3 worker is
 * lazy and may not have started yet, and waiting on one that never wakes is a
 * ten second timeout for nothing.
 */
function extensionId(path) {
  // Chromium hashes native path bytes: Windows FilePath uses UTF-16, while
  // POSIX uses UTF-8. Hashing UTF-8 here opens a different extension on Windows.
  const encoding = process.platform === 'win32' ? 'utf16le' : 'utf8';
  const digest = createHash('sha256').update(path, encoding).digest('hex').slice(0, 32);
  return [...digest].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const id = extensionId(dist);
console.log(`\nExtension ${id} loaded from extension/\n`);

/** Read the whole of one chrome.storage area, from an extension page. */
async function readStorage(page, area) {
  return page.evaluate(
    (a) => new Promise((r) => chrome.storage[a].get(null, (all) => r(all))),
    area,
  );
}
async function writeStorage(page, area, obj) {
  return page.evaluate(
    ([a, o]) => new Promise((r) => chrome.storage[a].set(o, () => r(null))),
    [area, obj],
  );
}

const optionsUrl = `chrome-extension://${id}/options.html`;
const popupUrl = `chrome-extension://${id}/popup.html`;

// Storage is planted directly where a check needs a known starting page.
const SITE_BAG = `webable@127.0.0.1:${port}`;
const FRAME_BAG = `webable@localhost:${port}`;
const payload = (settings) => ({ version: 1, settings, activeProfile: null });

async function plant(local) {
  const setup = await context.newPage();
  await setup.goto(optionsUrl);
  await setup.evaluate(() => new Promise((r) => chrome.storage.local.clear(() => r(null))));
  await writeStorage(setup, 'local', local);
  await setup.close();
}

// ---------------------------------------------------------------------------
console.log('content script');

await check('injects its host and base styles into an ordinary page', async () => {
  const page = await context.newPage();
  await page.goto(`${origin}/static.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#webable-widget-root', { state: 'attached', timeout: 5000 });
  eq(await page.locator('#webable-widget-root').count(), 1, 'one host');
  ok(await page.evaluate(() => document.documentElement.hasAttribute('data-webable')), 'base flag set');
  await page.close();
});

await check('runs at document_start, so the engine beats the page', async () => {
  // examples/test-site/early.html records the DOM state from the first inline
  // script in its <head>: the earliest moment the PAGE can run anything. A
  // content script at document_start is guaranteed to have run before that; one
  // at document_idle cannot possibly have. That is the flash, measured.
  const page = await context.newPage();
  await page.goto(`${origin}/early.html`);
  const early = await page.evaluate(() => window.__WEBABLE_EARLY__);
  ok(early, 'the fixture recorded its early state');
  eq(early.readyState, 'loading', 'sampled while the document was still parsing');
  eq(early.baseFlag, true, 'and the engine had already written to <html>');

  const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
  eq(manifest.content_scripts[0].run_at, 'document_start', 'manifest agrees');
  await page.close();
});

await check('the launcher renders inside a shadow root and opens the panel', async () => {
  const page = await context.newPage();
  await page.goto(`${origin}/static.html`);
  await page.waitForSelector('#webable-widget-root', { state: 'attached' });
  const launcher = page.locator('#webable-widget-root .wa-launcher');
  await launcher.waitFor({ timeout: 5000 });
  await launcher.click();
  await page.waitForSelector('#webable-widget-root .wa-panel', { timeout: 5000 });
  eq(await page.getByRole('dialog').count(), 1, 'panel is a dialog');
  await page.close();
});

await check('the page behind the open panel is inert', async () => {
  const page = await context.newPage();
  await page.goto(`${origin}/static.html`);
  await page.locator('#webable-widget-root .wa-launcher').click();
  await page.waitForSelector('#webable-widget-root .wa-panel');
  const state = await page.evaluate(() => {
    const first = document.body.firstElementChild;
    return { inert: first?.hasAttribute('inert'), hidden: first?.getAttribute('aria-hidden') };
  });
  eq(state.inert, true, 'page content inert');
  eq(state.hidden, 'true', 'and hidden from assistive tech');
  await page.close();
});

// ---------------------------------------------------------------------------
console.log('\nper-site settings');

await check('a feature toggled on one page is applied on the next load', async () => {
  const page = await context.newPage();
  await page.goto(`${origin}/static.html`);
  await page.locator('#webable-widget-root .wa-launcher').click();
  await page.waitForSelector('#webable-widget-root .wa-panel');
  await page.locator('#webable-widget-root [data-tab="reading"]').click();
  const card = page.locator('#webable-widget-root .wa-card', { hasText: 'Readable font' });
  await card.locator('.wa-switch').click();
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-webable-readable'));

  await page.reload();
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-webable-readable'), null, {
    timeout: 5000,
  });
  await page.close();
});

await check('settings key off the host, so 127.0.0.1 and localhost stay separate', async () => {
  // Different hosts really are different sites; the normalisation only folds
  // www and the protocol. Uses the previous test's saved state.
  const page = await context.newPage();
  await page.goto(`http://localhost:${port}/static.html`);
  await page.waitForSelector('#webable-widget-root', { state: 'attached' });
  await page.waitForTimeout(500);
  eq(
    await page.evaluate(() => document.documentElement.hasAttribute('data-webable-readable')),
    false,
    'a different host does not inherit',
  );
  await page.close();
});

await check('the site key drops the protocol, so http and https are one site', async () => {
  const page = await context.newPage();
  await page.goto(optionsUrl);
  const local = await readStorage(page, 'local');
  const siteKeys = Object.keys(local).filter((k) => k.startsWith('webable@'));
  ok(siteKeys.length > 0, `expected a per-site namespace, saw ${Object.keys(local).join(', ')}`);
  for (const k of siteKeys) {
    ok(!k.includes('://'), `site key still carries a protocol: ${k}`);
    ok(!k.includes('@www.'), `site key still carries www: ${k}`);
  }
  await page.close();
});

// ---------------------------------------------------------------------------
console.log('\nthe AI key is a credential, not a preference');

await check('a key entered on the options page lands in local, never in sync', async () => {
  const page = await context.newPage();
  await page.goto(optionsUrl);
  await page.fill('#key', 'AIza-test-key-0000');
  await page.click('#save');
  await page.waitForFunction(() => /stored on this device/i.test(document.getElementById('key-status').textContent));

  const local = await readStorage(page, 'local');
  const sync = await readStorage(page, 'sync');
  eq(local.webable?.['secret:v1']?.apiKey, 'AIza-test-key-0000', 'key in the device-local secret layer');
  eq(JSON.stringify(sync).includes('AIza-test-key-0000'), false, 'and nowhere in chrome.storage.sync');
  await page.close();
});

await check('a key left in sync by an older build is migrated out of it on next load', async () => {
  const setup = await context.newPage();
  await setup.goto(optionsUrl);
  // Wipe, then plant exactly what a pre-fix install would have had.
  await setup.evaluate(() => new Promise((r) => chrome.storage.local.clear(() => r(null))));
  await setup.evaluate(() => new Promise((r) => chrome.storage.sync.clear(() => r(null))));
  await writeStorage(setup, 'sync', {
    webable: {
      'global:v1': {
        version: 1,
        ui: { theme: 'dark', accent: '#1e40af', position: 'bottom-right', launcherOffset: null, language: 'en' },
        apiKey: 'AIza-legacy-roaming-key',
        tts: {},
      },
    },
  });
  await setup.close();

  // Loading any page runs the engine, which performs the migration.
  const page = await context.newPage();
  await page.goto(`${origin}/static.html`);
  await page.waitForSelector('#webable-widget-root', { state: 'attached' });
  await page.waitForTimeout(800);
  await page.close();

  const check2 = await context.newPage();
  await check2.goto(optionsUrl);
  const local = await readStorage(check2, 'local');
  const sync = await readStorage(check2, 'sync');
  eq(local.webable?.['secret:v1']?.apiKey, 'AIza-legacy-roaming-key', 'the user does not lose their key');
  eq(sync.webable?.['global:v1']?.apiKey, undefined, 'and it is stripped from the synced payload');
  eq(sync.webable?.['global:v1']?.ui?.theme, 'dark', 'without taking the roaming prefs with it');
  await check2.close();
});

// ---------------------------------------------------------------------------
console.log('\nthe extension pages');

await check('the options page loads, labels its key field, and announces', async () => {
  const page = await context.newPage();
  await page.goto(optionsUrl);
  eq(await page.locator('label[for="key"]').count(), 1, 'the key field has a real label');
  eq(await page.locator('#key-status[role="status"]').count(), 1, 'status is a live region');
  eq(await page.locator('#theme-status[role="status"]').count(), 1, 'theme status is a live region');
  ok((await page.locator('.tool').count()) > 30, 'the toolset renders from the shared registry');
  await page.close();
});

await check('the popup loads, renders the real profiles, and announces', async () => {
  const page = await context.newPage();
  await page.goto(popupUrl);
  eq(await page.locator('h1').count(), 1, 'the title is a heading');
  eq(await page.locator('#status[role="status"]').count(), 1, 'status is a live region');
  const names = await page.locator('.profile-name').allTextContents();
  ok(names.includes('Seizure safe'), `profiles from the registry, saw: ${names.join(', ')}`);
  eq(names.length, 8, 'all eight profiles');
  await page.close();
});

await check('the popup drives the page it is pointed at', async () => {
  // The popup talks to the content script over the message protocol; drive that
  // directly, since a real popup has no tab of its own in automation.
  const page = await context.newPage();
  await page.goto(`${origin}/static.html`);
  await page.waitForSelector('#webable-widget-root', { state: 'attached' });

  const driver = await context.newPage();
  await driver.goto(optionsUrl);
  await driver.evaluate(
    () =>
      new Promise((r) => {
        chrome.tabs.query({}, (tabs) => {
          const target = tabs.find((t) => t.url && t.url.includes('static.html'));
          chrome.tabs.sendMessage(target.id, { type: 'WEBABLE_APPLY_PROFILE', id: 'vision' }, () => r(null));
          setTimeout(() => r(null), 1500);
        });
      }),
  );
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-webable-fontsize'), null, {
    timeout: 5000,
  });
  await driver.close();
  await page.close();
});

// ---------------------------------------------------------------------------
console.log('\nthe panel at 400% zoom');

await check('a tool is reachable at a 400% zoom viewport', async () => {
  // 1280x800 at 400% is 320x200 CSS px. The panel used to render its header,
  // its search box and its footer, and no tools at all.
  //
  // Cleared first, and that is not incidental. This check used to inherit a
  // profile applied by an earlier check, so it only ever measured a panel with
  // settings already on. The first-open explanation is shown precisely when
  // nothing is on, and when it was added it pushed every profile off screen at
  // this size: zero visible, not even partly. This check passed anyway. It is
  // the state that made the original bug possible, so it is the state to test.
  await plant({});
  const page = await context.newPage();
  await page.setViewportSize({ width: 320, height: 220 });
  await page.goto(`${origin}/static.html`);
  await page.locator('#webable-widget-root .wa-launcher').click();
  await page.waitForSelector('#webable-widget-root .wa-panel');

  const state = await page.evaluate(() => {
    const root = document.getElementById('webable-widget-root').shadowRoot;
    const body = root.querySelector('.wa-tabpanel').getBoundingClientRect();
    const rail = root.querySelector('.wa-rail');
    const cards = [...root.querySelectorAll('.wa-profile')];
    const tabs = [...root.querySelectorAll('.wa-railtab')].map((t) => {
      const r = t.getBoundingClientRect();
      return Math.min(Math.round(r.width), Math.round(r.height));
    });
    const intro = root.querySelector('.wa-intro');
    return {
      railVisible: !!rail && rail.getBoundingClientRect().height > 0,
      smallestTab: Math.min(...tabs),
      introShown: !!intro && intro.getBoundingClientRect().height > 0,
      visibleCards: cards.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.top >= body.top - 1 && r.bottom <= body.bottom + 1;
      }).length,
    };
  });
  ok(state.railVisible, 'the category rail is on screen');
  ok(state.smallestTab >= 24, `rail tabs are at least 24px (smallest ${state.smallestTab})`);
  eq(state.introShown, false, 'the first-open explanation stands down at this size');
  ok(state.visibleCards >= 1, 'at least one tool is fully visible');
  await page.close();
});

// ---------------------------------------------------------------------------
console.log('\nframes');

// `frames.html` embeds the same child twice: once same-origin (127.0.0.1) and
// once cross-origin (localhost, same server, different site key). The localhost
// bucket is deliberately given a DIFFERENT tool: if a frame ever keys off its
// own origin instead of the page's, that tool shows up and the check fails.

/** The frame for a given url fragment, once the page has attached both. */
async function frameFor(page, fragment) {
  await page.waitForFunction(() => window.frames.length === 2, null, { timeout: 5000 });
  const f = page.frames().find((fr) => fr.url().includes(fragment));
  ok(f, `expected a frame whose url contains ${fragment}, saw: ${page.frames().map((x) => x.url()).join(', ')}`);
  return f;
}

await check('a cross-origin frame is treated with the page settings, not its own', async () => {
  await plant({
    [SITE_BAG]: { 'settings:v1': payload({ readableFont: { active: true } }) },
    [FRAME_BAG]: { 'settings:v1': payload({ highlightLinks: { active: true } }) },
  });

  const page = await context.newPage();
  await page.goto(`${origin}/frames.html`);
  const cross = await frameFor(page, 'localhost');
  await cross.waitForFunction(() => document.documentElement.hasAttribute('data-webable-readable'), null, {
    timeout: 5000,
  });
  eq(
    await cross.evaluate(() => document.documentElement.hasAttribute('data-webable-hl-links')),
    false,
    'the frame must not read its own origin settings',
  );
  await page.close();
});

await check('a frame is filtered once by its parent, not a second time by itself', async () => {
  // Two inversions cancel, so a frame that applied the composed filter to its
  // own body would come out light inside a dark page: the exact failure that
  // running in frames was supposed to fix.
  await plant({ [SITE_BAG]: { 'settings:v1': payload({ darkMode: { active: true } }) } });

  const page = await context.newPage();
  await page.goto(`${origin}/frames.html`);
  const cross = await frameFor(page, 'localhost');
  await cross.waitForFunction(() => document.documentElement.hasAttribute('data-webable-reinvert-dark'), null, {
    timeout: 5000,
  });

  const top = await page.evaluate(() => ({
    body: getComputedStyle(document.body).filter,
    // `iframe` was in the re-invert set, which flipped every frame back out of
    // dark mode and left a light embed as a bright rectangle in a dark page.
    frame: getComputedStyle(document.getElementById('cross')).filter,
    // The rule still has to cover the media it was written for.
    img: getComputedStyle(document.getElementById('pic')).filter,
  }));
  ok(top.body.includes('invert'), `the page itself is filtered, saw ${top.body}`);
  eq(top.frame, 'none', 'a frame is dimmed with the page, not flipped back out of it');
  ok(top.img.includes('invert'), `a picture is still flipped back, saw ${top.img}`);

  const inner = await cross.evaluate(() => ({
    body: getComputedStyle(document.body).filter,
    pic: getComputedStyle(document.getElementById('pic')).filter,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
  }));
  eq(inner.body, 'none', 'the frame does not filter itself');
  ok(inner.pic.includes('invert'), `media inside the frame is still flipped back, saw ${inner.pic}`);
  ok(
    !/rgb\(14, 17, 22\)/.test(inner.htmlBg),
    `the frame does not paint the unfiltered dark backdrop, saw ${inner.htmlBg}`,
  );
  await page.close();
});

await check('only the top frame gets a panel', async () => {
  const page = await context.newPage();
  await page.goto(`${origin}/frames.html`);
  await page.waitForSelector('#webable-widget-root', { state: 'attached', timeout: 5000 });
  const cross = await frameFor(page, 'localhost');
  const same = await frameFor(page, `127.0.0.1:${port}/framed-child.html`);
  const counts = await Promise.all(
    [page.mainFrame(), same, cross].map((f) => f.evaluate(() => document.querySelectorAll('#webable-widget-root').length)),
  );
  eq(counts[0], 1, 'the page has one panel host');
  eq(counts[1], 0, 'the same-origin frame has none');
  eq(counts[2], 0, 'the cross-origin frame has none');
  await page.close();
});

await check('a tool turned on in the panel reaches the frames without a reload', async () => {
  // Without this a person turns on dark mode, the page goes dark, and the
  // embedded player stays bright until they happen to reload.
  await plant({});

  const page = await context.newPage();
  await page.goto(`${origin}/frames.html`);
  const cross = await frameFor(page, 'localhost');
  eq(
    await cross.evaluate(() => document.documentElement.hasAttribute('data-webable-readable')),
    false,
    'nothing is on to begin with',
  );

  await page.locator('#webable-widget-root .wa-launcher').click();
  await page.waitForSelector('#webable-widget-root .wa-panel');
  await page.locator('#webable-widget-root [data-tab="reading"]').click();
  await page.locator('#webable-widget-root .wa-card', { hasText: 'Readable font' }).locator('.wa-switch').click();

  await cross.waitForFunction(() => document.documentElement.hasAttribute('data-webable-readable'), null, {
    timeout: 5000,
  });
  await page.close();
});

// ---------------------------------------------------------------------------
console.log('\nshadow DOM');

// jsdom has no constructed stylesheets, so the unit tests in
// packages/core/test/shadow.test.ts only ever exercise the <style> fallback.
// This is the adoptedStyleSheets path, which is what actually ships.
await check('a component gets the same treatment as the page around it', async () => {
  await plant({
    [SITE_BAG]: {
      'settings:v1': payload({ highlightLinks: { active: true }, clickTargets: { active: true, size: 48 } }),
    },
  });

  const page = await context.newPage();
  await page.goto(`${origin}/components.html`);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-webable-hl-links'), null, {
    timeout: 5000,
  });

  const seen = await page.evaluate(() => {
    const read = (root) => {
      const a = root.querySelector('a[href]');
      const b = root.querySelector('button');
      return {
        // Not textDecorationLine: an <a href> is underlined by default, so
        // that would pass with no treatment at all. The offset is ours.
        underline: getComputedStyle(a).textUnderlineOffset,
        outline: getComputedStyle(a).outlineWidth,
        button: getComputedStyle(b).minHeight,
      };
    };
    const outer = document.getElementById('outer').shadowRoot;
    return {
      open: read(document.getElementById('open').shadowRoot),
      nested: read(outer.querySelector('wa-inner').shadowRoot),
      closed: document.getElementById('closed').shadowRoot,
      // The light DOM must be unchanged by any of this.
      light: getComputedStyle(document.getElementById('light')).textDecorationLine,
    };
  });

  eq(seen.open.underline, '2px', 'a link inside a component gets our underline offset');
  eq(seen.open.outline, '2px', 'and outlined');
  eq(seen.open.button, '48px', 'a button inside a component gets the tap target');
  eq(seen.nested.button, '48px', 'and so does one two components deep');
  eq(seen.closed, null, 'a closed root stays unreachable, which is the documented limit');
  eq(seen.light, 'none', 'the page around them is untouched by the adopted copy');
  await page.close();
});

await check('a component that upgrades after load is picked up too', async () => {
  const page = await context.newPage();
  await page.goto(`${origin}/components.html`);
  await page.waitForSelector('wa-late', { state: 'attached', timeout: 5000 });
  // The mutation path is debounced, so this is deliberately a wait on the
  // effect rather than an immediate read.
  await page.waitForFunction(
    () => {
      const el = document.getElementById('late');
      const b = el && el.shadowRoot && el.shadowRoot.querySelector('button');
      return !!b && getComputedStyle(b).minHeight === '48px';
    },
    null,
    { timeout: 5000 },
  );
  await page.close();
});

await check('turning a tool off takes it back out of every component', async () => {
  const page = await context.newPage();
  await page.goto(`${origin}/components.html`);
  // Assert it is on in there first, or "it is off now" passes on a build that
  // never put it in there at all.
  await page.waitForFunction(
    () => getComputedStyle(document.getElementById('open').shadowRoot.querySelector('a[href]')).outlineWidth === '2px',
    null,
    { timeout: 5000 },
  );

  await page.locator('#webable-widget-root .wa-launcher').click();
  await page.waitForSelector('#webable-widget-root .wa-panel');
  await page.locator('#webable-widget-root [data-tab="reading"]').click();
  await page.locator('#webable-widget-root .wa-card', { hasText: 'Highlight links' }).locator('.wa-switch').click();

  await page.waitForFunction(
    () => {
      const a = document.getElementById('open').shadowRoot.querySelector('a[href]');
      return getComputedStyle(a).outlineWidth !== '2px';
    },
    null,
    { timeout: 5000 },
  );
  await page.close();
});

await check('the panel is not restyled by the page treatment it is being used to set', async () => {
  // The panel lives in a shadow root of its own. If the adopted sheet reached
  // it, hide-images would blank the icons in the card that turns hide-images
  // off, and a big cursor would repaint the panel's own pointers.
  await plant({ [SITE_BAG]: { 'settings:v1': payload({ hideImages: { active: true } }) } });

  const page = await context.newPage();
  await page.goto(`${origin}/components.html`);
  await page.locator('#webable-widget-root .wa-launcher').click();
  await page.waitForSelector('#webable-widget-root .wa-panel');

  const state = await page.evaluate(() => {
    const root = document.getElementById('webable-widget-root').shadowRoot;
    // The WebAble mark in the panel header is a real <img>, which is exactly
    // what the hide-images rule blanks. If the adopted sheet ever reaches the
    // panel, this is the first thing to go.
    const mark = root.querySelector('.wa-head-mark img');
    return {
      icon: mark ? getComputedStyle(mark).opacity : 'no mark found',
      injected: root.querySelectorAll('style[data-webable="shadow"]').length,
      adopted: (root.adoptedStyleSheets || []).length,
    };
  });
  eq(state.icon, '1', 'the panel mark is still visible');
  eq(state.injected, 0, 'nothing was injected into the panel root');
  eq(state.adopted, 0, 'and nothing was adopted into it');
  await page.close();
});

// ---------------------------------------------------------------------------
console.log('\nshapes real sites have');

// Found by driving this build against the Guardian, BBC, MDN, react.dev,
// YouTube, web.dev, CodeMirror and ProseMirror. The exploratory run needs the
// network and is not part of the suite; what it found lives in
// examples/test-site/hostile.html so it stays found. See QA.md.

await check('a page whose body has its own height still scrolls with banners blocked', async () => {
  // web.dev. `overflow:auto` on <html> stops <body>'s overflow reaching the
  // viewport, so the document stops being the scroller and the page freezes
  // outright: 23157px of article, and scrollTo does nothing.
  await plant({ [SITE_BAG]: { 'settings:v1': payload({ cookieKill: { active: true, reject: false } }) } });

  const page = await context.newPage();
  await page.goto(`${origin}/hostile.html`);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-webable-cookiekill'), null, {
    timeout: 5000,
  });

  eq(
    await page.evaluate(() => getComputedStyle(document.getElementById('onetrust-banner-sdk')).display),
    'none',
    'the banner is hidden',
  );
  const state = await page.evaluate(async () => {
    window.scrollTo(0, 900);
    await new Promise((r) => setTimeout(r, 200));
    return { y: window.scrollY, docH: document.documentElement.scrollHeight };
  });
  ok(state.docH > 2000, `the document is still tall, saw ${state.docH}`);
  eq(state.y, 900, 'and the page still scrolls');
  await page.close();
});

await check('a sticky bar named the BEM way is unpinned too', async () => {
  // MDN. `left-sidebar__header` matches neither `-header` nor `header-`, so an
  // element whose own class name says header stayed pinned.
  await plant({ [SITE_BAG]: { 'settings:v1': payload({ stickyKill: { active: true } }) } });

  const page = await context.newPage();
  await page.goto(`${origin}/hostile.html`);
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('header.site-header')).position === 'static',
    null,
    { timeout: 5000 },
  );
  eq(
    await page.evaluate(() => getComputedStyle(document.querySelector('.left-sidebar__header')).position),
    'static',
    'the BEM-named one is unpinned as well',
  );
  await page.close();
});

await check('the text scale reaches rem copy and, honestly, not px copy', async () => {
  // BBC at 14px, react.dev at 20px, web.dev at 16px: real body copy is often
  // sized in absolute px, and scaling the root font size cannot reach it.
  // Pinned here so the limit is a measured fact rather than a surprise.
  await plant({ [SITE_BAG]: { 'settings:v1': payload({ fontSize: { active: true, value: 180 } }) } });

  const page = await context.newPage();
  await page.goto(`${origin}/hostile.html`);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-webable-fontsize'), null, {
    timeout: 5000,
  });

  const size = await page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).fontSize,
    scaled: getComputedStyle(document.getElementById('scaled')).fontSize,
    fixed: getComputedStyle(document.getElementById('fixed')).fontSize,
  }));
  eq(size.root, '28.8px', 'the root scale applied');
  eq(size.scaled, '28.8px', 'rem-sized copy grows with it');
  eq(size.fixed, '14px', 'px-sized copy does not, and no shipped claim says it does');
  await page.close();
});

await check('unlock selection defeats the site, and still leaves an editor its own copy', async () => {
  // Both halves matter and they pull against each other. The blocker on a
  // paywalled article has to be cut off; an editor's own copy handler IS the
  // copy, and cutting that off is what broke Google Docs.
  //
  // The third case is the one that was live: an editor whose surface is inside
  // a shadow root. The event is retargeted on the way out, so e.target at
  // document is the host element, which looks like a plain div, the guard
  // passes, and the editor is cut off anyway. Events are dispatched rather than
  // typed because that is what puts the originating node beyond doubt.
  await plant({ [SITE_BAG]: { 'settings:v1': payload({ copyUnlock: { active: true } }) } });

  const page = await context.newPage();
  await page.goto(`${origin}/editors.html`);
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-webable-copyunlock'), null, {
    timeout: 5000,
  });
  await page.waitForFunction(() => !!document.getElementById('shadow-editor')?.shadowRoot, { timeout: 5000 });
  await page.waitForFunction(() => window.__lateBlockerReady === true, { timeout: 5000 });

  const log = await page.evaluate(() => {
    const fire = (el) =>
      el.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, composed: true }));
    fire(document.getElementById('article'));
    // Sampled here: the later fires are editors, where the blocker is SUPPOSED
    // to keep running because this feature deliberately keeps its hands off.
    const afterArticle = window.__log.lateBlockerRan;
    fire(document.getElementById('editor'));
    fire(document.getElementById('field'));
    fire(document.getElementById('shadow-editor').shadowRoot.querySelector('.surface'));
    return { ...window.__log, afterArticle };
  });

  eq(log.afterArticle, 0, "the site's copy blocker was cut off for ordinary article text");
  eq(log.editorHandlerRan, 1, 'a contenteditable editor keeps its own copy');
  eq(log.fieldHandlerRan, 1, 'and so does a form field');
  eq(log.shadowEditorHandlerRan, 1, 'and so does an editor whose surface is inside a shadow root');
  await page.close();
});

// ---------------------------------------------------------------------------
console.log('\nturning it off on one site');

// The content script matches every URL at document_start in every frame, and
// there was no way to stop it. When these tools broke a page the only recourse
// was uninstalling: turning off everything, everywhere, to fix one page.

/** Put the site in, or take it out of, the synced disabled list. */
async function setDisabledList(sites) {
  const setup = await context.newPage();
  await setup.goto(optionsUrl);
  await writeStorage(setup, 'sync', {
    webable: { 'disabled:v1': { version: 1, sites } },
  });
  await setup.close();
}

/**
 * Watch every rendered frame for signs of WebAble, from before the page's own
 * scripts until well after load.
 *
 * Sampling per animation frame, rather than reading once at the end, is what
 * makes "it never showed up" different from "it is not there now". A build that
 * started the engine and tore it down after reading the off list would leave no
 * trace in a single final read and would still have flashed the treatment the
 * user switched off.
 *
 * The guard around documentElement is load-bearing: an init script runs before
 * the document element exists, so the first tick throws without it, the loop
 * dies, and the sampler reports a clean zero forever. It did exactly that, and
 * reported zero on a page where the panel was plainly present.
 */
async function watchForTreatment(page) {
  await page.addInitScript(() => {
    window.__waSeen = [];
    const tick = () => {
      try {
        const el = document.documentElement;
        if (el && el.hasAttribute('data-webable')) window.__waSeen.push('base flag');
        if (document.getElementById('webable-widget-root')) window.__waSeen.push('panel host');
      } catch {
        /* before the document element exists */
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}
const treatmentSeen = (page) => page.evaluate(() => [...new Set(window.__waSeen || [])]);

await check('the sampler can see a treated page, so a clean result means something', async () => {
  // The control for the check below. Without it, a sampler that silently
  // stopped running would report the same clean zero on every page and the
  // check that depends on it would be measuring nothing at all.
  await plant({ [SITE_BAG]: { 'settings:v1': payload({ darkMode: { active: true } }) } });
  await setDisabledList([]);

  const page = await context.newPage();
  await watchForTreatment(page);
  await page.goto(`${origin}/static.html`, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const seen = await treatmentSeen(page);
  ok(seen.includes('base flag') && seen.includes('panel host'), `saw ${seen.join(', ') || 'nothing'}`);
  await page.close();
});

await check('a site on the off list is never painted with any of it', async () => {
  await setDisabledList([`127.0.0.1:${port}`]);

  const page = await context.newPage();
  await watchForTreatment(page);
  await page.goto(`${origin}/static.html`, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  const seen = await treatmentSeen(page);
  eq(seen.length, 0, `no rendered frame carried any of it, saw: ${seen.join(', ')}`);
  eq(await page.locator('#webable-widget-root').count(), 0, 'and there is no launcher');
  await page.close();
});

await check('the popup still answers on a site where nothing is running', async () => {
  // The panel cannot offer the way back, because on a disabled site there is no
  // panel. If the content script stopped answering too, turning it off would be
  // a one-way door.
  const page = await context.newPage();
  await page.goto(`${origin}/static.html`);
  await page.waitForTimeout(500);

  const driver = await context.newPage();
  await driver.goto(optionsUrl);
  const state = await driver.evaluate(
    () =>
      new Promise((r) => {
        chrome.tabs.query({}, (tabs) => {
          const target = tabs.find((t) => t.url && t.url.includes('static.html'));
          chrome.tabs.sendMessage(target.id, { type: 'WEBABLE_GET_STATE' }, { frameId: 0 }, (res) => r(res || null));
          setTimeout(() => r('no answer'), 2000);
        });
      }),
  );
  ok(state && state !== 'no answer', `the content script answered, saw ${JSON.stringify(state)}`);
  eq(state.enabled, false, 'and it says it is off');
  await driver.close();
  await page.close();
});

await check('turning it back on takes effect without a reload', async () => {
  const page = await context.newPage();
  await page.goto(`${origin}/static.html`);
  await page.waitForTimeout(500);
  eq(await page.locator('#webable-widget-root').count(), 0, 'off to begin with');

  const driver = await context.newPage();
  await driver.goto(optionsUrl);
  await driver.evaluate(
    () =>
      new Promise((r) => {
        chrome.tabs.query({}, (tabs) => {
          const target = tabs.find((t) => t.url && t.url.includes('static.html'));
          chrome.tabs.sendMessage(target.id, { type: 'WEBABLE_SET_ENABLED', on: true }, { frameId: 0 }, () => r(null));
          setTimeout(() => r(null), 2000);
        });
      }),
  );

  // The saved settings come back with it, untouched.
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-webable-dark'), null, {
    timeout: 5000,
  });
  await page.waitForSelector('#webable-widget-root', { state: 'attached', timeout: 5000 });
  await driver.close();
  await page.close();
});

await check('turning it off from the panel takes effect without a reload', async () => {
  // Its own starting page rather than whatever the checks above left behind, so
  // that what it asserts about storage afterwards is about what IT did.
  await plant({ [SITE_BAG]: { 'settings:v1': payload({ darkMode: { active: true } }) } });
  await setDisabledList([]);

  const page = await context.newPage();
  await page.goto(`${origin}/static.html`);
  await page.waitForSelector('#webable-widget-root', { state: 'attached', timeout: 5000 });
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-webable-dark'), null, {
    timeout: 5000,
  });
  await page.locator('#webable-widget-root .wa-launcher').click();
  await page.waitForSelector('#webable-widget-root .wa-panel');
  await page.locator('#webable-widget-root .wa-btn', { hasText: 'Turn off on this site' }).click();

  await page.waitForFunction(() => !document.getElementById('webable-widget-root'), null, { timeout: 5000 });
  eq(
    await page.evaluate(() => document.documentElement.hasAttribute('data-webable-dark')),
    false,
    'and the page is handed back exactly as the site made it',
  );
  await page.close();

  // Switching off tears the engine down, and teardown flushes state to storage.
  // Checked here rather than in a standalone check reading what plant() wrote,
  // because that version could not fail: nothing in it ever switched anything
  // off. This one does the destructive thing first and then looks.
  const after = await context.newPage();
  await after.goto(optionsUrl);
  const local = await readStorage(after, 'local');
  eq(
    local[SITE_BAG]?.['settings:v1']?.settings?.darkMode?.active,
    true,
    'switching off is not the same as forgetting: the settings are still there',
  );
  await after.close();
  await setDisabledList([]);
});

// ---------------------------------------------------------------------------
console.log('\nmoving a setup to another computer');

// Not just portability. The audience this product names includes older users
// and people with cognitive differences, who are very often set up by a family
// member. There was no way to build a configuration and hand it over.

await check('an export carries the setup and leaves the credential behind', async () => {
  await plant({
    [SITE_BAG]: { 'settings:v1': payload({ readableFont: { active: true } }) },
    webable: { 'secret:v1': { version: 1, apiKey: 'AIza-must-not-travel' } },
  });
  await setDisabledList([`127.0.0.1:${port}`]);

  const page = await context.newPage();
  await page.goto(optionsUrl);
  // The real button, and the real bytes it puts in the file. Rebuilding the
  // filter here instead would only prove that the copy in this test works.
  await page.evaluate(() => {
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      window.__blob = blob;
      return orig(blob);
    };
  });
  await page.click('#export');
  await page.waitForFunction(() => !!window.__blob, { timeout: 5000 });
  const text = await page.evaluate(() => window.__blob.text());

  const parsed = JSON.parse(text);
  eq(parsed.webable, 'settings', 'the file identifies itself');
  eq(text.includes('AIza-must-not-travel'), false, 'the Gemini key is nowhere in the file');
  eq(text.includes('secret:v1'), false, 'nor is the shape that holds it');
  ok(text.includes('readableFont'), 'the per-site settings do travel');
  ok(text.includes('disabled:v1'), 'and so do the sites WebAble is turned off on');
  await page.close();
  await setDisabledList([]);
});

await check('an import restores a setup without touching the key already on the machine', async () => {
  // The handover case: a machine with its own key takes somebody else's setup.
  await plant({ webable: { 'secret:v1': { version: 1, apiKey: 'AIza-already-here' } } });

  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(optionsUrl);

  // A file somebody else's machine wrote, fed to the real input the real
  // handler listens on. A hand-written key is included on purpose: the importer
  // strips it on the way in as well as on the way out, so a doctored file
  // cannot plant a credential in somebody's browser.
  const bundle = {
    webable: 'settings',
    version: 1,
    exported: '2026-08-15T00:00:00.000Z',
    local: {
      'webable@handover.test': {
        'settings:v1': { version: 1, settings: { bigCursor: { active: true } }, activeProfile: null },
      },
      webable: { 'secret:v1': { version: 1, apiKey: 'AIza-planted-by-the-file' } },
    },
    sync: { webable: { 'disabled:v1': { version: 1, sites: ['annoying.test'] } } },
  };
  await page.setInputFiles('#import-file', {
    name: 'webable-settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await page.waitForFunction(() => /Brought in settings/.test(document.getElementById('io-status').textContent), {
    timeout: 5000,
  });

  const local = await readStorage(page, 'local');
  const sync = await readStorage(page, 'sync');
  eq(local.webable?.['secret:v1']?.apiKey, 'AIza-already-here', 'the key on this machine survives an import');
  eq(
    local['webable@handover.test']?.['settings:v1']?.settings?.bigCursor?.active,
    true,
    'and the incoming setup landed',
  );
  eq(sync.webable?.['disabled:v1']?.sites?.[0], 'annoying.test', 'including what was switched off');
  await page.close();
});

await check('a doctored file cannot plant a credential on a machine with no key', async () => {
  // The previous check passes on a machine that already has a key, because the
  // merge puts the local one back on top. This is the case that only the strip
  // protects: nothing here to put back, so a key in the file would simply
  // become the user's key without them ever typing one.
  await plant({});

  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(optionsUrl);
  await page.setInputFiles('#import-file', {
    name: 'webable-settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        webable: 'settings',
        version: 1,
        exported: '2026-08-15T00:00:00.000Z',
        local: { webable: { 'secret:v1': { version: 1, apiKey: 'AIza-planted-by-the-file' } } },
        sync: {},
      }),
    ),
  });
  await page.waitForFunction(() => /Brought in settings/.test(document.getElementById('io-status').textContent), {
    timeout: 5000,
  });

  const local = await readStorage(page, 'local');
  eq(local.webable?.['secret:v1'], undefined, 'no key arrived from the file');
  await page.close();
});

await check('a file that is not ours is refused instead of half-applied', async () => {
  const page = await context.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(optionsUrl);
  await page.setInputFiles('#import-file', {
    name: 'holiday.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ some: 'other product' })),
  });
  await page.waitForFunction(() => /not a WebAble settings file/.test(document.getElementById('io-status').textContent), {
    timeout: 5000,
  });
  await page.close();
});

await check('the options page lists what is switched off, and can switch it back on', async () => {
  await setDisabledList(['annoying.test']);
  const page = await context.newPage();
  await page.goto(optionsUrl);
  await page.waitForSelector('#disabled-list .tool', { timeout: 5000 });
  eq(await page.locator('#disabled-list .tool').first().textContent(), 'annoying.test', 'the site is listed');

  await page.locator('#disabled-list button').first().click();
  await page.waitForFunction(() => !document.querySelector('#disabled-list .tool'), { timeout: 5000 });

  const sync = await readStorage(page, 'sync');
  eq(sync.webable?.['disabled:v1']?.sites?.length, 0, 'and it is off the list for good');
  await page.close();
});

// ---------------------------------------------------------------------------
await context.close();
server.close();
rmSync(profile, { recursive: true, force: true });

console.log(`\nextension: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`\n${f.name}\n${f.err.stack}`);
  process.exit(1);
}
