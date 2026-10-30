/**
 * Popup logic. Drives the active tab's in-page panel through the content
 * script's message protocol. The profile list comes from @webable/core, so the
 * popup, the panel, and the docs all show the same single source of truth.
 *
 * The feed section is the exception: it does not send messages at all. The
 * popup is a page of the extension, so it builds the feed store itself and
 * writes straight to chrome.storage, and content.ts's watchStorage() is what
 * carries the change into every open tab. Going through WEBABLE_* instead would
 * reach exactly one tab, which is the wrong shape for a rule that is not about
 * a tab.
 */
import { PROFILES, chromeStorageAdapter } from '@webable/core';
import {
  PLATFORM_LABELS,
  SCOPES,
  createFeedStore,
  focusScore,
  hasOverride,
  humanDuration,
  platformFor,
  type FeedRules,
  type PlatformId,
  type ScopeId,
} from '@webable/core/feeds';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

const $ = (id: string) => document.getElementById(id)!;

function withActiveTab(fn: (tabId: number) => void): void {
  // popup.html is also opened outside the extension runtime: a build check, a
  // dev page, a jsdom smoke test. There `chrome` is not an empty object, it is
  // undefined, and a bare `chrome.tabs` throws a ReferenceError out of module
  // scope that takes every line after it down with it, profile buttons
  // included. Degrading to "no tab to talk to" leaves a popup that still
  // renders.
  const api = typeof chrome !== 'undefined' ? chrome : undefined;
  if (!api?.tabs?.query) return;
  api.tabs.query({ active: true, currentWindow: true }, (tabs: Array<{ id?: number }>) => {
    const id = tabs[0]?.id;
    if (id != null) fn(id);
  });
}

function send(type: string, extra: Record<string, unknown> = {}, cb?: (r: unknown) => void): void {
  withActiveTab((id) => {
    try {
      // frameId 0: the content script runs in every frame, and an unaddressed
      // message goes to all of them. WEBABLE_GET_STATE would then be answered by
      // whichever frame replied first, so the tool count and the site name in
      // this popup could come from an ad iframe.
      chrome.tabs.sendMessage(id, { type, ...extra }, { frameId: 0 }, (res: unknown) => {
        void chrome.runtime.lastError; // swallow "no receiver" on chrome:// pages
        cb?.(res);
      });
    } catch {
      cb?.(undefined);
    }
  });
}

// Render profile buttons from the shared registry.
const grid = $('profiles');
let activeProfile: string | null = null;
function renderProfiles() {
  grid.innerHTML = '';
  for (const p of PROFILES) {
    const b = document.createElement('button');
    b.className = 'profile';
    b.setAttribute('aria-pressed', String(activeProfile === p.id));
    b.innerHTML = `<div class="profile-name"></div><div class="profile-desc"></div>`;
    (b.querySelector('.profile-name') as HTMLElement).textContent = p.label;
    (b.querySelector('.profile-desc') as HTMLElement).textContent = p.description;
    b.addEventListener('click', () => {
      send('WEBABLE_APPLY_PROFILE', { id: p.id });
      window.close();
    });
    grid.appendChild(b);
  }
}
renderProfiles();

/**
 * The off switch, and the only surface that is guaranteed to be reachable when
 * the tools are off.
 *
 * The panel cannot offer the way back, because on a site where WebAble is off
 * there is no panel. This popup is a page of the extension, so it opens on any
 * tab whatever the content script is doing, which is exactly what makes turning
 * it off a safe thing to do rather than a one-way door.
 */
let enabled = true;
function paint(host: string, count: number) {
  document.body.setAttribute('data-off', String(!enabled));
  $('power').textContent = enabled ? 'Turn off on this site' : `Turn on for ${host}`;
  $('status').textContent = !enabled
    ? `Off on ${host}`
    : count
      ? `${count} tool${count > 1 ? 's' : ''} active on this site`
      : 'No tools active on this site';
}

let host = 'this site';
let count = 0;

// Reflect current state from the active tab.
send('WEBABLE_GET_STATE', {}, (res) => {
  const r = res as
    | { activeProfile?: string | null; count?: number; host?: string; enabled?: boolean }
    | undefined;
  if (!r) {
    // No content script answered: a chrome:// page, the web store, a PDF
    // viewer. Nothing to turn on or off, so do not offer to.
    $('status').textContent = 'Open a regular web page to use the tools';
    $('power').setAttribute('hidden', '');
    return;
  }
  activeProfile = r.activeProfile ?? null;
  host = r.host || host;
  count = r.count || 0;
  // `enabled` is absent from a content script left over from an older build;
  // treat that as running, which is what it is.
  enabled = r.enabled !== false;
  renderProfiles();
  paint(host, count);
  adoptTabScope(r.host || '');
});

$('power').addEventListener('click', () => {
  const next = !enabled;
  send('WEBABLE_SET_ENABLED', { on: next }, () => {
    enabled = next;
    if (!next) count = 0;
    paint(host, count);
  });
});

