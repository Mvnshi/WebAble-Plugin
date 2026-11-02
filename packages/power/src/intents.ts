/**
 * Plain-English requests, understood on the device.
 *
 * The command bar's search finds a tool when somebody knows its name. Most
 * people do not, and should not have to: they know that the page is too
 * bright, that the text is too small, that the video is too slow. This file
 * turns that kind of sentence into the change it is asking for, with no model,
 * no network and no key, so it works for everyone on the first day and in
 * under a millisecond.
 *
 * It is a phrasebook, not a language model, and it is honest about that: every
 * rule below is a pattern somebody can read, and a sentence that matches none
 * of them falls through to ordinary search (and, when an AI key is set, to
 * "ask about this page"). A wrong guess costs one Undo, which the bar always
 * offers.
 *
 * Pure: a string in, intents out. Nothing here touches the page or the engine,
 * so every rule is pinned by a unit test.
 */
import { normalize } from './fuzzy';

/** Things the command bar can do that are not a tool toggle. */
export type ActionId =
  | 'readAloud'
  | 'stopReading'
  | 'summarize'
  | 'explainPage'
  | 'ask'
  | 'hints'
  | 'hintsNewTab'
  | 'find'
  | 'siteSearch'
  | 'scrollTop'
  | 'scrollBottom'
  | 'toggleMedia'
  | 'copyCleanLink'
  | 'copyMarkdown'
  | 'copyQuote'
  | 'siteCheck'
  | 'fixThisSite'
  | 'resetSite'
  | 'undo'
  | 'turnOffHere'
  | 'openPanel'
  | 'openSettings'
  | 'help';

export type Intent =
  /** Switch a tool on or off. `on` undefined means flip it. */
  | { kind: 'toggle'; feature: string; on?: boolean }
  /** Switch a tool on with specific settings. */
  | { kind: 'set'; feature: string; patch: Record<string, string | number | boolean> }
  /** Nudge one numeric setting relative to where it is now. */
  | { kind: 'adjust'; feature: string; key: string; delta: number }
  | { kind: 'profile'; id: string }
  | { kind: 'action'; id: ActionId; arg?: string };

/** Bounds for the numbers people say, mirroring each tool's own slider. */
export const LIMITS: Record<string, { key: string; min: number; max: number }> = {
  fontSize: { key: 'value', min: 100, max: 300 },
  mediaSpeed: { key: 'rate', min: 0.5, max: 3 },
  volumeBoost: { key: 'gain', min: 0, max: 3 },
  highContrast: { key: 'level', min: 1.1, max: 1.8 },
  magnifier: { key: 'zoom', min: 1.5, max: 3.5 },
  autoScroll: { key: 'speed', min: 0.3, max: 5 },
};

export function clamp(feature: string, n: number): number {
  const l = LIMITS[feature];
  if (!l) return n;
  return Math.min(l.max, Math.max(l.min, Math.round(n * 100) / 100));
}

/**
 * Words that carry no meaning for a command. Stripped first so "could you
 * please make the text bigger" and "text bigger" are the same request.
 */
const FILLER =
  /^(?:(?:hey|ok(?:ay)?|webable|please|pls|can|could|would|will|you|u|i|id|i'd|want|wanna|would like|like|need|to|me|just|let|lets|let's|make it so|go ahead and|try|and)\b[\s,]*)+/;

const ON = /^(?:turn on|switch on|enable|activate|start|use|give me|put on)\b\s*/;
const OFF = /^(?:turn off|switch off|disable|deactivate|remove|get rid of|no more|cancel)\b\s*/;
const TRAILING_ON = /\s+on$/;
const TRAILING_OFF = /\s+off$/;

/**
 * A request that is clearly about one tool. Matched against the request with
 * filler, on and off already stripped, so each pattern only has to describe
 * the thing, not every way of asking for it.
 */
