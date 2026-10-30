/**
 * Incremental tag parser for streamed companion replies.
 *
 * The model narrates in plain prose and embeds inline commands:
 *
 *   [POINT:5]                          point at numbered element 5   (web)
 *   [POINT:5:the Save button]          ...with a spoken label
 *   [POINT:840,412]                    point at a screen coordinate  (desktop)
 *   [POINT:840,412:Save:screen1]       ...with label and display index
 *   [POINT:none]                       hide the pointer
 *   [CLICK:5]                          press that target                (desktop, opt in)
 *   [CLICK:5:the Save button]          ...with a spoken label
 *   [DRAW:circle:5]                    sketch on a target
 *   [DRAW:arrow:5>7]                   arrow from one target to another
 *   [DRAW:label:5:Click here]          labelled callout
 *   [DRAW:path:12,30>24,18>36,30]      freehand stroke, no target    (desktop)
 *   [STEP]                             end of one walkthrough step
 *
 * Why parse incrementally: a batch parser has to wait for the whole reply
 * before it can move anything, so the cursor lurches after the sentence is
 * already spoken. Feeding chunks through here emits a `point` the instant its
 * tag closes, so the cursor flies while the companion is still talking.
 *
 * The hard part is that a chunk boundary can split a tag ("...click the [POI" /
 * "NT:5] now"). A half-tag must never leak into narration, and a bracket that
 * turns out to be ordinary prose ("array[0]") must not be swallowed. Both are
 * handled by holding back only text that can still become a tag, and flushing
 * it as prose the moment it cannot.
 */
import type { Anchor, CompanionDraw, CompanionEvent, CompanionStep, DrawKind } from './types'

const OPENERS = ['[POINT:', '[CLICK:', '[DRAW:', '[STEP]', '[GO:']
const DRAW_KINDS: DrawKind[] = ['circle', 'box', 'underline', 'label', 'arrow', 'path']

/**
 * A held-back candidate longer than this is treated as prose. Guards against a
 * stray '[' near the start of a long reply swallowing the entire narration.
 */
const MAX_CANDIDATE = 240

/**
 * Vertices allowed in one `[DRAW:path:...]`. Enough to draw a ring, a check or
 * a squiggle that still looks drawn once it is smoothed, and it bounds what a
 * single tag can cost: the held-back buffer, the SVG, and the round trip that
 * converts every vertex.
 */
const MAX_PATH_POINTS = 40

/**
 * A path tag in flight is allowed to be longer than any other tag.
 *
 * `MAX_CANDIDATE` exists to stop a stray '[' swallowing the narration behind
 * it, and 240 characters is generous for every other tag we accept. A full
 * path is not: 40 vertices of `1920.5,1080.5>` is 560 characters before the
 * head. Text that already reads `[DRAW:path:` is not a stray bracket, so it
 * gets its own ceiling rather than every tag waiting longer.
 */
const PATH_OPENER = '[DRAW:PATH'
const MAX_PATH_CANDIDATE = 640

/** `5` -> element anchor; `840,412` -> screen point; anything else -> null. */
export function parseAnchor(raw: string): Anchor | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const index = parseInt(s, 10)
    return index >= 1 ? { kind: 'element', index } : null
  }
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(s)
  if (m) return { kind: 'point', x: Number(m[1]), y: Number(m[2]) }
  // Neither an index nor a coordinate, so treat it as the target's name and
  // let the resolver match it against the element list. Returning null here is
  // what used to make the pointer silently never move.
  return { kind: 'named', name: s }
}

/** `screen2` / `screen 2` -> 2. Returns null when the token is not a display. */
function parseScreen(raw: string): number | null {
  const m = /^screen\s*(\d+)$/i.exec(raw.trim())
  return m ? parseInt(m[1], 10) : null
}

/** True while `candidate` could still grow into a real tag. */
/**
 * How long a candidate may grow before it is given up on as ordinary prose.
 *
 * A path tag is legitimately long and gets the larger ceiling. Everything else
 * keeps the tight one: the limit exists to stop a stray bracket swallowing the
 * narration behind it, and relaxing it for every tag would let one stray '['
 * hold back 640 characters of speech.
 */
function candidateLimit(candidate: string): number {
  return candidate.toUpperCase().startsWith(PATH_OPENER) ? MAX_PATH_CANDIDATE : MAX_CANDIDATE
}

function couldBeTag(candidate: string): boolean {
  const up = candidate.toUpperCase()
  for (const opener of OPENERS) {
    // Still typing the opener, or already past it and collecting arguments.
    if (opener.startsWith(up) || up.startsWith(opener)) return true
  }
  return false
}


/**
 * Whether a closed bracket group is *addressed to us*, whatever its contents.
 *
 * This separates "[see the note below]", which is prose and must survive, from
 * `[POINT:the text box:Ask]`, which is the model using our grammar and getting
 * the arguments wrong. The two want opposite handling: prose is shown, an
 * unresolvable tag is dropped, because it was never meant for the reader.
 *
 * Observed on hardware, rendered verbatim into the caption:
 *
 *     Now, just click the Ask button [POINT:text input with current value:Ask]
 *
 * The model had described the target instead of naming its index. Tightening
 * the prompt is a separate fix; the renderer must not leak it either way.
 */
