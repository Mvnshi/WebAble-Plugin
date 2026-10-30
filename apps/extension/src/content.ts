/**
 * Extension content script. Mounts the EXACT same shared core + UI the widget
 * uses (1:1 parity). Persistence is split by the engine: feature settings are
 * PER ORIGIN (each site remembers its own adjustments), the panel chrome and
 * TTS voice are GLOBAL and synced, and the Gemini key is device-local. A small
 * message protocol lets the popup / keyboard command drive it.
 *
 * This runs at document_start, not document_idle. At document_idle the page had
 * already painted, so every load flashed the untreated page before dark mode,
 * high contrast, or a larger font arrived: for a light-sensitive user that
 * flash is the exact thing they installed this to avoid. Starting earlier does
 * not make the storage read synchronous (nothing can), so a flash is still
 * possible on a page that paints faster than chrome.storage answers; it removes
 * the guaranteed one.
 *
 * It also runs in EVERY FRAME (all_frames: true), which is most of what this
 * file now does. See the frame section below.
 *
 * Nothing here may assume <body> exists. The engine writes to <html> and the
 * panel host is a sibling of <body>, so both are safe this early.
 */
import {
  createEngine,
  chromeStorageAdapter,
  createAccountStore,
  createRoutingProvider,
  readAccount,
  ACCOUNT_KEY,
  RELAY_BASE,
  type AccountStore,
  type StorageAdapter,
  siteKeyFor,
  GLOBAL_KEY,
  SECRET_KEY,
  SETTINGS_KEY,
  type Engine,
  type FeatureSetting,
} from '@webable/core';
import { createMutationManager, createRouteWatcher } from '@webable/core';
import {
  createFeedStore,
  createFeedGuard,
  platformFor,
  FEED_SETTINGS_KEY,
  FEED_USAGE_KEY,
  type FeedGuard,
  type FeedStore,
  type PlatformId,
} from '@webable/core/feeds';
import { mountWidget, type WidgetApi } from '@webable/ui';
import { DISABLED_KEY, disabledSites, readList, setDisabled } from './siteToggle';
import { createPowerRig, type PowerRig } from './power';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

/**
 * Frames.
 *
 * The script used to run in the top document only, so nothing inside an
 * embedded player, comment thread, checkout, or cookie banner was ever treated,
 * while the parent's re-invert rule flipped the frame back out of dark mode and
 * left it a bright rectangle in a dark page. Both halves of that are now gone:
 * `iframe` is out of the re-invert set (see baseStyles.ts) and the script runs
 * in the frame instead.
 *
 * A frame runs the engine and nothing else. No panel, no launcher, no keyboard
 * shortcut, no message listener, no AI key, no Site Patches: one of those per ad
 * iframe would be absurd, and every one of them belongs to the page the person
 * is actually looking at.
 */
const IS_TOP = (() => {
  try {
    return window.top === window.self;
  } catch {
    // A frame whose parent is inaccessible is still a frame.
    return false;
  }
})();

const ORIGIN = (() => {
  try {
    return location.origin;
  } catch {
    return 'unknown';
  }
})();

/**
 * The origin whose settings this document should use.
 *
 * In a frame that is the TOP page's origin, not the frame's own. A YouTube
 * embed on a news site must be treated with the settings for the news site,
 * because that is the page the person chose to adapt; keying off the frame's
 * origin would silently fork every third-party embed into its own profile of
 * settings the user never set.
 *
 * `location.ancestorOrigins` answers this synchronously, which is the whole
 * requirement: the engine has to know its key before it can apply anything, and
 * an async round trip to the service worker would put a flash back inside every
 * frame. Where it is unavailable the frame is left alone entirely (see below)
 * rather than guessing.
 */
function topOrigin(): string | null {
  if (IS_TOP) return ORIGIN;
  try {
    const chain = location.ancestorOrigins;
    const outer = chain && chain.length ? chain[chain.length - 1] : '';
    // A sandboxed or data: ancestor reports the literal string "null", which is
    // not a site and must not become a shared settings bucket.
    return outer && outer !== 'null' ? outer : null;
  } catch {
    return null;
  }
}

