/**
 * The engine ties everything together: it owns the settings store, reconciles
 * each feature against the host page (apply when on, disable + clean when off),
 * persists through a storage adapter, re-applies dynamic features after DOM
 * mutations, and exposes the AI provider + TTS. Both surfaces construct one of
 * these; the UI only ever talks to this object.
 */
import type {
  AIProvider,
  FeatureSetting,
  PersistedState,
  Profile,
  StorageAdapter,
  UiPrefs,
} from './types';
import { createStore, type Store } from './store';
import {
  createFeatureContext,
  createMutationManager,
  createRouteWatcher,
  createShadowStyles,
  type ScopedContext,
} from './dom';
import { FEATURES, FEATURE_MAP } from './features';
import { PROFILE_MAP, PROFILES } from './profiles';
import { BASE_CSS, BASE_STYLE_ID, FRAME_CSS } from './baseStyles';
import {
  SETTINGS_KEY,
  GLOBAL_KEY,
  SECRET_KEY,
  DEFAULTS_KEY,
  migratePersisted,
  type PersistMigration,
} from './config';
import { defaultStorage } from './storage';
import { createTTS, type TTSController } from './tts';
import { createGeminiProvider } from './ai';
import { createPatchStore, type PatchStore } from './tools/patches';
import { createFrictionStore, type FrictionStore } from './tools/friction';
import { createGuide, type GuideController } from './tools/guide';

const PERSIST_VERSION = 1;

/**
 * Schema migrations, keyed by the version each one migrates FROM.
 *
 * Empty, and that is the point: the path has to exist before the first bump,
 * not after it. A version with no entry here is carried forward unchanged,
 * which is right for a shape that only grew; add an entry only when a key is
 * renamed or its meaning changes. See migratePersisted in config.ts.
 *
 * A migrated payload is NOT written back on load. Persisting on a page view is
 * the one thing the widget promises not to do, so the upgraded shape lands the
 * next time the user actually changes something, and the old payload is read
 * forward until then.
 */
const PERSIST_MIGRATIONS: Record<number, PersistMigration> = {};

/** Read a stored payload, upgrading it if it was written by an older build. */
function readPayload<T>(raw: unknown): T | null {
  return migratePersisted<T>(raw, PERSIST_VERSION, PERSIST_MIGRATIONS);
}
/** Coalescing window for rapid changes (a slider drag). See schedulePersist. */
const PERSIST_DEBOUNCE_MS = 250;

export interface EngineState {
  settings: Record<string, FeatureSetting>;
  ui: UiPrefs;
  activeProfile: string | null;
  apiKey: string;
}

export interface EngineOptions {
  doc?: Document;
  storage?: StorageAdapter;
  namespace?: string;
  /**
   * Cross-site preference store. When provided, panel chrome + AI key + TTS
   * voice persist here (shared across sites) while feature settings stay
   * per-site in `storage`. The extension passes a shared-namespace adapter;
   * the widget leaves it unset (single origin).
   */
  globalStorage?: StorageAdapter;
  /**
   * Where the AI key is written. Must be device-local: the key is a credential,
   * and `globalStorage` in the extension is chrome.storage.sync. When omitted
   * the key falls back to the layer it used to live in, which is correct for
   * the widget (one origin, localStorage, nothing roams).
   */
  secretStorage?: StorageAdapter;
  /** Override UI prefs from embed config (position, accent, theme, language). */
  uiOverrides?: Partial<UiPrefs>;
  /**
   * AI provider override. Surfaces pass a hosted proxy provider here
   * (createProxyProvider pointing at the WebAble API) so no key lives in the
   * page; default is the BYO-key Gemini provider.
   */
  provider?: AIProvider;
  /**
   * This document is a sub-frame of a page that already has an engine.
   *
   * The extension's content script runs in every frame, so an embedded video,
   * comment thread, or cookie banner gets the user's settings instead of being
   * flipped back to its original colours and left alone. A frame differs from
   * the top document in exactly three ways, all of them here:
   *
   *   - it does not apply the composed colour filter, because the parent's
   *     filter already covers every pixel it draws (see FRAME_CSS),
   *   - it does not run Site Patches, which are authored against the top
   *     document and would be attempted against a document they never saw,
   *   - features that paint an unfiltered colour know to skip it (ctx.framed).
   *
   * Everything else is identical, deliberately: a frame gets the same larger
   * text, the same spacing, the same focus ring and the same banner blocking
   * as the page around it.
   */
  frame?: boolean;
}