/**
 * Scrub product names the model reads off the screen and parrots back.
 *
 * In agent mode the companion is looking at whatever app is in front of it,
 * including other assistants' own UI, and it will narrate their button labels
 * verbatim ("I will click Allow to let Claude proceed"). The user is talking to
 * Able, not to whatever brand happens to be on screen, so foreign assistant
 * names are rewritten to a neutral word rather than spoken. This is narration
 * hygiene, not censorship: the action is unchanged, only the label it is
 * described with.
 */
const FOREIGN_NAME = /\b(clicky|cluely|claude|chatgpt|copilot|gemini)\b/gi
export function scrubNarration(text: string): string {
  return text.replace(FOREIGN_NAME, 'it')
}

export function isAddressedToUs(raw: string): boolean {
  if (!raw.startsWith('[') || !raw.endsWith(']')) return false
  const inner = raw.slice(1, -1).trim().toUpperCase()
  return (
    inner === 'STEP' ||
    inner.startsWith('POINT:') ||
    inner.startsWith('CLICK:') ||
    inner.startsWith('DRAW:') ||
    inner.startsWith('GO:')
  )
}

/**
 * `x1,y1>x2,y2>x3,y3`, with an optional trailing `screenN`.
 *
 * Every other draw kind hangs off an element's bounds, which means over a
 * canvas, a design surface or a video frame there is nothing to hang off and
 * the companion can draw nothing at all. A path is given as coordinates
 * instead, in the same screenshot space `[POINT:x,y]` already uses, so it
 * inverts through the geometry that is already tested rather than through a
 * second conversion written for drawing.
 *
 * Two rules here are stricter than the rest of the grammar, both on purpose:
 *
 * - A vertex must come back from `parseAnchor` as a coordinate. An index or a
 *   name is refused, because a canvas publishes no elements and a stroke that
 *   snapped to whatever control happened to be nearby would not be the stroke
 *   that was asked for.
 * - One bad vertex fails the whole tag. Drawing the part of a polyline that
 *   happened to parse is worse than drawing nothing: the user sees a line that
 *   stops in the middle of nowhere with no way to tell it is truncated.
 */
function parsePath(rest: string[]): CompanionEvent[] | null {
  const args = rest.slice()
  // A trailing `screenN` is metadata, exactly as it is on POINT, and it applies
  // to the whole stroke: one path is drawn on one display.
  let screen: number | null = null
  const tail = args[args.length - 1]
  if (args.length > 1 && tail !== undefined) {
    const s = parseScreen(tail)
    if (s !== null) {
      screen = s
      args.pop()
    }
  }
  // Everything else has been split on ':', so anything left over is the model
  // having written something we do not understand.
  if (args.length !== 1) return null
  const raw = (args[0] || '').split('>')
  // Two vertices is the shortest thing that is a line rather than a dot.
  if (raw.length < 2 || raw.length > MAX_PATH_POINTS) return null

  const points: Anchor[] = []
  for (const token of raw) {
    const a = parseAnchor(token)
    if (!a || a.kind !== 'point') return null
    if (screen !== null) a.screen = screen
    points.push(a)
  }
  const first = points[0]
  if (!first) return null
  return [{ type: 'draw', draw: { kind: 'path', from: first, points } }]
}

/**
 * Parse one complete `[...]` token. Returns null when it is not a companion
 * tag (or is malformed), so the caller can pass it through as literal prose
 * rather than silently dropping something the user was meant to read.
 */
