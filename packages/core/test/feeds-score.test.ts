/**
 * The rule: every number the feed panel puts on screen is derived from the
 * switches and the counters by the exact formula the panel prints next to it,
 * and the "time saved" figure is exactly the filtered count times one stated
 * constant.
 *
 * Why it exists: these are the numbers the product uses to tell somebody they
 * are doing well, and score.ts says in its own header that a product reporting
 * a number it cannot derive is lying with arithmetic. Three specific ways that
 * happens quietly:
 *
 *   - The focus score's weights are published in the panel, and they add to
 *     exactly 100. Swap two of them and the total is still 100, so a test that
 *     only checks the total passes while the panel explains the wrong number to
 *     the person reading it. Wire a part to the wrong rule and the total is
 *     still right too, which is why each weight is turned on alone below.
 *   - savedWeekSeconds is an estimate on a stated basis. If the basis moves,
 *     every "you saved 2 hours" in the UI changes meaning with nothing in the
 *     product saying so, which is precisely the overclaim the extension's
 *     marketing tests exist to prevent.
 *   - The week window and the streak are off-by-one shaped. An eighth day
 *     leaking into "this week" inflates the headline number, and a streak that
 *     breaks because it is 09:00 and nobody has filtered anything yet tells a
 *     person they lost something they did not lose.
 *
 * Everything here is pure. There is no storage double and no DOM: the usage
 * blobs are the shipped FeedUsage shape built by hand, and their day keys come
 * from the shipped dayKey rather than from hardcoded strings, because a literal
 * would pass or fail by the runner's timezone. `now` is always pinned and
 * passed in, never read from the clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  focusScore,
  humanDuration,
  pointsFrom,
  rankFor,
  recentDays,
  statsFrom,
  RANKS,
  SECONDS_PER_HIDDEN_ITEM,
} from '../src/feeds/score';
import {
  DEFAULT_RULES,
  dayKey,
  defaultUsage,
  type DayShard,
  type FeedRules,
  type FeedUsage,
} from '../src/feeds/settings';

/**
 * Pinned, and built in local time on purpose: dayKey is a local calendar day,
 * so a UTC literal would land on the previous day west of Greenwich. Midday
 * keeps every day arithmetic below an hour clear of a DST shift.
 */
const NOW = new Date(2026, 1, 15, 12, 0, 0).getTime();
const DAY_MS = 86400000;

/** The day key n days before NOW, computed the way recentDays computes it. */
const dayBack = (n: number): string => dayKey(NOW - n * DAY_MS);

const shard = (parts: Partial<DayShard>): DayShard => ({ sec: {}, hid: {}, deep: 0, ...parts });
const usageWith = (days: FeedUsage['days']): FeedUsage => ({ ...defaultUsage(), days });

test('the focus score is the published weights, each one of them, wired to its own switch', () => {
  const allOn: FeedRules = {
    ...DEFAULT_RULES,
    deepWork: true,
    hideShorts: true,
    hideClickbait: true,
    hideSidebar: true,
    hideComments: true,
    hideSponsored: true,
  };
  const on = focusScore(allOn, true);
  assert.equal(on.score, 100, 'all seven protections is exactly 100');
  assert.equal(
    on.parts.reduce((n, p) => n + p.points, 0),
    100,
    'the weights add to 100 on their own, so Math.min is not hiding an overflow',
  );
  assert.deepEqual(on.parts.filter((p) => !p.on).map((p) => p.id), [], 'all seven really are on');

  const off = focusScore(DEFAULT_RULES, false);
  assert.equal(off.score, 0, 'nothing on is exactly 0');
  assert.deepEqual(off.parts.filter((p) => p.on).map((p) => p.id), [], 'and nothing is reported as on');

  // Each weight, alone. A total of 100 survives two weights being swapped and
  // survives a part reading the wrong rule; scoring one switch at a time does
  // not. The second assertion is what catches the miswiring: turning on
  // hideComments must not light up hideSidebar.
  const alone: ReadonlyArray<readonly [string, FeedRules, boolean, number]> = [
    ['deepWork', { ...DEFAULT_RULES, deepWork: true }, false, 25],
    ['session', DEFAULT_RULES, true, 20],
    ['hideShorts', { ...DEFAULT_RULES, hideShorts: true }, false, 15],
    ['hideClickbait', { ...DEFAULT_RULES, hideClickbait: true }, false, 12],
    ['hideSidebar', { ...DEFAULT_RULES, hideSidebar: true }, false, 10],
    ['hideComments', { ...DEFAULT_RULES, hideComments: true }, false, 10],
    ['hideSponsored', { ...DEFAULT_RULES, hideSponsored: true }, false, 8],
  ];
  assert.equal(alone.length, on.parts.length, 'every part the panel draws is pinned here');
  for (const [id, rules, session, points] of alone) {
    const result = focusScore(rules, session);
    assert.equal(result.score, points, `${id} alone should score ${points}`);
    assert.deepEqual(result.parts.filter((p) => p.on).map((p) => p.id), [id], `${id} lit up something else`);
    assert.equal(result.parts.find((p) => p.id === id)?.points, points, `${id} is worth ${points}`);
  }
});

