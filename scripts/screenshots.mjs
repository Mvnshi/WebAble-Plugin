/**
 * Captures the README and store screenshots from the real, built extension.
 *
 * Mockups drift. These are taken from `extension/` loaded into Chromium against
 * the local fixture pages, so every image in the README is something the
 * shipped build actually draws. Rerun after any visual change:
 *
 *   npm run build:extension && npm run screenshots
 *
 * Output: docs/screenshots/*.png. Set WEBABLE_CHROMIUM_PATH if Playwright's own
 * Chromium is not installed (see scripts/test-extension.mjs).
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, extname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'extension');
const out = join(root, 'docs/screenshots');
mkdirSync(out, { recursive: true });

const site = join(root, 'examples/test-site');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
const server = createServer(async (req, res) => {
  const file = join(site, decodeURIComponent((req.url || '/').split('?')[0]));
  try {
    await stat(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const encoding = process.platform === 'win32' ? 'utf16le' : 'utf8';
const id = [...createHash('sha256').update(dist, encoding).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');

async function launch(colorScheme) {
  const profile = mkdtempSync(join(tmpdir(), 'webable-shots-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    ...(process.env.WEBABLE_CHROMIUM_PATH ? { executablePath: process.env.WEBABLE_CHROMIUM_PATH } : {}),
    headless: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme,
  });
  // Let the install-time welcome tab open and get out of the way.
  await new Promise((r) => setTimeout(r, 800));
  return { context, profile };
}

/** A popup opened as a tab would find itself; point it at the site tab instead. */
async function popupFor(context, needle) {
  const pop = await context.newPage();
  await pop.setViewportSize({ width: 380, height: 640 });
  await pop.addInitScript((n) => {
    const query = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = (_i, cb) => query({}, (tabs) => cb(tabs.filter((t) => t.url && t.url.includes(n))));
  }, needle);
  await pop.goto(`chrome-extension://${id}/popup.html`);
  await pop.waitForTimeout(900);
  return pop;
}

const shot = (page, name, opts = {}) => page.screenshot({ path: join(out, `${name}.png`), ...opts });

for (const scheme of ['light', 'dark']) {
  const { context, profile } = await launch(scheme);
  const suffix = scheme === 'dark' ? '-dark' : '';
  const page = await context.newPage();
  await page.goto(`${origin}/power.html`);
  await page.waitForSelector('#webable-widget-root', { state: 'attached' });
  await page.waitForTimeout(500);

  // The command bar, answering a need in plain words.
  await page.keyboard.press('Control+Shift+K');
  await page.waitForTimeout(250);
  await page.keyboard.type('this page is too bright');
  await page.waitForTimeout(250);
  await shot(page, `command-bar${suffix}`);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('go to ');
  await page.waitForTimeout(250);
  await shot(page, `command-bar-goto${suffix}`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  // Click hints.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.keyboard.press('Alt+Shift+H');
  await page.waitForTimeout(300);
  await shot(page, `click-hints${suffix}`);
  await page.keyboard.press('Escape');

  // The popup over a page with problems.
  const pop = await popupFor(context, 'power.html');
  await shot(pop, `popup${suffix}`, { fullPage: true });
  await pop.close();

  // Site Check.
  const report = await context.newPage();
  await report.setViewportSize({ width: 1280, height: 1000 });
  await report.goto(`chrome-extension://${id}/report.html`);
  const tabId = await report.evaluate(() => new Promise((r) => chrome.tabs.query({}, (ts) => r(ts.find((t) => t.url && t.url.includes('power.html'))?.id))));
  await report.goto(`chrome-extension://${id}/report.html?tab=${tabId}`);
  await report.waitForSelector('.hero h1', { timeout: 10000 });
  await report.waitForTimeout(1200);
  await shot(report, `site-check${suffix}`);
  await report.close();

  if (scheme === 'light') {
    // The welcome page, mid-choice, so the live preview shows.
    const welcome = await context.newPage();
    await welcome.setViewportSize({ width: 1100, height: 900 });
    await welcome.goto(`chrome-extension://${id}/welcome.html`);
    await welcome.getByText('Reading takes effort').click();
    await welcome.waitForTimeout(400);
    await shot(welcome, 'welcome');
    await welcome.close();

    // The full panel, with a profile applied to the page behind it.
    const panelPage = await context.newPage();
    await panelPage.goto(`${origin}/static.html`);
    await panelPage.waitForSelector('#webable-widget-root', { state: 'attached' });
    // The launcher lives in an open shadow root, which Playwright pierces.
    await panelPage.locator('#webable-widget-root button').first().click();
    await panelPage.waitForTimeout(800);
    await shot(panelPage, 'panel');
    await panelPage.close();
  }

  await context.close();
  rmSync(profile, { recursive: true, force: true });
}

server.close();
console.log(`screenshots written to docs/screenshots/`);