const TOOL_PHRASES: Array<[RegExp, string]> = [
  [/\b(dark ?mode|night ?mode|dark theme|lights? off|dim the page)\b/, 'darkMode'],
  [/\binvert/, 'invertColors'],
  [/\b(high |more )?contrast\b/, 'highContrast'],
  [/\b(gr[ae]y ?scale|black and white|monochrome|desaturate)\b/, 'saturation'],
  [/\bcolou?r ?blind|deuteranop|protanop|tritanop|red.?green\b/, 'colorFilter'],
  [/\breader( mode| view)?\b|\breading mode\b|\bjust the (article|text)\b/, 'readerMode'],
  [/\bdyslexi[ac]? font|open ?dyslexic|lexend\b/, 'dyslexiaFont'],
  [/\breadable font|clear(er)? font|plain font\b/, 'readableFont'],
  [/\bbionic\b/, 'bionicFlow'],
  [/\b(line|letter|word|text) spacing\b|\bspace (it|things|the text) out\b/, 'textSpacing'],
  [/\b(stop|freeze|pause|no) (the )?(animations?|motion|moving|gifs?|spinning|flashing)\b|\banimations?\b|\breduce(d)? motion\b/, 'stopAnimations'],
  [/\bhide (the )?(images|pictures|photos)\b|\bno (images|pictures)\b/, 'hideImages'],
  [/\b(hide|block|kill|no) (the )?(ads|clutter|distractions|sidebars?)\b|\bdistractions?\b/, 'hideDistractions'],
  [/\b(reading )?(ruler|guide line|reading guide)\b/, 'readingGuide'],
  [/\breading mask|spotlight\b/, 'readingMask'],
  [/\bfocus mode\b/, 'focusMode'],
  [/\bmagnif|\blens\b|\bloupe\b/, 'magnifier'],
  [/\b(big|bigger|large|larger) (cursor|pointer|mouse)\b|\bcursor\b/, 'bigCursor'],
  [/\b(big|bigger|larger) (buttons|click targets|targets)\b|\bhard to (click|tap)\b/, 'clickTargets'],
  [/\bfocus (ring|outline)|visible focus\b/, 'highlightFocus'],
  [/\bhighlight (the )?links\b|\bunderline links\b/, 'highlightLinks'],
  [/\bhighlight (the )?(headings|titles)\b/, 'highlightHeadings'],
  [/\bcookie|\bconsent banner|\bgdpr\b/, 'cookieKill'],
  [/\bpop ?ups?\b|\bnewsletter\b|\bmodals?\b/, 'popupKill'],
  [/\bsticky|\bchat (bubble|widget)s?\b|\bfixed header\b/, 'stickyKill'],
  [/\b(sign ?up|register|login) wall|\bkeep reading\b/, 'wallBreaker'],
  [/\b(notification|push) (prompts?|nags?|requests?)\b|\ballow notifications\b/, 'nagMute'],
  [/\bexpand (all|everything)\b|\bshow (all|more)\b|\bread more\b/, 'expandCollapse'],
  [/\b(unlock|allow|enable) (copy|copying|selection|right ?click)\b|\bcan.?t (copy|select|right ?click)\b/, 'copyUnlock'],
  [/\b(pinch|force) zoom\b|\bcan.?t zoom\b/, 'forceZoom'],
  [/\bpicture.in.picture|\bpip\b|\bmini ?player\b|\bfloat(ing)? (the )?video\b|\bpop ?out (the )?video\b/, 'pictureInPicture'],
  [/\bauto.?scroll|\bteleprompter\b|\bscroll (for me|by itself)\b/, 'autoScroll'],
  [/\bmute\b|\bsilence (the )?(page|videos?|audio)\b|\bno sound\b/, 'muteSounds'],
  [/\b(feed off|stop (the )?(feed|scroll(ing)?)|doom ?scroll)/, 'feedOff'],
  [/\bdictionary\b|\bdefine words\b/, 'clickDictionary'],
  [/\bexplain (selection|selected|highlighted)\b|\bselection bubble\b/, 'selectionBubble'],
  [/\b(pin|keep) tooltips?\b/, 'tooltipPin'],
  [/\b(justify|align (left|right|center))\b/, 'textAlign'],
  [/\bcustom colou?rs\b/, 'customColors'],
];

/**
 * How people describe a need rather than a tool. These are the sentences the
 * bar exists for, so each one maps to the tool or profile a specialist would
 * reach for first.
 */
