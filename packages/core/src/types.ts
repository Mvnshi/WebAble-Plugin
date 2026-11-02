/**
 * @webable/core, shared type contracts.
 *
 * The engine, the UI, and both surfaces (widget + extension) all speak these
 * types. Nothing in here imports a framework: core stays renderer-agnostic so
 * the same logic drives the embeddable widget and the browser extension.
 */

import type { TTSController } from './tts';
import type { CompanionEvent } from '@webable/companion';

export type SettingValue = string | number | boolean;

/**
 * A feature's serializable state. Always carries `active`; feature-specific
 * fields (size, mode, color, …) live alongside it. Kept flat and JSON-safe so
 * the whole settings object round-trips through localStorage / chrome.storage.
 */
export interface FeatureSetting {
  active: boolean;
  [key: string]: SettingValue;
}

export type FeatureCategory =
  | 'reading'
  | 'color'
  | 'motion'
  | 'aids'
  | 'power';

export const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  reading: 'Content & reading',
  color: 'Color & contrast',
  motion: 'Motion & focus',
  aids: 'Reading aids',
  power: 'Power tools',
};

/** Which surface(s) a tool belongs on. Accessibility tools stay 'both' (true 1:1). */
export type Surface = 'extension' | 'widget' | 'both';

export type ControlType = 'slider' | 'segmented' | 'select' | 'color' | 'toggle';

/**
 * Declarative description of one adjustable input inside a feature card. The
 * UI renders these generically, so adding a control never means touching the
 * panel code, it lives entirely in the feature's metadata.
 */
export interface Control {
  /** Setting key this control binds to. */
  key: string;
  type: ControlType;
  label: string;
  /** slider bounds */
  min?: number;
  max?: number;
  step?: number;
  /** Rendered next to the live value, e.g. "%", "px". */
  unit?: string;
  /** segmented / select choices */
  options?: ReadonlyArray<{ value: SettingValue; label: string }>;
  /** Format the live value shown on a slider (UI-only, never persisted). */
  format?: (v: SettingValue) => string;
}

export interface FeatureMeta {
  id: string;
  label: string;
  description: string;
  category: FeatureCategory;
  /** Icon id resolved by the UI's icon set. */
  icon: string;
  /** WCAG 2.1 success criteria this feature helps satisfy (e.g. "1.4.4"). */
  wcag?: readonly string[];
  /** Extra controls beyond the master on/off toggle. */
  controls?: readonly Control[];
  /** Extra search terms so a tool is findable by synonym. */
  keywords?: readonly string[];
  /** Which surface(s) this tool is available on. Defaults to 'both'. */
  surfaces?: Surface;
  /**
   * Marks features whose effect is a one-shot page mutation (hide images,
   * reading mask) rather than a static stylesheet. The engine re-applies these
   * after DOM mutations.
   */
  dynamic?: boolean;
}

/**
 * Everything a feature needs to touch the host page. The engine builds one of
 * these against the host `document` (the real page for the widget, or the tab
 * for the extension content script) and passes it to every feature. Features
 * never reach for `document` directly, they go through the context so the
 * same code works in tests (jsdom) and in odd embedding contexts.
 */
