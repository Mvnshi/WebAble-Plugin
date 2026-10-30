/**
 * Turning what was heard into what should be written.
 *
 * A recogniser returns a run of lowercase words with no punctuation. Every
 * dictation product ships that straight into the user's document and leaves
 * them to fix it by hand, which is why dictation has a reputation for being
 * faster to redo than to correct. The comparable macOS app lists punctuation,
 * filler removal and voice-triggered snippets as planned rather than shipped.
 * This is that layer, and it is the reason dictation here produces text a
 * person can leave alone.
 *
 * ## Protected regions, and why the whole file is built around them
 *
 * Four of the six passes rewrite text. Two of them insert text the *user*
 * supplied: a snippet body, and the right-hand side of a personal dictionary
 * entry. Those two must never be touched by the passes that follow, and the
 * failure when they are is not cosmetic:
 *
 * * A snippet for an email address, capitalised because it happened to land at
 *   the start of a sentence, is a broken address.
 * * A dictionary entry that writes `iPhone` becomes `IPhone` in the same spot.
 * * A snippet body ending in `.NET`, preceded by the "no space before a full
 *   stop" repair, becomes `something.NET` glued to the previous word.
 *
 * So substitution does not return a string. It returns pieces, each flagged as
 * spoken or literal, and every later pass is handed a character mask and may
 * only touch spoken characters. That is the single design decision this file
 * exists to make; everything else follows from it.
 *
 * ## Order
 *
 * 1. **Snippets**, before anything rewrites the trigger out from under them.
 *    A trigger containing the word "period" has to survive long enough to fire.
 * 2. **Dictionary**, whose output is protected for the same reason snippets are.
 * 3. **Punctuation commands**, before capitalisation, which depends on the
 *    sentence boundaries this pass creates.
 * 4. **Fillers**.
 * 5. **Spacing repair**, mask-aware.
 * 6. **Capitalisation**, mask-aware.
 */

import type { Correction } from './dictionary'

/** A block of text the user can write by saying its trigger phrase. */
export interface Snippet {
  /** What the user says. Matched case-insensitively, on word boundaries. */
  say: string
  /** What gets written. Inserted exactly as given and never rewritten after. */
  write: string
}

export interface DictateOptions {
  /** Personal dictionary, applied before the structural passes. */
  dictionary?: Correction[]
  /** Voice-triggered text blocks. */
  snippets?: Snippet[]
  /** Convert spoken punctuation ("period") to marks. */
  punctuation?: boolean
  /** Drop hesitation sounds. */
  fillers?: boolean
  /** Capitalise sentence openings and the standalone pronoun "i". */
  capitalize?: boolean
  /**
   * Whether this turn begins a sentence rather than continuing one.
   *
   * Dictation is additive: a turn is typed at a caret that already has text
   * behind it, and whether the first word is a sentence opening is a fact about
   * that text, not about this one. Capitalising unconditionally turns "hello"
   * then "there" into "Hello There", which is the same defect as never
   * capitalising, just in the other direction and harder to notice.
   *
   * The caller knows the answer better than this function can: see
   * `Dictation.opensSentence` in the desktop app, which tracks how its own last
   * insertion ended. Defaults true, because a turn with nothing before it is a
   * sentence opening and that is the commonest case.
   */
  openSentence?: boolean
}

/* ---- the pieces model ------------------------------------------------------ */

/**
 * A run of text, and whether later passes may rewrite it.
 *
 * `literal` marks text the user supplied verbatim through a snippet, a
 * dictionary entry, or a "literally" escape. It is carried all the way to the
 * end rather than being resolved early, because the passes that would damage it
 * are the last two.
 */
interface Piece {
  text: string
  literal: boolean
}

/** Word characters, for the boundary test shared by every substitution here. */
const isWordChar = (ch: string | undefined) => !!ch && /[a-z0-9]/i.test(ch)

