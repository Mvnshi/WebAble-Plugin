/**
 * The rule: the feed store's two persisted blobs must survive being written by
 * more than one writer at a time. Rules round-trip through storage unchanged
 * and resolve global-then-override; usage counts every writer's seconds rather
 * than the last writer's, and prunes itself without folding a day somebody is
 * still writing to.
 *
 * Why it exists: chrome.storage has no read-modify-write primitive. Every edit
 * reads the whole namespace bag, changes one key and writes the bag back, so
 * two tabs editing at once lose one of the two edits and nothing reports it.
 * The usage blob is written every five seconds by every open tab on the
 * machine, which makes it the one place in this codebase where that race is
 * not theoretical: a day of YouTube would be counted by whichever tab happened
 * to flush last. Per-writer shards are the whole answer, and the failure is
 * invisible from reading the code, because the sharded and the unsharded
 * version both write a plausible-looking number.
 *
 * So every claim here that something was NOT lost, NOT leaked across a scope,
 * NOT duplicated and NOT compacted is preceded by a control that makes this
 * same harness produce the failure first. A zero is only evidence once the
 * instrument has been shown to produce a non-zero.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { memoryAdapter, type StorageAdapter } from '@webable/core';
import {
  createFeedStore,
  dayKey,
  foldDay,
  hasOverride,
  DAYS_KEPT,
  FEED_SETTINGS_KEY,
  FEED_STATE_VERSION,
  FEED_USAGE_KEY,
  PLATFORMS,
  type FeedState,
  type FeedUsage,
} from '../src/feeds';

/**
 * Pin the zone, because this runner is on UTC and UTC hides the bug.
 *
 * dayKey() is documented as the user's local calendar day rather than UTC, and
 * on a UTC machine those two are the same string, so a dayKey rewritten to
 * `toISOString().slice(0, 10)` passed every assertion in this file. That is
 * the "reports success while the thing it tests is absent" shape: the test was
 * written, ran, and could not have failed. Asia/Kolkata is UTC+05:30 and has
 * no DST, so local midnight sits at 18:30 the previous UTC day (which is what
 * makes the boundary test able to tell the two apart, asserted there rather
 * than trusted) and no offset change can collapse two of the forty days below
 * into one. Node applies this to Date immediately on assignment; the assertion
 * in the boundary test fails loudly if a future runtime stops doing so.
 */
process.env.TZ = 'Asia/Kolkata';

const DAY_MS = 86400000;
const MINUTE_MS = 60000;

/**
 * Every timestamp in this file is written out, never taken from the clock.
 *
 * dayKey() is local-calendar, so a store that read Date.now() would change
 * which day it counted into depending on the hour the suite ran, and the day
 * boundary test below would pass all day and fail at midnight. Noon is the
 * anchor because an offset shift on either side of it still lands on the same
 * local date, which keeps the forty-day walk forty distinct days.
 */
const local = (y: number, month: number, d: number, h: number, min: number): number =>
  new Date(y, month - 1, d, h, min, 0, 0).getTime();
const NOON = local(2025, 5, 14, 12, 0);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The store debounces rules at 250ms and usage at 5000ms. Both plus slack. */
const RULES_SETTLED_MS = 300;
const USAGE_SETTLED_MS = 6000;

interface RecordingAdapter extends StorageAdapter {
  /** How many times set() has been called, so a debounce can be observed. */
  writes: number;
}

/**
 * A storage double that copies on the way in and on the way out.
 *
 * memoryAdapter is the sanctioned double and is used everywhere below that a
 * plain bucket is enough. It cannot be used for the tests that watch a write
 * cross the boundary, because it stores the object it was handed by reference:
 * the store mutates `state.global` in place, so a memoryAdapter read after an
 * un-flushed rule change already reports the new value, and two stores sharing
 * one memoryAdapter would share one mutable usage blob, which makes the race
 * the shard design exists to survive physically impossible to stage.
 *
 * This double is therefore STRICTER than memoryAdapter, and no looser than the
 * dependency it stands in for: chrome.storage serialises across a process
 * boundary, so every read there is a fresh object and every write is a
 * snapshot taken at write time. JSON is a narrower codec than structured
 * clone, which is safe here only because both feed blobs are deliberately
 * JSON-only (see the note on FeedRules in settings.ts). Erring strict cannot
 * hide a lost write; it is what makes one visible.
 *
 * set() does its work synchronously before returning its promise, exactly as
 * memoryAdapter does, so a debounce that has fired has already landed by the
 * time the next line runs.
 */
