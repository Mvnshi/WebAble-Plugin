/**
 * @webable/core/feeds: the feed guard.
 *
 * A separate entry point from the engine on purpose. This subsystem exists
 * only on the browser extension: it needs cross-site storage the widget has no
 * way to offer, it carries a keyword lexicon and four sites' worth of DOM
 * knowledge, and the widget's bundle is gated at 65 KB gzipped with single
 * digits of headroom. Reaching it through the package's root would put every
 * byte of it in a bundle that can never use one.
 *
 * The same reasoning already keeps accounts out of the engine. See the note at
 * the top of ../account.ts.
 */
export {
  CATEGORIES,
  CATEGORY_IDS,
  CATEGORY_MAP,
  GENERAL,
  OTHER,
  categoryLabel,
  topicId,
  FOCUS_QUICK_PICKS,
  BLOCK_QUICK_PICKS,
  DEEP_WORK_CATEGORIES,
} from './categories';
export type { Category } from './categories';

export {
  PLATFORMS,
  SCOPES,
  PLATFORM_LABELS,
  DEFAULT_RULES,
  FEED_STATE_VERSION,
  FEED_USAGE_VERSION,
  DAYS_KEPT,
  LOG_MAX,
  defaultState,
  defaultUsage,
  resolveRules,
  hasOverride,
  dayKey,
  emptyShard,
  foldDay,
} from './settings';
export type {
  PlatformId,
  ScopeId,
  CleanScroll,
  FeedRules,
  FeedSession,
  FeedState,
  FeedUsage,
  FeedLogEntry,
  DayShard,
} from './settings';

export { classify, clickbaitScore, fingerprint, tokenize, LOW_CONFIDENCE } from './classify';
export type { ClassifyInput, Verdict } from './classify';

export { ADAPTERS, platformFor } from './platforms';
export type { FeedItem, ItemKind, ChromeSelectors, PlatformAdapter } from './platforms';

export { createFeedStore, allLimits, FEED_SETTINGS_KEY, FEED_USAGE_KEY } from './store';
export type { FeedStore, FeedStoreOptions, LimitState } from './store';

export {
  focusScore,
  rankFor,
  statsFrom,
  pointsFrom,
  recentDays,
  humanDuration,
  RANKS,
  SECONDS_PER_HIDDEN_ITEM,
} from './score';
export type { FeedStats, ScorePart, Rank, DaySeries } from './score';

export { createFeedGuard, decide, allowedCategories, reasonText } from './runtime';
export type { FeedGuard, FeedGuardOptions, Decision, HideReason } from './runtime';
