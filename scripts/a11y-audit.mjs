/**
 * axe-core accessibility audit of the shared panel. Mounts the real panel in
 * jsdom and runs axe against the shadow root. jsdom does no layout, so
 * geometry rules (color-contrast, target-size) can't be evaluated here and are
 * disabled, those are verified visually / in QA.md. What this gates is the
 * structural a11y that must always hold: roles, names, labels, ARIA validity,
 * dialog semantics, the tablist, and required parent/child relationships.
 *
 * Exits non-zero on any serious/critical violation. Run: npm run a11y.
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createRequire } from 'node:module';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// 1) Bundle the audit entry, same esbuild config as the unit-test harness
// (outdir, no splitting, .mjs) so the panel's dynamic import() inlines and
// resolves the way it does under `npm run test:core`.
const outDir = mkdtempSync(join(tmpdir(), 'wa-a11y-'));
await build({
  entryPoints: [join(root, 'packages/ui/test/a11y-entry.ts')],
  outdir: outDir,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: 'inline',
  outExtension: { '.js': '.mjs' },
  jsx: 'automatic',
  jsxImportSource: 'preact',
  external: ['jsdom'],
  logLevel: 'error',
});
const outFile = join(outDir, 'a11y-entry.mjs');

// 2) jsdom globals (mirror the unit-test harness).
const dom = new JSDOM('<!doctype html><html><head></head><body><h1>Demo</h1><p>Body text for the audit.</p></body></html>', {
  url: 'https://example.test/',
  pretendToBeVisual: true,
});
const w = dom.window;
const g = globalThis;
for (const k of ['window', 'document', 'HTMLElement', 'Node', 'ShadowRoot', 'Event', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'DOMParser', 'navigator', 'NodeList', 'Element', 'SVGElement']) {
  if (w[k] === undefined) continue;
  // Node 20+ defines some of these (notably `navigator`) as getter-only
  // globals, so a plain assignment throws. defineProperty replaces them.
  try {
    g[k] = w[k];
  } catch {
    Object.defineProperty(g, k, { value: w[k], configurable: true, writable: true });
  }
}
g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id) => clearTimeout(id);

// 3) Mount the panel, twice.
//
// The widget pass is the original one. The extension pass exists because
// `surface: 'widget'` renders every extension-only block as null, so the feed
// guard, Site Patches, the friction log and TrapLens had never been scanned:
// the audit was certifying a panel that is not the one the extension ships.
const { mountForAudit, mountExtensionForAudit } = await import(pathToFileURL(outFile).href);
const { host, panel } = await mountForAudit();
if (!panel) {
  console.error('a11y-audit: panel did not render.');
  process.exit(1);
}
const ext = await mountExtensionForAudit();
if (!ext.panel) {
  console.error('a11y-audit: extension panel did not render.');
  process.exit(1);
}
// The feed block is the reason this pass exists, so its absence must fail here
// rather than pass quietly as a scan of a tab that never opened. Named controls
// rather than one: a clean axe result over a DOM that never held a progressbar
// is not evidence that the progressbar is labelled, and this pass would report
// exactly the same zero either way.
const extRoot = ext.host.shadowRoot;
const CONTROLS = [
  ['the scope row', '.wa-fd-scope button'],
  ['the category chips', '.wa-fd-chips button'],
  ['the filter switches', '.wa-fd-row [role="switch"]'],
  ['the daily limit meter', '.wa-fd-meter[role="progressbar"]'],
  ['the selects', '.wa-panel-block select'],
  ['the log list', '.wa-fd-log li'],
];
const absent = CONTROLS.filter(([, sel]) => !extRoot?.querySelector(sel)).map(([name]) => name);
if (absent.length) {
  console.error(`a11y-audit: the extension pass scanned a DOM without ${absent.join(', ')}, so its result proves nothing about them.`);
  process.exit(1);
}

// 4) Load axe into the jsdom window and run it against the shadow root.
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
w.eval(axeSource);
const axe = w.axe;

const config = {
  // Geometry-dependent rules can't run without layout in jsdom.
  rules: {
    'color-contrast': { enabled: false },
    'target-size': { enabled: false },
    // The widget is a fragment injected into a host page; page-level region/
    // landmark rules don't apply to the isolated panel root.
    region: { enabled: false },
    'landmark-one-main': { enabled: false },
    'page-has-heading-one': { enabled: false },
  },
  resultTypes: ['violations'],
};

// Scan each shadow host (axe descends into the shadow root).
const widgetResults = await axe.run(host, config);
const extResults = await axe.run(ext.host, config);
ext.unmount();

const ranById = new Set();
const violations = [];
for (const [label, results] of [
  ['widget', widgetResults],
  ['extension', extResults],
]) {
  for (const r of [...results.violations, ...(results.passes || [])]) ranById.add(r.id);
  for (const v of results.violations) violations.push({ ...v, surface: label });
}

const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

console.log('\nPanel a11y audit (axe-core, structural rules):');
console.log(`  surfaces scanned:  widget, extension (feed guard included)`);
console.log(`  rules evaluated:   ${ranById.size}`);
console.log(`  violations:        ${violations.length} (serious/critical: ${bad.length})`);
if (violations.length) {
  for (const v of violations) {
    console.log(`  - [${v.impact}] ${v.surface} ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length > 1 ? 's' : ''})`);
    for (const n of v.nodes.slice(0, 3)) console.log(`      ${n.target.join(' ')}`);
  }
}

rmSync(outDir, { recursive: true, force: true });

if (bad.length) {
  console.error(`\na11y-audit: FAIL, ${bad.length} serious/critical violation(s).`);
  process.exit(1);
}
console.log('\na11y-audit: PASS (no serious/critical structural violations).');