function recordingAdapter(): RecordingAdapter {
  const map = new Map<string, string>();
  const self: RecordingAdapter = {
    writes: 0,
    async get<T>(key: string): Promise<T | null> {
      const raw = map.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as T);
    },
    async set<T>(key: string, value: T): Promise<void> {
      self.writes += 1;
      map.set(key, JSON.stringify(value));
    },
    async remove(key: string): Promise<void> {
      map.delete(key);
    },
  };
  return self;
}

// ---------------------------------------------------------------------------
// Round trip and the debounce that carries it
// ---------------------------------------------------------------------------

test('rules written by one store are read back by the next one built on the same storage', async () => {
  // The real 250ms debounce is waited out rather than reached past: the flush
  // is the thing under test, and a store whose timer never fired would leave
  // storage empty and the second store on defaults.
  const settings = memoryAdapter();
  const usage = memoryAdapter();

  const first = createFeedStore({ settings, usage, shardId: 'tab-a' });
  await first.ready;
  first.setEnabled(false);
  first.setRule('global', 'hideShorts', true);
  first.setRule('global', 'dailyLimit', 45);
  first.toggleCategory('global', 'blocked', 'POLITICS');
  first.setRule('youtube', 'hideComments', true);
  first.startSession(25, ['CODING'], NOON);

  await wait(RULES_SETTLED_MS);
  first.destroy();

  const second = createFeedStore({ settings, usage, shardId: 'tab-b' });
  await second.ready;

  assert.equal(second.getState().enabled, false, 'the master switch survived');
  assert.equal(second.rulesFor(null).hideShorts, true);
  assert.equal(second.rulesFor(null).dailyLimit, 45);
  assert.deepEqual(second.rulesFor(null).blocked, ['POLITICS']);
  assert.equal(second.rulesFor('youtube').hideComments, true, 'the override came back too');
  assert.equal(second.rulesFor('tiktok').hideComments, false, 'and stayed on youtube');
  assert.equal(second.activeSession(NOON + MINUTE_MS)?.minutes, 25, 'a running session survives a reload');
  assert.deepEqual(second.activeSession(NOON + MINUTE_MS)?.categories, ['CODING']);
  second.destroy();
});

test('rule changes inside one debounce window are one write, and nothing lands early', async () => {
  const settings = recordingAdapter();
  const store = createFeedStore({ settings, usage: memoryAdapter(), shardId: 'tab-a' });
  await store.ready;

  store.setRule('global', 'hideShorts', true);
  store.setRule('global', 'hideSidebar', true);
  store.setRule('global', 'hideLive', true);
  await wait(RULES_SETTLED_MS);

  // Control for the absence below: this instrument does see a write arrive,
  // and it can tell one write from three.
  const flushed = await settings.get<FeedState>(FEED_SETTINGS_KEY);
  assert.ok(flushed, 'the debounce flushed at all');
  assert.equal(flushed.global.hideShorts, true);
  assert.equal(flushed.global.hideLive, true);
  assert.equal(settings.writes, 1, 'three changes in one window cost one write, not three');

  // The absence: a change made after that flush is not in storage yet. The
  // rate limit on chrome.storage.sync is the reason the debounce exists, so a
  // debounce that quietly wrote through would be the bug.
  store.setRule('global', 'hideMessages', true);
  const midFlight = await settings.get<FeedState>(FEED_SETTINGS_KEY);
  assert.equal(midFlight?.global.hideMessages, false, 'storage still holds the previous snapshot');
  assert.equal(settings.writes, 1, 'and no write has been made for it');

  await wait(RULES_SETTLED_MS);
  const settled = await settings.get<FeedState>(FEED_SETTINGS_KEY);
  assert.equal(settled?.global.hideMessages, true, 'it lands once the window closes');
  assert.equal(settings.writes, 2);
  store.destroy();
});

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------

