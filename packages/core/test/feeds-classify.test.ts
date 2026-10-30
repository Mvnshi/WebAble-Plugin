/**
 * The rule: the classifier answers from the lexicon, shape outranks topic, a
 * human correction outranks both, and when nothing scores it says GENERAL with
 * a confidence of 0 rather than picking something. Every id in the taxonomy has
 * to be an answer the classifier can actually give.
 *
 * Why it exists: with an allowlist in force, `decide()` in runtime.ts hides
 * every card the classifier could not place, so this file is the only thing
 * standing between a person's Focus list and an empty feed. Two failures here
 * are invisible from the outside and both look like the product working.
 *
 * The first is a dead category. categories.ts says in its own header that the
 * reference product ships a Shopping chip and a Gambling chip whose ids its
 * classifier never emits, so pressing either hides nothing forever and nothing
 * says so. This taxonomy claims not to have that defect. Nothing else in the
 * repo checks the claim, and a category id renamed in categories.ts but not in
 * the LEXICON is silently skipped by the index builder (`if
 * (!KNOWN_CATEGORIES.has(category)) continue`), which produces exactly that
 * dead chip with no error anywhere.
 *
 * The second is a correction that stops applying. The corrections map is the
 * user telling us we were wrong; re-deriving the answer they already overruled
 * is the one behaviour guaranteed to make the feature feel broken, and it would
 * show up as the badge simply being wrong again, which is what it looked like
 * before they corrected it.
 *
 * There is no storage double in this file and no DOM. Everything under test is
 * pure and takes its inputs by argument, so the fixtures are the real inputs
 * the runtime passes and there is nothing standing in for chrome.storage that
 * could be more permissive than it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, clickbaitScore, fingerprint, tokenize, LOW_CONFIDENCE } from '../src/feeds/classify';
import { CATEGORY_IDS, GENERAL } from '../src/feeds/categories';

/** A card that reads unambiguously as GAMING, used as the thing a correction has to beat. */
const GAMING_CARD = { title: 'Minecraft gameplay speedrun', channel: 'SomeGamer' };

/**
 * The same cooking title in three shapes, so the clickbait tests can move one
 * variable at a time. Caps plus a punctuation run is 0.5, under the 0.6
 * takeover; the leading emoji adds 0.15 and tips it over. The words are
 * identical in all three, and tokenize lowercases, so the topical score cannot
 * be what changed.
 */
const COOKING_PLAIN = 'Sourdough bread recipe for beginners';
const COOKING_LOUD = 'SOURDOUGH bread recipe for beginners!!!';
const COOKING_BAIT = '\u{1F525} SOURDOUGH bread recipe for beginners!!!';

test('a correction outranks the lexicon, however strongly the lexicon read the card', () => {
  // Control: the instrument does place this card, and places it firmly, so the
  // move below is a correction winning rather than a classifier that answers
  // whatever it is handed.
  const uncorrected = classify(GAMING_CARD);
  assert.equal(uncorrected.category, 'GAMING', 'the lexicon reads this as gaming');
  assert.ok(uncorrected.confidence > 0.8, `and reads it confidently, got ${uncorrected.confidence}`);
  assert.ok(uncorrected.matched.includes('speedrun'), 'and says which term decided it');

  // An empty map is not a correction. If this returned EDU the test below would
  // pass for the wrong reason.
  assert.equal(classify(GAMING_CARD, {}).category, 'GAMING');

  const corrected = classify(GAMING_CARD, { [fingerprint(GAMING_CARD)]: 'EDU' });
  assert.equal(corrected.category, 'EDU', 'the user said education, so it is education');
  assert.equal(corrected.confidence, 1, 'a confidence of exactly 1 is reserved for a human saying so');
  assert.deepEqual(corrected.matched, ['corrected']);
  assert.deepEqual(corrected.alternates, [], 'nothing was scored, so there is nothing to offer as a runner up');

  // A correction belongs to one card. Same channel, different title, no effect.
  const other = { title: 'Elden Ring boss fight', channel: 'SomeGamer' };
  assert.equal(classify(GAMING_CARD, { [fingerprint(other)]: 'EDU' }).category, 'GAMING');
});

