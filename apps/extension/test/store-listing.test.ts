/**
 * The rule: the Chrome Web Store submission kit describes the extension that
 * actually ships. Every tool, every host it talks to, every permission.
 *
 * Why it exists: `marketing-claims.test.ts` holds the website to the registry
 * and nothing at all held STORE_LISTING.md to anything except its version
 * string. In that gap it drifted into stating that the user's Gemini API key
 * syncs across their signed-in devices, forty lines above its own privacy
 * certification that the key is never synced. The key had been moved to
 * device-local storage precisely because syncing a credential the panel calls
 * "stored only in this browser" is not acceptable, and the prose that Google
 * reviews still said the opposite. Nine shipped tools were also missing, and
 * two transmitting features (reading text out of an image, and voice input)
 * were not disclosed at all.
 *
 * These are keyword checks, not prose checks. They cannot tell whether a
 * sentence is true; they can tell when a tool exists and the listing has never
 * heard of it, or when the shipped bundle talks to a host the listing does not
 * name. Both of the real drifts above would have failed here on the day they
 * were written.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FEATURE_IDS, FEATURE_MAP, PROFILES } from '@webable/core';

const root = process.cwd();
const ext = join(root, 'apps/extension');
const listing = readFileSync(resolve(ext, 'STORE_LISTING.md'), 'utf8');
const lower = listing.toLowerCase();
const manifest = JSON.parse(readFileSync(resolve(ext, 'manifest.json'), 'utf8')) as {
  description: string;
  permissions: string[];
  host_permissions: string[];
  web_accessible_resources?: Array<{ resources: string[] }>;
  content_scripts: Array<{ all_frames: boolean }>;
};

/**
 * One phrase per feature that a listing describing it would have to contain.
 * Chosen to be the words a reader would use, not the words the code uses: the
 * point is that the capability is described somewhere, in language a person
 * shopping for it would search.
 */
const MENTIONS: Record<string, string[]> = {
  readerMode: ['reader mode'],
  fontSize: ['scale text'],
  readableFont: ['readable'],
  dyslexiaFont: ['opendyslexic'],
  bionicFlow: ['bionic'],
  textSpacing: ['letter, and word spacing'],
  textAlign: ['text alignment', 'alignment'],
  highlightLinks: ['highlight links'],
  highlightHeadings: ['highlight links and headings', 'headings'],
  readingGuide: ['reading guide'],
  readingMask: ['reading mask'],
  focusMode: ['focus mode'],
  magnifier: ['magnifier'],
  selectionBubble: ['select any text', 'selection'],
  clickDictionary: ['double-click any word'],
  tldrPin: ['summarize', 'summary'],
  darkMode: ['dark mode'],
  invertColors: ['invert'],
  highContrast: ['high contrast'],
  saturation: ['saturation'],
  colorFilter: ['color blindness filter'],
  customColors: ['your own text, heading, and background colors'],
  stopAnimations: ['stop animations'],
  hideImages: ['hide images'],
  hideDistractions: ['hide distractions'],
  highlightFocus: ['focus ring'],
  bigCursor: ['big cursor'],
  clickTargets: ['bigger click targets'],
  tooltipPin: ['pin tooltips', 'tooltips'],
  muteSounds: ['mute every video'],
  wallBreaker: ['sign-up walls'],
  feedOff: ['infinite feeds'],
  nagMute: ['notifications" nags', 'nags'],
  expandCollapse: ['show more'],
  cookieKill: ['cookie banners'],
  popupKill: ['promo popups'],
  stickyKill: ['sticky headers'],
  mediaSpeed: ['playback speed'],
  autoScroll: ['auto-scroll'],
  pictureInPicture: ['picture-in-picture'],
  volumeBoost: ['boost volume'],
  copyUnlock: ['unlock text selection'],
  forceZoom: ['pinch-to-zoom'],
};

test('every shipped tool is described in the store listing', () => {
  const missing = FEATURE_IDS.filter((id) => {
    const phrases = MENTIONS[id];
    if (!phrases) return true;
    return !phrases.some((p) => lower.includes(p.toLowerCase()));
  });
  assert.deepEqual(
    missing,
    [],
    `shipped but not described in STORE_LISTING.md (add the tool, or add its phrase to MENTIONS): ${missing
      .map((id) => `${id} (${FEATURE_MAP.get(id)?.meta.label})`)
      .join(', ')}`,
  );
});

test('the listing does not describe a tool that no longer exists', () => {
  const real = new Set(FEATURE_IDS);
  const ghosts = Object.keys(MENTIONS).filter((id) => !real.has(id));
  assert.deepEqual(ghosts, [], `MENTIONS still names removed features: ${ghosts.join(', ')}`);
});

test('every host the shipped bundle talks to is named in the listing', () => {
  // The disclosure a reviewer reads has to match the strings a reviewer can
  // grep out of the upload. Nothing else in this file can catch an undisclosed
  // endpoint; this can, because the bundle is the ground truth.
  const dist = resolve(ext, '../../extension');
  assert.ok(
    existsSync(dist),
    'extension/ is missing; run `node apps/extension/build.mjs` (npm run check does)',
  );
  const hosts = new Set<string>();
  for (const f of readdirSync(dist)) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(join(dist, f), 'utf8');
    for (const m of src.matchAll(/https:\/\/([a-z0-9.-]+)/gi)) hosts.add(m[1].toLowerCase());
  }
  assert.ok(hosts.size > 0, 'no hosts found in the bundle at all, which means this test is not looking at it');
  const undisclosed = [...hosts].filter((h) => !lower.includes(h));
  assert.deepEqual(
    undisclosed,
    [],
    `the bundle calls hosts the listing never mentions: ${undisclosed.join(', ')}`,
  );
});

