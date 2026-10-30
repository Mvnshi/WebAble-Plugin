/**
 * Streaming Guide. The point of the whole path is that the pointer lands on
 * step one while the model is still writing step two, so these assert on WHEN
 * the overlay updates, not just the final state.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGuide } from '../src/tools/guide';
import { createTagStream, type CompanionEvent } from '@webable/companion';
import type { AIProvider } from '../src/types';

const PAGE = `<!doctype html><html><body>
  <button>Alpha</button><button>Bravo</button><button>Charlie</button>
</body></html>`;

function dom() {
  const d = new JSDOM(PAGE, { pretendToBeVisual: true });
  const w = d.window as unknown as Window & typeof globalThis;
  // jsdom gives every element a zero box; the overlay skips those.
  w.Element.prototype.getBoundingClientRect = function () {
    return { x: 10, y: 10, width: 80, height: 24, top: 10, left: 10, right: 90, bottom: 34, toJSON() {} } as DOMRect;
  };
  w.Element.prototype.getClientRects = function () {
    return [{ width: 80, height: 24 }] as unknown as DOMRectList;
  };
  return d;
}

/** A provider that streams the given chunks, letting the test drive timing. */
function streamingProvider(chunks: string[], onChunkSent?: (i: number) => void): AIProvider {
  return {
    id: 'test',
    isConfigured: () => true,
    describeImage: async () => '',
    simplify: async () => '',
    summarize: async () => '',
    ask: async () => '',
    translate: async () => '',
    explain: async () => '',
    ocr: async () => '',
    guide: async () => ({ say: 'batch fallback', point: null }),
    async guideStream(_input, onEvent) {
      const tags = createTagStream();
      for (let i = 0; i < chunks.length; i++) {
        for (const ev of tags.push(chunks[i])) onEvent(ev as CompanionEvent);
        onChunkSent?.(i);
      }
      for (const ev of tags.end()) onEvent(ev as CompanionEvent);
    },
  };
}

test('the pointer lands on step one before the stream finishes', async () => {
  const d = dom();
  const seenWhilePointing: number[] = [];
  const chunks = [
    'Click Alpha first. [POINT:1:Alpha][STEP]',
    'Then Bravo. [POINT:2:Bravo][STEP]',
    'Finally Charlie. [POINT:3][STEP]',
  ];
  let guide: ReturnType<typeof createGuide>;
  const provider = streamingProvider(chunks, (i) => {
    // Record how many steps the overlay knows about after each chunk.
    seenWhilePointing.push(guide.getState().steps.length);
  });
  guide = createGuide(provider, d.window.document);
  await guide.ask('how do I do this');

  // After the SECOND chunk the overlay must already be showing step one:
  // that is the mid-stream pointer move this whole path exists for.
  assert.ok(
    seenWhilePointing[1] >= 1,
    `overlay should have a step after chunk 2, saw ${JSON.stringify(seenWhilePointing)}`
  );
  const st = guide.getState();
  assert.equal(st.status, 'active');
  assert.equal(st.steps.length, 3);
  assert.equal(st.steps[0].say, 'Click Alpha first.');
  assert.equal(st.steps[0].point, 1);
  assert.equal(st.steps[2].point, 3);
  guide.stop();
});

test('the overlay does not jump back to step one when the stream ends', async () => {
  const d = dom();
  const provider = streamingProvider(['One. [POINT:1][STEP]', 'Two. [POINT:2][STEP]']);
  const guide = createGuide(provider, d.window.document);
  await guide.ask('walk me through');
  // Advance, then confirm nothing yanks the user back.
  guide.next();
  assert.equal(guide.getState().stepIndex, 1);
  assert.equal(guide.getState().steps[1].point, 2);
  guide.stop();
});

test('a provider without streaming still works through the batch path', async () => {
  const d = dom();
  const provider: AIProvider = {
    ...streamingProvider([]),
    guide: async () => ({ say: 'Just click Bravo.', point: 2, label: 'Bravo' }),
  };
  delete (provider as { guideStream?: unknown }).guideStream;
  const guide = createGuide(provider, d.window.document);
  await guide.ask('what now');
  const st = guide.getState();
  assert.equal(st.status, 'active');
  assert.equal(st.steps.length, 1);
  assert.equal(st.steps[0].say, 'Just click Bravo.');
  assert.equal(st.steps[0].point, 2);
  guide.stop();
});

test('a stream that fails surfaces the error instead of hanging', async () => {
  const d = dom();
  const provider: AIProvider = {
    ...streamingProvider([]),
    async guideStream() {
      throw new Error('upstream exploded');
    },
  };
  const guide = createGuide(provider, d.window.document);
  await guide.ask('hello');
  assert.equal(guide.getState().status, 'error');
  assert.match(guide.getState().error || '', /upstream exploded/);
  guide.stop();
});

test('the panel transcript fills in while the answer is still streaming', async () => {
  const d = dom();
  const seen: number[] = [];
  let guide: ReturnType<typeof createGuide>;
  const provider = streamingProvider(
    ['Click Alpha first. [POINT:1][STEP]', 'Then Bravo. [POINT:2][STEP]', 'Done. [STEP]'],
    () => {
      // Length of the assistant transcript visible to the panel right now.
      const msgs = guide.getState().messages;
      const last = msgs[msgs.length - 1];
      seen.push(last && last.role === 'assistant' ? last.text.length : 0);
    },
  );
  guide = createGuide(provider, d.window.document);
  await guide.ask('walk me through');

  assert.ok(seen[0] > 0, 'transcript must appear from the first chunk, not at the end');
  assert.ok(seen[1] > seen[0], `transcript should grow as it streams, saw ${JSON.stringify(seen)}`);

  // And when the stream ends there is exactly one assistant turn, not a
  // duplicate left over from the partial.
  const msgs = guide.getState().messages;
  assert.equal(msgs.filter((m) => m.role === 'assistant').length, 1);
  assert.equal(msgs.filter((m) => m.role === 'user').length, 1);
  guide.stop();
})
