/**
 * The feed guard's state: rules, usage, session, corrections, and the log.
 *
 * Framework-free and DOM-free on purpose, so the panel, the popup and the
 * page-side runtime all read one object rather than three copies of the same
 * arithmetic. It takes its two storage layers by injection for the same reason
 * the engine does: tests hand it memory adapters and get the real code path.
 *
 * Writes are debounced. Rules move when a person presses something, so 250ms
 * is plenty and matches the engine. Usage moves every tick of the clock, so it
 * is written on a slower beat: chrome.storage.sync would refuse that rate
 * outright, and even local is a disk write on somebody's laptop.
 */
import type { StorageAdapter } from '../types';
import {
  DAYS_KEPT,
  FEED_STATE_VERSION,
  FEED_USAGE_VERSION,
  LOG_MAX,
  PLATFORMS,
  dayKey,
  defaultState,
  defaultUsage,
  emptyShard,
  foldDay,
  resolveRules,
  type FeedLogEntry,
  type FeedRules,
  type FeedSession,
  type FeedState,
  type DayShard,
  type FeedUsage,
  type PlatformId,
  type ScopeId,
} from './settings';
import { topicId } from './categories';
import { statsFrom, type FeedStats } from './score';

export const FEED_SETTINGS_KEY = 'feeds:v1';
export const FEED_USAGE_KEY = 'feeds-usage:v1';

const RULES_DEBOUNCE_MS = 250;
const USAGE_DEBOUNCE_MS = 5000;

export interface LimitState {
  /** Minutes allowed today, including anything granted. 0 means no limit. */
  limit: number;
  /** Seconds of active browsing counted today. */
  used: number;
  /** Seconds left, floored at 0. */
  left: number;
  /** True once the limit is set and spent. */
  over: boolean;
}

export interface FeedStoreOptions {
  /** Roams with the account: rules, session, corrections. */
  settings: StorageAdapter;
  /** Device-local: counters and the log. */
  usage: StorageAdapter;
  /**
   * Which writer this is. Stable for the life of a tab (the surface derives it
   * from sessionStorage) so a day holds one shard per tab rather than one per
   * page load. See DayShard in settings.ts for why sharding at all.
   */
  shardId: string;
}

export interface FeedStore {
  readonly ready: Promise<void>;
  getState(): FeedState;
  getUsage(): FeedUsage;
  subscribe(fn: () => void): () => void;
  destroy(): void;

  setEnabled(on: boolean): void;
  /** Write one rule at one scope. 'global' writes the base, a platform writes an override. */
  setRule<K extends keyof FeedRules>(scope: ScopeId, key: K, value: FeedRules[K]): void;
  /** Drop a platform's override so it follows the global rules again. */
  clearOverride(platform: PlatformId): void;
  toggleCategory(scope: ScopeId, list: 'focus' | 'blocked', id: string): void;
  addTopic(raw: string): string | null;
  removeTopic(id: string): void;
  rulesFor(platform: PlatformId | null): FeedRules;

  startSession(minutes: number, categories: string[], now: number): void;
  stopSession(): void;
  /** The session if it is still running at `now`, else null (and it is cleared). */
  activeSession(now: number): FeedSession | null;

  correct(fingerprint: string, category: string): void;
  forgetCorrections(): void;

  addSeconds(platform: PlatformId, seconds: number, deepWork: boolean, now: number): void;
  countHidden(platform: PlatformId, n: number, now: number): void;
  addLog(entry: FeedLogEntry): void;
  clearLog(): void;
  /** Give today's limit more room, which is the only way past the overlay. */
  grantExtra(platform: PlatformId, minutes: number, now: number): void;
  limitFor(platform: PlatformId, now: number): LimitState;
  stats(now: number): FeedStats;

  /** Take a payload written by another tab or another device. */
  adoptState(raw: unknown): void;
  adoptUsage(raw: unknown): void;
  /** Wipe everything this subsystem stores. */
  reset(): void;
}

function readState(raw: unknown): FeedState | null {
  if (!raw || typeof raw !== 'object') return null;
  const bag = raw as Partial<FeedState>;
  if (bag.version !== FEED_STATE_VERSION) return null;
  const base = defaultState();
  return {
    ...base,
    ...bag,
    global: { ...base.global, ...(bag.global || {}) },
    overrides: bag.overrides || {},
    customTopics: Array.isArray(bag.customTopics) ? bag.customTopics : [],
    corrections: bag.corrections && typeof bag.corrections === 'object' ? bag.corrections : {},
    session: bag.session && typeof bag.session === 'object' ? bag.session : null,
  };
}

function readUsage(raw: unknown): FeedUsage | null {
  if (!raw || typeof raw !== 'object') return null;
  const bag = raw as Partial<FeedUsage>;
  if (bag.version !== FEED_USAGE_VERSION) return null;
  return {
    version: FEED_USAGE_VERSION,
    days: bag.days && typeof bag.days === 'object' ? bag.days : {},
    grants: bag.grants && typeof bag.grants === 'object' ? bag.grants : {},
    log: Array.isArray(bag.log) ? bag.log : [],
  };
}

