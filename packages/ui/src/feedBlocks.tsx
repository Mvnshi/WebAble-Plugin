/**
 * The feed guard's panel surface: what gets through, what does not, how long
 * you have left, and what it has done so far.
 *
 * Extension only, and reached from extensionBlocks.tsx so the widget build
 * resolves the whole thing to a stub. That is not tidiness, it is the budget:
 * the widget's bundle is gated at 65 KB gzipped and was measured with 13 bytes
 * of headroom at the commit that added the engine side of this. Every string
 * below would come out of that.
 *
 * Strings are inline English rather than i18n keys, matching powerTools.tsx.
 * A hundred keys registered from an extension-only module buys indirection and
 * no translation, since nothing translates them yet.
 *
 * The block talks to the store through window.__WEBABLE_EXT__, the same bridge
 * the account block uses, for the same reason: the panel is rendered by code
 * the widget shares, so an extension-only capability cannot arrive as a prop.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import {
  BLOCK_QUICK_PICKS,
  CATEGORIES,
  FOCUS_QUICK_PICKS,
  PLATFORMS,
  PLATFORM_LABELS,
  categoryLabel,
  focusScore,
  hasOverride,
  humanDuration,
  rankFor,
  type FeedRules,
  type FeedStore,
  type PlatformId,
  type ScopeId,
} from '@webable/core/feeds';
import { Icon } from './icons';

/** What content.ts puts on the bridge for this block. See its __WEBABLE_EXT__. */
export interface FeedBridge {
  store: FeedStore;
  /** The platform this page is, when it is one of the four. */
  here: PlatformId | null;
  /** Re-scan the page after a rules change. Absent off-platform. */
  refresh?: () => void;
}

interface ExtWithFeeds {
  feeds?: () => FeedBridge | null;
}

function bridge(): FeedBridge | null {
  try {
    const ext = (window as unknown as { __WEBABLE_EXT__?: ExtWithFeeds }).__WEBABLE_EXT__;
    return ext?.feeds?.() || null;
  } catch {
    return null;
  }
}

/**
 * Re-render on every store change, and on a one-second beat while a clock is
 * on screen.
 *
 * The beat is deliberate and bounded: a daily limit and a running session both
 * count down, and a countdown that only moves when something else happens is a
 * stopped clock. It ticks only while the panel is mounted, which is only while
 * it is open.
 */
function useFeeds(store: FeedStore, live: boolean): number {
  const [, bump] = useState(0);
  useEffect(() => store.subscribe(() => bump((n) => n + 1)), [store]);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => bump((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [live]);
  return Date.now();
}

const FEED_CSS = `
.wa-fd-scope { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.wa-fd-scope button {
  all: unset; cursor: pointer; padding: 5px 11px; border-radius: 999px; font-size: 12px; font-weight: 600;
  color: var(--text); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--hairline);
}
.wa-fd-scope button[aria-pressed='true'] { background: var(--accent); color: var(--on-accent); box-shadow: none; }
.wa-fd-scope button:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
.wa-fd-here { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; opacity: .75; }
.wa-fd-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.wa-fd-stat { padding: 10px 12px; border-radius: 10px; background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--hairline); }
.wa-fd-stat b { display: block; font-size: 21px; line-height: 1.15; color: var(--ink); font-variant-numeric: tabular-nums; }
.wa-fd-stat span { display: block; font-size: 11.5px; color: var(--text); margin-top: 2px; }
.wa-fd-stat i { display: block; font-size: 10.5px; color: var(--mute); font-style: normal; margin-top: 1px; }
.wa-fd-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.wa-fd-chips button {
  all: unset; cursor: pointer; padding: 5px 10px; border-radius: 8px; font-size: 12px;
  color: var(--text); background: var(--surface-2); box-shadow: inset 0 0 0 1px var(--hairline);
}
.wa-fd-chips button[aria-pressed='true'] { color: var(--on-accent); background: var(--accent); box-shadow: none; }
.wa-fd-chips button:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
.wa-fd-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--hairline); }
.wa-fd-row:last-child { border-bottom: 0; }
.wa-fd-row .wa-fd-tx { flex: 1; min-width: 0; }
.wa-fd-row .wa-fd-name { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.wa-fd-row .wa-fd-sub { font-size: 11px; color: var(--mute); line-height: 1.35; }
.wa-fd-meter { height: 6px; border-radius: 999px; background: var(--surface-3); overflow: hidden; margin-top: 8px; }
.wa-fd-meter > i { display: block; height: 100%; background: var(--accent); }
.wa-fd-meter[data-over='true'] > i { background: #d9480f; }
.wa-fd-inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 9px; }
.wa-fd-inline select, .wa-fd-inline input { flex: 1; min-width: 120px; }
.wa-fd-log { list-style: none; margin: 8px 0 0; padding: 0; max-height: 168px; overflow-y: auto; }
.wa-fd-log li { display: flex; gap: 8px; align-items: baseline; padding: 5px 0; border-bottom: 1px solid var(--hairline); font-size: 11.5px; }
.wa-fd-log li:last-child { border-bottom: 0; }
.wa-fd-log .wa-fd-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.wa-fd-log .wa-fd-when { margin-left: auto; color: var(--mute); font-size: 10.5px; white-space: nowrap; }
.wa-fd-score { display: flex; align-items: baseline; gap: 8px; margin-top: 10px; }
.wa-fd-score b { font-size: 19px; color: var(--ink); font-variant-numeric: tabular-nums; }
.wa-fd-score span { font-size: 11.5px; color: var(--mute); }
`;

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      class="wa-switch"
      role="switch"
      aria-checked={on ? 'true' : 'false'}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  );
}