export function parseTag(raw: string): CompanionEvent[] | null {
  if (!raw.startsWith('[') || !raw.endsWith(']')) return null
  const inner = raw.slice(1, -1)
  if (/^\s*STEP\s*$/i.test(inner)) return [{ type: 'step' }]
  // [GO:Chrome] switches apps. The companion knows what is open, so the answer
  // to "where do I do that" can be to take them there.
  const go = /^\s*GO\s*:\s*(.+?)\s*$/i.exec(inner)
  if (go) return [{ type: 'go', app: go[1] }]

  const parts = inner.split(':')
  const head = (parts[0] || '').trim().toUpperCase()

  // CLICK shares POINT's argument grammar exactly, read by the same code rather
  // than a copy of it. That is what guarantees a click can never be aimed
  // somewhere a point could not: the two cannot drift, because there is only
  // one place that reads them.
  if (head === 'POINT' || head === 'CLICK') {
    const acting = head === 'CLICK'
    const args = parts.slice(1)
    if (args.length === 0) return null
    // Putting the pointer away has no click equivalent, so `[CLICK:none]` is
    // refused rather than accepted and silently ignored.
    if (/^\s*none\s*$/i.test(args[0])) return acting ? null : [{ type: 'point', anchor: null }]

    // A trailing `screenN` is metadata, not part of the label.
    let screen: number | null = null
    const tail = args[args.length - 1]
    if (args.length > 1 && tail !== undefined) {
      const s = parseScreen(tail)
      if (s !== null) {
        screen = s
        args.pop()
      }
    }
    const anchor = parseAnchor(args[0])
    if (!anchor) return null
    if (screen !== null && anchor.kind === 'point') anchor.screen = screen
    // Rejoin so a label may itself contain colons.
    const label = args.slice(1).join(':').trim()
    const rest = label ? { label } : {}
    return [acting ? { type: 'click', anchor, ...rest } : { type: 'point', anchor, ...rest }]
  }

  if (head === 'DRAW') {
    const kind = (parts[1] || '').trim().toLowerCase() as DrawKind
    if (!DRAW_KINDS.includes(kind)) return null
    const rest = parts.slice(2)
    if (rest.length === 0) return null

    if (kind === 'path') return parsePath(rest)

    if (kind === 'arrow') {
      const [fromRaw, toRaw] = (rest[0] || '').split('>')
      const from = parseAnchor(fromRaw ?? '')
      const to = parseAnchor(toRaw ?? '')
      if (!from || !to) return null
      return [{ type: 'draw', draw: { kind, from, to } }]
    }

    const from = parseAnchor(rest[0])
    if (!from) return null
    const draw: CompanionDraw = { kind, from }
    if (kind === 'label') {
      const text = rest.slice(1).join(':').trim()
      if (!text) return null
      draw.text = text
    }
    return [{ type: 'draw', draw }]
  }

  return null
}

export interface TagStream {
  /** Feed the next chunk; returns everything that became complete. */
  push(chunk: string): CompanionEvent[]
  /** Flush at end of stream. Any unterminated tag degrades to prose. */
  end(): CompanionEvent[]
}

export function createTagStream(): TagStream {
  let pending = ''

  const drain = (final: boolean): CompanionEvent[] => {
    const events: CompanionEvent[] = []
    const text = (s: string) => {
      if (s) events.push({ type: 'text', text: s })
    }

    for (;;) {
      const open = pending.indexOf('[')
      if (open < 0) {
        text(pending)
        pending = ''
        break
      }
      if (open > 0) {
        text(pending.slice(0, open))
        pending = pending.slice(open)
      }

      const close = pending.indexOf(']')
      if (close >= 0) {
        const raw = pending.slice(0, close + 1)
        const parsed = parseTag(raw)
        if (parsed) events.push(...parsed)
        // Ours but unresolvable: drop it. Raw protocol mid-sentence is worse
        // than silently not pointing.
        else if (!isAddressedToUs(raw)) text(raw) // just prose in brackets
        pending = pending.slice(close + 1)
        continue
      }

      // No terminator yet. Hold it back only while it can still become a tag
      // and has not run away; otherwise it was an ordinary bracket.
      if (!final && couldBeTag(pending) && pending.length <= candidateLimit(pending)) break
      text('[')
      pending = pending.slice(1)
    }
    return events
  }

  return {
    push(chunk) {
      if (!chunk) return []
      pending += chunk
      return drain(false)
    },
    end() {
      const events = drain(true)
      pending = ''
      return events
    },
  }
}

/**
 * Fold an event stream into finished steps. Surfaces that render a stepper
 * (rather than reacting live) consume this; the live overlay consumes the
 * events directly. `[STEP]` separates steps; narration and annotations
 * accumulate into the step they appear in.
 *
 * `click` is deliberately not folded in. A click is something that happens once,
 * at the moment it is parsed, on a surface the user has switched acting on. A
 * step is a description that can be rendered and re-rendered, and folding an
 * action into one would make re-rendering a walkthrough press things again.
 */
export function collectSteps(events: CompanionEvent[]): CompanionStep[] {
  const steps: CompanionStep[] = []
  let cur: CompanionStep = { say: '', point: null }
  let touched = false

  const flush = () => {
    cur.say = cur.say.replace(/\s+/g, ' ').trim()
    if (cur.say || cur.point || (cur.draw && cur.draw.length)) steps.push(cur)
    cur = { say: '', point: null }
    touched = false
  }

  for (const ev of events) {
    if (ev.type === 'text') {
      cur.say += ev.text
      touched = true
    } else if (ev.type === 'point') {
      cur.point = ev.anchor
      if (ev.label) cur.label = ev.label
      touched = true
    } else if (ev.type === 'draw') {
      ;(cur.draw ||= []).push(ev.draw)
      touched = true
    } else if (ev.type === 'step') {
      if (touched) flush()
    }
  }
  flush()
  return steps
}

/** Convenience for non-streaming callers: parse a whole reply at once. */
export function parseCompanionReply(text: string): CompanionStep[] {
  const stream = createTagStream()
  return collectSteps([...stream.push(text), ...stream.end()])
}
