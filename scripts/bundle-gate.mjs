/**
 * Bundle size gate. Fails (exit 1) when the widget exceeds the budget:
 * loader + boot + eagerly imported chunks + lazy panel <= 64 KB gzipped.
 * The eager set is detected by scanning boot.js for static import specifiers;
 * everything else under dist/webable is the lazy set. Run after
 * `npm run build:widget` (or via `npm run check`, which builds first).
 *
 * Budget history: 60 KB through the categorized-IA + glass pass; raised to
 * 64 KB for Guide v2 (multistep walkthroughs + on-page drawing annotations);
 * raised to 65 KB for the [GO:app] tag. The desktop companion can switch
 * applications and the web widget cannot, but both surfaces share one tag
 * parser and it is the parser, not the prompt, that costs the bytes. The
 * desktop-only prompt text is kept out of this bundle (see GO_RULE, passed as
 * `extra`); splitting the parser as well would mean two implementations of the
 * protocol that must agree, which is a worse trade than 1 KB.
 *
 * The [CLICK:target] tag went in under the same terms and did not need a raise:
 * it shares POINT's argument parsing rather than adding its own, and the rule
 * that teaches it is desktop-only and `@__PURE__` so esbuild drops it entirely.
 * Annotating GO_RULE the same way paid for the parser change and then some, so
 * the total went 64.1 -> 64.0 KB across the whole feature.
 *
 * 65 KB is now fixed. The budget has been raised three times (60 -> 64 -> 65)
 * and a number that moves whenever it is inconvenient has stopped measuring
 * anything. The SPA route watcher, the mutation deadline, the cross-site
 * defaults, and the five acting-on-your-behalf fixes together cost 2.1 KB and
 * were paid for rather than waived: packages/ui/src/extensionBlocks.tsx is
 * resolved to a stub in the widget build, so the extension-only panel blocks
 * are not in this bundle at all. That took the total from 64.3 to 63.1.
 *
 * The next thing that needs room pays the same way. Anything new is genuinely
 * lazy, or extension-only, or it does not ship.
 *
 * Note what this gate does NOT show: "eager" here is most of the payload,
 * because the engine is a static import of boot.js and has to be, since saved
 * settings must apply before the page paints. Only the panel is lazy. Any doc
 * describing a tiny eager launcher is wrong; see ARCHITECTURE.md.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const BUDGET_KB = 65;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'dist');
const webable = join(pub, 'webable');

const loaderPath = join(pub, 'widget.js');
const bootPath = join(webable, 'boot.js');
if (!existsSync(loaderPath) || !existsSync(bootPath)) {
  console.error('bundle-gate: dist/widget.js or dist/webable/boot.js missing. Run `npm run build:widget` first.');
  process.exit(1);
}

const gz = (file) => gzipSync(readFileSync(file)).length;

const bootSrc = readFileSync(bootPath, 'utf8');
// esbuild emits static imports as `from"./chunk.js"` / `import"./chunk.js"`.
const eagerChunks = new Set();
for (const m of bootSrc.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) eagerChunks.add(m[1]);

const rows = [];
let eagerTotal = 0;
let lazyTotal = 0;

const add = (label, file, eager) => {
  const size = gz(file);
  rows.push({ label, size, eager });
  if (eager) eagerTotal += size;
  else lazyTotal += size;
};

/**
 * Whether a name is a copy the build did not write.
 *
 * macOS makes duplicates as `chunk 2.js`, `chunk 3.js` and so on, and something
 * on a synced folder does it to `public/webable` unprompted. This gate measures
 * a directory it does not own, so those copies were being weighed as if they
 * were part of the bundle: measured on a working tree, a clean 65.0 KB read as
 * 128.7 KB with one set of duplicates and 192.5 KB with two, and the gate
 * failed a bundle that was under budget.
 *
 * `npm run check` and `npm run gate:bundle` both build first, and the build
 * empties the directory, so this never fired in CI. It fires for the person
 * running the gate on its own to see where they stand, and tells them they have
 * blown a budget they have not blown, which is the worst direction for this
 * particular number to be wrong in.
 *
 * Only a duplicate *of a file that is really there* is skipped, so a genuine
 * chunk that happens to have a digit in its name is still counted.
 */
const isDuplicateOf = (name, present) => {
  const m = /^(.*) \d+(\.[^.]+)$/.exec(name);
  return m !== null && present.has(`${m[1]}${m[2]}`);
};

const present = new Set(readdirSync(webable));

add('widget.js (loader)', loaderPath, true);
add('webable/boot.js', bootPath, true);
for (const f of readdirSync(webable)) {
  if (!f.endsWith('.js') || f === 'boot.js') continue;
  if (isDuplicateOf(f, present)) continue;
  add(`webable/${f}`, join(webable, f), eagerChunks.has(f));
}

const kb = (n) => (n / 1024).toFixed(1);
console.log('\nWidget bundle (gzipped):');
for (const r of rows) {
  console.log(`  ${r.label.padEnd(28)} ${kb(r.size).padStart(6)} kb  ${r.eager ? 'eager' : 'lazy'}`);
}
const total = eagerTotal + lazyTotal;
console.log(`  ${'initial load (eager)'.padEnd(28)} ${kb(eagerTotal).padStart(6)} kb`);
console.log(`  ${'total incl. lazy panel'.padEnd(28)} ${kb(total).padStart(6)} kb  (budget ${BUDGET_KB} kb)`);

if (total > BUDGET_KB * 1024) {
  console.error(`\nbundle-gate: FAIL, ${kb(total)} kb exceeds the ${BUDGET_KB} kb gzip budget.`);
  process.exit(1);
}
console.log('\nbundle-gate: PASS');
