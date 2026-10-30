/**
 * The dictation finishing pipeline.
 *
 * The load-bearing behaviour is that user-supplied text is never rewritten by a
 * later pass, and that the passes which fire on ordinary English words are
 * bounded by an escape the user can actually reach. Everything else is
 * spelling.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finishDictation, opensSentenceAfter, applyDictionary } from '../src/index';
import type { Snippet, Correction } from '../src/index';

/* ---- spoken punctuation ---------------------------------------------------- */

test('spoken punctuation becomes marks, tight against the word before', () => {
  assert.equal(finishDictation('hello there period'), 'Hello there.');
  assert.equal(finishDictation('wait comma really question mark'), 'Wait, really?');
  assert.equal(
    finishDictation('stop exclamation point'),
    'Stop!',
  );
  assert.equal(finishDictation('one colon two semicolon three'), 'One: two; three');
});

test('multi-word commands win over the single words inside them', () => {
  // "exclamation point" must never be read as "point", and "new paragraph"
  // must never be read as "new" followed by a stray word.
  assert.equal(finishDictation('go exclamation point'), 'Go!');
  assert.equal(finishDictation('done new paragraph next'), 'Done\n\nNext');
});

test('new line and new paragraph break the text, and open a sentence', () => {
  // A break capitalises what follows, the same as a full stop does. What people
  // dictate breaks into is lists, addresses and verse, where that is wanted.
  assert.equal(finishDictation('one new line two'), 'One\nTwo');
  assert.equal(finishDictation('one new paragraph two'), 'One\n\nTwo');
});

test('brackets and quotes sit tight against what they enclose', () => {
  assert.equal(finishDictation('note open paren aside close paren done'), 'Note (aside) done');
});

test('a punctuation word after a determiner is a noun, not a command', () => {
  // The commonest way this feature embarrasses itself, and the cheapest half of
  // it to fix without prosody.
  assert.equal(finishDictation('after a period of time'), 'After a period of time');
  assert.equal(finishDictation('the comma is missing'), 'The comma is missing');
  assert.equal(finishDictation('every dash counts'), 'Every dash counts');
  // Still a command when nothing marks it as a noun.
  assert.equal(finishDictation('done period'), 'Done.');
});

test('a word that can end a sentence never blocks the command after it', () => {
  // The membership rule for the guard. Each of these is a determiner that can
  // also stand alone as a pronoun, which makes the punctuation reading the
  // common one rather than the rare one: a numbered list, and two ordinary
  // sentences that happen to end on a pronoun.
  assert.equal(finishDictation('one period two period three'), 'One. Two. Three');
  assert.equal(finishDictation('i saw her period'), 'I saw her.');
  assert.equal(finishDictation('i said this period'), 'I said this.');
  assert.equal(finishDictation('give me another period'), 'Give me another.');
});

test('a mark the recogniser already wrote is not written twice', () => {
  // Observed, not imagined: the macOS 26 stack auto-punctuates, and fed
  // synthesised "hello comma this works period" it returned "Hello, this works
  // period." with its own full stop after the surviving command word. The
  // command converts, the recogniser's mark is already there, and the document
  // gets "works..". The command word is consumed and the existing mark speaks
  // for both.
  assert.equal(finishDictation('Hello, this works period.'), 'Hello, this works.');
  assert.equal(finishDictation('It works period. Next thing'), 'It works. Next thing');
  assert.equal(finishDictation('wait comma, really'), 'Wait, really');
  // Only an identical mark absorbs the command. A different one is kept: the
  // user asked for it, and second-guessing which of the two was meant is how
  // punctuation goes missing.
  assert.equal(finishDictation('really question mark.'), 'Really?.');
  // The ellipsis is three identical marks on purpose, and the lookahead must
  // not eat it one dot at a time.
  assert.equal(finishDictation('wait dot dot dot'), 'Wait...');
});

test('"literally" writes the word rather than the mark', () => {
  // The escape exists because the determiner guard cannot catch "grace period",
  // and a user who has hit that needs some way to say the word at all.
  assert.equal(finishDictation('a grace literally period ended'), 'A grace period ended');
  assert.equal(finishDictation('say literally comma out loud'), 'Say comma out loud');
  // Two-word commands escape too.
  assert.equal(finishDictation('type literally question mark here'), 'Type question mark here');
});