$('open').addEventListener('click', () => {
  send('WEBABLE_OPEN');
  window.close();
});
$('reset').addEventListener('click', () => {
  send('WEBABLE_RESET');
  activeProfile = null;
  count = 0;
  renderProfiles();
  $('status').textContent = 'Reset on this site';
});
$('settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

/* Feed guard.
 *
 * The quick surface, and deliberately not the whole one. Six switches, the two
 * numbers worth glancing at, one limit and one timer. Anything that needs
 * reading rather than pressing stays in the panel, one button away at the foot
 * of this section.
 */

const store = createFeedStore({
  settings: chromeStorageAdapter('webable', 'sync'),
  usage: chromeStorageAdapter('webable', 'local'),
  // A fixed id, never a random one. A shard is a writer's own slot in the usage
  // blob, so a fresh id per open would leave one empty shard behind in storage
  // every single time somebody clicked the toolbar icon. The popup never
  // accrues browsing seconds, so its slot stays empty anyway; all it needs is a
  // name no tab can generate, and this is one.
  shardId: 'popup',
});

/** The six switches this surface offers, in the order they are shown. */
type QuickRule = 'deepWork' | 'hideShorts' | 'hideClickbait' | 'hideSponsored' | 'hideComments' | 'hideLive';

const QUICK: ReadonlyArray<{ key: QuickRule; label: string; desc: string }> = [
  { key: 'deepWork', label: 'Deep work mode', desc: 'Only learning, work and finance' },
  { key: 'hideShorts', label: 'Hide short-form videos', desc: 'Shorts, Reels and the TikTok feed' },
  { key: 'hideClickbait', label: 'Hide clickbait', desc: 'Titles built to hijack attention' },
  { key: 'hideSponsored', label: 'Block sponsored posts', desc: 'Hide sponsored and promoted items' },
  { key: 'hideComments', label: 'Hide comments', desc: 'A comment section is a second feed' },
  { key: 'hideLive', label: 'Hide live videos', desc: 'Removes live streams from the feed' },
];

const LIMIT_CHOICES = [0, 15, 30, 45, 60, 90, 120, 180];
// 0 is last because it is the odd one out: every other entry is a countdown and
// this one is "until I say so".
const SESSION_CHOICES = [10, 20, 30, 45, 60, 90, 120, 0];

let scope: ScopeId = 'global';
// Once the user has picked a tab, a late WEBABLE_GET_STATE must not move them
// off it. The reply can land after the popup is already being used.
let scopePicked = false;
let mounted = false;

const scopeButtons = new Map<ScopeId, HTMLButtonElement>();
const ruleButtons = new Map<QuickRule, HTMLButtonElement>();

/** 'global' is the absence of a platform everywhere in the core API. */
const platformOf = (id: ScopeId): PlatformId | null => (id === 'global' ? null : id);

/** Default the scope to the platform of the tab the popup was opened over. */
function adoptTabScope(siteKey: string): void {
  if (scopePicked || !siteKey) return;
  const adapter = platformFor(siteKey);
  if (!adapter) return;
  scope = adapter.id;
  paintFeed();
}

function buildScopes(): void {
  const row = $('feed-scopes');
  for (const id of SCOPES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'scope';
    // aria-pressed rather than role="tab": a tablist owes the user arrow-key
    // navigation, a roving tabindex and a tabpanel to land in, and none of the
    // three exists here. These are toggle buttons that happen to look like
    // tabs, so they are announced as what they are.
    b.setAttribute('aria-pressed', 'false');
    b.textContent = id === 'global' ? 'Global' : PLATFORM_LABELS[id];
    b.addEventListener('click', () => {
      scope = id;
      scopePicked = true;
      paintFeed();
    });
    scopeButtons.set(id, b);
    row.appendChild(b);
  }
}

function buildRules(): void {
  const list = $('feed-rules');
  for (const item of QUICK) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'row';
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', 'false');
    b.innerHTML =
      '<span class="row-text"><span class="row-name"></span><span class="row-desc"></span></span>' +
      '<span class="track" aria-hidden="true"></span>';
    (b.querySelector('.row-name') as HTMLElement).textContent = item.label;
    (b.querySelector('.row-desc') as HTMLElement).textContent = item.desc;
    b.addEventListener('click', () => {
      // Read the rule back rather than the button: the store is the state, the
      // aria-checked attribute is only this frame's picture of it.
      const on = store.rulesFor(platformOf(scope))[item.key];
      store.setRule(scope, item.key, !on);
    });
    ruleButtons.set(item.key, b);
    list.appendChild(b);
  }
}

/** Number options in ascending order, so the pickers read like a scale. */
function fillChoices(el: HTMLSelectElement, values: readonly number[], label: (n: number) => string): void {
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = label(v);
    el.appendChild(opt);
  }
}

/**
 * Show a stored value the list does not offer rather than silently showing the
 * wrong one. The panel can set any limit it likes, and a select that quietly
 * displayed "No limit" for a limit that exists would be a lie told by a widget.
 */