export interface Engine {
  readonly store: Store<EngineState>;
  readonly tts: TTSController;
  readonly provider: AIProvider;
  /** Site Patches store (per origin). Extension-only in the UI. */
  readonly patches: PatchStore;
  /** Local friction log. */
  readonly friction: FrictionStore;
  /** On-page AI guide (points at the element to use next). */
  readonly guide: GuideController;
  readonly ready: Promise<void>;
  getState(): EngineState;
  subscribe(fn: (s: EngineState) => void): () => void;
  setFeature(id: string, patch: Partial<FeatureSetting>): void;
  toggleFeature(id: string, on?: boolean): void;
  applyProfile(id: string): void;
  resetAll(): void;
  /**
   * Put back whatever Reset all cleared. Reset is one button that turns off
   * everything a person may have spent minutes setting up, so it needs a way
   * back that is not "do it all again". Returns false when there is nothing to
   * undo.
   */
  undoReset(): boolean;
  /** Whether an undo is available. */
  canUndoReset(): boolean;
  setUiPref<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]): void;
  setApiKey(key: string): void;
  /**
   * Save the current settings as the cross-site default. Sites the user has
   * never adjusted pick them up; sites they have adjusted keep their own.
   * Needs a globalStorage layer, so it is a no-op in the widget.
   */
  saveAsDefaults(): void;
  /** Forget the cross-site default. Adjusted sites are unaffected. */
  clearDefaults(): void;
  /** Whether a cross-site default has been saved. */
  hasDefaults(): boolean;
  /** Forget this site's own settings and fall back to the default. */
  clearSite(): void;
  /** Whether this site has settings of its own (rather than inheriting). */
  hasSiteSettings(): boolean;
  /**
   * Take on settings another engine persisted for this same site.
   *
   * This is how a sub-frame keeps up. Turning on dark mode changes the top
   * document immediately, and without this the embedded player or comment
   * thread stayed as it was until the next page load, which reads as the tool
   * only half working. The frame watches its site's storage key instead and
   * adopts whatever the panel wrote, so the whole page changes together.
   *
   * Pass `null` for settings to fall back to the cross-site default, which is
   * what "forget this site" leaves behind.
   */
  adoptSettings(settings: Record<string, FeatureSetting> | null, activeProfile: string | null): void;
  /** Count of currently active features (for the launcher badge). */
  activeCount(): number;
  profiles(): ReadonlyArray<Profile>;
  /** Persist pending changes immediately (called on pagehide and destroy). */
  flush(): Promise<void>;
  destroy(): void;
}

function defaultUi(overrides?: Partial<UiPrefs>): UiPrefs {
  return {
    theme: 'auto',
    accent: '#1e40af',
    position: 'bottom-right',
    launcherOffset: null,
    language: 'en',
    ...overrides,
  };
}

function defaultSettings(): Record<string, FeatureSetting> {
  const out: Record<string, FeatureSetting> = {};
  for (const f of FEATURES) out[f.id] = JSON.parse(JSON.stringify(f.defaults));
  return out;
}

