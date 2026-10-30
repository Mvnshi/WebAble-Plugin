/**
 * Accounts, and which AI route a call actually takes.
 *
 * The bug these exist for: every AI capability was gated behind the user
 * obtaining a Google Cloud API key, because the extension never constructed a
 * proxy provider at all. A person could pay for a subscription and still be
 * shown a "paste your key" prompt. Each test states the rule it holds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAccountStore,
  readAccount,
  isLive,
  ACCOUNT_KEY,
  createRoutingProvider,
  type Account,
  type StorageAdapter,
} from '../src/index';

function memory(seed: Record<string, unknown> = {}): StorageAdapter & { bag: Record<string, unknown> } {
  const bag: Record<string, unknown> = { ...seed };
  return {
    bag,
    async get(key: string) {
      return bag[key];
    },
    async set(key: string, value: unknown) {
      bag[key] = value;
    },
    async remove(key: string) {
      delete bag[key];
    },
  };
}

const account = (over: Partial<Account> = {}): Account => ({
  token: 'jwt-token',
  email: 'paid@example.com',
  plan: 'pro_monthly',
  expiresAt: 0,
  ...over,
});

/** Records which underlying route answered, without any network. */
function spyProviders() {
  const calls: string[] = [];
  return {
    calls,
    relay: { ok: () => calls.push('relay') },
    own: { ok: () => calls.push('key') },
  };
}

test('a stored account survives a reload', async () => {
  // Otherwise every page load signs the user out, and a subscription becomes
  // something you re-enter rather than something you have.
  const store = createAccountStore(memory({ [ACCOUNT_KEY]: account() }));
  await store.ready;
  assert.equal(store.get()?.token, 'jwt-token');
  assert.equal(store.get()?.plan, 'pro_monthly');
});

test('a half-written account is refused rather than half-trusted', async () => {
  // A shape with no token would still make isConfigured() true, send an
  // unusable Authorization header, and surface the 401 as though the
  // subscription had lapsed. Nothing is better than nearly something.
  assert.equal(readAccount({ email: 'a@b.c', plan: 'pro' }), null);
  assert.equal(readAccount({ token: '' }), null);
  assert.equal(readAccount(null), null);
  assert.equal(readAccount('a string'), null);

  const store = createAccountStore(memory({ [ACCOUNT_KEY]: { plan: 'pro' } }));
  await store.ready;
  assert.equal(store.get(), null);
});

test('an expired token reads as signed out', async () => {
  // The server would reject it anyway. Doing it here means the UI says signed
  // out rather than offering actions that fail with an error nobody can act on.
  const past = Math.floor(Date.now() / 1000) - 60;
  const future = Math.floor(Date.now() / 1000) + 3600;
  assert.equal(isLive(account({ expiresAt: past })), false);
  assert.equal(isLive(account({ expiresAt: future })), true);
  // Zero means "this build did not record the claim", not "expired". Throwing
  // such a token away would sign out everyone who upgraded from that build.
  assert.equal(isLive(account({ expiresAt: 0 })), true);

  const store = createAccountStore(memory({ [ACCOUNT_KEY]: account({ expiresAt: past }) }));
  await store.ready;
  assert.equal(store.get(), null, 'expired is signed out');
});

test('signing out leaves the user own key exactly where it was', async () => {
  // Every subscriber who cancels would otherwise also silently lose the
  // fallback that keeps the tool working at all.
  const storage = memory({ [ACCOUNT_KEY]: account(), 'secret:v1': { apiKey: 'their-own-key' } });
  const store = createAccountStore(storage);
  await store.ready;
  await store.set(null);
  assert.equal(store.get(), null);
  assert.deepEqual(storage.bag['secret:v1'], { apiKey: 'their-own-key' });
});

test('the account is used when there is one, and the key when there is not', async () => {
  // Precedence matters both ways. Using a subscriber's personal Gemini quota
  // while they are paying us charges them twice; ignoring a key when there is
  // no subscription is the wall this whole change exists to remove.
  let token: string | null = null;
  let key = '';
  const provider = createRoutingProvider({
    relayBase: 'https://api.test',
    getToken: () => token,
    getKey: () => key,
  });

  assert.equal(provider.isConfigured(), false, 'neither is the free tier');
  await assert.rejects(() => provider.summarize('text'), /key/i, 'and it explains itself');

  key = 'their-own-key';
  assert.equal(provider.isConfigured(), true, 'a key is enough');
  assert.equal(provider.id, 'gemini');

  token = 'jwt';
  assert.equal(provider.isConfigured(), true);
  assert.equal(provider.id, 'proxy', 'the subscription wins over the key');

  token = null;
  assert.equal(provider.id, 'gemini', 'signing out falls back to the key, not to nothing');

  key = '';
  assert.equal(provider.isConfigured(), false);
});

test('the route is chosen per call, not at construction', async () => {
  // Both states change while the page is open: signing in, signing out,
  // pasting a key, clearing one. A provider decided once at construction is
  // how the extension ended up unable to reach the relay by construction.
  let token: string | null = null;
  const provider = createRoutingProvider({
    relayBase: 'https://api.test',
    getToken: () => token,
    getKey: () => 'a-key',
  });

  assert.equal(provider.id, 'gemini');
  token = 'signed-in-after-construction';
  assert.equal(provider.id, 'proxy', 'no reload required');
});