test('a global rule reaches every platform, an override is local to one, and clearing falls back', async () => {
  const store = createFeedStore({ settings: memoryAdapter(), usage: memoryAdapter(), shardId: 'tab-a' });
  await store.ready;

  store.setRule('global', 'hideComments', true);
  for (const platform of PLATFORMS) {
    assert.equal(store.rulesFor(platform).hideComments, true, `${platform} follows the global rule`);
  }
  assert.equal(store.rulesFor(null).hideComments, true, 'and so does a read with no platform');

  store.setRule('youtube', 'hideComments', false);
  // Control first: the instrument can see an override take effect. Without it,
  // "tiktok is unchanged" would also pass if setRule did nothing at all.
  assert.equal(store.rulesFor('youtube').hideComments, false, 'the override changed youtube');
  assert.equal(store.rulesFor('tiktok').hideComments, true, 'and left tiktok on the global value');
  assert.equal(hasOverride(store.getState(), 'youtube'), true);
  assert.equal(hasOverride(store.getState(), 'tiktok'), false, 'no override was invented for tiktok');

  store.clearOverride('youtube');
  // The distinction that matters: falling back to global, not resetting to the
  // shipped default. DEFAULT_RULES.hideComments is false, so a reset would read
  // as false here and look identical to a correct clear if global were false.
  assert.equal(store.rulesFor('youtube').hideComments, true, 'youtube is back on the global value');
  assert.equal(hasOverride(store.getState(), 'youtube'), false);
  store.destroy();
});

// ---------------------------------------------------------------------------
// Sharding. The control comes first, per the rule above.
// ---------------------------------------------------------------------------

test('control: two writers sharing one shard key lose one of the two counts', async (t) => {
  // This is the control for the sharding test below, and it is honest about
  // differing in two ways rather than one: the two stores share a shard key,
  // AND the second store never read the first's write. Both are needed,
  // because a shard per writer only helps a writer that read storage before it
  // wrote: set() replaces the whole blob and has no merge step. What this
  // establishes is exactly what the next test needs, which is that the
  // instrument (fold the stored blob, read the seconds) reports a number BELOW
  // the sum when a writer's shard is overwritten. Without it, the 90 below
  // would be a foregone conclusion rather than evidence.
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());

  const usage = recordingAdapter();
  const a = createFeedStore({ settings: memoryAdapter(), usage, shardId: 'tab' });
  const b = createFeedStore({ settings: memoryAdapter(), usage, shardId: 'tab' });
  await a.ready;
  await b.ready;

  a.addSeconds('youtube', 60, false, NOON);
  mock.timers.tick(USAGE_SETTLED_MS);

  b.addSeconds('youtube', 30, false, NOON);
  mock.timers.tick(USAGE_SETTLED_MS);

  const stored = await usage.get<FeedUsage>(FEED_USAGE_KEY);
  assert.ok(stored, 'both usage debounces flushed');
  const day = stored.days[dayKey(NOON)];
  assert.deepEqual(Object.keys(day), ['tab'], 'one key for two writers');
  const total = foldDay(day).sec.youtube || 0;
  assert.equal(total, 30, "the second writer's whole-blob write replaced the first writer's shard");
  assert.notEqual(total, 90, 'so this harness does report less than the sum when a count is lost');

  a.destroy();
  b.destroy();
});

test('two writers with different shard ids both keep their seconds', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());

  const usage = recordingAdapter();

  const a = createFeedStore({ settings: memoryAdapter(), usage, shardId: 'tab-a' });
  await a.ready;
  a.addSeconds('youtube', 60, true, NOON);
  mock.timers.tick(USAGE_SETTLED_MS); // a's own debounce writes the blob

  // The second tab, opened while the first is still counting: its store reads
  // whatever storage holds at construction, which is the blob a just wrote.
  // This is the arrangement content.ts produces, one store per tab, one shard
  // id per tab from sessionStorage, both on chrome.storage.local.
  const b = createFeedStore({ settings: memoryAdapter(), usage, shardId: 'tab-b' });
  await b.ready;
  b.addSeconds('youtube', 30, false, NOON);
  mock.timers.tick(USAGE_SETTLED_MS);

  const stored = await usage.get<FeedUsage>(FEED_USAGE_KEY);
  assert.ok(stored, 'both usage debounces flushed');
  const day = stored.days[dayKey(NOON)];
  assert.deepEqual(Object.keys(day).sort(), ['tab-a', 'tab-b'], 'each writer owns its own key');
  assert.equal(foldDay(day).sec.youtube, 90, 'and foldDay adds them instead of picking one');
  assert.equal(foldDay(day).deep, 60, 'deep-work seconds fold per shard too, and only a was in deep work');

  a.destroy();
  b.destroy();
});