test('the credential is never described as syncing', () => {
  // The exact drift this file was written for. The key lives in
  // chrome.storage.local on the device it was entered on; see content.ts.
  const syncSentences = listing
    .split('\n')
    .filter((line) => /storage\.sync|sync across|syncs?\b/i.test(line))
    .filter((line) => /api key|gemini key|gemini api/i.test(line))
    .filter((line) => !/does NOT sync|never sync|not sync/i.test(line));
  assert.deepEqual(syncSentences, [], `the listing says the API key syncs: ${syncSentences.join(' // ')}`);
});

test('every manifest permission is justified, and nothing is justified that is not requested', () => {
  for (const p of manifest.permissions) {
    assert.ok(lower.includes(`**${p}**`.toLowerCase()), `manifest requests "${p}" and the listing does not justify it`);
  }
  for (const h of manifest.host_permissions) {
    assert.ok(listing.includes(h), `manifest requests host permission "${h}" and the listing does not justify it`);
  }
  if (manifest.web_accessible_resources?.length) {
    assert.ok(
      lower.includes('web_accessible_resources'),
      'the manifest exposes resources to every site and the listing does not say what they are',
    );
  }
  // Anything the listing swears off must really be absent.
  const disclaimed = /Permissions deliberately NOT requested: ([^\n]*(?:\n\s{2}[^\n]*)*)/.exec(listing)?.[1] || '';
  for (const name of ['tabs', 'scripting', 'cookies', 'webRequest', 'history', 'bookmarks', 'activeTab']) {
    if (!disclaimed.includes(`\`${name}\``)) continue;
    assert.ok(
      !manifest.permissions.includes(name),
      `the listing says "${name}" is not requested, and the manifest requests it`,
    );
  }
});

test('the listing says where the tools run, because the answer is every frame', () => {
  // all_frames is a reviewer question: a content script in every frame of every
  // page is exactly the shape of something that needs explaining.
  assert.equal(manifest.content_scripts[0].all_frames, true, 'this test assumes all_frames; update it if that changes');
  assert.ok(lower.includes('every frame'), 'the listing does not say the content script runs in every frame');
});

test('the manifest description does not claim something the code does not do', () => {
  // It said "cookie blocking". No cookies permission is requested and none is
  // blocked; a banner is hidden. The manifest description is what
  // chrome://extensions shows and what prefills the dashboard, so it is part of
  // the listing whether or not the kit quotes it.
  assert.ok(manifest.description.length <= 132, 'the manifest description is over the 132 character store limit');
  assert.ok(
    !/cookie blocking|block cookies/i.test(manifest.description),
    'the manifest description claims cookie blocking, which needs a permission this extension does not request',
  );
  assert.ok(
    !manifest.permissions.includes('cookies'),
    'if a cookies permission is ever added, revisit the wording above',
  );
});

test('the listing lists the profiles the extension actually offers', () => {
  for (const p of PROFILES) {
    assert.ok(lower.includes(p.label.toLowerCase()), `profile "${p.label}" is not in the store listing`);
  }
});

test('no absolute "never reaches WebAble" claim survives a relay in the bundle', () => {
  /*
   * The host check above proves the relay is NAMED somewhere. It cannot tell
   * whether an older sentence elsewhere still says the opposite, and that is
   * exactly what happened twice in this file now.
   *
   * The first time, the Gemini key was moved to device-local storage and the
   * permission bullet went on saying it synced, forty lines above the privacy
   * certification saying it did not. The second time, a hosted relay was added
   * and disclosed thoroughly in the sections that were written for it, while
   * three older absolutes stood: "Nothing is sent to a WebAble server", "never
   * to WebAble", and "does not pass through a WebAble server". All three were
   * true when written. A feature landing elsewhere made them false, which is
   * the whole failure mode: nobody edits a sentence they did not think about.
   *
   * So: if the shipped bundle talks to a WebAble-owned host, an unqualified
   * denial that content reaches WebAble is a contradiction, and this fails.
   * Qualified statements are fine and are what the file now uses ("without a
   * subscription it goes to the user's own Google account and never to
   * WebAble"), which is why the patterns require the absolute form.
   */
  const dist = resolve(ext, '../../extension');
  assert.ok(existsSync(dist), 'extension/ is missing; npm run check builds it first');
  let relay = false;
  for (const f of readdirSync(dist)) {
    if (f.endsWith('.js') && /https:\/\/[a-z0-9.-]*webable\.cc/i.test(readFileSync(join(dist, f), 'utf8'))) {
      relay = true;
    }
  }
  if (!relay) return; // no relay shipped: the absolute claims are simply true

  const ABSOLUTES = [
    /(^|[^,;]\s)[Nn]othing is sent to a WebAble server/,
    /,\s*never to WebAble/,
    /does not pass through a WebAble server/,
  ];
  const offenders = listing
    .split('\n')
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => ABSOLUTES.some((re) => re.test(line)));

  assert.deepEqual(
    offenders,
    [],
    `the bundle talks to a WebAble host, so these lines contradict it: ${offenders
      .map((o) => `${o.n}: ${o.line}`)
      .join(' // ')}`,
  );
});