/**
 * Case-insensitive, boundary-aware substitution that reports what it inserted.
 *
 * The matching rules are exactly `applyDictionary`'s, and deliberately so:
 * longest needle first so a short entry cannot chop up a longer one containing
 * it, and word boundaries on both sides so an entry never rewrites the inside
 * of an unrelated word. This is the third implementation of those rules in the
 * repository, after the Rust one and the TypeScript one, and the only reason it
 * exists rather than reusing `applyDictionary` is the return type: this one has
 * to say *which* spans it wrote, and a string cannot.
 *
 * `dictate.test.ts` holds the two in agreement on their shared behaviour, since
 * a divergence here is the kind that only shows up in somebody's document.
 */
function substitute(
  pieces: Piece[],
  pairs: { from: string; to: string }[],
): Piece[] {
  const entries = pairs
    .filter((p) => p.from?.trim())
    .slice()
    .sort((a, b) => b.from.trim().length - a.from.trim().length)
  if (!entries.length) return pieces

  const out: Piece[] = []
  for (const piece of pieces) {
    // Literal text is never a haystack: a snippet body that happens to contain
    // a dictionary entry's trigger is still the body the user typed.
    if (piece.literal) {
      out.push(piece)
      continue
    }
    const text = piece.text
    const lower = text.toLowerCase()
    let spoken = ''
    let i = 0

    outer: while (i < text.length) {
      for (const e of entries) {
        const needle = e.from.trim().toLowerCase()
        if (!lower.startsWith(needle, i)) continue
        const end = i + needle.length
        if (isWordChar(text[i - 1]) || isWordChar(text[end])) continue
        if (spoken) out.push({ text: spoken, literal: false })
        spoken = ''
        out.push({ text: e.to, literal: true })
        i = end
        continue outer
      }
      spoken += text[i]
      i += 1
    }
    if (spoken) out.push({ text: spoken, literal: false })
  }
  return out
}

/** Run a plain string rewrite over the spoken pieces only. */
function onSpoken(pieces: Piece[], f: (text: string) => string): Piece[] {
  return pieces.map((p) => (p.literal ? p : { text: f(p.text), literal: false }))
}

/* ---- spoken punctuation ---------------------------------------------------- */

/**
 * What each spoken command writes.
 *
 * Longest phrase wins, so "exclamation point" is never read as "point".
 */
const PUNCTUATION: Record<string, string> = {
  period: '.',
  'full stop': '.',
  comma: ',',
  'question mark': '?',
  'exclamation mark': '!',
  'exclamation point': '!',
  colon: ':',
  semicolon: ';',
  'semi colon': ';',
  hyphen: '-',
  dash: '-',
  underscore: '_',
  slash: '/',
  'forward slash': '/',
  backslash: '\\',
  ellipsis: '...',
  'dot dot dot': '...',
  apostrophe: "'",
  'open paren': '(',
  'close paren': ')',
  'open parenthesis': '(',
  'close parenthesis': ')',
  'open bracket': '[',
  'close bracket': ']',
  'open quote': '"',
  'close quote': '"',
  quote: '"',
  unquote: '"',
  'at sign': '@',
  'ampersand': '&',
  'percent sign': '%',
  'plus sign': '+',
  'equals sign': '=',
  'pound sign': '#',
  hashtag: '#',
  asterisk: '*',
  'new line': '\n',
  newline: '\n',
  'new paragraph': '\n\n',
}

