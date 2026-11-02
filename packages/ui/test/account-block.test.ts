/**
 * The account panel: sign in, see your tier, sign out.
 *
 * This is the door the plumbing was missing. The relay, the token channel and
 * the provider routing all landed first, and `apps/api/views/activate.html` was
 * already telling people to open "Settings, then Account, then Paste activation
 * token" while no such control existed anywhere. These tests hold the door open.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { options } from 'preact';
import { createEngine, memoryAdapter } from '@webable/core';
import { mountWidget, HOST_ID } from '@webable/ui';

options.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);

const dom = new JSDOM('<!doctype html><html><head></head><body><p>Body</p></body></html>', {
  url: 'https://example.test/',
  pretendToBeVisual: true,
});
const w = dom.window as unknown as Record<string, unknown>;
const g = globalThis as unknown as Record<string, unknown>;
for (const k of [
  'window', 'document', 'HTMLElement', 'Node', 'ShadowRoot', 'Event', 'KeyboardEvent',
  'MouseEvent', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'DOMParser', 'location',
]) {
  g[k] = w[k];
}
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);

const tick = () => new Promise((r) => setTimeout(r, 10));
/*
 * A wall-clock budget, not a count of turns. Same helper and same reasoning as
 * `mount.test.ts`: a fixed iteration count is a patience budget that does not
 * grow when the machine is loaded, while the render being waited for does.
 * That produced intermittent failures on a clean tree there, and this copy had
 * the identical bound waiting to do the same thing.
 */
const POLL_BUDGET_MS = 5000;
const until = async (fn: () => boolean) => {
  const deadline = Date.now() + POLL_BUDGET_MS;
  while (Date.now() < deadline) {
    if (fn()) return;
    await tick();
  }
};

/** A structurally valid JWT. Never verified here; only its shape is checked. */
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

interface Calls {
  signIn: string[];
  signOut: number;
  openSignIn: number;
}

/** Install the bridge content.ts normally provides, and open the panel. */
async function openPanel(account: { email: string | null; plan: string } | null, withBridge = true) {
  const calls: Calls = { signIn: [], signOut: 0, openSignIn: 0 };
  let current = account;
  if (withBridge) {
    (g.window as Record<string, unknown>).__WEBABLE_EXT__ = {
      setEnabled: () => {},
      account: () => current,
      signIn: (token: string) => {
        calls.signIn.push(token);
        current = { email: null, plan: 'pro' };
      },
      signOut: () => {
        calls.signOut += 1;
        current = null;
      },
      openSignIn: () => {
        calls.openSignIn += 1;
      },
    };
  } else {
    delete (g.window as Record<string, unknown>).__WEBABLE_EXT__;
  }

  const engine = createEngine({ storage: memoryAdapter(), globalStorage: memoryAdapter() });
  await engine.ready;
  const api = mountWidget({ engine, config: { surface: 'extension' } });
  await tick();
  const shadow = document.getElementById(HOST_ID)!.shadowRoot!;
  api.open();
  await until(() => !!shadow.querySelector('.wa-panel'));
  await until(() => !!shadow.querySelector('.wa-scope:not(.wa-position)'));
  return { api, shadow, calls };
}

const blockText = (shadow: ShadowRoot): string =>
  Array.from(shadow.querySelectorAll('.wa-scope'))
    .map((el) => el.textContent || '')
    .join(' ');

test('with no account, the panel offers a way to get one', async () => {
  // The failure this prevents: every AI capability gated behind obtaining a
  // Google Cloud API key, with no visible alternative anywhere in the product.
  const { api, shadow, calls } = await openPanel(null);
  const text = blockText(shadow);
  assert.match(text, /Sign in/);
  assert.match(text, /no password/i, 'the method is stated, because people fear a new password');
  // A key is `account.signIn`, with no space after the dot. Prose is "No
  // account. AI works with...", which the looser pattern this started as
  // matched, failing on the copy rather than on a leak.
  assert.doesNotMatch(text, /(account|announce|panel)\.[a-zA-Z]/, `raw i18n keys leaked: ${text}`);

  const signIn = Array.from(shadow.querySelectorAll<HTMLElement>('button')).find(
    (b) => b.textContent === 'Sign in',
  );
  assert.ok(signIn, 'a sign-in control exists');
  signIn!.click();
  assert.equal(calls.openSignIn, 1, 'it opens the hosted sign-in page');
  api.destroy();
});

