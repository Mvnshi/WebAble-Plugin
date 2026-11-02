/**
 * Builds the MV3 extension into apps/extension/dist:
 *   content.js    , shared engine + UI (same code as the widget), as an IIFE
 *   background.js  , service worker (command + action routing)
 *   manifest.json, icons/, assets/fonts/ , copied
 *
 * Run: npm run build:extension
 */
import { build, context } from 'esbuild';
import { cssCommentPlugin } from '../../scripts/css-comment-plugin.mjs';
import { cpSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dist = join(root, 'extension');
mkdirSync(dist, { recursive: true });

const watch = process.argv.includes('--watch');
const shared = {
  bundle: true,
  minify: true,
  legalComments: 'none',
  logLevel: 'info',
  format: 'iife',
  target: ['chrome110', 'firefox110'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  define: { 'process.env.NODE_ENV': '"production"' },
  // Same reason as the widget: the stylesheet's comments are for the reader of
  // the source, not for the bytes on the wire.
  plugins: [cssCommentPlugin()],
};

const entries = {
  content: 'src/content.ts',
  background: 'src/background.ts',
  popup: 'src/popup.ts',
  options: 'src/options.ts',
  report: 'src/report.tsx',
  welcome: 'src/welcome.ts',
};
const configs = Object.entries(entries).map(([name, src]) => ({
  ...shared,
  entryPoints: { [name]: join(here, src) },
  outfile: join(dist, `${name}.js`),
}));

function copyAssets() {
  copyFileSync(join(here, 'manifest.json'), join(dist, 'manifest.json'));
  for (const html of ['popup.html', 'options.html', 'report.html', 'welcome.html']) copyFileSync(join(here, 'src', html), join(dist, html));
  const icons = join(here, 'icons');
  if (existsSync(icons)) cpSync(icons, join(dist, 'icons'), { recursive: true });
  const font = join(root, 'assets/fonts/OpenDyslexic-Regular.woff2');
  if (existsSync(font)) {
    mkdirSync(join(dist, 'assets/fonts'), { recursive: true });
    copyFileSync(font, join(dist, 'assets/fonts/OpenDyslexic-Regular.woff2'));
  }
}

if (watch) {
  const ctxs = await Promise.all(configs.map((c) => context(c)));
  await Promise.all(ctxs.map((c) => c.watch()));
  copyAssets();
  console.log('watching extension…');
} else {
  await Promise.all(configs.map((c) => build(c)));
  copyAssets();
  console.log('Extension built → extension/ (load unpacked in chrome://extensions)');
}
