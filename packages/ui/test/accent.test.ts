/**
 * The rule: whatever accent a site owner passes, the launcher stays readable.
 *
 * `--on-accent` was hard-coded white, so a pale brand colour produced white on
 * near-white: an accessibility product failing contrast on its own launcher,
 * which is the one place it cannot. And the value went into a CSS custom
 * property unvalidated, so a typo silently blanked the button's background.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, contrastRatio, resolveAccent, readableOn } from '../src/accent';

const BRAND = '#1e40af';

test('hex, short hex, and rgb() all parse', () => {
  assert.deepEqual(parseColor('#ff0000'), [255, 0, 0]);
  assert.deepEqual(parseColor('#f00'), [255, 0, 0]);
  assert.deepEqual(parseColor('F00'), [255, 0, 0]);
  assert.deepEqual(parseColor('rgb(0, 128, 255)'), [0, 128, 255]);
  assert.deepEqual(parseColor('rgba(0 128 255 / 0.5)'), [0, 128, 255]);
  assert.deepEqual(parseColor('white'), [255, 255, 255]);
});

test('nonsense does not parse', () => {
  for (const bad of ['', 'not-a-color', '#12', 'rgb(300,0,0)', 'var(--brand)', 'transparent']) {
    assert.equal(parseColor(bad), null, `${bad} must not parse`);
  }
});

test('an unparseable accent falls back to the brand colour instead of blanking', () => {
  const a = resolveAccent('cornflowerbluish');
  assert.equal(a.valid, false);
  assert.equal(a.color, BRAND);
});

test('a pale accent gets dark text, a dark accent gets white', () => {
  const pale = resolveAccent('#ffe066');
  assert.match(pale.onColor, /^rgb\(10,27,46\)$/, 'pale yellow must not take white text');

  const dark = resolveAccent('#0b1220');
  assert.equal(dark.onColor, '#ffffff');
});

test('every accent clears 4.5:1 against its chosen foreground, or is not our fault', () => {
  // Mid-greys are the hard case: nothing contrasts well with them, so the best
  // available pairing is what we promise, not a guarantee of AA. Everything
  // outside that band must clear AA.
  const samples = ['#ffffff', '#000000', '#1e40af', '#ffe066', '#2F80FF', '#e11d48', '#10b981', '#f9fafb'];
  for (const s of samples) {
    const a = resolveAccent(s);
    const fg = parseColor(a.onColor)!;
    const bg = parseColor(a.color)!;
    assert.equal(
      Math.round(contrastRatio(fg, bg) * 100) / 100,
      Math.round(a.ratio * 100) / 100,
      `${s}: reported ratio must match the pairing`,
    );
    assert.ok(a.ratio >= 4.5, `${s}: ${a.ratio.toFixed(2)}:1 is below AA`);
  }
});

test('the worst-case grey still picks the better of the two', () => {
  // #767676 is roughly the point where white and near-black are equally bad.
  // The promise is "the better one", and it is honest that it is under 4.5.
  const a = resolveAccent('#808080');
  const fg = parseColor(a.onColor)!;
  const other = a.onColor === '#ffffff' ? parseColor('rgb(10,27,46)')! : parseColor('#ffffff')!;
  const bg = parseColor(a.color)!;
  assert.ok(contrastRatio(fg, bg) >= contrastRatio(other, bg), 'picked the higher-contrast foreground');
});

// The rule: the accent used for focus rings and small text must be readable on
// the light surface, whatever brand colour a site owner passes.
//
// `--accent-text` was a plain alias of the raw accent in the light theme, and
// it is the outline colour for the icon buttons, profiles, gear, switch,
// segmented control, colour input, buttons, reset and rail tabs. A pale brand
// colour therefore made every focus indicator in the panel invisible, in the
// default theme, on an accessibility product. Dark and glass were always safe
// because they mix the accent toward white.
test('the derived text accent clears 4.5:1 on white for any brand colour', () => {
  const samples = ['#ffe066', '#f9fafb', '#ffffff', '#7DD3FC', '#1e40af', '#10b981', '#e11d48', '#0b1220'];
  for (const s of samples) {
    const a = resolveAccent(s);
    const fg = parseColor(a.textColor)!;
    assert.ok(
      contrastRatio(fg, [255, 255, 255]) >= 4.5,
      `${s}: derived ${a.textColor} is ${contrastRatio(fg, [255, 255, 255]).toFixed(2)}:1 on white`,
    );
  }
});

test('an accent that already reads well is left alone', () => {
  // Darkening a colour that did not need it would drift the brand for nothing.
  const a = resolveAccent('#1e40af');
  assert.equal(a.textColor, 'rgb(30,64,175)');
});

test('readableOn walks toward white on a dark background', () => {
  const lifted = readableOn([30, 64, 175], [15, 23, 34], 4.5);
  assert.ok(contrastRatio(lifted, [15, 23, 34]) >= 4.5);
  assert.ok(lifted[0] > 30, 'lightened rather than darkened');
});
