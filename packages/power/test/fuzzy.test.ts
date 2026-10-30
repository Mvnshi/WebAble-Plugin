/**
 * The rule: the first result is the one the person meant.
 *
 * The bar runs the top hit on Enter, so ranking is not cosmetic: a wrong first
 * row is a wrong action. These cases are the shapes people actually type:
 * prefixes, initials, a typo, and synonyms.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rank, score, editDistance } from '../src/fuzzy';

const items = [
  { title: 'Dark mode', keywords: ['night mode', 'dark theme'] },
  { title: 'Invert / dark', keywords: ['negative'] },
  { title: 'Text size', keywords: ['font', 'bigger', 'larger'] },
  { title: 'Text spacing', keywords: ['line height'] },
  { title: 'Picture-in-picture', keywords: ['pip', 'float video'] },
  { title: 'High contrast', keywords: ['contrast'] },
  { title: 'Hide cookie banners', keywords: ['cookie', 'consent', 'gdpr'] },
  { title: 'Dyslexia font', keywords: ['opendyslexic'] },
];
const top = (q: string) => rank(q, items)[0]?.title;

test('prefixes and whole words find the obvious tool', () => {
  assert.equal(top('dark'), 'Dark mode');
  assert.equal(top('text si'), 'Text size');
  assert.equal(top('cookies'), 'Hide cookie banners');
});

test('initials work, the way people abbreviate tools', () => {
  assert.equal(top('pip'), 'Picture-in-picture');
  assert.equal(top('hc'), 'High contrast');
});

test('one typo in a long enough word still finds it', () => {
  assert.equal(top('drak mode'), 'Dark mode');
  assert.equal(top('contrsat'), 'High contrast');
});

test('a synonym finds the tool, but ranks below a title hit', () => {
  assert.equal(top('night'), 'Dark mode');
  assert.ok(score('font', items[2]) > 0);
  assert.ok(score('dyslexia', items[7]) > score('opendyslexic', items[7]) * 0.5);
});

test('every word of the query has to land, or it is not a match', () => {
  assert.equal(score('dark zebra', items[0]), 0);
  assert.deepEqual(rank('zebra', items), []);
});

test('short garbage does not match through scattered letters', () => {
  assert.deepEqual(rank('zq', items), []);
});

test('the edit distance helper counts a swap as one edit', () => {
  assert.equal(editDistance('drak', 'dark', 1), 1);
  assert.equal(editDistance('mode', 'mode', 1), 0);
  assert.ok(editDistance('apple', 'zebra', 1) > 1);
});
