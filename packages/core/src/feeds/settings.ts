/**
 * The feed guard's data shapes, defaults, and scope resolution.
 *
 * Two persisted blobs, deliberately in different places:
 *
 *   - Rules (this file's `FeedState`) are small, change rarely, and are the
 *     thing a person would be annoyed to set up twice. They belong in the
 *     synced layer so they roam with the account.
 *   - Usage (`FeedUsage`) is a counter that moves every fifteen seconds and is
 *     meaningless on another machine, because "minutes spent on YouTube" is a
 *     fact about a device, not about a person. It stays device-local. Putting
 *     it in chrome.storage.sync would also blow the write quota inside an hour.
 *
 * Scope: one set of rules for everywhere, and a per-platform override on top.
 * The override is partial by design, so "quieter on TikTok" does not mean
 * re-stating every unrelated switch, and clearing it falls back rather than
 * resetting to defaults.
 */

export type PlatformId = 'youtube' | 'tiktok' | 'instagram' | 'x';
export type ScopeId = 'global' | PlatformId;

export const PLATFORMS: readonly PlatformId[] = ['youtube', 'tiktok', 'instagram', 'x'];
export const SCOPES: readonly ScopeId[] = ['global', 'youtube', 'tiktok', 'instagram', 'x'];

export const PLATFORM_LABELS: Record<PlatformId, string> = {
  youtube: 'YouTube',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  x: 'X',
};

/** How a hidden item is dealt with once the guard has decided. */
export type CleanScroll = 'remove' | 'blur';

/**
 * One complete set of rules. Every field is scalar or a string array so the
 * whole thing round-trips through chrome.storage without a custom codec.
 */
export interface FeedRules {
  /** Allowlist. Empty means every category is allowed through. */
  focus: string[];
  /** Denylist, category ids and custom topic ids alike. Wins over `focus`. */
  blocked: string[];
  /** Narrow the feed to learning, work and finance. */
  deepWork: boolean;
  /** Shorts, Reels, and the TikTok For You feed. Needs no classification. */
  hideShorts: boolean;
  hideClickbait: boolean;
  hideSponsored: boolean;
  hideComments: boolean;
  hideSidebar: boolean;
  hideLive: boolean;
  /** Push the platform onto its Following/Subscriptions surface. */
  followingOnly: boolean;
  hideMessages: boolean;
  cleanScroll: CleanScroll;
  /** The category badge drawn on each item. */
  showLabel: boolean;
  /** The check and cross that correct a wrong badge. Needs `showLabel`. */
  showConfirm: boolean;
  /** A green/amber/red dot instead of reading the category. */
  showDot: boolean;
  /** Minutes of active browsing per day. 0 is no limit. */
  dailyLimit: number;
  /** Cover the whole platform rather than filtering it. */
  blockSite: boolean;
  /**
   * Let the configured AI provider settle items the on-device pass was unsure
   * about. Off by default: it is the only part of this subsystem that sends a
   * title anywhere, so it is opt in, per the same rule the rest of the
   * extension's AI follows.
   */
  aiAssist: boolean;
}

export const DEFAULT_RULES: FeedRules = {
  focus: [],
  blocked: [],
  deepWork: false,
  hideShorts: false,
  hideClickbait: false,
  hideSponsored: false,
  hideComments: false,
  hideSidebar: false,
  hideLive: false,
  followingOnly: false,
  hideMessages: false,
  cleanScroll: 'remove',
  showLabel: false,
  showConfirm: false,
  showDot: false,
  dailyLimit: 0,
  blockSite: false,
  aiAssist: false,
};

/** A running focus session. `until` is 0 for an open-ended one. */
export interface FeedSession {
  /** Epoch ms the session ends, or 0 when it runs until stopped. */
  until: number;
  /** What the user picked, kept for the label after `until` is computed. */
  minutes: number;
  /** Categories the session narrows to. Empty means deep-work content. */
  categories: string[];
  /** Epoch ms it began, so the panel can show progress. */
  from: number;
}

export const FEED_STATE_VERSION = 1;

