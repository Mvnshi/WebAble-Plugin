/**
 * The rule: the guard hides exactly what the rules say to hide, says which
 * rule did it, and leaves the page byte-identical to how the site built it the
 * moment it is switched off.
 *
 * Why it exists: this is the half of the subsystem that touches somebody
 * else's page, and both of its failure shapes are invisible from the outside.
 *
 *   - decide() is where "I turned Sponsored off and still see ads" is decided.
 *     The order in it is load-bearing and none of it is self-evident: the
 *     platform's own marking is settled before any classification, because a
 *     card the site labelled Sponsored is sponsored whether or not the words in
 *     its title score, and a promoted Short answered as 'short' would walk
 *     straight past the sponsored switch. The denylist beats the allowlist,
 *     because a person who blocked Gossip and allowed Entertainment meant the
 *     block. And an allowlist hides GENERAL, which is the deliberate sharp
 *     edge: "show only the types you pick" means a card nobody could place is
 *     not one of them. That last one is the one somebody softens by accident
 *     while fixing a complaint, so it is pinned here on purpose.
 *   - Teardown. Nothing is ever removed from the page, so every hide is one
 *     attribute plus one stylesheet, and every mutation is recorded on the
 *     element that received it. If stop() misses one, the user turns the
 *     extension off and their feed stays broken with nothing on screen
 *     explaining why, which is worse than the filter never having worked. The
 *     recorded inline `position` is the subtle one: restoring it as '' when the
 *     site had written 'static' is a change that survives teardown, so this
 *     file sets one card to 'static' and requires 'static' back.
 *
 * The guard runs against a jsdom document and a real store. Most tests use
 * memory adapters; the storage feedback regression uses chromeStorageAdapter
 * with cloned callback payloads and change events, including the writer's own
 * events, so its cross-context reads behave like Chrome's.
 *
 * `now` is pinned and passed in everywhere. Nothing here reads the clock.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { chromeStorageAdapter, createMutationManager, memoryAdapter } from '@webable/core';
import { allowedCategories, createFeedGuard, decide, type FeedGuard } from '../src/feeds/runtime';
import { createFeedStore, FEED_SETTINGS_KEY, FEED_USAGE_KEY, type FeedStore } from '../src/feeds/store';
import { classify } from '../src/feeds/classify';
import { DEFAULT_RULES, type FeedRules, type FeedSession } from '../src/feeds/settings';
import { DEEP_WORK_CATEGORIES, GENERAL } from '../src/feeds/categories';

/** A fixed instant. Every clock the code under test reads is this one. */
const NOW = Date.UTC(2026, 4, 12, 9, 30, 0);

function rulesWith(over: Partial<FeedRules>): FeedRules {
  return { ...DEFAULT_RULES, focus: [], blocked: [], ...over };
}

function sessionWith(categories: string[]): FeedSession {
  return { from: NOW, minutes: 30, until: NOW + 30 * 60000, categories };
}

// ─── decide(), the pure function ─────────────────────────────────────────────

const SHORT = { kind: 'short' } as const;
const AD = { kind: 'ad' } as const;
const VIDEO = { kind: 'video' } as const;

/** Reads unambiguously as COOKING, so "the classifier said something else" is a fact, not a hope. */
const COOKING = classify({ title: 'Easy sourdough bread recipe for beginners', channel: 'Bread Lab' });
/** A short caption with nothing scorable in it: the case an allowlist is hardest on. */
const UNPLACED = classify({ title: 'wait for it' });

test('the classifier answers used below really are what they claim to be', () => {
  // Not a test of decide(). It is the control for every test that follows: if
  // these two verdicts drift, the tests below would still pass while checking
  // something other than what their names say.
  assert.equal(COOKING.category, 'COOKING');
  assert.ok(COOKING.confidence > 0.5, `and reads it as a topic, got ${COOKING.confidence}`);
  assert.equal(UNPLACED.category, GENERAL, 'a three word caption places nowhere');
  assert.equal(UNPLACED.confidence, 0);
});

