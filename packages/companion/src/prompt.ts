/**
 * The companion's system prompt.
 *
 * Deliberately asks for narration with INLINE tags rather than a JSON object.
 * JSON cannot be rendered until its last brace arrives, so a JSON companion is
 * mute until it has finished thinking and then lurches. Inline tags parse
 * incrementally (see stream.ts), so the cursor moves in the middle of the
 * sentence that describes it, which is the whole difference between a tool
 * that answers and a companion that guides.
 *
 * One prompt serves every surface; only the anchor vocabulary changes, because
 * only the anchor differs (numbered DOM elements on the web, accessibility
 * elements or screen coordinates on the desktop).
 */

export type AnchorStyle = 'element' | 'point'

export interface PromptOptions {
  /**
   * `element`: targets are numbered items from a supplied list (web DOM, or a
   * desktop accessibility tree). Preferred wherever a list exists, because an
   * index is exact and a coordinate is a guess.
   * `point`: targets are raw screen coordinates. Desktop fallback only.
   */
  anchors: AnchorStyle
  /** Optional extra house rules appended verbatim. */
  extra?: string
}

const SHARED = [
  'You are WebAble Companion, a warm, plain-spoken guide sitting beside someone using what is in front of them.',
  'You see what they see, talk to them, and point at what to use next.',
  '',
  'How to answer:',
  '- Speak aloud like a patient friend. Short sentences. No markdown, no headings, no bullets, no em dashes.',
  '- Smallest thing that answers them: one step if simple, up to six if involved.',
  '- Never invent a control that is not there. If it is not on screen, say so and say where it usually lives.',
  '- Put each tag mid-sentence where you mention the thing, so the pointer moves as you talk.',
]

const ELEMENT_RULES = [
  '',
  'Point using ONLY numbers from the list you are given:',
  '  [POINT:12] or [POINT:12:the Save button], and [POINT:none] to put it away.',
  'Draw on what they see:',
  '  [DRAW:circle:12] [DRAW:box:12] [DRAW:underline:12]',
  '  [DRAW:label:12:Start here] pins a short label. [DRAW:arrow:12>15] links two items.',
]

const POINT_RULES = [
  '',
  'Point using screen pixels, origin top left:',
  '  [POINT:840,412] or [POINT:840,412:the Save button], [POINT:840,412:Save:screen1]',
  '  for a second display, and [POINT:none] to put it away.',
  'Draw on what they see:',
  '  [DRAW:circle:840,412] [DRAW:box:840,412]',
  '  [DRAW:path:100,200>140,260>200,180] draws a freehand stroke through those',
  '  points. Use it to sketch shapes, arrows or check marks on canvases and',
  '  whiteboards that have nothing to anchor to.',
  '  [DRAW:label:840,412:Start here] pins a label. [DRAW:arrow:840,412>1020,500] links two spots.',
]

/**
 * Desktop-only house rule, passed as `extra` rather than baked into the shared
 * prompt: a page in a browser cannot switch applications, so the web surface
 * must neither be told it can nor carry the text in its bundle.
 *
 * The `@__PURE__` annotation is what makes the second half of that true. Without
 * it esbuild cannot prove `Array.prototype.join` has no side effects, so it
 * keeps the initializer and the whole rule ships to every site that embeds the
 * widget, unreachable but paid for. Measured: annotating this and `CLICK_RULE`
 * took the widget bundle from 64.3 kb to 64.0 kb gzipped, and both strings go
 * from present in `chunk.js` to absent.
 */
export const GO_RULE = /* @__PURE__ */ [
  'If what they need is in another app that is open, take them there with',
  '  [GO:Chrome] and say so, rather than describing a control they cannot see.',
].join('\n')

/**
 * Desktop-only, and passed as `extra` ONLY while the user has switched acting
 * on. Both halves of that matter and for different reasons.
 *
 * Desktop-only, because a page in a browser cannot press another application's
 * controls, so the web surface must neither be told it can nor carry the text
 * in its bundle (the widget gate is tight, and this is dead weight there).
 *
 * Conditional, because a model told it can click when it cannot will narrate
 * actions that never happen: it says "I have opened that for you" while the
 * screen sits unchanged, which is worse than not offering to act at all. The
 * capability and the sentence that describes it have to appear and disappear
 * together.
 *
 * `@__PURE__` for the same reason as `GO_RULE`: it keeps the text out of the
 * widget bundle rather than merely out of the widget's prompt.
 */
export const CLICK_RULE = /* @__PURE__ */ [
  'They have allowed you to press controls for them, not only point at them.',
  '  [CLICK:12] or [CLICK:12:the Save button], same targets as [POINT:].',
  'Rules for pressing, because it happens on their behalf:',
  '- Point at it and say what you are about to press, in the same breath, so',
  '  nothing happens that they did not see coming.',
  '- Press only what they asked you to do. If they asked where something is,',
  '  show them, do not do it for them.',
  '- Never press anything that sends, buys, deletes, or agrees to something.',
  '  Point at it and let them make that press themselves.',
].join('\n')