const OUTER = topOrigin();

// Settings key off the host with `www.` stripped and the protocol dropped, so
// example.com, www.example.com, and the http form are one site rather than
// three unrelated profiles of it. See siteKeyFor.
const SITE = siteKeyFor(OUTER || ORIGIN);
const LEGACY_AIKEY = 'webable:aikey';

// Fonts are packaged with the extension and exposed via web_accessible_resources.
try {
  (window as unknown as Record<string, unknown>).__WEBABLE_ASSET_BASE__ = chrome.runtime
    .getURL('assets')
    .replace(/\/$/, '');
} catch {
  /* not in an extension context */
}


/**
 * Whether the tools are running in this document right now.
 *
 * They can be switched off per site (see siteToggle.ts), and switching them
 * back on has to work without a reload, so the engine's lifetime is a variable
 * rather than the module's. Everything below that outlives it, the message
 * protocol and the storage watcher, is registered once and reads through this.
 */
let live: {
  engine: Engine;
  api: WidgetApi | null;
  accounts: AccountStore | null;
  feeds: FeedRig | null;
} | null = null;

/**
 * The feed guard's page-side rig.
 *
 * The store exists on every site, because the rules are cross-site and the
 * panel has to be able to set them from wherever the person happens to be. The
 * guard exists only on the four platforms it knows, because there is nothing
 * for it to sort anywhere else. Both are top-frame only: one scanner per ad
 * iframe would be absurd, and the feed belongs to the page the person is
 * looking at.
 */
interface FeedRig {
  store: FeedStore;
  guard: FeedGuard | null;
  here: PlatformId | null;
  teardown(): void;
}

/**
 * A writer id that is stable for this tab and survives navigation inside it.
 *
 * sessionStorage is per tab and per origin, which is exactly the scope a usage
 * shard wants: without it every page load would open a new shard and a day of
 * YouTube would leave a few hundred of them behind. See DayShard in
 * packages/core/src/feeds/settings.ts for why shards exist at all.
 */
const SHARD_KEY = 'webable:feedshard';
function shardId(): string {
  try {
    const found = sessionStorage.getItem(SHARD_KEY);
    if (found) return found;
    const made = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(SHARD_KEY, made);
    return made;
  } catch {
    // A sandboxed frame or a browser with site data blocked. One shared id is
    // worse than a per-tab one and better than throwing: concurrent writers
    // collide, which is the pre-existing behaviour, not a new failure.
    return 'tab';
  }
}

/**
 * Build the feed rig for this document.
 *
 * Settings ride in the synced bag so somebody's rules follow them to another
 * machine; usage rides in the local one because minutes spent on a site are a
 * fact about a device, and because chrome.storage.sync would refuse the write
 * rate outright. Both go through the same off-switch gate as everything else,
 * so a site the user switched WebAble off on reads as "nothing saved" and the
 * guard applies nothing.
 */
function makeFeeds(engine: Engine, gate: Promise<boolean> | null): FeedRig {
  const store = createFeedStore({
    settings: untilEnabled(chromeStorageAdapter('webable', 'sync'), gate),
    usage: untilEnabled(chromeStorageAdapter('webable', 'local'), gate),
    shardId: shardId(),
  });

  let hostname = '';
  try {
    hostname = location.hostname;
  } catch {
    /* an opaque origin has no host and therefore no platform */
  }
  const adapter = platformFor(hostname);
  const rig: FeedRig = { store, guard: null, here: adapter ? adapter.id : null, teardown: () => undefined };
  if (!adapter) {
    rig.teardown = () => store.destroy();
    return rig;
  }

  const guard = createFeedGuard({ doc: document, win: window, store, provider: engine.provider });
  rig.guard = guard;

  // A feed grows as you scroll, so new cards arrive through the same signal the
  // engine already watches for. The debounce is the engine's own default: on a
  // site that mutates constantly, a scan per mutation is a scan per frame.
  const mutations = createMutationManager(document, () => guard.sweep());
  // A route change on these sites is a new page with the old DOM around it, so
  // every card has to be judged again rather than swept.
  const route = createRouteWatcher(window, () => guard.refresh());

  // Nothing runs until settings have landed. Starting first would scan the feed
  // against default rules, hide nothing, mark every card judged, and then need
  // a full re-judge a moment later.
  void store.ready.then(() => {
    if (live?.feeds !== rig) return;
    guard.start();
    mutations.start();
  });
  store.subscribe(() => guard.refresh());

  rig.teardown = () => {
    mutations.stop();
    route.stop();
    guard.destroy();
    store.destroy();
  };
  return rig;
}