const NEED_PHRASES: Array<[RegExp, Intent]> = [
  [/\b(too bright|so bright|hurts? my eyes|eye strain|light sensitiv|photophob|migraine|blinding)\b/, { kind: 'toggle', feature: 'darkMode', on: true }],
  [/\b(can.?t see|hard to see|too small|tiny|squint|hard to read|can.?t read (it|this|the text)|small text|text is small)\b/, { kind: 'adjust', feature: 'fontSize', key: 'value', delta: 20 }],
  [/\b(dyslexi)/, { kind: 'profile', id: 'dyslexia' }],
  [/\b(adhd|can.?t focus|cant concentrate|can.?t concentrate|so distracting|too much going on|overwhelm)/, { kind: 'profile', id: 'adhd' }],
  [/\b(seizure|epilep|photosensitive)/, { kind: 'profile', id: 'seizure' }],
  [/\b(low vision|visually impaired|partially sighted|vision impair)/, { kind: 'profile', id: 'vision' }],
  [/\b(tremor|shaky hands?|parkinson|motor|keyboard only|no mouse|can.?t use (a|the) mouse)\b/, { kind: 'profile', id: 'motor' }],
  [/\b(older eyes|senior|my (grand)?(mom|dad|mother|father|parents?|ma|pa|mama|papa)|grandparents?|elderly)\b/, { kind: 'profile', id: 'senior' }],
  [/\bscreen ?reader|nvda|jaws|voiceover\b/, { kind: 'profile', id: 'screenReader' }],
  [/\b(privacy|stop tracking|tracking|trackers)\b/, { kind: 'profile', id: 'privacy' }],
  [/\b(stop (it )?moving|things moving|everything moves|motion sick|dizzy|vertigo)\b/, { kind: 'toggle', feature: 'stopAnimations', on: true }],
  [/\b(too loud)\b/, { kind: 'adjust', feature: 'volumeBoost', key: 'gain', delta: -0.5 }],
  [/\b(too quiet|can.?t hear|hard of hearing|louder|turn (it )?up)\b/, { kind: 'adjust', feature: 'volumeBoost', key: 'gain', delta: 0.5 }],
];

/** Requests that are actions rather than tools, tried before the tool phrases. */
const ACTION_PHRASES: Array<[RegExp, ActionId]> = [
  [/^(stop|pause) (reading|speaking|talking)\b|^(be quiet|shush|shut up)\b/, 'stopReading'],
  [/\bread (it |this |the )?(page |article )?(to me|aloud|out loud|out)\b|^read( this| page)?$|^(speak|listen)( to)?( this| page)?$|\btext to speech\b|\btts\b/, 'readAloud'],
  [/\b(summari[sz]e|summary|tl ?;? ?dr|the gist|key points|what is this (page|article) about)\b/, 'summarize'],
  [/\b(explain|simplify) (this |the )?(page|article)\b|\bplain (english|language)\b/, 'explainPage'],
  [/\b(click|press|tap) (by|with|using) (the )?keyboard\b|\bclick hints?\b|^hints?$|\blink hints?\b|\bkeyboard click/, 'hints'],
  [/\b(open|click) .*in (a )?new tab\b/, 'hintsNewTab'],
  [/^((go|jump|scroll|back) )?(to )?(the )?top( of (the )?page)?$/, 'scrollTop'],
  [/^((go|jump|scroll) )?(to )?(the )?(bottom|end)( of (the )?page)?$/, 'scrollBottom'],
  [/^(play|pause|resume)( (the )?(video|audio|media|music))?$/, 'toggleMedia'],
  [/\bcopy (a |the )?(clean |short |tracking.?free )?(link|url)\b|\bclean (link|url)\b|\bshare link\b/, 'copyCleanLink'],
  [/\bcopy (it |this |page |selection )?(as )?markdown\b/, 'copyMarkdown'],
  [/\b(quote|cite) (this|selection)\b|\bcopy (as )?(a )?quote\b/, 'copyQuote'],
  [/\b(check|audit|scan|test|grade|score) (this |the )?(site|page|website)\b|\b(seo|wcag|ada|accessibility) (check|audit|score|report)\b|^site check$/, 'siteCheck'],
  [/\bfix (this|the) (site|page)\b|\b(hide|remove|zap|delete) (this |an |that )?(element|thing|box|part)\b/, 'fixThisSite'],
  [/\b(reset|start over|clear) (this )?(site|page|everything|all)\b|^reset$/, 'resetSite'],
  [/^undo( that| last)?$/, 'undo'],
  [/\b(turn |switch )?(webable )?off (here|on this site|for this site)\b|\bdisable webable\b/, 'turnOffHere'],
  [/\b(open )?(the )?(webable )?(panel|menu|all tools)\b/, 'openPanel'],
  [/\b(settings|options|preferences|api key)\b/, 'openSettings'],
  [/^(help|\?|shortcuts|keyboard shortcuts|what can (you|i) do.*)$/, 'help'],
];