export interface FeedState {
  version: number;
  /** The master switch for the whole subsystem. */
  enabled: boolean;
  global: FeedRules;
  overrides: Partial<Record<PlatformId, Partial<FeedRules>>>;
  session: FeedSession | null;
  /** Topics the user typed, kept separately so removing one can clean up. */
  customTopics: string[];
  /**
   * Corrections, keyed by a fingerprint of title and channel.
   *
   * Local only, and it stays local. The reference product aggregates every
   * correction into a shared cross-user word database whether or not you
   * turned its AI off, which means a switch labelled "keep everything on this
   * device" does not. A correction here trains this browser and nothing else.
   */
  corrections: Record<string, string>;
}

export function defaultState(): FeedState {
  return {
    version: FEED_STATE_VERSION,
    enabled: true,
    global: { ...DEFAULT_RULES, focus: [], blocked: [] },
    overrides: {},
    session: null,
    customTopics: [],
    corrections: {},
  };
}

/** The rules in force on one platform: global, with that platform layered on. */
export function resolveRules(state: FeedState, platform: PlatformId | null): FeedRules {
  const base = { ...DEFAULT_RULES, ...state.global };
  if (!platform) return base;
  const over = state.overrides[platform];
  return over ? { ...base, ...over } : base;
}

/** Whether a platform has any override at all, for the "Reset to Global" affordance. */
export function hasOverride(state: FeedState, platform: PlatformId): boolean {
  const over = state.overrides[platform];
  return !!over && Object.keys(over).length > 0;
}

export const FEED_USAGE_VERSION = 1;

/**
 * One writer's contribution to one day.
 *
 * Sharded rather than a single number because chrome.storage has no
 * read-modify-write primitive: every edit reads the whole namespace bag,
 * changes one key and writes it back, and two tabs doing that at once lose one
 * of the two edits silently (see the note in storage.ts). Summing per-writer
 * shards makes concurrent writers commutative instead of destructive.
 *
 * The shard id comes from sessionStorage, so it is stable for the life of a
 * tab and survives navigation within it. A day therefore holds about as many
 * shards as the person opened tabs, not as many as they loaded pages.
 */
export interface DayShard {
  /** Active seconds, per platform. */
  sec: Partial<Record<PlatformId, number>>;
  /** Items hidden, per platform. */
  hid: Partial<Record<PlatformId, number>>;
  /** Seconds browsed with Deep Work Mode on, for the rank formula. */
  deep: number;
}

export interface FeedLogEntry {
  at: number;
  platform: PlatformId;
  /** What happened, so the row can be read without parsing the category. */
  kind: 'hidden' | 'passed' | 'shorts' | 'sponsored' | 'limit';
  category: string;
  title: string;
}

export interface FeedUsage {
  version: number;
  /** Day (YYYY-MM-DD) to shard id to counters. Pruned to DAYS_KEPT days. */
  days: Record<string, Record<string, DayShard>>;
  /** Extra minutes the user granted themselves after a limit, per day. */
  grants: Record<string, Partial<Record<PlatformId, number>>>;
  /** Newest first, capped at LOG_MAX. */
  log: FeedLogEntry[];
}

export const DAYS_KEPT = 30;
export const LOG_MAX = 50;

export function defaultUsage(): FeedUsage {
  return { version: FEED_USAGE_VERSION, days: {}, grants: {}, log: [] };
}

/** Local calendar day, not UTC: a daily limit means the user's day. */
export function dayKey(at: number): string {
  const d = new Date(at);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function emptyShard(): DayShard {
  return { sec: {}, hid: {}, deep: 0 };
}

/** Sum every writer's contribution to one day. */
export function foldDay(day: Record<string, DayShard> | undefined): DayShard {
  const out = emptyShard();
  if (!day) return out;
  for (const shard of Object.values(day)) {
    if (!shard) continue;
    for (const p of PLATFORMS) {
      const s = shard.sec?.[p];
      if (s) out.sec[p] = (out.sec[p] || 0) + s;
      const h = shard.hid?.[p];
      if (h) out.hid[p] = (out.hid[p] || 0) + h;
    }
    out.deep += shard.deep || 0;
  }
  return out;
}