export function createEngine(opts: EngineOptions = {}): Engine {
  const doc = opts.doc || document;
  const storage = opts.storage || defaultStorage(opts.namespace || 'webable');
  // When a global adapter is supplied the engine splits persistence:
  // feature settings + active profile are per-site (`storage`); panel chrome,
  // AI key, and TTS prefs are global (`globalStorage`). Without it everything
  // lives in one payload under SETTINGS_KEY (the widget's single-origin case).
  const globalStorage = opts.globalStorage || null;
  const secretStorage = opts.secretStorage || null;
  const framed = !!opts.frame;
  const html = doc.documentElement;

  /**
   * Whether this site has settings of its own.
   *
   * Only a deliberate change to a feature sets this. Until it does, the site
   * inherits the cross-site default, and no per-site payload is written, so
   * later edits to the default still reach it. Changing the panel theme or the
   * TTS voice must not pin a site, which is why this is not just "did we ever
   * persist".
   */
  let siteDirty = false;
  let defaults: Record<string, FeatureSetting> | null = null;
  /**
   * The settings Reset all cleared, and the profile that was active with them.
   * One level deep on purpose: this is an undo for the one destructive button
   * in the panel, not a history stack.
   */
  let undoSnapshot: { settings: Record<string, FeatureSetting>; activeProfile: string | null } | null = null;

  const store = createStore<EngineState>({
    settings: defaultSettings(),
    ui: defaultUi(opts.uiOverrides),
    activeProfile: null,
    apiKey: '',
  });

  const tts = createTTS();
  const provider = opts.provider || createGeminiProvider(() => store.get().apiKey);
  const patches = createPatchStore(storage);
  const friction = createFrictionStore(storage);
  const guide = createGuide(provider, doc);
  const contexts = new Map<string, ScopedContext>();
  // Feature stylesheets live in <head> and stop at every shadow boundary, so
  // the same rules are adopted into each open shadow root. See dom.ts.
  const shadow = createShadowStyles(doc);

  // Turn a feature off (used by the public API and by ctx.disableSelf).
  function offFeature(id: string) {
    const cur = store.get().settings[id];
    if (!cur || !cur.active) return;
    store.set((prev) => ({
      ...prev,
      settings: { ...prev.settings, [id]: { ...cur, active: false } },
      activeProfile: null,
    }));
  }

  // Base stylesheet (filter composition) lives outside any feature context.
  function injectBase() {
    let el = doc.getElementById(BASE_STYLE_ID) as HTMLStyleElement | null;
    if (!el) {
      el = doc.createElement('style');
      el.id = BASE_STYLE_ID;
      el.setAttribute('data-webable', 'base');
      (doc.head || html).appendChild(el);
    }
    el.textContent = framed ? FRAME_CSS : BASE_CSS;
    html.setAttribute('data-webable', '');
  }

  function reconcile() {
    const { settings } = store.get();
    for (const f of FEATURES) {
      const s = settings[f.id];
      const active = !!s?.active;
      const existing = contexts.get(f.id);
      if (active) {
        let ctx = existing;
        if (!ctx) {
          ctx = createFeatureContext(doc, f.id, { provider, tts, framed });
          ctx.disableSelf = () => offFeature(f.id);
          contexts.set(f.id, ctx);
        }
        try {
          f.apply(s, ctx);
        } catch {
          // One broken feature must never take down the page or the others.
        }
      } else if (existing) {
        try {
          f.disable(existing);
        } catch {
          /* ignore */
        }
        existing.destroy();
        contexts.delete(f.id);
      }
    }
    // After the features have written their stylesheets and their flags, so the
    // rewritten copy reflects what is actually on right now.
    shadow.sync();
  }

  function reapplyDynamic() {
    const { settings } = store.get();
    for (const f of FEATURES) {
      if (!f.meta.dynamic) continue;
      const ctx = contexts.get(f.id);
      const s = settings[f.id];
      if (s?.active && ctx) {
        try {
          f.apply(s, ctx);
        } catch {
          /* ignore */
        }
      }
    }
  }

  // A route change means the page under us was replaced, so every active
  // feature has to be re-applied, not just the `dynamic` ones. Reader mode in
  // particular is holding a reference to an article that no longer exists.
  // Site Patches are DOM surgery a user recorded against the top document, so
  // a sub-frame must not try them: the selectors were never written for it.
  function applyPatches() {
    if (!framed) patches.applyAll(doc);
  }

  function onRouteChange() {
    reconcile();
    applyPatches();
    shadow.rescan();
  }

  const routes = createRouteWatcher(
    (doc.defaultView || (typeof window !== 'undefined' ? window : undefined)) as Window,
    onRouteChange,
  );

  const mutations = createMutationManager(doc, () => {
    // A content script cannot patch the page's own pushState (different realm),
    // so the URL is re-checked here as well. Any same-document navigation
    // mutates the DOM, which is what got us into this callback.
    if (routes.changed()) {
      onRouteChange();
      return;
    }
    reapplyDynamic();
    applyPatches();
    // A component that rendered after the last look needs the same rules the
    // rest of the page got. This is the only place that walks the DOM for
    // shadow roots, and it is already debounced.
    shadow.rescan();
  });

  // ---- persistence -------------------------------------------------------
  type TtsPersist = { rate?: number; pitch?: number; voiceURI?: string | null };
  // `apiKey` stays optional on the global payload only so pre-split installs
  // can be read and migrated; it is never written there again.
  type GlobalPayload = { version: number; ui: UiPrefs; apiKey?: string; tts: TtsPersist };
  type SitePayload = PersistedState & { apiKey?: string; tts?: TtsPersist };
  type SecretPayload = { version: number; apiKey: string };
  type DefaultsPayload = { version: number; settings: Record<string, FeatureSetting> };

  function ttsSnapshot(): TtsPersist {
    const t = tts.getState();
    return { rate: t.rate, pitch: t.pitch, voiceURI: t.voiceURI };
  }

  // Write current state immediately to the right layer(s). Returns the writes
  // so flush() can await them on teardown/pagehide.
  function writeNow(): Array<Promise<void>> {
    // A framed engine is a reader. It has no UI, so nothing it holds is a
    // choice anybody made here, and a page with thirty frames would otherwise
    // have thirty engines racing to write the same payload on every pagehide.
    if (framed) return [];
    const st = store.get();
    const writes: Array<Promise<void>> = [];
    // The AI key goes to the secret layer when one is supplied, and to nowhere
    // else. Surfaces without one keep the old single-payload behaviour.
    if (secretStorage) {
      writes.push(secretStorage.set(SECRET_KEY, { version: PERSIST_VERSION, apiKey: st.apiKey } as SecretPayload));
    }
    if (globalStorage) {
      // Writing the site payload is what pins a site to its current settings,
      // so it only happens once the user has actually changed a feature here.
      if (siteDirty) {
        writes.push(
          storage.set(SETTINGS_KEY, {
            version: PERSIST_VERSION,
            settings: st.settings,
            activeProfile: st.activeProfile,
          } as PersistedState),
        );
      }
      writes.push(
        globalStorage.set(GLOBAL_KEY, {
          version: PERSIST_VERSION,
          ui: st.ui,
          tts: ttsSnapshot(),
          ...(secretStorage ? {} : { apiKey: st.apiKey }),
        } as GlobalPayload),
      );
    } else if (siteDirty) {
      // Same rule as above: no write until the visitor has actually changed
      // something. On the widget this is the whole consent story.
      writes.push(
        storage.set(SETTINGS_KEY, {
          version: PERSIST_VERSION,
          settings: st.settings,
          activeProfile: st.activeProfile,
          ui: st.ui,
          tts: ttsSnapshot(),
          ...(secretStorage ? {} : { apiKey: st.apiKey }),
        } as SitePayload),
      );
    }
    return writes;
  }

  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Leading-edge debounce: the first change in a burst is written immediately,
   * and anything within the next 250ms is coalesced into one trailing write.
   *
   * A pure trailing debounce loses work. Found by driving the real extension:
   * toggle a feature and reload inside 250ms and the setting is gone. The
   * pagehide flush is supposed to cover that, but it cannot: chrome.storage.set
   * is asynchronous and the content script is torn down before it lands, and a
   * pagehide handler has no way to await anything. Someone who turns on dark
   * mode and immediately clicks a link is doing something completely ordinary.
   *
   * A toggle is a discrete act and there are only ever a few per second, so
   * writing it at once costs nothing. The debounce still exists for the case it
   * was for: dragging a slider, which fires continuously.
   */
  let lastWrite = 0;
  function schedulePersist() {
    const now = Date.now();
    if (now - lastWrite >= PERSIST_DEBOUNCE_MS) {
      lastWrite = now;
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
      }
      void Promise.all(writeNow());
      return;
    }
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      lastWrite = Date.now();
      void Promise.all(writeNow());
    }, PERSIST_DEBOUNCE_MS);
  }

  // Write any pending changes right away (called on pagehide and destroy so a
  // change made <250ms before navigation is never lost).
  function flush(): Promise<void> {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = undefined;
    }
    return Promise.all(writeNow()).then(() => undefined);
  }

  function mergeSettings(raw: unknown): Record<string, FeatureSetting> {
    const merged = defaultSettings();
    for (const [id, val] of Object.entries((raw as Record<string, FeatureSetting>) || {})) {
      if (FEATURE_MAP.has(id) && val && typeof val === 'object') {
        merged[id] = { ...merged[id], ...val };
      }
    }
    return merged;
  }

  function applyTtsPrefs(t?: TtsPersist) {
    if (!t) return;
    if (typeof t.rate === 'number') tts.setRate(t.rate);
    if (typeof t.pitch === 'number') tts.setPitch(t.pitch);
    if (t.voiceURI !== undefined) tts.setVoice(t.voiceURI);
  }

  async function load(): Promise<void> {
    const site = readPayload<SitePayload>(await storage.get(SETTINGS_KEY));
    const siteOk = site !== null;
    const secret = secretStorage ? readPayload<SecretPayload>(await secretStorage.get(SECRET_KEY)) : null;
    const secretKey = secret !== null ? secret.apiKey : undefined;

    if (globalStorage) {
      const glob = readPayload<GlobalPayload>(await globalStorage.get(GLOBAL_KEY));
      const globOk = glob !== null;
      const def = readPayload<DefaultsPayload>(await globalStorage.get(DEFAULTS_KEY));
      defaults = def !== null ? mergeSettings(def.settings) : null;
      // Migration: a pre-split per-site payload carried ui/apiKey/tts. If the
      // global layer has none yet, seed it from the legacy per-site values.
      const ui = (globOk && glob.ui) || (siteOk && site.ui) || undefined;
      const legacyKey = (globOk ? glob.apiKey : undefined) ?? (siteOk ? site.apiKey : undefined) ?? '';
      const ttsPrefs = (globOk && glob.tts) || (siteOk && site.tts) || undefined;
      const apiKey = secretKey ?? legacyKey;
      // A site the user has adjusted keeps its own settings. Anywhere else
      // inherits the cross-site default, which is the whole point: someone who
      // needs 150% text needs it on sites they have not visited yet.
      siteDirty = !!siteOk;
      store.set({
        settings: siteOk ? mergeSettings(site.settings) : defaults || defaultSettings(),
        ui: { ...store.get().ui, ...(ui || {}), ...(opts.uiOverrides || {}) },
        activeProfile: siteOk ? site.activeProfile ?? null : null,
        apiKey,
      });
      applyTtsPrefs(ttsPrefs);
      // An existing install has the key sitting in the global (synced) layer.
      // Move it down to the device-local secret layer and strip it from the
      // synced blob, otherwise the promise that it stays on this machine only
      // holds for people who installed after this change.
      if (secretStorage && legacyKey && secretKey === undefined) {
        await secretStorage.set(SECRET_KEY, { version: PERSIST_VERSION, apiKey: legacyKey } as SecretPayload);
      }
      if (secretStorage && globOk && glob.apiKey) {
        const { apiKey: _dropped, ...rest } = glob;
        await globalStorage.set(GLOBAL_KEY, rest as GlobalPayload);
      }
      return;
    }

    // Single-layer surface (the widget): one origin, so there is no "other
    // sites" for a default to apply to. Everything stays in one payload.
    //
    // Nothing is written until the visitor changes something. The widget used
    // to write localStorage on first paint on every page view, before anyone
    // had touched it, which is a storage write on someone else's site for a
    // preference that does not exist yet. A visitor who never opens the panel
    // now leaves no trace, and no consent banner is needed to say so, because
    // the only thing ever stored is a choice they just made.
    siteDirty = !!siteOk;
    if (siteOk) {
      store.set({
        settings: mergeSettings(site.settings),
        ui: { ...store.get().ui, ...(site.ui || {}), ...(opts.uiOverrides || {}) },
        activeProfile: site.activeProfile ?? null,
        apiKey: secretKey ?? site.apiKey ?? '',
      });
      applyTtsPrefs(site.tts);
    } else if (secretKey) {
      store.set((prev) => ({ ...prev, apiKey: secretKey }));
    }
  }

  // Set once load() has settled. Everything that persists is gated on it, so
  // applying saved state during load never writes that same state back.
  let loaded = false;

  // TTS rate/pitch/voice live in the TTS controller, not the store; they
  // persist through the same debounced path.

  // Reconcile + persist on every state change. The persist is gated on
  // `loaded` because load() itself calls store.set: without the gate every page
  // view wrote storage back before the visitor had done anything, which on the
  // widget is a localStorage write on someone else's site for a preference that
  // does not exist yet, and on the extension is a chrome.storage.sync write per
  // page load against a quota.
  store.subscribe(() => {
    reconcile();
    if (loaded) schedulePersist();
  });

  // The TTS controller emits for everything it does: play, pause, stop, and the
  // browser's voice list arriving asynchronously. Only rate, pitch, and voice
  // are preferences, so compare before persisting. Without this, `voiceschanged`
  // on first load looked like a user action, which wrote storage on a page view
  // where the visitor had done nothing, and pinned the site as adjusted.
  let lastTts = JSON.stringify(ttsSnapshot());
  const ttsUnsub = tts.subscribe(() => {
    if (!loaded) return;
    const now = JSON.stringify(ttsSnapshot());
    if (now === lastTts) return;
    lastTts = now;
    // Choosing a voice or a speed is a preference the visitor set, so on a
    // single-layer surface it is also what makes this site worth remembering.
    if (!globalStorage) siteDirty = true;
    schedulePersist();
  });

  // Flush pending writes before the page goes away.
  const win = (doc.defaultView || (typeof window !== 'undefined' ? window : undefined)) as Window | undefined;
  const onHide = () => {
    void flush();
  };
  if (win) {
    win.addEventListener('pagehide', onHide);
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') onHide();
    });
  }

  injectBase();

  // Settings are applied the instant they arrive, without waiting on the patch
  // store. This is the tail of the untreated-page flash: the content script now
  // runs at document_start, so the only remaining gap is the storage read, and
  // making that gap as short as possible is the whole job. Site patches are
  // DOM surgery that has to wait for elements anyway, so they land after.
  const settingsReady = load()
    .catch(() => undefined)
    .then(() => {
      loaded = true;
      reconcile();
      mutations.start();
    });

  const ready = Promise.all([settingsReady, patches.ready.catch(() => undefined)]).then(() => {
    applyPatches();
  });

  // ---- public API --------------------------------------------------------
  return {
    store,
    tts,
    provider,
    patches,
    friction,
    guide,
    ready,
    getState: () => store.get(),
    subscribe: (fn) => store.subscribe(fn),

    setFeature(id, patch) {
      const cur = store.get().settings[id];
      if (!cur) return;
      siteDirty = true;
      store.set((prev) => ({
        ...prev,
        settings: { ...prev.settings, [id]: { ...cur, ...patch } as FeatureSetting },
        activeProfile: null,
      }));
    },

    toggleFeature(id, on) {
      const cur = store.get().settings[id];
      if (!cur) return;
      const next = on === undefined ? !cur.active : on;
      siteDirty = true;
      store.set((prev) => ({
        ...prev,
        settings: { ...prev.settings, [id]: { ...cur, active: next } },
        activeProfile: null,
      }));
    },

    applyProfile(id) {
      const profile = PROFILE_MAP.get(id);
      if (!profile) return;
      // Clicking the active profile turns it (and everything) off.
      if (store.get().activeProfile === id) {
        this.resetAll();
        return;
      }
      const next = defaultSettings();
      for (const [fid, patch] of Object.entries(profile.apply)) {
        if (next[fid]) next[fid] = { ...next[fid], ...patch, active: true } as FeatureSetting;
      }
      siteDirty = true;
      store.set((prev) => ({ ...prev, settings: next, activeProfile: id }));
    },

    resetAll() {
      // Reset means off, here, now. It does not mean "go back to my defaults":
      // someone hitting reset wants the page to stop being changed, and having
      // it snap back to a saved default would read as the button not working.
      const prev = store.get();
      // Only worth remembering if there was something to lose. Resetting an
      // already-clean page must not offer a pointless undo.
      undoSnapshot = Object.values(prev.settings).some((s) => s.active)
        ? {
            settings: JSON.parse(JSON.stringify(prev.settings)) as Record<string, FeatureSetting>,
            activeProfile: prev.activeProfile,
          }
        : null;
      siteDirty = true;
      store.set((p) => ({ ...p, settings: defaultSettings(), activeProfile: null }));
    },

    undoReset() {
      const snap = undoSnapshot;
      if (!snap) return false;
      undoSnapshot = null;
      siteDirty = true;
      store.set((p) => ({ ...p, settings: snap.settings, activeProfile: snap.activeProfile }));
      return true;
    },

    canUndoReset: () => !!undoSnapshot,

    saveAsDefaults() {
      if (!globalStorage) return;
      const snapshot = JSON.parse(JSON.stringify(store.get().settings)) as Record<string, FeatureSetting>;
      defaults = snapshot;
      void globalStorage.set(DEFAULTS_KEY, {
        version: PERSIST_VERSION,
        settings: snapshot,
      } as DefaultsPayload);
    },

    clearDefaults() {
      defaults = null;
      if (globalStorage) void globalStorage.remove(DEFAULTS_KEY);
    },

    hasDefaults: () => !!defaults,

    clearSite() {
      if (!globalStorage) return;
      siteDirty = false;
      void storage.remove(SETTINGS_KEY);
      store.set((prev) => ({
        ...prev,
        settings: defaults ? (JSON.parse(JSON.stringify(defaults)) as Record<string, FeatureSetting>) : defaultSettings(),
        activeProfile: null,
      }));
      // store.set schedules a persist, which would immediately re-create the
      // payload we just removed if the flag had been left set.
      siteDirty = false;
    },

    hasSiteSettings: () => siteDirty,

    adoptSettings(settings, activeProfile) {
      store.set((prev) => ({
        ...prev,
        settings: settings
          ? mergeSettings(settings)
          : defaults
            ? (JSON.parse(JSON.stringify(defaults)) as Record<string, FeatureSetting>)
            : defaultSettings(),
        activeProfile,
      }));
    },

    setUiPref(key, value) {
      // On a single-layer surface the panel chrome shares the site payload, so
      // changing it is the visitor asking to be remembered here.
      if (!globalStorage) siteDirty = true;
      store.set((prev) => ({ ...prev, ui: { ...prev.ui, [key]: value } }));
    },

    setApiKey(key) {
      if (!globalStorage) siteDirty = true;
      store.set((prev) => ({ ...prev, apiKey: key }));
    },

    activeCount() {
      return Object.values(store.get().settings).filter((s) => s.active).length;
    },

    profiles: () => PROFILES,

    flush,

    destroy() {
      void flush();
      routes.stop();
      mutations.stop();
      ttsUnsub();
      if (win) win.removeEventListener('pagehide', onHide);
      guide.stop();
      shadow.stop();
      patches.revertAll(doc);
      for (const [, ctx] of contexts) ctx.destroy();
      contexts.clear();
      doc.getElementById(BASE_STYLE_ID)?.remove();
      html.removeAttribute('data-webable');
      tts.stop();
    },
  };
}