const IMPLIES_ON = /^(?:hide|stop|freeze|block|kill|no|unlock|allow|expand|mute|silence|float|pop|highlight|underline|pin|keep|am|im|have|got)\b/;

const QUESTION = /^(what|why|how|who|when|where|which|is|are|does|do|can|should|will|was|were|did)\b.+/;

function num(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

/** Numbers people say about a tool: "text 150%", "2x speed", "volume 200". */
function numeric(q: string): Intent | null {
  let m: RegExpMatchArray | null;
  // Text size. "Text 150", "font size 150%", "150% text", "zoom text to 140".
  if (
    (m = q.match(/\b(?:text|font|type|letters|words|reading)(?: size)?(?: to| at)? (\d{2,3}) ?%?/)) ||
    (m = q.match(/\b(\d{2,3}) ?% (?:text|font|type)\b/))
  ) {
    return { kind: 'set', feature: 'fontSize', patch: { value: clamp('fontSize', num(m[1])) } };
  }
  // Playback speed. "2x", "1.5x speed", "speed 2", "play at 1.25".
  if (
    (m = q.match(/^(\d(?:[.,]\d+)?) ?x(?: speed)?$/)) ||
    (m = q.match(/\b(?:speed|playback|play at|video at|watch at)(?: to| at)? (\d(?:[.,]\d+)?) ?x?\b/)) ||
    (m = q.match(/\b(\d(?:[.,]\d+)?) ?x (?:speed|playback)\b/))
  ) {
    return { kind: 'set', feature: 'mediaSpeed', patch: { rate: clamp('mediaSpeed', num(m[1])) } };
  }
  // Volume as a percentage of normal. "volume 200%", "boost 150".
  if ((m = q.match(/\b(?:volume|boost|louder)(?: to| at| by)? (\d{1,3}) ?%?/))) {
    return { kind: 'set', feature: 'volumeBoost', patch: { gain: clamp('volumeBoost', num(m[1]) / 100) } };
  }
  return null;
}

/** "Bigger", "smaller", "faster": a step from wherever the setting is now. */
function relative(q: string): Intent | null {
  if (/\b(bigger|larger|increase|enlarge|grow|zoom in)\b.*\b(text|font|words|letters|type)\b|\b(text|font|words|letters|type)\b.*\b(bigger|larger|up)\b|^(bigger|larger)$/.test(q)) {
    return { kind: 'adjust', feature: 'fontSize', key: 'value', delta: 20 };
  }
  if (/\b(smaller|decrease|shrink|zoom out)\b.*\b(text|font|words|letters|type)\b|\b(text|font|words|letters|type)\b.*\b(smaller|down)\b|^smaller$/.test(q)) {
    return { kind: 'adjust', feature: 'fontSize', key: 'value', delta: -20 };
  }
  if (/\b(faster|speed (it )?up)\b/.test(q)) return { kind: 'adjust', feature: 'mediaSpeed', key: 'rate', delta: 0.25 };
  if (/\b(slower|slow (it )?down)\b/.test(q)) return { kind: 'adjust', feature: 'mediaSpeed', key: 'rate', delta: -0.25 };
  if (/^normal speed$|^(1|one) ?x$/.test(q)) return { kind: 'toggle', feature: 'mediaSpeed', on: false };
  if (/\bmore contrast\b/.test(q)) return { kind: 'adjust', feature: 'highContrast', key: 'level', delta: 0.15 };
  if (/\bless contrast\b/.test(q)) return { kind: 'adjust', feature: 'highContrast', key: 'level', delta: -0.15 };
  return null;
}

/** Strip what a sentence says around the request, keep the request. */
export function clean(input: string): string {
  const base = normalize(input).replace(/[!.]+$/, '').replace(/\s+please$/, '').replace(/\s+/g, ' ');
  let q = base;
  for (let i = 0; i < 3; i++) q = q.replace(FILLER, '').trim();
  // "Help" and "use" on their own are requests, not filler around one.
  return q || base;
}

/**
 * Turn what somebody typed into what they want, best guess first. An empty
 * list means "no idea", and the bar falls back to search.
 */
export function parseIntent(input: string): Intent[] {
  const raw = normalize(input);
  if (!raw) return [];

  // Prefixes are the power-user path and win over everything: "? question",
  // "# heading", "/ link".
  if (raw.startsWith('?') && raw.length > 1) return [{ kind: 'action', id: 'ask', arg: input.trim().slice(1).trim() }];
  if (raw.startsWith('#') || raw.startsWith('/')) return [{ kind: 'action', id: 'find', arg: input.trim().slice(1).trim() }];

  let q = clean(input);
  if (!q) return [];

  let on: boolean | undefined;
  if (OFF.test(q)) {
    on = false;
    q = q.replace(OFF, '').trim();
  } else if (ON.test(q)) {
    on = true;
    q = q.replace(ON, '').trim();
  } else if (TRAILING_OFF.test(q) || TRAILING_ON.test(q)) {
    // A trailing "on" or "off" is only a switch when what is left names a
    // tool. Otherwise it is part of the sentence: "too much going on", and
    // "feed off", which is the name of a tool rather than a request to stop it.
    const rest = q.replace(TRAILING_OFF, '').replace(TRAILING_ON, '').trim();
    if (!/feed ?off$/.test(q) && TOOL_PHRASES.some(([re]) => re.test(rest))) {
      on = TRAILING_OFF.test(q) ? false : true;
      q = rest;
    }
  }
  if (!q) return [];
  // A sentence that names a tool by what it does ("hide the images", "stop
  // the animations") or states a need ("I'm colorblind") is asking for it to
  // be on. Flipping instead would turn it off for somebody who already had it.
  if (on === undefined && IMPLIES_ON.test(q)) on = true;

  const out: Intent[] = [];
  const push = (i: Intent) => {
    if (!out.some((o) => JSON.stringify(o) === JSON.stringify(i))) out.push(i);
  };

  // "Search for running shoes" types into the site's own search box. Checked
  // before anything else because the query after it is free text and would
  // otherwise trip the tool phrases ("search for dark mode jackets").
  let m = q.match(/^(?:search|look up|lookup)(?: (?:this site|the site|here))?(?: for)? (.+)$/);
  if (m) return [{ kind: 'action', id: 'siteSearch', arg: m[1] }];
  m = q.match(/^(?:go to|jump to|take me to|find|where is|where's|show me the) (?:the )?(.+)$/);
  if (m && on === undefined && !/^(top|bottom|end)\b/.test(m[1])) {
    push({ kind: 'action', id: 'find', arg: m[1] });
  }

  if (on === undefined) {
    const n = numeric(q);
    if (n) push(n);
    const r = relative(q);
    if (r) push(r);
  }

  for (const [re, id] of ACTION_PHRASES) {
    if (re.test(q)) push({ kind: 'action', id });
  }

  for (const [re, feature] of TOOL_PHRASES) {
    if (re.test(q)) push({ kind: 'toggle', feature, ...(on === undefined ? {} : { on }) });
  }

  if (on !== false) {
    for (const [re, intent] of NEED_PHRASES) if (re.test(q)) push(intent);
  }

  // A question nothing above recognised is a question about the page.
  if (!out.length && (QUESTION.test(q) || /\?$/.test(input.trim()))) {
    push({ kind: 'action', id: 'ask', arg: input.trim() });
  }
  // A need phrase that asks for "on" outranks a flip of the same tool, and
  // the flip is dropped, so Enter cannot turn off what the person asked for.
  return out.filter(
    (i) =>
      !(i.kind === 'toggle' && i.on === undefined && out.some((o) => o.kind === 'toggle' && o.feature === i.feature && o.on === true)),
  );
}
