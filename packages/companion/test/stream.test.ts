/**
 * Companion streaming protocol. The load-bearing behavior is that a tag split
 * across chunk boundaries never leaks into narration, and that brackets which
 * are just prose survive intact.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTagStream,
  collectSteps,
  parseCompanionReply,
  parseAnchor,
  parseTag,
  applyDictionary,
} from '../src/index';
import type { CompanionEvent } from '../src/index';

const say = (events: CompanionEvent[]) =>
  events
    .filter((e): e is Extract<CompanionEvent, { type: 'text' }> => e.type === 'text')
    .map((e) => e.text)
    .join('');

/* ---- anchors --------------------------------------------------------------- */

test('parseAnchor reads element indices and screen points', () => {
  assert.deepEqual(parseAnchor('5'), { kind: 'element', index: 5 });
  assert.deepEqual(parseAnchor(' 12 '), { kind: 'element', index: 12 });
  assert.deepEqual(parseAnchor('840,412'), { kind: 'point', x: 840, y: 412 });
  assert.deepEqual(parseAnchor('840 , 412'), { kind: 'point', x: 840, y: 412 });
  assert.deepEqual(parseAnchor('-4,10.5'), { kind: 'point', x: -4, y: 10.5 });
  // Element indices are 1-based; 0 is refused rather than guessed.
  assert.equal(parseAnchor('0'), null);
  assert.equal(parseAnchor(''), null);
  // Anything else is the target's *name*, which the resolver matches against
  // the element list. Refusing it used to drop the tag and leave the cursor
  // parked, which reads as the product not working at all.
  assert.deepEqual(parseAnchor('banana'), { kind: 'named', name: 'banana' });
  assert.deepEqual(parseAnchor('the File menu'), { kind: 'named', name: 'the File menu' });
});

test('a named target parses rather than being thrown away', () => {
  const evs = parseTag('[POINT:the File menu]');
  assert.ok(evs, 'a named target is a valid tag');
  assert.equal(evs[0].type, 'point');
  assert.deepEqual(evs[0].anchor, { kind: 'named', name: 'the File menu' });
});

/* ---- single tags ------------------------------------------------------------ */

test('parseTag reads every documented tag form', () => {
  assert.deepEqual(parseTag('[STEP]'), [{ type: 'step' }]);
  assert.deepEqual(parseTag('[POINT:none]'), [{ type: 'point', anchor: null }]);
  assert.deepEqual(parseTag('[POINT:5]'), [
    { type: 'point', anchor: { kind: 'element', index: 5 } },
  ]);
  assert.deepEqual(parseTag('[POINT:5:the Save button]'), [
    { type: 'point', anchor: { kind: 'element', index: 5 }, label: 'the Save button' },
  ]);
  // Desktop form: coords + label + display.
  assert.deepEqual(parseTag('[POINT:840,412:Save:screen1]'), [
    { type: 'point', anchor: { kind: 'point', x: 840, y: 412, screen: 1 }, label: 'Save' },
  ]);
  assert.deepEqual(parseTag('[DRAW:circle:5]'), [
    { type: 'draw', draw: { kind: 'circle', from: { kind: 'element', index: 5 } } },
  ]);
  assert.deepEqual(parseTag('[DRAW:arrow:5>7]'), [
    {
      type: 'draw',
      draw: {
        kind: 'arrow',
        from: { kind: 'element', index: 5 },
        to: { kind: 'element', index: 7 },
      },
    },
  ]);
  assert.deepEqual(parseTag('[DRAW:label:5:Click here]'), [
    { type: 'draw', draw: { kind: 'label', from: { kind: 'element', index: 5 }, text: 'Click here' } },
  ]);
});

test('parseTag rejects malformed tags instead of half-applying them', () => {
  assert.equal(parseTag('[POINT:]'), null);
  // NOT banana: a non-numeric target is a name now, and names resolve.
  assert.equal(parseTag('[DRAW:spiral:5]'), null, 'unknown draw kind');
  assert.equal(parseTag('[DRAW:arrow:5]'), null, 'arrow needs a destination');
  assert.equal(parseTag('[DRAW:label:5]'), null, 'label needs text');
  assert.equal(parseTag('[nonsense]'), null);
});

/* ---- CLICK: mirrored in apps/desktop/companion-core/src/tags.rs ------------- */

test('a click takes every anchor form a point takes', () => {
  // A click has to be aimable at exactly what a point is aimable at, or the two
  // tags start meaning different targets and "it clicked the wrong thing"
  // becomes a protocol bug rather than a model mistake.
  assert.deepEqual(parseTag('[CLICK:5]'), [
    { type: 'click', anchor: { kind: 'element', index: 5 } },
  ]);
  assert.deepEqual(parseTag('[CLICK:5:the Save button]'), [
    { type: 'click', anchor: { kind: 'element', index: 5 }, label: 'the Save button' },
  ]);
  assert.deepEqual(parseTag('[CLICK:the File menu]'), [
    { type: 'click', anchor: { kind: 'named', name: 'the File menu' } },
  ]);
  assert.deepEqual(parseTag('[CLICK:840,412:Save:screen1]'), [
    { type: 'click', anchor: { kind: 'point', x: 840, y: 412, screen: 1 }, label: 'Save' },
  ]);
  assert.deepEqual(parseTag('[click:5]'), parseTag('[CLICK:5]'), 'case-insensitive like the rest');
});