test('points are one per hidden item, two per whole minute of deep work, twenty per active day', () => {
  const usage = usageWith({
    // Two shards on one day, because a day is summed across writers.
    [dayBack(0)]: {
      tabA: shard({ hid: { youtube: 3 }, sec: { youtube: 100 }, deep: 90 }),
      tabB: shard({ hid: { tiktok: 2 }, sec: { tiktok: 50 }, deep: 30 }),
    },
    [dayBack(1)]: { tabA: shard({ hid: { x: 1 } }) },
    // A day the guard was loaded and did nothing. Not an active day.
    [dayBack(2)]: { tabA: shard({}) },
  });

  // 6 hidden, 120 seconds of deep work, 2 active days.
  // 6 + (120 / 60) * 2 + 2 * 20 = 50.
  assert.equal(pointsFrom(usage), 50);

  // Control for the inactive day: it is genuinely in the blob (the series has
  // three entries) and it is genuinely not counted (activeDays is two), so the
  // 40 above is the rule and not a fixture that failed to plant a third day.
  const stats = statsFrom(usage, NOW);
  assert.equal(stats.series.length, 3, 'the empty day is in the blob');
  assert.equal(stats.activeDays, 2, 'and it does not count as a day the guard did something');

  // Whole minutes only: one second short of two minutes is worth one minute.
  const justUnder = usageWith({
    [dayBack(0)]: {
      tabA: shard({ hid: { youtube: 3 }, sec: { youtube: 100 }, deep: 89 }),
      tabB: shard({ hid: { tiktok: 2 }, sec: { tiktok: 50 }, deep: 30 }),
    },
    [dayBack(1)]: { tabA: shard({ hid: { x: 1 } }) },
    [dayBack(2)]: { tabA: shard({}) },
  });
  assert.equal(pointsFrom(justUnder), 48, '119 seconds of deep work is one minute, not two');
});

test('filtered this week holds the last seven days and not the eighth', () => {
  const usage = usageWith({
    [dayBack(6)]: { tabA: shard({ hid: { youtube: 4 } }) },
    [dayBack(8)]: { tabA: shard({ hid: { instagram: 7 } }) },
  });
  const stats = statsFrom(usage, NOW);

  // Control: the window reaches the far edge, and the instrument counts a hit
  // sitting on it. Without this, the exclusion below is indistinguishable from
  // a window that counts nothing at all.
  assert.ok(recentDays(NOW, 7).includes(dayBack(6)), 'day six back is inside the window');
  assert.equal(stats.filteredWeekBy.youtube, 4, 'and its four hidden cards are counted');

  // Control: the eighth day really is in the usage blob, so a zero below is the
  // window excluding it rather than the fixture never holding it.
  assert.deepEqual(
    stats.series.map((d) => [d.day, d.hidden]),
    [
      [dayBack(8), 7],
      [dayBack(6), 4],
    ],
    'both days are on record',
  );

  assert.ok(!recentDays(NOW, 7).includes(dayBack(8)), 'day eight back is outside the window');
  assert.equal(stats.filteredWeekBy.instagram, undefined, 'so its seven hidden cards are not in the week breakdown');
  assert.equal(stats.filteredWeek, 4, 'and not in the week total either');
});