test('a correction outranks the clickbait takeover too', () => {
  // Control: with no corrections this card is taken over by its shape, which is
  // the strongest verdict the classifier produces on its own.
  const shaped = classify({ title: COOKING_BAIT });
  assert.equal(shaped.category, 'CLICKBAIT');

  const fixed = classify({ title: COOKING_BAIT }, { [fingerprint({ title: COOKING_BAIT })]: 'COOKING' });
  assert.equal(fixed.category, 'COOKING', 'the correction is checked before anything is scored');
  assert.equal(fixed.confidence, 1);
});

test('a fingerprint is stable, ignores case and surrounding whitespace, and is per channel', () => {
  const card = { title: 'Hello World', channel: 'Chan' };

  // Control first: the instrument does distinguish cards. If it returned one
  // constant, every "same fingerprint" assertion below would pass while every
  // correction in the product applied to every card on the page.
  assert.notEqual(
    fingerprint(card),
    fingerprint({ title: 'Hello World', channel: 'Other' }),
    'same title, different channel, must be a different key',
  );
  assert.notEqual(
    fingerprint(card),
    fingerprint({ title: 'Goodbye World', channel: 'Chan' }),
    'same channel, different title, must be a different key',
  );

  assert.equal(fingerprint(card), fingerprint(card), 'stable across calls');
  assert.equal(
    fingerprint(card),
    fingerprint({ title: '  hello   world  ', channel: '  CHAN ' }),
    'case and surrounding whitespace must not move the key, or a correction dies on the next render',
  );
});

test('clickbait shape takes over a topical title, and the topic survives as the first alternate', () => {
  // Control: the same words, without the shape, land on the topic. This is the
  // difference the test claims to measure, so it is measured rather than
  // assumed.
  const plain = classify({ title: COOKING_PLAIN });
  assert.equal(plain.category, 'COOKING');
  assert.equal(clickbaitScore(COOKING_PLAIN).score, 0, 'nothing about the plain title is shape');

  // Second control: shape below the takeover threshold does not take over.
  // 0.25 for the caps run plus 0.25 for the punctuation run is 0.5.
  assert.deepEqual(clickbaitScore(COOKING_LOUD), { score: 0.5, signals: ['all-caps', 'punctuation-run'] });
  assert.equal(classify({ title: COOKING_LOUD }).category, 'COOKING', 'loud is not yet clickbait');

  // The leading emoji is worth 0.15 and puts it over 0.6.
  assert.deepEqual(clickbaitScore(COOKING_BAIT), {
    score: 0.65,
    signals: ['all-caps', 'punctuation-run', 'emoji-bookend'],
  });
  const bait = classify({ title: COOKING_BAIT });
  assert.equal(bait.category, 'CLICKBAIT');
  assert.equal(bait.alternates[0], 'COOKING', 'clickbait about cooking is still cooking to whoever allowed cooking');
  assert.equal(bait.confidence, 0.65, 'the confidence is the shape score, not a fresh number');
  assert.ok(bait.confidence < 1, 'shape alone never claims the certainty reserved for a human correction');
  assert.deepEqual(bait.matched, ['all-caps', 'punctuation-run', 'emoji-bookend'], 'and it says which signals fired');
});

test('nothing scored is GENERAL at confidence 0, not a guess', () => {
  // Control: the instrument produces a non-zero on a title it can read. Without
  // this, a classifier that had thrown on module load and answered GENERAL to
  // everything would pass the two assertions below.
  const scored = classify({ title: COOKING_PLAIN });
  assert.equal(scored.category, 'COOKING');
  assert.ok(scored.confidence > 0, `the same call path produces a non-zero, got ${scored.confidence}`);

  const emoji = classify({ title: '\u{1F525}\u{1F525}\u{1F525}' });
  assert.equal(emoji.category, GENERAL, 'GENERAL, never OTHER: OTHER is a conclusion only the AI path can reach');
  assert.equal(emoji.confidence, 0);
  assert.deepEqual(emoji.matched, []);
  assert.deepEqual(emoji.alternates, []);

  const cjk = classify({ title: '日本語のタイトル' });
  assert.equal(cjk.category, GENERAL, 'a lexicon that only speaks English has not identified this, it has run out of words');
  assert.equal(cjk.confidence, 0);

  // Where the zero comes from: both titles tokenize to nothing at all.
  assert.deepEqual(tokenize('\u{1F525}\u{1F525}\u{1F525}'), []);
  assert.deepEqual(tokenize('日本語のタイトル'), []);
});

