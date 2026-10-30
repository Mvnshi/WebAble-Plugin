/**
 * The rule: a provider may only report itself configured when it can actually
 * make a call.
 *
 * Why it exists: createProxyProvider returned true from isConfigured() whenever
 * no token getter was passed, and apps/widget/src/boot.ts constructs exactly
 * that on data-webable-ai-proxy. Every route in apps/api/src/routes/ai.ts sits
 * behind requireAuth, so the widget announced working AI, sent no Authorization
 * header, and every request came back 401. The user pressed a button that said
 * it would work and then waited to be told it would not. The function's own doc
 * comment had said "without one the provider reports unconfigured" the whole
 * time; the code did the opposite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEngine, createProxyProvider, createGeminiProvider, memoryAdapter, FEATURE_MAP } from '@webable/core';

test('a proxy provider with no way to authenticate reports itself unconfigured', () => {
  // apps/widget/src/boot.ts builds exactly this on data-webable-ai-proxy, and
  // every route in apps/api/src/routes/ai.ts is behind requireAuth. So the
  // widget announced working AI, sent no Authorization header, and each request
  // came back 401 after a round trip: the user pressed a button that said it
  // would work and waited to be told it did not.


  assert.equal(
    createProxyProvider('https://api.example.test').isConfigured(),
    false,
    'no token getter at all is not a configured provider',
  );
  assert.equal(
    createProxyProvider('https://api.example.test', () => null).isConfigured(),
    false,
    'a token getter with nobody signed in is not either',
  );
  assert.equal(
    createProxyProvider('https://api.example.test', () => 'jwt').isConfigured(),
    true,
    'a token is what makes it configured',
  );
  assert.equal(
    createProxyProvider('https://api.example.test', { anonymous: true }).isConfigured(),
    true,
    'a relay that authenticates some other way can still say so, deliberately',
  );
});

test('an unconfigured proxy tells the reader something they can act on', () => {
  // "Add a Gemini key in the panel" is right for a BYO-key install and wrong
  // on a site whose owner pointed the widget at a relay: there is no key to
  // add and the panel has nowhere to put one.

  const tldr = FEATURE_MAP.get('tldrPin')!;

  const run = (provider: ReturnType<typeof createProxyProvider>) => {
    const d = new JSDOM('<!doctype html><html><head></head><body><article><p>Some article text.</p></article></body></html>', {
      pretendToBeVisual: true,
    }).window.document;
    const engine = createEngine({ doc: d, storage: memoryAdapter(), provider });
    engine.toggleFeature(tldr.id, true);
    const card = d.querySelector('.wa-tldr p');
    const text = card?.textContent || '';
    engine.destroy();
    return text;
  };

  assert.match(run(createProxyProvider('https://api.example.test')), /not signed in/i);
  assert.match(run(createGeminiProvider(() => '')), /Gemini key/i);
});
