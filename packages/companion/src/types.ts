/**
 * Companion types: the surface-agnostic vocabulary shared by every WebAble
 * companion surface (web widget, browser extension, desktop app).
 *
 * The one thing that differs between surfaces is how a target is ANCHORED:
 *
 *   - On the web we anchor to a numbered DOM element. That beats pixel
 *     guessing: the target survives scroll, resize, reflow, and lazy layout,
 *     and we always know its real box.
 *   - On the desktop there is no DOM, so we anchor to a screen coordinate on a
 *     named display.
 *
 * Everything above the anchor (steps, narration, annotations, voice state) is
 * identical, so one brain drives all three surfaces and a fix in one is a fix
 * in all of them.
 */

/** A display coordinate space. Desktop only; screens are 0-indexed. */
export interface ScreenPoint {
  x: number
  y: number
  /** Which display, when more than one is attached. Defaults to 0. */
  screen?: number
}

/**
 * Where a pointer or annotation attaches.
 * `element` is web (index into the numbered element list, 1-based).
 * `point` is desktop (physical screen coordinate).
 */
export type Anchor =
  | { kind: 'element'; index: number }
  | ({ kind: 'point' } & ScreenPoint)
  /**
   * The target named rather than numbered, e.g. `[POINT:the File menu]`.
   *
   * Models reach for this constantly no matter how firmly the prompt asks for
   * an index, and the old parser rejected it, which meant the tag was dropped
   * and the cursor simply never moved. A name is resolvable: the element list
   * carries the same labels, so this is matched against them and only falls
   * back to nothing when no element matches.
   */
  | { kind: 'named'; name: string }

export type DrawKind = 'circle' | 'box' | 'underline' | 'label' | 'arrow' | 'path'

/** One annotation. `arrow` uses `from` and `to`; everything else uses `from`. */
export interface CompanionDraw {
  kind: DrawKind
  from: Anchor
  /** Arrow destination. */
  to?: Anchor
  /** Label copy; only meaningful for `kind: 'label'`. */
  text?: string
  /**
   * Every vertex of a `path`, in order; absent for every other kind.
   *
   * Each one is a `point` anchor, never an element or a name. A path exists for
   * surfaces that publish no accessibility elements at all (a whiteboard, a
   * design canvas, a video frame), where every other kind has nothing to anchor
   * to, so it is drawn in coordinates and nothing else would be resolvable.
   *
   * `from` is the first vertex as well, so a caller that only wants to know
   * where an annotation sits does not have to special-case the kind.
   */
  points?: Anchor[]
}

/** One step of a walkthrough. */
export interface CompanionStep {
  /** Narration for this step, tags stripped. */
  say: string
  /** Where to send the cursor, or null to hide it. */
  point: Anchor | null
  /** Short human name for the target ("the Save button"). */
  label?: string
  draw?: CompanionDraw[]
}

/* ---- streaming events ------------------------------------------------------ */

/**
 * Emitted as the model streams. A surface reacts immediately: `text` is spoken
 * or rendered, `point` flies the cursor, `draw` sketches. Because these land
 * mid-sentence, the cursor moves while the companion is still talking, which
 * is what makes it feel alive rather than transactional.
 */
export type CompanionEvent =
  | { type: 'text'; text: string }
  | { type: 'point'; anchor: Anchor | null; label?: string }
  /**
   * Press the target rather than point at it. Desktop only, and only ever
   * produced when the person using it has switched acting on: the prompt rule
   * that teaches `[CLICK:]` is withheld otherwise, so a companion that cannot
   * act is never told that it can.
   *
   * The anchor is non-null, unlike `point`'s. `[POINT:none]` puts the pointer
   * away and there is no click equivalent of that, so the tag is refused rather
   * than accepted and quietly dropped.
   */
  | { type: 'click'; anchor: Anchor; label?: string }
  | { type: 'draw'; draw: CompanionDraw }
  | { type: 'step' }
  | { type: 'go'; app: string }

/* ---- voice session --------------------------------------------------------- */

/**
 * The companion's voice loop. `listening` is push-to-talk capture, `thinking`
 * is the model call, `speaking` is TTS playback. A surface renders this
 * directly (mic pulse, thinking shimmer, waveform) and the transitions are the
 * same whether audio came from a browser mic or a desktop hotkey.
 */
export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export interface VoiceState {
  phase: VoicePhase
  /** Live partial transcript while listening, final transcript after. */
  transcript: string
  /** Narration spoken so far in this turn. */
  spoken: string
  error: string | null
}
