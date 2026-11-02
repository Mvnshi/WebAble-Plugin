/**
 * MV3 service worker. The toolbar click opens the popup (see manifest
 * default_popup); this worker routes the keyboard commands to the active tab's
 * content script, opens the extension's own pages when a tab asks, and shows
 * the welcome page once on install. No business logic here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

/** Keyboard command name to the message the content script understands. */
const COMMANDS: Record<string, string> = {
  'toggle-panel': 'WEBABLE_TOGGLE',
  'command-bar': 'WEBABLE_COMMAND_BAR',
  'click-hints': 'WEBABLE_HINTS',
};

chrome.commands?.onCommand?.addListener((command: string, tab?: { id?: number }) => {
  const type = COMMANDS[command];
  if (!type) return;
  const deliver = (id?: number) => {
    // frameId 0 is the top document. The content script runs in every frame now
    // (all_frames), and an unaddressed sendMessage broadcasts to all of them, so
    // without this the shortcut would try to toggle a panel in every ad iframe.
    if (id != null) chrome.tabs.sendMessage(id, { type }, { frameId: 0 }, () => void chrome.runtime.lastError);
  };
  if (tab?.id != null) deliver(tab.id);
  else chrome.tabs.query({ active: true, currentWindow: true }, (tabs: Array<{ id?: number }>) => deliver(tabs[0]?.id));
});

/**
 * First install opens the welcome page, once. An update does not: somebody who
 * has used this for a year does not need to be onboarded again because the
 * version number moved.
 */
chrome.runtime?.onInstalled?.addListener((details: { reason?: string }) => {
  if (details?.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
});

/**
 * Requests from the content script for things only an extension page can do.
 * Senders are checked to be this extension: onMessage is only reachable from
 * our own contexts, but saying so here keeps it true if that ever changes.
 */
chrome.runtime?.onMessage?.addListener(
  (msg: { type?: string }, sender: { id?: string; tab?: { id?: number; index?: number } }, sendResponse: (r: unknown) => void) => {
    if (sender?.id && sender.id !== chrome.runtime.id) return undefined;
    switch (msg?.type) {
      case 'WEBABLE_OPEN_OPTIONS':
        chrome.runtime.openOptionsPage();
        return undefined;
      case 'WEBABLE_OPEN_REPORT': {
        const tab = sender?.tab;
        if (tab?.id == null) return undefined;
        chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?tab=${tab.id}`), index: (tab.index ?? 0) + 1 });
        return undefined;
      }
      case 'WEBABLE_GET_SHORTCUTS':
        chrome.commands.getAll((cmds: Array<{ name?: string; shortcut?: string }>) => {
          const by = (n: string) => cmds.find((c) => c.name === n)?.shortcut || undefined;
          sendResponse({ bar: by('command-bar'), hints: by('click-hints'), panel: by('toggle-panel') });
        });
        return true;
      default:
        return undefined;
    }
  },
);

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