function Toggle({
  name,
  sub,
  on,
  onChange,
}: {
  name: string;
  sub: string;
  on: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <div class="wa-fd-row">
      <div class="wa-fd-tx">
        <div class="wa-fd-name">{name}</div>
        <div class="wa-fd-sub">{sub}</div>
      </div>
      <Switch on={on} onChange={onChange} label={name} />
    </div>
  );
}

function Chips({
  ids,
  selected,
  onToggle,
  describe,
}: {
  ids: readonly string[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  describe: (id: string) => string;
}): JSX.Element {
  return (
    <div class="wa-fd-chips">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          aria-pressed={selected.includes(id) ? 'true' : 'false'}
          onClick={() => onToggle(id)}
        >
          {describe(id)}
        </button>
      ))}
    </div>
  );
}

/** "2m ago", "just now". Short enough for a log row that repeats. */
function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

const SESSION_LENGTHS = [10, 20, 30, 45, 60, 90, 120, 0];
const LIMIT_LENGTHS = [0, 15, 30, 45, 60, 90, 120, 180];

/**
 * The nine filters, in the order a person reads them: the widest first, then
 * the ones that take a region away, then the two that change where the site
 * sends you.
 */
const FILTERS: Array<{ key: keyof FeedRules; name: string; sub: string }> = [
  { key: 'deepWork', name: 'Deep work mode', sub: 'Only learning, work and finance.' },
  { key: 'hideShorts', name: 'Hide short-form videos', sub: 'Shorts, Reels, and the TikTok feed.' },
  { key: 'hideClickbait', name: 'Hide clickbait', sub: 'Titles built to hijack attention rather than describe.' },
  { key: 'hideSponsored', name: 'Block sponsored posts', sub: 'Hide sponsored and promoted items.' },
  { key: 'hideComments', name: 'Hide comments', sub: 'A comment section is a second feed under the first.' },
  { key: 'hideSidebar', name: 'Hide sidebar', sub: 'The left nav and the up-next rail.' },
  { key: 'hideLive', name: 'Hide live videos', sub: 'Removes live streams from the feed.' },
  { key: 'followingOnly', name: 'Following only', sub: 'Sends you to the people you chose, not the algorithm.' },
  { key: 'hideMessages', name: 'Hide messages', sub: 'Removes the inbox so a DM cannot pull you in.' },
];

