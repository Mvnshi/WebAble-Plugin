/**
 * The pure parts of the power layer: the rules that decide labels, scores and
 * what a robots.txt means. The parts that need a real browser (layout, clicks,
 * the performance timeline) are covered in scripts/test-extension.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { letterLabels } from '../src/hints';
import { blockedBots, scorePillar, gradeFor, type CheckResult } from '../src/sitecheck';
import { contrast, luminance, proseWords } from '../src/insights';
import { collectTargets, findSearchInput } from '../src/pageMap';

test('hint labels are all the same length and none is a prefix of another', () => {
  // Mixed lengths would make a person read every label to know how many keys
  // to press, and a prefix would make one label impossible to reach.
  for (const n of [1, 5, 14, 15, 100, 196, 197, 500]) {
    const labels = letterLabels(n);
    assert.equal(labels.length, n);
    assert.equal(new Set(labels).size, n, 'labels are unique');
    assert.equal(new Set(labels.map((l) => l.length)).size, 1, `one length for ${n} labels`);
    for (const a of labels) for (const b of labels) if (a !== b) assert.ok(!b.startsWith(a));
  }
  assert.equal(letterLabels(14)[0].length, 1, 'a small page needs one key');
  assert.equal(letterLabels(15)[0].length, 2, 'and a bigger one two');
});

test('robots.txt: an AI crawler is blocked only by a rule that shuts it out of the whole site', () => {
  const robots = [
    'User-agent: GPTBot',
    'Disallow: /',
    '',
    'User-agent: ClaudeBot',
    'Disallow: /private',
    '',
    'User-agent: *',
    'Allow: /',
  ].join('\n');
  assert.deepEqual(blockedBots(robots), ['GPTBot']);
  // A catch-all block covers every bot without a group of its own.
  assert.ok(blockedBots('User-agent: *\nDisallow: /').includes('ClaudeBot'));
  // A bot's own group wins over the catch-all, which is how crawlers read it.
  assert.ok(!blockedBots('User-agent: *\nDisallow: /\n\nUser-agent: PerplexityBot\nAllow: /').includes('PerplexityBot'));
  // Agents listed together share the group's rules.
  assert.deepEqual(blockedBots('User-agent: CCBot\nUser-agent: Google-Extended\nDisallow: /').sort(), ['CCBot', 'Google-Extended']);
});

test('scores weigh a critical failure far above a minor one, and notes do not count', () => {
  const mk = (status: CheckResult['status'], severity: CheckResult['severity']): CheckResult => ({ id: Math.random().toString(), pillar: 'access', title: '', status, severity, detail: '', fix: '' });
  assert.equal(scorePillar([mk('pass', 'critical'), mk('pass', 'minor')]).score, 100);
  const criticalFail = scorePillar([mk('fail', 'critical'), mk('pass', 'minor')]).score;
  const minorFail = scorePillar([mk('pass', 'critical'), mk('fail', 'minor')]).score;
  assert.ok(criticalFail < 20 && minorFail > 85, `critical ${criticalFail}, minor ${minorFail}`);
  assert.equal(scorePillar([mk('info', 'serious')]).score, 100, 'a note is not a failure');
  assert.equal(scorePillar([mk('warn', 'serious')]).score, 50, 'a warning is half');
  assert.equal(gradeFor(96), 'A+');
  assert.equal(gradeFor(40), 'F');
});

test('contrast is the WCAG formula', () => {
  const white = luminance('rgb(255, 255, 255)')!;
  const black = luminance('rgb(0, 0, 0)')!;
  assert.equal(Math.round(contrast(white, black)), 21);
  // #767676 on white is the lightest grey that passes AA, at 4.54:1.
  const grey = luminance('rgb(118, 118, 118)')!;
  assert.ok(contrast(grey, white) >= 4.5 && contrast(grey, white) < 4.6);
  assert.equal(luminance('rgba(0, 0, 0, 0)'), null, 'transparent has no colour of its own');
});

test('the page map finds headings, regions, links and the search box', () => {
  const { window } = new JSDOM(`<body>
    <header><nav aria-label="Main"><a href="/a">Alpha</a></nav><form role="search"><input name="q"></form></header>
    <main><h1>Title</h1><h2>Pricing</h2><a href="/b">Beta</a><a href="/b">Beta</a></main>
    <div data-webable-ui="x"><a href="/ours">Ours</a></div>
  </body>`, { url: 'https://example.test/' });
  const targets = collectTargets(window.document);
  const labels = targets.map((t) => `${t.kind}:${t.label}`);
  assert.ok(labels.includes('heading:Pricing'));
  assert.ok(labels.includes('landmark:Navigation: Main'));
  assert.ok(labels.includes('landmark:Main content'));
  assert.equal(labels.filter((l) => l === 'link:Beta').length, 1, 'duplicate links collapse');
  assert.ok(!labels.includes('link:Ours'), 'WebAble never lists its own UI');
  assert.equal(findSearchInput(window.document)?.name, 'q');
});

test('prose is counted in the article, not in the menus around it', () => {
  const { window } = new JSDOM(`<body><nav><p>${'menu '.repeat(500)}</p></nav><main><p>${'word '.repeat(120)}</p></main></body>`);
  assert.equal(proseWords(window.document), 120);
});