/**
 * Whether this site is switched off, in flight from the first moment.
 *
 * Started here rather than awaited before anything else happens, because
 * awaiting it puts a storage round trip in front of the engine and undoes the
 * document_start work: the whole reason the content script runs that early is
 * that a persisted setting should reach the page before it paints. So this read
 * races the engine's own reads instead of queueing ahead of them, and the parts
 * that would be visible on a switched-off site are the parts that wait.
 */
let offGate: Promise<boolean> | null = disabledSites()
  .then((sites) => sites.includes(SITE))
  .catch(() => false);
// Once the answer is known the gate is gone, so a later start (the popup
// switching this site back on) is not held behind a promise that already
// resolved to "off".
void offGate.then((off) => {
  if (!off) offGate = null;
});

/**
 * A view of a storage layer that answers "nothing saved" while the answer is
 * still unknown and the answer might be "switched off".
 *
 * This is what keeps the race honest. The engine is built immediately and its
 * reads start immediately, but every one of them resolves through here, so on a
 * switched-off site it finds no settings, no cross-site default and no key, and
 * therefore applies nothing at all. Miss a layer and that layer's settings
 * would land on a page the user switched this off on.
 */
function untilEnabled(inner: StorageAdapter, gate: Promise<boolean> | null): StorageAdapter {
  if (!gate) return inner;
  return {
    get: async <T,>(key: string) => ((await gate) ? null : inner.get<T>(key)),
    set: (key, value) => inner.set(key, value),
    remove: (key) => inner.remove(key),
  };
}