test('hideShorts hides a Short, and nothing else does', () => {
  const on = decide(SHORT, COOKING, rulesWith({ hideShorts: true }), null);
  assert.equal(on.hide, true);
  assert.equal(on.reason, 'shorts', 'and says which switch did it');
  assert.equal(on.category, 'COOKING', 'the category survives the hide, for the log row');

  // The same card, the same verdict, one switch off.
  const off = decide(SHORT, COOKING, rulesWith({ hideShorts: false }), null);
  assert.equal(off.hide, false);
  assert.equal(off.reason, 'pass');
});

test('a card the site marked as an ad is sponsored, whatever the classifier called it', () => {
  // The whole point: the classifier read this card as a recipe, and it is
  // right, it is a recipe. The site said the slot is paid for. hideSponsored
  // is about the second fact and must not be argued out of it by the first.
  assert.equal(COOKING.category, 'COOKING', 'control: the classifier did not say AD');
  const marked = decide(AD, COOKING, rulesWith({ hideSponsored: true }), null);
  assert.equal(marked.hide, true);
  assert.equal(marked.reason, 'sponsored');

  // The other direction: the classifier calls it AD on a card the site did not
  // mark. That is also hidden, because both are evidence of the same thing.
  const asAd = { category: 'AD', confidence: 0.9, matched: ['sponsored'], alternates: [] };
  const worded = decide(VIDEO, asAd, rulesWith({ hideSponsored: true }), null);
  assert.equal(worded.hide, true);
  assert.equal(worded.reason, 'sponsored');

  // Control the other way, so the two above are the switch working rather than
  // ads being hidden unconditionally.
  assert.equal(decide(AD, COOKING, rulesWith({ hideSponsored: false }), null).hide, false);
});

test('the denylist beats the allowlist', () => {
  const gaming = classify({ title: 'Minecraft gameplay speedrun', channel: 'SomeGamer' });
  assert.equal(gaming.category, 'GAMING', 'control: this is the card both lists name');

  const both = decide(VIDEO, gaming, rulesWith({ focus: ['GAMING'], blocked: ['GAMING'] }), null);
  assert.equal(both.hide, true, 'blocking something you also allowed means blocking it');
  assert.equal(both.reason, 'blocked');

  // Allowed and not blocked passes, so the hide above came from the denylist
  // rather than from the allowlist failing to let anything through at all.
  const allowedOnly = decide(VIDEO, gaming, rulesWith({ focus: ['GAMING'] }), null);
  assert.equal(allowedOnly.hide, false);
  assert.equal(allowedOnly.reason, 'pass');
});

test('an allowlist hides a category that is not on it', () => {
  const hidden = decide(VIDEO, COOKING, rulesWith({ focus: ['CODING'] }), null);
  assert.equal(hidden.hide, true);
  assert.equal(hidden.reason, 'focus');
  assert.equal(hidden.category, 'COOKING', 'and names the category, so the panel can explain itself');

  const kept = decide(VIDEO, COOKING, rulesWith({ focus: ['CODING', 'COOKING'] }), null);
  assert.equal(kept.hide, false, 'adding it to the list is all it takes');
});

test('an allowlist hides GENERAL, which is the sharp edge and is meant to be', () => {
  // A card the classifier could not place is not one of the types the user
  // picked, so it goes. This is what "show only the types you pick, everything
  // else is hidden" means, and softening it here would quietly turn every
  // allowlist into a suggestion. The review chip, the count and the AI assist
  // exist because of this line, not instead of it.
  const hidden = decide(VIDEO, UNPLACED, rulesWith({ focus: ['CODING'] }), null);
  assert.equal(hidden.hide, true);
  assert.equal(hidden.reason, 'focus');
  assert.equal(hidden.category, GENERAL);

  // Control: the same unplaceable card with no allowlist is not hidden, so the
  // hide above is the allowlist and not a verdict that is refused everywhere.
  const kept = decide(VIDEO, UNPLACED, rulesWith({}), null);
  assert.equal(kept.hide, false);
  assert.equal(kept.reason, 'pass');
});

