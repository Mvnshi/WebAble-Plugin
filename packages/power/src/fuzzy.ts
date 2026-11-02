/**
 * Ranking for the command bar.
 *
 * The bar is only as good as its first result. Somebody who types "drak" means
 * dark mode, somebody who types "txt big" means text size, and somebody who
 * types "cookies" wants the banner gone, not a list of eleven things that
 * contain the letter c. So this scores a candidate on how a person would judge
 * the match, in this order: the whole title, the start of the title, the start
 * of a word, anywhere in a word, the letters in order, then one typo.
 *
 * Every query word has to land somewhere. A candidate that matches "dark" and
 * not "mode" is not a match for "dark mode", or "dark mode off" would surface
 * every dark thing on the list above the one the person asked for.
 */

export interface Searchable {
  title: string;
  /** Synonyms. A hit here counts, but less than a hit on the visible title. */
  keywords?: readonly string[];
}

const WORD = /[a-z0-9%.]+/g;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(s: string): string[] {
  return normalize(s).match(WORD) || [];
}

/** Letters of `needle` appear in `hay` in order. Returns the gap count, or -1. */
function subsequenceGaps(needle: string, hay: string): number {
  let i = 0;
  let gaps = 0;
  let last = -1;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) {
      if (last >= 0 && j - last > 1) gaps++;
      last = j;
      i++;
    }
  }
  return i === needle.length ? gaps : -1;
}

/**
 * Optimal string alignment distance, capped. Only ever asked "is this within
 * one edit", so it bails as soon as a row cannot get back under the cap.
 */
export function editDistance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** How well one query word matches one block of text. 0 is no match. */
function tokenScore(token: string, text: string, textWords: string[]): number {
  if (!token) return 0;
  if (text === token) return 100;
  if (text.startsWith(token)) return 85;
  let best = 0;
  for (const w of textWords) {
    if (w === token) best = Math.max(best, 80);
    else if (w.startsWith(token)) best = Math.max(best, 65 + Math.min(10, token.length * 2));
    else if (w.includes(token)) best = Math.max(best, 40);
    if (best >= 80) return best;
  }
  if (best) return best;
  // Initials: "pip" for picture in picture, "hc" for high contrast.
  const initials = textWords.map((w) => w[0]).join('');
  if (token.length >= 2 && initials.startsWith(token)) return 55;
  // Letters in order, inside one word only, so "dm" does not match
  // "dyslexia mode" through two unrelated words when initials already said no.
  for (const w of textWords) {
    const gaps = subsequenceGaps(token, w);
    if (gaps >= 0 && token.length >= 3) best = Math.max(best, 30 - gaps * 6);
  }
  if (best > 0) return best;
  // One typo, but only for words long enough that one typo still leaves the
  // word recognisable. "dar" is three letters from a dozen things.
  if (token.length >= 4) {
    for (const w of textWords) {
      if (Math.abs(w.length - token.length) <= 1 && editDistance(token, w, 1) <= 1) return 28;
      if (w.length > token.length && editDistance(token, w.slice(0, token.length), 1) <= 1) best = Math.max(best, 22);
    }
  }
  return best;
}

/**
 * Score a candidate against a query. 0 means "do not show it". Scores are
 * comparable across candidates for the same query and meaningless across
 * queries.
 */
/**
 * Words that carry no meaning in a search. Dropped when the query has other
 * words, so "go to pricing" does not rank everything containing "to".
 */
const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'on', 'in', 'my', 'is', 'it', 'and', 'go', 'me', 'this', 'page']);

export function score(query: string, item: Searchable): number {
  const all = words(query);
  const meaningful = all.filter((w) => !STOP.has(w));
  const q = meaningful.length ? meaningful : all;
  if (!q.length) return 0;
  const title = normalize(item.title);
  const titleWords = words(item.title);
  const kw = (item.keywords || []).map((k) => ({ text: normalize(k), words: words(k) }));

  // A whole-query hit on the title or a keyword beats any sum of parts.
  const whole = normalize(query);
  if (title === whole) return 1000;
  let total = 0;
  if (title.startsWith(whole)) total += 300;
  else if (kw.some((k) => k.text === whole)) total += 260;
  else if (kw.some((k) => k.text.startsWith(whole))) total += 180;

  for (const t of q) {
    let best = tokenScore(t, title, titleWords);
    for (const k of kw) {
      if (best >= 80) break;
      best = Math.max(best, tokenScore(t, k.text, k.words) * 0.8);
    }
    if (best <= 0) return 0;
    total += best;
  }
  // Shorter titles win ties: "Dark mode" over "Dark mode for images".
  return total - titleWords.length * 0.5;
}

/** Rank and filter. Stable for equal scores, so registry order breaks ties. */
export function rank<T extends Searchable>(query: string, items: readonly T[], boost?: (item: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(query, item) }))
    .filter((r) => r.s > 0)
    .map((r) => ({ ...r, s: r.s + (boost ? boost(r.item) : 0) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.item);
}
