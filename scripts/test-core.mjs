/**
 * Bundles the core test files with esbuild (same resolver the real widget/
 * extension builds use, so extensionless TS imports + the @webable/* workspace
 * links resolve identically) and runs them under Node's test runner in jsdom.
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, '.test-dist');
// The desktop frontend is included because it is now where a chunk of the
// product's judgement lives: which prompt each surface sends, what it does with
// a screenshot, when it gives up. None of that needs a Mac to test.
const testDirs = [
  'packages/core/test',
  'packages/ui/test',
  'packages/companion/test',
  // The extension's tests are about what the product promises, not what it
  // renders: they hold the marketing page to the shipped feature registry.
  'apps/extension/test',
  'apps/widget/test',
]
  .map((d) => join(root, d))
  .filter(existsSync);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const entries = testDirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => join(dir, f)),
);

/**
 * Nothing that looks like a test may sit somewhere this runner cannot see it.
 *
 * Discovery here is two hardcoded lists: these directories, and the `.test.ts`
 * suffix. Both are silent when they miss. A file named `.test.tsx` or
 * `.test.mjs` in one of these directories is written, committed, reviewed and
 * never run, and a whole new `test` directory is invisible until somebody
 * notices the count did not move. That is the same family as a test that passes
 * while asserting nothing, and it is harder to spot, because there is no
 * output at all to be suspicious of.
 *
 * Not hypothetical: a coordinating session referred to
 * `apps/extension/test/external-messaging.test.mjs` this evening. That file is
 * `.test.ts` and does run, but had the name been right it would have run
 * nowhere while looking exactly like part of the suite.
 *
 * Both checks fail loudly with the fix in the message, and neither has an
 * opinion about directories that deliberately run elsewhere: `apps/api/test`
 * and `packages/analyzer/test` use `.test.mjs` under their own workspace
 * scripts, and are ignored here precisely because they hold no `.test.ts`.
 */
const looksLikeATest = /\.(test|spec)\.[a-z]+$/i;
const stranded = testDirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((f) => looksLikeATest.test(f) && !f.endsWith('.test.ts'))
    .map((f) => join(dir, f).replace(`${root}/`, '')),
);
if (stranded.length) {
  console.error(
    `test-core: these look like tests and would never run (this runner only discovers *.test.ts):\n` +
      stranded.map((f) => `  ${f}`).join('\n') +
      `\nRename them to .test.ts, or move them to a workspace with its own runner.`,
  );
  process.exit(1);
}

const known = new Set(testDirs);
const unseen = [];
for (const group of ['packages', 'apps']) {
  const base = join(root, group);
  if (!existsSync(base)) continue;
  for (const pkg of readdirSync(base)) {
    const dir = join(base, pkg, 'test');
    if (!existsSync(dir) || known.has(dir)) continue;
    if (readdirSync(dir).some((f) => f.endsWith('.test.ts'))) unseen.push(dir.replace(`${root}/`, ''));
  }
}
if (unseen.length) {
  console.error(
    `test-core: these directories hold .test.ts files and are not in testDirs, so nothing runs them:\n` +
      unseen.map((d) => `  ${d}`).join('\n') +
      `\nAdd them to testDirs above.`,
  );
  process.exit(1);
}

await build({
  entryPoints: entries,
  outdir: outDir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: 'inline',
  outExtension: { '.js': '.mjs' },
  jsx: 'automatic',
  jsxImportSource: 'preact',
  // jsdom + node builtins stay external; @webable/* are inlined from source.
  external: ['jsdom'],
  logLevel: 'warning',
});

// The widget loader is an IIFE that runs against whatever document it finds,
// so apps/widget/test evaluates the built file inside jsdom rather than
// importing it. Build it here, with the same settings the real widget build
// uses, so the test exercises what ships.
await build({
  entryPoints: [join(root, 'apps/widget/src/loader.ts')],
  outfile: join(outDir, 'widget-loader.js'),
  bundle: true,
  format: 'iife',
  target: ['es2017'],
  logLevel: 'warning',
});

// esbuild mirrors the entry dir structure under outDir, so walk recursively.
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.mjs') ? [p] : [];
  });
}
const built = walk(outDir).filter((f) => f.endsWith('.test.mjs'));
if (!built.length) {
  console.error('No test bundles were produced.');
  process.exit(1);
}

const res = spawnSync('node', ['--test', ...built], { stdio: 'inherit' });
process.exit(res.status ?? 1);