test('the streak survives an empty today and breaks on an empty yesterday', () => {
  const morning = usageWith({
    [dayBack(1)]: { tabA: shard({ hid: { youtube: 1 } }) },
    [dayBack(2)]: { tabA: shard({ hid: { youtube: 1 } }) },
  });
  const early = statsFrom(morning, NOW);
  assert.equal(early.filteredToday, 0, 'nobody has filtered anything yet today');
  assert.equal(early.streak, 2, 'an empty today is 09:00, not a lost streak');

  const gap = usageWith({
    [dayBack(0)]: { tabA: shard({ hid: { youtube: 1 } }) },
    [dayBack(2)]: { tabA: shard({ hid: { youtube: 1 } }) },
  });
  const broken = statsFrom(gap, NOW);
  // Control: the day before yesterday is on record and active, so the count
  // stopping at one is the gap doing it rather than an empty blob.
  assert.equal(broken.activeDays, 2, 'two active days are in the blob');
  assert.equal(broken.streak, 1, 'but yesterday is empty, so the run ends at today');
});

test('rank thresholds are inclusive, and the top rank has nowhere to go', () => {
  // Control: next is not simply always null, and toNext is a real distance.
  const start = rankFor(0);
  assert.equal(start.rank.id, 'bronze');
  assert.equal(start.next?.id, 'silver');
  assert.equal(start.toNext, 500);

  assert.equal(rankFor(500).rank.id, 'silver', 'exactly at the threshold is the new rank');
  assert.equal(rankFor(499).rank.id, 'bronze', 'one short of it is not');
  assert.equal(rankFor(499).next?.id, 'silver');
  assert.equal(rankFor(499).toNext, 1);

  const top = RANKS[RANKS.length - 1];
  const capped = rankFor(top.at);
  assert.equal(capped.rank.id, top.id);
  assert.equal(capped.next, null, 'the top rank reports no next');
  assert.equal(capped.toNext, 0);
  // And it stays the top rank rather than falling off the end.
  assert.equal(rankFor(top.at * 2).rank.id, top.id);
  assert.equal(rankFor(top.at * 2).next, null);
});

test('humanDuration formats seconds, minutes and hours, and rounds rather than truncating', () => {
  assert.equal(humanDuration(45), '45s');
  assert.equal(humanDuration(59), '59s');
  assert.equal(humanDuration(60), '1m');
  // The pair that tells rounding from truncation: truncation says "1m" to both.
  assert.equal(humanDuration(89), '1m');
  assert.equal(humanDuration(91), '2m');
  assert.equal(humanDuration(29.6), '30s', 'fractional seconds round too');
  assert.equal(humanDuration(3600), '1h', 'a whole hour drops the minutes');
  assert.equal(humanDuration(5040), '1h 24m');
  assert.equal(humanDuration(0), '0s');
  assert.equal(humanDuration(-5), '0s', 'a negative is floored, not printed');
});

test('time saved is exactly the filtered count times the stated constant', () => {
  // Pinned as a literal. The two assertions after it hold the relationship, but
  // only this one stops the basis of every "you saved N minutes" in the UI from
  // moving without a failure.
  assert.equal(SECONDS_PER_HIDDEN_ITEM, 30);

  const usage = usageWith({
    [dayBack(0)]: { tabA: shard({ hid: { youtube: 2 } }) },
    [dayBack(3)]: { tabA: shard({ hid: { tiktok: 5 } }) },
  });
  const stats = statsFrom(usage, NOW);
  assert.equal(stats.filteredToday, 2);
  assert.equal(stats.filteredWeek, 7);
  assert.equal(stats.savedTodaySeconds, stats.filteredToday * SECONDS_PER_HIDDEN_ITEM);
  assert.equal(stats.savedWeekSeconds, stats.filteredWeek * SECONDS_PER_HIDDEN_ITEM);
  assert.equal(stats.savedWeekSeconds, 210, 'seven hidden cards is 210 seconds, on the stated basis');
});
