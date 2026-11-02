/**
 * The rule: every card a platform adapter reports is a real card, reported
 * once, read correctly, and never a card the caller has already judged. A
 * host is matched only when it is actually that platform's feed.
 *
 * Why it exists: platforms.ts is the only file in the subsystem allowed to
 * name a site, and every failure it can have is silent on the page.
 *
 *   - A kind read wrong routes a card past the switch that was meant to catch
 *     it. ytKind settles 'ad' before 'short' precisely because a promoted
 *     Short answered as 'short' would walk past hideSponsored, and nothing on
 *     screen would say so: the user sees an ad and concludes the switch does
 *     not work.
 *   - A card reported twice, once as the outer ytd-rich-item-renderer and once
 *     as the yt-lockup-view-model inside it, double-counts every hidden item
 *     and lets the guard badge a card inside a card. FeedItem.el promises
 *     "never a descendant of another item" and collect()'s ancestor check is
 *     the only thing holding that promise up.
 *   - items() reads the data-wa-feed stamp it never writes. If that skip
 *     breaks, every scroll re-classifies the whole feed, the hidden count
 *     climbs on its own, and the only symptom is the page getting slower.
 *   - matches() collapses www. and m. deliberately and must not collapse
 *     music. or studio.: YouTube Music is a different product and Studio is
 *     somebody's workplace. That exclusion is a consequence of bareHost
 *     stripping only three prefixes, so it is exactly the kind of thing a
 *     later "tidy-up" of that regex removes without noticing.
 *
 * Every fixture here is built by hand from the markup these four sites ship,
 * because the adapters are queries over a document and a document is the only
 * honest input for them. Nothing re-implements a selector list: the assertions
 * are on what items() returned, never on what a test thinks it should have
 * matched. The absence checks (a stamped card, a nested card, a host that is
 * not a feed) each run after a control on the same harness that proves the
 * instrument reports something when there is something to report.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { platformFor, type FeedItem, type PlatformAdapter } from '../src/feeds/platforms';

function docOf(body: string, url: string): Document {
  return new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, {
    url,
    pretendToBeVisual: true,
  }).window.document;
}

/** The shipped lookup, not a hand-picked adapter, so the tests use the real path in. */
function adapterFor(host: string): PlatformAdapter {
  const found = platformFor(host);
  if (!found) throw new Error(`no adapter matched ${host}, which the fixtures below depend on`);
  return found;
}

function byId(items: readonly FeedItem[], id: string): FeedItem {
  const found = items.find((i) => i.el.id === id);
  if (!found) throw new Error(`items() did not report #${id}; it reported [${items.map((i) => i.el.id).join(', ')}]`);
  return found;
}

/** True when any reported element sits inside another reported element. */
function anyNested(items: readonly FeedItem[]): boolean {
  return items.some((a, i) => items.some((b, j) => i !== j && a.el.contains(b.el)));
}

// ─── YouTube ─────────────────────────────────────────────────────────────────

const YT_FEED = `
<ytd-rich-item-renderer id="yt-video">
  <a id="video-title" href="/watch?v=aaa">Easy sourdough bread recipe for beginners</a>
  <ytd-channel-name><a href="/@breadlab">Bread Lab</a></ytd-channel-name>
  <ytd-thumbnail-overlay-time-status-renderer>12:34</ytd-thumbnail-overlay-time-status-renderer>
</ytd-rich-item-renderer>
<ytd-rich-item-renderer id="yt-short">
  <a id="video-title" href="/shorts/bbb">Sixty second pasta hack</a>
  <ytd-channel-name><a href="/@quickbites">Quick Bites</a></ytd-channel-name>
</ytd-rich-item-renderer>
<ytd-ad-slot-renderer id="yt-ad">
  <a id="video-title" href="/watch?v=ccc">Build a compiler in Rust from scratch</a>
  <ytd-channel-name><a href="/@abrand">A Brand</a></ytd-channel-name>
</ytd-ad-slot-renderer>
<ytd-video-renderer id="yt-live">
  <a id="video-title" href="/watch?v=ddd">Rocket launch, stream starts now</a>
  <ytd-channel-name><a href="/@spacecast">Space Cast</a></ytd-channel-name>
  <ytd-badge-supported-renderer>LIVE</ytd-badge-supported-renderer>
</ytd-video-renderer>`;