/**
 * Words that make the following punctuation word a noun rather than a command.
 *
 * Spoken punctuation is a trade every dictation system makes: "period" is both
 * the commonest way to end a sentence by voice and an ordinary English noun, and
 * no amount of cleverness without prosody tells them apart reliably. Systems
 * that ship this simply accept the false positive.
 *
 * This does slightly better for free. A punctuation word directly after a
 * determiner is being used as a noun essentially always: "a period", "the
 * comma", "your dash".
 *
 * The membership rule is the part worth stating, because the obvious list is
 * wrong: **only determiners that cannot themselves end a sentence.** A word
 * that can stand alone as a pronoun is exactly the word a full stop follows, so
 * putting it here breaks the far more common reading. "one period two" is a
 * numbered list, "I saw her period" ends a sentence, and "I said this period"
 * does too, which rules out `one`, `this`, `that`, `these`, `those`, `some`,
 * `any`, `no`, `another`, `his` and `her` despite every one of them being a
 * determiner. What remains cannot appear without a noun after it, so a
 * punctuation word following one is never a mark.
 *
 * It does not catch "grace period", and nothing short of prosody will, which is
 * why `literally` below exists and why the whole pass is a setting.
 */
const DETERMINERS = new Set([
  'a', 'an', 'the', 'my', 'your', 'its', 'our', 'their', 'every',
])

/**
 * The escape hatch: "literally period" writes the word.
 *
 * Needed because the determiner guard cannot catch every noun use, and a user
 * who has hit one needs a way to say the word at all. Consumed here, before the
 * punctuation pass can see the word it protects.
 */
const LITERALLY = /\bliterally\s+([a-z]+(?:\s+[a-z]+)?)\b/gi

function applyLiteralEscapes(pieces: Piece[]): Piece[] {
  const out: Piece[] = []
  for (const piece of pieces) {
    if (piece.literal) {
      out.push(piece)
      continue
    }
    const text = piece.text
    let last = 0
    LITERALLY.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = LITERALLY.exec(text))) {
      // Only an escape when what follows really is a command, so that
      // "literally everything" keeps its adverb. The capture is greedy and may
      // have taken a second word that is not part of the command, in which case
      // only the first is consumed and the rest is left to the normal path.
      const phrase = m[1].toLowerCase()
      const one = phrase.split(/\s+/)[0]
      const target = PUNCTUATION[phrase] ? phrase : PUNCTUATION[one] ? one : null
      if (!target) continue

      const after = m[0].slice('literally'.length)
      const gap = after.length - after.trimStart().length
      const end = m.index + 'literally'.length + gap + target.length

      const before = text.slice(last, m.index)
      if (before) out.push({ text: before, literal: false })
      // The word itself, protected, so the punctuation pass leaves it alone.
      out.push({ text: text.slice(end - target.length, end), literal: true })
      last = end
      // Resume from what was actually consumed, not from the end of a match
      // that may have reached past the command.
      LITERALLY.lastIndex = end
    }
    const rest = text.slice(last)
    if (rest) out.push({ text: rest, literal: false })
  }
  return out
}

/** Command phrases, longest first, so multi-word commands win. */
const PUNCTUATION_PHRASES = Object.keys(PUNCTUATION).sort((a, b) => b.length - a.length)