test('adopting another writer\'s blob keeps this writer\'s own unflushed seconds', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());

  // Shards make two writers commutative once both writes have LANDED. This is
  // the other half: the five seconds between a tick and its flush. Another tab
  // flushes, chrome.storage fires onChanged, content.ts calls adoptUsage, and
  // the blob handed over was snapshotted before this tab's last tick. Adopting
  // it wholesale gives that tick back, which is fifteen seconds of somebody's
  // daily limit disappearing with nothing to show for it.
  const usage = recordingAdapter();

  const a = createFeedStore({ settings: memoryAdapter(), usage, shardId: 'tab-a' });
  await a.ready;
  a.addSeconds('youtube', 60, false, NOON);
  mock.timers.tick(USAGE_SETTLED_MS);
  const flushed = await usage.get<FeedUsage>(FEED_USAGE_KEY);
  assert.ok(flushed, 'the other tab wrote something to adopt');

  const b = createFeedStore({ settings: memoryAdapter(), usage: recordingAdapter(), shardId: 'tab-b' });
  await b.ready;
  // Deliberately NOT flushed. This is the in-flight state the bug lived in.
  b.addSeconds('youtube', 30, false, NOON);
  assert.equal(foldDay(b.getUsage().days[dayKey(NOON)]).sec.youtube, 30, 'b is counting');

  b.adoptUsage(flushed);

  const day = b.getUsage().days[dayKey(NOON)];
  // The control, and it comes first: the adoption really happened, so the zero
  // this test is about cannot be a store that quietly ignored the payload.
  assert.equal(day['tab-a']?.sec.youtube, 60, "the other writer's shard arrived");
  // The claim.
  assert.equal(day['tab-b']?.sec.youtube, 30, 'and this writer kept its own unflushed seconds');
  assert.equal(foldDay(day).sec.youtube, 90, 'so the fold is the sum rather than one of the two');

  // The other direction, which the merge must NOT get wrong: when the incoming
  // copy of OUR shard is ahead of ours, it is ours, written by an earlier
  // instance of this tab before a reload, and it wins. A merge that always kept
  // the local copy would strand those seconds forever.
  const ahead = JSON.parse(JSON.stringify(flushed)) as FeedUsage;
  ahead.days[dayKey(NOON)]['tab-b'] = { sec: { youtube: 300 }, hid: {}, deep: 0 };
  b.adoptUsage(ahead);
  assert.equal(b.getUsage().days[dayKey(NOON)]['tab-b']?.sec.youtube, 300, 'the larger copy of our own shard wins');

  a.destroy();
  b.destroy();
});

// ---------------------------------------------------------------------------
// The daily limit
// ---------------------------------------------------------------------------

test('limitFor spends the daily limit down, trips over, and a grant buys it back', async () => {
  const store = createFeedStore({ settings: memoryAdapter(), usage: memoryAdapter(), shardId: 'tab-a' });
  await store.ready;
  store.setRule('global', 'dailyLimit', 30);

  store.addSeconds('youtube', 20 * 60, false, NOON);
  const twenty = store.limitFor('youtube', NOON);
  assert.equal(twenty.limit, 30);
  assert.equal(twenty.used, 1200);
  assert.equal(twenty.left, 600, 'ten of thirty minutes are left');
  assert.equal(twenty.over, false);

  // Control for the last assertion in this test: `over` is a flag this
  // instrument can actually set, and `left` is a number it can drive to zero.
  store.addSeconds('youtube', 10 * 60, false, NOON);
  const spent = store.limitFor('youtube', NOON);
  assert.equal(spent.used, 1800);
  assert.equal(spent.left, 0, 'left floors at zero rather than going negative');
  assert.equal(spent.over, true);

  store.grantExtra('youtube', 10, NOON);
  const granted = store.limitFor('youtube', NOON);
  assert.equal(granted.limit, 40, 'the grant is added to the limit, not to the clock');
  assert.equal(granted.used, 1800, 'and it does not rewrite what was already spent');
  assert.equal(granted.left, 600);
  assert.equal(granted.over, false, 'the overlay comes down');

  // A grant is per platform and per day, so nothing else moved.
  const tiktok = store.limitFor('tiktok', NOON);
  assert.equal(tiktok.limit, 30, 'tiktok did not get the ten minutes');
  assert.equal(tiktok.used, 0);
  store.destroy();
});

