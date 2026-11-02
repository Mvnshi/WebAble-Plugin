/**
 * The channel the checkout page delivers a subscription token on.
 *
 * `externally_connectable` opens a door from the web into the extension. These
 * tests hold the two properties that keep it narrow, because both are the kind
 * of thing a later edit widens for convenience without noticing what it costs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ext = join(process.cwd(), 'apps/extension');
const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8')) as {
  externally_connectable?: { matches?: string[] };
};
const background = readFileSync(join(ext, 'src/background.ts'), 'utf8');

/**
 * Just the external listener's own source.
 *
 * Sliced to the next internal listener rather than to end-of-file, because the
 * internal one is declared after it and a naive slice swept it in, which made
 * this test report a leak that was not there.
 */
function externalListener(): string {
  const start = background.indexOf('onMessageExternal');
  assert.ok(start > 0, 'there is no external listener at all');
  const rest = background.slice(start);
  const end = rest.indexOf('chrome.runtime?.onMessage?');
  return end > 0 ? rest.slice(0, end) : rest;
}

test('the token channel is open to named hosts only, never a wildcard', () => {
  // A wildcard would let any page on the web hand the extension a token, which
  // is a way to point somebody's AI traffic at an account they do not control
  // and cannot see. The manifest is the only thing standing in front of that.
  const matches = manifest.externally_connectable?.matches;
  assert.ok(matches?.length, 'externally_connectable is missing, so the token has no way to arrive');
  for (const m of matches) {
    assert.match(m, /^https:\/\//, `${m} must be https`);
    const host = m.replace(/^https:\/\//, '').split('/')[0];
    assert.ok(!host.includes('*'), `${m} matches a wildcard host, which is every site on that suffix`);
  }
});

test('external messages are handled by their own listener, not the internal one', () => {
  // onMessage handles WEBABLE_TOGGLE and WEBABLE_CAPTURE with no sender check,
  // which is safe only while its senders can only be our own popup and content
  // scripts. Serving both from one listener would put every message it already
  // handles within reach of any allowed web page.
  assert.match(background, /onMessageExternal/, 'there must be a separate external listener');
  const external = externalListener();
  const internalTypes = ['WEBABLE_TOGGLE', 'WEBABLE_CAPTURE'];
  for (const type of internalTypes) {
    assert.ok(
      !external.includes(type),
      `${type} is reachable from the external listener, which exposes it to the web`,
    );
  }
});

test('the external listener checks the sender itself', () => {
  // Belt and braces over the manifest. If someone widens the manifest without
  // revisiting this file, the check here is what still refuses the message.
  const external = externalListener();
  assert.match(external, /sender/, 'the handler must look at who sent the message');
  assert.match(external, /ALLOWED_SENDERS|origin/, 'the handler must compare the origin');
});

test('the token is stored device-local, never in sync', () => {
  // chrome.storage.sync uploads to Google and pushes to every browser the user
  // is signed into. The Gemini key was moved out of sync for exactly this
  // reason; a session token is no less a credential.
  const external = externalListener();
  assert.match(external, /chrome\.storage\.local/, 'the token must go to local storage');
  assert.ok(!/chrome\.storage\.sync/.test(external), 'the token must never touch sync');
});