/**
 * Keep the usage blob from growing without bound.
 *
 * Days before today can no longer be written by anybody, so their shards are
 * folded into one. Today's are left alone: folding a day that other tabs are
 * still writing to would race, and the whole point of sharding is that the
 * writers never touch each other's keys.
 */
function compact(usage: FeedUsage, now: number): void {
  const today = dayKey(now);
  const cutoff = dayKey(now - DAYS_KEPT * 86400000);
  for (const day of Object.keys(usage.days)) {
    if (day < cutoff) {
      delete usage.days[day];
      continue;
    }
    if (day === today) continue;
    const shards = usage.days[day];
    const ids = Object.keys(shards);
    if (ids.length <= 1) continue;
    usage.days[day] = { '-': foldDay(shards) };
  }
  for (const day of Object.keys(usage.grants)) {
    if (day < cutoff) delete usage.grants[day];
  }
  if (usage.log.length > LOG_MAX) usage.log.length = LOG_MAX;
}

/**
 * Everything one writer has counted for a day, as one number.
 *
 * Only ever compared against another total for the SAME shard, where the
 * quantities are the same and the value only grows, so summing seconds and
 * counts together is a monotonic ordering rather than a meaningful measurement.
 */
function shardTotal(shard: DayShard): number {
  let n = shard.deep || 0;
  for (const p of PLATFORMS) n += (shard.sec[p] || 0) + (shard.hid[p] || 0);
  return n;
}

