/**
 * The numbers the panel puts on screen: focus score, focus points, rank,
 * streak, and the estimate of time saved.
 *
 * Pure functions over a rules object and a usage blob, so every number here is
 * testable without a browser and none of them can drift from what the switches
 * actually say.
 *
 * One of these is an estimate rather than a measurement, and it is labelled as
 * one everywhere it appears. See SECONDS_PER_HIDDEN_ITEM.
 */
import type { FeedRules, FeedUsage, PlatformId } from './settings';
import { PLATFORMS, dayKey, foldDay } from './settings';

/**
 * What one hidden card is worth in seconds "saved".
 *
 * This is an assumption, not a measurement. Nobody can know whether a card the
 * user never saw would have cost them thirty seconds or twenty minutes, and a
 * product that reports a number it cannot derive is lying with arithmetic. So
 * the constant is stated here, the UI says "estimate" next to every figure
 * built from it, and the docs repeat it. Thirty seconds is the length of a
 * short watched to the end, which is the cheapest defensible unit.
 */
export const SECONDS_PER_HIDDEN_ITEM = 30;

export interface ScorePart {
  id: string;
  label: string;
  points: number;
  on: boolean;
  /** Why it is worth what it is worth, shown in the panel. */
  why: string;
}

/**
 * The focus score is a live read of which protections are on right now, not a
 * history. Turning something on moves it immediately, which is the only
 * behaviour that makes the number mean anything to the person watching it.
 *
 * The weights are deliberately fixed and published rather than tuned, so the
 * number is reproducible from the switches alone.
 */
export function focusScore(
  rules: FeedRules,
  sessionActive: boolean,
): { score: number; parts: ScorePart[] } {
  const parts: ScorePart[] = [
    {
      id: 'deepWork',
      label: 'Deep work mode',
      points: 25,
      on: rules.deepWork,
      why: 'Narrows the whole feed to learning, work and finance.',
    },
    {
      id: 'session',
      label: 'Focus session running',
      points: 20,
      on: sessionActive,
      why: 'A running timer holds the feed to one goal for a set stretch.',
    },
    {
      id: 'hideShorts',
      label: 'Short-form hidden',
      points: 15,
      on: rules.hideShorts,
      why: 'Short-form is the most algorithm-driven surface on every platform.',
    },
    {
      id: 'hideClickbait',
      label: 'Clickbait hidden',
      points: 12,
      on: rules.hideClickbait,
      why: 'Titles built to hijack attention rather than describe a video.',
    },
    {
      id: 'hideSidebar',
      label: 'Sidebar hidden',
      points: 10,
      on: rules.hideSidebar,
      why: 'The up-next rail is what turns one video into an evening.',
    },
    {
      id: 'hideComments',
      label: 'Comments hidden',
      points: 10,
      on: rules.hideComments,
      why: 'A comment section is a second feed under the first one.',
    },
    {
      id: 'hideSponsored',
      label: 'Sponsored hidden',
      points: 8,
      on: rules.hideSponsored,
      why: 'Promoted posts are the part of the feed nobody asked for.',
    },
  ];
  const score = Math.min(
    100,
    parts.reduce((n, p) => n + (p.on ? p.points : 0), 0),
  );
  return { score, parts };
}

export interface Rank {
  id: string;
  label: string;
  at: number;
  blurb: string;
}

/**
 * Ranks are lifetime and only ever go up, so they measure use rather than
 * attendance. A streak measures attendance and is reported separately, because
 * conflating the two is how a focus product turns into a login habit.
 */
export const RANKS: readonly Rank[] = [
  { id: 'bronze', label: 'Bronze', at: 0, blurb: 'Where every browser starts.' },
  { id: 'silver', label: 'Silver', at: 500, blurb: 'A week or two of real filtering.' },
  { id: 'gold', label: 'Gold', at: 2000, blurb: 'Consistent use over several weeks.' },
  { id: 'platinum', label: 'Platinum', at: 6000, blurb: 'Committed use over a month or more.' },
  { id: 'diamond', label: 'Diamond', at: 15000, blurb: 'Sustained, heavy use over the long run.' },
];

