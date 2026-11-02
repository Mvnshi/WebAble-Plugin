/**
 * @webable/core, public API. Framework-agnostic engine consumed by the shared
 * UI and both surfaces (widget + extension).
 */
export * from './types';
export { createEngine } from './engine';
export type { Engine, EngineState, EngineOptions } from './engine';
export { createStore } from './store';
// Exported for tests: mutation starvation and SPA route detection are engine
// contracts that deserve direct coverage, not only coverage through the engine.
export { createMutationManager, createRouteWatcher, createShadowStyles, shadowScopedCSS } from './dom';
export type { RouteWatcher, ShadowStyles } from './dom';
export type { Store } from './store';
export {
  localStorageAdapter,
  memoryAdapter,
  chromeStorageAdapter,
  defaultStorage,
} from './storage';
export { createTTS, extractMainText } from './tts';
export type { TTSController, TTSState, TTSPrefs } from './tts';
export { createGeminiProvider, createProxyProvider, nullProvider } from './ai';
// Accounts and the routing provider are deliberately not reachable from the
// engine: the widget shares this bundle and has a hard size budget, and a
// hosted subscription is a thing only the extension and the desktop app have.
// See the note at the top of account.ts.
export { createAccountStore, readAccount, isLive, ACCOUNT_KEY, RELAY_BASE } from './account';
export type { Account, AccountStore } from './account';
export { createRoutingProvider } from './ai/routing';
export type { RoutingOptions } from './ai/routing';
export { FEATURES, FEATURE_MAP, FEATURE_IDS } from './features';
export { PROFILES, PROFILE_MAP } from './profiles';
export {
  getAssetBase,
  assetUrl,
  SETTINGS_KEY,
  GLOBAL_KEY,
  SECRET_KEY,
  DEFAULTS_KEY,
  siteKeyFor,
  migratePersisted,
} from './config';
export type { PersistMigration } from './config';

// Per-host feed selector table (also used by tests / extension surfaces).
export { feedSelectorsFor } from './features/declutter';

// Power-tool logic modules (surfaced by the UI; logic stays here).
export { cleanUrl, selectionText, selectionMarkdown, selectionCSV, pageQuote, copyText } from './tools/cleanCopy';
export { buildTarget, resolveTarget, startPatchPicker, describeAction } from './tools/patches';
export type { Patch, PatchAction, PatchTarget, PatchStore, PatchPicker } from './tools/patches';
export { FRICTION_REASONS, describeElement, createFrictionStore } from './tools/friction';
export type { FrictionEntry, FrictionStore } from './tools/friction';
export { scanTraps } from './tools/trapLens';
export type { Finding } from './tools/trapLens';
export { createGuide, buildGuideElements } from './tools/guide';
export type { GuideController, GuideState } from './tools/guide';
