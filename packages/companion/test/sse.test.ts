/**
 * SSE framing. Network chunks do not align with event boundaries, so the
 * parser has to join split events and split joined ones.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSseParser, geminiChunkText, readSseStream } from '../src/index';

test('events split across chunks are rejoined', () => {
  const p = createSseParser();
  assert.deepEqual(p.push('data: hel'), []);
  assert.deepEqual(p.push('lo\n\n'), [{ data: 'hello' }]);
});

test('several events in one chunk all come out', () => {
  const p = createSseParser();
  assert.deepEqual(p.push('data: a\n\ndata: b\n\n'), [{ data: 'a' }, { data: 'b' }]);
});

test('comments and keep-alives are ignored, event names are kept', () => {
  const p = createSseParser();
  assert.deepEqual(p.push(': ping\n\n'), []);
  assert.deepEqual(p.push('event: error\ndata: nope\n\n'), [{ data: 'nope', event: 'error' }]);
});

test('multi-line data rejoins with newlines and CRLF framing works', () => {
  const p = createSseParser();
  assert.deepEqual(p.push('data: one\ndata: two\r\n\r\n'), [{ data: 'one\ntwo' }]);
});

test('a trailing event with no blank line is flushed at end', () => {
  const p = createSseParser();
  assert.deepEqual(p.push('data: last'), []);
  assert.deepEqual(p.end(), [{ data: 'last' }]);
});

test('geminiChunkText pulls deltas and ignores metadata frames', () => {
  assert.equal(
    geminiChunkText(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hi ' }, { text: 'there' }] } }] })),
    'hi there'
  );
  assert.equal(geminiChunkText(JSON.stringify({ usageMetadata: { totalTokenCount: 5 } })), '');
  assert.equal(geminiChunkText('[DONE]'), '');
  assert.equal(geminiChunkText('not json'), '');
});

test('readSseStream drains a real ReadableStream', async () => {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode('data: a\n\ndata: '));
      c.enqueue(enc.encode('b\n\n'));
      c.close();
    },
  });
  const seen: string[] = [];
  await readSseStream(stream, (ev) => seen.push(ev.data));
  assert.deepEqual(seen, ['a', 'b']);
});