function selectMinutes(el: HTMLSelectElement, value: number): void {
  const wanted = String(value);
  if (!Array.from(el.options).some((o) => o.value === wanted)) {
    const opt = document.createElement('option');
    opt.value = wanted;
    opt.textContent = `${value}m`;
    const after = Array.from(el.options).find((o) => Number(o.value) > value);
    el.insertBefore(opt, after || null);
  }
  // Only when it differs: assigning to a select the user has open would fight
  // them for the dropdown, and this repaints once a second.
  if (el.value !== wanted) el.value = wanted;
}

function paintFeed(): void {
  if (!mounted) return;
  const now = Date.now();
  const platform = platformOf(scope);
  const rules: FeedRules = store.rulesFor(platform);
  const session = store.activeSession(now);
  const stats = store.stats(now);

  for (const [id, b] of scopeButtons) b.setAttribute('aria-pressed', String(id === scope));

  const override = $('feed-override');
  override.hidden = !platform || !hasOverride(store.getState(), platform);

  $('feed-filtered').textContent = String(stats.filteredWeek);
  $('feed-saved').textContent = humanDuration(stats.savedWeekSeconds);
  $('feed-score').textContent = `${focusScore(rules, !!session).score}% focus score`;

  for (const [key, b] of ruleButtons) b.setAttribute('aria-checked', String(rules[key]));

  // A daily limit is per platform and only per platform. "Minutes online"
  // summed across four sites is not a number anybody sets, and not one they
  // could act on, so Global gets no limit control rather than one that would
  // have to invent a meaning.
  $('feed-limit').hidden = !platform;
  $('feed-limit-eyebrow').hidden = !platform;
  if (platform) {
    selectMinutes($('feed-limit-minutes') as HTMLSelectElement, rules.dailyLimit);
    const limit = store.limitFor(platform, now);
    const meta = $('feed-limit-meta');
    const bar = $('feed-limit-bar');
    meta.hidden = limit.limit <= 0;
    bar.hidden = limit.limit <= 0;
    if (limit.limit > 0) {
      const usedMinutes = Math.round(limit.used / 60);
      $('feed-limit-left').textContent = `${humanDuration(limit.left)} left.`;
      $('feed-limit-used').textContent = `Used ${usedMinutes} of ${limit.limit}m today.`;
      const pct = Math.min(100, Math.round((limit.used / (limit.limit * 60)) * 100));
      ($('feed-limit-fill') as HTMLElement).style.width = `${pct}%`;
      bar.setAttribute('aria-valuemax', String(limit.limit));
      bar.setAttribute('aria-valuenow', String(Math.min(usedMinutes, limit.limit)));
      // The bar is a picture of the two numbers above it. Screen readers get
      // the same sentence rather than a bare percentage.
      bar.setAttribute('aria-valuetext', `Used ${usedMinutes} of ${limit.limit} minutes today`);
    }
  }

  $('feed-session-idle').hidden = !!session;
  $('feed-session-live').hidden = !session;
  if (session) {
    $('feed-session-left').textContent = session.until
      ? `${humanDuration((session.until - now) / 1000)} left`
      : 'Running until you stop';
  }
}

function mountFeed(): void {
  buildScopes();
  buildRules();
  fillChoices($('feed-limit-minutes') as HTMLSelectElement, LIMIT_CHOICES, (n) => (n ? `${n}m` : 'No limit'));
  fillChoices($('feed-session-minutes') as HTMLSelectElement, SESSION_CHOICES, (n) => (n ? `${n}m` : 'Until I stop'));

  $('feed-clear-override').addEventListener('click', () => {
    const platform = platformOf(scope);
    if (platform) store.clearOverride(platform);
  });

  $('feed-limit-minutes').addEventListener('change', (e) => {
    const platform = platformOf(scope);
    if (!platform) return;
    store.setRule(platform, 'dailyLimit', Number((e.target as HTMLSelectElement).value) || 0);
  });

  $('feed-session-start').addEventListener('click', () => {
    // No categories: a session started from here narrows to deep-work content,
    // which is what an empty list means. Choosing a different set of categories
    // is a reading task, and reading tasks belong in the panel.
    store.startSession(Number(($('feed-session-minutes') as HTMLSelectElement).value) || 0, [], Date.now());
  });
  $('feed-session-stop').addEventListener('click', () => store.stopSession());

  $('feed-all').addEventListener('click', () => {
    send('WEBABLE_OPEN');
    window.close();
  });

  store.subscribe(paintFeed);
  mounted = true;
  paintFeed();
  $('feed').hidden = false;

  // The countdown and the limit line are the only things on this surface that
  // move without anybody pressing anything, and a timer that only updates when
  // you touch it is worse than no timer.
  setInterval(paintFeed, 1000);
}

// Both paths mount. A storage read that failed leaves the defaults in place,
// and defaults are a working popup; a missing section would just look broken.
void store.ready.then(mountFeed, mountFeed);