export function FeedsBlock(): JSX.Element | null {
  const found = bridge();
  const [scope, setScope] = useState<ScopeId>('global');
  const [showAllCats, setShowAllCats] = useState(false);
  const [topic, setTopic] = useState('');
  const store = found?.store || null;
  const here = found?.here || null;

  // Land on the platform the person is looking at. Only once, so switching to
  // Global does not get undone by the next re-render.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (landed || !here) return;
    setLanded(true);
    setScope(here);
  }, [here, landed]);

  const state = store?.getState() || null;
  const session = store && state ? store.activeSession(Date.now()) : null;
  const limitLive = scope !== 'global' && store ? store.limitFor(scope, Date.now()).limit > 0 : false;
  const now = useFeeds(
    store || ({ subscribe: () => () => undefined } as unknown as FeedStore),
    !!session || limitLive,
  );

  if (!store || !state) return null;

  const platform: PlatformId | null = scope === 'global' ? null : scope;
  const rules = store.rulesFor(platform);
  const stats = store.stats(now);
  const score = focusScore(rules, !!session);
  const rank = rankFor(stats.points);
  const usage = store.getUsage();
  const set = <K extends keyof FeedRules>(key: K, value: FeedRules[K]) => {
    store.setRule(scope, key, value);
    found?.refresh?.();
  };

  const catIds = showAllCats ? CATEGORIES.map((c) => c.id) : FOCUS_QUICK_PICKS;

  return (
    <div class="wa-panel-block">
      <style>{FEED_CSS}</style>

      <div class="wa-card-main" style="padding:0">
        <span class="wa-card-ic" data-on={state.enabled ? 'true' : 'false'}>
          <Icon name="declutter" size={18} />
        </span>
        <div class="wa-card-tx">
          <div class="wa-card-name">Feed guard</div>
          <div class="wa-card-desc">
            Sorts YouTube, TikTok, Instagram and X into categories and hides what you did not ask for.
          </div>
        </div>
        <Switch on={state.enabled} onChange={(v) => store.setEnabled(v)} label="Feed guard" />
      </div>

      {/* Scope. Global is the base and each platform layers over it, so a rule
          set here on YouTube does not silently move TikTok too. */}
      <div class="wa-eyebrow" role="heading" aria-level={2}>
        Where these rules apply
      </div>
      <div class="wa-fd-scope" role="group" aria-label="Which platform these rules apply to">
        <button type="button" aria-pressed={scope === 'global' ? 'true' : 'false'} onClick={() => setScope('global')}>
          Everywhere
        </button>
        {PLATFORMS.map((p) => (
          <button key={p} type="button" aria-pressed={scope === p ? 'true' : 'false'} onClick={() => setScope(p)}>
            {PLATFORM_LABELS[p]} {here === p && <span class="wa-fd-here">here</span>}
          </button>
        ))}
      </div>
      {platform && hasOverride(state, platform) && (
        <div class="wa-fd-inline">
          <span class="wa-fd-sub" style="flex:1">
            {PLATFORM_LABELS[platform]} is overriding your everywhere rules.
          </span>
          <button class="wa-btn wa-btn-ghost" onClick={() => store.clearOverride(platform)}>
            Reset to everywhere
          </button>
        </div>
      )}

      {/* Stats. The saved figure is an estimate and says so on the card, not in
          a tooltip: a number nobody can derive should not look measured. */}
      <div class="wa-eyebrow" role="heading" aria-level={2}>
        This week
      </div>
      <div class="wa-fd-stats">
        <div class="wa-fd-stat">
          <b>{stats.filteredWeek}</b>
          <span>Filtered</span>
          <i>items in the last 7 days</i>
        </div>
        <div class="wa-fd-stat">
          <b>{humanDuration(stats.savedWeekSeconds)}</b>
          <span>Time saved</span>
          <i>estimate, 30s per item</i>
        </div>
      </div>
      <div class="wa-fd-score">
        <b>{score.score}%</b>
        <span>
          focus score, from {score.parts.filter((p) => p.on).length} of {score.parts.length} protections
        </span>
      </div>
      <p class="wa-scope-hint">
        {rank.rank.label} rank, {stats.points} points
        {rank.next ? `, ${rank.toNext} to ${rank.next.label}` : ', the top rank'}. {stats.streak} day
        {stats.streak === 1 ? '' : 's'} in a row.
      </p>

      {/* Focus mode. An allowlist is strict by nature and the hint says so
          rather than leaving somebody to discover that an unrecognised card
          counts as not picked. */}
      <div class="wa-eyebrow" role="heading" aria-level={2}>
        Focus mode
      </div>
      <p class="wa-scope-state">
        Show only the types you pick. Everything else is hidden.{' '}
        {rules.focus.length ? `${rules.focus.length} picked.` : 'Nothing picked, so everything is allowed.'}
      </p>
      <Chips
        ids={catIds}
        selected={rules.focus}
        onToggle={(id) => {
          store.toggleCategory(scope, 'focus', id);
          found?.refresh?.();
        }}
        describe={categoryLabel}
      />
      <div class="wa-fd-inline">
        <button class="wa-btn wa-btn-ghost" onClick={() => setShowAllCats((v) => !v)}>
          {showAllCats ? 'Show the common ones' : `All ${CATEGORIES.length} categories`}
        </button>
        {rules.focus.length > 0 && (
          <button
            class="wa-btn wa-btn-ghost"
            onClick={() => {
              set('focus', []);
            }}
          >
            Clear picks
          </button>
        )}
      </div>
      {rules.focus.length > 0 && (
        <p class="wa-scope-hint">
          A card the on-device sort cannot place counts as not picked, so an allowlist hides more than a blocklist
          would. The chip at the bottom left of the page says how many, and gives them back.
        </p>
      )}

      {/* Session. */}
      <div class="wa-eyebrow" role="heading" aria-level={2}>
        Focus session
      </div>
      {session ? (
        <>
          <p class="wa-scope-state">
            {session.until
              ? `${humanDuration(Math.max(0, (session.until - now) / 1000))} left`
              : 'Running until you stop it'}
            {session.categories.length ? `, narrowed to ${session.categories.map(categoryLabel).join(', ')}.` : '.'}
          </p>
          <div class="wa-fd-inline">
            <button class="wa-btn wa-btn-primary" onClick={() => store.stopSession()}>
              Stop the session
            </button>
          </div>
        </>
      ) : (
        <>
          <p class="wa-scope-state">
            Runs on everything you already allow. Pick categories above first to narrow it.
          </p>
          <div class="wa-fd-inline">
            <label class="wa-ctl-label" for="wa-fd-session">
              Length
            </label>
            <select
              id="wa-fd-session"
              class="wa-input"
              onChange={(e) => {
                const minutes = Number((e.target as HTMLSelectElement).value);
                store.startSession(minutes, rules.focus, Date.now());
                found?.refresh?.();
              }}
            >
              <option value="">Start a session</option>
              {SESSION_LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m ? `${m} min` : 'Until I stop it'}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Block topics. Always global: "no matter which platform you are on" is
          the whole promise, and a per-platform blocklist would not keep it. */}
      <div class="wa-eyebrow" role="heading" aria-level={2}>
        Block topics
      </div>
      <p class="wa-scope-state">
        Always hide these, whichever platform you are on.{' '}
        {rules.blocked.length ? `${rules.blocked.length} blocked.` : 'None blocked.'}
      </p>
      <Chips
        ids={[...BLOCK_QUICK_PICKS, ...state.customTopics]}
        selected={rules.blocked}
        onToggle={(id) => {
          store.toggleCategory(scope, 'blocked', id);
          found?.refresh?.();
        }}
        describe={categoryLabel}
      />
      <div class="wa-fd-inline">
        <label class="wa-ctl-label" for="wa-fd-topic" style="position:absolute;left:-9999px">
          Add a topic to block
        </label>
        <input
          id="wa-fd-topic"
          class="wa-input"
          type="text"
          placeholder="Add your own, for example Crypto"
          value={topic}
          onInput={(e) => setTopic((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            store.addTopic(topic);
            setTopic('');
            found?.refresh?.();
          }}
        />
        <button
          class="wa-btn wa-btn-ghost"
          onClick={() => {
            store.addTopic(topic);
            setTopic('');
            found?.refresh?.();
          }}
        >
          Add
        </button>
      </div>
      {state.customTopics.length > 0 && (
        <div class="wa-fd-inline">
          {state.customTopics.map((id) => (
            <button key={id} class="wa-btn wa-btn-ghost" onClick={() => store.removeTopic(id)}>
              Forget {categoryLabel(id)}
            </button>
          ))}
        </div>
      )}

      {/* Daily limit. Per platform only: "minutes online" summed across four
          sites is not a number anybody would set, and hitting it would cover a
          site the person had not spent the time on. */}
      <div class="wa-eyebrow" role="heading" aria-level={2}>
        Daily limit
      </div>
      {platform ? (
        <>
          <div class="wa-fd-inline">
            <label class="wa-ctl-label" for="wa-fd-limit">
              Minutes on {PLATFORM_LABELS[platform]} per day
            </label>
            <select
              id="wa-fd-limit"
              class="wa-input"
              value={String(rules.dailyLimit)}
              onChange={(e) => set('dailyLimit', Number((e.target as HTMLSelectElement).value))}
            >
              {LIMIT_LENGTHS.map((m) => (
                <option key={m} value={m}>
                  {m ? `${m} min` : 'No limit'}
                </option>
              ))}
            </select>
          </div>
          {rules.dailyLimit > 0 &&
            (() => {
              const limit = store.limitFor(platform, now);
              const pct = Math.min(100, Math.round((limit.used / (limit.limit * 60)) * 100));
              return (
                <>
                  <p class="wa-scope-state" style="margin-top:10px">
                    {limit.over ? 'Spent for today.' : `${humanDuration(limit.left)} left.`} Used{' '}
                    {humanDuration(limit.used)} of {limit.limit}m today.
                  </p>
                  <div
                    class="wa-fd-meter"
                    data-over={limit.over ? 'true' : 'false'}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${PLATFORM_LABELS[platform]} daily limit used`}
                  >
                    <i style={`width:${pct}%`} />
                  </div>
                  <p class="wa-scope-hint">
                    Counts only while the tab is visible and focused, so a window left open behind your editor does not
                    spend it.
                  </p>
                </>
              );
            })()}
        </>
      ) : (
        <p class="wa-scope-state">Pick a platform above to set its limit. A limit is per site, not a total.</p>
      )}

      {/* Filters. */}
      <div class="wa-eyebrow" role="heading" aria-level={2}>
        Filters
      </div>
      {FILTERS.map((f) => (
        <Toggle
          key={f.key}
          name={f.name}
          sub={f.sub}
          on={!!rules[f.key]}
          onChange={(v) => set(f.key, v as FeedRules[typeof f.key])}
        />
      ))}

      {/* How a hidden card is handled, and what a shown one is labelled with. */}
      <div class="wa-eyebrow" role="heading" aria-level={2}>
        How hiding looks
      </div>
      <div class="wa-fd-inline">
        <label class="wa-ctl-label" for="wa-fd-clean">
          Hidden items
        </label>
        <select
          id="wa-fd-clean"
          class="wa-input"
          value={rules.cleanScroll}
          onChange={(e) => set('cleanScroll', (e.target as HTMLSelectElement).value as FeedRules['cleanScroll'])}
        >
          <option value="remove">Take out of the page</option>
          <option value="blur">Blur, keep the layout</option>
        </select>
      </div>
      <Toggle
        name="Show the category"
        sub="A badge on each card saying what the sort decided."
        on={rules.showLabel}
        onChange={(v) => set('showLabel', v)}
      />
      <Toggle
        name="Show confirm and correct"
        sub="The check and cross on the badge. Needs the badge on."
        on={rules.showConfirm}
        onChange={(v) => set('showConfirm', v)}
      />
      <Toggle
        name="Show a traffic light"
        sub="A green, amber or red dot instead of reading the category."
        on={rules.showDot}
        onChange={(v) => set('showDot', v)}
      />

      {/* The two switches that need saying out loud. */}
      <div class="wa-eyebrow" role="heading" aria-level={2}>
        Stronger measures
      </div>
      <Toggle
        name="AI assist"
        sub="Sends the title and channel of cards the on-device sort could not place, and nothing else."
        on={rules.aiAssist}
        onChange={(v) => set('aiAssist', v)}
      />
      <Toggle
        name={`Cover ${platform ? PLATFORM_LABELS[platform] : 'the platform'} entirely`}
        sub="Stops filtering and covers the site instead. The toolbar button lifts it."
        on={rules.blockSite}
        onChange={(v) => set('blockSite', v)}
      />
      {Object.keys(state.corrections).length > 0 && (
        <div class="wa-fd-inline">
          <span class="wa-fd-sub" style="flex:1">
            {Object.keys(state.corrections).length} corrections, kept on this device only.
          </span>
          <button class="wa-btn wa-btn-ghost" onClick={() => store.forgetCorrections()}>
            Forget them
          </button>
        </div>
      )}

      {/* The log. One row per batch, not per card: a row per card on an
          infinite feed is the feed again. */}
      <div class="wa-eyebrow" role="heading" aria-level={2}>
        What it has done
      </div>
      {usage.log.length === 0 ? (
        <p class="wa-empty">Nothing filtered yet. Open a feed and scroll.</p>
      ) : (
        <>
          <ul class="wa-fd-log">
            {usage.log.slice(0, 12).map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span
                  class="wa-fd-dot"
                  style={`background:${e.kind === 'passed' ? '#22c55e' : e.kind === 'limit' ? '#f59e0b' : '#ef4444'}`}
                  aria-hidden="true"
                />
                <span>
                  {e.kind === 'limit'
                    ? 'Daily limit reached'
                    : `${categoryLabel(e.category)} on ${PLATFORM_LABELS[e.platform]}`}
                  {e.title ? `: ${e.title}` : ''}
                </span>
                <span class="wa-fd-when">{ago(e.at, now)}</span>
              </li>
            ))}
          </ul>
          <div class="wa-fd-inline">
            <button class="wa-btn wa-btn-ghost" onClick={() => store.clearLog()}>
              Clear the log
            </button>
          </div>
        </>
      )}
    </div>
  );
}