test('tokenize strips diacritics and drops one-character tokens', () => {
  // Control: the instrument does keep short tokens, so "the one-letter words
  // are gone" below is a rule and not an empty result.
  assert.deepEqual(tokenize('ok go'), ['ok', 'go'], 'two characters is the shortest token that survives');

  assert.deepEqual(tokenize('Café RÉSUMÉ'), ['cafe', 'resume'], 'de-accented, not dropped');
  assert.deepEqual(tokenize('a I ok'), ['ok'], 'single characters go');
  // A possessive leaves an "s" behind when split naively. The apostrophe is
  // stripped rather than split on, so this stays one token.
  assert.deepEqual(tokenize("let's"), ['lets']);
});

/**
 * One title per category, each a single lexicon term, so a category with no
 * reachable terms fails here by name.
 *
 * Kept as data rather than derived from the lexicon: LEXICON is not exported,
 * and deriving the probe from the same table the classifier reads would prove
 * only that the table equals itself.
 */
const REACHABLE: Record<string, string> = {
  EDU: 'calculus',
  SCIENCE: 'quantum',
  DOCUMENTARY: 'documentary',
  HISTORY: 'medieval',
  PODCAST: 'podcast',
  CODING: 'javascript',
  TECH: 'smartphone',
  AI: 'chatgpt',
  STARTUP: 'founder',
  FINANCE: 'dividend',
  CRYPTO: 'bitcoin',
  REALESTATE: 'escrow',
  DIY: 'woodworking',
  ART: 'watercolor',
  HEALTH: 'cholesterol',
  FITNESS: 'deadlift',
  COOKING: 'sourdough',
  TRAVEL: 'backpacking',
  NATURE: 'waterfall',
  ANIMALS: 'puppy',
  FASHION: 'ootd',
  CARS: 'horsepower',
  LIFE: 'journaling',
  MOTIVATION: 'discipline',
  RELATIONSHIP: 'situationship',
  MUSIC: 'acoustic',
  COMEDY: 'standup',
  SPORT: 'basketball',
  GAMING: 'speedrun',
  ENTERTAINMENT: 'netflix',
  SHOPPING: 'coupon',
  NEWS: 'headlines',
  POLITICS: 'senator',
  GOSSIP: 'paparazzi',
  CLICKBAIT: 'clickbait',
  GAMBLING: 'roulette',
  AD: 'sponsored',
};

test('every category the picker offers is an answer the classifier can give', () => {
  // The table has to track the taxonomy, or a category added to categories.ts
  // would be untested here and could ship as a chip that hides nothing.
  assert.deepEqual(
    Object.keys(REACHABLE).slice().sort(),
    CATEGORY_IDS.slice().sort(),
    'the probe table and the taxonomy have drifted apart',
  );

  const unreachable: string[] = [];
  for (const id of CATEGORY_IDS) {
    const verdict = classify({ title: REACHABLE[id] });
    if (verdict.category !== id) unreachable.push(`${id} (asked for "${REACHABLE[id]}", got ${verdict.category})`);
  }
  assert.deepEqual(unreachable, [], `categories the user can select and never see: ${unreachable.join(', ')}`);
});

test('LOW_CONFIDENCE separates a read from a guess on real titles', () => {
  // Above: three converging terms in a title somebody would actually post.
  const read = classify({ title: COOKING_PLAIN });
  assert.equal(read.category, 'COOKING');
  assert.ok(read.confidence > LOW_CONFIDENCE, `a read should clear ${LOW_CONFIDENCE}, got ${read.confidence}`);

  // Below: one three-letter word, which is the short slangy case the file's
  // header admits is its weakest. It still answers, and the answer is still
  // flagged as a guess, which is what gates the optional AI assist.
  const guess = classify({ title: 'back in the gym' });
  assert.equal(guess.category, 'FITNESS');
  assert.ok(guess.confidence > 0, 'it did score something, so the low number is a weak read and not a zero');
  assert.ok(guess.confidence < LOW_CONFIDENCE, `one short word should stay under ${LOW_CONFIDENCE}, got ${guess.confidence}`);
});
