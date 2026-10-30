/**
 * The extension side of the power layer: the command bar, click hints, page
 * insights and Site Check, wired to this tab's engine.
 *
 * Kept out of content.ts so that file stays about the engine's lifetime and the
 * storage protocol. This one is about input: two shortcuts, a handful of
 * messages, and the small host object the command bar acts through.
 *
 * Top frame only. A command bar per ad iframe would be absurd, and the
 * shortcuts belong to the page the person is looking at.
 */
import type { Engine } from '@webable/core';
import { createCommandBar, startHints, readInsights, run, type CommandBar, type HintMode, type HintSession, type Intent, type PowerHost, type UsageStats } from '@webable/power';
import { runSiteCheck, highlightFinding } from '@webable/power/sitecheck';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

/**
 * Preferences for the power layer. Synced: they are about the person, not the
 * device. The key starts with "webable" so Clear all data in Settings finds it.
 */
export const POWER_KEY = 'webable:power';
export interface PowerPrefs {
  hintMode: HintMode;
  /** Whether the in-page fallback shortcuts listen. See listenForShortcuts. */
  pageShortcuts: boolean;
}
const DEFAULT_PREFS: PowerPrefs = { hintMode: 'letters', pageShortcuts: true };

/** Command usage, for ranking. Local: how often you use dark mode is nobody's business but this device's. */
const STATS_KEY = 'webable:cmdstats';

interface Live {
  engine: Engine;
  api: { open(): void } | null;
}

export interface PowerRig {
  /** Handle a WEBABLE_* message. Returns true when it answered asynchronously. */
  onMessage(msg: { type?: string; intent?: Intent; id?: string; index?: number }, reply: (r: unknown) => void): boolean | undefined;
  destroy(): void;
}

