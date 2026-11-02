/**
 * Builds the embeddable widget:
 *   public/widget.js       , tiny IIFE loader (the one tag site owners paste)
 *   public/webable/boot.js , functional ESM chunk (engine + UI), loaded async
 *   public/webable/fonts/  , OpenDyslexic (best-effort fetch; optional)
 *
 * Run: npm run build:widget  (add --watch to rebuild on change)
 */
import { build, context } from 'esbuild';
import { cssCommentPlugin } from '../../scripts/css-comment-plugin.mjs';
import { gzipSync } from 'node:zlib';
import { readFileSync, mkdirSync, existsSync, copyFileSync, statSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outRoot = join(root, 'dist');
const outWebable = join(outRoot, 'webable');
mkdirSync(outWebable, { recursive: true });

// Clean previously emitted JS (incl. content-hashed chunks) so old chunks
// don't accumulate in public/webable across builds.
for (const f of readdirSync(outWebable)) {
  if (f.endsWith('.js') || f.endsWith('.js.map')) rmSync(join(outWebable, f));
}

const watch = process.argv.includes('--watch');
const shared = {
  bundle: true,
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
};

const loaderCfg = {
  ...shared,
  entryPoints: { widget: join(root, 'apps/widget/src/loader.ts') },
  outdir: outRoot,
  format: 'iife',
  target: ['es2017'],
};

/**
 * Resolve the extension-only panel blocks to their stub. Folding a runtime
 * `config.surface` check is not enough: esbuild decides what to tree-shake
 * before it folds the constant, so the components survive as dead weight in a
 * bundle with a hard gzip budget. Swapping the module means they are never
 * read. See packages/ui/src/extensionBlocks.tsx.
 */
const stubExtensionBlocks = {
  name: 'stub-extension-blocks',
  setup(build) {
    build.onResolve({ filter: /extensionBlocks$/ }, () => ({
      path: join(root, 'packages/ui/src/extensionBlocks.stub.tsx'),
    }));
    // Site Patches is extension-only and its UI block is already stubbed above,
    // but the engine constructs a patch store unconditionally, so the widget
    // was shipping 5.5 KB of selector building, target resolution and the
    // element picker for a feature it has no way to reach.
    build.onResolve({ filter: /tools\/patches$/ }, () => ({
      path: join(root, 'packages/core/src/tools/patches.stub.ts'),
    }));
    // ClarityView's extractor, Standard and renderer cost 7.7 KB gzipped, which
    // does not fit and would not fit even if the budget were empty today. The
    // widget keeps the previous reader behaviour through the stub, so embedding
    // sites lose nothing they had. Measured: 72.6 KB without this rule, 64.96
    // with. The leading slash is deliberate, so a bare package named `clarity`
    // cannot match, and nothing inside packages/core/src/clarity/ imports
    // './clarity' or '../clarity', so this cannot capture the module's own
    // internals. The only import it needs to catch is '../clarity', written
    // once, in packages/core/src/features/reader.ts.
    build.onResolve({ filter: /\/clarity$/ }, () => ({
      path: join(root, 'packages/core/src/clarity/index.stub.ts'),
    }));
    // The friction log is in exactly the position Site Patches was: its panel
    // block renders only under `surface === 'extension'` and reaches the panel
    // through extensionBlocks, which is already stubbed, so the UI half was
    // gone. The engine still constructed a friction store unconditionally, so
    // the widget carried the entry list, the storage round trip and the
    // subscriber set for a feature with no way to reach it. Measured: 158 bytes
    // gzipped, swapping this one rule on the same tree.
    build.onResolve({ filter: /tools\/friction$/ }, () => ({
      path: join(root, 'packages/core/src/tools/friction.stub.ts'),
    }));
  },
};

const bootCfg = {
  ...shared,
  // CSS comments in the panel stylesheet were shipping to every visitor:
  // 2.1 KB gzipped of a 65 KB budget. They stay in the source and stop
  // costing anything. See scripts/css-comment-plugin.mjs.
  plugins: [stubExtensionBlocks, cssCommentPlugin()],
  entryPoints: { boot: join(root, 'apps/widget/src/boot.ts') },
  outdir: outWebable,
  format: 'esm',
  splitting: true,
  // Stable chunk names (no content hash): a cached boot.js must never point
  // at a deleted chunk URL after a deploy. Freshness is handled by
  // Cache-Control: must-revalidate headers in next.config.mjs instead.
  chunkNames: '[name]',
  target: ['es2019'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
};

/**
 * The font ships in the repo rather than being fetched at build time. A fetch
 * made the output depend on whether the build machine was online, and dist/ is
 * checked in, so an offline rebuild showed up as a diff deleting the font.
 */
function copyFont() {
  const dir = join(outWebable, 'fonts');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(root, 'assets/fonts/OpenDyslexic-Regular.woff2'), join(dir, 'OpenDyslexic-Regular.woff2'));
}

function report(label, file) {
  const raw = statSync(file).size;
  const gz = gzipSync(readFileSync(file)).length;
  console.log(`${label.padEnd(22)} ${(raw / 1024).toFixed(1)}kb raw  ${(gz / 1024).toFixed(1)}kb gzip`);
}

if (watch) {
  const c1 = await context(loaderCfg);
  const c2 = await context(bootCfg);
  await Promise.all([c1.watch(), c2.watch()]);
  console.log('watching widget…');
} else {
  await Promise.all([build(loaderCfg), build(bootCfg)]);
  copyFileSync(join(outRoot, 'widget.js'), join(outRoot, 'webable.js'));
  copyFont();
  console.log('\nWidget bundle sizes:');
  report('widget.js (loader)', join(outRoot, 'widget.js'));
  report('webable/boot.js', join(outWebable, 'boot.js'));
}
