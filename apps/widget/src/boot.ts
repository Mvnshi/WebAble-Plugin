/**
 * Widget boot: the functional chunk. Creates the engine (which immediately
 * re-applies the visitor's saved settings, so a low-vision user's preferences
 * are live before they ever open the panel), mounts the shared UI, and exposes
 * the documented `window.WebAble` API. Reads config the loader placed on
 * `window.WebAbleConfig`.
 */
import { createEngine, createProxyProvider, memoryAdapter, type FeatureSetting, type UiPrefs } from '@webable/core';
import { mountWidget } from '@webable/ui';

interface WidgetConfig {
  name?: string;
  theme?: UiPrefs['theme'];
  position?: UiPrefs['position'];
  color?: string;
  tools?: string | string[];
  accessibilityUrl?: string;
  profiles?: boolean;
  remember?: boolean;
  autoOpen?: boolean;
  hideLauncher?: boolean;
  attribution?: boolean;
  ai?: 'on' | 'off';
  /** Hosted AI proxy base URL (the WebAble API). When set, AI calls go
   * through the server and no key is ever held in the page. */
  aiProxy?: string;
}

const cfg = ((window as unknown as { WebAbleConfig?: WidgetConfig }).WebAbleConfig || {}) as WidgetConfig;

const uiOverrides: Partial<UiPrefs> = {};
if (cfg.position) uiOverrides.position = cfg.position;
if (cfg.theme) uiOverrides.theme = cfg.theme;
if (cfg.color) uiOverrides.accent = cfg.color;

const toolList =
  typeof cfg.tools === 'string'
    ? cfg.tools.split(',').map((t) => t.trim()).filter(Boolean)
    : Array.isArray(cfg.tools)
    ? cfg.tools
    : undefined;

const engine = createEngine({
  uiOverrides,
  storage: cfg.remember === false ? memoryAdapter() : undefined,
  provider: typeof cfg.aiProxy === 'string' && cfg.aiProxy ? createProxyProvider(cfg.aiProxy) : undefined,
});

const api = mountWidget({
  engine,
  config: {
    brandName: cfg.name || 'WebAble',
    attribution: cfg.attribution !== false,
    accessibilityUrl: cfg.accessibilityUrl || null,
    showProfiles: cfg.profiles !== false,
    showAI: cfg.ai !== 'off',
    hideLauncher: cfg.hideLauncher === true,
    surface: 'widget',
    tools: toolList,
    autoOpen: cfg.autoOpen === true,
  },
});

// Public API: stable surface for site owners and the marketing site.
const WebAble = {
  open: () => api.open(),
  close: () => api.close(),
  toggle: () => api.toggle(),
  isOpen: () => api.isOpen(),
  destroy: () => api.destroy(),
  // Trust boundary: callers pass arbitrary JSON; the engine ignores unknown ids
  // and merges per-key, so a malformed patch degrades to a no-op.
  apply: (id: string, patch: Record<string, unknown>) => engine.setFeature(id, patch as Partial<FeatureSetting>),
  set: (id: string, on?: boolean) => engine.toggleFeature(id, on),
  applyProfile: (id: string) => engine.applyProfile(id),
  reset: () => engine.resetAll(),
  engine,
};

const W = window as unknown as {
  WebAble?: unknown;
  __WEBABLE_QUEUE__?: Array<[string, unknown[]]>;
};
W.WebAble = WebAble;

// Replay anything called against the loader's stub. The documented snippet is
// a button wired to WebAble.open(), and a visitor can press it before an async
// module has finished loading. Dropping those presses on the floor is how a
// "hide the launcher and drive it yourself" install ends up looking broken.
const queued = W.__WEBABLE_QUEUE__;
if (queued && queued.length) {
  for (const [name, args] of queued) {
    const fn = (WebAble as unknown as Record<string, unknown>)[name];
    if (typeof fn === 'function') {
      try {
        (fn as (...a: unknown[]) => unknown)(...args);
      } catch {
        /* one bad queued call must not stop the rest */
      }
    }
  }
}
W.__WEBABLE_QUEUE__ = [];

// For anyone who would rather wait than queue.
try {
  document.dispatchEvent(new CustomEvent('webable:ready', { detail: WebAble }));
} catch {
  /* CustomEvent is unavailable in some very old engines; the queue covers them */
}