test('with no rules at all, nothing is hidden', () => {
  // Control first: this harness does hide this exact card when a rule says to.
  const withRule = decide(SHORT, COOKING, rulesWith({ hideShorts: true }), null);
  assert.equal(withRule.hide, true, 'the instrument can hide this card');

  const bare = rulesWith({});
  for (const item of [SHORT, AD, VIDEO, { kind: 'live' } as const, { kind: 'post' } as const]) {
    const d = decide(item, COOKING, bare, null);
    assert.equal(d.hide, false, `${item.kind} is not hidden by default`);
    assert.equal(d.reason, 'pass');
  }
  // And the unplaceable card, which is the one a filter is most tempted to
  // hide on its own initiative.
  assert.equal(decide(VIDEO, UNPLACED, bare, null).hide, false);
});

// ─── allowedCategories ───────────────────────────────────────────────────────

test('a session narrows to its own categories only when it has some', () => {
  const rules = rulesWith({ focus: ['MUSIC'], deepWork: true });

  // Control: a session with picks does narrow, and outranks both the focus
  // list and Deep Work.
  assert.deepEqual(allowedCategories(rules, sessionWith(['ART'])), ['ART']);

  // A session with no picks is a timer and a score. It must not add a filter
  // nobody asked for, so what is in force is whatever was in force already.
  assert.deepEqual(
    allowedCategories(rules, sessionWith([])),
    DEEP_WORK_CATEGORIES.slice(),
    'an empty session leaves Deep Work in charge',
  );
  assert.deepEqual(
    allowedCategories(rulesWith({ focus: ['MUSIC'] }), sessionWith([])),
    ['MUSIC'],
    'and leaves a plain focus list in charge',
  );
});

test('Deep Work narrows to the deep-work list, and otherwise the focus list is the answer', () => {
  assert.ok(DEEP_WORK_CATEGORIES.length > 0, 'control: the deep-work list is not empty');
  assert.deepEqual(allowedCategories(rulesWith({ deepWork: true }), null), DEEP_WORK_CATEGORIES.slice());
  assert.deepEqual(
    allowedCategories(rulesWith({ deepWork: true, focus: ['MUSIC'] }), null),
    DEEP_WORK_CATEGORIES.slice(),
    'Deep Work outranks the focus list',
  );
  assert.deepEqual(allowedCategories(rulesWith({ focus: ['MUSIC', 'ART'] }), null), ['MUSIC', 'ART']);
  // Empty means everything is allowed, which is not the same as nothing being
  // allowed. That distinction is the whole allowlist.
  assert.deepEqual(allowedCategories(rulesWith({}), null), []);
});

// ─── The guard on a page ─────────────────────────────────────────────────────

/**
 * Three YouTube cards: a recipe, a coding video, and a Short. The Short is the
 * only one any rule below names, so the other two are the presence control for
 * every "the guard left this alone" assertion.
 */
const YT_FEED = `
<ytd-rich-item-renderer id="card-recipe">
  <a id="video-title" href="/watch?v=aaa">Easy sourdough bread recipe for beginners</a>
  <ytd-channel-name><a href="/@breadlab">Bread Lab</a></ytd-channel-name>
</ytd-rich-item-renderer>
<ytd-rich-item-renderer id="card-coding">
  <a id="video-title" href="/watch?v=bbb">Building a compiler in Rust from scratch</a>
  <ytd-channel-name><a href="/@systems">Systems Weekly</a></ytd-channel-name>
</ytd-rich-item-renderer>
<ytd-rich-item-renderer id="card-short">
  <a id="video-title" href="/shorts/ccc">Sixty second pasta hack</a>
  <ytd-channel-name><a href="/@quickbites">Quick Bites</a></ytd-channel-name>
</ytd-rich-item-renderer>`;

function youtubeDoc(): Document {
  return new JSDOM(`<!doctype html><html><head></head><body>${YT_FEED}</body></html>`, {
    url: 'https://www.youtube.com/',
    pretendToBeVisual: true,
  }).window.document;
}