export function rankFor(points: number): { rank: Rank; next: Rank | null; toNext: number } {
  let rank = RANKS[0];
  for (const r of RANKS) if (points >= r.at) rank = r;
  const next = RANKS.find((r) => r.at > points) || null;
  return { rank, next, toNext: next ? next.at - points : 0 };
}

export interface DaySeries {
  day: string;
  hidden: number;
  seconds: number;
}

export interface FeedStats {
  filteredToday: number;
  filteredWeek: number;
  filteredWeekBy: Partial<Record<PlatformId, number>>;
  /** Estimated. See SECONDS_PER_HIDDEN_ITEM. */
  savedTodaySeconds: number;
  savedWeekSeconds: number;
  secondsToday: Partial<Record<PlatformId, number>>;
  points: number;
  streak: number;
  activeDays: number;
  /** Oldest first, one entry per day kept, for the activity strip. */
  series: DaySeries[];
}

/** The day keys for the last `n` days ending today, oldest first. */
export function recentDays(now: number, n: number): string[] {
  const out: string[] = [];
  const day = 86400000;
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(now - i * day));
  return out;
}

/**
 * Points, exactly as the panel explains them: one per item filtered, two per
 * minute of deep work, twenty per day the guard actually did something. Kept
 * as one function so the explanation and the arithmetic cannot drift.
 */
export function pointsFrom(usage: FeedUsage): number {
  let hidden = 0;
  let deepSeconds = 0;
  let activeDays = 0;
  for (const day of Object.values(usage.days || {})) {
    const folded = foldDay(day);
    let dayHidden = 0;
    for (const p of PLATFORMS) dayHidden += folded.hid[p] || 0;
    hidden += dayHidden;
    deepSeconds += folded.deep;
    let secs = 0;
    for (const p of PLATFORMS) secs += folded.sec[p] || 0;
    if (dayHidden > 0 || secs > 0) activeDays += 1;
  }
  return hidden + Math.floor(deepSeconds / 60) * 2 + activeDays * 20;
}

export function statsFrom(usage: FeedUsage, now: number): FeedStats {
  const days = usage.days || {};
  const today = dayKey(now);
  const week = recentDays(now, 7);
  const kept = Object.keys(days).sort();

  const series: DaySeries[] = kept.map((day) => {
    const folded = foldDay(days[day]);
    let hidden = 0;
    let seconds = 0;
    for (const p of PLATFORMS) {
      hidden += folded.hid[p] || 0;
      seconds += folded.sec[p] || 0;
    }
    return { day, hidden, seconds };
  });

  const todayFold = foldDay(days[today]);
  let filteredToday = 0;
  for (const p of PLATFORMS) filteredToday += todayFold.hid[p] || 0;

  let filteredWeek = 0;
  const filteredWeekBy: Partial<Record<PlatformId, number>> = {};
  for (const day of week) {
    const folded = foldDay(days[day]);
    for (const p of PLATFORMS) {
      const n = folded.hid[p] || 0;
      if (!n) continue;
      filteredWeek += n;
      filteredWeekBy[p] = (filteredWeekBy[p] || 0) + n;
    }
  }

  // A streak counts back from today, and tolerates today being empty so far:
  // at 09:00 nobody has filtered anything yet and reporting the streak as
  // broken would be both wrong and discouraging.
  let streak = 0;
  const dayMs = 86400000;
  for (let i = 0; i < Object.keys(days).length + 2; i++) {
    const key = dayKey(now - i * dayMs);
    const folded = foldDay(days[key]);
    let active = folded.deep > 0;
    for (const p of PLATFORMS) active = active || !!folded.hid[p] || !!folded.sec[p];
    if (active) streak += 1;
    else if (i > 0) break;
  }

  return {
    filteredToday,
    filteredWeek,
    filteredWeekBy,
    savedTodaySeconds: filteredToday * SECONDS_PER_HIDDEN_ITEM,
    savedWeekSeconds: filteredWeek * SECONDS_PER_HIDDEN_ITEM,
    secondsToday: todayFold.sec,
    points: pointsFrom(usage),
    streak,
    activeDays: series.filter((d) => d.hidden > 0 || d.seconds > 0).length,
    series,
  };
}

/** "1h 24m", "38m", "45s". Short enough for a stat card. */
export function humanDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}