export function createFeedStore(opts: FeedStoreOptions): FeedStore {
  let state = defaultState();
  let usage = defaultUsage();
  const listeners = new Set<() => void>();
  let dead = false;

  let rulesTimer: ReturnType<typeof setTimeout> | null = null;
  let usageTimer: ReturnType<typeof setTimeout> | null = null;

  const notify = () => {
    for (const fn of Array.from(listeners)) {
      try {
        fn();
      } catch {
        /* one bad subscriber must not stop the others */
      }
    }
  };

  const flushRules = () => {
    rulesTimer = null;
    if (dead) return;
    void opts.settings.set(FEED_SETTINGS_KEY, state);
  };
  const flushUsage = () => {
    usageTimer = null;
    if (dead) return;
    void opts.usage.set(FEED_USAGE_KEY, usage);
  };

  const saveRules = (silent = false) => {
    if (rulesTimer) clearTimeout(rulesTimer);
    rulesTimer = setTimeout(flushRules, RULES_DEBOUNCE_MS);
    if (!silent) notify();
  };
  const saveUsage = (silent = false) => {
    if (usageTimer) clearTimeout(usageTimer);
    usageTimer = setTimeout(flushUsage, USAGE_DEBOUNCE_MS);
    if (!silent) notify();
  };

  const ready = (async () => {
    const [rawState, rawUsage] = await Promise.all([
      opts.settings.get(FEED_SETTINGS_KEY).catch(() => null),
      opts.usage.get(FEED_USAGE_KEY).catch(() => null),
    ]);
    if (dead) return;
    state = readState(rawState) || state;
    usage = readUsage(rawUsage) || usage;
    notify();
  })();

  /** The shard this writer owns for a day, created on demand. */
  const shardFor = (day: string) => {
    const shards = (usage.days[day] = usage.days[day] || {});
    return (shards[opts.shardId] = shards[opts.shardId] || emptyShard());
  };

  const writeRule = <K extends keyof FeedRules>(scope: ScopeId, key: K, value: FeedRules[K]) => {
    if (scope === 'global') {
      state.global = { ...state.global, [key]: value };
    } else {
      const over = { ...(state.overrides[scope] || {}) };
      over[key] = value;
      state.overrides = { ...state.overrides, [scope]: over };
    }
    saveRules();
  };

  return {
    ready,
    getState: () => state,
    getUsage: () => usage,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      dead = true;
      if (rulesTimer) clearTimeout(rulesTimer);
      if (usageTimer) clearTimeout(usageTimer);
      listeners.clear();
    },

    setEnabled(on) {
      state = { ...state, enabled: on };
      saveRules();
    },
    setRule: writeRule,
    clearOverride(platform) {
      const next = { ...state.overrides };
      delete next[platform];
      state = { ...state, overrides: next };
      saveRules();
    },
    toggleCategory(scope, list, id) {
      const current = resolveRules(state, scope === 'global' ? null : scope)[list];
      const has = current.includes(id);
      writeRule(scope, list, has ? current.filter((c) => c !== id) : [...current, id]);
    },
    addTopic(raw) {
      const id = topicId(raw);
      if (!id) return null;
      if (!state.customTopics.includes(id)) {
        state = { ...state, customTopics: [...state.customTopics, id] };
      }
      const blocked = state.global.blocked;
      if (!blocked.includes(id)) state.global = { ...state.global, blocked: [...blocked, id] };
      saveRules();
      return id;
    },
    removeTopic(id) {
      state = {
        ...state,
        customTopics: state.customTopics.filter((t) => t !== id),
        global: { ...state.global, blocked: state.global.blocked.filter((b) => b !== id) },
      };
      saveRules();
    },
    rulesFor: (platform) => resolveRules(state, platform),

    startSession(minutes, categories, now) {
      state = {
        ...state,
        session: {
          from: now,
          minutes,
          until: minutes > 0 ? now + minutes * 60000 : 0,
          categories: [...categories],
        },
      };
      saveRules();
    },
    stopSession() {
      if (!state.session) return;
      state = { ...state, session: null };
      saveRules();
    },
    activeSession(now) {
      const s = state.session;
      if (!s) return null;
      if (s.until && now >= s.until) {
        // Expiry is not an event anybody fires: it is just a time passing. The
        // first read after it clears the session rather than leaving a finished
        // timer to be reported as running on every surface that asks.
        state = { ...state, session: null };
        saveRules();
        return null;
      }
      return s;
    },

    correct(fingerprint, category) {
      state = { ...state, corrections: { ...state.corrections, [fingerprint]: category } };
      saveRules();
    },
    forgetCorrections() {
      state = { ...state, corrections: {} };
      saveRules();
    },

    addSeconds(platform, seconds, deepWork, now) {
      if (seconds <= 0) return;
      const day = dayKey(now);
      const shard = shardFor(day);
      shard.sec[platform] = (shard.sec[platform] || 0) + seconds;
      if (deepWork) shard.deep += seconds;
      compact(usage, now);
      // Silent: a ticking clock re-rendering the whole panel four times a
      // minute is noise, and every surface that shows the clock reads it on its
      // own beat anyway.
      saveUsage(true);
    },
    countHidden(platform, n, now) {
      if (n <= 0) return;
      const shard = shardFor(dayKey(now));
      shard.hid[platform] = (shard.hid[platform] || 0) + n;
      compact(usage, now);
      saveUsage(true);
    },
    addLog(entry) {
      usage.log = [entry, ...usage.log].slice(0, LOG_MAX);
      saveUsage(true);
    },
    clearLog() {
      usage.log = [];
      saveUsage();
    },
    grantExtra(platform, minutes, now) {
      const day = dayKey(now);
      const grants = (usage.grants[day] = usage.grants[day] || {});
      grants[platform] = (grants[platform] || 0) + minutes;
      saveUsage();
    },
    limitFor(platform, now) {
      const rules = resolveRules(state, platform);
      const day = dayKey(now);
      const granted = usage.grants[day]?.[platform] || 0;
      const limit = rules.dailyLimit > 0 ? rules.dailyLimit + granted : 0;
      const used = foldDay(usage.days[day]).sec[platform] || 0;
      const allowed = limit * 60;
      return {
        limit,
        used,
        left: limit > 0 ? Math.max(0, allowed - used) : 0,
        over: limit > 0 && used >= allowed,
      };
    },
    stats: (now) => statsFrom(usage, now),

    adoptState(raw) {
      const next = readState(raw);
      if (!next) return;
      state = next;
      notify();
    },
    adoptUsage(raw) {
      const next = readUsage(raw);
      if (!next) return;
      // Keep this writer's own shard wherever the incoming copy is behind it.
      //
      // Sharding makes concurrent writers commutative once their writes have
      // LANDED. It does nothing for a write still sitting in the five second
      // debounce, and this is the path where that costs something: another tab
      // flushes, chrome.storage fires onChanged here, and adopting the blob
      // wholesale hands back a snapshot taken before this tab's last tick. The
      // tick is fifteen seconds of somebody's daily limit, and losing it is
      // silent.
      //
      // A shard only ever grows, so "ours is bigger" is a safe test rather than
      // a guess at which is newer. Nobody else's shard is touched, which is the
      // property that makes this a merge and not another clobber.
      for (const [day, shards] of Object.entries(usage.days)) {
        const mine = shards?.[opts.shardId];
        if (!mine) continue;
        const theirs = next.days[day]?.[opts.shardId];
        if (theirs && shardTotal(theirs) >= shardTotal(mine)) continue;
        next.days[day] = { ...(next.days[day] || {}), [opts.shardId]: mine };
      }
      usage = next;
      notify();
    },
    reset() {
      state = defaultState();
      usage = defaultUsage();
      void opts.settings.set(FEED_SETTINGS_KEY, state);
      void opts.usage.set(FEED_USAGE_KEY, usage);
      notify();
    },
  };
}

/** Every platform's limit at once, for the popup's summary row. */
export function allLimits(store: FeedStore, now: number): Array<{ platform: PlatformId } & LimitState> {
  return PLATFORMS.map((platform) => ({ platform, ...store.limitFor(platform, now) }));
}