function start(): void {
  if (live) return;
  // Captured, because `start` also runs later when the popup switches this site
  // back on, and by then there is nothing to wait for.
  const gate = offGate;
  // Per-origin feature settings stay in chrome.storage.local (they can grow with
  // every visited site); the small preference blob (panel chrome + TTS voice)
  // lives in chrome.storage.sync so it roams across the user's signed-in devices.
  //
  // The Gemini key does NOT roam. It is a credential the user typed in, and the
  // panel has always told them it is "stored only in this browser"; putting it in
  // sync uploaded it to Google and pushed it to every signed-in browser they own.
  // It now goes to a device-local secret layer, and the engine migrates any key
  // already sitting in sync on next load.
  //
  // A frame reads two of those three. The key is not among them: there is no AI
  // UI in a frame, so reading a credential there would buy nothing and cost a
  // storage round trip on every embed on the page.
  /**
   * The hosted relay was unreachable by construction, not by configuration:
   * this call passed no `provider` at all, so the engine always built the
   * bring-your-own-key Gemini provider and a paying subscriber's token had
   * nowhere to go. Every AI capability was therefore gated behind the user
   * obtaining a Google Cloud API key, which for the audience this product names
   * is a wall.
   *
   * The provider now resolves per call rather than at construction: the
   * subscription when there is one, the user's own key when there is not, and
   * neither is the free tier rather than an error. Constructing a proxy
   * unconditionally instead would have silently stopped honouring the key of
   * every existing bring-your-own-key user.
   *
   * Frames get no provider and no account. There is no AI UI in a frame, so
   * reading a credential there would buy nothing and cost a storage round trip
   * on every embed on the page.
   */
  const accounts: AccountStore | null = IS_TOP
    ? createAccountStore(untilEnabled(chromeStorageAdapter('webable', 'local'), gate))
    : null;

  const engine = createEngine({
    storage: untilEnabled(chromeStorageAdapter(`webable@${SITE}`, 'local'), gate),
    globalStorage: untilEnabled(chromeStorageAdapter('webable', 'sync'), gate),
    ...(IS_TOP
      ? {
          secretStorage: untilEnabled(chromeStorageAdapter('webable', 'local'), gate),
          provider: createRoutingProvider({
            relayBase: RELAY_BASE,
            getToken: () => accounts?.get()?.token || null,
            // Read through the engine rather than captured, so pasting or
            // clearing a key takes effect on the next call, not the next reload.
            getKey: () => live?.engine.getState().apiKey || '',
          }),
        }
      : { frame: true }),
  });
  live = { engine, api: null, accounts, feeds: null };
  // Top frame only. The rules are one set for the whole tab and the scanner is
  // one per page, so building either in an embed would duplicate both and let
  // an ad iframe write usage against the page around it.
  if (IS_TOP) live.feeds = makeFeeds(engine, gate);

  // The panel is the one part that cannot be undone by simply not applying it,
  // so it is the one part that waits for the answer rather than racing it.
  const mount = () => {
    if (IS_TOP && live && !live.api) {
      live.api = mountWidget({ engine, config: { brandName: 'WebAble', surface: 'extension' } });
    }
  };
  if (gate) void gate.then((off) => (off ? stop() : mount()));
  else mount();

  if (!IS_TOP) return;

  // One-time migration: older builds kept the Gemini key at the flat
  // chrome.storage.local['webable:aikey']. Seed the engine from it once, then
  // drop the legacy key (the global layer now owns it).
  engine.ready
    .then(() => {
      try {
        chrome.storage.local.get(LEGACY_AIKEY, (res: Record<string, string>) => {
          const legacy = (res && res[LEGACY_AIKEY]) || '';
          if (legacy && !engine.getState().apiKey) engine.setApiKey(legacy);
          if (legacy) chrome.storage.local.remove(LEGACY_AIKEY);
        });
      } catch {
        /* ignore */
      }
    })
    .catch(() => undefined);
}

/**
 * Make the panel notice an account change.
 *
 * The account deliberately lives outside the engine (see
 * packages/core/src/account.ts on why), and the panel re-renders on engine
 * changes. Re-setting the theme to the value it already holds is a write the
 * store still publishes, which is the cheapest nudge that costs the widget
 * bundle nothing.
 */
function nudgePanel(): void {
  if (!live) return;
  live.engine.setUiPref('theme', live.engine.getState().ui.theme);
}

/** Take everything back off the page. The engine's own teardown reverts it. */
function stop(): void {
  if (!live) return;
  const { engine, api, feeds } = live;
  live = null;
  try {
    // Before the engine, because the guard's teardown puts the page's own cards
    // back and the engine's destroy pulls the stylesheet those cards are hidden
    // by. The other order leaves a page briefly showing everything, which on a
    // site somebody just switched this off on is exactly right, and on a
    // re-render is a flash of the feed they asked not to see.
    feeds?.teardown();
  } catch {
    /* ignore */
  }
  try {
    // api.destroy() destroys the engine too; without a panel, do it directly.
    if (api) api.destroy();
    else engine.destroy();
  } catch {
    /* ignore */
  }
}

/**
 * One storage watcher, registered in every frame whether or not the tools are
 * running, because being switched back on is a storage change like any other.
 *
 * It carries three jobs that all key off the same event:
 *   - the per-site off switch, which starts or stops everything here,
 *   - the panel theme, which roams, and the AI key, which does not, both of
 *     which only mean something in the top frame,
 *   - a frame following what the panel wrote, since a frame has no panel of its
 *     own. The engine's write is debounced by 250ms, so an embed follows a
 *     quarter second behind the page around it rather than waiting for a reload.
 */