test('YouTube: a rich item reports its title, its channel, and kind video', () => {
  const items = adapterFor('www.youtube.com').items(docOf(YT_FEED, 'https://www.youtube.com/'));
  const video = byId(items, 'yt-video');
  assert.equal(video.title, 'Easy sourdough bread recipe for beginners');
  assert.equal(video.channel, 'Bread Lab');
  assert.equal(video.kind, 'video');
  // The duration badge is read, and a twelve minute one does not make a Short.
  // Length alone is the last signal ytKind consults for exactly this reason.
  assert.ok(video.meta.includes('12:34'), `the badge text is carried, got "${video.meta}"`);
});

test('YouTube: the three kinds the site marks for us are read from its own markup', () => {
  const items = adapterFor('www.youtube.com').items(docOf(YT_FEED, 'https://www.youtube.com/'));
  assert.equal(items.length, 4, 'all four cards are reported');
  assert.equal(byId(items, 'yt-short').kind, 'short', 'a /shorts/ href is a Short');
  // Its title reads as CODING to the classifier. The kind must come from the
  // element the site chose, not from anything readable on the card.
  assert.equal(byId(items, 'yt-ad').kind, 'ad', 'an ad slot renderer is an ad whatever its title says');
  assert.equal(byId(items, 'yt-live').kind, 'live', 'a LIVE badge is a live stream');
});

test('YouTube: no reported card contains another reported card', () => {
  const adapter = adapterFor('www.youtube.com');

  // Control: the instrument does report a bare yt-lockup-view-model, so the
  // single item below is the outer card winning rather than the newer element
  // going unrecognised.
  const alone = adapter.items(
    docOf(
      `<yt-lockup-view-model id="lockup">
         <a class="yt-lockup-metadata-view-model__title" href="/watch?v=eee">Nested lockup title</a>
       </yt-lockup-view-model>`,
      'https://www.youtube.com/',
    ),
  );
  assert.equal(alone.length, 1, 'a lockup on its own is a card');
  assert.equal(alone[0].el.id, 'lockup');

  const wrapped = adapter.items(
    docOf(
      `<ytd-rich-item-renderer id="outer">
         <yt-lockup-view-model id="inner">
           <a class="yt-lockup-metadata-view-model__title" href="/watch?v=eee">Nested lockup title</a>
         </yt-lockup-view-model>
       </ytd-rich-item-renderer>`,
      'https://www.youtube.com/',
    ),
  );
  assert.equal(wrapped.length, 1, 'the same lockup inside a rich item is one card, not two');
  assert.equal(wrapped[0].el.id, 'outer', 'and it is the outer card, the one that can be hidden whole');

  // The same invariant over a feed with several cards. Control first: there
  // are pairs to compare, so a false from anyNested is a real answer and not
  // an empty list agreeing with everything.
  const feed = adapter.items(docOf(YT_FEED, 'https://www.youtube.com/'));
  assert.ok(feed.length > 1, 'the fixture reports more than one card');
  assert.equal(anyNested(feed), false, 'no card reported is inside another card reported');
});

test('YouTube: a card already stamped data-wa-feed is not reported again', () => {
  const adapter = adapterFor('www.youtube.com');
  const card = (stamp: string) =>
    `<ytd-rich-item-renderer id="card"${stamp}>
       <a id="video-title" href="/watch?v=fff">Easy sourdough bread recipe for beginners</a>
       <ytd-channel-name><a href="/@breadlab">Bread Lab</a></ytd-channel-name>
     </ytd-rich-item-renderer>`;

  // Control: the identical card with no stamp is reported, so the zero below
  // is the stamp being honoured and not a fixture the selectors never matched.
  const fresh = adapter.items(docOf(card(''), 'https://www.youtube.com/'));
  assert.equal(fresh.length, 1, 'an unjudged card is reported');

  const judged = adapter.items(docOf(card(' data-wa-feed="pass"'), 'https://www.youtube.com/'));
  assert.equal(judged.length, 0, 'the same card, already judged, is skipped');
});

// ─── TikTok ──────────────────────────────────────────────────────────────────

test('TikTok: a feed card reports its caption, its author, and short unless tagged an ad', () => {
  const items = adapterFor('www.tiktok.com').items(
    docOf(
      `<div data-e2e="recommend-list-item-container" id="tt-post">
         <div data-e2e="video-desc">15 minute kettlebell workout</div>
         <h3 data-e2e="video-author-uniqueid">liftwithmei</h3>
         <strong data-e2e="video-views">1.2M</strong>
       </div>
       <div data-e2e="recommend-list-item-container" id="tt-ad">
         <div data-e2e="video-desc">Our new energy drink</div>
         <h3 data-e2e="video-author-uniqueid">bigbrand</h3>
         <span data-e2e="ad-tag">Sponsored</span>
       </div>`,
      'https://www.tiktok.com/',
    ),
  );
  assert.equal(items.length, 2);

  const post = byId(items, 'tt-post');
  assert.equal(post.title, '15 minute kettlebell workout');
  assert.equal(post.channel, 'liftwithmei');
  // Every video on TikTok is short form, which is what the adapter says here
  // rather than pretending some of them are not.
  assert.equal(post.kind, 'short');

  const ad = byId(items, 'tt-ad');
  assert.equal(ad.title, 'Our new energy drink');
  assert.equal(ad.channel, 'bigbrand');
  assert.equal(ad.kind, 'ad', 'the ad tag outranks the short-form default');
});