export function createPowerRig(getLive: () => Live | null, setEnabled: (on: boolean) => Promise<void>): PowerRig {
  let bar: CommandBar | null = null;
  let barEngine: Engine | null = null;
  let hints: HintSession | null = null;
  let prefs: PowerPrefs = { ...DEFAULT_PREFS };
  const counts: Record<string, number> = {};

  try {
    chrome.storage.sync.get(POWER_KEY, (res: Record<string, Partial<PowerPrefs>>) => {
      prefs = { ...DEFAULT_PREFS, ...(res?.[POWER_KEY] || {}) };
    });
    chrome.storage.local.get(STATS_KEY, (res: Record<string, Record<string, number>>) => {
      Object.assign(counts, res?.[STATS_KEY] || {});
    });
    chrome.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'sync' && changes[POWER_KEY]) prefs = { ...DEFAULT_PREFS, ...((changes[POWER_KEY].newValue as Partial<PowerPrefs>) || {}) };
    });
  } catch {
    /* not in an extension context (tests) */
  }

  const stats: UsageStats = {
    get: () => ({ ...counts }),
    bump(id) {
      counts[id] = (counts[id] || 0) + 1;
      try {
        chrome.storage.local.set({ [STATS_KEY]: counts });
      } catch {
        /* ignore */
      }
    },
  };

  function host(engine: Engine): PowerHost {
    return {
      engine,
      doc: document,
      win: window,
      openPanel: () => getLive()?.api?.open(),
      openSettings: () => send({ type: 'WEBABLE_OPEN_OPTIONS' }),
      openSiteCheck: () => send({ type: 'WEBABLE_OPEN_REPORT' }),
      turnOffHere: () => void setEnabled(false),
      startHints: (o) => showHints(o.mode, o.newTab),
    };
  }

  /** The bar is built on first use and rebuilt if the engine was (site switched off and on). */
  function getBar(): CommandBar | null {
    const live = getLive();
    if (!live) return null;
    if (!bar || barEngine !== live.engine) {
      bar?.destroy();
      bar = createCommandBar({ host: host(live.engine), stats, shortcuts: shortcutLabels });
      barEngine = live.engine;
    }
    return bar;
  }

  function showHints(mode?: HintMode, newTab?: boolean): void {
    if (hints) {
      hints.stop();
      hints = null;
      return;
    }
    bar?.close();
    hints = startHints(document, {
      mode: mode || prefs.hintMode,
      newTab,
      onDone: () => {
        hints = null;
      },
    });
    if (hints.count === 0) {
      hints = null;
      getBar()?.toast('Nothing clickable is visible here');
    }
  }

  /**
   * Shortcut labels as the browser bound them, for the help screen. A person
   * may have rebound them at chrome://extensions/shortcuts, and help that
   * names the default they replaced is worse than no help.
   */
  let shortcutLabels: { bar?: string; hints?: string; panel?: string } = {};
  send({ type: 'WEBABLE_GET_SHORTCUTS' }, (r) => {
    if (r && typeof r === 'object') shortcutLabels = r as typeof shortcutLabels;
  });

  /**
   * Shortcuts the page itself listens for, as a fallback.
   *
   * Chrome binds an extension's suggested shortcut only when nothing else
   * holds it, and says nothing when it does not, so on some machines the
   * command bar's shortcut is simply absent. Listening here as well means the
   * same keys work either way. When the browser did bind them, it consumes the
   * keypress and this never sees it, so there is no double fire.
   */
  function onKeyDown(e: KeyboardEvent): void {
    if (!prefs.pageShortcuts || e.repeat) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && !e.altKey && (e.key === 'K' || e.key === 'k')) {
      e.preventDefault();
      e.stopPropagation();
      getBar()?.toggle();
    } else if (e.altKey && e.shiftKey && !mod && e.code === 'KeyH') {
      e.preventDefault();
      e.stopPropagation();
      if (getLive()) showHints();
    }
  }
  window.addEventListener('keydown', onKeyDown, true);

  let lastToggle = 0;
  return {
    onMessage(msg, reply) {
      switch (msg?.type) {
        case 'WEBABLE_COMMAND_BAR': {
          // The browser command and the page listener can both fire for one
          // press on a page that re-dispatches key events. One toggle per beat.
          const now = Date.now();
          if (now - lastToggle < 250) return undefined;
          lastToggle = now;
          getBar()?.toggle();
          return undefined;
        }
        case 'WEBABLE_HINTS':
          if (getLive()) showHints();
          return undefined;
        case 'WEBABLE_INSIGHTS': {
          const live = getLive();
          if (!live) {
            reply({ insights: [] });
            return undefined;
          }
          const active = new Set(Object.entries(live.engine.getState().settings).filter(([, s]) => s.active).map(([id]) => id));
          try {
            reply({ insights: readInsights({ doc: document, win: window, active }) });
          } catch {
            reply({ insights: [] });
          }
          return undefined;
        }
        case 'WEBABLE_RUN_INTENT': {
          const live = getLive();
          if (!live || !msg.intent) {
            reply({ message: 'WebAble is off on this site' });
            return undefined;
          }
          void run(host(live.engine), msg.intent).then((o) => {
            // The popup closes itself when it sends this, so the person reads
            // what happened on the page, where the Undo is.
            if (o.answer) getBar()?.open();
            else getBar()?.toast(o.message, o.undo);
            reply({ message: o.message });
          });
          return true;
        }
        case 'WEBABLE_SITE_CHECK': {
          void runSiteCheck(document, window).then(reply, (err: Error) => reply({ error: err?.message || 'failed' }));
          return true;
        }
        case 'WEBABLE_HIGHLIGHT': {
          reply({ found: highlightFinding(document, msg.id || '', msg.index || 0) });
          return undefined;
        }
        default:
          return undefined;
      }
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown, true);
      hints?.stop();
      bar?.destroy();
      bar = null;
    },
  };
}

function send(msg: Record<string, unknown>, cb?: (r: unknown) => void): void {
  try {
    chrome.runtime.sendMessage(msg, (r: unknown) => {
      void chrome.runtime.lastError;
      cb?.(r);
    });
  } catch {
    /* extension reloaded underneath this page; nothing to talk to */
  }
}