function watchStorage(): void {
  const siteBag = `webable@${SITE}`;
  try {
    chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'sync' && changes.webable) {
        const bag = changes.webable.newValue as Record<string, unknown> | undefined;
        const off = readList(bag?.[DISABLED_KEY]).includes(SITE);
        if (off) {
          stop();
        } else {
          offGate = null;
          start();
        }
        if (!live) return;

        // Rules roam, so a change made in the popup, in another tab, or on
        // another machine arrives here. Adopted rather than re-read, because the
        // whole bag is already in hand.
        if (bag && FEED_SETTINGS_KEY in bag) live.feeds?.store.adoptState(bag[FEED_SETTINGS_KEY]);

        const glob = bag?.[GLOBAL_KEY] as { ui?: { theme?: string } } | undefined;
        const theme = glob?.ui?.theme;
        if (IS_TOP && theme && theme !== live.engine.getState().ui.theme) {
          live.engine.setUiPref('theme', theme as 'auto' | 'light' | 'dark' | 'glass');
        }
        return;
      }

      if (area !== 'local' || !live) return;

      if (IS_TOP && changes.webable) {
        const bag = changes.webable.newValue as Record<string, unknown> | undefined;
        // Counters do not roam, so this is the other tab on this machine, or
        // the popup granting itself ten more minutes.
        if (bag && FEED_USAGE_KEY in bag) live.feeds?.store.adoptUsage(bag[FEED_USAGE_KEY]);
        const secret = bag?.[SECRET_KEY] as { apiKey?: string } | undefined;
        if (secret && typeof secret.apiKey === 'string' && secret.apiKey !== live.engine.getState().apiKey) {
          live.engine.setApiKey(secret.apiKey);
        }

        // Signing in happens on webable.cc, in a different tab: the background
        // worker writes the token here and this is how an already-open page
        // hears about it. Without it somebody pays, comes back to the tab they
        // started from, and is still looking at the key prompt they just paid
        // to be rid of.
        if (live.accounts) {
          const before = live.accounts.get()?.token || null;
          live.accounts.adopt(readAccount(bag?.[ACCOUNT_KEY]));
          if ((live.accounts.get()?.token || null) !== before) nudgePanel();
        }
      }

      if (!IS_TOP && changes[siteBag]) {
        const bag = changes[siteBag].newValue as Record<string, unknown> | undefined;
        const site = bag?.[SETTINGS_KEY] as
          | { settings?: Record<string, FeatureSetting>; activeProfile?: string | null }
          | undefined;
        live.engine.adoptSettings(site?.settings ?? null, site?.activeProfile ?? null);
      }
    });
  } catch {
    /* ignore */
  }
}

/**
 * The popup and the keyboard command talk to the top frame here.
 *
 * Registered whether or not the tools are running, and that is the whole point
 * of the off switch being usable: a page with WebAble switched off still has to
 * be able to answer "am I off?" and "turn back on", or the only way back would
 * be the options page, and someone who has just switched it off on a site they
 * are looking at should not have to go and find a second surface.
 */
function watchMessages(): void {
  try {
    chrome.runtime.onMessage.addListener(
      (msg: { type?: string; id?: string; on?: boolean }, _sender: unknown, sendResponse: (r: unknown) => void) => {
        if (msg?.type === 'WEBABLE_GET_STATE') {
          sendResponse({
            activeProfile: live ? live.engine.getState().activeProfile : null,
            count: live ? live.engine.activeCount() : 0,
            host: SITE,
            enabled: !!live,
          });
          return true;
        }
        if (msg?.type === 'WEBABLE_SET_ENABLED') {
          // The write lands in the synced bag, and every frame of every tab on
          // this site reacts through watchStorage. Nothing starts or stops here
          // directly, so one path covers this tab, the other tabs, and the
          // other machines.
          void setDisabled(SITE, msg.on === false).then(() => sendResponse({ enabled: msg.on !== false }));
          return true;
        }
        // The command bar, hints, insights and Site Check. Answered here, before
        // the panel check below, because Site Check and insights still make
        // sense on a site where the panel has not mounted yet.
        if (power && typeof msg?.type === 'string') {
          const handled = power.onMessage(msg as Parameters<PowerRig['onMessage']>[0], sendResponse);
          if (handled !== undefined || POWER_MESSAGES.has(msg.type)) return handled;
        }
        if (!live?.api) return undefined;
        const api = live.api;
        switch (msg?.type) {
          case 'WEBABLE_TOGGLE':
            api.toggle();
            break;
          case 'WEBABLE_OPEN':
            api.open();
            break;
          case 'WEBABLE_CLOSE':
            api.close();
            break;
          case 'WEBABLE_APPLY_PROFILE':
            if (msg.id) live.engine.applyProfile(msg.id);
            api.open();
            break;
          case 'WEBABLE_RESET':
            live.engine.resetAll();
            break;
          default:
            break;
        }
        return undefined;
      },
    );
  } catch {
    /* ignore */
  }
}

