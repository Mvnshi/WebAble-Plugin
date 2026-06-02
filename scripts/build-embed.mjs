#!/usr/bin/env node
// Build the embeddable WebAble widget into a single self-contained file.
//
// Output:
//   dist/webable.js   — one <script> drop-in. Injects the CSS, defines
//                       WebAble.Engine, and runs the website widget runtime.
//   dist/webable.css  — the standalone stylesheet, for advanced self-hosting.
//
// Zero dependencies. We intentionally do NOT minify: content.css embeds inline
// SVG data-URIs (colour-blindness filters, big-cursor shapes) whose whitespace
// is significant, and a naive minifier corrupts them. The bundle gzips small.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const pkg = JSON.parse(read('package.json'));
const version = pkg.version;

const engineSrc = read('core/webable-engine.js');
const runtimeSrc = read('embed/webable.embed.js');
const baseCss = read('content.css');
const embedCss = read('embed/webable.embed.css');
const combinedCss = baseCss + '\n\n' + embedCss;

const banner =
`/*! WebAble v${version} — embeddable accessibility widget. MIT License.
 * https://github.com/Mvnshi/WebAble-Plugin
 * One line, every visitor, no extension required. User-side by design:
 * adapts the page for the person who opens it; never fakes WCAG compliance. */\n`;

const cssInjector =
`(function(){
  if (typeof document === 'undefined') return;
  if (document.getElementById('webable-embed-styles')) return;
  var css = ${JSON.stringify(combinedCss)};
  var style = document.createElement('style');
  style.id = 'webable-embed-styles';
  style.setAttribute('data-webable', 'core');
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
})();\n`;

const bundle =
  banner +
  cssInjector + '\n' +
  '/* ── core/webable-engine.js ──────────────────────────────────────────── */\n' +
  engineSrc + '\n' +
  '/* ── embed/webable.embed.js ──────────────────────────────────────────── */\n' +
  runtimeSrc + '\n';

const distDir = join(root, 'dist');
if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

writeFileSync(join(distDir, 'webable.js'), bundle);
writeFileSync(join(distDir, 'webable.css'), banner.replace(/\.js/g, '.css') + combinedCss);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const jsBytes = Buffer.byteLength(bundle);
const jsGz = gzipSync(bundle).length;
const cssBytes = Buffer.byteLength(combinedCss);

console.log('WebAble embed build OK — v' + version);
console.log('  dist/webable.js   ' + kb(jsBytes).padStart(9) + '  (' + kb(jsGz) + ' gzipped)');
console.log('  dist/webable.css  ' + kb(cssBytes).padStart(9));
if (jsGz > 60 * 1024) console.warn('  ! gzipped bundle over 60 KB — consider trimming.');