async function storeWith(rules: Partial<FeedRules>): Promise<FeedStore> {
  const store = createFeedStore({ settings: memoryAdapter(), usage: memoryAdapter(), shardId: 'test-tab' });
  await store.ready;
  for (const [key, value] of Object.entries(rules)) {
    store.setRule('global', key as keyof FeedRules, value as FeedRules[keyof FeedRules]);
  }
  return store;
}

/**
 * Teardown is registered on the test context rather than written at the end of
 * the body, because a running guard owns a fifteen second interval and a live
 * store owns a debounce timer. An assertion that throws halfway would skip a
 * trailing destroy() and leave those timers holding Node's event loop open, so
 * the suite would hang instead of reporting the failure. t.after runs either
 * way.
 */
function guardOn(t: TestContext, doc: Document, store: FeedStore): FeedGuard {
  const guard = createFeedGuard({
    doc,
    win: doc.defaultView as unknown as Window,
    store,
    now: () => NOW,
  });
  t.after(() => {
    guard.destroy();
    store.destroy();
  });
  return guard;
}

function el(doc: Document, id: string): HTMLElement {
  const found = doc.getElementById(id);
  if (!found) throw new Error(`the fixture has no #${id}`);
  return found;
}

test('the guard hides what the rules name, and stop() hands the page back untouched', async (t) => {
  const doc = youtubeDoc();
  const store = await storeWith({ hideShorts: true, showLabel: true });
  const guard = guardOn(t, doc, store);

  const recipe = el(doc, 'card-recipe');
  const coding = el(doc, 'card-coding');
  const short = el(doc, 'card-short');
  // The site positioned this one itself. Restoring it as '' would be a change
  // that outlives the extension, so the value has to come back as written.
  coding.style.position = 'static';

  const count = (sel: string) => doc.querySelectorAll(sel).length;

  guard.start();

  // Presence. Everything the teardown assertions below look for has to be here
  // first, or the zeros afterwards are worth nothing.
  assert.equal(short.getAttribute('data-wa-feed-hide'), 'remove', 'the Short is hidden');
  assert.equal(short.getAttribute('data-wa-feed'), 'shorts', 'and the card says which rule did it');
  assert.equal(recipe.getAttribute('data-wa-feed'), 'pass', 'the recipe was judged');
  assert.equal(coding.getAttribute('data-wa-feed'), 'pass', 'so was the coding video');
  assert.equal(recipe.hasAttribute('data-wa-feed-hide'), false, 'and neither of them is hidden');
  assert.equal(coding.hasAttribute('data-wa-feed-hide'), false);
  assert.equal(guard.hiddenCount(), 1, 'one card hidden, not three');
  assert.equal(count('[data-wa-feed]'), 3, 'every card was judged exactly once');
  assert.equal(count('[data-wa-feed-hide]'), 1);
  assert.equal(count('[data-wa-feed-badge]'), 2, 'the two visible cards carry a badge');
  assert.equal(count('[data-wa-feed-pos]'), 2, 'and both had their position recorded before it moved');
  assert.ok(doc.getElementById('wa-feed-chip'), 'the review chip is on screen while something is hidden');
  assert.equal(recipe.style.position, 'relative', 'a card with no position of its own is given one');
  assert.equal(coding.style.position, 'static', 'a card that had one keeps it');

  guard.stop();

  for (const sel of ['[data-wa-feed]', '[data-wa-feed-hide]', '[data-wa-feed-badge]', '[data-wa-feed-pos]']) {
    assert.equal(count(sel), 0, `stop() left ${sel} behind`);
  }
  assert.equal(doc.getElementById('wa-feed-chip'), null, 'and took the chip with it');
  assert.equal(doc.documentElement.hasAttribute('data-webable-feedreveal'), false);
  assert.equal(recipe.style.position, '', 'the card that had no position has none again');
  assert.equal(coding.style.position, 'static', 'and the one that was static is static, not empty');
  assert.equal(guard.hiddenCount(), 0);
});