test('an account store publishes changes so an open panel can notice', async () => {
  // Sign-in happens in another tab. Without a notification the user pays,
  // returns to the tab they started from, and is still looking at the key
  // prompt they just paid to be rid of.
  const store = createAccountStore(memory());
  await store.ready;
  const seen: Array<string | null> = [];
  store.subscribe((a) => seen.push(a?.token ?? null));

  await store.set(account({ token: 'from-checkout' }));
  store.adopt(null);
  assert.deepEqual(seen, ['from-checkout', null]);
});

test('adopting does not write back', async () => {
  // The extension adopts what another context already persisted. Writing it
  // again would be a storage round trip per tab per sign-in.
  const storage = memory();
  const store = createAccountStore(storage);
  await store.ready;
  store.adopt(account());
  assert.equal(store.get()?.token, 'jwt-token');
  assert.equal(storage.bag[ACCOUNT_KEY], undefined, 'nothing was written');
});

/**
 * Degrading rather than failing.
 *
 * The brief's rule: somebody on a plane whose accessibility tool refuses to run
 * because it cannot reach a server has been failed by the product. These pin
 * where the line sits, because falling back too eagerly is its own harm.
 *
 * Driven through a stubbed `fetch` rather than injected providers, because the
 * thing under test is which HOST gets called, and a test that swaps the routes
 * out cannot see that.
 */
function stubFetch(handler: (url: string) => { status: number; body: unknown }) {
  const hits: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    const url = String((input as { url?: string })?.url ?? input);
    hits.push(url);
    const { status, body } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  }) as typeof fetch;
  return { hits, restore: () => { globalThis.fetch = original; } };
}

/** A well-formed Gemini answer, so the fallback route can actually succeed. */
const GEMINI_OK = { candidates: [{ content: { parts: [{ text: 'from the user own key' }] } }] };

test('a paused relay falls back to the user own key instead of failing', async () => {
  // The operator paused hosted AI with the killswitch. That is our problem, not
  // the user's, and somebody who also holds a key should not be stopped by it.
  const { hits, restore } = stubFetch((url) =>
    url.includes('api.test')
      ? { status: 503, body: { error: 'Paused while we fix alt text.', code: 'RELAY_DISABLED' } }
      : { status: 200, body: GEMINI_OK },
  );
  try {
    const provider = createRoutingProvider({
      relayBase: 'https://api.test',
      getToken: () => 'jwt',
      getKey: () => 'their-own-key',
    });
    assert.equal(await provider.summarize('some article'), 'from the user own key');
    assert.equal(hits.length, 2, 'the relay was tried first, then the key');
    assert.match(hits[0], /api\.test/);
    assert.match(hits[1], /generativelanguage/);
  } finally {
    restore();
  }
});

test('a paused relay with no key to fall back to reports the operator message', async () => {
  // Falling back is only possible for people who brought a key. Everyone else
  // has to be told what is actually happening, in the operator's own words.
  const { restore } = stubFetch(() => ({
    status: 503,
    body: { error: 'Paused while we fix alt text.', code: 'RELAY_DISABLED' },
  }));
  try {
    const provider = createRoutingProvider({
      relayBase: 'https://api.test',
      getToken: () => 'jwt',
      getKey: () => '',
    });
    await assert.rejects(() => provider.summarize('x'), /Paused while we fix alt text/);
  } finally {
    restore();
  }
});

test('quota and a lapsed subscription do NOT silently spend the user own credit', async () => {
  // The line this fallback must not cross. Both of these mean the user needs to
  // know something about their account, and quietly billing their Google key
  // instead would hide it while costing them money.
  for (const failure of [
    { status: 429, body: { error: 'Daily limit', code: 'DAILY_LIMIT' } },
    { status: 402, body: { error: 'Not active', code: 'SUBSCRIPTION_INACTIVE' } },
    { status: 401, body: { error: 'Bad token', code: 'UNAUTHENTICATED' } },
  ]) {
    const { hits, restore } = stubFetch((url) =>
      url.includes('api.test') ? failure : { status: 200, body: GEMINI_OK },
    );
    try {
      const provider = createRoutingProvider({
        relayBase: 'https://api.test',
        getToken: () => 'jwt',
        getKey: () => 'their-own-key',
      });
      await assert.rejects(() => provider.summarize('x'), `${failure.body.code} must surface`);
      assert.equal(hits.length, 1, `${failure.body.code} must not reach the user own key`);
    } finally {
      restore();
    }
  }
});

test('a network failure falls back, because offline is not a licence decision', async () => {
  // Cache the entitlement, honour it, degrade to the key rather than to
  // nothing. An accessibility tool that stops working on a train has failed.
  const original = globalThis.fetch;
  const hits: string[] = [];
  globalThis.fetch = (async (input: unknown) => {
    const url = String((input as { url?: string })?.url ?? input);
    hits.push(url);
    if (url.includes('api.test')) throw new TypeError('Failed to fetch');
    return { ok: true, status: 200, json: async () => GEMINI_OK, text: async () => '' } as unknown as Response;
  }) as typeof fetch;
  try {
    const provider = createRoutingProvider({
      relayBase: 'https://api.test',
      getToken: () => 'jwt',
      getKey: () => 'their-own-key',
    });
    assert.equal(await provider.summarize('some article'), 'from the user own key');
    assert.equal(hits.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});
