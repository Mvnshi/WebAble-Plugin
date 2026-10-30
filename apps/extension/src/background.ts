/**
 * MV3 service worker. The toolbar click opens the popup (see manifest
 * default_popup); this worker only routes the keyboard command to the active
 * tab's content script, which toggles the shared panel. No business logic here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

chrome.commands?.onCommand?.addListener((command: string) => {
  if (command !== 'toggle-panel') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs: Array<{ id?: number }>) => {
    const id = tabs[0]?.id;
    // frameId 0 is the top document. The content script runs in every frame now
    // (all_frames), and an unaddressed sendMessage broadcasts to all of them, so
    // without this the shortcut would try to toggle a panel in every ad iframe.
    if (id != null) {
      chrome.tabs.sendMessage(id, { type: 'WEBABLE_TOGGLE' }, { frameId: 0 }, () => void chrome.runtime.lastError);
    }
  });
});

/**
 * Sign-in handoff from the checkout and sign-in pages.
 *
 * **This is a separate listener from `onMessage` below, and must stay separate.**
 * `onMessage` handles WEBABLE_TOGGLE and WEBABLE_CAPTURE with no sender check,
 * which is safe only because its senders can only be our own popup and content
 * scripts. `onMessageExternal` is reachable by any page on an origin listed in
 * the manifest's `externally_connectable`. Widening the existing listener to
 * serve both would put every message it already handles within reach of a web
 * page, so this one carries the token and nothing else.
 *
 * The origin allowlist in the manifest is two exact hosts, never a wildcard.
 * A wildcard here would let any site hand the extension a token, which is a way
 * to point somebody's AI traffic at an account they do not control.
 *
 * The token lands in `chrome.storage.local`, never `sync`: it is a credential,
 * and sync uploads to Google and pushes to every browser the user is signed
 * into. Same rule the Gemini key already follows.
 */
const ACCOUNT_KEY = 'account:v1';
const SECRET_NAMESPACE = 'webable';
const ALLOWED_SENDERS = ['https://api.webable.cc', 'https://webable.cc'];

chrome.runtime?.onMessageExternal?.addListener(
  (
    msg: { type?: string; token?: unknown; expiresAt?: unknown; email?: unknown; plan?: unknown },
    sender: { origin?: string; url?: string },
    sendResponse: (r: unknown) => void,
  ) => {
    // Belt and braces over the manifest: the manifest decides who may connect,
    // this decides who is believed. A mismatch means the manifest was widened
    // without anybody revisiting this file.
    const origin = sender?.origin || (sender?.url ? new URL(sender.url).origin : '');
    if (!ALLOWED_SENDERS.includes(origin)) return undefined;
    if (msg?.type !== 'WEBABLE_PRO_ACTIVATED') return undefined;
    if (typeof msg.token !== 'string' || !msg.token) {
      sendResponse({ ok: false });
      return undefined;
    }

    const account = {
      token: msg.token,
      email: typeof msg.email === 'string' ? msg.email : null,
      plan: typeof msg.plan === 'string' ? msg.plan : 'pro',
      expiresAt: typeof msg.expiresAt === 'number' ? msg.expiresAt : 0,
    };

    chrome.storage.local.get(SECRET_NAMESPACE, (res: Record<string, unknown>) => {
      const bag = (res?.[SECRET_NAMESPACE] as Record<string, unknown>) || {};
      chrome.storage.local.set({ [SECRET_NAMESPACE]: { ...bag, [ACCOUNT_KEY]: account } }, () => {
        sendResponse({ ok: !chrome.runtime.lastError });
      });
    });
    return true; // async response
  },
);

// Friction screenshot capture (only when the content script asks, which only
// happens after the user explicitly opts in per capture).
chrome.runtime?.onMessage?.addListener(
  (msg: { type?: string }, _sender: unknown, sendResponse: (r: unknown) => void) => {
    if (msg?.type !== 'WEBABLE_CAPTURE') return undefined;
    try {
      chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 55 }, (dataUrl: string) => {
        sendResponse({ dataUrl: chrome.runtime.lastError ? undefined : dataUrl });
      });
    } catch {
      sendResponse({});
    }
    return true; // keep the message channel open for the async response
  },
);