// ─── Instagram ───────────────────────────────────────────────────────────────

test('Instagram: an article reports its caption, its account, and reel or post', () => {
  const items = adapterFor('instagram.com').items(
    docOf(
      `<main>
         <article id="ig-post">
           <header><a role="link" href="/breadlab/">breadlab</a></header>
           <img alt="Photo by breadlab on May 1, 2026." src="a.jpg">
           <h1>Sourdough at home, start to finish</h1>
         </article>
         <article id="ig-reel">
           <header><a role="link" href="/reelmaker/">reelmaker</a></header>
           <a href="/reel/ABC123/"><img alt="May be a video of a dog." src="b.jpg"></a>
           <h1>Puppy does a backflip</h1>
         </article>
         <article id="ig-nav-lookalike"><h1>No media here</h1></article>
       </main>`,
      'https://www.instagram.com/',
    ),
  );

  const post = byId(items, 'ig-post');
  assert.equal(post.title, 'Sourdough at home, start to finish');
  assert.equal(post.channel, 'breadlab');
  assert.equal(post.kind, 'post');
  assert.ok(post.meta.startsWith('Photo by breadlab'), 'the alt text is kept, often the only description a post has');

  const reel = byId(items, 'ig-reel');
  assert.equal(reel.title, 'Puppy does a backflip');
  assert.equal(reel.channel, 'reelmaker');
  assert.equal(reel.kind, 'short', 'a /reel/ link is short-form');

  // The reader rejects an article with no media, which is what keeps the loose
  // `main div[role="button"]` selector from reporting the page furniture. The
  // two controls above prove the same harness does report articles.
  assert.equal(
    items.some((i) => i.el.id === 'ig-nav-lookalike'),
    false,
    'an article with no image, video or post link is not a card',
  );
});

// ─── X ───────────────────────────────────────────────────────────────────────

test('X: a tweet reports its text, its author, and promoted as an ad', () => {
  const items = adapterFor('x.com').items(
    docOf(
      `<article data-testid="tweet" id="x-post">
         <div data-testid="User-Name">Jane Doe @janedoe</div>
         <div data-testid="tweetText">Shipped the parser rewrite today</div>
         <time datetime="2026-01-15T10:00:00Z">2h</time>
       </article>
       <article data-testid="tweet" id="x-ad">
         <div data-testid="placementTracking">
           <div data-testid="User-Name">Big Brand @bigbrand</div>
           <div data-testid="tweetText">Our new energy drink</div>
         </div>
       </article>`,
      'https://x.com/',
    ),
  );
  assert.equal(items.length, 2);

  const post = byId(items, 'x-post');
  assert.equal(post.title, 'Shipped the parser rewrite today');
  assert.equal(post.channel, 'Jane Doe @janedoe');
  // A tweet with a video attached is still a tweet: there is no card type on X
  // that says otherwise, and inventing one would hide videos under a switch
  // that does not mention them.
  assert.equal(post.kind, 'post');

  const ad = byId(items, 'x-ad');
  assert.equal(ad.title, 'Our new energy drink');
  assert.equal(ad.channel, 'Big Brand @bigbrand');
  assert.equal(ad.kind, 'ad');
});

// ─── Host matching ───────────────────────────────────────────────────────────

/**
 * The four gaps a selector diff against an independently maintained shipping
 * build turned up on 2026-08-30. Each one is a switch that silently did nothing
 * on a whole surface, which is the failure mode this subsystem is most exposed
 * to: a drifted selector hides nothing and says nothing.
 */