/** Messages the power rig owns. Listed so the switch below never sees them. */
const POWER_MESSAGES = new Set(['WEBABLE_COMMAND_BAR', 'WEBABLE_HINTS', 'WEBABLE_INSIGHTS', 'WEBABLE_RUN_INTENT', 'WEBABLE_SITE_CHECK', 'WEBABLE_HIGHLIGHT']);
let power: PowerRig | null = null;

function main(): void {
  // A frame whose top-level origin cannot be read is left exactly as its author
  // wrote it. There is no honest answer about whose settings to apply, and
  // guessing would mean either the frame's own origin (a settings profile the
  // user never set) or a shared bucket every sandboxed frame on the web lands
  // in.
  if (!IS_TOP && !OUTER) return;

  watchStorage();
  if (IS_TOP) {
    power = createPowerRig(
      () => (live ? { engine: live.engine, api: live.api } : null),
      (on) => setDisabled(SITE, !on),
    );
    watchMessages();
  }
  start();
}

// The panel's own "turn off here" control calls through this. It runs in the
// same isolated world as this file, so there is no message hop.
(window as unknown as Record<string, unknown>).__WEBABLE_EXT__ = {
  open: () => live?.api?.open(),
  close: () => live?.api?.close(),
  toggle: () => live?.api?.toggle(),
  isOpen: () => !!live?.api?.isOpen(),
  isEnabled: () => !!live,
  site: () => SITE,
  setEnabled: (on: boolean) => setDisabled(SITE, !on),

  /**
   * The account half of the bridge. The panel is rendered by shared code that
   * the widget also uses, so extension-only capability arrives this way rather
   * than through props. See AccountBlock in packages/ui/src/extensionBlocks.tsx.
   */
  account: () => {
    const a = live?.accounts?.get();
    return a ? { email: a.email, plan: a.plan } : null;
  },
  signIn: (token: string) => {
    // Only the token is known here. Email and plan arrive from /ai/me on the
    // next call, and guessing them would put a wrong tier on screen; 'pro' is
    // the honest placeholder because every paid plan is one.
    void live?.accounts?.set({ token, email: null, plan: 'pro', expiresAt: 0 });
    nudgePanel();
  },
  signOut: () => {
    // Deliberately does not touch the Gemini key. Somebody who cancels must
    // keep the fallback that lets the tool go on working.
    void live?.accounts?.set(null);
    nudgePanel();
  },
  openSignIn: () => {
    window.open(`${RELAY_BASE}/auth`, '_blank', 'noopener,noreferrer');
  },

  /**
   * The feed guard half of the bridge.
   *
   * Returns the live store object rather than a snapshot, because the panel
   * block subscribes to it. That is safe here and nowhere else: this file and
   * the panel run in the same isolated world, so there is no serialisation
   * boundary and no message hop between them. See FeedsBlock in
   * packages/ui/src/feedBlocks.tsx.
   */
  feeds: () => {
    const rig = live?.feeds;
    if (!rig) return null;
    return {
      store: rig.store,
      here: rig.here,
      // The panel writes a rule and the page has to re-judge what it already
      // judged. The store's own subscriber does this too; this is the path for
      // a change that does not touch the store, such as reopening the panel.
      refresh: () => rig.guard?.refresh(),
    };
  },

  get engine() {
    return live?.engine;
  },
};

void main();