const CLOSING = [
  '',
  'End every step with [STEP], including the last. One step is one thing to do.',
  'Shape to follow (not the content):',
  '  Open the menu up here [POINT:4:the menu button] and you will see your account.[STEP]Now pick Settings [POINT:9:Settings][DRAW:circle:9].[STEP]',
]

export function companionSystemPrompt(opts: PromptOptions): string {
  const anchorRules = opts.anchors === 'element' ? ELEMENT_RULES : POINT_RULES
  const parts = [...SHARED, ...anchorRules, ...CLOSING]
  if (opts.extra) parts.push('', opts.extra)
  return parts.join('\n')
}

/** Build the user turn: what they asked, plus what is currently in front of them. */
export function companionUserPrompt(input: {
  question: string
  /** The rendered surface description (numbered element list, or a screen note). */
  surface: string
  history?: Array<{ role: string; text: string }>
}): string {
  const history = (input.history || [])
    .slice(-6)
    .map((h) => `${h.role === 'assistant' ? 'you' : 'them'}: ${h.text}`)
    .join('\n')
  return [input.surface, '', history ? `So far:\n${history}\n` : '', `They asked: ${input.question}`]
    .filter(Boolean)
    .join('\n')
}

/**
 * The same prompt, for the second and later steps of a walkthrough.
 *
 * Separate from `companionUserPrompt` rather than a flag on it so the web
 * surface, which only ever asks one question at a time, does not carry this
 * text in its bundle.
 *
 * `done` is what changes the question being asked, from "how do I do this" to
 * "they did that, what now". Without it the model re-reads a screen that has
 * changed underneath it, with no memory of why, and starts the task again from
 * the top: the single most confusing thing a guide can do.
 */
export function companionContinuePrompt(input: {
  goal: string
  surface: string
  done: string[]
  /**
   * The companion is performing the task itself rather than guiding a person
   * through it. The closing instruction flips from "tell them the next step"
   * to "take the next action", because a model in agent mode that keeps saying
   * "now you should click" is narrating work nobody is doing.
   */
  agent?: boolean
}): string {
  const closing = input.agent
    ? [
        'The screen above is what is in front of you now. You are doing this',
        'task yourself: take the ONE next action now with [CLICK:...] or',
        '[GO:app]. Never ask them to do anything, never repeat a done action.',
        'When the goal is complete, say so in one sentence and write [DONE].',
      ]
    : [
        'The screen above is what they see now. Give ONLY the next step, never a',
        'repeat. If the goal is complete, say so in one sentence and write [DONE].',
      ]
  return [
    input.surface,
    '',
    `Their goal: ${input.goal}`,
    'Already done, in order:',
    ...input.done.map((d, i) => `${i + 1}. ${d}`),
    ...closing,
  ].join('\n')
}

/**
 * Desktop-only, appended alongside CLICK_RULE when a run is agentic. Kept out
 * of the shared bundle the same way as the other desktop rules.
 */
export const AGENT_RULE = /* @__PURE__ */ [
  'You are carrying this task out yourself, one action per turn.',
  'Press things with [CLICK:...], switch or open apps with [GO:app name].',
  'Narrate briefly as you act, in first person, like: "Opening Spotify',
  '[GO:Spotify] so I can search for it."',
  'Never invent a control. If the screen does not show what you need, say what',
  'is missing. When the task is done, write [DONE].',
].join('\n')

/**
 * Teach the model the user's saved skills, desktop-only.
 *
 * A skill is a named instruction pack the user wrote once. Two ways in, both of
 * which this rule has to carry: the user *calls* one by name (handled before
 * the model ever runs, in the skill matcher), or the user asks for something a
 * skill happens to cover, which only the model can notice. So each skill is
 * described by name and by when it applies, and the model is told to fold the
 * matching one's instructions into how it answers rather than to mention it.
 *
 * A function, not a constant: the text depends on what the user saved, so
 * there is nothing to hoist and nothing for the widget bundle to carry.
 */
export function skillRules(
  skills: Array<{ phrase: string; instruction: string; when?: string }>,
): string {
  const usable = skills.filter((s) => s.phrase.trim() && s.instruction.trim())
  if (usable.length === 0) return ''
  return [
    'The user has saved skills: named instructions for tasks they do often.',
    'When their request matches what a skill is for, follow that skill\'s',
    'instructions as part of your answer. Do not recite the skill or announce',
    'that you are using it.',
    ...usable.map((s) => {
      const when = s.when?.trim() ? ` Use when: ${s.when.trim()}.` : ''
      return `- "${s.phrase}":${when} Instructions: ${s.instruction.trim()}`
    }),
  ].join('\n')
}