export interface FeatureContext {
  doc: Document;
  win: Window;
  /** Host <html>. Carries `data-webable-*` flags + `--wa-*` custom props. */
  html: HTMLElement;
  /** Host <body>. */
  body: HTMLElement;
  /** Idempotently inject (or replace) a scoped <style> in the host <head>. */
  injectCSS(id: string, css: string): void;
  removeCSS(id: string): void;
  /** Toggle `data-webable-<flag>` on <html> (the hook feature CSS keys off). */
  setFlag(flag: string, on: boolean): void;
  /** Set/clear a `--wa-<name>` custom property on <html>. */
  setVar(name: string, value: SettingValue | null): void;
  /** Track a node the feature created so the engine can clean it up. */
  own<T extends Node>(node: T): T;
  /** Add an event listener that is auto-removed when the feature disables. */
  on<K extends keyof WindowEventMap>(
    target: Window | Document | HTMLElement,
    type: K | string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  /** Per-feature scratch space for imperative handles (raf ids, running flags). */
  store: Record<string, unknown>;
  /** Register a callback run when the feature is torn down (raf cancel, etc.). */
  onCleanup(fn: () => void): void;
  /** Turn this feature off from inside (e.g. a reader-overlay "Close" button). */
  disableSelf(): void;
  /** AI provider (BYO key or hosted proxy) for AI-category in-page tools. */
  provider: AIProvider;
  /** Keyless TTS controller, for "speak this" actions in in-page tools. */
  tts: TTSController;
  /**
   * True when this document is a sub-frame of a page that already has an
   * engine, so the parent's composed `filter` is already painting over
   * everything this document draws. Almost nothing needs to care; what does is
   * anything that paints a colour meant to be seen unfiltered, because in a
   * frame it will be filtered. See baseStyles.ts FRAME_CSS and darkMode.
   */
  framed: boolean;
}

/**
 * The unit of behavior. `apply` is idempotent: the engine calls it on enable,
 * on every setting change, and on DOM-mutation re-apply. `disable` must return
 * the page to as if the feature never ran.
 */
export interface FeatureModule<S extends FeatureSetting = FeatureSetting> {
  id: string;
  meta: FeatureMeta;
  defaults: S;
  apply(setting: S, ctx: FeatureContext): void;
  disable(ctx: FeatureContext): void;
}

/** Bundles a set of feature settings under a one-click name. */
export interface Profile {
  id: string;
  label: string;
  description: string;
  icon: string;
  wcag?: readonly string[];
  /** Partial settings merged over defaults when applied. */
  apply: Record<string, Partial<FeatureSetting>>;
}

/** Key/value persistence. localStorage for the widget, chrome.storage for the extension. */
export interface StorageAdapter {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

/** One turn in a Guide conversation. */
export interface GuideTurn {
  role: 'user' | 'assistant';
  text: string;
}

/**
 * One on-page annotation the Guide can draw to explain a step. Anchored to the
 * page's numbered elements (never raw pixels), so it stays correct on scroll,
 * resize, and reflow. `circle`/`box`/`underline`/`label` use `el`; `arrow` goes
 * from `el` to `to`; `label` carries `text`.
 */
export interface GuideDraw {
  kind: 'circle' | 'box' | 'underline' | 'label' | 'arrow';
  el?: number;
  to?: number;
  text?: string;
}

/** One step of a Guide walkthrough: what to say, an optional element to point
 *  at, and optional annotations that sketch the explanation. */
export interface GuideStep {
  say: string;
  point?: number | null;
  label?: string;
  draw?: GuideDraw[];
}

/**
 * The model's reply to a Guide question. A single answer sets `say` + `point`;
 * a walkthrough sets `steps` (one or more), which the UI advances through. The
 * single-point fields stay for back-compat and as the one-step fallback.
 */
export interface GuideReply {
  say: string;
  point: number | null;
  label?: string;
  steps?: GuideStep[];
}

/**
 * AI is progressive enhancement layered on top of a fully-working keyless
 * widget. The provider hides the source (BYO Gemini key now, hosted proxy
 * later) so feature code never changes when the source does.
 */
export interface AIProvider {
  readonly id: string;
  isConfigured(): boolean;
  /** Generate alt text for an image. */
  describeImage(input: { dataUrl?: string; url?: string; context?: string }): Promise<string>;
  /** Rewrite text into plain language. */
  simplify(text: string, opts?: { level?: 'plain' | 'simple' }): Promise<string>;
  /** Summarize an article. */
  summarize(text: string, opts?: { title?: string; url?: string }): Promise<string>;
  /** Answer a question using the page's text. */
  ask(question: string, context: string): Promise<string>;
  /** Translate text into a target language. */
  translate(text: string, targetLang: string): Promise<string>;
  /** Explain text in plain language. */
  explain(text: string): Promise<string>;
  /** Extract the text visible in an image (OCR). */
  ocr(input: { dataUrl: string }): Promise<string>;
  /** On-page guide: answer a how-to about the current page and optionally point
   *  at one of its numbered interactive elements. */
  guide(input: { question: string; page: string; history?: GuideTurn[] }): Promise<GuideReply>;
  /**
   * Streaming Guide. Optional: providers that implement it let the pointer move
   * mid-sentence instead of after the whole answer lands, which is the
   * difference between a companion that guides and a tool that replies. The
   * Guide falls back to the batch `guide()` above wherever this is absent.
   *
   * `onEvent` fires for every command and text fragment as they arrive.
   */
  guideStream?(
    input: { question: string; page: string; history?: GuideTurn[] },
    onEvent: (event: CompanionEvent) => void,
    signal?: AbortSignal
  ): Promise<void>;
}

/** Persisted shape under `webable:settings:v1`. */
export interface PersistedState {
  version: number;
  settings: Record<string, FeatureSetting>;
  activeProfile: string | null;
  ui: UiPrefs;
}

export interface UiPrefs {
  /** Panel chrome theme, independent of the page-effect "contrast" feature. */
  theme: 'auto' | 'light' | 'dark' | 'glass';
  /** Launcher accent. Brand default is cobalt blue. */
  accent: string;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Last free-drag position of the launcher, if the user moved it. */
  launcherOffset: { x: number; y: number } | null;
  language: string;
}