test('the badge appears only when the label switch is on, and reads the category out', async (t) => {
  // Presence first.
  const withLabel = youtubeDoc();
  const onStore = await storeWith({ showLabel: true });
  const onGuard = guardOn(t, withLabel, onStore);
  onGuard.start();
  const badge = withLabel.querySelector('#card-recipe [data-wa-feed-badge] .wa-fbadge-text');
  assert.ok(badge, 'a judged, visible card gains a badge');
  assert.equal(badge?.textContent, 'Cooking', 'and it reads the category out in the words the panel uses');

  // Absence, on the same harness with one switch moved.
  const noLabel = youtubeDoc();
  const offStore = await storeWith({ showLabel: false });
  const offGuard = guardOn(t, noLabel, offStore);
  offGuard.start();
  assert.equal(
    el(noLabel, 'card-recipe').getAttribute('data-wa-feed'),
    'pass',
    'the card was still judged, so the absence below is the switch and not a dead guard',
  );
  assert.equal(noLabel.querySelectorAll('[data-wa-feed-badge]').length, 0, 'and nothing was drawn on it');
});

test('hideComments injects YouTube comment selectors, and turning it off removes the stylesheet', async (t) => {
  const doc = youtubeDoc();
  const store = await storeWith({ hideComments: true });
  const guard = guardOn(t, doc, store);
  guard.start();

  const sheet = doc.getElementById('wa-feed-chrome');
  assert.ok(sheet, 'the chrome stylesheet exists while a wholesale switch is on');
  const text = sheet?.textContent || '';
  assert.ok(text.includes('#comments{display:none !important}'), `#comments is hidden, got: ${text}`);
  assert.ok(text.includes('ytd-comments{display:none !important}'), `ytd-comments is hidden, got: ${text}`);
  // Nothing else was smuggled in with it: the sidebar switch is off, so the
  // sidebar selectors must not appear.
  assert.equal(text.includes('#secondary'), false, 'a switch that is off contributes no rules');

  store.setRule('global', 'hideComments', false);
  guard.refresh();
  assert.equal(
    doc.getElementById('wa-feed-chrome'),
    null,
    'with no wholesale switch on there is no stylesheet at all, not an empty one',
  );
});

