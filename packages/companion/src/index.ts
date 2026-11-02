/**
 * @webable/companion, the brain every companion surface shares.
 *
 * Deliberately DOM-free and UI-free so the desktop app (which has no document)
 * imports exactly the same logic as the web widget and the extension.
 */
export * from './types'
export { applyDictionary, type Correction } from './dictionary'
export {
  finishDictation,
  opensSentenceAfter,
  type Snippet,
  type DictateOptions,
} from './dictate'
export {
  createTagStream,
  collectSteps,
  parseCompanionReply,
  parseAnchor,
  parseTag,
  scrubNarration,
  type TagStream,
} from './stream'
export {
  companionSystemPrompt,
  companionUserPrompt,
  companionContinuePrompt,
  AGENT_RULE,
  GO_RULE,
  CLICK_RULE,
  skillRules,
  type AnchorStyle,
  type PromptOptions,
} from './prompt'
export {
  createSseParser,
  readSseStream,
  geminiChunkText,
  type SseEvent,
} from './sse'