test('a click with no target is refused rather than ignored', () => {
  // [POINT:none] puts the pointer away. There is nothing to put away after a
  // click, so accepting the form and doing nothing would let the model believe
  // it had asked for something.
  assert.equal(parseTag('[CLICK:none]'), null);
  assert.equal(parseTag('[CLICK:]'), null);
});

test('a click split across chunks never leaks into narration', () => {
  const s = createTagStream();
  const seen: CompanionEvent[] = [];
  for (const chunk of ['Pressing ', '[CLI', 'CK:5:Save', ' button] for you.']) {
    seen.push(...s.push(chunk));
  }
  seen.push(...s.end());
  assert.equal(say(seen), 'Pressing  for you.');
  const clicks = seen.filter((e) => e.type === 'click');
  assert.equal(clicks.length, 1, 'exactly one click, never two');
  assert.deepEqual(clicks[0], {
    type: 'click',
    anchor: { kind: 'element', index: 5 },
    label: 'Save button',
  });
});

test('an unresolvable click is dropped rather than shown', () => {
  // Leaving it in the prose would read as the companion announcing a press it
  // never made.
  const s = createTagStream();
  const seen = [...s.push('One moment [CLICK:none] and it is done.'), ...s.end()];
  const text = say(seen);
  assert.ok(!text.includes('CLICK'), `raw protocol leaked: ${text}`);
  assert.ok(!text.includes('['), `a stray bracket was left behind: ${text}`);
});

test('collectSteps does not fold a click into a replayable step', () => {
  // A step can be rendered and re-rendered; an action must happen once. If a
  // click rode along inside a step, re-rendering a walkthrough would press
  // things again.
  const steps = parseCompanionReply('Pressing it now. [CLICK:4:Save][STEP]');
  assert.equal(steps.length, 1);
  assert.equal(steps[0].say, 'Pressing it now.');
  assert.equal(steps[0].point, null);
});

test('a label may contain colons', () => {
  assert.deepEqual(parseTag('[POINT:5:Save: keep changes]'), [
    { type: 'point', anchor: { kind: 'element', index: 5 }, label: 'Save: keep changes' },
  ]);
});

/* ---- streaming: the reason this module exists -------------------------------- */

test('a tag split across chunks never leaks into narration', () => {
  const s = createTagStream();
  const seen: CompanionEvent[] = [];
  // Worst case: the tag is broken in three places.
  for (const chunk of ['Click the ', '[POI', 'NT:5:Save', ' button] now.']) {
    seen.push(...s.push(chunk));
  }
  seen.push(...s.end());

  assert.equal(say(seen), 'Click the  now.');
  const point = seen.find((e) => e.type === 'point');
  assert.deepEqual(point, {
    type: 'point',
    anchor: { kind: 'element', index: 5 },
    label: 'Save button',
  });
});

test('the point lands before the sentence finishes streaming', () => {
  const s = createTagStream();
  const first = s.push('Open the menu [POINT:3] and');
  // The cursor command is available from this chunk, not deferred to end().
  assert.ok(
    first.some((e) => e.type === 'point'),
    'point must be emitted as soon as its tag closes'
  );
  assert.equal(say(first), 'Open the menu  and');
});

test('a tag we cannot resolve is dropped rather than shown', () => {
  // The exact string a live run put on screen. The model used our grammar but
  // described the target instead of naming its index, so the tag is well
  // formed and unresolvable. It must vanish, not be read out to the user.
  const s = createTagStream();
  const seen = [
    ...s.push('Now, just click the Ask button [POINT:text input with current value:Ask] next to it.'),
    ...s.end(),
  ];
  const text = say(seen);
  assert.ok(!text.includes('POINT'), `raw protocol leaked: ${text}`);
  assert.ok(!text.includes('['), `a stray bracket was left behind: ${text}`);
  assert.ok(text.includes('click the Ask button'));
  assert.ok(text.includes('next to it.'));
});

test('an unresolvable draw is dropped too', () => {
  const s = createTagStream();
  const seen = [...s.push('You typed it [DRAW:box:the text input] already.'), ...s.end()];
  const text = say(seen);
  assert.ok(!text.includes('DRAW'), `raw protocol leaked: ${text}`);
  assert.equal(text.trim(), 'You typed it  already.'.trim());
});

test('a GO tag switches apps and does not leak into the narration', () => {
  const s = createTagStream();
  const seen = [...s.push('That lives in Chrome, which you have open. [GO:Chrome] One moment.'), ...s.end()];
  const go = seen.find((e) => e.type === 'go');
  assert.ok(go, 'the GO tag must parse');
  assert.equal(go.app, 'Chrome');
  const text = say(seen);
  assert.ok(!text.includes('GO:'), `raw protocol leaked: ${text}`);
  assert.ok(text.includes('which you have open.'));
  assert.ok(text.includes('One moment.'));
});