/** Let queued storage callbacks and jsdom's MutationObserver finish. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test('own storage change events do not recount cards, and popup grants and rules still reach the guard', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });

  type Changes = Record<string, { newValue: Record<string, unknown> }>;
  const listeners = new Set<(changes: Changes, area: string) => void>();
  let usageWrites = 0;
  const area = (name: string) => {
    const items: Record<string, unknown> = {};
    return {
      get(key: string, cb: (result: Record<string, unknown>) => void) {
        queueMicrotask(() => cb(structuredClone({ [key]: items[key] })));
      },
      set(values: Record<string, unknown>, cb: () => void) {
        const cloned = structuredClone(values);
        queueMicrotask(() => {
          const changes: Changes = {};
          for (const [key, value] of Object.entries(cloned)) {
            if (JSON.stringify(items[key]) === JSON.stringify(value)) continue;
            items[key] = value;
            changes[key] = { newValue: value as Record<string, unknown> };
          }
          if (Object.keys(changes).length) {
            if (name === 'local') usageWrites += 1;
            // Chrome also delivers storage.onChanged to the context that wrote.
            for (const listener of listeners) listener(structuredClone(changes), name);
          }
          cb();
        });
      },
    };
  };
  const host = globalThis as unknown as { chrome?: unknown };
  const previousChrome = host.chrome;
  host.chrome = { storage: { local: area('local'), sync: area('sync') } };
  t.after(() => {
    if (previousChrome === undefined) delete host.chrome;
    else host.chrome = previousChrome;
  });

  const store = createFeedStore({
    settings: chromeStorageAdapter('webable', 'sync'),
    usage: chromeStorageAdapter('webable', 'local'),
    shardId: 'content-tab',
  });
  await store.ready;
  store.setRule('global', 'hideShorts', true);
  store.setRule('youtube', 'dailyLimit', 1);
  const doc = youtubeDoc();
  const guard = guardOn(t, doc, store);
  // These are the two connections made by content.ts: every store notification
  // refreshes the guard, and Chrome changes are adopted into that same store.
  t.after(store.subscribe(() => guard.refresh()));
  listeners.add((changes, name) => {
    const bag = changes.webable?.newValue;
    if (name === 'local' && bag && FEED_USAGE_KEY in bag) store.adoptUsage(bag[FEED_USAGE_KEY]);
    if (name === 'sync' && bag && FEED_SETTINGS_KEY in bag) store.adoptState(bag[FEED_SETTINGS_KEY]);
  });
  guard.start();
  assert.equal(store.stats(NOW).filteredWeek, 1, 'the Short is counted before storage flushes');

  t.mock.timers.tick(5000);
  await settle();
  assert.equal(usageWrites, 1, 'the first hidden item reached local storage');
  assert.equal(store.stats(NOW).filteredWeek, 1, 'adopting that write did not count it again');
  assert.equal(guard.hiddenCount(), 1, 'the review chip still includes previously counted cards');
  assert.equal(store.getUsage().log.length, 1, 'the same card did not create another log entry');

  t.mock.timers.tick(5000);
  await settle();
  assert.equal(usageWrites, 1, 'the adoption did not schedule another usage write');

  // Usage changes must still update enforcement, including a grant made in a
  // separate popup context with a fresh, cloned copy of the persisted counters.
  store.addSeconds('youtube', 60, false, NOW);
  t.mock.timers.tick(5000);
  await settle();
  assert.ok(doc.getElementById('wa-feed-overlay'), 'the exhausted daily limit covers the site');
  const popup = createFeedStore({
    settings: chromeStorageAdapter('webable', 'sync'),
    usage: chromeStorageAdapter('webable', 'local'),
    shardId: 'popup',
  });
  t.after(() => popup.destroy());
  await popup.ready;
  popup.grantExtra('youtube', 10, NOW);
  t.mock.timers.tick(5000);
  await settle();
  assert.equal(doc.getElementById('wa-feed-overlay'), null, 'the popup grant lifts the overlay');
  assert.equal(store.limitFor('youtube', NOW).left, 600, 'all ten extra minutes are available');
  assert.equal(store.stats(NOW).filteredWeek, 1, 'lifting the overlay does not count the same Short again');

  popup.setRule('global', 'hideShorts', false);
  t.mock.timers.tick(250);
  await settle();
  assert.equal(el(doc, 'card-short').hasAttribute('data-wa-feed-hide'), false, 'popup rule changes still re-judge cards');
  popup.setRule('global', 'hideShorts', true);
  t.mock.timers.tick(250);
  await settle();
  assert.equal(el(doc, 'card-short').getAttribute('data-wa-feed-hide'), 'remove', 'the filter can be reapplied');
  assert.equal(store.stats(NOW).filteredWeek, 1, 'toggling rules does not manufacture more filtered items');

  const another = doc.createElement('ytd-reel-item-renderer');
  another.innerHTML = '<a id="video-title" href="/shorts/ddd">Another new short</a>';
  doc.body.appendChild(another);
  guard.sweep();
  assert.equal(store.stats(NOW).filteredWeek, 2, 'a genuinely new card is still counted');
  assert.equal(guard.hiddenCount(), 2, 'the chip reflects both hidden cards');
});

test('disabling Feed guard restores page regions, overlays, badges and review state, and it can be re-enabled', async (t) => {
  const doc = youtubeDoc();
  const store = await storeWith({ hideShorts: true, hideComments: true, showLabel: true, showConfirm: true });
  const guard = guardOn(t, doc, store);
  t.after(store.subscribe(() => guard.refresh()));
  const recipe = el(doc, 'card-recipe');
  const coding = el(doc, 'card-coding');
  coding.style.position = 'static';
  guard.start();
  guard.reveal(true);
  assert.equal(recipe.style.position, 'relative', 'the badge positioned a previously unpositioned card');
  const correct = recipe.querySelector<HTMLButtonElement>('button[aria-label^="Correct"]');
  assert.ok(correct, 'a correction button is present before switching off');
  correct.click();
  assert.ok(doc.getElementById('wa-feed-popover'), 'a correction popover is open');
  store.setRule('youtube', 'blockSite', true);
  assert.ok(doc.getElementById('wa-feed-overlay'), 'the site block is active');
  assert.ok(doc.getElementById('wa-feed-chrome'), 'the comment-hiding stylesheet is active');

  store.setEnabled(false);
  for (const id of ['wa-feed-overlay', 'wa-feed-chrome', 'wa-feed-style', 'wa-feed-chip', 'wa-feed-popover']) {
    assert.equal(doc.getElementById(id), null, `switching off removes ${id}`);
  }
  for (const attr of ['data-wa-feed', 'data-wa-feed-hide', 'data-wa-feed-badge', 'data-wa-feed-pos']) {
    assert.equal(doc.querySelectorAll(`[${attr}]`).length, 0, `switching off removes ${attr}`);
  }
  assert.equal(recipe.style.position, '', 'the card without positioning is restored');
  assert.equal(coding.style.position, 'static', 'the card with positioning keeps its original value');
  assert.equal(doc.documentElement.hasAttribute('data-webable-feedreveal'), false, 'review styling is removed');
  assert.equal(guard.revealed(), false, 'the review state is reset');
  assert.equal(guard.hiddenCount(), 0);

  store.setEnabled(true);
  assert.ok(doc.getElementById('wa-feed-overlay'), 're-enabling resumes the stored site block');
  store.setRule('youtube', 'blockSite', false);
  assert.equal(doc.getElementById('wa-feed-overlay'), null, 'the block can be lifted normally');
  assert.ok(doc.getElementById('wa-feed-style'), 'filter styles are reinstalled');
  assert.ok(doc.getElementById('wa-feed-chrome'), 'stored region filters resume');
  assert.equal(el(doc, 'card-short').getAttribute('data-wa-feed-hide'), 'remove', 'card filtering resumes');
  assert.ok(recipe.querySelector('[data-wa-feed-badge]'), 'badges resume');
  assert.equal(store.stats(NOW).filteredWeek, 1, 're-enabling does not count the same card twice');
});

test('the review chip settles under the real mutation manager and still responds to clicks and new cards', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const doc = youtubeDoc();
  const store = await storeWith({ hideShorts: true });
  const guard = guardOn(t, doc, store);
  guard.start();
  let sweeps = 0;
  const mutations = createMutationManager(doc, () => {
    sweeps += 1;
    guard.sweep();
  });
  t.after(() => mutations.stop());
  mutations.start();
  doc.body.appendChild(doc.createElement('div'));
  await settle();
  t.mock.timers.tick(200);
  await settle();
  assert.equal(sweeps, 1, 'a real page mutation invokes the scanner');
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(sweeps, 1, 'painting an unchanged chip does not schedule another sweep');

  const review = doc.querySelector<HTMLButtonElement>('#wa-feed-chip button');
  assert.ok(review);
  review.click();
  assert.equal(guard.revealed(), true, 'Review still reveals the hidden cards');
  assert.equal(review.isConnected, false, 'a changed chip was repainted');
  assert.equal(doc.querySelector('#wa-feed-chip button')?.textContent, 'Hide again');
  await settle();
  t.mock.timers.tick(200);
  await settle();
  const afterReview = sweeps;
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(sweeps, afterReview, 'the changed Review button also settles');

  const another = doc.createElement('ytd-reel-item-renderer');
  another.innerHTML = '<a id="video-title" href="/shorts/new">New short after scrolling</a>';
  doc.body.appendChild(another);
  await settle();
  t.mock.timers.tick(200);
  await settle();
  assert.equal(another.getAttribute('data-wa-feed-hide'), 'remove', 'new cards are still judged');
  assert.equal(doc.querySelector('#wa-feed-chip span')?.textContent, '2 items hidden', 'the count updates');
  t.mock.timers.tick(200);
  await settle();
  const afterNewCard = sweeps;
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(sweeps, afterNewCard, 'updating the count settles instead of creating a scan loop');
});