test('"literally" in front of an ordinary word keeps its adverb', () => {
  assert.equal(finishDictation('it literally exploded'), 'It literally exploded');
  assert.equal(finishDictation('literally everything works'), 'Literally everything works');
});

test('punctuation can be turned off entirely', () => {
  assert.equal(
    finishDictation('hello there period', { punctuation: false }),
    'Hello there period',
  );
});

/* ---- fillers --------------------------------------------------------------- */

test('hesitation sounds are dropped, and the gap closes', () => {
  assert.equal(finishDictation('um so uh the thing is'), 'So the thing is');
  assert.equal(finishDictation('erm hello'), 'Hello');
});

test('filler removal never eats a word that carries meaning', () => {
  // The tempting additions are all real phrases far more often than they are
  // filler, and a cleanup pass that eats them changes what somebody said.
  assert.equal(finishDictation('it works like this'), 'It works like this');
  assert.equal(finishDictation('you know the answer'), 'You know the answer');
  assert.equal(finishDictation('i mean it'), 'I mean it');
  // And a filler spelled inside a longer word survives, since the match is
  // bounded: "umbrella" is not "um".
  assert.equal(finishDictation('the umbrella broke'), 'The umbrella broke');
});

test('fillers can be turned off', () => {
  assert.equal(finishDictation('um hello', { fillers: false }), 'Um hello');
});

/* ---- capitalisation -------------------------------------------------------- */

test('sentences open in capitals, including after a spoken full stop', () => {
  assert.equal(finishDictation('one period two period three'), 'One. Two. Three');
  assert.equal(finishDictation('what question mark yes'), 'What? Yes');
});

test('the standalone pronoun is raised', () => {
  assert.equal(finishDictation('i think i can'), 'I think I can');
  // Not the letter inside a word.
  assert.equal(finishDictation('this is fine'), 'This is fine');
});

test('capitalisation can be turned off', () => {
  assert.equal(finishDictation('hello there', { capitalize: false }), 'hello there');
});

/* ---- snippets -------------------------------------------------------------- */

const snippets: Snippet[] = [
  { say: 'my email', write: 'ada@example.com' },
  { say: 'sign off', write: 'Kind regards,\nAda' },
];

test('a trigger phrase writes its block', () => {
  assert.equal(
    finishDictation('reach me at my email', { snippets }),
    'Reach me at ada@example.com',
  );
});

test('a snippet body is never rewritten by a later pass', () => {
  // The whole reason the pipeline carries a literal mask. Each of these is a
  // broken output in a pipeline that resolves snippets to a plain string.
  //
  // Capitalisation would raise the address at a sentence opening.
  assert.equal(
    finishDictation('my email', { snippets }),
    'ada@example.com',
  );
  // Spacing repair would glue a body that begins with a full stop onto the
  // previous word, because "no space before a full stop" cannot tell a spoken
  // mark from one the user typed.
  assert.equal(
    finishDictation('we use dot net', {
      snippets: [{ say: 'dot net', write: '.NET' }],
    }),
    'We use .NET',
  );
  // And the punctuation pass would rewrite a body containing a command word.
  assert.equal(
    finishDictation('add disclaimer', {
      snippets: [{ say: 'disclaimer', write: 'Reply within a period of 30 days.' }],
    }),
    'Add Reply within a period of 30 days.',
  );
});

test('a snippet trigger survives the passes that would rewrite it', () => {
  // Snippets run first precisely so a trigger containing a command word still
  // fires. Resolved after punctuation, this trigger no longer exists.
  assert.equal(
    finishDictation('insert period notice', {
      snippets: [{ say: 'period notice', write: 'See the notice.' }],
    }),
    'Insert See the notice.',
  );
});

test('the longest trigger wins, and a trigger inside a word does not fire', () => {
  const overlapping: Snippet[] = [
    { say: 'my email', write: 'ada@example.com' },
    { say: 'email', write: 'electronic mail' },
  ];
  assert.equal(finishDictation('my email', { snippets: overlapping }), 'ada@example.com');
  assert.equal(finishDictation('emailing', { snippets: overlapping }), 'Emailing');
});

test('a multi-line snippet keeps its own line breaks', () => {
  assert.equal(
    finishDictation('sign off', { snippets }),
    'Kind regards,\nAda',
  );
});

/* ---- the personal dictionary ----------------------------------------------- */

