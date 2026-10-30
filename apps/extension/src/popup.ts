/**
 * Popup logic. Drives the active tab through the content script's message
 * protocol: search, the four big actions, suggestions for the page, quick
 * switches and profiles. The profile list comes from @webable/core, so the
 * popup, the panel, and the docs all show the same single source of truth.
 *
 * The feed section is the exception: it does not send messages at all. The
 * popup is a page of the extension, so it builds the feed store itself and
 * writes straight to chrome.storage, and content.ts's watchStorage() is what
 * carries the change into every open tab. Going through WEBABLE_* instead would
 * reach exactly one tab, which is the wrong shape for a rule that is not about
 * a tab.
 */
import { PROFILES, FEATURE_MAP, chromeStorageAdapter, type Engine } from '@webable/core';
import { parseIntent, rank, catalogue, describeIntent, type Command, type Insight, type Intent } from '@webable/power';
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

/**
 * The popup's own copy of what the tab is doing. Filled by WEBABLE_GET_STATE;
 * until it answers, everything reads as off rather than guessed.
 */
let activeProfile: string | null = null;
let enabled = true;
let host = 'this site';
let count = 0;
let active = new Set<string>();
let reachable = false;

/** Ask the tab to do something, then let the person see it happen there. */
function runInTab(intent: Intent, close = true): void {
  send('WEBABLE_RUN_INTENT', { intent }, () => {
    refreshState();
  });
  if (close) window.close();
}

function refreshState(): void {
  send('WEBABLE_GET_STATE', {}, (res) => adoptState(res as TabState | undefined));
}

interface TabState {
  activeProfile?: string | null;
  count?: number;
  host?: string;
  enabled?: boolean;
  active?: string[];
}

/* ---- profiles ----------------------------------------------------------- */

const grid = $('profiles');
function renderProfiles() {
  grid.innerHTML = '';
  for (const p of PROFILES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'profile';
    b.setAttribute('aria-pressed', String(activeProfile === p.id));
    b.innerHTML = `<div class="profile-name"></div><div class="profile-desc"></div>`;
    (b.querySelector('.profile-name') as HTMLElement).textContent = p.label;
    (b.querySelector('.profile-desc') as HTMLElement).textContent = p.description;
    b.title = p.description;
    b.addEventListener('click', () => {
      send('WEBABLE_APPLY_PROFILE', { id: p.id });
      window.close();
    });
    grid.appendChild(b);
  }
}
renderProfiles();

/* ---- quick tools -------------------------------------------------------- */

/**
 * The eight tools people reach for most, as switches with their real state.
 * Chosen for breadth over depth: one each for brightness, reading, size,
 * type, motion, clutter, and the two annoyances everybody shares.
 */
const QUICK_TOOLS = ['darkMode', 'readerMode', 'fontSize', 'dyslexiaFont', 'stopAnimations', 'hideDistractions', 'cookieKill', 'popupKill'];
const toolButtons = new Map<string, HTMLButtonElement>();
function renderTools(): void {
  const wrap = $('tools');
  wrap.innerHTML = '';
  for (const id of QUICK_TOOLS) {
    const f = FEATURE_MAP.get(id);
    if (!f) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool';
    b.setAttribute('aria-pressed', String(active.has(id)));
    b.innerHTML = '<span class="led" aria-hidden="true"></span><span></span>';
    (b.lastElementChild as HTMLElement).textContent = f.meta.label;
    b.title = f.meta.description;
    b.addEventListener('click', () => {
      const on = !active.has(id);
      if (on) active.add(id);
      else active.delete(id);
      b.setAttribute('aria-pressed', String(on));
      $('status').textContent = `${f.meta.label} ${on ? 'on' : 'off'}`;
      // Stays open: a switch grid is somewhere people flip two or three things.
      runInTab({ kind: 'toggle', feature: id, on }, false);
    });
    toolButtons.set(id, b);
    wrap.appendChild(b);
  }
}
renderTools();

/* ---- suggestions -------------------------------------------------------- */