function applyPunctuation(text: string): string {
  const lower = text.toLowerCase()
  let out = ''
  let i = 0

  /** The last word written, for the determiner guard. */
  const lastWord = () => {
    const m = /([a-z']+)\s*$/i.exec(out)
    return m ? m[1].toLowerCase() : ''
  }

  outer: while (i < text.length) {
    for (const phrase of PUNCTUATION_PHRASES) {
      if (!lower.startsWith(phrase, i)) continue
      const end = i + phrase.length
      if (isWordChar(text[i - 1]) || isWordChar(text[end])) continue
      if (DETERMINERS.has(lastWord())) continue
      const mark = PUNCTUATION[phrase]
      /*
       * The recogniser may already have written the mark itself. The macOS 26
       * stack auto-punctuates: fed synthesised "hello comma this works
       * period", it returned "Hello, this works period." with its own full
       * stop after the surviving command word, and converting that word too
       * produced "works..". So a command whose mark already stands right
       * after it is consumed without writing anything, and the recogniser's
       * mark is left to speak for both. Single-character marks only: for
       * "dot dot dot" the same lookahead would see the first dot of nothing
       * in particular and eat the whole ellipsis.
       */
      if (mark.length === 1) {
        let j = end
        while (text[j] === ' ') j++
        if (text[j] === mark) {
          i = end
          continue outer
        }
      }
      out += mark
      i = end
      continue outer
    }
    out += text[i]
    i += 1
  }
  return out
}

/* ---- fillers --------------------------------------------------------------- */

/**
 * Hesitation sounds, and nothing else.
 *
 * Deliberately short. The tempting additions are "like", "you know", "I mean"
 * and "sort of", and every one of them is a real phrase far more often than it
 * is filler: "it works like this" and "you know the answer" are not hesitations,
 * and a cleanup pass that eats them is silently changing what somebody said.
 * The sounds below have no other meaning, so removing them cannot alter a
 * sentence. A destructive default is worse than a conservative one, because the
 * user reads the result in their own document after the fact, if at all.
 */
const FILLERS = ['um', 'uh', 'umm', 'uhh', 'erm', 'uhm', 'hmm', 'mm', 'mhm', 'er']

const FILLER_RE = new RegExp(`\\b(?:${FILLERS.join('|')})\\b[,]?`, 'gi')

function removeFillers(text: string): string {
  return text.replace(FILLER_RE, '')
}

/* ---- structural passes ----------------------------------------------------- */

/** Marks that take no space before them. */
const TIGHT_AFTER = new Set([',', '.', '!', '?', ';', ':', ')', ']'])
/** Marks that take no space after them. */
const TIGHT_BEFORE = new Set(['(', '['])

/**
 * Whitespace repair, over the joined text and its literal mask.
 *
 * Every rule here fires only when the *punctuation* character is spoken. That
 * condition is the whole reason this pass reads the mask rather than running a
 * regex over the string: a snippet body of `.NET` preceded by a space must keep
 * the space, while a spoken full stop must lose it. The two are the same two
 * characters in the same order, and only provenance separates them.
 */
function repairSpacing(chars: string[], lit: boolean[]): { chars: string[]; lit: boolean[] } {
  const outC: string[] = []
  const outL: boolean[] = []

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]

    if (c === ' ' || c === '\t') {
      // Never introduce or keep a run of spaces the user did not type.
      if (!lit[i]) {
        const prev = outC[outC.length - 1]
        if (prev === undefined || prev === ' ' || prev === '\n') continue
        // Look ahead past this whitespace run for what it precedes.
        let j = i
        while (j < chars.length && (chars[j] === ' ' || chars[j] === '\t') && !lit[j]) j++
        const next = chars[j]
        if (next === undefined) continue
        if (!lit[j] && (TIGHT_AFTER.has(next) || next === '\n')) continue
      }
      outC.push(' ')
      outL.push(lit[i])
      continue
    }

    if (c === '\n' && !lit[i]) {
      // A newline swallows the space before it.
      while (outC.length && outC[outC.length - 1] === ' ') {
        outC.pop()
        outL.pop()
      }
      outC.push(c)
      outL.push(lit[i])
      continue
    }

    // A spoken opening bracket takes no space after it, which is handled when
    // the following whitespace is considered.
    if (!lit[i] && TIGHT_BEFORE.has(c)) {
      outC.push(c)
      outL.push(lit[i])
      let j = i + 1
      while (j < chars.length && chars[j] === ' ' && !lit[j]) j++
      i = j - 1
      continue
    }

    outC.push(c)
    outL.push(lit[i])
  }

  return { chars: outC, lit: outL }
}

/**
 * Sentence capitalisation, over the joined text and its literal mask.
 *
 * Only spoken characters are raised. A literal that opens a sentence keeps the
 * case the user gave it, which is the entire point: `iPhone` and an email
 * address both start sentences perfectly often.
 *
 * A line break opens a sentence here, the same as a full stop, and that applies
 * to "new line" as well as "new paragraph". The alternative was to capitalise
 * only after a paragraph, on the grounds that a single break can fall
 * mid-clause. But the things people actually dictate breaks into are lists,
 * addresses and verse, where a capital is either wanted or harmless because the
 * word is a proper noun anyway. The mid-clause wrap that this gets wrong is
 * rare enough to be the right trade.
 */