test('YouTube: the Shorts player item is a Short, not just the shelf entry', () => {
  const adapter = adapterFor('www.youtube.com');

  // Control: the shelf entry was always found, so a hit below is the player
  // item being added rather than the instrument recognising anything reel-ish.
  const shelf = adapter.items(
    docOf(`<ytd-reel-item-renderer id="shelf"><span id="video-title">Shelf short</span></ytd-reel-item-renderer>`, 'https://www.youtube.com/'),
  );
  assert.equal(shelf.length, 1, 'the shelf entry is a card');
  assert.equal(shelf[0].kind, 'short');

  // The claim: inside /shorts the player item is its own element, and hiding
  // the shelves while leaving this working kept half the switch's promise.
  const player = adapter.items(
    docOf(
      `<ytd-reel-video-renderer id="player">
         <span id="video-title">Player short</span>
         <ytd-channel-name><a>Someone</a></ytd-channel-name>
       </ytd-reel-video-renderer>`,
      'https://www.youtube.com/shorts/abc',
    ),
  );
  assert.equal(player.length, 1, 'the Shorts player item is a card');
  assert.equal(player[0].kind, 'short', 'and it is short form');
  assert.equal(player[0].title, 'Player short');
});

test('YouTube: the up-next rail is not only videos', () => {
  const adapter = adapterFor('www.youtube.com');
  const items = adapter.items(
    docOf(
      `<ytd-compact-movie-renderer id="movie"><span id="video-title">A movie</span></ytd-compact-movie-renderer>
       <ytd-compact-playlist-renderer id="list"><span id="video-title">A playlist</span></ytd-compact-playlist-renderer>
       <ytd-compact-radio-renderer id="mix"><span id="video-title">A mix</span></ytd-compact-radio-renderer>`,
      'https://www.youtube.com/watch?v=abc',
    ),
  );
  assert.equal(items.length, 3, 'a movie, a playlist and a mix are all cards to be judged');
  assert.deepEqual(
    items.map((i) => i.title).sort(),
    ['A mix', 'A movie', 'A playlist'],
  );
});

test('TikTok: the explore grid is judged, and reports its own caption and author', () => {
  const adapter = adapterFor('www.tiktok.com');

  // Control: a For You card was always found, so a hit below is the explore
  // grid being added and not the card query matching everything.
  const foryou = adapter.items(
    docOf(
      `<div data-e2e="recommend-list-item-container" id="fy"><span data-e2e="video-desc">For you caption</span></div>`,
      'https://www.tiktok.com/',
    ),
  );
  assert.equal(foryou.length, 1, 'a For You card is a card');

  const explore = adapter.items(
    docOf(
      `<div data-e2e="explore-item" id="ex">
         <span data-e2e="explore-card-desc">Sourdough from scratch</span>
         <a data-e2e="explore-card-user-unique-id">bakerman</a>
       </div>`,
      'https://www.tiktok.com/explore',
    ),
  );
  assert.equal(explore.length, 1, 'an explore card is a card');
  assert.equal(explore[0].title, 'Sourdough from scratch');
  assert.equal(explore[0].channel, 'bakerman');
  assert.equal(explore[0].kind, 'short');
});

test('TikTok: hide messages targets both spellings of the nav hook', () => {
  const messages = adapterFor('www.tiktok.com').chrome.messages;
  // Both, because which one TikTok ships has changed, and a hook that is merely
  // the wrong plural turns the switch into one that does nothing and says
  // nothing. The control is the assertion above it: the list is not simply
  // everything.
  assert.ok(messages.length >= 2, 'the list is specific rather than a catch-all');
  assert.ok(messages.includes('[data-e2e="nav-message"]'), 'singular');
  assert.ok(messages.includes('[data-e2e="nav-messages"]'), 'plural');
});

test('platformFor matches a platform on its own hosts, and only there', () => {
  // Controls first, so every null below is the matcher declining rather than
  // the lookup being broken for everything.
  assert.equal(platformFor('youtube.com')?.id, 'youtube');
  assert.equal(platformFor('www.youtube.com')?.id, 'youtube', 'www. collapses');
  assert.equal(platformFor('m.youtube.com')?.id, 'youtube', 'm. collapses');
  assert.equal(platformFor('www.tiktok.com')?.id, 'tiktok');
  assert.equal(platformFor('www.instagram.com')?.id, 'instagram');
  // Both hosts, because the rename left the old one working and a person's
  // bookmarks still point at it.
  assert.equal(platformFor('x.com')?.id, 'x');
  assert.equal(platformFor('twitter.com')?.id, 'x');
  assert.equal(platformFor('mobile.twitter.com')?.id, 'x', 'mobile. collapses');

  // YouTube Music is a different product and its feed is a music library, so
  // filtering it would hide somebody's playlists under a switch about videos.
  assert.equal(platformFor('music.youtube.com'), null, 'music. is not the YouTube feed');
  assert.equal(platformFor('studio.youtube.com'), null, 'studio. is somebody at work');
  assert.equal(platformFor('example.com'), null, 'an unrelated host has no adapter');
  assert.equal(platformFor(''), null, 'and neither does no host at all');
});