function renderInsights(list: Insight[]): void {
  const wrap = $('suggest');
  wrap.innerHTML = '';
  const top = list.slice(0, 3);
  $('suggest-wrap').hidden = top.length === 0;
  for (const i of top) {
    const card = document.createElement('div');
    card.className = 'tip';
    card.innerHTML = '<div class="tip-text"><div class="tip-title"></div><div class="tip-why"></div></div><button type="button"></button>';
    (card.querySelector('.tip-title') as HTMLElement).textContent = i.title;
    (card.querySelector('.tip-why') as HTMLElement).textContent = i.why;
    const btn = card.querySelector('button') as HTMLButtonElement;
    btn.textContent = i.action;
    btn.addEventListener('click', () => {
      card.classList.add('is-done');
      btn.textContent = 'Done';
      btn.disabled = true;
      $('status').textContent = `${i.action}: done. Undo it from the page or the panel.`;
      runInTab(i.fix, false);
    });
    wrap.appendChild(card);
  }
}

/* ---- the four big actions ----------------------------------------------- */

function openReport(): void {
  withActiveTab((tabId) => {
    chrome.tabs.create({ url: chrome.runtime.getURL(`report.html?tab=${tabId}`) });
    window.close();
  });
}

$('act-bar').addEventListener('click', () => {
  send('WEBABLE_COMMAND_BAR');
  window.close();
});
$('act-hints').addEventListener('click', () => {
  send('WEBABLE_HINTS');
  window.close();
});
$('act-read').addEventListener('click', () => runInTab({ kind: 'action', id: 'readAloud' }));
$('act-check').addEventListener('click', openReport);

/* ---- search ------------------------------------------------------------- */

/**
 * The command bar's search, in the popup. Same phrasebook, same ranking, same
 * catalogue; it runs the result in the tab, so a person who never learns the
 * keyboard shortcut still gets "type what you need".
 *
 * The catalogue reads engine state for on/off labels. The popup has no engine,
 * only the tab's answer to WEBABLE_GET_STATE, so it lends the catalogue a
 * read-only stand-in built from that answer.
 */
function stateView(): Engine {
  const settings: Record<string, { active: boolean }> = {};
  for (const id of active) settings[id] = { active: true };
  return { getState: () => ({ settings, activeProfile, ui: { theme: 'auto' }, apiKey: '' }) } as unknown as Engine;
}

let results: Command[] = [];
let selected = 0;
const input = $('q') as HTMLInputElement;
const list = $('results');

function search(q: string): void {
  if (!q.trim()) {
    results = [];
  } else {
    const engine = stateView();
    const intents = parseIntent(q)
      .map((i) => describeIntent(engine, i))
      .filter((c): c is Command => !!c)
      .slice(0, 3);
    const found = rank(q, catalogue(engine)).slice(0, 8);
    const seen = new Set<string>();
    results = [...intents, ...found].filter((c) => {
      const k = JSON.stringify(c.intent);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  selected = 0;
  paintResults(q);
}

function paintResults(q: string): void {
  const open = !!q.trim();
  list.hidden = !open;
  $('home').hidden = open;
  input.setAttribute('aria-expanded', String(open));
  list.innerHTML = '';
  if (!open) return;
  if (!results.length) {
    const li = document.createElement('li');
    li.className = 'results-empty';
    li.setAttribute('role', 'presentation');
    li.textContent = 'No match. Try "too bright", "bigger text" or "read to me". Press Enter to search in the page.';
    list.appendChild(li);
    return;
  }
  results.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = 'result';
    li.id = `r-${i}`;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(i === selected));
    li.innerHTML = '<span class="result-title"></span><span></span>';
    (li.firstElementChild as HTMLElement).textContent = c.title;
    const tail = li.lastElementChild as HTMLElement;
    if (c.meta === 'On' || c.meta === 'Active') {
      tail.className = 'result-on';
      tail.textContent = c.meta;
    } else {
      tail.className = 'result-group';
      tail.textContent = c.group === 'Best match' ? 'Best match' : c.group.replace(/s$/, '');
    }
    li.addEventListener('click', () => choose(i));
    list.appendChild(li);
  });
  input.setAttribute('aria-activedescendant', `r-${selected}`);
}

function choose(i: number): void {
  const c = results[i];
  if (!c) {
    // Nothing matched: hand the words to the command bar on the page, which
    // can also search headings, links and the site itself.
    send('WEBABLE_COMMAND_BAR');
    window.close();
    return;
  }
  if (c.intent.kind === 'action' && c.intent.id === 'siteCheck') return openReport();
  if (c.intent.kind === 'action' && c.intent.id === 'openSettings') {
    chrome.runtime.openOptionsPage();
    window.close();
    return;
  }
  runInTab(c.intent);
}