function capitalizeSentences(chars: string[], lit: boolean[], opens: boolean): string[] {
  const out = chars.slice()
  let atStart = opens
  for (let i = 0; i < out.length; i++) {
    const c = out[i]
    if (c === ' ' || c === '\t') continue
    if (c === '\n') {
      atStart = true
      continue
    }
    if (c === '.' || c === '!' || c === '?') {
      atStart = true
      continue
    }
    // Quotes and brackets sit between the full stop and the first letter
    // without ending the sentence opening.
    if (c === '"' || c === "'" || c === '(' || c === '[') continue
    if (atStart) {
      if (!lit[i]) out[i] = c.toUpperCase()
      atStart = false
    }
  }
  return out
}

/** The standalone pronoun, which no recogniser reliably capitalises. */
function capitalizePronoun(text: string): string {
  return text.replace(/\bi\b/g, 'I')
}

/* ---- the pipeline ---------------------------------------------------------- */

/**
 * Everything above, in the order the header explains.
 *
 * Returns the finished text with no trailing space; `prepareDictated` in the
 * desktop app owns that, because whether dictation is additive is a property of
 * the insertion point rather than of the sentence.
 */
export function finishDictation(heard: string, options: DictateOptions = {}): string {
  const raw = (heard ?? '').trim()
  if (!raw) return ''

  const {
    dictionary = [],
    snippets = [],
    punctuation = true,
    fillers = true,
    capitalize = true,
    openSentence = true,
  } = options

  let pieces: Piece[] = [{ text: raw, literal: false }]

  // 1. Snippets, before any pass can rewrite a trigger out from under them.
  if (snippets.length) {
    pieces = substitute(
      pieces,
      snippets.map((s) => ({ from: s.say, to: s.write })),
    )
  }

  // 2. The personal dictionary, protected for the same reason snippets are.
  if (dictionary.length) {
    pieces = substitute(
      pieces,
      dictionary.map((c) => ({ from: c.heard, to: c.meant })),
    )
  }

  // 3. Punctuation, after the escapes that protect words from it.
  if (punctuation) {
    pieces = applyLiteralEscapes(pieces)
    pieces = onSpoken(pieces, applyPunctuation)
  }

  // 4. Fillers.
  if (fillers) pieces = onSpoken(pieces, removeFillers)

  // 5. The pronoun, which is a word-level fix rather than a structural one.
  if (capitalize) pieces = onSpoken(pieces, capitalizePronoun)

  // Join to characters plus the mask the last two passes read.
  const chars: string[] = []
  const mask: boolean[] = []
  for (const p of pieces) {
    for (const ch of p.text) {
      chars.push(ch)
      mask.push(p.literal)
    }
  }

  // 6. Structure.
  const spaced = repairSpacing(chars, mask)
  const finalChars = capitalize
    ? capitalizeSentences(spaced.chars, spaced.lit, openSentence)
    : spaced.chars

  return finalChars.join('').trim()
}

/**
 * Whether a turn typed after `previous` opens a sentence.
 *
 * The one thing that can be known about the text in front of the caret without
 * reading somebody else's document: what we ourselves put there last. If the
 * previous turn ended on a full stop the next one is a new sentence, and if it
 * trailed off mid-clause it is a continuation.
 *
 * Nothing before it counts as an opening, which covers both the first turn of a
 * session and the case where the user has moved the caret somewhere we cannot
 * see. That guess is wrong only when somebody dictates into the middle of an
 * existing sentence, where the cost is one capital letter.
 */
export function opensSentenceAfter(previous: string): boolean {
  const text = previous ?? ''
  if (!text.trim()) return true
  // Closing quotes and brackets may sit between the stop and the caret.
  return /[.!?\n]["'’”)\]]*\s*$/.test(text)
}
