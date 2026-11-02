/**
 * A personal dictionary, applied to recognised speech before it is used.
 *
 * Deliberate port of `companion-core/src/dictionary.rs`, kept behaviourally
 * identical for the same reason the tag parsers are: the desktop app corrects
 * in TypeScript because that is where the recogniser lives, and anything that
 * corrects differently in the two places is a bug nobody can reproduce.
 *
 * Every recogniser gets the same class of thing wrong: names, jargon, and
 * anything one person says constantly that is not in a general vocabulary. A
 * better model does not fix that; a per-user list does.
 *
 * Plain substitution on purpose. The user has to be able to predict exactly
 * what it will do, and a fuzzy corrector that occasionally rewrites a word they
 * did mean is far worse than one that misses.
 */

export interface Correction {
  /** What comes out of the recogniser. Matched case-insensitively. */
  heard: string
  /** What to write instead. Case is preserved exactly as written. */
  meant: string
}

/**
 * Case-insensitive, boundary-aware substitution.
 *
 * Longest entry first, so a short entry cannot chop up a longer one that
 * contains it: with both "web able" and "able" present, "open web able" must
 * become "open WebAble" and never "open web Able".
 *
 * Word boundaries are enforced, because a dictionary that rewrites the inside
 * of unrelated words does more damage than it repairs: with "able" in the list,
 * "comfortable" has to survive.
 */
export function applyDictionary(text: string, corrections: Correction[]): string {
  if (!text || !corrections?.length) return text
  const entries = corrections
    .filter((c) => c.heard?.trim())
    .slice()
    .sort((a, b) => b.heard.trim().length - a.heard.trim().length)
  if (!entries.length) return text

  const lower = text.toLowerCase()
  const isWordChar = (ch: string | undefined) => !!ch && /[a-z0-9]/i.test(ch)
  let out = ''
  let i = 0

  outer: while (i < text.length) {
    for (const c of entries) {
      const needle = c.heard.trim().toLowerCase()
      if (!lower.startsWith(needle, i)) continue
      const end = i + needle.length
      if (isWordChar(text[i - 1]) || isWordChar(text[end])) continue
      out += c.meant
      i = end
      continue outer
    }
    out += text[i]
    i += 1
  }
  return out
}
