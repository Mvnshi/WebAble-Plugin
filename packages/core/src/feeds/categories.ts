/**
 * The category taxonomy the feed guard sorts content into.
 *
 * Thirty-seven user-selectable categories plus two classifier fallbacks. The
 * taxonomy mirrors the one the comparable products expose, because a person
 * moving between them should not have to relearn what "Gossip" means, but
 * every keyword lexicon and every line of classifier code here is original.
 * Nothing was copied: see classify.ts.
 *
 * Two of the thirty-seven are ours rather than theirs. The reference product
 * ships a Block Topics row with a Shopping chip and a Gambling chip whose ids
 * its own classifier never emits, so pressing either hides nothing forever and
 * nothing says so. Both exist here as real categories with real lexicons,
 * which is why this file says thirty-seven where their marketing says
 * thirty-five.
 *
 * GENERAL and OTHER are not offered to the user. They are what the classifier
 * answers with when it does not know, and hiding "everything I could not
 * identify" is a switch nobody would knowingly press.
 */

/** A category the user can allow or block. */
export interface Category {
  id: string;
  label: string;
  /**
   * How the category reads by default. Only used to order and group the
   * picker, never to decide anything: the user's list is the whole decision.
   */
  group: 'learn' | 'make' | 'life' | 'watch' | 'noise';
}

export const CATEGORIES: readonly Category[] = [
  // Learning and work
  { id: 'EDU', label: 'Education', group: 'learn' },
  { id: 'SCIENCE', label: 'Science', group: 'learn' },
  { id: 'DOCUMENTARY', label: 'Documentary', group: 'learn' },
  { id: 'HISTORY', label: 'History', group: 'learn' },
  { id: 'PODCAST', label: 'Podcast', group: 'learn' },
  { id: 'CODING', label: 'Coding', group: 'make' },
  { id: 'TECH', label: 'Tech', group: 'make' },
  { id: 'AI', label: 'AI', group: 'make' },
  { id: 'STARTUP', label: 'Startup', group: 'make' },
  { id: 'FINANCE', label: 'Finance', group: 'make' },
  { id: 'CRYPTO', label: 'Crypto', group: 'make' },
  { id: 'REALESTATE', label: 'Real estate', group: 'make' },
  { id: 'DIY', label: 'DIY', group: 'make' },
  { id: 'ART', label: 'Art & design', group: 'make' },
  // Life
  { id: 'HEALTH', label: 'Health', group: 'life' },
  { id: 'FITNESS', label: 'Fitness', group: 'life' },
  { id: 'COOKING', label: 'Cooking', group: 'life' },
  { id: 'TRAVEL', label: 'Travel', group: 'life' },
  { id: 'NATURE', label: 'Nature', group: 'life' },
  { id: 'ANIMALS', label: 'Animals', group: 'life' },
  { id: 'FASHION', label: 'Fashion', group: 'life' },
  { id: 'CARS', label: 'Cars', group: 'life' },
  { id: 'LIFE', label: 'Life', group: 'life' },
  { id: 'MOTIVATION', label: 'Motivation', group: 'life' },
  { id: 'RELATIONSHIP', label: 'Relationships', group: 'life' },
  // Watching
  { id: 'MUSIC', label: 'Music', group: 'watch' },
  { id: 'COMEDY', label: 'Comedy', group: 'watch' },
  { id: 'SPORT', label: 'Sports', group: 'watch' },
  { id: 'GAMING', label: 'Gaming', group: 'watch' },
  { id: 'ENTERTAINMENT', label: 'Entertainment', group: 'watch' },
  { id: 'SHOPPING', label: 'Shopping', group: 'watch' },
  // The loud end
  { id: 'NEWS', label: 'News', group: 'noise' },
  { id: 'POLITICS', label: 'Politics', group: 'noise' },
  { id: 'GOSSIP', label: 'Celebrity & gossip', group: 'noise' },
  { id: 'CLICKBAIT', label: 'Clickbait', group: 'noise' },
  { id: 'GAMBLING', label: 'Gambling', group: 'noise' },
  { id: 'AD', label: 'Sponsored', group: 'noise' },
];

/** What the classifier answers when it cannot place something. Never offered. */
export const GENERAL = 'GENERAL';
/** What the classifier answers when it placed something outside the taxonomy. */
export const OTHER = 'OTHER';

export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

export const CATEGORY_MAP: ReadonlyMap<string, Category> = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Human label for any id, including the two fallbacks and a custom topic. */
export function categoryLabel(id: string): string {
  const known = CATEGORY_MAP.get(id);
  if (known) return known.label;
  if (id === GENERAL) return 'Uncategorised';
  if (id === OTHER) return 'Other';
  // A custom topic is stored as its own upper-cased id; show it title-cased.
  return id
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * The twelve quick picks the Focus Mode row offers before the full list.
 *
 * Thirty-seven chips in a 320px panel is a wall, so the row leads with the
 * twelve people actually reach for and puts the rest behind "All categories".
 * Order matters: it is the order they are read in, not alphabetical.
 */
export const FOCUS_QUICK_PICKS: readonly string[] = [
  'EDU',
  'CODING',
  'TECH',
  'FINANCE',
  'FITNESS',
  'MUSIC',
  'ART',
  'HISTORY',
  'TRAVEL',
  'DIY',
  'CARS',
  'SCIENCE',
];

/** The eight one-press blocks, in the order the row shows them. */
export const BLOCK_QUICK_PICKS: readonly string[] = [
  'GAMING',
  'POLITICS',
  'ENTERTAINMENT',
  'GOSSIP',
  'SHOPPING',
  'SPORT',
  'NEWS',
  'GAMBLING',
];

/**
 * What Deep Work Mode lets through.
 *
 * The reference product describes this as "lock the feed to one category" in
 * one place and "only Learning, Tech & Finance" in another, which cannot both
 * be true. This is the second reading, because a feed locked to exactly one
 * category is not a work mode, it is an empty page: nobody's work is one
 * category deep.
 */
export const DEEP_WORK_CATEGORIES: readonly string[] = [
  'EDU',
  'SCIENCE',
  'DOCUMENTARY',
  'CODING',
  'TECH',
  'AI',
  'STARTUP',
  'FINANCE',
];

/** Normalise free text into a custom-topic id. Empty when there is nothing left. */
export function topicId(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase().slice(0, 40);
}
