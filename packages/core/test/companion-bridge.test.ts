/**
 * Companion protocol to Guide render-shape mapping. Element anchors carry
 * through; desktop screen coordinates are dropped rather than mis-rendered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCompanionReply } from '@webable/companion';
import { toGuideReply, toGuideStep } from '../src/tools/companion-bridge';

test('a streamed walkthrough maps onto the Guide reply shape', () => {
  const reply = toGuideReply(
    parseCompanionReply(
      'Open the menu. [POINT:2:menu][DRAW:circle:2][STEP]Now save. [POINT:7][DRAW:arrow:2>7]'
    )
  );
  assert.equal(reply.steps?.length, 2);
  assert.equal(reply.say, 'Open the menu.');
  assert.equal(reply.point, 2, 'first step doubles as the single-answer fields');
  assert.equal(reply.label, 'menu');
  assert.deepEqual(reply.steps?.[0].draw, [{ kind: 'circle', el: 2 }]);
  assert.deepEqual(reply.steps?.[1].draw, [{ kind: 'arrow', el: 2, to: 7 }]);
});

test('desktop screen coordinates are dropped, not mis-rendered as pixels', () => {
  const step = toGuideStep({
    say: 'Click there.',
    point: { kind: 'point', x: 800, y: 400 },
    draw: [{ kind: 'box', from: { kind: 'point', x: 800, y: 400 } }],
  });
  assert.equal(step.point, null, 'a raw screen pixel is not a web target');
  assert.equal(step.draw, undefined);
  assert.equal(step.say, 'Click there.', 'narration still renders');
});

test('an incomplete annotation is dropped without killing the step', () => {
  const step = toGuideStep({
    say: 'Look here.',
    point: { kind: 'element', index: 3 },
    // An arrow with no destination and a label with no text are both unrenderable.
    draw: [
      { kind: 'arrow', from: { kind: 'element', index: 3 } },
      { kind: 'label', from: { kind: 'element', index: 3 } },
      { kind: 'underline', from: { kind: 'element', index: 3 } },
    ],
  });
  assert.deepEqual(step.draw, [{ kind: 'underline', el: 3 }]);
  assert.equal(step.point, 3);
});

test('an empty walkthrough yields a safe empty reply', () => {
  assert.deepEqual(toGuideReply([]), { say: '', point: null });
});