test('the paste field activate.html points at actually exists', async () => {
  // apps/api/views/activate.html tells the user, in the fallback path where the
  // page cannot reach the extension, to paste the token into exactly this
  // control. A page that instructs somebody to press a control that is not
  // there is worse than one that says nothing.
  const { api, shadow, calls } = await openPanel(null);
  const input = shadow.querySelector<HTMLInputElement>('input[aria-label="Activation token"]');
  assert.ok(input, 'the paste field exists and is labelled for screen readers');

  input!.value = JWT;
  input!.dispatchEvent(new (g.window as { Event: typeof Event }).Event('input', { bubbles: true }));
  await tick();

  const activate = Array.from(shadow.querySelectorAll<HTMLElement>('button')).find(
    (b) => b.textContent === 'Activate',
  );
  assert.ok(activate, 'an activate control exists');
  activate!.click();
  await tick();
  assert.deepEqual(calls.signIn, [JWT], 'the token reaches the extension verbatim');
  api.destroy();
});

test('a truncated token is refused before it becomes a 401 twenty minutes later', async () => {
  // Copying a long token out of a web page loses characters. Checking the shape
  // here turns that into a sentence the user can act on, rather than a failure
  // that reads as "your subscription is broken".
  const { api, shadow, calls } = await openPanel(null);
  const input = shadow.querySelector<HTMLInputElement>('input[aria-label="Activation token"]')!;
  input.value = 'eyJhbGciOiJIUzI1NiJ9.truncated';
  input.dispatchEvent(new (g.window as { Event: typeof Event }).Event('input', { bubbles: true }));
  await tick();

  Array.from(shadow.querySelectorAll<HTMLElement>('button'))
    .find((b) => b.textContent === 'Activate')!
    .click();
  await tick();

  assert.deepEqual(calls.signIn, [], 'nothing was stored');
  const alert = shadow.querySelector('[role="alert"]');
  assert.ok(alert, 'the refusal is announced, not silent');
  assert.match(alert!.textContent || '', /whole thing/i);
  api.destroy();
});

test('signed in, the panel says who and on what plan, and can sign out', async () => {
  // Tier has to be visible somewhere. "Am I actually on the paid plan" is the
  // first question a subscriber asks when something does not work.
  const { api, shadow, calls } = await openPanel({ email: 'buyer@example.com', plan: 'pro_monthly' });
  const text = blockText(shadow);
  assert.match(text, /buyer@example\.com/);
  assert.match(text, /pro_monthly/);
  assert.doesNotMatch(text, /Activation token/, 'no paste field once there is an account');

  const out = Array.from(shadow.querySelectorAll<HTMLElement>('button')).find(
    (b) => b.textContent === 'Sign out',
  );
  assert.ok(out, 'signing out is reachable from the same place as signing in');
  out!.click();
  assert.equal(calls.signOut, 1);
  api.destroy();
});

test('signing out promises to leave the user own key alone, because it does', async () => {
  // The copy and the behaviour have to agree. content.ts's signOut clears only
  // the account; the Gemini key is a separate credential in a separate layer,
  // and somebody who cancels keeps the fallback that lets the tool go on
  // working. If that ever stops being true, this string has to change with it.
  const { api, shadow } = await openPanel({ email: 'buyer@example.com', plan: 'pro_monthly' });
  assert.match(blockText(shadow), /own Gemini key, if you have one, stays where it is/i);
  api.destroy();
});

test('without the extension bridge the block renders nothing at all', async () => {
  // The same panel code runs in the widget, where there is no user to sign in:
  // a widget is embedded by a site owner who configures a relay token in the
  // embed snippet. Rendering a sign-in control there would offer an account
  // that surface cannot have.
  const { api, shadow } = await openPanel(null, false);
  const text = blockText(shadow);
  assert.doesNotMatch(text, /Sign in/);
  assert.equal(shadow.querySelector('input[aria-label="Activation token"]'), null);
  api.destroy();
});