const dictionary: Correction[] = [
  { heard: 'web able', meant: 'WebAble' },
  { heard: 'i phone', meant: 'iPhone' },
];

test('dictionary corrections apply, and their output is protected too', () => {
  assert.equal(finishDictation('open web able', { dictionary }), 'Open WebAble');
  // The case the mask exists for: a correction that opens a sentence keeps the
  // case the user gave it. Without protection this reads "IPhone".
  assert.equal(finishDictation('i phone works', { dictionary }), 'iPhone works');
});

test('the dictionary still refuses to rewrite the inside of a word', () => {
  assert.equal(
    finishDictation('comfortable chair', { dictionary: [{ heard: 'able', meant: 'ABLE' }] }),
    'Comfortable chair',
  );
});

/**
 * The pipeline matches by its own substitution routine rather than calling
 * `applyDictionary`, because it has to report which spans it wrote and a string
 * return cannot. That is a third implementation of one set of matching rules,
 * after the Rust one and `applyDictionary`, so it is pinned to the second.
 *
 * A divergence here is the kind that only ever shows up inside somebody's
 * document, which is the worst place to find one.
 */
test('substitution agrees with applyDictionary on their shared behaviour', () => {
  const corrections: Correction[] = [
    { heard: 'web able', meant: 'WebAble' },
    { heard: 'able', meant: 'Able' },
    { heard: 'sea sharp', meant: 'C#' },
  ];
  const cases = [
    'open web able',
    'able and web able',
    'comfortable',
    'sea sharp code',
    'nothing to correct',
    'WEB ABLE shouting',
  ];
  for (const input of cases) {
    // Compared with the structural passes off, since those are the pipeline's
    // additions rather than shared behaviour.
    const mine = finishDictation(input, {
      dictionary: corrections,
      punctuation: false,
      fillers: false,
      capitalize: false,
    });
    assert.equal(mine, applyDictionary(input, corrections), `diverged on: ${input}`);
  }
});

/* ---- structure ------------------------------------------------------------- */

test('runs of whitespace collapse and the edges are trimmed', () => {
  assert.equal(finishDictation('  hello    there  '), 'Hello there');
});

test('empty and whitespace-only input produce nothing', () => {
  assert.equal(finishDictation(''), '');
  assert.equal(finishDictation('   '), '');
  // Not "nothing at all": a turn that was only a filler has nothing to type,
  // and typing a bare space into somebody's document is worse than typing
  // nothing.
  assert.equal(finishDictation('um'), '');
});

/* ---- continuing a sentence ------------------------------------------------- */

test('a turn that continues a sentence keeps its first word lowercase', () => {
  // Dictation is additive. Capitalising unconditionally turns "hello" then
  // "there" into "Hello There", which is as wrong as never capitalising and
  // considerably harder to notice.
  assert.equal(finishDictation('there', { openSentence: false }), 'there');
  assert.equal(finishDictation('there', { openSentence: true }), 'There');
});

test('an in-turn sentence opening is capitalised even when the turn is not', () => {
  assert.equal(finishDictation('there period next', { openSentence: false }), 'there. Next');
});

test('opensSentenceAfter reads how the previous turn ended', () => {
  // Nothing before it is an opening: the first turn of a session, and the case
  // where the caret has moved somewhere we cannot see.
  assert.equal(opensSentenceAfter(''), true);
  assert.equal(opensSentenceAfter('   '), true);
  // A finished sentence, including the trailing space dictation always adds.
  assert.equal(opensSentenceAfter('Hello there. '), true);
  assert.equal(opensSentenceAfter('Really? '), true);
  assert.equal(opensSentenceAfter('Stop! '), true);
  assert.equal(opensSentenceAfter('A line\n'), true);
  // Trailing off mid-clause is a continuation.
  assert.equal(opensSentenceAfter('Hello there '), false);
  assert.equal(opensSentenceAfter('a list, '), false);
  // A closing quote or bracket may sit between the stop and the caret.
  assert.equal(opensSentenceAfter('He said "go." '), true);
  assert.equal(opensSentenceAfter('(an aside.) '), true);
});

/* ---- everything together --------------------------------------------------- */

test('everything at once, which is the actual shipped path', () => {
  assert.equal(
    finishDictation('um so i think web able is ready comma send it to my email period', {
      dictionary,
      snippets,
    }),
    'So I think WebAble is ready, send it to ada@example.com.',
  );
});
