/**
 * The rule: stripping CSS comments at build time must not change the CSS.
 *
 * The panel and launcher stylesheets are template literals, which esbuild
 * copies verbatim, so their comments were shipping to every visitor: 2.1 KB
 * gzipped of a 65 KB budget. They are now removed at build time so the
 * reasoning can stay in the source for free. That makes the stripper part of
 * what ships, and a stripper that eats a brace in an accessibility product's
 * stylesheet is a worse bug than the bytes it saves.
 *
 * These run the real plugin transform over the real stylesheets.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- plain .mjs build helper, no types
import { cssCommentPlugin, stripCssComments } from '../../../scripts/css-comment-plugin.mjs';

const FILES = ['packages/ui/src/panelStyles.ts', 'packages/ui/src/styles.ts'];

/** Pull the css template out of a source file. */
function cssOf(source: string): string {
  const m = /\/\* css \*\/ `([\s\S]*?)`;/.exec(source);
  assert.ok(m, 'expected a /* css */ template literal');
  return m![1];
}

/** Every declaration and selector, ignoring comments and whitespace. */
function shape(css: string): string[] {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/[\n;{}]/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

for (const file of FILES) {
  const source = readFileSync(join(process.cwd(), file), 'utf8');
  const before = cssOf(source);
  const after = cssOf(stripCssComments(source, file));

  test(`${file}: the stripper removes comments`, () => {
    assert.ok(/\/\*/.test(before), 'the source has comments to remove');
    assert.equal(/\/\*/.test(after), false, 'and none survive');
  });

  test(`${file}: every rule survives the strip, in order`, () => {
    // Comparing the declaration sequence catches a stripper that swallowed a
    // brace, a selector, or the tail of a rule, which is how this kind of
    // transform actually fails.
    assert.deepEqual(shape(after), shape(before));
  });

  test(`${file}: braces stay balanced`, () => {
    const open = (after.match(/\{/g) || []).length;
    const close = (after.match(/\}/g) || []).length;
    assert.equal(open, close);
    assert.equal(open, (before.match(/\{/g) || []).length);
  });

  test(`${file}: it actually saves something worth doing`, () => {
    assert.ok(after.length < before.length * 0.9, `only saved ${before.length - after.length} of ${before.length} chars`);
  });

  test(`${file}: checkout line endings do not change the shipped CSS`, () => {
    const lf = source.replace(/\r\n/g, '\n');
    const crlf = lf.replace(/\n/g, '\r\n');
    assert.equal(cssOf(stripCssComments(crlf, file)), cssOf(stripCssComments(lf, file)));
  });
}

test('the build strips UI CSS on Windows and POSIX paths', () => {
  type Handler = (args: { path: string }) => { contents: string; loader: string } | null;
  const handlers: { filter: RegExp; callback: Handler }[] = [];
  cssCommentPlugin().setup({
    onLoad(options: { filter: RegExp }, callback: Handler) {
      handlers.push({ ...options, callback });
    },
  });
  assert.equal(handlers.length, 1);
  const { filter, callback } = handlers[0];
  for (const file of FILES) {
    assert.ok(filter.test(`/repo/${file}`), `the plugin must load POSIX path ${file}`);
    const windowsPath = `C:\\repo\\${file.replace(/\//g, '\\')}`;
    assert.ok(filter.test(windowsPath), `the plugin must load Windows path ${windowsPath}`);
    const transformed = callback({ path: join(process.cwd(), file) });
    assert.ok(transformed, 'the real stylesheet must pass through the build transform');
    assert.equal(/\/\*/.test(cssOf(transformed.contents)), false);
  }
});

test('the stripper refuses a template it cannot reason about', () => {
  // Interpolation would let a value carry a brace or a comment marker past the
  // regex. Better to fail the build than to ship a mangled stylesheet.
  assert.throws(
    () => stripCssComments('export const X = /* css */ `a { color: ${c}; }`;', 'fake.ts'),
    /interpolation/,
  );
});