test('a day boundary starts the limit over, and yesterday keeps its own seconds', async () => {
  const lateNight = local(2025, 5, 14, 23, 59);
  const justAfter = local(2025, 5, 15, 0, 1);

  // The control for every assertion below, and the reason this file pins TZ:
  // both instants fall on ONE UTC date, so a dayKey that reached for UTC would
  // put them in the same bucket and the split asserted next would not happen.
  // On a UTC machine this test cannot distinguish the two and passes either
  // way, which is how the UTC version survived the first run of it.
  assert.equal(
    new Date(lateNight).toISOString().slice(0, 10),
    new Date(justAfter).toISOString().slice(0, 10),
    'the pinned zone must straddle local midnight inside one UTC day, or this test proves nothing',
  );
  assert.notEqual(dayKey(lateNight), dayKey(justAfter), 'two minutes apart, two local days');

  const store = createFeedStore({ settings: memoryAdapter(), usage: memoryAdapter(), shardId: 'tab-a' });
  await store.ready;
  store.setRule('global', 'dailyLimit', 30);

  store.addSeconds('youtube', 600, false, lateNight);
  // Control: the instrument does count seconds into the day it was given, so
  // the 120 below is a fresh day rather than a store that counted nothing.
  const before = store.limitFor('youtube', lateNight);
  assert.equal(before.used, 600);
  assert.equal(before.left, 1200);

  store.addSeconds('youtube', 120, false, justAfter);
  const after = store.limitFor('youtube', justAfter);
  assert.equal(after.used, 120, "the new day starts from zero, not from yesterday's ten minutes");
  assert.equal(after.left, 1680);
  assert.equal(after.over, false);

  const yesterday = store.limitFor('youtube', lateNight);
  assert.equal(yesterday.used, 600, 'and yesterday was not overwritten by today');

  const days = store.getUsage().days;
  assert.equal(Object.keys(days).length, 2, 'two day keys, not one bucket carried across midnight');
  assert.equal(foldDay(days[dayKey(lateNight)]).sec.youtube, 600);
  assert.equal(foldDay(days[dayKey(justAfter)]).sec.youtube, 120);
  store.destroy();
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

test('a timed session expires on the first read past its end and is cleared, not just reported over', async () => {
  const settings = recordingAdapter();
  const store = createFeedStore({ settings, usage: memoryAdapter(), shardId: 'tab-a' });
  await store.ready;

  store.startSession(10, ['CODING'], NOON);
  await wait(RULES_SETTLED_MS);

  // Control: a running session is a thing this instrument can see, both in the
  // store and in storage. Only then does "it is gone" mean anything.
  const running = await settings.get<FeedState>(FEED_SETTINGS_KEY);
  assert.equal(running?.session?.minutes, 10, 'the session reached storage');
  const live = store.activeSession(NOON + 9 * MINUTE_MS);
  assert.ok(live, 'nine minutes in, it is still running');
  assert.equal(live.minutes, 10);
  assert.deepEqual(live.categories, ['CODING']);
  assert.equal(live.until, NOON + 10 * MINUTE_MS);

  assert.equal(store.activeSession(NOON + 11 * MINUTE_MS), null, 'eleven minutes in, it is over');
  assert.equal(store.getState().session, null, 'and it was cleared, not left for every surface to re-decide');
  assert.equal(store.activeSession(NOON + 11 * MINUTE_MS), null, 'a second read agrees');

  await wait(RULES_SETTLED_MS);
  const settled = await settings.get<FeedState>(FEED_SETTINGS_KEY);
  assert.equal(settled?.session, null, 'the clear was persisted, so a reload does not resurrect it');
  store.destroy();
});

test('an open-ended session does not expire', async () => {
  const store = createFeedStore({ settings: memoryAdapter(), usage: memoryAdapter(), shardId: 'tab-a' });
  await store.ready;

  store.startSession(0, [], NOON);
  const open = store.activeSession(NOON + 10 * 3600000);
  assert.ok(open, 'ten hours later it is still running');
  assert.equal(open.until, 0, 'zero minutes means no end, not an end at the epoch');
  assert.equal(open.minutes, 0);

  store.stopSession();
  assert.equal(store.activeSession(NOON), null, 'stopping is the only way it ends');
  store.destroy();
});

// ---------------------------------------------------------------------------
// Custom topics
// ---------------------------------------------------------------------------

test('addTopic normalises and dedupes, and removeTopic clears both lists', async () => {
  const store = createFeedStore({ settings: memoryAdapter(), usage: memoryAdapter(), shardId: 'tab-a' });
  await store.ready;

  const deepWork = store.addTopic('  deep   work  ');
  assert.equal(deepWork, 'DEEP WORK', 'trimmed, inner runs collapsed, upper-cased');
  assert.deepEqual(store.getState().customTopics, ['DEEP WORK']);
  assert.deepEqual(store.rulesFor(null).blocked, ['DEEP WORK'], 'a typed topic is blocked, not merely remembered');

  // Control for the dedupe assertion: a genuinely new topic does grow both
  // lists, so "the length did not change" below is dedupe rather than a
  // no-op addTopic.
  const crypto = store.addTopic('crypto news');
  assert.equal(crypto, 'CRYPTO NEWS');
  assert.deepEqual(store.getState().customTopics, ['DEEP WORK', 'CRYPTO NEWS']);
  assert.deepEqual(store.rulesFor(null).blocked, ['DEEP WORK', 'CRYPTO NEWS']);

  assert.equal(store.addTopic('DEEP    Work'), 'DEEP WORK', 'the same words normalise to the same id');
  assert.deepEqual(store.getState().customTopics, ['DEEP WORK', 'CRYPTO NEWS'], 'and are not added twice');
  assert.deepEqual(store.rulesFor(null).blocked, ['DEEP WORK', 'CRYPTO NEWS']);

  assert.equal(store.addTopic('   '), null, 'whitespace is not a topic');
  assert.deepEqual(store.getState().customTopics, ['DEEP WORK', 'CRYPTO NEWS'], 'and adds nothing');

  store.removeTopic('DEEP WORK');
  assert.deepEqual(store.getState().customTopics, ['CRYPTO NEWS'], 'off the custom list');
  assert.deepEqual(
    store.rulesFor(null).blocked,
    ['CRYPTO NEWS'],
    'and off the blocked list, so removing a topic actually stops filtering on it',
  );
  store.destroy();
});

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

test('compaction drops days past DAYS_KEPT and folds finished days, but never today', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());

  const usage = recordingAdapter();
  const settings = memoryAdapter();

  // Newest day first, so no pass prunes anything on the way: every compact()
  // here runs with `now` set to a day at or before everything already written.
  const a = createFeedStore({ settings, usage, shardId: 'tab-a' });
  await a.ready;
  const written: string[] = [];
  for (let i = 0; i < 40; i++) {
    const at = NOON - i * DAY_MS;
    a.addSeconds('youtube', 60, false, at);
    written.push(dayKey(at));
  }
  const distinct = Array.from(new Set(written));

  // Control for the deletion assertion at the end: forty days really are in
  // there right now, so "nine of them are gone" is compaction rather than
  // forty writes that never landed.
  assert.equal(distinct.length, 40, 'forty distinct local day keys');
  assert.deepEqual(
    Object.keys(a.getUsage().days).sort(),
    distinct.slice().sort(),
    'and every one of them is stored before anything compacts',
  );

  mock.timers.tick(USAGE_SETTLED_MS);

  // A second writer, so two days end up holding two shards each: one finished
  // day and today.
  const b = createFeedStore({ settings, usage, shardId: 'tab-b' });
  await b.ready;
  b.addSeconds('youtube', 30, false, NOON - 5 * DAY_MS);
  b.addSeconds('youtube', 30, false, NOON);
  mock.timers.tick(USAGE_SETTLED_MS);

  const stored = await usage.get<FeedUsage>(FEED_USAGE_KEY);
  assert.ok(stored, 'the usage debounce flushed');

  const today = dayKey(NOON);
  const past = dayKey(NOON - 5 * DAY_MS);
  const cutoff = dayKey(NOON - DAYS_KEPT * DAY_MS);

  // Control, and it has to run before the fold assertion: this instrument can
  // see a day holding more than one shard. Today is left alone deliberately,
  // because folding a day other tabs are still writing to would collapse their
  // keys into one and reintroduce the race sharding exists to remove.
  assert.deepEqual(Object.keys(stored.days[today]).sort(), ['tab-a', 'tab-b'], "today's shards are untouched");
  assert.equal(foldDay(stored.days[today]).sec.youtube, 90);

  // The absence: a finished day has been folded to one shard. Nobody can write
  // to it any more, so there is no race to lose.
  assert.deepEqual(Object.keys(stored.days[past]), ['-'], 'a finished day is folded to a single shard');
  assert.equal(foldDay(stored.days[past]).sec.youtube, 90, 'and folding added the shards rather than dropping one');

  const dropped = distinct.filter((day) => day < cutoff);
  assert.equal(dropped.length, 9, 'nine of the forty are past the retention window');
  assert.deepEqual(
    Object.keys(stored.days).sort(),
    distinct.filter((day) => day >= cutoff).sort(),
    'everything older than DAYS_KEPT is gone and everything inside it is kept',
  );

  a.destroy();
  b.destroy();
});