test('ordinary brackets in prose survive as text', () => {
  const s = createTagStream();
  const seen = [...s.push('Use array[0] and note [1] applies.'), ...s.end()];
  assert.equal(say(seen), 'Use array[0] and note [1] applies.');
  assert.equal(seen.filter((e) => e.type !== 'text').length, 0);
});

test('a bracket that cannot become a tag is released immediately', () => {
  const s = createTagStream();
  // No closing bracket ever arrives, and "[ x" matches no opener.
  const seen = [...s.push('a [ x'), ...s.end()];
  assert.equal(say(seen), 'a [ x');
});

test('an unterminated real tag degrades to prose rather than vanishing', () => {
  const s = createTagStream();
  const mid = s.push('go [POINT:5');
  assert.equal(say(mid), 'go ', 'held back while it could still complete');
  const seen = [...mid, ...s.end()];
  assert.equal(say(seen), 'go [POINT:5', 'flushed on end, nothing lost');
});

test('a runaway candidate is flushed instead of swallowing the reply', () => {
  const s = createTagStream();
  const seen = [...s.push(`[POINT:${'9'.repeat(400)}`), ...s.end()];
  assert.ok(say(seen).length > 300, 'narration is not eaten by a malformed tag');
});

test('tag matching is case-insensitive', () => {
  const s = createTagStream();
  const seen = [...s.push('x [point:5] y [step] z'), ...s.end()];
  assert.ok(seen.some((e) => e.type === 'point'));
  assert.ok(seen.some((e) => e.type === 'step'));
  assert.equal(say(seen), 'x  y  z');
});

/* ---- steps ------------------------------------------------------------------- */

test('collectSteps splits a walkthrough and keeps each step its own targets', () => {
  const steps = parseCompanionReply(
    'First open the menu. [POINT:2:menu][DRAW:circle:2][STEP]' +
      'Then hit save. [POINT:7:Save][DRAW:arrow:2>7][STEP]'
  );
  assert.equal(steps.length, 2);
  assert.equal(steps[0].say, 'First open the menu.');
  assert.deepEqual(steps[0].point, { kind: 'element', index: 2 });
  assert.equal(steps[0].label, 'menu');
  assert.equal(steps[0].draw?.length, 1);
  assert.equal(steps[1].say, 'Then hit save.');
  assert.deepEqual(steps[1].point, { kind: 'element', index: 7 });
  assert.deepEqual(steps[1].draw?.[0], {
    kind: 'arrow',
    from: { kind: 'element', index: 2 },
    to: { kind: 'element', index: 7 },
  });
});

test('a reply with no STEP tags is a single step', () => {
  const steps = parseCompanionReply('Just click here. [POINT:4]');
  assert.equal(steps.length, 1);
  assert.equal(steps[0].say, 'Just click here.');
  assert.deepEqual(steps[0].point, { kind: 'element', index: 4 });
});

test('trailing and repeated STEP tags do not create empty steps', () => {
  const steps = parseCompanionReply('One. [STEP][STEP] Two. [STEP]');
  assert.equal(steps.length, 2);
  assert.deepEqual(
    steps.map((s) => s.say),
    ['One.', 'Two.']
  );
});

test('desktop coordinates flow through to steps unchanged', () => {
  const steps = parseCompanionReply('Hit that. [POINT:1024,768:Export:screen2]');
  assert.deepEqual(steps[0].point, { kind: 'point', x: 1024, y: 768, screen: 2 });
  assert.equal(steps[0].label, 'Export');
});

test('an empty reply produces no steps', () => {
  assert.deepEqual(parseCompanionReply(''), []);
  assert.deepEqual(collectSteps([]), []);
});

/* ---- personal dictionary ---------------------------------------------------
   Mirrors companion-core/src/dictionary.rs. The desktop app corrects in
   TypeScript because that is where the recogniser lives, so the two have to
   agree or the same speech produces different text in different places. */

test('a misheard name is corrected', () => {
  const d = [{ heard: 'web able', meant: 'WebAble' }];
  assert.equal(applyDictionary('open web able please', d), 'open WebAble please');
});

test('a correction never rewrites the inside of another word', () => {
  const d = [{ heard: 'able', meant: 'Able' }];
  assert.equal(applyDictionary('that chair is comfortable', d), 'that chair is comfortable');
  assert.equal(applyDictionary('ask able about it', d), 'ask Able about it');
});

test('a longer phrase wins over a shorter one inside it', () => {
  const d = [
    { heard: 'able', meant: 'Able' },
    { heard: 'web able', meant: 'WebAble' },
  ];
  assert.equal(applyDictionary('open web able', d), 'open WebAble');
});

test('dictionary matching ignores the case the recogniser chose', () => {
  const d = [{ heard: 'cloud', meant: 'Claude' }];
  assert.equal(applyDictionary('ask Cloud, then wait.', d), 'ask Claude, then wait.');
});

test('text with no dictionary is returned unchanged', () => {
  assert.equal(applyDictionary('nothing to do here', []), 'nothing to do here');
});