input.addEventListener('input', () => search(input.value));
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!results.length) return;
    selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    paintResults(input.value);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    choose(selected);
  } else if (e.key === 'Escape' && input.value) {
    e.preventDefault();
    input.value = '';
    search('');
  }
});

/* ---- the off switch ----------------------------------------------------- */

/**
 * The off switch, and the only surface that is guaranteed to be reachable when
 * the tools are off.
 *
 * The panel cannot offer the way back, because on a site where WebAble is off
 * there is no panel. This popup is a page of the extension, so it opens on any
 * tab whatever the content script is doing, which is exactly what makes turning
 * it off a safe thing to do rather than a one-way door.
 */
function paint() {
  document.body.setAttribute('data-off', String(!enabled));
  const power = $('power');
  power.setAttribute('aria-checked', String(enabled));
  power.setAttribute('aria-label', `WebAble on ${host}`);
  $('power-label').textContent = enabled ? 'On' : 'Off';
  const site = $('site');
  site.textContent = '';
  const b = document.createElement('b');
  b.textContent = host;
  site.append(b, document.createTextNode(enabled ? (count ? `  ·  ${count} tool${count > 1 ? 's' : ''} on` : '  ·  nothing changed yet') : '  ·  off here'));
  $('status').textContent = !enabled
    ? `Off on ${host}`
    : count
      ? `${count} tool${count > 1 ? 's' : ''} active on this site`
      : 'No tools active on this site';
  for (const [id, btn] of toolButtons) btn.setAttribute('aria-pressed', String(active.has(id)));
}

function adoptState(r: TabState | undefined): void {
  if (!r) {
    // No content script answered: a chrome:// page, the web store, a PDF
    // viewer, or a tab opened before WebAble was installed.
    reachable = false;
    document.body.setAttribute('data-blank', 'true');
    $('site').textContent = 'Not available on this page';
    $('status').textContent = 'Open a regular web page to use the tools. Tabs opened before WebAble was installed need a reload.';
    return;
  }
  reachable = true;
  document.body.removeAttribute('data-blank');
  activeProfile = r.activeProfile ?? null;
  host = r.host || host;
  count = r.count || 0;
  active = new Set(r.active || []);
  // `enabled` is absent from a content script left over from an older build;
  // treat that as running, which is what it is.
  enabled = r.enabled !== false;
  renderProfiles();
  paint();
  adoptTabScope(r.host || '');
}

// Reflect current state from the active tab, then ask it what it noticed.
send('WEBABLE_GET_STATE', {}, (res) => {
  adoptState(res as TabState | undefined);
  if (reachable && enabled) send('WEBABLE_INSIGHTS', {}, (r) => renderInsights(((r as { insights?: Insight[] }) || {}).insights || []));
});

// The shortcut as the browser actually bound it, which may not be the default.
try {
  chrome.commands?.getAll?.((cmds: Array<{ name?: string; shortcut?: string }>) => {
    const k = cmds.find((c) => c.name === 'command-bar')?.shortcut;
    const kbd = $('bar-key');
    if (k) kbd.textContent = k;
    else kbd.hidden = true;
  });
} catch {
  /* not in an extension context */
}

$('power').addEventListener('click', () => {
  const next = !enabled;
  send('WEBABLE_SET_ENABLED', { on: next }, () => {
    enabled = next;
    if (!next) count = 0;
    paint();
    if (next) setTimeout(refreshState, 400);
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
  active = new Set();
  renderProfiles();
  paint();
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
let onFeedSite = false;
function adoptTabScope(siteKey: string): void {
  if (scopePicked || !siteKey) return;
  const adapter = platformFor(siteKey);
  if (!adapter) return;
  onFeedSite = true;
  if (mounted) ($('feed') as HTMLDetailsElement).open = true;
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
  if (onFeedSite) ($('feed') as HTMLDetailsElement).open = true;

  // The countdown and the limit line are the only things on this surface that
  // move without anybody pressing anything, and a timer that only updates when
  // you touch it is worse than no timer.
  setInterval(paintFeed, 1000);
}

// Both paths mount. A storage read that failed leaves the defaults in place,
// and defaults are a working popup; a missing section would just look broken.
void store.ready.then(mountFeed, mountFeed);