// ---------------------------------------------------------------------------
// Adopting another writer's payload
// ---------------------------------------------------------------------------

test('adoptState takes a payload at the current version and refuses one from another shape', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());

  const settings = recordingAdapter();
  const here = createFeedStore({ settings: memoryAdapter(), usage: memoryAdapter(), shardId: 'tab-a' });
  const elsewhere = createFeedStore({ settings, usage: memoryAdapter(), shardId: 'tab-b' });
  await here.ready;
  await elsewhere.ready;

  // Build the payload by driving the shipped writer, so what adoptState is
  // handed is exactly the blob chrome.storage.onChanged delivers in
  // content.ts, not a hand-written guess at its shape.
  elsewhere.setEnabled(false);
  elsewhere.setRule('global', 'hideShorts', true);
  mock.timers.tick(RULES_SETTLED_MS);
  const raw = await settings.get<FeedState>(FEED_SETTINGS_KEY);
  assert.ok(raw, 'the other writer flushed');
  assert.equal(raw.version, FEED_STATE_VERSION);

  // Control: a payload at the right version does change this store. Without
  // it, "the wrong version changed nothing" would also pass against an
  // adoptState that changed nothing ever.
  assert.equal(here.getState().enabled, true, 'starting point');
  assert.equal(here.rulesFor(null).hideShorts, false);
  here.adoptState(raw);
  assert.equal(here.getState().enabled, false, 'the other writer switched it off');
  assert.equal(here.rulesFor(null).hideShorts, true);

  // The absence: a payload from a shape this build cannot read is ignored, and
  // ignoring it means leaving what is there. Reading it wrong, or wiping to
  // defaults, would cost somebody the rules they set up.
  const fromTheFuture = {
    ...raw,
    version: FEED_STATE_VERSION + 1,
    enabled: true,
    global: { ...raw.global, hideShorts: false },
  };
  here.adoptState(fromTheFuture);
  assert.equal(here.getState().enabled, false, 'still off');
  assert.equal(here.rulesFor(null).hideShorts, true, 'and the rules are intact rather than reset');

  here.adoptState({ ...raw, version: undefined });
  here.adoptState(null);
  here.adoptState('not a payload');
  assert.equal(here.getState().enabled, false, 'nonsense under the key is refused the same way');
  assert.equal(here.rulesFor(null).hideShorts, true);

  here.destroy();
  elsewhere.destroy();
});
